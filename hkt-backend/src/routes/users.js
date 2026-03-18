const express = require("express");
const { User } = require("../models/User");

const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    const users = await User.find({}).sort({ createdAt: -1 }).limit(50).lean();
    res.json({ ok: true, users });
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, _next) => {
  return res.status(403).json({
    ok: false,
    error: "FORBIDDEN",
    message: "Use POST /auth/register instead"
  });
});

module.exports = { router };

