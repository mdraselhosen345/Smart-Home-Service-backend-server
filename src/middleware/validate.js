import { objectId } from "../schemas/index.js";

/** Validate and replace req.body with the parsed (trimmed, coerced) result. */
export const validate = (schema) => (req, _res, next) => {
  try {
    req.body = schema.parse(req.body);
    next();
  } catch (error) {
    next(error);
  }
};

/** Reject malformed ids before they reach Mongo. */
export const validateId = (param = "id") => (req, _res, next) => {
  const result = objectId.safeParse(req.params[param]);
  if (!result.success) {
    const error = new Error("Invalid id");
    error.status = 400;
    return next(error);
  }
  next();
};
