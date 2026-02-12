"""Audio processor for HLS download and MinIO upload."""

import os
import uuid
import tempfile
import subprocess
from pathlib import Path
from typing import Callable, Optional
from minio import Minio
from minio.error import S3Error


class AudioProcessor:
    """Audio processor for downloading HLS streams and uploading to MinIO."""

    def __init__(self, minio_config: dict):
        """Initialize processor with MinIO configuration."""
        self.minio_config = minio_config

    def download_hls_audio(self, url: str, output_path: str, progress_callback: Optional[Callable] = None) -> int:
        """Download HLS audio stream using ffmpeg."""
        if progress_callback:
            progress_callback(20, 100, "Starting download...")

        m3u8_url = f"{url}/highest.m3u8" if '/hls/' in url and not url.endswith('.m3u8') else url
        cmd = ["ffmpeg", "-i", m3u8_url, "-vn", "-acodec", "libmp3lame", "-y", "-loglevel", "error", output_path]

        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
            if result.returncode != 0:
                raise Exception(f"ffmpeg error: {result.stderr}")

            file_size = os.path.getsize(output_path)
            if progress_callback:
                progress_callback(80, 100, f"Downloaded {file_size // 1024} KB")
            return file_size

        except subprocess.TimeoutExpired:
            raise Exception("Download timeout")
        except FileNotFoundError:
            raise Exception("ffmpeg not found")

    def upload_to_minio(self, file_path: str, object_name: Optional[str] = None,
                        progress_callback: Optional[Callable] = None) -> str:
        """Upload file to MinIO."""
        if progress_callback:
            progress_callback(90, 100, "Uploading to MinIO...")

        try:
            client = Minio(
                self.minio_config['endpoint'],
                access_key=self.minio_config['access_key'],
                secret_key=self.minio_config['secret_key'],
                secure=False
            )

            if not client.bucket_exists(self.minio_config['bucket']):
                client.make_bucket(self.minio_config['bucket'])

            if not object_name:
                object_name = f"audio/{uuid.uuid4()}{Path(file_path).suffix}"

            client.fput_object(self.minio_config['bucket'], object_name, file_path, content_type="audio/mpeg")

            if progress_callback:
                progress_callback(99, 100, "Upload complete!")
            return f"http://{self.minio_config['endpoint']}/{self.minio_config['bucket']}/{object_name}"

        except S3Error as e:
            raise Exception(f"MinIO error: {str(e)}")

    def __call__(self, url: str, progress_callback: Optional[Callable] = None) -> dict:
        """Download HLS audio and upload to MinIO."""
        temp_file = None

        try:
            if progress_callback:
                progress_callback(0, 100, "Starting...")

            with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as tmp:
                temp_file = tmp.name

            file_size = self.download_hls_audio(url, temp_file, progress_callback)
            minio_url = self.upload_to_minio(temp_file, progress_callback=progress_callback)

            if progress_callback:
                progress_callback(100, 100, "Complete!")

            return {
                'success': True,
                'minio_url': minio_url,
                'file_size': file_size,
                'original_url': url
            }

        except Exception as e:
            if progress_callback:
                progress_callback(0, 100, f"Error: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'original_url': url
            }

        finally:
            if temp_file and os.path.exists(temp_file):
                try:
                    os.unlink(temp_file)
                except:
                    pass