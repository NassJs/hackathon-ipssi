import { useEffect, useMemo, useState } from "react";
import { Building2, FileText, RefreshCw, CheckCircle, XCircle, Copy, Hash } from "lucide-react";
import { getDocuments } from "../api";

const TYPE_LABELS = {
  facture: "Facture",
  devis: "Devis",
  bon_commande: "Bon de commande",
  attestation: "Attestation",
  kbis: "Extrait Kbis",
  rib: "RIB",
  autre: "Autre",
};

export default function CRMPage({ token }) {
  const [documents, setDocuments] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await getDocuments(token);
      const docs = Array.isArray(res.documents) ? res.documents : [];
      setDocuments(docs);
      if (!selectedId && docs.length > 0) setSelectedId(docs[0]._id);
      if (selectedId && !docs.some((d) => d._id === selectedId) && docs.length > 0) setSelectedId(docs[0]._id);
    } catch {
      setError("Impossible de charger les documents.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [token]);

  const selectedDoc = useMemo(() => documents.find((d) => d._id === selectedId) || null, [documents, selectedId]);

  function formatMoney(value) {
    if (value === null || value === undefined || value === "") return "";
    const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
    if (Number.isNaN(n)) return String(value);
    return `${n.toFixed(2)} €`;
  }

  return (
    <div className="content-area">
      <div className="panel glass">
        <div className="panel-header">
          <div className="panel-title"><Building2 size={16} /> Espace CRM</div>
          <button className="btn" onClick={load}><RefreshCw size={14} /> Actualiser</button>
        </div>

        {error && <div className="error-box">{error}</div>}

        {loading ? (
          <div className="empty-state">Chargement...</div>
        ) : documents.length === 0 ? (
          <div className="empty-state">
            <FileText size={28} color="var(--text-muted)" />
            <p>Aucun document analysé.</p>
            <p style={{ fontSize: "0.82rem" }}>Uploadez et analysez des documents pour remplir cet espace.</p>
          </div>
        ) : (
          <div className="split-grid" style={{ gridTemplateColumns: "1fr 1.4fr" }}>
            <div className="panel glass" style={{ margin: 0 }}>
              <div className="panel-title">Documents</div>
              <div className="doc-select-list">
                {documents.map((doc) => {
                  const isActive = doc._id === selectedId;
                  const typeLabel = TYPE_LABELS[doc.type] || doc.type || "Document";
                  return (
                    <button
                      key={doc._id}
                      type="button"
                      className={`doc-select-item ${isActive ? "active" : ""}`}
                      onClick={() => setSelectedId(doc._id)}
                    >
                      <div className="doc-select-icon">
                        <FileText size={14} />
                      </div>
                      <div style={{ textAlign: "left" }}>
                        <div className="doc-select-name">{doc.name}</div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <span className="badge badge-neutral" style={{ fontSize: "0.65rem" }}>{typeLabel}</span>
                          {doc.dossier_id && (
                            <span className="badge badge-neutral" style={{ fontSize: "0.65rem" }}>
                              <Hash size={11} /> {doc.dossier_id}
                            </span>
                          )}
                          {doc.status === "validated" && (
                            <span className="badge badge-success" style={{ fontSize: "0.65rem" }}>
                              <CheckCircle size={11} /> analysé
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="panel glass" style={{ margin: 0 }}>
              <div className="panel-title">Informations extraites</div>
              {!selectedDoc ? (
                <div className="empty-state">Sélectionnez un document.</div>
              ) : (
                <>
                  <div className="input-row two">
                    <CRMField label="Type" value={TYPE_LABELS[selectedDoc.type] || selectedDoc.type} />
                    <CRMField label="Nom fichier" value={selectedDoc.name} />
                  </div>

                  <div className="input-row two">
                    <CRMField
                      label="SIRET"
                      value={selectedDoc.extracted_data?.siret}
                      action={selectedDoc.extracted_data?.siret ? (
                        <button className="btn btn-ghost" type="button" onClick={() => navigator.clipboard.writeText(String(selectedDoc.extracted_data.siret))}>
                          <Copy size={14} /> Copier
                        </button>
                      ) : null}
                    />
                    <CRMField
                      label="TVA"
                      value={selectedDoc.extracted_data?.tva}
                      action={selectedDoc.extracted_data?.tva ? (
                        <button className="btn btn-ghost" type="button" onClick={() => navigator.clipboard.writeText(String(selectedDoc.extracted_data.tva))}>
                          <Copy size={14} /> Copier
                        </button>
                      ) : null}
                    />
                  </div>

                  <div className="input-row two">
                    <CRMField label="Montant HT" value={formatMoney(selectedDoc.extracted_data?.montant_ht)} />
                    <CRMField label="Montant TTC" value={formatMoney(selectedDoc.extracted_data?.montant_ttc)} />
                  </div>

                  <div className="input-row two">
                    <CRMField
                      label="Date émission"
                      value={selectedDoc.extracted_data?.date_emission ? new Date(selectedDoc.extracted_data.date_emission).toLocaleDateString("fr-FR") : ""}
                      warn={!selectedDoc.extracted_data?.date_emission}
                    />
                    <CRMField
                      label="Date expiration"
                      value={selectedDoc.extracted_data?.date_expiration ? new Date(selectedDoc.extracted_data.date_expiration).toLocaleDateString("fr-FR") : ""}
                      warn={
                        selectedDoc.extracted_data?.date_expiration
                          ? new Date(selectedDoc.extracted_data.date_expiration) < new Date()
                          : false
                      }
                    />
                  </div>

                  <CRMField label="Adresse" value={selectedDoc.extracted_data?.adresse} />
                  <div className="input-row two">
                    <CRMField label="Email" value={selectedDoc.extracted_data?.email} />
                    <CRMField label="Téléphone" value={selectedDoc.extracted_data?.telephone} />
                  </div>

                  {selectedDoc.verification_flags && (
                    <div className="verif-flags" style={{ marginTop: 12 }}>
                      <Flag ok={selectedDoc.verification_flags.sirene_valid} label="SIRET valide" />
                      <Flag ok={selectedDoc.verification_flags.date_valid} label="Date valide" />
                      <Flag ok={selectedDoc.verification_flags.siret_match} label="SIRET cohérent" />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CRMField({ label, value, action, warn }) {
  return (
    <div className={`crm-field ${warn ? "crm-field--warn" : ""}`}>
      <div className="crm-field-label">{label}</div>
      <div className="crm-field-value">
        <span>{value || "—"}</span>
        {action}
      </div>
    </div>
  );
}

function Flag({ ok, label }) {
  if (ok === undefined || ok === null) return null;
  return (
    <span className={`badge ${ok ? "badge-success" : "badge-error"}`}>
      {ok ? <CheckCircle size={11} /> : <XCircle size={11} />}
      {label}
    </span>
  );
}
