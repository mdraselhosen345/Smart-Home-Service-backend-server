import mongoose from "mongoose";

export const ORDER_STATUSES = ["Pending", "Confirmed", "Processing", "Delivered", "Cancelled"];
export const PAYMENT_STATUSES = ["Pending", "Paid", "Failed", "Refunded"];
export const PAYMENT_METHODS = ["Cash on Delivery", "bKash", "Nagad", "Rocket"];

const itemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    title: { type: String, required: true },
    thumbnail: { type: String, default: "" },
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNo: { type: String, unique: true, index: true },
    userUid: { type: String, index: true, default: null },

    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true, index: true },
    email: { type: String, trim: true, lowercase: true, default: "" },
    address: { type: String, required: true, trim: true },
    note: { type: String, trim: true, default: "" },

    items: { type: [itemSchema], validate: (value) => value.length > 0 },
    subtotal: { type: Number, required: true, min: 0 },
    deliveryCharge: { type: Number, required: true, min: 0, default: 0 },
    total: { type: Number, required: true, min: 0 },

    paymentMethod: { type: String, enum: PAYMENT_METHODS, default: "Cash on Delivery" },
    trxID: { type: String, trim: true, default: "" },
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: "Pending", index: true },

    status: { type: String, enum: ORDER_STATUSES, default: "Pending", index: true },
    stockRestored: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: {
      versionKey: false,
      transform: (_doc, ret) => {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.stockRestored;
        return ret;
      },
    },
  }
);

orderSchema.pre("validate", function setOrderNo(next) {
  if (!this.orderNo) {
    const stamp = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    this.orderNo = `RB-${stamp}-${rand}`;
  }
  next();
});

export const Order = mongoose.model("Order", orderSchema);
