import { Router } from "express";
import { Product } from "../../models/Product.js";
import { validate, validateId } from "../../middleware/validate.js";
import { productInput, productUpdate } from "../../schemas/index.js";
import { asyncHandler, ApiError } from "../../utils/asyncHandler.js";
import { pagination } from "../../utils/query.js";
import { listProducts } from "../products.js";

const router = Router();

/** An empty SKU must not be stored: the unique index would reject a second empty one. */
function splitSku(data) {
  const set = { ...data };
  const unset = {};
  if ("sku" in set && !set.sku) {
    delete set.sku;
    unset.sku = 1;
  }
  return { set, unset };
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { items, paging, total } = await listProducts(req.query, { includeInactive: true });
    res.json({ success: true, data: items, pagination: pagination(paging, total) });
  })
);

router.get(
  "/:id",
  validateId(),
  asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id);
    if (!product) throw new ApiError(404, "Product not found");
    res.json({ success: true, data: product });
  })
);

router.post(
  "/",
  validate(productInput),
  asyncHandler(async (req, res) => {
    const { set } = splitSku(req.body);
    const product = await Product.create(set);
    res.status(201).json({ success: true, data: product });
  })
);

const update = asyncHandler(async (req, res) => {
  if (Object.keys(req.body).length === 0) throw new ApiError(400, "Nothing to update");

  const { set, unset } = splitSku(req.body);
  const change = {};
  if (Object.keys(set).length > 0) change.$set = set;
  if (Object.keys(unset).length > 0) change.$unset = unset;

  const product = await Product.findByIdAndUpdate(req.params.id, change, {
    new: true,
    runValidators: true,
  });
  if (!product) throw new ApiError(404, "Product not found");
  res.json({ success: true, data: product });
});

router.put("/:id", validateId(), validate(productUpdate), update);
router.patch("/:id", validateId(), validate(productUpdate), update);

router.delete(
  "/:id",
  validateId(),
  asyncHandler(async (req, res) => {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) throw new ApiError(404, "Product not found");
    // Past orders keep their own copy of title/price, so deleting a product is safe.
    res.json({ success: true, message: "Product deleted" });
  })
);

export default router;
