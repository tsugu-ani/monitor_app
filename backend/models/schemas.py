from pydantic import BaseModel
from typing import Optional


class VitalData(BaseModel):
    # 基本バイタル情報
    heart_rate: Optional[float] = None
    bp_systolic: Optional[float] = None
    bp_mean: Optional[float] = None
    bp_diastolic: Optional[float] = None
    respiratory_rate: Optional[float] = None
    spo2: Optional[float] = None
    etco2: Optional[float] = None
    body_temperature: Optional[float] = None
    # 呼吸器・麻酔器関連
    tidal_volume: Optional[float] = None
    minute_ventilation: Optional[float] = None
    peak_airway_pressure: Optional[float] = None
    iso_dial: Optional[float] = None
    iso_inspired: Optional[float] = None
    iso_expired: Optional[float] = None
    gas_flow_o2: Optional[float] = None
    gas_flow_air: Optional[float] = None
    fio2: Optional[float] = None
    # 人工呼吸器設定値
    set_respiratory_rate: Optional[float] = None
    set_inspiratory_pressure: Optional[float] = None
    inspiratory_time: Optional[float] = None
    peep: Optional[float] = None
    trigger_sensitivity: Optional[float] = None
    inspiratory_flow: Optional[float] = None
    # 患者情報（手入力）
    chart_number: Optional[int] = None
    patient_name: Optional[str] = None
    body_weight: Optional[float] = None
    # 補足
    notes: Optional[str] = None


class VitalRecord(VitalData):
    """DB から取得した1レコード。"""
    id: str
    recorded_at: str          # ISO 8601 形式
    monitor_type: Optional[str] = None
    patient_id: Optional[str] = None  # patients.id への参照


class VitalDataUpdate(VitalData):
    """PATCH /api/records/{id} 用。VitalData + 患者紐付け（patient_id）の更新を許可する。"""
    patient_id: Optional[str] = None


class AnalyzeResponse(BaseModel):
    success: bool
    data: Optional[VitalData] = None
    monitor_type: Optional[str] = None
    auto_detected: bool = False  # True: monitor_type が自動識別された
    record_saved_at: Optional[str] = None  # DB 保存時刻 (ISO 8601)
    record_id: Optional[str] = None        # DB 保存 UUID
    error: Optional[str] = None


class PatientBase(BaseModel):
    name: str
    chart_number: Optional[int] = None
    species: Optional[str] = None
    body_weight: Optional[float] = None


class PatientCreate(PatientBase):
    pass


class PatientUpdate(BaseModel):
    name: Optional[str] = None
    chart_number: Optional[int] = None
    species: Optional[str] = None
    body_weight: Optional[float] = None


class PatientRecord(PatientBase):
    id: str
    created_at: str
