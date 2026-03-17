## hkt-backend (Node.js + Express + MongoDB + Docker)

### Prérequis
- Docker + Docker Compose

### Démarrer (containers Docker)
- Copie la config d’exemple:

```bash
cp env.sample .env
```

- Lance l’API + Mongo:

```bash
docker compose up --build
```

### Démarrer en dev (hot reload dans Docker)
```bash
cp env.sample .env
docker compose -f docker-compose.dev.yml up --build
```

### Endpoints utiles
- **Health**: `GET /health`
- **Lister users**: `GET /users`
- **Créer user**: `POST /users` (JSON: `{ "email": "...", "name": "..." }`)

Exemple:

```bash
curl -s http://localhost:3000/health | jq
curl -s http://localhost:3000/users | jq
curl -s -X POST http://localhost:3000/users \
  -H 'content-type: application/json' \
  -d '{"email":"alice@example.com","name":"Alice"}' | jq
```

### Dev sans Docker (optionnel)
- Installe:

```bash
npm install
```

- Lance Mongo (local) et exporte `MONGO_URI`, ou adapte dans `.env`, puis:

```bash
npm run dev
```

