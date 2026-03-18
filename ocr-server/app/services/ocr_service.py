def extract_text(image_base64: str) -> str:
    """Placeholder OCR logic.

    Replace this implementation with a real OCR engine integration.
    """
    normalized = image_base64.strip()
    if not normalized:
        return ""
    return f"OCR not implemented yet (input_size={len(normalized)} chars)."
