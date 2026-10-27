const router = require("express").Router();
const ctrl = require("../controllers/model.controller");
const { authenticate } = require("../middleware/auth.middleware");
const { validate } = require("../middleware/validate.middleware");
const { simulateSchema } = require("../validators/schemas");
const asyncHandler = require("../utils/asyncHandler");

// Model Insights is available to every signed-in role (transparency by design).
router.use(authenticate);
router.get("/health", asyncHandler(ctrl.health));
router.get("/info", asyncHandler(ctrl.info));
router.get("/reports/:name", asyncHandler(ctrl.report));
router.post("/simulate", validate(simulateSchema), asyncHandler(ctrl.simulate));

module.exports = router;
