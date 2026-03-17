const express = require("express");
const { Document } = require("../models/Document");
const { requireAuth } = require("../middleware/requireAuth");
const { upload } = require("../middleware/upload");

const router = express.Router();

router.use(requireAuth);

// POST /documents - Uploader un nouveau document
router.post("/", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: "NO_FILE_PROVIDED" });
    }

    const doc = await Document.create({
      name: req.file.originalname,
      User_id: req.user._id,
      file_path: `/uploads/${req.file.filename}`,
      status: "pending"
    });

    res.status(201).json({ ok: true, document: doc });
  } catch (err) {
    next(err);
  }
});

// GET /documents - Lister les documents de l'utilisateur 
router.get("/", async (req, res, next) => {
  try {
    const { status, type } = req.query;
    const filter = { User_id: req.user._id };

    if (status) filter.status = status;
    if (type) filter.type = type;

    const documents = await Document.find(filter).sort({ created_at: -1 });
    res.json({ ok: true, documents });
  } catch (err) {
    next(err);
  }
});

// 3. GET /documents/:id - Voir les détaild'un document
router.get("/:id", async (req, res, next) => {
  try {
    const doc = await Document.findOne({ _id: req.params.id, User_id: req.user._id });
    if (!doc) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    
    res.json({ ok: true, document: doc });
  } catch (err) {
    next(err);
  }
});

// 4. DELETE /documents/:id - Supprimer
router.delete("/:id", async (req, res, next) => {
  try {
    const doc = await Document.findOneAndDelete({ _id: req.params.id, User_id: req.user._id });
    if (!doc) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    
    res.json({ ok: true, message: "DOCUMENT_DELETED" });
  } catch (err) {
    next(err);
  }
});

// 5. POST /documents/analyse -
router.post("/analyse", async (req, res, next) => {
  try {
    const { document_id } = req.body;
    if (!document_id) return res.status(400).json({ ok: false, error: "MISSING_DOCUMENT_ID" });

    const doc = await Document.findOne({ _id: document_id, User_id: req.user._id });
    if (!doc) return res.status(404).json({ ok: false, error: "NOT_FOUND" });

    
    doc.status = "validated";
    doc.type = "facture";
    doc.extracted_data = {
      siret: "12345678900012",
      tva: "FR123456789",
      montant_ht: 1000,
      montant_ttc: 1200,
      date_emission: new Date("2026-03-01"),
    };
    doc.verification_flags = {
      sirene_valid: true,
      date_valid: true,
      siret_match: true
    };

    await doc.save();
    res.json({ ok: true, document: doc });
  } catch (err) {
    next(err);
  }
});

module.exports = { router };