from typing import List, Optional
import aiosqlite
from backend.repositories.local.defect_repo import LocalDefectRepository
from backend.models.defect import Defect, DefectCreate, DefectUpdate


class DefectService:

    def __init__(self, db: aiosqlite.Connection):
        self.repo = LocalDefectRepository(db)

    async def list_defects(self, inspection_id: int) -> List[Defect]:
        return await self.repo.list(inspection_id=inspection_id)

    async def get_defect(self, id: int) -> Optional[Defect]:
        return await self.repo.get(id)

    async def create_defect(self, data: DefectCreate) -> Defect:
        return await self.repo.create(data)

    async def update_defect(self, id: int, data: DefectUpdate) -> Optional[Defect]:
        return await self.repo.update(id, data)

    async def delete_defect(self, id: int) -> bool:
        return await self.repo.delete(id)
