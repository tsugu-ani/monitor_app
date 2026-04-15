import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api import vision

app = FastAPI(title="Monitor App")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(vision.router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok"}


# Vercel 環境では静的ファイル配信を行わない（Vercel 側で配信される）
if not os.environ.get("VERCEL"):
    from fastapi.responses import FileResponse
    from fastapi.staticfiles import StaticFiles

    FRONTEND_DIR = Path(__file__).parent.parent / "frontend"

    @app.get("/")
    def serve_index():
        return FileResponse(str(FRONTEND_DIR / "index.html"))

    app.mount("/css", StaticFiles(directory=str(FRONTEND_DIR / "css")), name="css")
    app.mount("/js", StaticFiles(directory=str(FRONTEND_DIR / "js")), name="js")
