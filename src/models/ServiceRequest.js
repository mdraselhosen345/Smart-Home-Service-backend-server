import mongoose from "mongoose";

export const SERVICE_STATUSES = ["Pending", "Confirmed", "In Progress", "Completed", "Cancelled"];

const serviceRequestSchema = new mongoose.Schema(
  {
    userUid: { type: String, default: null, index: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true, default: "" },
    address: { type: String, trim: true, default: "" },
    serviceName: { type: String, required: true, trim: true },
    category: { type: String, trim: true, default: "" },
    message: { type: String, trim: true, default: "" },

    status: { type: String, enum: SERVICE_STATUSES, default: "Pending", index: true },
    price: { type: Number, min: 0, default: 0 },
    adminNote: { type: String, trim: true, default: "" },
  },
  {
    timestamps: true,
    toJSON: {
      versionKey: false,
      transform: (_doc, ret) => {
        ret.id = String(ret._id);
        delete ret._id;
        return ret;
      },
    },
  }
);

export const ServiceRequest = mongoose.model("ServiceRequest", serviceRequestSchema);
