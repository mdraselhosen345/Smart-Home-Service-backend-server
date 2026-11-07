import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    brand: { type: String, trim: true, default: "" },
    category: { type: String, required: true, trim: true, index: true },
    price: { type: Number, required: true, min: 0 },
    oldPrice: { type: Number, min: 0, default: 0 },
    stock: { type: Number, required: true, min: 0, default: 0 },
    sku: { type: String, trim: true, unique: true, sparse: true },
    thumbnail: { type: String, trim: true, default: "" },
    images: { type: [String], default: [] },
    description: { type: String, trim: true, default: "" },
    features: { type: [String], default: [] },
    specifications: { type: Map, of: String, default: {} },
    warranty: { type: String, trim: true, default: "" },
    delivery: { type: String, trim: true, default: "" },
    details: { type: String, trim: true, default: "" },
    rating: { type: Number, min: 0, max: 5, default: 0 },
    reviews: { type: Number, min: 0, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (_doc, ret) => {
        ret.id = String(ret._id);
        delete ret._id;
        if (ret.specifications instanceof Map) {
          ret.specifications = Object.fromEntries(ret.specifications);
        }
        return ret;
      },
    },
  }
);

productSchema.virtual("discount").get(function discount() {
  if (!this.oldPrice || this.oldPrice <= this.price) return 0;
  return Math.round(((this.oldPrice - this.price) / this.oldPrice) * 100);
});

productSchema.virtual("inStock").get(function inStock() {
  return this.stock > 0;
});

productSchema.index({ title: "text", brand: "text", category: "text" });

export const Product = mongoose.model("Product", productSchema);
