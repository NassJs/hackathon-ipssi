import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional
from unicodedata import category, normalize


def _spaced_letter_pattern(word: str) -> str:
    # Construit un motif regex qui match un mot même si l'OCR a inséré des espaces
    # entre les lettres, ex: "F A C T U R E".
    letters = [re.escape(ch) for ch in word]
    return r"(?<!\w)" + r"\s*".join(letters) + r"(?!\w)"


def _strip_doc_type_markers(text: str) -> str:
    # Supprime les tokens de type document ("facture", "devis", "bdc", "bon de commande")
    # pour éviter que le modèle ne se base uniquement sur ces marqueurs (optionnel).
    patterns = [
        _spaced_letter_pattern("facture"),
        _spaced_letter_pattern("devis"),
        _spaced_letter_pattern("bdc"),
        r"(?<!\w)bon\s+de\s+commande(?!\w)",
        r"(?<!\w)bondecommande(?!\w)",
        _spaced_letter_pattern("bon")
        + r"\s+"
        + _spaced_letter_pattern("de")
        + r"\s+"
        + _spaced_letter_pattern("commande"),
    ]
    for p in patterns:
        text = re.sub(p, " ", text, flags=re.IGNORECASE)
    return text


def clean_text_with_options(
    text: str,
    strip_doc_type_tokens: bool = False,
    deshortcut_mode: str = "none",
) -> str:
    # Nettoyage OCR "stable" (mêmes transformations que celles utilisées autour du modèle):
    # - normalisation Unicode
    # - lower/strip
    # - réduction des espaces et suppression des caractères trop bruités
    #
    # Le nettoyage doit être identique entre entraînement et inférence.
    if text is None:
        return ""
    if not isinstance(text, str):
        text = str(text)
    text = text.strip().lower()
    text = normalize("NFKC", text)
    if deshortcut_mode == "basic":
        # Mode "basic": enlève explicitement les marqueurs de type document.
        text = _strip_doc_type_markers(text)
    elif strip_doc_type_tokens:
        # Alternative: l'appelant peut demander la suppression des tokens.
        text = _strip_doc_type_markers(text)
    # Remplace retours/changements de ligne par espaces.
    text = re.sub(r"[\r\n\t]+", " ", text)
    # Normalise les espaces.
    text = re.sub(r"\s+", " ", text)
    # Retire la ponctuation/bruit, tout en gardant lettres/chiffres/underscore, espaces et quelques symboles utiles.
    text = re.sub(r"[^\w\s€%]", " ", text, flags=re.UNICODE)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _default_pipeline_path() -> str:
    # Chemin par défaut du pipeline (TF-IDF + modèle) attendu dans le repo.
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(here, "artifacts", "text_pipeline_linear_svc.joblib")


def _strip_accents(text: str) -> str:
    # Retire les accents pour faciliter les regex sur des libellés ("émission" vs "emission").
    text = normalize("NFKD", text)
    return "".join(ch for ch in text if category(ch) != "Mn")


def _normalize_for_extraction(text: str) -> str:
    # Normalisation "soft" pour extraction:
    # - unicode stable + suppression accents
    # - upper
    # - espaces normalisés
    text = "" if text is None else str(text)
    text = normalize("NFKC", text)
    text = _strip_accents(text)
    text = text.upper()
    text = re.sub(r"[\r\n\t]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _first_match(pattern: str, text: str, group: int = 1) -> Optional[str]:
    m = re.search(pattern, text, flags=re.IGNORECASE)
    if not m:
        return None
    try:
        return m.group(group)
    except Exception:
        return None


def _parse_amount_value(amount_str: str) -> Optional[float]:
    if not amount_str:
        return None
    s = str(amount_str).strip()
    s = s.replace("\u00A0", " ").replace(" ", "")
    s = s.replace("€", "").replace("EUR", "")
    sign = ""
    if s.startswith("-"):
        sign = "-"
        s = s[1:]
    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "")
            s = s.replace(",", ".")
        else:
            s = s.replace(",", "")
    else:
        if "," in s:
            s = s.replace(",", ".")
    s = re.sub(r"[^0-9.]", "", s)
    if s.count(".") > 1:
        parts = s.split(".")
        s = "".join(parts[:-1]) + "." + parts[-1]
    s = sign + s
    try:
        return float(s)
    except ValueError:
        return None


def _extract_amount(text_norm: str, label_pattern: str) -> Optional[Dict[str, Any]]:
    m = re.search(
        label_pattern + r"\s*[:\-]?\s*(-?[0-9][0-9\s.,]*)\s*(EUR|€)?",
        text_norm,
        flags=re.IGNORECASE,
    )
    if not m:
        return None
    raw_number = (m.group(1) or "").strip()
    currency = (m.group(2) or "EUR").strip()
    value = _parse_amount_value(raw_number)
    if value is None:
        return None
    return {"value": value, "currency": "EUR" if currency == "€" else currency, "raw": (raw_number + " " + currency).strip()}


def _extract_fields_for_type(doc_type: str, raw_text: str) -> Dict[str, Any]:
    text_norm = _normalize_for_extraction(raw_text)
    dt = (doc_type or "").lower()

    fields: Dict[str, Any] = {}

    siret_label = _first_match(r"\bSIRET\s*[:\-]?\s*([0-9][0-9\s]{0,20})\b", text_norm, group=1)
    if siret_label is not None:
        siret_digits = re.sub(r"\D", "", siret_label)
        if siret_digits:
            fields["siret"] = siret_digits
    if "siret" not in fields:
        fields["siret"] = _first_match(r"\b(\d{14})\b", text_norm, group=1)
    fields["iban"] = _first_match(r"\b(FR[0-9A-Z]{12,34})\b", text_norm, group=1)

    if dt == "facture":
        fields["invoice_number"] = _first_match(r"\b(FACT[-_/ ]?\d{4}[-_/ ]?\d{1,6})\b", text_norm)
        fields["date_emission"] = _first_match(r"\bDATE\s+EMISSION\s*[:\-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b", text_norm)
        fields["date_echeance"] = _first_match(r"\bDATE\s+ECHEANCE\s*[:\-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b", text_norm)
        fields["amount_ht"] = _extract_amount(text_norm, r"(?:TOTAL\s+HT|MONTANT\s+HT|\bHT\b)")
        fields["tva_amount"] = _extract_amount(text_norm, r"(?:TVA(?:\s*\d{1,2}\s*%?)?)")
        fields["amount_ttc"] = _extract_amount(text_norm, r"(?:TOTAL\s+TTC|MONTANT\s+TTC|\bTTC\b)")
    elif dt == "devis":
        fields["quote_number"] = _first_match(r"\b(DEV[-_/ ]?\d{4}[-_/ ]?\d{1,6})\b", text_norm)
        fields["date_emission"] = _first_match(r"\bDATE\s+EMISSION\s*[:\-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b", text_norm)
        fields["date_validite"] = _first_match(r"\bDATE\s+VALIDITE\s*[:\-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b", text_norm)
        fields["amount_ht"] = _extract_amount(text_norm, r"(?:TOTAL\s+HT|MONTANT\s+HT|\bHT\b)")
        fields["tva_amount"] = _extract_amount(text_norm, r"(?:TVA(?:\s*\d{1,2}\s*%?)?)")
        fields["amount_ttc"] = _extract_amount(text_norm, r"(?:TOTAL\s+TTC|MONTANT\s+TTC|\bTTC\b)")
    elif dt in ("bdc", "bon_commande", "bon de commande"):
        fields["order_number"] = _first_match(r"\b(?:NUM(?:ERO)?|N°|NO)\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-_]{2,})\b", text_norm)
        fields["date_signature"] = _first_match(r"\bDA(?:TE|LE)\s*[:\-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b", text_norm)
        fields["amount_ht"] = _extract_amount(text_norm, r"(?:TOTAL\s+HT|MONTANT\s+HT|\bHT\b)")
        fields["tva_amount"] = _extract_amount(text_norm, r"(?:TVA(?:\s*\d{1,2}\s*%?)?)")
        fields["amount_ttc"] = _extract_amount(text_norm, r"(?:TOTAL\s+TTC|MONTANT\s+TTC|\bTTC\b)")

    return {k: v for k, v in fields.items() if v not in (None, "", {})}


def _is_valid_date_fr(date_str: str) -> bool:
    if not isinstance(date_str, str) or not date_str.strip():
        return False
    s = date_str.strip()
    if not re.fullmatch(r"\d{1,2}[/-]\d{1,2}[/-]\d{2,4}", s):
        return False
    parts = re.split(r"[/-]", s)
    if len(parts) != 3:
        return False
    try:
        day = int(parts[0])
        month = int(parts[1])
        year = int(parts[2])
        if year < 100:
            year += 2000
    except ValueError:
        return False
    try:
        from datetime import date as _date

        _date(year, month, day)
        return True
    except Exception:
        return False


def _conformity_required_fields(doc_type: str) -> List[str]:
    dt = (doc_type or "").lower()
    if dt == "facture":
        return ["invoice_number", "date_emission", "amount_ttc", "siret"]
    if dt == "devis":
        return ["quote_number", "date_emission", "siret"]
    if dt in ("bdc", "bon_commande", "bon de commande"):
        return ["order_number", "date_signature", "siret"]
    return []


def _evaluate_conformity(
    doc_type: str,
    extracted_fields: Dict[str, Any],
    classification_confidence: Optional[float] = None,
    ocr_confidence: Optional[float] = None,
) -> Dict[str, Any]:
    required = _conformity_required_fields(doc_type)

    reasons: List[Dict[str, Any]] = []
    missing_fields: List[str] = []
    invalid_fields: List[str] = []

    for field in required:
        if field not in extracted_fields or extracted_fields.get(field) in (None, "", {}):
            missing_fields.append(field)

    if extracted_fields.get("date_emission") and not _is_valid_date_fr(str(extracted_fields["date_emission"])):
        invalid_fields.append("date_emission")
    if extracted_fields.get("date_echeance") and not _is_valid_date_fr(str(extracted_fields["date_echeance"])):
        invalid_fields.append("date_echeance")
    if extracted_fields.get("date_validite") and not _is_valid_date_fr(str(extracted_fields["date_validite"])):
        invalid_fields.append("date_validite")
    if extracted_fields.get("date_signature") and not _is_valid_date_fr(str(extracted_fields["date_signature"])):
        invalid_fields.append("date_signature")

    for f in ("amount_ht", "amount_ttc", "tva_amount"):
        v = extracted_fields.get(f)
        if isinstance(v, dict) and "value" in v:
            try:
                if float(v["value"]) < 0:
                    invalid_fields.append(f)
            except Exception:
                invalid_fields.append(f)

    siret = extracted_fields.get("siret")
    if siret is not None and not re.fullmatch(r"\d{14}", str(siret).strip()):
        invalid_fields.append("siret")
    if siret is not None and re.fullmatch(r"0{14}", str(siret).strip()):
        invalid_fields.append("siret")
    iban = extracted_fields.get("iban")
    if iban is not None and not re.fullmatch(r"FR[0-9A-Z]{12,34}", str(iban).strip(), flags=re.IGNORECASE):
        invalid_fields.append("iban")

    amount_ht = extracted_fields.get("amount_ht")
    amount_ttc = extracted_fields.get("amount_ttc")
    tva_amount = extracted_fields.get("tva_amount")
    if (
        isinstance(amount_ht, dict)
        and isinstance(amount_ttc, dict)
        and isinstance(tva_amount, dict)
        and "value" in amount_ht
        and "value" in amount_ttc
        and "value" in tva_amount
    ):
        try:
            expected = float(amount_ht["value"]) + float(tva_amount["value"])
            got = float(amount_ttc["value"])
            if abs(got - expected) > 1.0:
                invalid_fields.append("amount_ttc")
                reasons.append(
                    {
                        "code": "amounts_inconsistent",
                        "message": "Montants incohérents (TTC != HT + TVA).",
                        "expected": expected,
                        "value": got,
                    }
                )
        except Exception:
            pass

    if missing_fields:
        reasons.append(
            {
                "code": "missing_fields",
                "message": "Champs obligatoires manquants.",
                "fields": missing_fields,
            }
        )
    if invalid_fields:
        reasons.append(
            {
                "code": "invalid_fields",
                "message": "Champs présents mais au format inattendu.",
                "fields": sorted(set(invalid_fields)),
            }
        )

    status = "conforme"
    if missing_fields or invalid_fields:
        status = "non_conforme"

    min_classification_score = 0.5
    min_ocr_confidence = 60.0

    if classification_confidence is not None:
        try:
            if float(classification_confidence) < min_classification_score and status == "conforme":
                status = "a_verifier"
                reasons.append(
                    {
                        "code": "low_classification_confidence",
                        "message": "Score de classification faible.",
                        "threshold": min_classification_score,
                        "value": float(classification_confidence),
                    }
                )
        except Exception:
            pass

    if ocr_confidence is not None:
        try:
            if float(ocr_confidence) < min_ocr_confidence and status == "conforme":
                status = "a_verifier"
                reasons.append(
                    {
                        "code": "low_ocr_confidence",
                        "message": "Confiance OCR faible.",
                        "threshold": min_ocr_confidence,
                        "value": float(ocr_confidence),
                    }
                )
        except Exception:
            pass

    completeness = 1.0
    if required:
        completeness = (len(required) - len(missing_fields)) / float(len(required))

    return {
        "status": status,
        "required_fields": required,
        "missing_fields": missing_fields,
        "invalid_fields": sorted(set(invalid_fields)),
        "reasons": reasons,
        "scores": {
            "fields_completeness": round(completeness, 3),
            "classification_confidence": classification_confidence,
            "ocr_confidence": ocr_confidence,
        },
    }


def _mean_conf_from_tsv(tsv_path: Path) -> float:
    # Extrait une "confiance OCR moyenne" depuis le TSV produit par Tesseract.
    # Les lignes avec conf négative sont ignorées (zones non reconnues).
    if not tsv_path.exists():
        return 0.0
    total = 0.0
    count = 0
    with tsv_path.open("r", encoding="utf-8", errors="ignore") as f:
        for i, line in enumerate(f):
            if i == 0:
                continue
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 11:
                continue
            conf = parts[10]
            try:
                conf_val = float(conf)
            except ValueError:
                continue
            if conf_val < 0:
                continue
            total += conf_val
            count += 1
    return round(total / count, 2) if count else 0.0


def _preprocess_for_ocr(img_path: Path, out_path: Path) -> Path:
    # Prétraitement simple avant OCR:
    # - conversion en niveaux de gris
    # - binarisation (seuil fixe) pour faciliter Tesseract sur des scans.
    from PIL import Image

    img = Image.open(img_path).convert("L")
    img = img.point(lambda x: 0 if x < 180 else 255, mode="1")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path)
    return out_path


def _find_tesseract_cmd() -> str:
    cmd = os.environ.get("TESSERACT_CMD")
    if cmd:
        return cmd
    resolved = shutil.which("tesseract")
    if resolved:
        return resolved
    candidates = [
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
    ]
    for c in candidates:
        if Path(c).exists():
            return c
    return "tesseract"


def _resolve_tessdata_dir(lang: str) -> Optional[str]:
    override = os.environ.get("TESSDATA_DIR") or os.environ.get("TESSDATA_PREFIX")
    if override and Path(override).exists():
        return str(Path(override))

    here = Path(__file__).resolve().parent
    local_tessdata = here / "tessdata"
    if local_tessdata.exists() and (local_tessdata / f"{lang}.traineddata").exists():
        return str(local_tessdata)

    return None


def _run_tesseract(image_path: Path, out_base: Path, lang: str = "fra") -> None:
    # Lance Tesseract en CLI et génère au minimum:
    # - out_base.txt (texte OCR)
    # - out_base.tsv (détails + confiance par token)
    tesseract_cmd = _find_tesseract_cmd()
    tessdata_dir = _resolve_tessdata_dir(lang)
    base_args = [
        tesseract_cmd,
        str(image_path),
        str(out_base),
        "-l",
        lang,
        "--oem",
        "1",
        "--psm",
        "6",
    ]
    cmd_txt = list(base_args)
    cmd_formats = list(base_args)
    if tessdata_dir:
        cmd_txt += ["--tessdata-dir", tessdata_dir]
        cmd_formats += ["--tessdata-dir", tessdata_dir]
    cmd_formats += ["tsv"]
    subprocess.run(cmd_txt, check=True, capture_output=True)
    subprocess.run(cmd_formats, check=True, capture_output=True)


def ocr_image_to_text(image_bytes: bytes, filename: str = "document.png", lang: str = "fra") -> Dict[str, Any]:
    suffix = Path(filename).suffix or ".png"
    if suffix.lower() == ".pdf":
        import fitz

        doc = fitz.open(stream=image_bytes, filetype="pdf")
        if doc.page_count <= 0:
            return {"text": "", "ocr_conf_moy": 0.0}
        page = doc.load_page(0)
        mat = fitz.Matrix(200 / 72, 200 / 72)
        pix = page.get_pixmap(matrix=mat, alpha=False)
        image_bytes = pix.tobytes("png")
        suffix = ".png"
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_root = Path(tmp_dir)
        raw_path = tmp_root / f"input{suffix}"
        raw_path.write_bytes(image_bytes)

        pre_path = tmp_root / "preprocessed.png"
        pre_img_path = _preprocess_for_ocr(raw_path, pre_path)

        out_base = tmp_root / "ocr_out"
        _run_tesseract(pre_img_path, out_base, lang=lang)

        txt_path = out_base.with_suffix(".txt")
        tsv_path = out_base.with_suffix(".tsv")

        text = txt_path.read_text(encoding="utf-8", errors="ignore") if txt_path.exists() else ""
        return {
            "text": text,
            "ocr_conf_moy": _mean_conf_from_tsv(tsv_path),
        }


class OCRDocumentClassifier:
    # Wrapper léger autour du pipeline scikit-learn sauvegardé (.joblib).
    #
    # Responsabilités:
    # - charger le pipeline
    # - appliquer le même nettoyage texte qu'en entraînement
    # - exposer predict() et predict_batch()
    def __init__(self, pipeline_path: Optional[str] = None):
        # pipeline_path peut être passé explicitement ou via la variable d'env PIPELINE_PATH.
        self.pipeline_path = pipeline_path or os.environ.get("PIPELINE_PATH") or _default_pipeline_path()
        import joblib

        self.pipeline = joblib.load(self.pipeline_path)

    def predict(self, text: str) -> Dict[str, Any]:
        # Prédit la classe de document à partir d'un texte OCR.
        raw_text = str(text)
        cleaned = clean_text_with_options(raw_text, deshortcut_mode="none")
        pred = self.pipeline.predict([cleaned])[0]
        conf = self._confidence_scores([cleaned])
        result = {
            "document_type": str(pred),
            "classification_confidence": conf[0] if conf is not None and len(conf) else None,
        }
        result["extracted_fields"] = _extract_fields_for_type(result["document_type"], raw_text)
        result["conformity"] = _evaluate_conformity(
            doc_type=result["document_type"],
            extracted_fields=result["extracted_fields"],
            classification_confidence=result.get("classification_confidence"),
            ocr_confidence=None,
        )
        return result

    def predict_batch(self, documents: List[Dict[str, Any]]) -> Dict[str, Any]:
        # Prédit pour une liste de documents (utile côté backend).
        # Format attendu: [{"id": "...", "text": "..."}, ...]
        cleaned_texts: List[str] = []
        ids: List[Any] = []
        raw_texts: List[str] = []
        for doc in documents:
            if not isinstance(doc, dict):
                raise ValueError("Each document must be an object")
            if "text" not in doc:
                raise ValueError("Each document must contain a 'text' field")
            # Compat avec pipeline_ocr: "dossier_id" peut servir d'identifiant.
            ids.append(doc.get("id") or doc.get("doc_id") or doc.get("document_id") or doc.get("dossier_id"))
            raw = str(doc.get("text", ""))
            raw_texts.append(raw)
            cleaned_texts.append(clean_text_with_options(raw, deshortcut_mode="none"))

        preds = self.pipeline.predict(cleaned_texts)
        conf = self._confidence_scores(cleaned_texts)

        results: List[Dict[str, Any]] = []
        for i, p in enumerate(preds):
            doc_type = str(p)
            extracted_fields = _extract_fields_for_type(doc_type, raw_texts[i])
            classification_confidence = conf[i] if conf is not None else None
            results.append(
                {
                    "id": ids[i],
                    "document_type": doc_type,
                    "classification_confidence": classification_confidence,
                    "extracted_fields": extracted_fields,
                    "conformity": _evaluate_conformity(
                        doc_type=doc_type,
                        extracted_fields=extracted_fields,
                        classification_confidence=classification_confidence,
                        ocr_confidence=None,
                    ),
                }
            )
        return {"results": results}

    def _confidence_scores(self, cleaned_texts: List[str]) -> Optional[List[float]]:
        # Essaie de renvoyer un score de confiance.
        #
        # - Si le classifieur expose predict_proba: on renvoie max(proba)
        # - Sinon, si decision_function existe (cas LinearSVC): on convertit les marges en [0,1]
        try:
            import numpy as np
        except Exception:
            return None

        clf = getattr(self.pipeline, "named_steps", {}).get("clf")
        if clf is None:
            clf = self.pipeline

        if hasattr(clf, "predict_proba"):
            proba = self.pipeline.predict_proba(cleaned_texts)
            return np.max(proba, axis=1).astype(float).tolist()

        if hasattr(clf, "decision_function"):
            scores = self.pipeline.decision_function(cleaned_texts)
            scores = np.asarray(scores)
            if scores.ndim == 1:
                probs = 1.0 / (1.0 + np.exp(-np.abs(scores)))
                return probs.astype(float).tolist()

            max_per_row = np.max(scores, axis=1, keepdims=True)
            exp_scores = np.exp(scores - max_per_row)
            probs = exp_scores / np.sum(exp_scores, axis=1, keepdims=True)
            return np.max(probs, axis=1).astype(float).tolist()

        return None


def create_flask_app(pipeline_path: Optional[str] = None):
    # Crée une application Flask prête à être lancée par flask_api.py.
    #
    # Endpoints:
    # - GET  /health
    # - GET  /metadata
    # - POST /predict       (JSON: {text, id?})
    # - POST /predict_batch (JSON: {documents: [{id,text}, ...]})
    # - POST /predict_file  (multipart: file + id? + lang?)
    from flask import Flask, jsonify, request

    classifier = OCRDocumentClassifier(pipeline_path=pipeline_path)
    app = Flask(__name__)

    @app.get("/health")
    def health():
        # Healthcheck simple pour vérifier que le service répond.
        return jsonify({"status": "ok"})

    @app.get("/metadata")
    def metadata():
        # Informations sur le pipeline chargé (utile pour debug/intégration).
        clf = getattr(classifier.pipeline, "named_steps", {}).get("clf")
        return jsonify(
            {
                "pipeline_path": classifier.pipeline_path,
                "classifier": getattr(clf, "__class__", type(clf)).__name__ if clf is not None else None,
                "labels": list(getattr(clf, "classes_", [])) if clf is not None else [],
            }
        )

    @app.post("/predict")
    def predict():
        # Prédiction à partir de texte OCR déjà fourni par le backend.
        payload = request.get_json(silent=True) or {}
        # Compat: si l'appelant envoie un objet provenant de pipeline_ocr, "dossier_id" sert d'id.
        doc_id = (
            payload.get("id")
            or payload.get("doc_id")
            or payload.get("document_id")
            or payload.get("dossier_id")
        )
        text = payload.get("text")
        if text is None:
            return jsonify({"error": "Missing 'text' in JSON body"}), 400
        result = classifier.predict(str(text))
        if doc_id is not None:
            result["id"] = doc_id
        return jsonify(result)

    @app.post("/predict_batch")
    def predict_batch():
        # Prédiction batch: conserve les "id" pour que le backend puisse recoller les résultats.
        payload = request.get_json(silent=True) or {}
        documents = payload.get("documents")
        if not isinstance(documents, list) or len(documents) == 0:
            return jsonify({"error": "Missing 'documents' (non-empty list) in JSON body"}), 400
        try:
            return jsonify(classifier.predict_batch(documents))
        except ValueError as e:
            return jsonify({"error": str(e)}), 400

    @app.post("/conformity")
    def conformity():
        payload = request.get_json(silent=True) or {}
        doc_id = (
            payload.get("id")
            or payload.get("doc_id")
            or payload.get("document_id")
            or payload.get("dossier_id")
        )

        if "text" in payload and payload.get("text") is not None:
            pred = classifier.predict(str(payload.get("text", "")))
            conformity_payload = pred.get("conformity")
            result = {
                "document_type": pred.get("document_type"),
                "classification_confidence": pred.get("classification_confidence"),
                "extracted_fields": pred.get("extracted_fields"),
                "conformity": conformity_payload,
            }
            if doc_id is not None:
                result["id"] = doc_id
            return jsonify(result)

        document_type = payload.get("document_type")
        extracted_fields = payload.get("extracted_fields")
        if not isinstance(document_type, str) or not isinstance(extracted_fields, dict):
            return jsonify({"error": "Provide either 'text' or ('document_type' and 'extracted_fields')"}), 400

        classification_confidence = payload.get("classification_confidence")
        ocr_confidence = payload.get("ocr_confidence")
        conformity_payload = _evaluate_conformity(
            doc_type=document_type,
            extracted_fields=extracted_fields,
            classification_confidence=classification_confidence if isinstance(classification_confidence, (int, float)) else None,
            ocr_confidence=ocr_confidence if isinstance(ocr_confidence, (int, float)) else None,
        )
        result = {"document_type": document_type, "conformity": conformity_payload}
        if doc_id is not None:
            result["id"] = doc_id
        return jsonify(result)

    @app.post("/predict_file")
    def predict_file():
        # Prédiction à partir d'un fichier image:
        # - OCR via Tesseract (texte + confiance OCR)
        # - classification du texte OCR
        if "file" not in request.files:
            return jsonify({"error": "Missing file in multipart form-data (field name: 'file')"}), 400
        f = request.files["file"]
        if not getattr(f, "filename", ""):
            return jsonify({"error": "Empty filename"}), 400
        doc_id = (
            request.form.get("id")
            or request.form.get("doc_id")
            or request.form.get("document_id")
            or request.form.get("dossier_id")
        )
        try:
            # "lang" = langue Tesseract (par défaut "fra").
            ocr_res = ocr_image_to_text(f.read(), filename=f.filename, lang=request.form.get("lang", "fra"))
        except ModuleNotFoundError as e:
            msg = str(e)
            if "fitz" in msg or "pymupdf" in msg.lower():
                return jsonify({"error": "Missing dependency: PyMuPDF (pip install pymupdf)"}), 500
            return jsonify({"error": "Missing dependency: Pillow (pip install pillow)"}), 500
        except FileNotFoundError:
            return jsonify({"error": "Tesseract not found in PATH"}), 500
        except subprocess.CalledProcessError as e:
            stderr = ""
            try:
                stderr = e.stderr.decode("utf-8", errors="ignore") if e.stderr else ""
            except Exception:
                stderr = ""
            return jsonify({"error": "Tesseract error", "details": stderr.strip()}), 500

        # Classification à partir du texte OCR.
        pred = classifier.predict(ocr_res.get("text", ""))
        result = {
            "document_type": pred.get("document_type"),
            "classification_confidence": pred.get("classification_confidence"),
            "extracted_fields": pred.get("extracted_fields"),
            "conformity": _evaluate_conformity(
                doc_type=pred.get("document_type"),
                extracted_fields=pred.get("extracted_fields") or {},
                classification_confidence=pred.get("classification_confidence"),
                ocr_confidence=ocr_res.get("ocr_conf_moy"),
            ),
            "ocr_confidence": ocr_res.get("ocr_conf_moy"),
            "ocr_text": ocr_res.get("text"),
            "filename": f.filename,
        }
        if doc_id is not None:
            result["id"] = doc_id
        return jsonify(result)

    return app
