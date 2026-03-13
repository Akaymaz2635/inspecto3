from typing import List, Optional
import aiosqlite
from backend.repositories.local.defect_type_repo import LocalDefectTypeRepository
from backend.models.defect_type import DefectType, DefectTypeCreate, DefectTypeUpdate


class DefectTypeService:

    def __init__(self, db: aiosqlite.Connection):
        self.repo = LocalDefectTypeRepository(db)

    async def list_defect_types(self) -> List[DefectType]:
        return await self.repo.list()

    async def get_defect_type(self, id: int) -> Optional[DefectType]:
        return await self.repo.get(id)

    async def create_defect_type(self, data: DefectTypeCreate) -> DefectType:
        return await self.repo.create(data)

    async def update_defect_type(self, id: int, data: DefectTypeUpdate) -> Optional[DefectType]:
        return await self.repo.update(id, data)

    async def delete_defect_type(self, id: int) -> bool:
        return await self.repo.delete(id)
