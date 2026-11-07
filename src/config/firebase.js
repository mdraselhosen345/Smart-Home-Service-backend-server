import admin from "firebase-admin";
import { env } from "./env.js";

let verifier = null;

function parseServiceAccount(raw) {
  const text = raw.trim().startsWith("{")
    ? raw
    : Buffer.from(raw, "base64").toString("utf8");
  return JSON.parse(text);
}

function buildVerifier() {
  if (admin.apps.length === 0) {
    if (env.firebaseServiceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(parseServiceAccount(env.firebaseServiceAccount)),
      });
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      admin.initializeApp({ credential: admin.credential.applicationDefault() });
    } else {
      return null;
    }
  }
  return (token) => admin.auth().verifyIdToken(token);
}

/**
 * Verify a Firebase ID token. Returns the decoded token, or throws.
 * Throws an error with code "AUTH_NOT_CONFIGURED" when the server has no Firebase credentials.
 */
export async function verifyFirebaseToken(token) {
  if (!verifier) verifier = buildVerifier();
  if (!verifier) {
    const error = new Error("Authentication is not configured on the server");
    error.code = "AUTH_NOT_CONFIGURED";
    throw error;
  }
  return verifier(token);
}

/** Tests can replace the verifier with a fake one. */
export function setTokenVerifier(fn) {
  verifier = fn;
}
