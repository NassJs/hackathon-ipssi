from pydantic import BaseModel, Field


class OCRRequest(BaseModel):
    image_base64: str = Field(..., description="Image encoded as base64 string.")


class OCRResponse(BaseModel):
    text: str
