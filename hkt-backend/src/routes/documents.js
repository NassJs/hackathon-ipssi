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

function _normalizeSiret(value) {
  if (value == null) return null;
  const digits = String(value).replace(/\D/g, "");
  return digits ? digits : null;
}

function _selectDocDate(doc) {
  if (!doc) return null;
  const d = doc.extracted_data || {};
  if (doc.type === "bon_commande") return d.date_signature || d.date_emission || null;
  return d.date_emission || null;
}

function _selectDocAmount(doc) {
  if (!doc) return null;
  const d = doc.extracted_data || {};
  const val = d.montant_ttc != null ? d.montant_ttc : d.montant_ht;
  if (val == null) return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function _toValidDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

function _dateKey(value) {
  const d = _toValidDate(value);
  return d ? d.toISOString().slice(0, 10) : null;
}

function _computeGroupCoherence(documents) {
  const coreTypes = ["devis", "bon_commande", "facture"];
  const byType = new Map();
  for (const doc of documents) {
    if (!doc || !doc.type) continue;
    if (!byType.has(doc.type)) byType.set(doc.type, []);
    byType.get(doc.type).push(doc);
  }

  const missing_types = coreTypes.filter((t) => !byType.has(t));

  const sirets = documents
    .map((d) => _normalizeSiret(d.extracted_data && d.extracted_data.siret))
    .filter(Boolean);
  const unique_sirets = [...new Set(sirets)];

  const errors = [];
  const warnings = [];

  if (unique_sirets.length > 1) {
    errors.push({ code: "SIRET_MISMATCH", message: `SIRET incohérents: ${unique_sirets.join(" ≠ ")}` });
  } else if (unique_sirets.length === 0) {
    warnings.push({ code: "SIRET_MISSING", message: "SIRET manquant sur les documents du dossier" });
  }

  const devisDate = byType.has("devis") ? _selectDocDate(byType.get("devis")[0]) : null;
  const bdcDate = byType.has("bon_commande") ? _selectDocDate(byType.get("bon_commande")[0]) : null;
  const factureDate = byType.has("facture") ? _selectDocDate(byType.get("facture")[0]) : null;

  const devisKey = _dateKey(devisDate);
  const factureKey = _dateKey(factureDate);
  const bdcKey = _dateKey(bdcDate);

  if (byType.has("devis") && byType.has("facture")) {
    if (devisKey && factureKey) {
      if (devisKey !== factureKey) {
        errors.push({
          code: "DATE_MISMATCH",
          message: `Dates incohérentes: devis=${devisKey} ≠ facture=${factureKey}`,
        });
      }
    } else {
      warnings.push({ code: "DATE_MISSING", message: "Dates manquantes pour vérifier l'égalité devis ↔ facture" });
    }
  }

  if (byType.has("bon_commande") && (byType.has("devis") || byType.has("facture"))) {
    if (!bdcKey) {
      warnings.push({ code: "DATE_MISSING", message: "Date du bon de commande manquante pour vérifier qu'il est postérieur" });
    } else {
      const refDates = [_toValidDate(devisDate), _toValidDate(factureDate)].filter(Boolean);
      if (refDates.length === 0) {
        warnings.push({ code: "DATE_MISSING", message: "Dates devis/facture manquantes pour vérifier l'ordre avec le bon de commande" });
      } else {
        const refMax = new Date(Math.max(...refDates.map((d) => d.getTime())));
        const bdcD = _toValidDate(bdcDate);
        if (bdcD && bdcD.getTime() <= refMax.getTime()) {
          const refKey = _dateKey(refMax);
          errors.push({
            code: "DATE_ORDER",
            message: `Bon de commande doit être émis après devis/facture (bdc=${bdcKey}, ref=${refKey})`,
          });
        }
      }
    }
  }

  const amounts = documents
    .map((d) => _selectDocAmount(d))
    .filter((n) => typeof n === "number");
  const unique_amounts = [...new Set(amounts.map((n) => Number(n.toFixed(2))))];
  if (unique_amounts.length > 1) {
    errors.push({ code: "AMOUNT_MISMATCH", message: `Montants incohérents: ${unique_amounts.join(" ≠ ")} €` });
  } else if (unique_amounts.length === 0) {
    warnings.push({ code: "AMOUNT_MISSING", message: "Montants manquants sur les documents du dossier" });
  }

  if (missing_types.length > 0) {
    warnings.push({
      code: "MISSING_DOCS",
      message: `Documents manquants dans le dossier: ${missing_types.join(", ")}`,
    });
  }

  const status = errors.length > 0 ? "non_conforme" : warnings.length > 0 ? "a_verifier" : "conforme";

  return {
    status,
    errors,
    warnings,
    checks: {
      missing_types,
      siret: { unique: unique_sirets, ok: unique_sirets.length === 1 },
      dates: {
        devis: devisKey,
        bon_commande: bdcKey,
        facture: factureKey,
      },
      amount: { unique: unique_amounts, ok: unique_amounts.length === 1 },
    },
  };
}

async function _callDocumentClassifier({ filePath, filename, dossierId }) {
  const baseUrl = process.env.DOCUMENT_CLASSIFIER_URL || "http://localhost:8000";
  const url = new URL("/predict_file", baseUrl);
  const buf = await fs.readFile(filePath);

  const form = new FormData();
  form.append("file", new Blob([buf]), filename || "document.png");
  if (dossierId) form.append("dossier_id", String(dossierId));

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

    const dossier_id_raw = req.body && (req.body.dossier_id || req.body.group_id);
    const dossier_id =
      typeof dossier_id_raw === "string" && dossier_id_raw.trim()
        ? dossier_id_raw.trim()
        : undefined;

    const doc = await Document.create({
      name: req.file.originalname,
      User_id: req.user._id,
      file_path: `/uploads/${req.file.filename}`,
      status: "pending",
      ...(dossier_id ? { dossier_id } : {})
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

router.get("/coherence", async (req, res, next) => {
  try {
    const dossier_id_raw = req.query && req.query.dossier_id;
    const dossier_id =
      typeof dossier_id_raw === "string" && dossier_id_raw.trim()
        ? dossier_id_raw.trim()
        : null;

    const filter = {
      User_id: req.user._id,
      status: "validated",
      dossier_id: { $exists: true, $ne: null }
    };
    if (dossier_id) filter.dossier_id = dossier_id;

    const docs = await Document.find(filter).sort({ created_at: -1 }).lean();

    const byDossier = new Map();
    for (const doc of docs) {
      const id = doc.dossier_id;
      if (!id) continue;
      if (!byDossier.has(id)) byDossier.set(id, []);
      byDossier.get(id).push(doc);
    }

    const groups = [];
    for (const [id, groupDocs] of byDossier.entries()) {
      const coherence = _computeGroupCoherence(groupDocs);
      const latest = groupDocs.reduce((acc, d) => {
        const t = d && d.created_at ? new Date(d.created_at).getTime() : 0;
        if (!acc || t > acc.t) return { t, doc: d };
        return acc;
      }, null);

      groups.push({
        dossier_id: id,
        status: coherence.status,
        errors: coherence.errors,
        warnings: coherence.warnings,
        checks: coherence.checks,
        documents: groupDocs.map((d) => ({
          id: d._id,
          name: d.name,
          type: d.type,
          created_at: d.created_at,
          extracted_data: d.extracted_data,
        })),
        updated_at: latest && latest.doc ? latest.doc.updated_at || latest.doc.created_at : null
      });
    }

    groups.sort((a, b) => {
      const ta = a && a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const tb = b && b.updated_at ? new Date(b.updated_at).getTime() : 0;
      return tb - ta;
    });

    res.json({ ok: true, groups });
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
        dossierId: (doc.dossier_id || doc._id).toString(),
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
      date_signature: extracted.date_signature ? _parseDateFr(String(extracted.date_signature)) : doc.extracted_data?.date_signature,
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
    };

    doc.status = "validated";

    await doc.save();

    if (doc.dossier_id) {
      const docsInDossier = await Document.find({
        User_id: req.user._id,
        dossier_id: doc.dossier_id,
        status: "validated"
      })
        .select("extracted_data.siret")
        .lean();

      const dossierSirets = docsInDossier.map((d) => _normalizeSiret(d.extracted_data && d.extracted_data.siret)).filter(Boolean);
      const unique = [...new Set(dossierSirets)];
      const siret_match = unique.length <= 1 && dossierSirets.length > 0;

      await Document.updateMany(
        { User_id: req.user._id, dossier_id: doc.dossier_id, status: "validated" },
        { $set: { "verification_flags.siret_match": siret_match } }
      );
    }

    res.json({ ok: true, document: doc });
  } catch (err) {
    next(err);
  }
});

module.exports = { router };
