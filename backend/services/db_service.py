"""
Supabase (PostgreSQL) へのデータ保存・取得サービス。
DATABASE_URL が設定されていない場合は DB 操作をスキップし、
解析フローを止めないよう全例外をログに留める。
"""
import logging
from contextlib import contextmanager
from typing import Optional

import psycopg2
import psycopg2.extras

from config import settings
from models.schemas import VitalData

logger = logging.getLogger(__name__)

# VitalData の全フィールド名（DB カラム名と一致）
_VITAL_FIELDS = list(VitalData.model_fields.keys())


@contextmanager
def _get_conn():
    """DB コネクションを取得するコンテキストマネージャ。"""
    conn = psycopg2.connect(
        settings.database_url,
        cursor_factory=psycopg2.extras.RealDictCursor,
    )
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def save_record(monitor_type: Optional[str], vital_data: VitalData) -> Optional[dict]:
    """バイタルデータを DB に保存する。

    Returns:
        {"id": str, "recorded_at": str (ISO 8601)} または None（未設定・エラー時）
    """
    if not settings.database_url:
        return None

    data = vital_data.model_dump()
    values = [data[f] for f in _VITAL_FIELDS]

    col_str = ", ".join(["monitor_type"] + _VITAL_FIELDS)
    ph_str = ", ".join(["%s"] * (len(_VITAL_FIELDS) + 1))
    sql = f"INSERT INTO vital_records ({col_str}) VALUES ({ph_str}) RETURNING id, recorded_at"

    try:
        with _get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, [monitor_type] + values)
                row = cur.fetchone()
        return {"id": str(row["id"]), "recorded_at": row["recorded_at"].isoformat()}
    except Exception as e:
        logger.error("DB保存エラー: %s", e)
        return None


def get_records(limit: int = 50) -> list[dict]:
    """最新のバイタル記録を返す。

    Returns:
        レコードのリスト（新しい順）。DATABASE_URL 未設定・エラー時は空リスト。
    """
    if not settings.database_url:
        return []

    sql = "SELECT * FROM vital_records ORDER BY recorded_at DESC LIMIT %s"

    try:
        with _get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, (limit,))
                rows = cur.fetchall()
        result = []
        for row in rows:
            r = dict(row)
            r["id"] = str(r["id"])
            r["recorded_at"] = r["recorded_at"].isoformat()
            result.append(r)
        return result
    except Exception as e:
        logger.error("DB取得エラー: %s", e)
        return []
