import { useState, useRef } from "react";
import { Upload, FileText, X, CheckCircle, Loader, AlertCircle, Trash2 } from "lucide-react";
import { uploadDocument, analyseDocument } from "../api";

const TYPE_LABELS = {
  facture: "Facture",
  devis: "Devis",
  bon_commande: "Bon de commande",
  attestation: "Attestation",
  kbis: "Extrait Kbis",
  rib: "RIB",
  autre: "Autre",
};

const TYPE_COLORS = {
  facture: "badge-success",
  devis: "badge-neutral",
  bon_commande: "badge-neutral",
  attestation: "badge-warning",
  kbis: "badge-neutral",
  rib: "badge-neutral",
  autre: "badge-neutral",
};

const CONFORMITY_CONFIG = {
  conforme: { label: "Conforme", color: "badge-success" },
  a_verifier: { label: "À vérifier", color: "badge-warning" },
  non_conforme: { label: "Non valide", color: "badge-error" },
};

export default function UploadPage({ token }) {
  const [files, setFiles] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [results, setResults] = useState([]);
  const [loadingIndex, setLoadingIndex] = useState(null);
  const [error, setError] = useState("");
  const inputRef = useRef();

  function addFiles(newFiles) {
    const valid = Array.from(newFiles).filter(
      (f) => f.type === "application/pdf" || f.type.startsWith("image/")
    );
    setFiles((prev) => [...prev, ...valid]);
  }

  function removeFile(index) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }

  async function handleAnalyse() {
    if (files.length === 0) return;
    setError("");
    setResults([]);

    for (let i = 0; i < files.length; i++) {
      setLoadingIndex(i);
      try {
        const uploaded = await uploadDocument(token, files[i]);
        const analysed = await analyseDocument(token, uploaded.document._id);
        setResults((prev) => [...prev, analysed.document]);
      } catch (err) {
        setError("Erreur lors de l'analyse d'un fichier.");
      }
    }
    setLoadingIndex(null);
  }

  return (
    <div className="content-area">
      <div className="panel glass">
        <div className="panel-title">Uploader des documents</div>

        <div
          className={`drop-zone ${dragging ? "dragging" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current.click()}
        >
          <Upload size={32} color="var(--accent)" />
          <p>Glissez vos fichiers ici ou <strong>cliquez pour parcourir</strong></p>
          <p className="drop-hint">PDF, JPG, PNG acceptés</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,image/*"
            style={{ display: "none" }}
            onChange={(e) => addFiles(e.target.files)}
          />
        </div>

        {files.length > 0 && (
          <div className="file-list">
            {files.map((f, i) => (
              <div key={i} className={`file-item glass ${loadingIndex === i ? "file-loading" : ""}`}>
                {loadingIndex === i ? (
                  <Loader size={16} className="spin" />
                ) : (
                  <FileText size={16} color="var(--accent)" />
                )}
                <span className="file-name">{f.name}</span>
                <span className="file-size">{(f.size / 1024).toFixed(0)} Ko</span>
                {loadingIndex === null && (
                  <button className="btn-icon" onClick={() => removeFile(i)}>
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="error-box">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {files.length > 0 && loadingIndex === null && results.length === 0 && (
          <button className="btn btn-primary analyse-btn" onClick={handleAnalyse}>
            <Upload size={16} />
            Analyser {files.length} document{files.length > 1 ? "s" : ""}
          </button>
        )}

        {loadingIndex !== null && (
          <div className="processing-state">
            <Loader size={18} className="spin" />
            <span>Analyse OCR en cours... ({loadingIndex + 1}/{files.length})</span>
          </div>
        )}
      </div>

      {results.length > 0 && (
        <div className="panel glass">
          <div className="panel-title">
            <CheckCircle size={16} color="var(--success)" />
            Résultats de l'analyse
          </div>
          <div className="results-grid">
            {results.map((doc) => (
              <div key={doc._id} className="result-card glass">
                {(() => {
                  const conformityStatus = typeof doc.conformity?.status === "string" ? doc.conformity.status : null;
                  const conformity = (conformityStatus && CONFORMITY_CONFIG[conformityStatus]) || null;
                  return (
                <div className="result-header">
                  <FileText size={16} color="var(--accent)" />
                  <span className="result-name">{doc.name}</span>
                  <span className={`badge ${TYPE_COLORS[doc.type] || "badge-neutral"}`}>
                    {TYPE_LABELS[doc.type] || doc.type}
                  </span>
                  {conformity && <span className={`badge ${conformity.color}`}>{conformity.label}</span>}
                </div>
                  );
                })()}

                {doc.extracted_data && (
                  <div className="result-fields">
                    {doc.extracted_data.siret && (
                      <div className="field-row">
                        <span>SIRET</span>
                        <strong>{doc.extracted_data.siret}</strong>
                      </div>
                    )}
                    {doc.extracted_data.tva && (
                      <div className="field-row">
                        <span>TVA</span>
                        <strong>{doc.extracted_data.tva}</strong>
                      </div>
                    )}
                    {doc.extracted_data.montant_ht && (
                      <div className="field-row">
                        <span>Montant HT</span>
                        <strong>{doc.extracted_data.montant_ht} €</strong>
                      </div>
                    )}
                    {doc.extracted_data.montant_ttc && (
                      <div className="field-row">
                        <span>Montant TTC</span>
                        <strong>{doc.extracted_data.montant_ttc} €</strong>
                      </div>
                    )}
                    {doc.extracted_data.date_emission && (
                      <div className="field-row">
                        <span>Date émission</span>
                        <strong>{new Date(doc.extracted_data.date_emission).toLocaleDateString("fr-FR")}</strong>
                      </div>
                    )}
                    {doc.extracted_data.date_expiration && (
                      <div className="field-row">
                        <span>Date expiration</span>
                        <strong style={{ color: "var(--warning)" }}>
                          {new Date(doc.extracted_data.date_expiration).toLocaleDateString("fr-FR")}
                        </strong>
                      </div>
                    )}
                  </div>
                )}

                {doc.verification_flags && (
                  <div className="verif-flags">
                    <Flag ok={doc.verification_flags.sirene_valid} label="SIRET valide" />
                    <Flag ok={doc.verification_flags.date_valid} label="Date valide" />
                    <Flag ok={doc.verification_flags.siret_match} label="SIRET cohérent" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Flag({ ok, label }) {
  if (ok === undefined || ok === null) return null;
  return (
    <span className={`badge ${ok ? "badge-success" : "badge-error"}`}>
      {ok ? <CheckCircle size={11} /> : <AlertCircle size={11} />}
      {label}
    </span>
  );
}
