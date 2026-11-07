import { Product } from "../models/Product.js";
import { Order } from "../models/Order.js";

/**
 * Take stock for every item. Each decrement is conditional on enough stock, so two
 * shoppers can never both buy the last unit. If any line fails, the lines that already
 * succeeded are put back. (Single-node safe; no transaction/replica set required.)
 */
export async function reserveStock(items) {
  const reserved = [];
  for (const item of items) {
    const result = await Product.updateOne(
      { _id: item.product, isActive: true, stock: { $gte: item.quantity } },
      { $inc: { stock: -item.quantity } }
    );
    if (result.modifiedCount !== 1) {
      await releaseStock(reserved);
      return { ok: false, failedProduct: item.product };
    }
    reserved.push(item);
  }
  return { ok: true };
}

export async function releaseStock(items) {
  for (const item of items) {
    await Product.updateOne({ _id: item.product }, { $inc: { stock: item.quantity } });
  }
}

/**
 * Put stock back exactly once when an order is cancelled. The flag is flipped atomically,
 * so repeated cancel clicks or concurrent requests cannot add stock twice.
 */
export async function restoreStockOnce(orderId) {
  const order = await Order.findOneAndUpdate(
    { _id: orderId, stockRestored: false },
    { $set: { stockRestored: true } },
    { new: true }
  );
  if (order) await releaseStock(order.items);
  return Boolean(order);
}

/** Re-take stock if a cancelled order is reopened. Returns false if stock is no longer available. */
export async function retakeStockOnce(orderId) {
  const order = await Order.findOneAndUpdate(
    { _id: orderId, stockRestored: true },
    { $set: { stockRestored: false } },
    { new: true }
  );
  if (!order) return true;

  const result = await reserveStock(order.items);
  if (!result.ok) {
    await Order.updateOne({ _id: orderId }, { $set: { stockRestored: true } });
    return false;
  }
  return true;
}
