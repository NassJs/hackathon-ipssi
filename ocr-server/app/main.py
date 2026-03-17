from fastapi import FastAPI

app = FastAPI(
    title="OCR Server",
    version="0.1.0",
    description="FastAPI service for OCR workflows.",
)


@app.get("/")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
