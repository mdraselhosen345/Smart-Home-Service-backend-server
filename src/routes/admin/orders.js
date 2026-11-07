import { Router } from "express";
import { Order, ORDER_STATUSES, PAYMENT_STATUSES, PAYMENT_METHODS } from "../../models/Order.js";
import { validate, validateId } from "../../middleware/validate.js";
import { orderStatusInput, paymentStatusInput } from "../../schemas/index.js";
import { asyncHandler, ApiError } from "../../utils/asyncHandler.js";
import { getPaging, pagination, searchFilter, oneOf } from "../../utils/query.js";
import { restoreStockOnce, retakeStockOnce } from "../../utils/orderStock.js";

const router = Router();

// Orders in these states still hold stock that has not left the shop.
const STOCK_HELD = ["Pending", "Confirmed", "Processing"];

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const paging = getPaging(req.query);
    const filter = {};

    const status = oneOf(req.query.status, ORDER_STATUSES);
    const paymentStatus = oneOf(req.query.paymentStatus, PAYMENT_STATUSES);
    const paymentMethod = oneOf(req.query.paymentMethod, PAYMENT_METHODS);
    if (status) filter.status = status;
    if (paymentStatus) filter.paymentStatus = paymentStatus;
    if (paymentMethod) filter.paymentMethod = paymentMethod;

    const search = searchFilter(req.query.search, ["orderNo", "name", "phone", "email", "trxID"]);
    if (search) Object.assign(filter, search);

    const [items, total] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1 }).skip(paging.skip).limit(paging.limit),
      Order.countDocuments(filter),
    ]);
    res.json({ success: true, data: items, pagination: pagination(paging, total) });
  })
);

router.get(
  "/:id",
  validateId(),
  asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id);
    if (!order) throw new ApiError(404, "Order not found");
    res.json({ success: true, data: order });
  })
);

router.patch(
  "/:id/status",
  validateId(),
  validate(orderStatusInput),
  asyncHandler(async (req, res) => {
    const { status } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) throw new ApiError(404, "Order not found");

    const wasCancelled = order.status === "Cancelled";
    const nowCancelled = status === "Cancelled";

    if (wasCancelled && !nowCancelled) {
      // Reopening a cancelled order needs the stock again.
      const ok = await retakeStockOnce(order._id);
      if (!ok) throw new ApiError(409, "Not enough stock to reopen this order");
    }

    const change = { status };
    // Cash on delivery is collected when the parcel is handed over.
    if (status === "Delivered" && order.paymentMethod === "Cash on Delivery" && order.paymentStatus === "Pending") {
      change.paymentStatus = "Paid";
    }
    await Order.updateOne({ _id: order._id }, { $set: change });

    if (!wasCancelled && nowCancelled) await restoreStockOnce(order._id);

    res.json({ success: true, data: await Order.findById(order._id) });
  })
);

router.patch(
  "/:id/payment",
  validateId(),
  validate(paymentStatusInput),
  asyncHandler(async (req, res) => {
    const order = await Order.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
    if (!order) throw new ApiError(404, "Order not found");
    res.json({ success: true, data: order });
  })
);

router.delete(
  "/:id",
  validateId(),
  asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id);
    if (!order) throw new ApiError(404, "Order not found");

    // Deleting an order that never shipped puts its stock back. Delivered orders keep it out.
    if (STOCK_HELD.includes(order.status)) await restoreStockOnce(order._id);

    await Order.deleteOne({ _id: order._id });
    res.json({ success: true, message: "Order deleted" });
  })
);

export default router;
