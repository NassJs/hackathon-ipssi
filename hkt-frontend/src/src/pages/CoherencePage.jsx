import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle, XCircle, RefreshCw, ShieldCheck, FileText } from "lucide-react";
import { getDocuments } from "../api";

function analyseCoherence(documents) {
  const alerts = [];
  const validated = documents.filter((d) => d.status === "validated" && d.extracted_data);

  // 1. Vérif dates expirées
  validated.forEach((doc) => {
    if (doc.extracted_data?.date_expiration) {
      const exp = new Date(doc.extracted_data.date_expiration);
      if (exp < new Date()) {
        alerts.push({
          type: "error",
          doc: doc.name,
          message: `Document expiré le ${exp.toLocaleDateString("fr-FR")}`,
        });
      } else {
        const diffDays = Math.ceil((exp - new Date()) / (1000 * 60 * 60 * 24));
        if (diffDays < 30) {
          alerts.push({
            type: "warning",
            doc: doc.name,
            message: `Expire dans ${diffDays} jours (${exp.toLocaleDateString("fr-FR")})`,
          });
        }
      }
    }
  });

  // 2. Vérif cohérence SIRET entre documents
  const sirets = validated
    .filter((d) => d.extracted_data?.siret)
    .map((d) => ({ name: d.name, siret: d.extracted_data.siret }));

  if (sirets.length > 1) {
    const uniqueSirets = [...new Set(sirets.map((s) => s.siret))];
    if (uniqueSirets.length > 1) {
      alerts.push({
        type: "error",
        doc: "Multi-documents",
        message: `SIRET incohérents détectés : ${uniqueSirets.join(" ≠ ")}`,
      });
    } else {
      alerts.push({
        type: "success",
        doc: "Multi-documents",
        message: `SIRET cohérent sur ${sirets.length} documents : ${uniqueSirets[0]}`,
      });
    }
  }

  // 3. Vérif flags de validation
  validated.forEach((doc) => {
    const flags = doc.verification_flags;
    if (!flags) return;
    if (flags.sirene_valid === false) {
      alerts.push({ type: "error", doc: doc.name, message: "SIRET invalide selon SIRENE" });
    }
    if (flags.date_valid === false) {
      alerts.push({ type: "error", doc: doc.name, message: "Date d'émission invalide" });
    }
    if (flags.siret_match === false) {
      alerts.push({ type: "error", doc: doc.name, message: "SIRET ne correspond pas entre les documents" });
    }
    if (flags.sirene_valid && flags.date_valid && flags.siret_match) {
      alerts.push({ type: "success", doc: doc.name, message: "Toutes les vérifications passées" });
    }
  });

  // 4. Documents non analysés
  const pending = documents.filter((d) => d.status === "pending");
  if (pending.length > 0) {
    alerts.push({
      type: "warning",
      doc: "En attente",
      message: `${pending.length} document(s) pas encore analysé(s)`,
    });
  }

  return alerts;
}

const ICON = {
  error:   <XCircle size={16} color="#ef4444" />,
  warning: <AlertTriangle size={16} color="#f59e0b" />,
  success: <CheckCircle size={16} color="#10b981" />,
};

const COLORS = {
  error:   { bg: "#fef2f2", border: "#fca5a5", text: "#991b1b" },
  warning: { bg: "#fffbeb", border: "#fcd34d", text: "#92400e" },
  success: { bg: "#f0fdf4", border: "#86efac", text: "#166534" },
};

export default function CoherencePage({ token }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await getDocuments(token);
      setDocuments(res.documents || []);
    } catch {
      setError("Impossible de charger les documents.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const alerts = analyseCoherence(documents);
  const errors   = alerts.filter((a) => a.type === "error");
  const warnings = alerts.filter((a) => a.type === "warning");
  const successes = alerts.filter((a) => a.type === "success");

  return (
    <div className="content-area">

      {/* Stats rapides */}
      <div className="stats-grid">
        <div className="stat-card stat-card--blue">
          <div className="stat-card-icon"><FileText size={20} /></div>
          <div className="stat-label">Documents analysés</div>
          <div className="stat-value">{documents.filter(d => d.status === "validated").length}</div>
          <span className="badge badge-neutral">/ {documents.length} total</span>
        </div>

        <div className="stat-card stat-card--red">
          <div className="stat-card-icon"><XCircle size={20} /></div>
          <div className="stat-label">Erreurs</div>
          <div className="stat-value">{errors.length}</div>
          <span className="badge badge-error">critique</span>
        </div>

        <div className="stat-card stat-card--indigo">
          <div className="stat-card-icon"><AlertTriangle size={20} /></div>
          <div className="stat-label">Avertissements</div>
          <div className="stat-value">{warnings.length}</div>
          <span className="badge badge-warning">attention</span>
        </div>

        <div className="stat-card stat-card--green">
          <div className="stat-card-icon"><ShieldCheck size={20} /></div>
          <div className="stat-label">Validations OK</div>
          <div className="stat-value">{successes.length}</div>
          <span className="badge badge-success">conforme</span>
        </div>
      </div>

      {/* Résultats */}
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title"><ShieldCheck size={16} /> Rapport de cohérence</div>
          <button className="btn" onClick={load}><RefreshCw size={14} /> Actualiser</button>
        </div>

        {error && <div className="error-box">{error}</div>}

        {loading ? (
          <div className="empty-state">Analyse en cours...</div>
        ) : documents.length === 0 ? (
          <div className="empty-state">
            <FileText size={32} color="var(--text-muted)" />
            <p>Aucun document à analyser.</p>
            <p style={{ fontSize: "0.85rem" }}>Uploadez des documents d'abord.</p>
          </div>
        ) : alerts.length === 0 ? (
          <div className="empty-state">
            <CheckCircle size={32} color="var(--success)" />
            <p style={{ color: "var(--success)", fontWeight: 600 }}>Tout est conforme !</p>
          </div>
        ) : (
          <div className="alerts-list">
            {alerts.map((alert, i) => {
              const c = COLORS[alert.type];
              return (
                <div key={i} className="alert-item" style={{ background: c.bg, borderColor: c.border }}>
                  <div className="alert-icon">{ICON[alert.type]}</div>
                  <div className="alert-body">
                    <span className="alert-doc">{alert.doc}</span>
                    <span className="alert-msg" style={{ color: c.text }}>{alert.message}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
