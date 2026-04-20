from pathlib import Path
from typing import Optional
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    anthropic_api_key: str
    claude_model: str = "claude-sonnet-4-6"
    database_url: Optional[str] = None  # Supabase Transaction pooler URL
    host: str = "0.0.0.0"
    port: int = 8000
    max_upload_size: int = 10485760  # 10MB
    max_image_size: int = 1568
    upload_dir: str = "uploads"
    extraction_language: str = "ja"

    model_config = {
        "env_file": str(Path(__file__).parent.parent / ".env"),
        "env_file_encoding": "utf-8",
    }


settings = Settings()
