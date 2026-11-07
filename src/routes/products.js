import { Router } from "express";
import { Product } from "../models/Product.js";
import { asyncHandler, ApiError } from "../utils/asyncHandler.js";
import { validateId } from "../middleware/validate.js";
import { getPaging, pagination, searchFilter } from "../utils/query.js";

const router = Router();

const SORTS = {
  newest: { createdAt: -1 },
  price_asc: { price: 1 },
  price_desc: { price: -1 },
  rating: { rating: -1, reviews: -1 },
};

/** Build the Mongo filter shared by the public and admin product lists. */
export function productFilter(query, { includeInactive = false } = {}) {
  const filter = includeInactive ? {} : { isActive: true };

  const search = searchFilter(query.search, ["title", "brand", "category", "sku"]);
  if (search) Object.assign(filter, search);

  if (query.category && query.category !== "All") filter.category = String(query.category);
  if (query.brand && query.brand !== "All") filter.brand = String(query.brand);

  const min = Number(query.minPrice);
  const max = Number(query.maxPrice);
  if (Number.isFinite(min) || Number.isFinite(max)) {
    filter.price = {};
    if (Number.isFinite(min) && query.minPrice !== undefined && query.minPrice !== "") filter.price.$gte = min;
    if (Number.isFinite(max) && query.maxPrice !== undefined && query.maxPrice !== "") filter.price.$lte = max;
    if (Object.keys(filter.price).length === 0) delete filter.price;
  }

  if (query.inStock === "true") filter.stock = { $gt: 0 };
  return filter;
}

export async function listProducts(query, options) {
  const paging = getPaging(query, { defaultLimit: 24 });
  const filter = productFilter(query, options);
  const sort = SORTS[query.sort] || SORTS.newest;

  const [items, total] = await Promise.all([
    Product.find(filter).sort(sort).skip(paging.skip).limit(paging.limit),
    Product.countDocuments(filter),
  ]);
  return { items, paging, total };
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { items, paging, total } = await listProducts(req.query);
    res.json({ success: true, data: items, pagination: pagination(paging, total) });
  })
);

router.get(
  "/categories",
  asyncHandler(async (_req, res) => {
    const [categories, brands] = await Promise.all([
      Product.distinct("category", { isActive: true }),
      Product.distinct("brand", { isActive: true }),
    ]);
    res.json({
      success: true,
      data: {
        categories: categories.filter(Boolean).sort(),
        brands: brands.filter(Boolean).sort(),
      },
    });
  })
);

router.get(
  "/:id",
  validateId(),
  asyncHandler(async (req, res) => {
    const product = await Product.findOne({ _id: req.params.id, isActive: true });
    if (!product) throw new ApiError(404, "Product not found");
    res.json({ success: true, data: product });
  })
);

export default router;
