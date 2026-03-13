from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
import aiosqlite
from backend.database.connection import get_db
from backend.services.inspection_service import InspectionService
from backend.models.inspection import Inspection, InspectionCreate, InspectionUpdate, InspectionDetail, ReportData

router = APIRouter(prefix="/api/inspections", tags=["inspections"])


async def get_service(db: aiosqlite.Connection = Depends(get_db)) -> InspectionService:
    return InspectionService(db)


@router.get("", response_model=List[Inspection])
async def list_inspections(
    status: Optional[str] = Query(None),
    project_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    svc: InspectionService = Depends(get_service),
):
    return await svc.list_inspections(status=status, project_id=project_id, search=search)


@router.get("/{id}/report-data", response_model=ReportData)
async def get_report_data(id: int, svc: InspectionService = Depends(get_service)):
    data = await svc.get_report_data(id)
    if data is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inspection not found")
    return data


@router.get("/{id}/pdf-path")
async def get_pdf_path(
    id: int,
    type: str = Query("portrait"),
    svc: InspectionService = Depends(get_service),
):
    info = await svc.get_pdf_path_info(id, type)
    if info is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inspection not found")
    return info


@router.post("/{id}/save-pdf")
async def save_pdf(
    id: int,
    request: Request,
    type: str = Query("portrait"),
    svc: InspectionService = Depends(get_service),
):
    pdf_bytes = await request.body()
    if not pdf_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="PDF verisi boş")
    result = await svc.save_pdf_file(id, type, pdf_bytes)
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inspection not found")
    return result


@router.get("/{id}", response_model=InspectionDetail)
async def get_inspection(id: int, svc: InspectionService = Depends(get_service)):
    detail = await svc.get_detail(id)
    if detail is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inspection not found")
    return detail


@router.post("", response_model=Inspection, status_code=status.HTTP_201_CREATED)
async def create_inspection(data: InspectionCreate, svc: InspectionService = Depends(get_service)):
    return await svc.create_inspection(data)


@router.patch("/{id}", response_model=Inspection)
@router.put("/{id}", response_model=Inspection)
async def update_inspection(
    id: int, data: InspectionUpdate, svc: InspectionService = Depends(get_service)
):
    try:
        inspection = await svc.update_inspection(id, data)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
    if inspection is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inspection not found")
    return inspection


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_inspection(id: int, svc: InspectionService = Depends(get_service)):
    deleted = await svc.delete_inspection(id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inspection not found")
