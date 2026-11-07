import "dotenv/config";

const list = (value) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGODB_URI || "",
  clientOrigins: list(process.env.CLIENT_ORIGINS),
  adminEmails: list(process.env.ADMIN_EMAILS).map((email) => email.toLowerCase()),
  firebaseServiceAccount: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "",
  deliveryCharge: Math.max(0, Number(process.env.DELIVERY_CHARGE) || 0),
  trustProxy: process.env.TRUST_PROXY === "1",
};

export const isProduction = env.nodeEnv === "production";

export function assertEnv() {
  const problems = [];

  if (!env.mongoUri) problems.push("MONGODB_URI is required");

  if (isProduction) {
    if (env.clientOrigins.length === 0) {
      problems.push("CLIENT_ORIGINS is required in production");
    }
    if (env.adminEmails.length === 0) {
      problems.push("ADMIN_EMAILS is required in production");
    }
    if (!env.firebaseServiceAccount && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      problems.push("Firebase Admin credentials are required in production");
    }
  }

  if (problems.length > 0) {
    throw new Error(`Invalid configuration:\n - ${problems.join("\n - ")}`);
  }
}
