from typing import List, Optional
import aiosqlite
from backend.repositories.local.project_repo import LocalProjectRepository
from backend.models.project import Project, ProjectCreate, ProjectUpdate


class ProjectService:

    def __init__(self, db: aiosqlite.Connection):
        self.repo = LocalProjectRepository(db)

    async def list_projects(self) -> List[Project]:
        return await self.repo.list()

    async def get_project(self, id: int) -> Optional[Project]:
        return await self.repo.get(id)

    async def create_project(self, data: ProjectCreate) -> Project:
        return await self.repo.create(data)

    async def update_project(self, id: int, data: ProjectUpdate) -> Optional[Project]:
        return await self.repo.update(id, data)

    async def delete_project(self, id: int) -> bool:
        return await self.repo.delete(id)
