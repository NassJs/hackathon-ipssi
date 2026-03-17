const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

router.get("/", (req, res) => {
  res.json({
    ok: true,
    mongo: mongoose.connection.readyState === 1 ? "up" : "down"
  });
});

module.exports = { router };

