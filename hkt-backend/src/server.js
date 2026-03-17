const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const dotenv = require("dotenv");

dotenv.config();

const { router: healthRouter } = require("./routes/health");
const { router: usersRouter } = require("./routes/users");
const { router: authRouter } = require("./routes/auth");
const path = require("path");
const { router: documentsRouter } = require("./routes/documents");

const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

app.get("/", (req, res) => {
  res.json({ name: "hkt-backend", ok: true });
});

app.use("/health", healthRouter);
app.use("/auth", authRouter);
app.use("/users", usersRouter);
app.use("/documents", documentsRouter);

app.use((err, req, res, next) => {
  console.error("[api] error:", err);
  res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
});

app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

app.use((err, req, res, next) => {
  console.error("[api] error:", err);
  res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
});

module.exports = app;

