const router = require("express").Router();
const ctrl = require("../controllers/decision.controller");
const { authenticate, authorize } = require("../middleware/auth.middleware");
const { validate } = require("../middleware/validate.middleware");
const { reviewSchema } = require("../validators/schemas");
const asyncHandler = require("../utils/asyncHandler");

router.use(authenticate);
router.get("/review-queue", authorize("loan_officer", "admin"), asyncHandler(ctrl.reviewQueue));
router.get("/:id", asyncHandler(ctrl.getDecision));
router.patch("/:id/review", authorize("loan_officer", "admin"), validate(reviewSchema), asyncHandler(ctrl.reviewDecision));

module.exports = router;
