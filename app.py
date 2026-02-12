import os
from dotenv import load_dotenv
import uvicorn
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from src.apis import audio_router

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

# Include routers
app.include_router(audio_router)

FRONTEND = os.path.join(os.path.dirname(__file__), "frontend")


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


if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")), reload=True, access_log=False)
