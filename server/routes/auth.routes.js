const router = require("express").Router();
const rateLimit = require("express-rate-limit");
const ctrl = require("../controllers/auth.controller");
const { validate } = require("../middleware/validate.middleware");
const { authenticate } = require("../middleware/auth.middleware");
const { registerSchema, loginSchema } = require("../validators/schemas");
const asyncHandler = require("../utils/asyncHandler");

// Brute-force protection on credential endpoints
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 50, standardHeaders: true, legacyHeaders: false });

router.post("/register", authLimiter, validate(registerSchema), asyncHandler(ctrl.register));
router.post("/login", authLimiter, validate(loginSchema), asyncHandler(ctrl.login));
router.get("/me", authenticate, asyncHandler(ctrl.me));

module.exports = router;
