import os
from dotenv import load_dotenv
import uvicorn
import requests
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import psycopg2
from psycopg2.extras import RealDictCursor

# Load environment variables from .env file
load_dotenv()

app = FastAPI(title="ArayFit PWA", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FRONTEND = os.path.join(os.path.dirname(__file__), "frontend")
DB = {
    "host": os.getenv("DB_HOST", "localhost"),
    "port": int(os.getenv("DB_PORT", "5432")),
    "database": os.getenv("DB_NAME", "automaton"),
    "user": os.getenv("DB_USER", os.getenv("USER", "postgres")),
    "password": os.getenv("DB_PASSWORD", ""),
}


def get_db():
    try:
        return psycopg2.connect(**DB)
    except Exception as e:
        print(f"DB error: {e}")
        return None


for path, sub in [("/css", "css"), ("/js", "js"), ("/images", "images"), ("/fonts", "fonts")]:
    d = os.path.join(FRONTEND, sub)
    if os.path.exists(d) and os.listdir(d):
        app.mount(path, StaticFiles(directory=d), name=sub)


@app.get("/health")
def health():
    return {"status": "healthy"}


@app.get("/")
def root():
    return FileResponse(os.path.join(FRONTEND, "arayfit", "arayfit.html"))


@app.get("/sw.js")
def service_worker():
    return FileResponse(
        os.path.join(FRONTEND, "arayfit", "sw.js"),
        media_type="application/javascript",
    )


@app.get("/manifest.json")
def manifest():
    return FileResponse(
        os.path.join(FRONTEND, "manifest.json"),
        media_type="application/json",
    )


# ─── Audio API (for meditation sessions) ───
@app.get("/api/audio/list")
def audio_list(limit: int = 20, offset: int = 0):
    conn = get_db()
    if not conn:
        raise HTTPException(500, "Database connection failed")
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            """SELECT audio_id, created_time, hf_audio_url, original_url, file_name, title, file_size, content_type
               FROM audio_files ORDER BY created_time DESC LIMIT %s OFFSET %s""",
            (limit, offset),
        )
        rows = cur.fetchall()
        cur.execute("SELECT COUNT(*) as total FROM audio_files")
        total = cur.fetchone()["total"]
        cur.close()
        conn.close()
        return {
            "success": True,
            "total": total,
            "limit": limit,
            "offset": offset,
            "audio_files": [
                {
                    "id": str(r["audio_id"]),
                    "url": f"/api/audio/stream/{r['audio_id']}",
                    "filename": r["file_name"],
                    "title": r["title"],
                    "size": r["file_size"],
                    "created_at": r["created_time"].isoformat() if r["created_time"] else None,
                    "original_url": r["original_url"],
                }
                for r in rows
            ],
        }
    except Exception as e:
        if conn:
            conn.close()
        raise HTTPException(500, str(e))


@app.get("/api/audio/stream/{audio_id}")
def stream_audio(audio_id: str):
    conn = get_db()
    if not conn:
        raise HTTPException(500, "Database connection failed")
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT hf_audio_url, content_type FROM audio_files WHERE audio_id = %s", (audio_id,))
        row = cur.fetchone()
        cur.close()
        conn.close()
        if not row:
            raise HTTPException(404, "Audio not found")
        url = row["hf_audio_url"]
        if os.getenv("MINIO_PUBLIC_URL") and "minio:9000" in url:
            url = url.replace("http://minio:9000", os.getenv("MINIO_PUBLIC_URL", "").rstrip("/"))
        resp = requests.get(url, stream=True)
        if resp.status_code != 200:
            raise HTTPException(500, "Failed to fetch audio")
        return StreamingResponse(
            resp.iter_content(chunk_size=8192),
            media_type=row["content_type"] or "audio/mpeg",
            headers={"Accept-Ranges": "bytes", "Access-Control-Allow-Origin": "*"},
        )
    except HTTPException:
        raise
    except Exception as e:
        if conn:
            conn.close()
        raise HTTPException(500, str(e))


if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")), reload=True, access_log=False)
