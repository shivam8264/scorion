const router = require("express").Router();
const ctrl = require("../controllers/applicant.controller");
const { authenticate, authorize } = require("../middleware/auth.middleware");
const { validate } = require("../middleware/validate.middleware");
const { applicantSchema, listQuerySchema, outcomeSchema } = require("../validators/schemas");
const asyncHandler = require("../utils/asyncHandler");

const staff = authorize("loan_officer", "admin");

router.use(authenticate);
router.post("/", validate(applicantSchema), asyncHandler(ctrl.createApplicant));
router.get("/", staff, validate(listQuerySchema, "query"), asyncHandler(ctrl.listApplicants));
router.get("/mine", authorize("applicant"), asyncHandler(ctrl.myApplications));
router.get("/stats", staff, asyncHandler(ctrl.stats));
router.get("/:id", asyncHandler(ctrl.getApplicant));
router.post("/:id/rescore", staff, asyncHandler(ctrl.rescoreApplicant));
router.patch("/:id/outcome", staff, validate(outcomeSchema), asyncHandler(ctrl.recordOutcome));

module.exports = router;
