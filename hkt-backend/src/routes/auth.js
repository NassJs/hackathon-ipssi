const express = require("express");
const { User } = require("../models/User");
const { signAccessToken } = require("../auth/jwt");
const { requireAuth } = require("../middleware/requireAuth");

const router = express.Router();

router.post("/register", async (req, res, next) => {
  try {
    const { first_name, last_name, email, password } = req.body || {};
    if (!first_name || !last_name || !email || !password) {
      return res.status(400).json({ ok: false, error: "MISSING_FIELDS" });
    }

    const password_hash = await User.hashPassword(password);
    const created = await User.create({
      first_name,
      last_name,
      email,
      password_hash,
      admin: false
    });

    const access_token = signAccessToken(created);
    res.status(201).json({ ok: true, user: created.toJSON(), access_token });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ ok: false, error: "EMAIL_EXISTS" });
    }
    next(err);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ ok: false, error: "MISSING_FIELDS" });
    }

    const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select(
      "+password_hash"
    );
    if (!user) {
      return res.status(401).json({ ok: false, error: "INVALID_CREDENTIALS" });
    }

    const ok = await user.verifyPassword(password);
    if (!ok) {
      return res.status(401).json({ ok: false, error: "INVALID_CREDENTIALS" });
    }

    const access_token = signAccessToken(user);
    res.json({ ok: true, user: user.toJSON(), access_token });
  } catch (err) {
    next(err);
  }
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ ok: true, user: req.user.toJSON() });
});

router.post("/logout", (req, res) => {
  res.json({ ok: true });
});

module.exports = { router };

