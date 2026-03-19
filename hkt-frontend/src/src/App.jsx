import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Building2,
  Database,
  FileText,
  LogOut,
  Server,
  ShieldCheck,
  Sparkles,
  Upload,
  UserRoundPlus,
  Users
} from "lucide-react";
import { API_BASE_URL, getHealth, getMe, getUsers, login, register } from "./api";
import UploadPage from "./pages/UploadPage";
import DocumentsPage from "./pages/DocumentsPage";
import DocumentDetailPage from "./pages/DocumentDetailPage";
import ProfilePage from "./pages/ProfilePage";
import AdminPage from "./pages/AdminPage";
import CoherencePage from "./pages/CoherencePage";
import CRMPage from "./pages/CRMPage";

function formatDate(dateString) {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getStoredToken() {
  return localStorage.getItem("hkt_access_token") || "";
}

function saveToken(token) {
  localStorage.setItem("hkt_access_token", token);
}

function clearToken() {
  localStorage.removeItem("hkt_access_token");
}

function AuthForm({ mode, onSwitch, onSubmit, loading, error }) {
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    password: ""
  });

  const isRegister = mode === "register";

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    onSubmit(form);
  }

  return (
    <div className="auth-card glass">
      <div className="auth-head">
        <div className="brand-mark">
          <Sparkles size={18} />
        </div>
        <div>
          <h1>DocuFlow Pro</h1>
        </div>
      </div>

      <form className="auth-form" onSubmit={handleSubmit}>
        {isRegister && (
          <div className="input-row two">
            <input
              name="first_name"
              placeholder="Prénom"
              value={form.first_name}
              onChange={handleChange}
              required
            />
            <input
              name="last_name"
              placeholder="Nom"
              value={form.last_name}
              onChange={handleChange}
              required
            />
          </div>
        )}

        <div className="input-row">
          <input
            name="email"
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={handleChange}
            required
          />
        </div>

        <div className="input-row">
          <input
            name="password"
            type="password"
            placeholder="Mot de passe"
            value={form.password}
            onChange={handleChange}
            required
            minLength={6}
          />
        </div>

        {error && <p className="error-text">{error}</p>}

        <button className="btn btn-primary" disabled={loading} type="submit">
          {loading ? "Chargement..." : isRegister ? "Créer un compte" : "Se connecter"}
        </button>
      </form>

      <button className="btn btn-ghost" onClick={onSwitch}>
        {isRegister ? "Déjà un compte ? Se connecter" : "Pas de compte ? S'inscrire"}
      </button>
    </div>
  );
}

function Stats({ users, health }) {
  const admins = users.filter((user) => user.admin).length;

  return (
    <div className="stats-grid">
      <div className={`stat-card stat-card--${health.ok ? "green" : "red"}`}>
        <div className="stat-card-icon"><Server size={20} /></div>
        <div className="stat-label">Statut API</div>
        <div className="stat-value">{health.ok ? "UP" : "DOWN"}</div>
        <span className={`badge ${health.ok ? "badge-success" : "badge-error"}`}>
          Mongo {health.mongo}
        </span>
      </div>

      <div className="stat-card stat-card--blue">
        <div className="stat-card-icon"><Users size={20} /></div>
        <div className="stat-label">Utilisateurs</div>
        <div className="stat-value">{users.length}</div>
        <span className="badge badge-neutral">inscrits</span>
      </div>

      <div className="stat-card stat-card--purple">
        <div className="stat-card-icon"><ShieldCheck size={20} /></div>
        <div className="stat-label">Admins</div>
        <div className="stat-value">{admins}</div>
        <span className="badge badge-warning">accès complet</span>
      </div>

      <div className="stat-card stat-card--indigo">
        <div className="stat-card-icon"><Activity size={20} /></div>
        <div className="stat-label">Backend</div>
        <div className="stat-value small">{API_BASE_URL.replace("http://", "")}</div>
        <span className="badge badge-neutral">actif</span>
      </div>
    </div>
  );
}

function UsersTable({ users }) {
  return (
    <div className="panel glass">
      <div className="panel-title">Équipe synchronisée</div>
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Nom</th>
              <th>Email</th>
              <th>Rôle</th>
              <th>Créé le</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>
                  {user.first_name} {user.last_name}
                </td>
                <td>{user.email}</td>
                <td>
                  <span className={`badge ${user.admin ? "badge-warning" : "badge-success"}`}>
                    {user.admin ? "Admin" : "Membre"}
                  </span>
                </td>
                <td>{formatDate(user.created_at)}</td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="empty-row">
                  Aucun utilisateur pour l'instant.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function App() {
  const [token, setToken] = useState(getStoredToken());
  const [authMode, setAuthMode] = useState("login");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState("upload");
  const [selectedDoc, setSelectedDoc] = useState(null);

  const [health, setHealth] = useState({ ok: false, mongo: "down" });
  const [users, setUsers] = useState([]);
  const [me, setMe] = useState(null);
  const [loadingData, setLoadingData] = useState(true);
  const [dataError, setDataError] = useState("");

  const isLoggedIn = Boolean(token);

  async function loadPublicHealth() {
    try {
      const result = await getHealth();
      setHealth(result);
    } catch {
      setHealth({ ok: false, mongo: "down" });
    }
  }

  async function loadPrivateData(accessToken) {
    setLoadingData(true);
    setDataError("");
    try {
      const [meResult, usersResult, healthResult] = await Promise.all([
        getMe(accessToken),
        getUsers(accessToken),
        getHealth()
      ]);
      setMe(meResult.user);
      setUsers(usersResult.users || []);
      setHealth(healthResult);
    } catch (error) {
      if (String(error.message).includes("UNAUTHORIZED")) {
        handleLogout();
      } else {
        setDataError("Impossible de charger les données du backend.");
      }
    } finally {
      setLoadingData(false);
    }
  }

  useEffect(() => {
    if (isLoggedIn) {
      loadPrivateData(token);
    } else {
      setLoadingData(false);
      setMe(null);
      setUsers([]);
      loadPublicHealth();
    }
  }, [isLoggedIn, token]);

  async function handleAuthSubmit(form) {
    setAuthLoading(true);
    setAuthError("");
    try {
      const payload =
        authMode === "register"
          ? {
              first_name: form.first_name.trim(),
              last_name: form.last_name.trim(),
              email: form.email.trim(),
              password: form.password
            }
          : {
              email: form.email.trim(),
              password: form.password
            };

      const result = authMode === "register" ? await register(payload) : await login(payload);
      saveToken(result.access_token);
      setToken(result.access_token);
    } catch (error) {
      const code = String(error.message);
      if (code === "EMAIL_EXISTS") setAuthError("Cet email existe déjà.");
      else if (code === "INVALID_CREDENTIALS") setAuthError("Identifiants invalides.");
      else if (code === "MISSING_FIELDS") setAuthError("Merci de remplir tous les champs.");
      else setAuthError("Erreur serveur, réessaye.");
    } finally {
      setAuthLoading(false);
    }
  }

  function handleLogout() {
    clearToken();
    setToken("");
    setMe(null);
    setUsers([]);
  }

  const welcome = useMemo(() => {
    if (!me) return "Bienvenue";
    return `Bienvenue ${me.first_name}`;
  }, [me]);

  const showAdminOnlySidebar = Boolean(me?.admin) && currentPage === "admin";

  if (!isLoggedIn) {
    return (
      <div className="auth-layout">
        <div className="auth-bg" />
        <AuthForm
          mode={authMode}
          loading={authLoading}
          error={authError}
          onSubmit={handleAuthSubmit}
          onSwitch={() => setAuthMode((prev) => (prev === "login" ? "register" : "login"))}
        />
      </div>
    );
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo-dot" />
          <span>DocuFlow Pro</span>
        </div>

        <ul className="menu-list">
          {showAdminOnlySidebar ? (
            <li className={`menu-item ${currentPage === "admin" ? "active" : ""}`} onClick={() => setCurrentPage("admin")}>
              <ShieldCheck size={18} />
              <span>Admin</span>
            </li>
          ) : (
            <>
              <li className={`menu-item ${currentPage === "upload" ? "active" : ""}`} onClick={() => setCurrentPage("upload")}>
                <Upload size={18} />
                <span>Upload</span>
              </li>
              <li className={`menu-item ${currentPage === "documents" ? "active" : ""}`} onClick={() => { setCurrentPage("documents"); setSelectedDoc(null); }}>
                <FileText size={18} />
                <span>Documents</span>
              </li>
              <li className={`menu-item ${currentPage === "coherence" ? "active" : ""}`} onClick={() => setCurrentPage("coherence")}>
                <ShieldCheck size={18} />
                <span>Cohérence</span>
              </li>
              <li className={`menu-item ${currentPage === "crm" ? "active" : ""}`} onClick={() => setCurrentPage("crm")}>
                <Building2 size={18} />
                <span>CRM</span>
              </li>
              <li className={`menu-item ${currentPage === "profile" ? "active" : ""}`} onClick={() => setCurrentPage("profile")}>
                <Users size={18} />
                <span>Mon profil</span>
              </li>
              {me?.admin && (
                <li className={`menu-item ${currentPage === "admin" ? "active" : ""}`} onClick={() => setCurrentPage("admin")}>
                  <ShieldCheck size={18} />
                  <span>Admin</span>
                </li>
              )}
            </>
          )}
        </ul>

        <button className="btn btn-logout" onClick={handleLogout}>
          <LogOut size={16} />
          Se déconnecter
        </button>
      </aside>

      <main className="main-content">
        <header className="header glass">
          <div>
            <h2>{welcome}</h2>
          </div>
          <div className="header-badges">
            <span className="badge badge-neutral">
              <Server size={12} /> API
            </span>
            <span className={`badge ${health.mongo === "up" ? "badge-success" : "badge-error"}`}>
              <Database size={12} /> Mongo {health.mongo}
            </span>
            <button className="btn" onClick={() => loadPrivateData(token)}>
              <Activity size={14} /> Refresh
            </button>
          </div>
        </header>

        <div className="content-area">
          {currentPage === "upload" ? (
            <UploadPage token={token} />
          ) : currentPage === "documents" && selectedDoc ? (
            <DocumentDetailPage doc={selectedDoc} onBack={() => setSelectedDoc(null)} />
          ) : currentPage === "documents" ? (
            <DocumentsPage token={token} onView={(doc) => setSelectedDoc(doc)} />
          ) : currentPage === "coherence" ? (
            <CoherencePage token={token} />
          ) : currentPage === "crm" ? (
            <CRMPage token={token} />
          ) : currentPage === "profile" ? (
            <ProfilePage me={me} />
          ) : currentPage === "admin" ? (
            <AdminPage token={token} me={me} />
          ) : loadingData ? (
            <div className="panel glass">Chargement des données backend...</div>
          ) : (
            <>
              {dataError && <div className="panel error-panel">{dataError}</div>}

              <Stats users={users} health={health} />

              <div className="split-grid">
                <UsersTable users={users} />

                <div className="panel glass">
                  <div className="panel-title">Actions rapides</div>
                  <div className="quick-actions">
                    <button className="btn btn-primary" onClick={() => setCurrentPage("upload")}>
                      <Upload size={14} /> Uploader un document
                    </button>
                    <p>
                      Endpoint backend actif : <strong>{API_BASE_URL}</strong>
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
