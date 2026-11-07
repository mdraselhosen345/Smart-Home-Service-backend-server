// import { env } from "../config/env.js";
// import { verifyFirebaseToken } from "../config/firebase.js";
// import { ApiError } from "../utils/asyncHandler.js";

// function readBearer(req) {
//   const header = req.headers.authorization || "";
//   const [scheme, token] = header.split(" ");
//   return scheme === "Bearer" && token ? token : null;
// }

// async function decode(token) {
//   try {
//     return await verifyFirebaseToken(token);
//   } catch (error) {
//     if (error.code === "AUTH_NOT_CONFIGURED") {
//       throw new ApiError(503, error.message);
//     }
//     throw new ApiError(401, "Invalid or expired login token");
//   }
// }

// function toUser(decoded) {
//   return {
//     uid: decoded.uid,
//     email: (decoded.email || "").toLowerCase(),
//     emailVerified: decoded.email_verified === true,
//     name: decoded.name || "",
//   };
// }

// /** Attaches req.user when a valid token is sent. Guests are allowed through. */
// export async function optionalAuth(req, _res, next) {
//   try {
//     const token = readBearer(req);
//     if (token) req.user = toUser(await decode(token));
//     next();
//   } catch (error) {
//     // A bad token on a public route should not block a guest order.
//     if (error.status === 401) return next();
//     next(error);
//   }
// }

// export async function requireAuth(req, _res, next) {
//   try {
//     const token = readBearer(req);
//     if (!token) throw new ApiError(401, "Please log in first");
//     req.user = toUser(await decode(token));
//     next();
//   } catch (error) {
//     next(error);
//   }
// }

// /**
//  * Only accounts listed in ADMIN_EMAILS can pass. The email must be verified by Firebase,
//  * otherwise anyone could register the admin address with a password and no verification.
//  */
// export function isAdminUser(user) {
//   return Boolean(user && user.emailVerified && env.adminEmails.includes(user.email));
// }

// export async function requireAdmin(req, res, next) {
//   await requireAuth(req, res, (error) => {
//     if (error) return next(error);
//     if (!isAdminUser(req.user)) return next(new ApiError(403, "Admin access only"));
//     next();
//   });
// }








import { env } from "../config/env.js";
import { verifyFirebaseToken } from "../config/firebase.js";
import { ApiError } from "../utils/asyncHandler.js";

function readBearer(req) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  return scheme === "Bearer" && token ? token : null;
}

async function decode(token) {
  try {
    return await verifyFirebaseToken(token);
  } catch (error) {
    console.error("Firebase verify failed:", error.code, error.message);
    if (error.code === "AUTH_NOT_CONFIGURED") {
      throw new ApiError(503, error.message);
    }
    throw new ApiError(401, "Invalid or expired login token");
  }
}

function toUser(decoded) {
  return {
    uid: decoded.uid,
    email: (decoded.email || "").toLowerCase(),
    emailVerified: decoded.email_verified === true,
    name: decoded.name || "",
  };
}

/** Attaches req.user when a valid token is sent. Guests are allowed through. */
export async function optionalAuth(req, _res, next) {
  try {
    const token = readBearer(req);
    if (token) req.user = toUser(await decode(token));
    next();
  } catch (error) {
    // A bad token on a public route should not block a guest order.
    if (error.status === 401) return next();
    next(error);
  }
}

export async function requireAuth(req, _res, next) {
  try {
    const token = readBearer(req);
    if (!token) throw new ApiError(401, "Please log in first");
    req.user = toUser(await decode(token));
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Only accounts listed in ADMIN_EMAILS can pass. The email must be verified by Firebase,
 * otherwise anyone could register the admin address with a password and no verification.
 */
export function isAdminUser(user) {
  return Boolean(user && user.emailVerified && env.adminEmails.includes(user.email));
}

export async function requireAdmin(req, res, next) {
  await requireAuth(req, res, (error) => {
    if (error) return next(error);
    if (!isAdminUser(req.user)) return next(new ApiError(403, "Admin access only"));
    next();
  });
}