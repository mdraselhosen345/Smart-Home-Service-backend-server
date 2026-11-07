import { Router } from "express";
import { Order } from "../models/Order.js";
import { Product } from "../models/Product.js";
import { env } from "../config/env.js";
import { optionalAuth, requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { orderInput, trackQuery } from "../schemas/index.js";
import { asyncHandler, ApiError } from "../utils/asyncHandler.js";
import { reserveStock, releaseStock } from "../utils/orderStock.js";
import { formLimiter } from "../utils/limiters.js";

const router = Router();

/**
 * Place an order. Prices always come from the database, never from the browser, so a
 * customer cannot change what they pay by editing the request.
 */
router.post(
  "/",
  formLimiter,
  optionalAuth,
  validate(orderInput),
  asyncHandler(async (req, res) => {
    const { items: requested, paymentMethod, trxID, ...contact } = req.body;

    if (paymentMethod !== "Cash on Delivery" && !trxID) {
      throw new ApiError(400, "Transaction ID is required for bKash, Nagad or Rocket payment");
    }

    // The same product listed twice becomes one line.
    const wanted = new Map();
    for (const item of requested) {
      wanted.set(item.productId, (wanted.get(item.productId) || 0) + item.quantity);
    }

    const products = await Product.find({ _id: { $in: [...wanted.keys()] }, isActive: true });
    if (products.length !== wanted.size) {
      throw new ApiError(400, "One or more products are no longer available");
    }

    const lines = products.map((product) => ({
      product: product._id,
      title: product.title,
      thumbnail: product.thumbnail,
      price: product.price,
      quantity: wanted.get(String(product._id)),
    }));

    const reservation = await reserveStock(lines);
    if (!reservation.ok) {
      const failed = lines.find((line) => String(line.product) === String(reservation.failedProduct));
      throw new ApiError(409, `Not enough stock for "${failed?.title || "a product"}"`);
    }

    const subtotal = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
    const deliveryCharge = env.deliveryCharge;

    try {
      const order = await Order.create({
        ...contact,
        userUid: req.user?.uid || null,
        items: lines,
        subtotal,
        deliveryCharge,
        total: subtotal + deliveryCharge,
        paymentMethod,
        trxID: paymentMethod === "Cash on Delivery" ? "" : trxID,
      });
      res.status(201).json({ success: true, data: order });
    } catch (error) {
      await releaseStock(lines);
      throw error;
    }
  })
);

router.get(
  "/mine",
  requireAuth,
  asyncHandler(async (req, res) => {
    const orders = await Order.find({ userUid: req.user.uid }).sort({ createdAt: -1 }).limit(100);
    res.json({ success: true, data: orders });
  })
);

/** Guest tracking: needs both the order number and the phone used on the order. */
router.get(
  "/track",
  formLimiter,
  asyncHandler(async (req, res) => {
    const { orderNo, phone } = trackQuery.parse(req.query);
    const order = await Order.findOne({ orderNo: orderNo.toUpperCase(), phone });
    if (!order) throw new ApiError(404, "No order found with that number and phone");
    res.json({ success: true, data: order });
  })
);

export default router;
