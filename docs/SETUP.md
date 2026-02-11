# ArayFit Local Development Setup

## ✅ Setup Complete!

### What was configured:

#### 1. PostgreSQL Database
- **Database**: `automaton`
- **Table**: `audio_files` (UUID primary key, timestamps, audio metadata)
- **Connection**: localhost:5432
- **User**: arshiayousefi (your macOS user)

#### 2. MinIO Object Storage
- **Binary**: Installed at `~/bin/minio`
- **Data Directory**: `~/minio-data`
- **Bucket**: `arayfit-audio` (created via setup-minio.py)

#### 3. Project Files Created
- `.env` - Environment variables (local configuration)
- `.gitignore` - Ignores .env, Python cache, etc.
- `start-minio.sh` - Script to start MinIO server
- `setup-minio.py` - Script to create MinIO bucket
- Updated `requirements.txt` - Added python-dotenv and minio
- Updated `app.py` - Loads .env file automatically

---

## 🚀 How to Run

### Terminal 1: Start MinIO
```bash
./start-minio.sh
```

Access MinIO Console at: http://localhost:9001
- Username: minioadmin
- Password: minioadmin

### Terminal 2: Setup MinIO Bucket (first time only)
```bash
python setup-minio.py
```

### Terminal 3: Start Application
```bash
python app.py
```

Access Application at: http://localhost:8000

---

## 📝 Quick Commands

### PostgreSQL
```bash
# Connect to database
psql automaton

# View table structure
psql automaton -c "\d audio_files"

# Check data
psql automaton -c "SELECT COUNT(*) FROM audio_files;"
```

### MinIO
```bash
# Check if MinIO is running
curl http://localhost:9000/minio/health/live

# Access web console
open http://localhost:9001
```

### Application
```bash
# Test health endpoint
curl http://localhost:8000/health

# List audio files
curl http://localhost:8000/api/audio/list
```

---

## 🔧 Configuration

Edit `.env` file to customize:
- Database connection settings
- MinIO endpoint and credentials
- Application port

---

## 📦 Uploading Audio Files

To upload audio files to MinIO and add metadata to PostgreSQL, you can:

1. Use MinIO Console (http://localhost:9001)
   - Login with minioadmin/minioadmin
   - Navigate to `arayfit-audio` bucket
   - Upload files

2. Use Python with minio library:
```python
from minio import Minio
import psycopg2
from datetime import datetime

# Upload to MinIO
client = Minio("localhost:9000", access_key="minioadmin", secret_key="minioadmin", secure=False)
client.fput_object("arayfit-audio", "meditation.mp3", "/path/to/meditation.mp3")

# Add metadata to PostgreSQL
conn = psycopg2.connect(database="automaton", user="arshiayousefi")
cur = conn.cursor()
cur.execute("""
    INSERT INTO audio_files (hf_audio_url, file_name, title, content_type)
    VALUES (%s, %s, %s, %s)
""", (
    "http://localhost:9000/arayfit-audio/meditation.mp3",
    "meditation.mp3",
    "Guided Meditation",
    "audio/mpeg"
))
conn.commit()
```

---

## 🐛 Troubleshooting

### PostgreSQL not running
```bash
brew services start postgresql@14
```

### MinIO port already in use
```bash
lsof -ti:9000 | xargs kill -9
lsof -ti:9001 | xargs kill -9
```

### Can't connect to database
Check your `.env` file has correct DB_USER (should be your macOS username)

### App can't find .env
Make sure you run `python app.py` from the project root directory