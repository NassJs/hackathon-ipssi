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

router.post("/", async (req, res, next) => {
  try {
    const { email, name } = req.body || {};
    if (!email || !name) {
      return res.status(400).json({ ok: false, error: "MISSING_FIELDS" });
    }

    const created = await User.create({ email, name });
    res.status(201).json({ ok: true, user: created });
  } catch (err) {
    // Duplicate key error
    if (err && err.code === 11000) {
      return res.status(409).json({ ok: false, error: "EMAIL_EXISTS" });
    }
    next(err);
  }
});

module.exports = { router };

