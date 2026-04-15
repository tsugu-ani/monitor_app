import json
import re

from anthropic import Anthropic

from config import settings
from models.schemas import VitalData

_client = Anthropic(api_key=settings.anthropic_api_key)

_PROMPT = """この画像は医療用の生体情報モニター（バイタルモニター・麻酔器等）の画面を撮影したものです。

画像から以下の17項目の数値を読み取り、JSONのみで返してください。

【必須ルール】
- 読み取れた項目: 数値のみ（単位は含めない）
- 読み取れなかった・画面に表示されていない項目: null
- 数値の推測・補完は絶対に行わない
- 返答はJSONのみ（説明文・コードブロック・マークダウン不要）

{
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
}"""

_VALID_KEYS = set(VitalData.model_fields.keys())


def analyze_image(base64_data: str, media_type: str) -> VitalData:
    message = _client.messages.create(
        model=settings.claude_model,
        max_tokens=1024,
        messages=[
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
                    {
                        "type": "text",
                        "text": _PROMPT,
                    },
                ],
            }
        ],
    )

    raw = message.content[0].text.strip()

    # コードブロックや前後テキストを除去してJSONを抽出
    json_match = re.search(r'\{[^{}]*\}', raw, re.DOTALL)
    if not json_match:
        raise ValueError(f"レスポンスからJSONを取得できませんでした: {raw[:200]}")

    parsed = json.loads(json_match.group())
    filtered = {k: v for k, v in parsed.items() if k in _VALID_KEYS}
    return VitalData(**filtered)
