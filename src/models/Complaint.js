import mongoose from "mongoose";

export const COMPLAINT_STATUSES = ["Open", "In Review", "Resolved"];

const complaintSchema = new mongoose.Schema(
  {
    userUid: { type: String, default: null },
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true, default: "" },
    serviceName: { type: String, trim: true, default: "" },
    message: { type: String, required: true, trim: true },
    status: { type: String, enum: COMPLAINT_STATUSES, default: "Open", index: true },
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

export const Complaint = mongoose.model("Complaint", complaintSchema);
