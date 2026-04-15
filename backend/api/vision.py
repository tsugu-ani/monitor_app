from fastapi import APIRouter, File, HTTPException, UploadFile

from models.schemas import AnalyzeResponse
from services.claude_service import analyze_image
from services.image_service import validate_and_process

router = APIRouter()


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze(file: UploadFile = File(...)):
    image_bytes = await file.read()
    content_type = file.content_type or "image/jpeg"

    try:
        base64_data, media_type = validate_and_process(image_bytes, content_type)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        vital_data = analyze_image(base64_data, media_type)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"解析エラー: {e}")

    return AnalyzeResponse(success=True, data=vital_data)
