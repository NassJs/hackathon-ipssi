# ocr-server

Service Python FastAPI basé sur Python `3.14.3`.

## Prérequis

- Python `3.14.3`

## Installation

```bash
python -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install -e .
```

## Lancement en local

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

## Endpoint de vérification

- `GET /health`
