import { useState } from "react";
import { User, Mail, Shield, Calendar, Key, CheckCircle } from "lucide-react";

function formatDate(dateString) {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleString("fr-FR", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function ProfilePage({ me }) {
  const [copied, setCopied] = useState(false);

  function copyId() {
    navigator.clipboard.writeText(me?._id || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!me) return (
    <div className="content-area">
      <div className="panel glass empty-state">Chargement du profil...</div>
    </div>
  );

  return (
    <div className="content-area">
      <div className="split-grid">

        <div className="panel glass">
          <div className="profile-avatar">
            <div className="avatar-circle">
              {me.first_name?.[0]}{me.last_name?.[0]}
            </div>
            <div>
              <h2 className="profile-name">{me.first_name} {me.last_name}</h2>
              <span className={`badge ${me.admin ? "badge-warning" : "badge-success"}`}>
                <Shield size={11} />
                {me.admin ? "Administrateur" : "Membre"}
              </span>
            </div>
          </div>

          <div className="result-fields" style={{ marginTop: 20 }}>
            <div className="field-row">
              <span><Mail size={13} /> Email</span>
              <strong>{me.email}</strong>
            </div>
            <div className="field-row">
              <span><User size={13} /> Prénom</span>
              <strong>{me.first_name}</strong>
            </div>
            <div className="field-row">
              <span><User size={13} /> Nom</span>
              <strong>{me.last_name}</strong>
            </div>
            <div className="field-row">
              <span><Calendar size={13} /> Membre depuis</span>
              <strong>{formatDate(me.created_at)}</strong>
            </div>
            <div className="field-row">
              <span><Key size={13} /> ID utilisateur</span>
              <button className="btn" style={{ fontSize: "0.72rem", padding: "3px 8px" }} onClick={copyId}>
                {copied ? <><CheckCircle size={11} /> Copié</> : me._id?.slice(-8) + "..."}
              </button>
            </div>
          </div>
        </div>

        <div className="panel glass">
          <div className="panel-title">Sécurité du compte</div>
          <div className="result-fields">
            <div className="field-row">
              <span>Authentification</span>
              <span className="badge badge-success"><CheckCircle size={11} /> JWT actif</span>
            </div>
            <div className="field-row">
              <span>Mot de passe</span>
              <span className="badge badge-neutral">Hashé (bcrypt)</span>
            </div>
            <div className="field-row">
              <span>Rôle</span>
              <span className={`badge ${me.admin ? "badge-warning" : "badge-success"}`}>
                {me.admin ? "Admin" : "Membre"}
              </span>
            </div>
          </div>

          <div className="panel-title" style={{ marginTop: 20 }}>Informations session</div>
          <div className="result-fields">
            <div className="field-row">
              <span>Token</span>
              <span className="badge badge-success"><CheckCircle size={11} /> Valide</span>
            </div>
            <div className="field-row">
              <span>Stockage</span>
              <span className="badge badge-neutral">localStorage</span>
            </div>
            <div className="field-row">
              <span>Expiration</span>
              <span className="badge badge-neutral">7 jours</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
