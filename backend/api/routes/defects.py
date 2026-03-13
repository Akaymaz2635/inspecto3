from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query, status
import aiosqlite
from backend.database.connection import get_db
from backend.services.defect_service import DefectService
from backend.models.defect import Defect, DefectCreate, DefectUpdate

router = APIRouter(prefix="/api/defects", tags=["defects"])


async def get_service(db: aiosqlite.Connection = Depends(get_db)) -> DefectService:
    return DefectService(db)


@router.get("", response_model=List[Defect])
async def list_defects(
    inspection_id: int = Query(..., description="Filter defects by inspection ID"),
    svc: DefectService = Depends(get_service),
):
    return await svc.list_defects(inspection_id=inspection_id)


@router.get("/{id}", response_model=Defect)
async def get_defect(id: int, svc: DefectService = Depends(get_service)):
    defect = await svc.get_defect(id)
    if defect is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Defect not found")
    return defect


@router.post("", response_model=Defect, status_code=status.HTTP_201_CREATED)
async def create_defect(data: DefectCreate, svc: DefectService = Depends(get_service)):
    return await svc.create_defect(data)


@router.patch("/{id}", response_model=Defect)
async def update_defect(id: int, data: DefectUpdate, svc: DefectService = Depends(get_service)):
    defect = await svc.update_defect(id, data)
    if defect is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Defect not found")
    return defect


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_defect(id: int, svc: DefectService = Depends(get_service)):
    deleted = await svc.delete_defect(id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Defect not found")
