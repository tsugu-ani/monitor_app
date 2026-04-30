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


def update_record(record_id: str, vital_data: VitalData) -> bool:
    """バイタルレコードを更新する。

    Returns:
        True: 更新成功、False: 対象なし・未設定・エラー時
    """
    if not settings.database_url:
        return False

    data = vital_data.model_dump()
    values = [data[f] for f in _VITAL_FIELDS]
    set_str = ", ".join([f"{f} = %s" for f in _VITAL_FIELDS])
    sql = f"UPDATE vital_records SET {set_str} WHERE id = %s"

    try:
        with _get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, values + [record_id])
                return cur.rowcount > 0
    except Exception as e:
        logger.error("DB更新エラー: %s", e)
        return False


def get_records(
    limit: int = 200,
    date: Optional[str] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
) -> list[dict]:
    """バイタル記録を返す。

    Args:
        limit: 最大取得件数
        date:  絞り込む日付（YYYY-MM-DD、JST基準）。None の場合は全件。
        start: 開始日時（ISO 8601）。end と同時指定で datetime 範囲フィルタ（ASC順）。
        end:   終了日時（ISO 8601）。

    Returns:
        レコードのリスト。DATABASE_URL 未設定・エラー時は空リスト。
    """
    if not settings.database_url:
        return []

    if start and end:
        sql = """
            SELECT * FROM vital_records
            WHERE recorded_at >= %s AND recorded_at <= %s
            ORDER BY recorded_at ASC
            LIMIT %s
        """
        params = (start, end, limit)
    elif date:
        # recorded_at は TIMESTAMPTZ のため JST (Asia/Tokyo) に変換してから日付比較
        sql = """
            SELECT * FROM vital_records
            WHERE DATE(recorded_at AT TIME ZONE 'Asia/Tokyo') = %s
            ORDER BY recorded_at DESC
            LIMIT %s
        """
        params = (date, limit)
    else:
        sql = "SELECT * FROM vital_records ORDER BY recorded_at DESC LIMIT %s"
        params = (limit,)

    try:
        with _get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, params)
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
