from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from models.schemas import AnalyzeResponse, VitalRecord
from services.claude_service import analyze_image
from services.db_service import get_records, save_record
from services.image_service import validate_and_process
from services.monitor_skills import MONITOR_OPTIONS

router = APIRouter()


@router.get("/monitors")
def list_monitors():
    """利用可能なモニター種別の一覧を返す。"""
    return {"monitors": MONITOR_OPTIONS}


@router.get("/records", response_model=list[VitalRecord])
def list_records(limit: int = 50):
    """撮影記録を新しい順で返す。"""
    return get_records(limit=min(limit, 200))


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

    # DB 保存（失敗しても解析結果は返す）
    saved = save_record(result.resolved_monitor_type or None, result.vital_data)

    return AnalyzeResponse(
        success=True,
        data=result.vital_data,
        monitor_type=result.resolved_monitor_type or None,
        auto_detected=result.auto_detected,
        record_saved_at=saved["recorded_at"] if saved else None,
    )
