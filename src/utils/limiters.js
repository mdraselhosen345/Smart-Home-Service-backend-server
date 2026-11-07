import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";

/** Stricter limit for public forms that anyone can submit (orders, contact, complaints). */
export const formLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: () => env.nodeEnv === "test",
  message: { success: false, message: "Too many submissions, please try again later" },
});
