# DocuFlow (Hackathon) — Lancement

Ce dépôt contient 4 services :
- MongoDB (base de données)
- API backend (Node/Express)
- API OCR/IA (Flask)
- Frontend (React/Vite)

## Lancer avec Docker (recommandé)

Pré-requis : Docker Desktop installé et démarré.

Depuis le dossier `hkt-frontend/` (là où se trouve `docker-compose.yml`) :

```bash
docker compose up --build
```

URLs par défaut :
- Frontend : http://localhost:5173
- Backend API : http://localhost:3000 (test : http://localhost:3000/health)
- OCR/IA : http://localhost:8000
- MongoDB : localhost:27017

Compte admin (créé automatiquement au démarrage de l’API) :
- Email : admin@docuflow.local
- Mot de passe : Admin123!

Arrêter :

```bash
docker compose down
```

## Lancer en local (sans Docker)

Pré-requis :
- Node.js 20+
- Python 3.11+
- MongoDB (local)
- Tesseract OCR (avec le pack français)

### 1) MongoDB

Démarrer MongoDB en local (port par défaut 27017).

### 2) API OCR/IA (Flask)

Dans `document-classifier/` :

```bash
pip install -r requirements.txt
python flask_api.py
```

L’API écoute sur : http://127.0.0.1:8000

### 3) Backend (Node/Express)

Dans `hkt-backend/` :

```bash
npm install
```

Puis lancer avec les variables d’environnement (PowerShell) :

```powershell
$env:MONGO_URI="mongodb://127.0.0.1:27017/hkt"
$env:JWT_SECRET="dev_secret"
$env:DOCUMENT_CLASSIFIER_URL="http://127.0.0.1:8000"
$env:ADMIN_EMAIL="admin@docuflow.local"
$env:ADMIN_PASSWORD="Admin123!"
npm run dev
```

L’API écoute sur : http://127.0.0.1:3000

### 4) Frontend (React/Vite)

Dans `hkt-frontend/` :

```bash
npm install
```

Puis lancer (PowerShell) :

```powershell
$env:VITE_API_URL="http://127.0.0.1:3000"
npm run dev -- --host 0.0.0.0 --port 5173
```

Le front est accessible sur : http://localhost:5173

## Zipper et envoyer

Oui, tu peux zipper et envoyer le projet.
- À zipper : le dossier `hkt-frontend/` (il contient le compose, le backend, le front et le classifier).
- À éviter dans le zip : `node_modules/`, environnements virtuels Python, caches.

