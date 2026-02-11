# ArayFit PWA

Progressive Web App for **Aray Meditation** — meditation and mindfulness.

## Setup

### Prerequisites
- Python 3.8+
- PostgreSQL 14+
- MinIO (for audio storage)

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Setup PostgreSQL

Database and table are already created:
- Database: `automaton`
- Table: `audio_files`

If you need to recreate them:
```bash
psql postgres -c "CREATE DATABASE automaton;"
psql automaton -c "CREATE TABLE audio_files (
    audio_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    hf_audio_url TEXT,
    original_url TEXT,
    file_name VARCHAR(255),
    title VARCHAR(255),
    file_size BIGINT,
    content_type VARCHAR(100)
);"
```

### 3. Setup MinIO

**Start MinIO server** (in a separate terminal):
```bash
./start-minio.sh
```

This will start:
- API Server: http://localhost:9000
- Web Console: http://localhost:9001
- Credentials: minioadmin / minioadmin

**Create bucket** (run once):
```bash
python setup-minio.py
```

### 4. Configure Environment

Edit `.env` file with your settings:
```bash
# PostgreSQL
DB_HOST=localhost
DB_NAME=automaton
DB_USER=your_username

# MinIO
MINIO_PUBLIC_URL=http://localhost:9000
```

### 5. Run Application

```bash
python app.py
```

Open in browser: `http://localhost:8000`

## Structure

- **Backend:** FastAPI — serves the PWA and audio API (`/api/audio/list`, `/api/audio/stream/:id`)
- **Frontend:** Single-page PWA in `frontend/arayfit/` with `arayfit.html`, `sw.js`, and assets in `frontend/css/arayfit.css`, `frontend/js/arayfit.js`

## Services

- **PostgreSQL**: Stores audio file metadata
- **MinIO**: Object storage for audio files
- **FastAPI**: API server and PWA host
