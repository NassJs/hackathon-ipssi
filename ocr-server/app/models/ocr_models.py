from typing import List, Optional

from pydantic import BaseModel, Field


class OCRDocumentInput(BaseModel):
    id: Optional[str] = Field(None, description="Optional document id for tracking.")
    image_base64: str = Field(..., description="Image or PDF encoded as base64 string.")


class OCRRequest(BaseModel):
    documents: List[OCRDocumentInput]


class OCRDocumentResult(BaseModel):
    id: Optional[str] = None
    text: str


class OCRResponse(BaseModel):
    results: List[OCRDocumentResult]
