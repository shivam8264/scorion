const ApiError = require("../utils/ApiError");

/**
 * Validates req[source] with a Zod schema and replaces it with the parsed
 * (coerced + stripped) value, so controllers only ever see clean data.
 */
const validate =
  (schema, source = "body") =>
  (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        field: i.path.join("."),
        message: i.message,
      }));
      return next(ApiError.badRequest("Validation failed", details));
    }
    if (source === "query") {
      // Express 5 exposes req.query as a getter - store parsed values separately.
      req.validatedQuery = result.data;
    } else {
      req[source] = result.data;
    }
    next();
  };

module.exports = { validate };
