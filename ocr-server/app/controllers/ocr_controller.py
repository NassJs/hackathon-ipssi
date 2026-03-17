from fastapi import APIRouter

try:
    from app.models.ocr_models import OCRRequest, OCRResponse
    from app.services.ocr_service import extract_text
except ModuleNotFoundError:
    # Support imports when launched from inside `app/`.
    from models.ocr_models import OCRRequest, OCRResponse
    from services.ocr_service import extract_text

router = APIRouter(tags=["ocr"])


@router.post("/ocr", response_model=OCRResponse)
def ocr(payload: OCRRequest) -> OCRResponse:
    text = extract_text(payload.image_base64)
    return OCRResponse(text=text)
