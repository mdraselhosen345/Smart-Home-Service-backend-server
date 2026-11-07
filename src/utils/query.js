/** Small helpers for list endpoints: pagination, safe regex search, enum filters. */

export function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function getPaging(query, { defaultLimit = 20, maxLimit = 100 } = {}) {
  const page = Math.max(1, Math.floor(Number(query.page)) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Math.floor(Number(query.limit)) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

export function pagination({ page, limit }, total) {
  return { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) };
}

/** Case-insensitive "contains" match over several fields. Returns null when q is empty. */
export function searchFilter(q, fields) {
  const text = String(q || "").trim().slice(0, 100);
  if (!text) return null;
  const regex = new RegExp(escapeRegex(text), "i");
  return { $or: fields.map((field) => ({ [field]: regex })) };
}

/** Returns value only if it is one of the allowed values (ignores "All" and junk). */
export function oneOf(value, allowed) {
  return allowed.includes(value) ? value : undefined;
}
