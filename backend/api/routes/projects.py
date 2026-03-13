from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
import aiosqlite
from backend.database.connection import get_db
from backend.services.project_service import ProjectService
from backend.models.project import Project, ProjectCreate, ProjectUpdate

router = APIRouter(prefix="/api/projects", tags=["projects"])


async def get_service(db: aiosqlite.Connection = Depends(get_db)) -> ProjectService:
    return ProjectService(db)


@router.get("", response_model=List[Project])
async def list_projects(svc: ProjectService = Depends(get_service)):
    return await svc.list_projects()


@router.get("/{id}", response_model=Project)
async def get_project(id: int, svc: ProjectService = Depends(get_service)):
    project = await svc.get_project(id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


@router.post("", response_model=Project, status_code=status.HTTP_201_CREATED)
async def create_project(data: ProjectCreate, svc: ProjectService = Depends(get_service)):
    return await svc.create_project(data)


@router.patch("/{id}", response_model=Project)
async def update_project(id: int, data: ProjectUpdate, svc: ProjectService = Depends(get_service)):
    project = await svc.update_project(id, data)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(id: int, svc: ProjectService = Depends(get_service)):
    deleted = await svc.delete_project(id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
