const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const { signToken } = require("../middleware/auth.middleware");
const audit = require("../services/auditService");

/** Public self-registration always creates an "applicant"; staff roles are granted by an admin. */
async function register(req, res) {
  const exists = await User.exists({ email: req.body.email });
  if (exists) throw ApiError.conflict("An account with this email already exists");
  const user = await User.create({ ...req.body, role: "applicant" });
  await audit.log({ action: "user_registered", user, ip: req.ip, snapshot: { email: user.email } });
  res.status(201).json({ token: signToken(user), user: user.toSafeJSON() });
}

async function login(req, res) {
  const user = await User.findOne({ email: req.body.email }).select("+password");
  if (!user || !(await user.comparePassword(req.body.password))) {
    throw ApiError.unauthorized("Invalid email or password");
  }
  if (!user.isActive) throw ApiError.forbidden("This account has been disabled");
  user.lastLoginAt = new Date();
  await user.save();
  await audit.log({ action: "user_login", user, ip: req.ip, snapshot: { email: user.email } });
  res.json({ token: signToken(user), user: user.toSafeJSON() });
}

async function me(req, res) {
  res.json({ user: req.user.toSafeJSON() });
}

module.exports = { register, login, me };
