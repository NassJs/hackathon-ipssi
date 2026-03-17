```bash
cp env.sample .env
```

```bash
docker compose up --build
```

### Démarrer en dev (hot reload dans Docker)
```bash
cp env.sample .env
docker compose -f docker-compose.dev.yml up --build
```