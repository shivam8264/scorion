const router = require("express").Router();
const ctrl = require("../controllers/admin.controller");
const { authenticate, authorize } = require("../middleware/auth.middleware");
const { validate } = require("../middleware/validate.middleware");
const { roleSchema, statusSchema } = require("../validators/schemas");
const asyncHandler = require("../utils/asyncHandler");

router.use(authenticate, authorize("admin"));
router.get("/fairness-report", asyncHandler(ctrl.fairnessReport));
router.post("/fairness-audit/run", asyncHandler(ctrl.runAudit));
router.get("/audit-logs", asyncHandler(ctrl.auditLogs));
router.get("/audit-logs/verify", asyncHandler(ctrl.verifyAuditChain));
router.get("/users", asyncHandler(ctrl.listUsers));
router.patch("/users/:id/role", validate(roleSchema), asyncHandler(ctrl.updateRole));
router.patch("/users/:id/status", validate(statusSchema), asyncHandler(ctrl.updateStatus));

module.exports = router;
