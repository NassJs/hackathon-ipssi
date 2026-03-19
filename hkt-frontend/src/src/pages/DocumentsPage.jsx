import { useEffect, useState } from "react";
import { FileText, Trash2, Eye, RefreshCw, AlertCircle, CheckCircle, Clock, XCircle } from "lucide-react";
import { getDocuments, deleteDocument } from "../api";

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

const STATUS_CONFIG = {
  pending:    { label: "En attente",   color: "badge-neutral",  Icon: Clock },
  processing: { label: "En cours",     color: "badge-warning",  Icon: RefreshCw },
  validated:  { label: "Validé",       color: "badge-success",  Icon: CheckCircle },
  error:      { label: "Erreur",       color: "badge-error",    Icon: XCircle },
};

const CONFORMITY_CONFIG = {
  conforme: { label: "Conforme", color: "badge-success" },
  a_verifier: { label: "À vérifier", color: "badge-warning" },
  non_conforme: { label: "Non valide", color: "badge-error" },
};

function formatDate(dateString) {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleString("fr-FR", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function DocumentsPage({ token, onView }) {
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

  async function handleDelete(id) {
    if (!confirm("Supprimer ce document ?")) return;
    try {
      await deleteDocument(token, id);
      setDocuments((prev) => prev.filter((d) => d._id !== id));
    } catch {
      setError("Erreur lors de la suppression.");
    }
  }

  return (
    <div className="content-area">
      <div className="panel glass">
        <div className="panel-header">
          <div className="panel-title">Mes documents</div>
          <button className="btn" onClick={load}>
            <RefreshCw size={14} /> Actualiser
          </button>
        </div>

        {error && (
          <div className="error-box">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {loading ? (
          <div className="empty-state">Chargement...</div>
        ) : documents.length === 0 ? (
          <div className="empty-state">
            <FileText size={32} color="var(--text-soft)" />
            <p>Aucun document pour l'instant.</p>
            <p style={{ fontSize: "0.85rem", color: "var(--text-soft)" }}>
              Uploadez des documents depuis la page Upload.
            </p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Type</th>
                  <th>Statut</th>
                  <th>Conformité</th>
                  <th>SIRET</th>
                  <th>Montant TTC</th>
                  <th>Uploadé le</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => {
                  const status = STATUS_CONFIG[doc.status] || STATUS_CONFIG.pending;
                  const StatusIcon = status.Icon;
                  const conformityStatus = typeof doc.conformity?.status === "string" ? doc.conformity.status : null;
                  const conformity = (conformityStatus && CONFORMITY_CONFIG[conformityStatus]) || null;
                  return (
                    <tr key={doc._id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <FileText size={14} color="var(--accent)" />
                          <span style={{ fontSize: "0.88rem" }}>{doc.name}</span>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${TYPE_COLORS[doc.type] || "badge-neutral"}`}>
                          {TYPE_LABELS[doc.type] || doc.type}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${status.color}`}>
                          <StatusIcon size={11} />
                          {status.label}
                        </span>
                      </td>
                      <td>
                        {conformity ? (
                          <span className={`badge ${conformity.color}`}>{conformity.label}</span>
                        ) : (
                          <span className="badge badge-neutral">-</span>
                        )}
                      </td>
                      <td style={{ fontSize: "0.85rem" }}>
                        {doc.extracted_data?.siret || "-"}
                      </td>
                      <td style={{ fontSize: "0.85rem" }}>
                        {doc.extracted_data?.montant_ttc ? `${doc.extracted_data.montant_ttc} €` : "-"}
                      </td>
                      <td style={{ fontSize: "0.82rem", color: "var(--text-soft)" }}>
                        {formatDate(doc.created_at)}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button className="btn" title="Voir" onClick={() => onView && onView(doc)}>
                            <Eye size={13} />
                          </button>
                          <button
                            className="btn"
                            title="Supprimer"
                            style={{ color: "var(--error)" }}
                            onClick={() => handleDelete(doc._id)}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
