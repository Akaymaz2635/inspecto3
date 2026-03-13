from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import FileResponse
from typing import List, Optional
import aiosqlite
from backend.database.connection import get_db
from backend.config import UPLOADS_DIR
from backend.models.photo import Photo
from backend.repositories.local.photo_repo import LocalPhotoRepository
from backend.services.photo_service import PhotoService

router = APIRouter(prefix="/api/photos", tags=["photos"])


async def get_service(db: aiosqlite.Connection = Depends(get_db)) -> PhotoService:
    return PhotoService(LocalPhotoRepository(db))


@router.get("", response_model=List[Photo])
async def list_photos(
    inspection_id: Optional[int] = Query(None),
    defect_id: Optional[int] = Query(None),
    svc: PhotoService = Depends(get_service)
):
    return await svc.list(inspection_id=inspection_id, defect_id=defect_id)


@router.post("", response_model=Photo, status_code=201)
async def upload_photo(
    file: UploadFile = File(...),
    inspection_id: int = Query(...),
    defect_ids: List[int] = Query(default=[]),
    svc: PhotoService = Depends(get_service)
):
    return await svc.upload(file, inspection_id, defect_ids)


@router.get("/{id}", response_model=Photo)
async def get_photo(id: int, svc: PhotoService = Depends(get_service)):
    p = await svc.get(id)
    if not p:
        raise HTTPException(404, "Not found")
    return p


@router.put("/{id}/defects", response_model=Photo)
async def set_photo_defects(
    id: int,
    defect_ids: List[int],
    svc: PhotoService = Depends(get_service)
):
    return await svc.set_defects(id, defect_ids)


@router.get("/{id}/file")
async def get_photo_file(id: int, svc: PhotoService = Depends(get_service)):
    p = await svc.get(id)
    if not p:
        raise HTTPException(404, "Not found")
    path = UPLOADS_DIR / p.filename
    if not path.exists():
        raise HTTPException(404, "File not found")
    return FileResponse(str(path))


@router.delete("/{id}", status_code=204)
async def delete_photo(id: int, svc: PhotoService = Depends(get_service)):
    ok = await svc.delete(id)
    if not ok:
        raise HTTPException(404, "Not found")
