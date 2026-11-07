/**
 * Load the starter products from the frontend's public/shope.json into MongoDB.
 *
 *   npm run seed            only inserts when there are no products yet
 *   npm run seed -- --reset deletes ALL products first, then inserts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env, assertEnv } from "../config/env.js";
import { connectDB, disconnectDB } from "../config/db.js";
import { Product } from "../models/Product.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(here, "../../../public/shope.json");

async function main() {
  assertEnv();
  if (!fs.existsSync(source)) throw new Error(`Cannot find ${source}`);
  const raw = JSON.parse(fs.readFileSync(source, "utf8"));

  await connectDB(env.mongoUri);

  if (process.argv.includes("--reset")) {
    const { deletedCount } = await Product.deleteMany({});
    console.log(`Removed ${deletedCount} existing products`);
  } else if ((await Product.estimatedDocumentCount()) > 0) {
    console.log("Products already exist, nothing to do. Use --reset to replace them.");
    return;
  }

  const products = raw.map((item) => ({
    title: item.title,
    brand: item.brand || "",
    category: item.category,
    price: item.price,
    oldPrice: item.oldPrice || 0,
    stock: item.stock ?? 0,
    sku: item.sku || undefined,
    thumbnail: item.thumbnail || "",
    images: item.images || [],
    description: item.description || "",
    features: item.features || [],
    specifications: item.specifications || {},
    warranty: item.warranty || "",
    delivery: item.delivery || "",
    details: item.details || "",
    rating: item.rating || 0,
    reviews: item.reviews || 0,
  }));

  await Product.insertMany(products);
  console.log(`Inserted ${products.length} products`);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());
