import { Router } from "express";
import { Product } from "../../models/Product.js";
import { Order, PAYMENT_STATUSES, PAYMENT_METHODS } from "../../models/Order.js";
import { ServiceRequest } from "../../models/ServiceRequest.js";
import { Complaint } from "../../models/Complaint.js";
import { Contact } from "../../models/Contact.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { getPaging, pagination, searchFilter, oneOf } from "../../utils/query.js";

const router = Router();

const LOW_STOCK_AT = 5;
const TIME_ZONE = "Asia/Dhaka";

const countBy = (rows) => Object.fromEntries(rows.map((row) => [row._id, row.count]));
const dayKey = (date) => new Date(date).toLocaleDateString("en-CA", { timeZone: TIME_ZONE });

router.get(
  "/stats",
  asyncHandler(async (_req, res) => {
    const weekStart = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setTime(weekStart.getTime() - 24 * 60 * 60 * 1000); // one day of slack for the time zone

    const [
      productRows,
      orderStatusRows,
      paymentRows,
      serviceRows,
      openComplaints,
      unreadContacts,
      orderPhones,
      servicePhones,
      recentOrders,
      dailyRows,
    ] = await Promise.all([
      Product.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            active: { $sum: { $cond: ["$isActive", 1, 0] } },
            outOfStock: { $sum: { $cond: [{ $and: ["$isActive", { $lte: ["$stock", 0] }] }, 1, 0] } },
            lowStock: {
              $sum: {
                $cond: [{ $and: ["$isActive", { $gt: ["$stock", 0] }, { $lte: ["$stock", LOW_STOCK_AT] }] }, 1, 0],
              },
            },
          },
        },
      ]),
      Order.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Order.aggregate([
        { $match: { status: { $ne: "Cancelled" } } },
        { $group: { _id: "$paymentStatus", amount: { $sum: "$total" } } },
      ]),
      ServiceRequest.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Complaint.countDocuments({ status: { $ne: "Resolved" } }),
      Contact.countDocuments({ isRead: false }),
      Order.distinct("phone"),
      ServiceRequest.distinct("phone"),
      Order.find().sort({ createdAt: -1 }).limit(5),
      Order.aggregate([
        { $match: { createdAt: { $gte: weekStart }, status: { $ne: "Cancelled" } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: TIME_ZONE } },
            orders: { $sum: 1 },
            sales: { $sum: "$total" },
          },
        },
      ]),
    ]);

    const products = productRows[0] || { total: 0, active: 0, outOfStock: 0, lowStock: 0 };
    delete products._id;

    const orderStatus = countBy(orderStatusRows);
    const paymentAmount = Object.fromEntries(paymentRows.map((row) => [row._id, row.amount]));
    const serviceStatus = countBy(serviceRows);

    const byDay = new Map(dailyRows.map((row) => [row._id, row]));
    const last7Days = [];
    for (let i = 6; i >= 0; i -= 1) {
      const key = dayKey(Date.now() - i * 24 * 60 * 60 * 1000);
      const row = byDay.get(key);
      last7Days.push({ date: key, orders: row?.orders || 0, sales: row?.sales || 0 });
    }

    res.json({
      success: true,
      data: {
        products,
        orders: {
          total: Object.values(orderStatus).reduce((sum, n) => sum + n, 0),
          byStatus: orderStatus,
        },
        revenue: {
          paid: paymentAmount.Paid || 0,
          pending: paymentAmount.Pending || 0,
        },
        services: {
          total: Object.values(serviceStatus).reduce((sum, n) => sum + n, 0),
          byStatus: serviceStatus,
        },
        complaints: { open: openComplaints },
        contacts: { unread: unreadContacts },
        customers: { total: new Set([...orderPhones, ...servicePhones]).size },
        recentOrders,
        last7Days,
      },
    });
  })
);

/**
 * Customers are not a separate login table: they are everyone who ordered or booked a
 * service, grouped by phone number.
 */
router.get(
  "/customers",
  asyncHandler(async (req, res) => {
    const paging = getPaging(req.query);

    const [orderGroups, serviceGroups] = await Promise.all([
      Order.aggregate([
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: "$phone",
            name: { $first: "$name" },
            email: { $first: "$email" },
            address: { $first: "$address" },
            orders: { $sum: 1 },
            totalSpent: { $sum: { $cond: [{ $ne: ["$status", "Cancelled"] }, "$total", 0] } },
            lastOrderAt: { $first: "$createdAt" },
          },
        },
      ]),
      ServiceRequest.aggregate([
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: "$phone",
            name: { $first: "$name" },
            email: { $first: "$email" },
            address: { $first: "$address" },
            serviceRequests: { $sum: 1 },
            lastServiceAt: { $first: "$createdAt" },
          },
        },
      ]),
    ]);

    const byPhone = new Map();
    for (const row of orderGroups) {
      byPhone.set(row._id, {
        phone: row._id,
        name: row.name,
        email: row.email,
        address: row.address,
        orders: row.orders,
        totalSpent: row.totalSpent,
        serviceRequests: 0,
        lastActivity: row.lastOrderAt,
      });
    }
    for (const row of serviceGroups) {
      const existing = byPhone.get(row._id);
      if (existing) {
        existing.serviceRequests = row.serviceRequests;
        existing.email = existing.email || row.email;
        if (row.lastServiceAt > existing.lastActivity) existing.lastActivity = row.lastServiceAt;
      } else {
        byPhone.set(row._id, {
          phone: row._id,
          name: row.name,
          email: row.email,
          address: row.address,
          orders: 0,
          totalSpent: 0,
          serviceRequests: row.serviceRequests,
          lastActivity: row.lastServiceAt,
        });
      }
    }

    let customers = [...byPhone.values()];
    const q = String(req.query.search || "").trim().toLowerCase();
    if (q) {
      customers = customers.filter((c) =>
        [c.name, c.phone, c.email].some((value) => String(value || "").toLowerCase().includes(q))
      );
    }
    customers.sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));

    const total = customers.length;
    res.json({
      success: true,
      data: customers.slice(paging.skip, paging.skip + paging.limit),
      pagination: pagination(paging, total),
    });
  })
);

router.get(
  "/payments",
  asyncHandler(async (req, res) => {
    const paging = getPaging(req.query);
    const filter = {};

    const paymentStatus = oneOf(req.query.paymentStatus, PAYMENT_STATUSES);
    const paymentMethod = oneOf(req.query.paymentMethod, PAYMENT_METHODS);
    if (paymentStatus) filter.paymentStatus = paymentStatus;
    if (paymentMethod) filter.paymentMethod = paymentMethod;
    const search = searchFilter(req.query.search, ["orderNo", "name", "phone", "trxID"]);
    if (search) Object.assign(filter, search);

    const [items, total, summaryRows] = await Promise.all([
      Order.find(filter)
        .select("orderNo name phone total paymentMethod trxID paymentStatus status createdAt")
        .sort({ createdAt: -1 })
        .skip(paging.skip)
        .limit(paging.limit),
      Order.countDocuments(filter),
      Order.aggregate([
        { $match: { status: { $ne: "Cancelled" } } },
        { $group: { _id: "$paymentStatus", count: { $sum: 1 }, amount: { $sum: "$total" } } },
      ]),
    ]);

    const summary = {};
    for (const status of PAYMENT_STATUSES) summary[status] = { count: 0, amount: 0 };
    for (const row of summaryRows) summary[row._id] = { count: row.count, amount: row.amount };

    res.json({ success: true, data: items, summary, pagination: pagination(paging, total) });
  })
);

export default router;
