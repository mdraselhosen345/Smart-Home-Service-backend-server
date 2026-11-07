import { Router } from "express";
import { requireAdmin } from "../../middleware/auth.js";
import productRoutes from "./products.js";
import orderRoutes from "./orders.js";
import inboxRoutes from "./inbox.js";
import insightRoutes from "./insights.js";

const router = Router();

// Every /api/admin/* route needs a verified login whose email is in ADMIN_EMAILS.
router.use(requireAdmin);

router.use("/products", productRoutes);
router.use("/orders", orderRoutes);
router.use("/", inboxRoutes);
router.use("/", insightRoutes);

export default router;
