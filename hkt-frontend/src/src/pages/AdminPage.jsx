import { useEffect, useState } from "react";
import {
  Users, FileText, TrendingUp, Shield, Trash2,
  Crown, RefreshCw, AlertCircle, BarChart2
} from "lucide-react";
import { getAdminStats, getAdminUsers, promoteToAdmin, deleteUser } from "../api";

const TYPE_LABELS = {
  facture: "Facture", devis: "Devis", attestation: "Attestation",
  kbis: "Kbis", rib: "RIB", autre: "Autre",
};

const STATUS_LABELS = {
  pending: "En attente", processing: "En cours",
  validated: "Validé", error: "Erreur",
};

const STATUS_COLORS = {
  pending: "badge-neutral", processing: "badge-warning",
  validated: "badge-success", error: "badge-error",
};

function formatDate(d) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

export default function AdminPage({ token, me }) {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [statsRes, usersRes] = await Promise.all([
        getAdminStats(token),
        getAdminUsers(token),
      ]);
      setStats(statsRes.stats);
      setUsers(usersRes.users || []);
    } catch {
      setError("Accès refusé ou erreur serveur. Vous devez être admin.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handlePromote(userId) {
    if (!confirm("Promouvoir cet utilisateur en admin ?")) return;
    try {
      await promoteToAdmin(token, userId);
      load();
    } catch { setError("Erreur lors de la promotion."); }
  }

  async function handleDelete(userId) {
    if (!confirm("Supprimer cet utilisateur et tous ses documents ?")) return;
    try {
      await deleteUser(token, userId);
      setUsers(prev => prev.filter(u => u._id !== userId));
    } catch { setError("Erreur lors de la suppression."); }
  }

  if (loading) return (
    <div className="content-area">
      <div className="panel empty-state">Chargement des données admin...</div>
    </div>
  );

  if (error) return (
    <div className="content-area">
      <div className="error-box"><AlertCircle size={16} /> {error}</div>
    </div>
  );

  return (
    <div className="content-area">

      {/* Stats globales */}
      <div className="stats-grid">
        <div className="stat-card stat-card--blue">
          <div className="stat-card-icon"><Users size={20} /></div>
          <div className="stat-label">Total utilisateurs</div>
          <div className="stat-value">{stats?.users_total ?? 0}</div>
          <span className="badge badge-neutral">inscrits</span>
        </div>

        <div className="stat-card stat-card--purple">
          <div className="stat-card-icon"><FileText size={20} /></div>
          <div className="stat-label">Total documents</div>
          <div className="stat-value">{stats?.documents_total ?? 0}</div>
          <span className="badge badge-neutral">uploadés</span>
        </div>

        <div className="stat-card stat-card--green">
          <div className="stat-card-icon"><TrendingUp size={20} /></div>
          <div className="stat-label">Docs / utilisateur</div>
          <div className="stat-value">{stats?.documents_per_user_avg ?? 0}</div>
          <span className="badge badge-neutral">moyenne</span>
        </div>

        <div className="stat-card stat-card--indigo">
          <div className="stat-card-icon"><BarChart2 size={20} /></div>
          <div className="stat-label">Types de docs</div>
          <div className="stat-value">{stats?.documents_by_type?.length ?? 0}</div>
          <span className="badge badge-neutral">catégories</span>
        </div>
      </div>

      {/* Répartition docs */}
      {stats && (
        <div className="split-grid">
          <div className="panel">
            <div className="panel-title"><FileText size={16} /> Documents par type</div>
            {stats.documents_by_type?.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: "0.88rem" }}>Aucun document.</p>
            ) : (
              <div className="bar-list">
                {stats.documents_by_type?.map((item) => (
                  <div key={item.type} className="bar-item">
                    <span className="bar-label">{TYPE_LABELS[item.type] || item.type}</span>
                    <div className="bar-track">
                      <div
                        className="bar-fill"
                        style={{ width: `${(item.count / stats.documents_total) * 100}%` }}
                      />
                    </div>
                    <span className="bar-count">{item.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="panel">
            <div className="panel-title"><BarChart2 size={16} /> Statuts des documents</div>
            {stats.documents_by_status?.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: "0.88rem" }}>Aucun document.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {stats.documents_by_status?.map((item) => (
                  <div key={item.status} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className={`badge ${STATUS_COLORS[item.status] || "badge-neutral"}`}>
                      {STATUS_LABELS[item.status] || item.status}
                    </span>
                    <strong style={{ fontSize: "0.9rem" }}>{item.count}</strong>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Gestion utilisateurs */}
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title"><Shield size={16} /> Gestion des utilisateurs</div>
          <button className="btn" onClick={load}><RefreshCw size={14} /> Actualiser</button>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Nom</th>
                <th>Email</th>
                <th>Rôle</th>
                <th>Inscrit le</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user._id}>
                  <td style={{ fontWeight: 600 }}>{user.first_name} {user.last_name}</td>
                  <td style={{ color: "var(--text-soft)", fontSize: "0.88rem" }}>{user.email}</td>
                  <td>
                    <span className={`badge ${user.admin ? "badge-warning" : "badge-neutral"}`}>
                      {user.admin ? <Crown size={11} /> : <Users size={11} />}
                      {user.admin ? "Admin" : "Membre"}
                    </span>
                  </td>
                  <td style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>{formatDate(user.created_at)}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      {!user.admin && (
                        <button className="btn" title="Promouvoir admin" onClick={() => handlePromote(user._id)}>
                          <Crown size={13} />
                        </button>
                      )}
                      {me?._id !== user._id && (
                        <button className="btn" title="Supprimer" style={{ color: "var(--error)" }} onClick={() => handleDelete(user._id)}>
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
