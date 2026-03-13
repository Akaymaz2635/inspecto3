from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
import aiosqlite
from backend.database.connection import get_db
from backend.services.defect_type_service import DefectTypeService
from backend.models.defect_type import DefectType, DefectTypeCreate, DefectTypeUpdate

router = APIRouter(prefix="/api/defect-types", tags=["defect-types"])


async def get_service(db: aiosqlite.Connection = Depends(get_db)) -> DefectTypeService:
    return DefectTypeService(db)


@router.get("", response_model=List[DefectType])
async def list_defect_types(svc: DefectTypeService = Depends(get_service)):
    return await svc.list_defect_types()


@router.get("/{id}", response_model=DefectType)
async def get_defect_type(id: int, svc: DefectTypeService = Depends(get_service)):
    dt = await svc.get_defect_type(id)
    if dt is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Defect type not found")
    return dt


@router.post("", response_model=DefectType, status_code=status.HTTP_201_CREATED)
async def create_defect_type(data: DefectTypeCreate, svc: DefectTypeService = Depends(get_service)):
    return await svc.create_defect_type(data)


@router.patch("/{id}", response_model=DefectType)
async def update_defect_type(id: int, data: DefectTypeUpdate, svc: DefectTypeService = Depends(get_service)):
    dt = await svc.update_defect_type(id, data)
    if dt is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Defect type not found")
    return dt


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_defect_type(id: int, svc: DefectTypeService = Depends(get_service)):
    deleted = await svc.delete_defect_type(id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Defect type not found")
