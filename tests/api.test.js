import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Configure the environment BEFORE the app modules are imported.
process.env.NODE_ENV = "test";
process.env.CLIENT_ORIGINS = "http://localhost:5173";
process.env.ADMIN_EMAILS = "admin@test.com";
process.env.DELIVERY_CHARGE = "60";

const { MongoMemoryServer } = await import("mongodb-memory-server");
const mongoose = (await import("mongoose")).default;
const { createApp } = await import("../src/app.js");
const { setTokenVerifier } = await import("../src/config/firebase.js");
const { Product } = await import("../src/models/Product.js");

const USERS = {
  admin: { uid: "u-admin", email: "admin@test.com", email_verified: true, name: "Admin" },
  fakeAdmin: { uid: "u-fake", email: "admin@test.com", email_verified: false },
  shopper: { uid: "u-shopper", email: "shopper@test.com", email_verified: true },
};

let mongod;
let server;
let base;

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  setTokenVerifier(async (token) => {
    if (!USERS[token]) throw new Error("bad token");
    return USERS[token];
  });
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server?.close();
  await mongoose.disconnect();
  await mongod?.stop();
});

beforeEach(async () => {
  for (const name of Object.keys(mongoose.connection.collections)) {
    await mongoose.connection.collections[name].deleteMany({});
  }
});

async function api(method, url, { token, body } = {}) {
  const response = await fetch(base + url, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
}

const phone = "01712345678";
const buyer = { name: "Karim", phone, address: "Dhaka, Mirpur 10" };

async function makeProduct(overrides = {}) {
  const { body } = await api("POST", "/api/admin/products", {
    token: "admin",
    body: { title: "Test Router", category: "Networking", price: 1000, stock: 5, ...overrides },
  });
  return body.data;
}

test("health check works", async () => {
  const { status, body } = await api("GET", "/api/health");
  assert.equal(status, 200);
  assert.equal(body.status, "ok");
});

test("admin routes reject guests, normal users and unverified admin emails", async () => {
  assert.equal((await api("GET", "/api/admin/stats")).status, 401);
  assert.equal((await api("GET", "/api/admin/stats", { token: "shopper" })).status, 403);
  assert.equal((await api("GET", "/api/admin/stats", { token: "fakeAdmin" })).status, 403);
  assert.equal((await api("GET", "/api/admin/stats", { token: "admin" })).status, 200);
});

test("/auth/me tells the frontend who is admin", async () => {
  assert.equal((await api("GET", "/api/auth/me")).status, 401);
  assert.equal((await api("GET", "/api/auth/me", { token: "admin" })).body.data.isAdmin, true);
  assert.equal((await api("GET", "/api/auth/me", { token: "shopper" })).body.data.isAdmin, false);
});

test("admin can create, update and delete products; empty SKUs do not collide", async () => {
  const a = await makeProduct({ title: "A", sku: "" });
  const b = await makeProduct({ title: "B", sku: "" });
  assert.ok(a.id && b.id);

  const updated = await api("PATCH", `/api/admin/products/${a.id}`, { token: "admin", body: { price: 1500 } });
  assert.equal(updated.body.data.price, 1500);
  assert.equal(updated.body.data.title, "A");

  assert.equal((await api("PATCH", `/api/admin/products/${a.id}`, { token: "admin", body: { price: -5 } })).status, 400);
  assert.equal((await api("DELETE", `/api/admin/products/${a.id}`, { token: "admin" })).status, 200);
  assert.equal((await api("GET", `/api/products/${a.id}`)).status, 404);
  assert.equal((await api("GET", "/api/products/not-an-id")).status, 400);
});

test("public product list hides inactive products and supports search and filters", async () => {
  await makeProduct({ title: "Dell Laptop", category: "Laptop", price: 60000 });
  await makeProduct({ title: "TP-Link Router", category: "Networking", price: 2000 });
  await makeProduct({ title: "Hidden Thing", isActive: false });

  const all = await api("GET", "/api/products");
  assert.equal(all.body.data.length, 2);

  const search = await api("GET", "/api/products?search=dell");
  assert.equal(search.body.data.length, 1);

  const cheap = await api("GET", "/api/products?maxPrice=5000&sort=price_asc");
  assert.equal(cheap.body.data[0].title, "TP-Link Router");

  const regexAttack = await api("GET", "/api/products?search=.*(");
  assert.equal(regexAttack.status, 200);

  const cats = await api("GET", "/api/products/categories");
  assert.deepEqual(cats.body.data.categories, ["Laptop", "Networking"]);

  const admin = await api("GET", "/api/admin/products", { token: "admin" });
  assert.equal(admin.body.data.length, 3);
});

test("orders use server prices, add delivery charge and take stock", async () => {
  const product = await makeProduct({ price: 1000, stock: 5 });

  const { status, body } = await api("POST", "/api/orders", {
    body: { ...buyer, items: [{ productId: product.id, quantity: 2 }], price: 1, total: 1 },
  });
  assert.equal(status, 201);
  assert.equal(body.data.subtotal, 2000);
  assert.equal(body.data.deliveryCharge, 60);
  assert.equal(body.data.total, 2060);
  assert.match(body.data.orderNo, /^RB-/);

  const after = await api("GET", `/api/admin/products/${product.id}`, { token: "admin" });
  assert.equal(after.body.data.stock, 3);
});

test("orders are refused when stock is short and nothing is taken", async () => {
  const a = await makeProduct({ title: "A", stock: 5 });
  const b = await makeProduct({ title: "B", stock: 1 });

  const { status, body } = await api("POST", "/api/orders", {
    body: { ...buyer, items: [{ productId: a.id, quantity: 2 }, { productId: b.id, quantity: 3 }] },
  });
  assert.equal(status, 409);
  assert.match(body.message, /Not enough stock/);

  const stockA = (await api("GET", `/api/admin/products/${a.id}`, { token: "admin" })).body.data.stock;
  assert.equal(stockA, 5);
});

test("order validation: bad phone, empty cart, inactive product, mobile payment needs TrxID", async () => {
  const product = await makeProduct();
  const item = [{ productId: product.id, quantity: 1 }];

  assert.equal((await api("POST", "/api/orders", { body: { ...buyer, phone: "123", items: item } })).status, 400);
  assert.equal((await api("POST", "/api/orders", { body: { ...buyer, items: [] } })).status, 400);
  assert.equal(
    (await api("POST", "/api/orders", { body: { ...buyer, items: item, paymentMethod: "bKash" } })).status,
    400
  );
  const ok = await api("POST", "/api/orders", {
    body: { ...buyer, items: item, paymentMethod: "bKash", trxID: "9AB12CD34" },
  });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.data.paymentStatus, "Pending");

  await Product.updateOne({ _id: product.id }, { isActive: false });
  assert.equal((await api("POST", "/api/orders", { body: { ...buyer, items: item } })).status, 400);
});

test("cancelling gives stock back once, reopening takes it again", async () => {
  const product = await makeProduct({ stock: 5 });
  const order = (
    await api("POST", "/api/orders", { body: { ...buyer, items: [{ productId: product.id, quantity: 2 }] } })
  ).body.data;
  const stock = async () => (await api("GET", `/api/admin/products/${product.id}`, { token: "admin" })).body.data.stock;
  const setStatus = (status) =>
    api("PATCH", `/api/admin/orders/${order.id}/status`, { token: "admin", body: { status } });

  assert.equal(await stock(), 3);
  assert.equal((await setStatus("Cancelled")).status, 200);
  assert.equal(await stock(), 5);
  assert.equal((await setStatus("Cancelled")).status, 200); // double click
  assert.equal(await stock(), 5);
  assert.equal((await setStatus("Pending")).status, 200);
  assert.equal(await stock(), 3);

  assert.equal((await api("PATCH", `/api/admin/orders/${order.id}/status`, { token: "admin", body: { status: "Nope" } })).status, 400);
});

test("a cancelled order cannot be reopened when the stock is gone", async () => {
  const product = await makeProduct({ stock: 2 });
  const first = (
    await api("POST", "/api/orders", { body: { ...buyer, items: [{ productId: product.id, quantity: 2 }] } })
  ).body.data;
  await api("PATCH", `/api/admin/orders/${first.id}/status`, { token: "admin", body: { status: "Cancelled" } });
  await api("POST", "/api/orders", { body: { ...buyer, items: [{ productId: product.id, quantity: 2 }] } });

  const reopen = await api("PATCH", `/api/admin/orders/${first.id}/status`, { token: "admin", body: { status: "Pending" } });
  assert.equal(reopen.status, 409);
  const check = await api("GET", `/api/admin/orders/${first.id}`, { token: "admin" });
  assert.equal(check.body.data.status, "Cancelled");
});

test("delivered cash-on-delivery orders become paid; payments can be verified by hand", async () => {
  const product = await makeProduct();
  const cod = (await api("POST", "/api/orders", { body: { ...buyer, items: [{ productId: product.id, quantity: 1 }] } })).body.data;
  const delivered = await api("PATCH", `/api/admin/orders/${cod.id}/status`, { token: "admin", body: { status: "Delivered" } });
  assert.equal(delivered.body.data.paymentStatus, "Paid");

  const bkash = (
    await api("POST", "/api/orders", {
      body: { ...buyer, items: [{ productId: product.id, quantity: 1 }], paymentMethod: "bKash", trxID: "TRX12345" },
    })
  ).body.data;
  const paid = await api("PATCH", `/api/admin/orders/${bkash.id}/payment`, { token: "admin", body: { paymentStatus: "Paid" } });
  assert.equal(paid.body.data.paymentStatus, "Paid");

  const payments = await api("GET", "/api/admin/payments", { token: "admin" });
  assert.equal(payments.body.data.length, 2);
  assert.equal(payments.body.summary.Paid.count, 2);
  assert.equal(payments.body.summary.Paid.amount, 2 * 1060);
});

test("deleting an unshipped order restores stock, deleting a delivered one does not", async () => {
  const product = await makeProduct({ stock: 5 });
  const place = async () =>
    (await api("POST", "/api/orders", { body: { ...buyer, items: [{ productId: product.id, quantity: 1 }] } })).body.data;
  const stock = async () => (await api("GET", `/api/admin/products/${product.id}`, { token: "admin" })).body.data.stock;

  const pending = await place();
  assert.equal(await stock(), 4);
  await api("DELETE", `/api/admin/orders/${pending.id}`, { token: "admin" });
  assert.equal(await stock(), 5);

  const delivered = await place();
  await api("PATCH", `/api/admin/orders/${delivered.id}/status`, { token: "admin", body: { status: "Delivered" } });
  await api("DELETE", `/api/admin/orders/${delivered.id}`, { token: "admin" });
  assert.equal(await stock(), 4);
});

test("customers can see their own orders and track by order number plus phone", async () => {
  const product = await makeProduct();
  const order = (
    await api("POST", "/api/orders", {
      token: "shopper",
      body: { ...buyer, items: [{ productId: product.id, quantity: 1 }] },
    })
  ).body.data;

  assert.equal((await api("GET", "/api/orders/mine")).status, 401);
  assert.equal((await api("GET", "/api/orders/mine", { token: "shopper" })).body.data.length, 1);
  assert.equal((await api("GET", "/api/orders/mine", { token: "admin" })).body.data.length, 0);

  const found = await api("GET", `/api/orders/track?orderNo=${order.orderNo}&phone=${phone}`);
  assert.equal(found.status, 200);
  assert.equal((await api("GET", `/api/orders/track?orderNo=${order.orderNo}&phone=01999999999`)).status, 404);
  assert.equal((await api("GET", `/api/orders/track?orderNo=${order.orderNo}`)).status, 400);
});

test("service requests, complaints and contact messages reach the admin inbox", async () => {
  const service = await api("POST", "/api/service-requests", {
    body: { name: "Rahim", phone, serviceName: "PC Home Service", address: "Uttara" },
  });
  assert.equal(service.status, 201);
  const complaint = await api("POST", "/api/complaints", { body: { name: "Rahim", phone, message: "Late technician" } });
  assert.equal(complaint.status, 201);
  const contact = await api("POST", "/api/contacts", { body: { name: "Sara", message: "Do you sell UPS?" } });
  assert.equal(contact.status, 201);

  assert.equal((await api("POST", "/api/contacts", { body: { name: "Sara" } })).status, 400);

  const token = "admin";
  const services = await api("GET", "/api/admin/services", { token });
  assert.equal(services.body.data.length, 1);
  const done = await api("PATCH", `/api/admin/services/${service.body.data.id}`, {
    token,
    body: { status: "Completed", price: 800, adminNote: "Fixed" },
  });
  assert.equal(done.body.data.status, "Completed");
  assert.equal(done.body.data.price, 800);

  const resolved = await api("PATCH", `/api/admin/complaints/${complaint.body.data.id}`, { token, body: { status: "Resolved" } });
  assert.equal(resolved.body.data.status, "Resolved");

  const read = await api("PATCH", `/api/admin/contacts/${contact.body.data.id}`, { token, body: { isRead: true } });
  assert.equal(read.body.data.isRead, true);
  assert.equal((await api("GET", "/api/admin/contacts?unread=true", { token })).body.data.length, 0);

  await api("DELETE", `/api/admin/services/${service.body.data.id}`, { token });
  assert.equal((await api("GET", "/api/admin/services", { token })).body.data.length, 0);
});

test("dashboard stats and customer list add up", async () => {
  const product = await makeProduct({ stock: 10 });
  await makeProduct({ title: "Almost gone", stock: 2 });
  await makeProduct({ title: "Sold out", stock: 0 });

  await api("POST", "/api/orders", { body: { ...buyer, items: [{ productId: product.id, quantity: 1 }] } });
  await api("POST", "/api/service-requests", { body: { name: "Karim", phone, serviceName: "CCTV Setup" } });
  await api("POST", "/api/service-requests", { body: { name: "Other", phone: "01812345678", serviceName: "Glass" } });

  const stats = (await api("GET", "/api/admin/stats", { token: "admin" })).body.data;
  assert.equal(stats.products.total, 3);
  assert.equal(stats.products.lowStock, 1);
  assert.equal(stats.products.outOfStock, 1);
  assert.equal(stats.orders.total, 1);
  assert.equal(stats.orders.byStatus.Pending, 1);
  assert.equal(stats.revenue.pending, 1060);
  assert.equal(stats.services.total, 2);
  assert.equal(stats.customers.total, 2);
  assert.equal(stats.last7Days.length, 7);
  assert.equal(stats.last7Days.at(-1).orders, 1);

  const customers = (await api("GET", "/api/admin/customers", { token: "admin" })).body;
  assert.equal(customers.pagination.total, 2);
  const karim = customers.data.find((c) => c.phone === phone);
  assert.equal(karim.orders, 1);
  assert.equal(karim.serviceRequests, 1);
  assert.equal(karim.totalSpent, 1060);
  assert.equal((await api("GET", "/api/admin/customers?search=other", { token: "admin" })).body.data.length, 1);
});
