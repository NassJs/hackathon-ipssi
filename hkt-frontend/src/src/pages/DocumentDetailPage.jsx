import { ArrowLeft, CheckCircle, AlertCircle, FileText } from "lucide-react";

const TYPE_LABELS = {
  facture: "Facture", devis: "Devis", attestation: "Attestation",
  bon_commande: "Bon de commande",
  kbis: "Extrait Kbis", rib: "RIB", autre: "Autre",
};

const CONFORMITY_CONFIG = {
  conforme: { label: "Conforme", color: "badge-success" },
  a_verifier: { label: "À vérifier", color: "badge-warning" },
  non_conforme: { label: "Non valide", color: "badge-error" },
};

function Field({ label, value, warn }) {
  if (!value && value !== 0) return null;
  return (
    <div className="field-row">
      <span>{label}</span>
      <strong style={warn ? { color: "var(--warning)" } : {}}>{value}</strong>
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

export default function DocumentDetailPage({ doc, onBack }) {
  if (!doc) return null;

  const d = doc.extracted_data || {};
  const v = doc.verification_flags || {};
  const conformity = doc.conformity || {};
  const conformityStatus = typeof conformity.status === "string" ? conformity.status : null;
  const conformityUi = (conformityStatus && CONFORMITY_CONFIG[conformityStatus]) || null;
  const missingFields = Array.isArray(conformity.missing_fields) ? conformity.missing_fields : [];
  const invalidFields = Array.isArray(conformity.invalid_fields) ? conformity.invalid_fields : [];

  const isExpired = d.date_expiration && new Date(d.date_expiration) < new Date();

  return (
    <div className="content-area">
      <button className="btn" onClick={onBack} style={{ marginBottom: 16 }}>
        <ArrowLeft size={14} /> Retour
      </button>

      <div className="split-grid">
        <div className="panel glass">
          <div className="panel-title">
            <FileText size={16} color="var(--accent)" />
            {doc.name}
            <span className="badge badge-neutral" style={{ marginLeft: "auto" }}>
              {TYPE_LABELS[doc.type] || doc.type}
            </span>
          </div>

          <div className="result-fields" style={{ marginTop: 12 }}>
            <Field label="SIRET" value={d.siret} />
            <Field label="N° TVA" value={d.tva} />
            <Field label="Montant HT" value={d.montant_ht ? `${d.montant_ht} €` : null} />
            <Field label="Montant TTC" value={d.montant_ttc ? `${d.montant_ttc} €` : null} />
            <Field
              label="Date d'émission"
              value={d.date_emission ? new Date(d.date_emission).toLocaleDateString("fr-FR") : null}
            />
            <Field
              label="Date d'expiration"
              value={d.date_expiration ? new Date(d.date_expiration).toLocaleDateString("fr-FR") : null}
              warn={isExpired}
            />
          </div>

          {isExpired && (
            <div className="error-box" style={{ marginTop: 12 }}>
              <AlertCircle size={16} /> Ce document est expiré !
            </div>
          )}
        </div>

        <div className="panel glass">
          <div className="panel-title">Vérifications</div>

          {Object.keys(v).length === 0 ? (
            <p style={{ color: "var(--text-soft)", fontSize: "0.9rem" }}>
              Aucune vérification disponible.
            </p>
          ) : (
            <div className="verif-flags" style={{ marginTop: 12 }}>
              <Flag ok={v.sirene_valid} label="SIRET valide" />
              <Flag ok={v.date_valid} label="Date valide" />
              <Flag ok={v.siret_match} label="SIRET cohérent" />
            </div>
          )}

          <div className="panel-title" style={{ marginTop: 20 }}>Conformité</div>
          <div style={{ marginTop: 8 }}>
            {conformityUi ? (
              <span className={`badge ${conformityUi.color}`}>{conformityUi.label}</span>
            ) : (
              <span className="badge badge-neutral">Inconnu</span>
            )}
          </div>

          {(missingFields.length > 0 || invalidFields.length > 0) && (
            <div className="result-fields" style={{ marginTop: 10 }}>
              {missingFields.length > 0 && (
                <div className="field-row">
                  <span>Champs manquants</span>
                  <strong style={{ color: "var(--error)" }}>{missingFields.join(", ")}</strong>
                </div>
              )}
              {invalidFields.length > 0 && (
                <div className="field-row">
                  <span>Champs invalides</span>
                  <strong style={{ color: "var(--error)" }}>{invalidFields.join(", ")}</strong>
                </div>
              )}
            </div>
          )}

          <div className="panel-title" style={{ marginTop: 20 }}>Infos document</div>
          <div className="result-fields" style={{ marginTop: 8 }}>
            <div className="field-row">
              <span>Statut</span>
              <strong>{doc.status}</strong>
            </div>
            <div className="field-row">
              <span>Uploadé le</span>
              <strong>{new Date(doc.created_at).toLocaleString("fr-FR")}</strong>
            </div>
            <div className="field-row">
              <span>ID</span>
              <strong style={{ fontSize: "0.75rem", color: "var(--text-soft)" }}>{doc._id}</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
