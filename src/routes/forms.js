import { Router } from "express";
import { ServiceRequest } from "../models/ServiceRequest.js";
import { Complaint } from "../models/Complaint.js";
import { Contact } from "../models/Contact.js";
import { optionalAuth, requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { serviceInput, complaintInput, contactInput } from "../schemas/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { formLimiter } from "../utils/limiters.js";

const router = Router();

router.post(
  "/service-requests",
  formLimiter,
  optionalAuth,
  validate(serviceInput),
  asyncHandler(async (req, res) => {
    const request = await ServiceRequest.create({ ...req.body, userUid: req.user?.uid || null });
    res.status(201).json({ success: true, data: request });
  })
);

router.get(
  "/service-requests/mine",
  requireAuth,
  asyncHandler(async (req, res) => {
    const items = await ServiceRequest.find({ userUid: req.user.uid }).sort({ createdAt: -1 }).limit(100);
    res.json({ success: true, data: items });
  })
);

router.post(
  "/complaints",
  formLimiter,
  optionalAuth,
  validate(complaintInput),
  asyncHandler(async (req, res) => {
    const complaint = await Complaint.create({ ...req.body, userUid: req.user?.uid || null });
    res.status(201).json({ success: true, data: complaint });
  })
);

router.post(
  "/contacts",
  formLimiter,
  validate(contactInput),
  asyncHandler(async (req, res) => {
    const message = await Contact.create(req.body);
    res.status(201).json({ success: true, data: message });
  })
);

export default router;
