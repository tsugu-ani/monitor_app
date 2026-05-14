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

_PATIENT_FIELDS = ['name', 'chart_number', 'species', 'body_weight']


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


def save_record(
    monitor_type: Optional[str],
    vital_data: VitalData,
    patient_id: Optional[str] = None,
) -> Optional[dict]:
    """バイタルデータを DB に保存する。

    Returns:
        {"id": str, "recorded_at": str (ISO 8601)} または None（未設定・エラー時）
    """
    if not settings.database_url:
        return None

    data = vital_data.model_dump()
    values = [data[f] for f in _VITAL_FIELDS]

    col_str = ", ".join(["monitor_type", "patient_id"] + _VITAL_FIELDS)
    ph_str = ", ".join(["%s"] * (len(_VITAL_FIELDS) + 2))
    sql = f"INSERT INTO vital_records ({col_str}) VALUES ({ph_str}) RETURNING id, recorded_at"

    try:
        with _get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, [monitor_type, patient_id or None] + values)
                row = cur.fetchone()
        return {"id": str(row["id"]), "recorded_at": row["recorded_at"].isoformat()}
    except Exception as e:
        logger.error("DB保存エラー: %s", e)
        return None


def update_record(
    record_id: str,
    vital_data: VitalData,
    patient_id: Optional[str] = None,
) -> bool:
    """バイタルレコードを更新する。

    Args:
        record_id:  更新対象レコードの UUID
        vital_data: 全 VitalData フィールドを上書きする値
        patient_id: 紐付け患者 UUID（None で紐付け解除）

    Returns:
        True: 更新成功、False: 対象なし・未設定・エラー時
    """
    if not settings.database_url:
        return False

    data = vital_data.model_dump()
    values = [data[f] for f in _VITAL_FIELDS]
    set_str = ", ".join([f"{f} = %s" for f in _VITAL_FIELDS] + ["patient_id = %s"])
    sql = f"UPDATE vital_records SET {set_str} WHERE id = %s"

    try:
        with _get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, values + [patient_id or None, record_id])
                return cur.rowcount > 0
    except Exception as e:
        logger.error("DB更新エラー: %s", e)
        return False


def delete_record(record_id: str) -> bool:
    """バイタルレコードを削除する。

    Returns:
        True: 削除成功、False: 対象なし・未設定・エラー時
    """
    if not settings.database_url:
        return False

    try:
        with _get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM vital_records WHERE id = %s", (record_id,))
                return cur.rowcount > 0
    except Exception as e:
        logger.error("DB削除エラー: %s", e)
        return False


def get_records(
    limit: int = 200,
    date: Optional[str] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
    patient_id: Optional[str] = None,
) -> list[dict]:
    """バイタル記録を返す。

    Args:
        limit:      最大取得件数
        date:       絞り込む日付（YYYY-MM-DD、JST基準）。None の場合は全件。
        start:      開始日時（ISO 8601）。end と同時指定で datetime 範囲フィルタ（ASC順）。
        end:        終了日時（ISO 8601）。
        patient_id: 患者 UUID。指定時は当該患者の記録のみを返す。

    Returns:
        レコードのリスト。DATABASE_URL 未設定・エラー時は空リスト。
    """
    if not settings.database_url:
        return []

    pid_clause = "AND patient_id = %s" if patient_id else ""

    if start and end:
        sql = f"""
            SELECT * FROM vital_records
            WHERE recorded_at >= %s AND recorded_at <= %s {pid_clause}
            ORDER BY recorded_at ASC
            LIMIT %s
        """
        params = [start, end]
        if patient_id:
            params.append(patient_id)
        params.append(limit)
    elif date:
        sql = f"""
            SELECT * FROM vital_records
            WHERE DATE(recorded_at AT TIME ZONE 'Asia/Tokyo') = %s {pid_clause}
            ORDER BY recorded_at DESC
            LIMIT %s
        """
        params = [date]
        if patient_id:
            params.append(patient_id)
        params.append(limit)
    else:
        if patient_id:
            sql = "SELECT * FROM vital_records WHERE patient_id = %s ORDER BY recorded_at DESC LIMIT %s"
            params = [patient_id, limit]
        else:
            sql = "SELECT * FROM vital_records ORDER BY recorded_at DESC LIMIT %s"
            params = [limit]

    try:
        with _get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                rows = cur.fetchall()
        result = []
        for row in rows:
            r = dict(row)
            r["id"] = str(r["id"])
            if r.get("patient_id"):
                r["patient_id"] = str(r["patient_id"])
            r["recorded_at"] = r["recorded_at"].isoformat()
            result.append(r)
        return result
    except Exception as e:
        logger.error("DB取得エラー: %s", e)
        return []


def create_patient(data: dict) -> Optional[dict]:
    """患者を新規登録する。"""
    if not settings.database_url:
        return None

    insertable = {k: v for k, v in data.items() if k in _PATIENT_FIELDS and v is not None}
    if 'name' not in insertable:
        return None

    cols = list(insertable.keys())
    vals = [insertable[c] for c in cols]
    col_str = ", ".join(cols)
    ph_str = ", ".join(["%s"] * len(cols))
    sql = f"INSERT INTO patients ({col_str}) VALUES ({ph_str}) RETURNING id, name, chart_number, species, body_weight, created_at"

    try:
        with _get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, vals)
                row = cur.fetchone()
        r = dict(row)
        r["id"] = str(r["id"])
        r["created_at"] = r["created_at"].isoformat()
        return r
    except Exception as e:
        logger.error("患者作成エラー: %s", e)
        return None


def get_patients() -> list[dict]:
    """全患者を名前順で返す。"""
    if not settings.database_url:
        return []

    try:
        with _get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id, name, chart_number, species, body_weight, created_at FROM patients ORDER BY name ASC"
                )
                rows = cur.fetchall()
        result = []
        for row in rows:
            r = dict(row)
            r["id"] = str(r["id"])
            r["created_at"] = r["created_at"].isoformat()
            result.append(r)
        return result
    except Exception as e:
        logger.error("患者取得エラー: %s", e)
        return []


def update_patient(patient_id: str, data: dict) -> Optional[dict]:
    """患者情報を更新する。"""
    if not settings.database_url:
        return None

    updatable = {k: v for k, v in data.items() if k in _PATIENT_FIELDS}
    if not updatable:
        return None

    set_str = ", ".join([f"{k} = %s" for k in updatable.keys()])
    vals = list(updatable.values())
    sql = f"UPDATE patients SET {set_str} WHERE id = %s RETURNING id, name, chart_number, species, body_weight, created_at"

    try:
        with _get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, vals + [patient_id])
                row = cur.fetchone()
        if not row:
            return None
        r = dict(row)
        r["id"] = str(r["id"])
        r["created_at"] = r["created_at"].isoformat()
        return r
    except Exception as e:
        logger.error("患者更新エラー: %s", e)
        return None


def delete_patient(patient_id: str) -> bool:
    """患者を削除する。"""
    if not settings.database_url:
        return False

    try:
        with _get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM patients WHERE id = %s", (patient_id,))
                return cur.rowcount > 0
    except Exception as e:
        logger.error("患者削除エラー: %s", e)
        return False
