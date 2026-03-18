import base64
import io
from typing import List

from PIL import Image

try:
    import pytesseract
except Exception:
    pytesseract = None

try:
    import fitz  # PyMuPDF
except Exception:
    fitz = None

try:
    from pdf2image import convert_from_bytes
except Exception:
    convert_from_bytes = None


def _strip_data_url(value: str) -> str:
    if "," in value and value.strip().lower().startswith("data:"):
        return value.split(",", 1)[1]
    return value


def _is_pdf(data: bytes) -> bool:
    return data.startswith(b"%PDF-")


def _ocr_images(images: List[Image.Image]) -> str:
    if pytesseract is None:
        raise RuntimeError("pytesseract n'est pas installé. Faites: pip install pytesseract")
    texts = []
    for img in images:
        # OCR simple en français
        text = pytesseract.image_to_string(img, lang="fra", config="--oem 1 --psm 6")
        texts.append(text.strip())
    return "\n\n".join([t for t in texts if t])


def _images_from_pdf(data: bytes) -> List[Image.Image]:
    # 1) PyMuPDF (si dispo)
    if fitz is not None:
        doc = fitz.open(stream=data, filetype="pdf")
        images = []
        for page in doc:
            pix = page.get_pixmap(dpi=300)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            images.append(img)
        return images

    # 2) pdf2image fallback
    if convert_from_bytes is not None:
        return convert_from_bytes(data, dpi=300)

    raise RuntimeError(
        "Aucun moteur PDF disponible. Installez PyMuPDF (fitz) ou pdf2image."
    )


def extract_text(image_base64: str) -> str:
    normalized = image_base64.strip()
    if not normalized:
        return ""

    raw = base64.b64decode(_strip_data_url(normalized), validate=False)

    if _is_pdf(raw):
        images = _images_from_pdf(raw)
        return _ocr_images(images)

    # Image classique
    image = Image.open(io.BytesIO(raw))
    return _ocr_images([image])
