from fastapi import FastAPI

try:
    from app.controllers.ocr_controller import router as ocr_router
except ModuleNotFoundError:
    # Support running with `uvicorn main:app` from inside `app/`.
    from controllers.ocr_controller import router as ocr_router

app = FastAPI(
    title="OCR Server",
    version="0.1.0",
    description="FastAPI service for OCR workflows.",
)


app.include_router(ocr_router)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
