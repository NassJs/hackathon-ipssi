from fastapi import APIRouter

try:
    from app.models.ocr_models import (
        OCRDocumentResult,
        OCRRequest,
        OCRResponse,
    )
    from app.services.ocr_service import extract_text
except ModuleNotFoundError:
    # Support imports when launched from inside `app/`.
    from models.ocr_models import (
        OCRDocumentResult,
        OCRRequest,
        OCRResponse,
    )
    from services.ocr_service import extract_text

router = APIRouter(tags=["ocr"])


@router.post("/ocr", response_model=OCRResponse)
def ocr(payload: OCRRequest) -> OCRResponse:
    results = []
    for doc in payload.documents:
        text = extract_text(doc.image_base64)
        results.append(OCRDocumentResult(id=doc.id, text=text))
    return OCRResponse(results=results)
