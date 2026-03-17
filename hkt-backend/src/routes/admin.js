const express = require("express");
const path = require("path");
const fs = require("fs/promises");

const { requireAuth } = require("../middleware/requireAuth");
const { requireAdmin } = require("../middleware/requireAdmin");
const { User } = require("../models/User");
const { Document } = require("../models/Document");

const router = express.Router();

router.use(requireAuth);
router.use(requireAdmin);

function parseLimit(value, fallback) {
  const n = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, 200);
}

function parseSkip(value) {
  const n = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function uploadsDir() {
  return path.join(__dirname, "../../uploads");
}

async function safeUnlinkUpload(filePath) {
  try {
    if (!filePath || typeof filePath !== "string") return;
    const filename = path.basename(filePath);
    const fullPath = path.join(uploadsDir(), filename);
    await fs.unlink(fullPath);
  } catch (err) {
    if (err && (err.code === "ENOENT" || err.code === "ENOTDIR")) return;
  }
}

// GET /admin/users
router.get("/users", async (req, res, next) => {
  try {
    const limit = parseLimit(req.query.limit, 50);
    const skip = parseSkip(req.query.skip);

    const users = await User.find({})
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    res.json({ ok: true, users, pagination: { limit, skip } });
  } catch (err) {
    next(err);
  }
});

// POST /admin/users/:id/admin - Promote a user to admin
router.post("/users/:id/admin", async (req, res, next) => {
  try {
    const userId = req.params.id;

    const updated = await User.findByIdAndUpdate(
      userId,
      { $set: { admin: true } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ ok: false, error: "NOT_FOUND" });

    res.json({ ok: true, user: updated.toJSON() });
  } catch (err) {
    next(err);
  }
});

// DELETE /admin/users/:id (cascade: documents + files + user)
router.delete("/users/:id", async (req, res, next) => {
  try {
    const userId = req.params.id;

    const user = await User.findById(userId).lean();
    if (!user) return res.status(404).json({ ok: false, error: "NOT_FOUND" });

    const docs = await Document.find({ User_id: userId }).select("file_path").lean();
    await Promise.all(docs.map((d) => safeUnlinkUpload(d.file_path)));
    await Document.deleteMany({ User_id: userId });
    await User.findByIdAndDelete(userId);

    res.json({ ok: true, message: "USER_DELETED" });
  } catch (err) {
    next(err);
  }
});

// GET /admin/users/:id/documents
router.get("/users/:id/documents", async (req, res, next) => {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId).lean();
    if (!user) return res.status(404).json({ ok: false, error: "NOT_FOUND" });

    const { status, type } = req.query;
    const filter = { User_id: userId };
    if (status) filter.status = status;
    if (type) filter.type = type;

    const limit = parseLimit(req.query.limit, 100);
    const skip = parseSkip(req.query.skip);

    const documents = await Document.find(filter)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    res.json({ ok: true, documents, pagination: { limit, skip } });
  } catch (err) {
    next(err);
  }
});

// DELETE /admin/users/:id/documents/:documentId
router.delete("/users/:id/documents/:documentId", async (req, res, next) => {
  try {
    const userId = req.params.id;
    const documentId = req.params.documentId;

    const doc = await Document.findOne({ _id: documentId, User_id: userId }).lean();
    if (!doc) return res.status(404).json({ ok: false, error: "NOT_FOUND" });

    await safeUnlinkUpload(doc.file_path);
    await Document.deleteOne({ _id: documentId, User_id: userId });

    res.json({ ok: true, message: "DOCUMENT_DELETED" });
  } catch (err) {
    next(err);
  }
});

// GET /admin/stats
router.get("/stats", async (req, res, next) => {
  try {
    const [users_total, documents_total] = await Promise.all([
      User.countDocuments({}),
      Document.countDocuments({})
    ]);

    const documents_per_user_avg =
      users_total === 0 ? 0 : Number((documents_total / users_total).toFixed(2));

    const [documents_by_status, documents_by_type, top_users_by_documents] =
      await Promise.all([
        Document.aggregate([
          { $group: { _id: "$status", count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ]),
        Document.aggregate([
          { $group: { _id: "$type", count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ]),
        Document.aggregate([
          { $group: { _id: "$User_id", documents: { $sum: 1 } } },
          { $sort: { documents: -1 } },
          { $limit: 5 }
        ])
      ]);

    res.json({
      ok: true,
      stats: {
        users_total,
        documents_total,
        documents_per_user_avg,
        documents_by_status: documents_by_status.map((x) => ({
          status: x._id || "unknown",
          count: x.count
        })),
        documents_by_type: documents_by_type.map((x) => ({
          type: x._id || "unknown",
          count: x.count
        })),
        top_users_by_documents: top_users_by_documents.map((x) => ({
          user_id: String(x._id),
          documents: x.documents
        }))
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = { router };

