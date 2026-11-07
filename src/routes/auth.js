import { Router } from "express";
import { requireAuth, isAdminUser } from "../middleware/auth.js";

const router = Router();

/** The frontend calls this after login to learn whether to show the admin area. */
router.get("/me", requireAuth, (req, res) => {
  const { uid, email, name } = req.user;
  res.json({ success: true, data: { uid, email, name, isAdmin: isAdminUser(req.user) } });
});

export default router;
