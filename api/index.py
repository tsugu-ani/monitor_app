import sys
from pathlib import Path

# backend/ をモジュール検索パスに追加
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from main import app  # noqa: F401
