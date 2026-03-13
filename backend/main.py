from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path
from backend.database.connection import init_db
from backend.api.routes import projects, defect_types, inspections, defects, photos, dispositions

FRONTEND = Path(__file__).resolve().parent.parent / "frontend"


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="Inspection API", version="1.0.0", lifespan=lifespan)

app.include_router(projects.router)
app.include_router(defect_types.router)
app.include_router(inspections.router)
app.include_router(defects.router)
app.include_router(photos.router)
app.include_router(dispositions.router)

app.mount("/static", StaticFiles(directory=str(FRONTEND / "static")), name="static")


@app.get("/report")
async def report_page():
    return FileResponse(str(FRONTEND / "report.html"))


@app.get("/{full_path:path}")
async def spa(full_path: str):
    return FileResponse(str(FRONTEND / "index.html"))
