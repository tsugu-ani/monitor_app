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
    # 補足
    notes: Optional[str] = None


class AnalyzeResponse(BaseModel):
    success: bool
    data: Optional[VitalData] = None
    monitor_type: Optional[str] = None
    auto_detected: bool = False  # True: monitor_type が自動識別された
    error: Optional[str] = None
