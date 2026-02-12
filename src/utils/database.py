"""Database configuration and session management."""

import os
from datetime import datetime
from sqlalchemy import create_engine, Column, String, Integer, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.dialects.postgresql import UUID

# Database connection URL
DATABASE_URL = (
    f"postgresql://{os.getenv('DB_USER', os.getenv('USER', 'postgres'))}"
    f":{os.getenv('DB_PASSWORD', '')}"
    f"@{os.getenv('DB_HOST', 'localhost')}"
    f":{os.getenv('DB_PORT', '5432')}"
    f"/{os.getenv('DB_NAME', 'automaton')}"
)

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """Get database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class AudioFile(Base):
    """Audio file model."""
    __tablename__ = "audio_files"

    audio_id = Column(UUID(as_uuid=True), primary_key=True)
    created_time = Column(DateTime, default=datetime.utcnow)
    hf_audio_url = Column(String)
    original_url = Column(String)
    file_name = Column(String)
    title = Column(String)
    file_size = Column(Integer)
    content_type = Column(String)