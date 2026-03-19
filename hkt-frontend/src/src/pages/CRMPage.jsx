import { useEffect, useState } from "react";
import { Building2, FileText, RefreshCw, CheckCircle, Copy, Phone, Mail, MapPin, Hash } from "lucide-react";
import { getDocuments } from "../api";

const TYPE_LABELS = {
  facture: "Facture", devis: "Devis", attestation: "Attestation",
  kbis: "Extrait Kbis", rib: "RIB", autre: "Autre",
};

export default function CRMPage({ token }) {
  const [documents, setDocuments] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    getDocuments(token)
      .then((res) => {
        const validated = (res.documents || []).filter(
          (d) => d.status === "validated" && d.extracted_data
        );
        setDocuments(validated);
        if (validated.length > 0) setSelected(validated[0]);
      })
      .finally(() => setLoading(false));
  }, []);

  function copyField(value, key) {
    navigator.clipboard.writeText(value || "");
    setCopied(key);
    setTimeout(() => setCopied(""), 2000);
  }

  const d = selected?.extracted_data || {};

  return (
    <div className="content-area">

      <div className="split-grid" style={{ gridTemplateColumns: "1fr 2fr" }}>

        {/* Liste des documents */}
        <div className="panel">
          <div className="panel-title"><FileText size={16} /> Documents analysés</div>

          {loading ? (
            <div className="empty-state">Chargement...</div>
          ) : documents.length === 0 ? (
            <div className="empty-state">
              <FileText size={28} color="var(--text-muted)" />
              <p>Aucun document analysé.</p>
              <p style={{ fontSize: "0.82rem" }}>Uploadez et analysez des documents d'abord.</p>
            </div>
          ) : (
            <div className="doc-select-list">
              {documents.map((doc) => (
                <div
                  key={doc._id}
                  className={`doc-select-item ${selected?._id === doc._id ? "active" : ""}`}
                  onClick={() => setSelected(doc)}
                >
                  <div className="doc-select-icon">
                    <FileText size={14} />
                  </div>
                  <div>
                    <div className="doc-select-name">{doc.name}</div>
                    <span className="badge badge-neutral" style={{ fontSize: "0.65rem" }}>
                      {TYPE_LABELS[doc.type] || doc.type}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Fiche CRM auto-remplie */}
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title"><Building2 size={16} /> Fiche fournisseur</div>
            {selected && (
              <span className="badge badge-success"><CheckCircle size={11} /> Auto-rempli</span>
            )}
          </div>

          {!selected ? (
            <div className="empty-state">
              <Building2 size={32} color="var(--text-muted)" />
              <p>Sélectionnez un document pour remplir la fiche.</p>
            </div>
          ) : (
            <div className="crm-form">

              <div className="crm-section-title">Identification</div>
              <div className="crm-grid">
                <CRMField
                  icon={<Hash size={14} />}
                  label="SIRET"
                  value={d.siret}
                  fieldKey="siret"
                  copied={copied}
                  onCopy={copyField}
                />
                <CRMField
                  icon={<Hash size={14} />}
                  label="N° TVA"
                  value={d.tva}
                  fieldKey="tva"
                  copied={copied}
                  onCopy={copyField}
                />
              </div>

              <div className="crm-section-title">Facturation</div>
              <div className="crm-grid">
                <CRMField
                  icon={<FileText size={14} />}
                  label="Montant HT"
                  value={d.montant_ht ? `${d.montant_ht} €` : null}
                  fieldKey="montant_ht"
                  copied={copied}
                  onCopy={copyField}
                />
                <CRMField
                  icon={<FileText size={14} />}
                  label="Montant TTC"
                  value={d.montant_ttc ? `${d.montant_ttc} €` : null}
                  fieldKey="montant_ttc"
                  copied={copied}
                  onCopy={copyField}
                />
                <CRMField
                  icon={<RefreshCw size={14} />}
                  label="Date d'émission"
                  value={d.date_emission ? new Date(d.date_emission).toLocaleDateString("fr-FR") : null}
                  fieldKey="date_emission"
                  copied={copied}
                  onCopy={copyField}
                />
                <CRMField
                  icon={<RefreshCw size={14} />}
                  label="Date d'expiration"
                  value={d.date_expiration ? new Date(d.date_expiration).toLocaleDateString("fr-FR") : null}
                  fieldKey="date_expiration"
                  copied={copied}
                  onCopy={copyField}
                  warn={d.date_expiration && new Date(d.date_expiration) < new Date()}
                />
              </div>

              <div className="crm-section-title">Conformité</div>
              <div className="crm-flags">
                <Flag ok={selected.verification_flags?.sirene_valid} label="SIRET SIRENE valide" />
                <Flag ok={selected.verification_flags?.date_valid} label="Date valide" />
                <Flag ok={selected.verification_flags?.siret_match} label="SIRET cohérent" />
              </div>

              <div className="crm-section-title">Document source</div>
              <div className="crm-source">
                <FileText size={14} color="var(--accent)" />
                <span>{selected.name}</span>
                <span className="badge badge-neutral">{TYPE_LABELS[selected.type] || selected.type}</span>
                <span style={{ color: "var(--text-muted)", fontSize: "0.78rem", marginLeft: "auto" }}>
                  {new Date(selected.created_at).toLocaleDateString("fr-FR")}
                </span>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CRMField({ icon, label, value, fieldKey, copied, onCopy, warn }) {
  return (
    <div className="crm-field">
      <label className="crm-label">
        {icon} {label}
      </label>
      <div className="crm-input-wrapper">
        <input
          readOnly
          value={value || "—"}
          style={warn ? { color: "#f59e0b", fontWeight: 600 } : {}}
        />
        {value && value !== "—" && (
          <button className="crm-copy-btn" onClick={() => onCopy(value, fieldKey)}>
            {copied === fieldKey ? <CheckCircle size={13} color="var(--success)" /> : <Copy size={13} />}
          </button>
        )}
      </div>
    </div>
  );
}

function Flag({ ok, label }) {
  if (ok === undefined || ok === null) return null;
  return (
    <span className={`badge ${ok ? "badge-success" : "badge-error"}`}>
      {ok ? <CheckCircle size={11} /> : null}
      {label}
    </span>
  );
}
