from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from models.schemas import AnalyzeResponse
from services.claude_service import analyze_image
from services.image_service import validate_and_process
from services.monitor_skills import MONITOR_OPTIONS

router = APIRouter()


@router.get("/monitors")
def list_monitors():
    """利用可能なモニター種別の一覧を返す。"""
    return {"monitors": MONITOR_OPTIONS}


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze(
    file: UploadFile = File(...),
    monitor_type: str = Form(default=""),
):
    image_bytes = await file.read()
    content_type = file.content_type or "image/jpeg"

    try:
        base64_data, media_type = validate_and_process(image_bytes, content_type)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        result = analyze_image(base64_data, media_type, monitor_type)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"解析エラー: {e}")

    return AnalyzeResponse(
        success=True,
        data=result.vital_data,
        monitor_type=result.resolved_monitor_type or None,
        auto_detected=result.auto_detected,
    )
