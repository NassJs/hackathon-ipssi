const express = require("express");
const { Document } = require("../models/Document");
const { requireAuth } = require("../middleware/requireAuth");
const { upload } = require("../middleware/upload");
const fs = require("node:fs/promises");
const path = require("node:path");

const router = express.Router();

router.use(requireAuth);

function _safeDocType(pred) {
  const t = String(pred || "").toLowerCase();
  if (t === "facture") return "facture";
  if (t === "devis") return "devis";
  if (t === "attestation") return "attestation";
  if (t === "kbis") return "kbis";
  if (t === "rib") return "rib";
  if (t === "bdc") return "bon_commande";
  if (t === "bon_commande") return "bon_commande";
  return "autre";
}

function _parseDateFr(dateStr) {
  if (typeof dateStr !== "string" || !dateStr.trim()) return null;
  const s = dateStr.trim();
  const match = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!match) return null;
  const day = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  let year = Number.parseInt(match[3], 10);
  if (year < 100) year += 2000;
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

async function _callDocumentClassifier({ filePath, filename, docId }) {
  const baseUrl = process.env.DOCUMENT_CLASSIFIER_URL || "http://localhost:8000";
  const url = new URL("/predict_file", baseUrl);
  const buf = await fs.readFile(filePath);

  const form = new FormData();
  form.append("file", new Blob([buf]), filename || "document.png");
  if (docId) form.append("dossier_id", String(docId));

  const res = await fetch(url, { method: "POST", body: form });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const error = body && typeof body === "object" ? body : { error: "UPSTREAM_ERROR" };
    const e = new Error("DOCUMENT_CLASSIFIER_ERROR");
    e.statusCode = 502;
    e.details = error;
    throw e;
  }
  return body;
}

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

    doc.status = "processing";
    await doc.save();

    const filename = String(doc.file_path || "").split("/").filter(Boolean).pop();
    if (!filename) return res.status(400).json({ ok: false, error: "INVALID_FILE_PATH" });
    const absPath = path.join(__dirname, "..", "..", "uploads", filename);

    let analysis;
    try {
      analysis = await _callDocumentClassifier({
        filePath: absPath,
        filename: doc.name,
        docId: doc._id.toString(),
      });
    } catch (e) {
      doc.status = "error";
      await doc.save();
      if (e && e.statusCode) {
        return res.status(e.statusCode).json({ ok: false, error: "ANALYSE_FAILED", details: e.details });
      }
      throw e;
    }

    const extracted = analysis && typeof analysis === "object" ? (analysis.extracted_fields || {}) : {};

    doc.type = _safeDocType(analysis && analysis.document_type);
    doc.classification_confidence = analysis && typeof analysis === "object" ? analysis.classification_confidence : undefined;
    doc.ocr_confidence = analysis && typeof analysis === "object" ? analysis.ocr_confidence : undefined;
    doc.extracted_fields = extracted;
    doc.conformity = analysis && typeof analysis === "object" ? analysis.conformity : {};

    doc.extracted_data = {
      ...doc.extracted_data,
      siret: extracted.siret ? String(extracted.siret) : doc.extracted_data?.siret,
      montant_ht: extracted.amount_ht && extracted.amount_ht.value != null ? Number(extracted.amount_ht.value) : doc.extracted_data?.montant_ht,
      montant_ttc: extracted.amount_ttc && extracted.amount_ttc.value != null ? Number(extracted.amount_ttc.value) : doc.extracted_data?.montant_ttc,
      date_emission: extracted.date_emission ? _parseDateFr(String(extracted.date_emission)) : doc.extracted_data?.date_emission,
      date_expiration: extracted.date_expiration ? _parseDateFr(String(extracted.date_expiration)) : doc.extracted_data?.date_expiration,
    };

    const invalid = doc.conformity && Array.isArray(doc.conformity.invalid_fields) ? doc.conformity.invalid_fields : [];
    const missing = doc.conformity && Array.isArray(doc.conformity.missing_fields) ? doc.conformity.missing_fields : [];
    const dateField = doc.type === "bon_commande" ? "date_signature" : "date_emission";
    const dateOk = !invalid.includes(dateField) && !missing.includes(dateField);
    const siretOk = !invalid.includes("siret") && !missing.includes("siret");
    doc.verification_flags = {
      ...doc.verification_flags,
      sirene_valid: siretOk,
      date_valid: dateOk,
      siret_match: siretOk,
    };

    doc.status = "validated";

    await doc.save();
    res.json({ ok: true, document: doc });
  } catch (err) {
    next(err);
  }
});

module.exports = { router };
