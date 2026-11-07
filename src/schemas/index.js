import { z } from "zod";
import { ORDER_STATUSES, PAYMENT_STATUSES, PAYMENT_METHODS } from "../models/Order.js";
import { SERVICE_STATUSES } from "../models/ServiceRequest.js";
import { COMPLAINT_STATUSES } from "../models/Complaint.js";

const text = (max = 200) => z.string().trim().max(max);
const requiredText = (max = 200) => text(max).min(1, "Required");
const optionalText = (max = 200) => text(max).optional().default("");

// Bangladeshi mobile numbers: 01XXXXXXXXX, with optional +880 / 880 prefix
const phone = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s-]/g, ""))
  .refine((value) => /^(?:\+?88)?01[3-9]\d{8}$/.test(value), "Enter a valid mobile number")
  .transform((value) => value.replace(/^\+?88/, ""));

const optionalEmail = z
  .union([z.string().trim().toLowerCase().email("Invalid email"), z.literal("")])
  .optional()
  .default("");

const url = z.string().trim().max(1000).optional().default("");

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");

export const productInput = z.object({
  title: requiredText(200),
  brand: optionalText(100),
  category: requiredText(100),
  price: z.coerce.number().min(0),
  oldPrice: z.coerce.number().min(0).optional().default(0),
  stock: z.coerce.number().int().min(0),
  sku: text(100).optional(),
  thumbnail: url,
  images: z.array(z.string().trim().max(1000)).max(12).optional().default([]),
  description: optionalText(5000),
  features: z.array(text(300)).max(30).optional().default([]),
  specifications: z.record(text(300)).optional().default({}),
  warranty: optionalText(200),
  delivery: optionalText(200),
  details: optionalText(2000),
  isActive: z.boolean().optional().default(true),
});

export const productUpdate = productInput.partial();

export const orderInput = z.object({
  name: requiredText(100),
  phone,
  email: optionalEmail,
  address: requiredText(500),
  note: optionalText(500),
  items: z
    .array(
      z.object({
        productId: objectId,
        quantity: z.coerce.number().int().min(1).max(20),
      })
    )
    .min(1, "Cart is empty")
    .max(30),
  paymentMethod: z.enum(PAYMENT_METHODS).optional().default("Cash on Delivery"),
  trxID: optionalText(60),
});

export const orderStatusInput = z.object({ status: z.enum(ORDER_STATUSES) });

export const paymentStatusInput = z.object({
  paymentStatus: z.enum(PAYMENT_STATUSES),
  trxID: text(60).optional(),
});

export const serviceInput = z.object({
  name: requiredText(100),
  phone,
  email: optionalEmail,
  address: optionalText(500),
  serviceName: requiredText(150),
  category: optionalText(100),
  message: optionalText(2000),
});

export const serviceUpdateInput = z
  .object({
    status: z.enum(SERVICE_STATUSES),
    price: z.coerce.number().min(0),
    adminNote: text(1000),
  })
  .partial();

export const complaintInput = z.object({
  name: requiredText(100),
  phone,
  email: optionalEmail,
  serviceName: optionalText(150),
  message: requiredText(3000),
});

export const complaintUpdateInput = z
  .object({ status: z.enum(COMPLAINT_STATUSES), adminNote: text(1000) })
  .partial();

export const contactInput = z.object({
  name: requiredText(100),
  email: optionalEmail,
  phone: z.union([phone, z.literal("")]).optional().default(""),
  subject: optionalText(200),
  message: requiredText(3000),
});

export const trackQuery = z.object({
  orderNo: requiredText(60),
  phone,
});
