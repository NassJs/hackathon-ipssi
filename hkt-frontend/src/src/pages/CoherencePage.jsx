import { Fragment, useEffect, useState } from "react";
import { FileText, RefreshCw, ShieldCheck, AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { getCoherenceGroups } from "../api";

function StatusBadge({ status }) {
  if (status === "conforme") return <span className="badge badge-success">Conforme</span>;
  if (status === "a_verifier") return <span className="badge badge-warning">À vérifier</span>;
  if (status === "non_conforme") return <span className="badge badge-error">Non conforme</span>;
  return <span className="badge badge-neutral">{status || "—"}</span>;
}

export default function CoherencePage({ token }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [groups, setGroups] = useState([]);
  const [expanded, setExpanded] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await getCoherenceGroups(token);
      setGroups(res.groups || []);
    } catch {
      setError("Impossible de charger l'historique des cohérences.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [token]);

  return (
    <div className="content-area">
      <div className="panel glass">
        <div className="panel-header">
          <div className="panel-title"><ShieldCheck size={16} /> Historique des cohérences</div>
          <button className="btn" onClick={load}><RefreshCw size={14} /> Actualiser</button>
        </div>

        {error && (
          <div className="error-box">
            <AlertTriangle size={16} /> {error}
          </div>
        )}

        {loading ? (
          <div className="empty-state">Chargement...</div>
        ) : groups.length === 0 ? (
          <div className="empty-state">
            <FileText size={28} color="var(--text-muted)" />
            <p>Aucun dossier cohérence.</p>
            <p style={{ fontSize: "0.82rem" }}>Uploadez et analysez plusieurs documents dans un même dossier.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Dossier</th>
                  <th>Statut</th>
                  <th>Docs</th>
                  <th>Détails</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => {
                  const isOpen = expanded === g.dossier_id;
                  return (
                    <Fragment key={g.dossier_id}>
                      <tr key={g.dossier_id} style={{ cursor: "pointer" }} onClick={() => setExpanded((prev) => (prev === g.dossier_id ? "" : g.dossier_id))}>
                        <td><strong>{g.dossier_id}</strong></td>
                        <td><StatusBadge status={g.status} /></td>
                        <td>{Array.isArray(g.documents) ? g.documents.length : 0}</td>
                        <td>{isOpen ? "Masquer" : "Voir"}</td>
                      </tr>
                      {isOpen && (
                        <tr key={`${g.dossier_id}-details`}>
                          <td colSpan={4}>
                            <div className="split-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
                              <div className="panel glass" style={{ margin: 0 }}>
                                <div className="panel-title">Alertes</div>
                                <div className="alerts-list">
                                  {(g.errors || []).map((e, idx) => (
                                    <div key={`e-${idx}`} className="alert-item" style={{ background: "#fef2f2", borderColor: "#fca5a5" }}>
                                      <div className="alert-icon"><XCircle size={16} color="#ef4444" /></div>
                                      <div className="alert-body">
                                        <span className="alert-doc">{e.code}</span>
                                        <span className="alert-msg" style={{ color: "#991b1b" }}>{e.message}</span>
                                      </div>
                                    </div>
                                  ))}
                                  {(g.warnings || []).map((w, idx) => (
                                    <div key={`w-${idx}`} className="alert-item" style={{ background: "#fffbeb", borderColor: "#fcd34d" }}>
                                      <div className="alert-icon"><AlertTriangle size={16} color="#f59e0b" /></div>
                                      <div className="alert-body">
                                        <span className="alert-doc">{w.code}</span>
                                        <span className="alert-msg" style={{ color: "#92400e" }}>{w.message}</span>
                                      </div>
                                    </div>
                                  ))}
                                  {(g.errors || []).length === 0 && (g.warnings || []).length === 0 && (
                                    <div className="empty-state" style={{ padding: 14 }}>
                                      <CheckCircle size={24} color="var(--success)" />
                                      <p style={{ color: "var(--success)", fontWeight: 600 }}>Tout est conforme</p>
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="panel glass" style={{ margin: 0 }}>
                                <div className="panel-title">Documents du dossier</div>
                                <div className="doc-select-list">
                                  {(g.documents || []).map((d) => (
                                    <div key={d.id} className="doc-select-item">
                                      <div className="doc-select-icon">
                                        <FileText size={14} />
                                      </div>
                                      <div>
                                        <div className="doc-select-name">{d.name}</div>
                                        <span className="badge badge-neutral" style={{ fontSize: "0.65rem" }}>{d.type}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
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
