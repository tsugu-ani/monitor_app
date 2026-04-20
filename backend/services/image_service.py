import base64
import io

from PIL import Image

from config import settings

ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}


def validate_and_process(image_bytes: bytes, content_type: str) -> tuple[str, str]:
    """
    画像を検証・リサイズし (base64文字列, MIMEタイプ) を返す。
    """
    if content_type not in ALLOWED_MIME_TYPES:
        raise ValueError(f"サポートされていない画像形式です: {content_type}")

    if len(image_bytes) > settings.max_upload_size:
        mb = len(image_bytes) / 1024 / 1024
        raise ValueError(f"画像サイズが上限を超えています: {mb:.1f}MB")

    image = Image.open(io.BytesIO(image_bytes))

    # RGBA / P モードは RGB に変換
    if image.mode not in ("RGB", "L"):
        image = image.convert("RGB")
        content_type = "image/jpeg"

    # 長辺が上限を超える場合はリサイズ
    max_dim = settings.max_image_size
    if max(image.width, image.height) > max_dim:
        image.thumbnail((max_dim, max_dim), Image.LANCZOS)

    output = io.BytesIO()
    fmt = "JPEG" if content_type in ("image/jpeg", "image/webp") else "PNG"
    save_mime = "image/jpeg" if fmt == "JPEG" else "image/png"
    image.save(output, format=fmt, quality=85)
    output.seek(0)

    encoded = base64.standard_b64encode(output.read()).decode("utf-8")
    return encoded, save_mime


def downscale(base64_data: str, media_type: str, max_dim: int) -> tuple[str, str]:
    """処理済み Base64 画像を指定サイズ以下に再リサイズして返す。
    識別ステップなど精度よりも速度を優先する場面で使用する。
    """
    image_bytes = base64.standard_b64decode(base64_data)
    image = Image.open(io.BytesIO(image_bytes))

    if max(image.width, image.height) <= max_dim:
        return base64_data, media_type  # リサイズ不要

    image.thumbnail((max_dim, max_dim), Image.LANCZOS)
    output = io.BytesIO()
    image.save(output, format="JPEG", quality=80)
    output.seek(0)
    encoded = base64.standard_b64encode(output.read()).decode("utf-8")
    return encoded, "image/jpeg"
