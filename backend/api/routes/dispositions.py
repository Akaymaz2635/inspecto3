from fastapi import APIRouter, Depends, HTTPException
from typing import List
import aiosqlite
from backend.database.connection import get_db
from backend.models.disposition import Disposition, DispositionCreate
from backend.services.disposition_service import DispositionService

router = APIRouter(prefix="/api/dispositions", tags=["dispositions"])


async def get_service(db: aiosqlite.Connection = Depends(get_db)) -> DispositionService:
    return DispositionService(db)


@router.post("", response_model=Disposition, status_code=201)
async def create_disposition(
    data: DispositionCreate,
    svc: DispositionService = Depends(get_service),
):
    return await svc.create(data)


@router.get("", response_model=List[Disposition])
async def list_dispositions(
    defect_id: int,
    svc: DispositionService = Depends(get_service),
):
    return await svc.list(defect_id)


@router.delete("/{id}", status_code=204)
async def delete_disposition(
    id: int,
    svc: DispositionService = Depends(get_service),
):
    deleted = await svc.delete_active(id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Disposition not found or not the active entry")
