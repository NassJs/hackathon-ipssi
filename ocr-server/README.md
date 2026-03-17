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
cd ocr-server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Si vous lancez le serveur depuis le dossier `app/`, utilisez :

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## Endpoint de vérification

- `POST /ocr`

Exemple de payload JSON pour `/ocr` :

```json
{
  "image_base64": "iVBORw0KGgoAAAANSUhEUgAA..."
}
```
