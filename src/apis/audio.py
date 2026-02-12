"""Audio API endpoints for meditation sessions."""

import os
import requests
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from src.utils import get_db, AudioFile

router = APIRouter(prefix="/api/audio", tags=["audio"])


@router.get("/list")
def audio_list(limit: int = 20, offset: int = 0, db: Session = Depends(get_db)):
    """List audio files with pagination."""
    total = db.query(AudioFile).count()
    audio_files = db.query(AudioFile).order_by(AudioFile.created_time.desc()).limit(limit).offset(offset).all()

    return {
        "success": True,
        "total": total,
        "limit": limit,
        "offset": offset,
        "audio_files": [
            {
                "id": str(audio.audio_id),
                "url": f"/api/audio/stream/{audio.audio_id}",
                "filename": audio.file_name,
                "title": audio.title,
                "size": audio.file_size,
                "created_at": audio.created_time.isoformat() if audio.created_time else None,
                "original_url": audio.original_url,
            }
            for audio in audio_files
        ],
    }


@router.get("/stream/{audio_id}")
def stream_audio(audio_id: str, db: Session = Depends(get_db)):
    """Stream audio file by ID."""
    audio = db.query(AudioFile).filter(AudioFile.audio_id == audio_id).first()

    if not audio:
        raise HTTPException(404, "Audio not found")

    url = audio.hf_audio_url
    if os.getenv("MINIO_PUBLIC_URL") and "minio:9000" in url:
        url = url.replace("http://minio:9000", os.getenv("MINIO_PUBLIC_URL", "").rstrip("/"))

    resp = requests.get(url, stream=True)
    if resp.status_code != 200:
        raise HTTPException(500, "Failed to fetch audio")

    return StreamingResponse(
        resp.iter_content(chunk_size=8192),
        media_type=audio.content_type or "audio/mpeg",
        headers={"Accept-Ranges": "bytes", "Access-Control-Allow-Origin": "*"},
    )