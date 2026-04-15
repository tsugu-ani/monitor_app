import json
import re
from typing import NamedTuple

from anthropic import Anthropic

from config import settings
from models.schemas import VitalData
from services.monitor_skills import MONITOR_SKILLS

_client = Anthropic(api_key=settings.anthropic_api_key)

_BASE_PROMPT = """この画像は生体情報モニター（バイタルモニター・麻酔器等）の画面を撮影したものです。{monitor_hint}
画像から以下の17項目の数値を読み取り、JSONのみで返してください。

【必須ルール】
- 読み取れた項目: 数値のみ（単位は含めない）
- 読み取れなかった・画面に表示されていない項目: null
- 数値の推測・補完は絶対に行わない
- 返答はJSONのみ（説明文・コードブロック・マークダウン不要）

{{
  "heart_rate": <心拍数またはnull>,
  "bp_systolic": <血圧収縮期またはnull>,
  "bp_mean": <血圧平均またはnull>,
  "bp_diastolic": <血圧拡張期またはnull>,
  "respiratory_rate": <呼吸数またはnull>,
  "spo2": <SpO2またはnull>,
  "etco2": <EtCO2またはnull>,
  "body_temperature": <体温またはnull>,
  "tidal_volume": <1回換気量またはnull>,
  "minute_ventilation": <分時換気量またはnull>,
  "peak_airway_pressure": <最高気道内圧またはnull>,
  "iso_dial": <ISOダイヤル設定値またはnull>,
  "iso_inspired": <ISO吸気濃度またはnull>,
  "iso_expired": <ISO呼気濃度またはnull>,
  "gas_flow_o2": <O2流量またはnull>,
  "gas_flow_air": <Air流量またはnull>,
  "fio2": <FiO2またはnull>,
  "notes": <読み取り上の補足事項があれば文字列、なければnull>
}}"""

# 機種自動識別用プロンプト
_IDENTIFY_PROMPT = """この画像に映っているモニターの機種を判定してください。

以下から最も近い ID を1つ選び、JSONのみで返してください（説明不要）。

- "fukuda_am140": フクダエム・イー工業 Bio-Scope AM140（動物用生体モニター）
  特徴: 1画面構成。黒背景の横長画面。左側に複数の波形チャンネル（緑のECG・橙のSpO2等）、右側に大きなデジタル数値。最下部に細いサマリーバー。
- "drager_vista300": Dräger Vista 300 + 麻酔器（2画面構成）
  特徴: 2台の画面が横に並ぶ。左画面に「Dräger」ロゴと青いアクセントバー・"Vista 300"の文字。右画面は麻酔器で呼吸波形と円形アイコン。
- "generic": 上記以外、または判断できない場合

{"monitor_type": "<ID>"}"""

_VALID_KEYS = set(VitalData.model_fields.keys())


class AnalysisResult(NamedTuple):
    vital_data: VitalData
    resolved_monitor_type: str  # 実際に使用したモニター種別 ID
    auto_detected: bool          # 自動識別を行った場合 True


def _build_prompt(monitor_type: str = "") -> str:
    """モニター種別に応じたプロンプトを生成する。"""
    skill = MONITOR_SKILLS.get(monitor_type)
    if skill:
        monitor_hint = f"\n\n{skill['prompt_hint']}\n"
    else:
        monitor_hint = ""
    return _BASE_PROMPT.format(monitor_hint=monitor_hint)


def _make_image_message(base64_data: str, media_type: str, text: str) -> list:
    return [
        {
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": media_type,
                        "data": base64_data,
                    },
                },
                {"type": "text", "text": text},
            ],
        }
    ]


def _identify_monitor_type(base64_data: str, media_type: str) -> str:
    """画像からモニター種別を自動識別して ID を返す。識別できない場合は "" を返す。"""
    message = _client.messages.create(
        model=settings.claude_model,
        max_tokens=80,
        messages=_make_image_message(base64_data, media_type, _IDENTIFY_PROMPT),
    )
    raw = message.content[0].text.strip()
    m = re.search(r'"monitor_type"\s*:\s*"([^"]+)"', raw)
    if m:
        detected = m.group(1)
        # generic や未登録 ID は Skill なし（空文字）として扱う
        return detected if detected in MONITOR_SKILLS else ""
    return ""


def analyze_image(base64_data: str, media_type: str, monitor_type: str = "") -> AnalysisResult:
    """
    モニター画像を解析してバイタルデータを返す。
    monitor_type が空または "generic" の場合は機種を自動識別してから解析する。
    """
    auto_detected = False

    if not monitor_type or monitor_type == "generic":
        monitor_type = _identify_monitor_type(base64_data, media_type)
        auto_detected = True

    prompt = _build_prompt(monitor_type)

    message = _client.messages.create(
        model=settings.claude_model,
        max_tokens=1024,
        messages=_make_image_message(base64_data, media_type, prompt),
    )

    raw = message.content[0].text.strip()

    # コードブロックや前後テキストを除去してJSONを抽出
    json_match = re.search(r'\{[^{}]*\}', raw, re.DOTALL)
    if not json_match:
        raise ValueError(f"レスポンスからJSONを取得できませんでした: {raw[:200]}")

    parsed = json.loads(json_match.group())
    filtered = {k: v for k, v in parsed.items() if k in _VALID_KEYS}
    return AnalysisResult(
        vital_data=VitalData(**filtered),
        resolved_monitor_type=monitor_type,
        auto_detected=auto_detected,
    )
