from typing import List, Optional
import aiosqlite
from backend.repositories.base import BaseRepository
from backend.models.defect_type import DefectType, DefectTypeCreate, DefectTypeUpdate


class LocalDefectTypeRepository(BaseRepository):

    def __init__(self, db: aiosqlite.Connection):
        self.db = db

    async def get(self, id: int) -> Optional[DefectType]:
        async with self.db.execute(
            "SELECT * FROM defect_types WHERE id = ?", (id,)
        ) as cursor:
            row = await cursor.fetchone()
            if row is None:
                return None
            return DefectType(**dict(row))

    async def list(self, **kwargs) -> List[DefectType]:
        async with self.db.execute(
            "SELECT * FROM defect_types ORDER BY name"
        ) as cursor:
            rows = await cursor.fetchall()
            return [DefectType(**dict(r)) for r in rows]

    async def create(self, data: DefectTypeCreate) -> DefectType:
        async with self.db.execute(
            """INSERT INTO defect_types (name, description)
               VALUES (?, ?)""",
            (data.name, data.description),
        ) as cursor:
            row_id = cursor.lastrowid
        await self.db.commit()
        return await self.get(row_id)

    async def update(self, id: int, data: DefectTypeUpdate) -> Optional[DefectType]:
        existing = await self.get(id)
        if existing is None:
            return None
        fields = data.model_dump(exclude_unset=True)
        if not fields:
            return existing
        set_clause = ", ".join(f"{k} = ?" for k in fields)
        values = list(fields.values()) + [id]
        await self.db.execute(
            f"UPDATE defect_types SET {set_clause} WHERE id = ?", values
        )
        await self.db.commit()
        return await self.get(id)

    async def delete(self, id: int) -> bool:
        async with self.db.execute(
            "DELETE FROM defect_types WHERE id = ?", (id,)
        ) as cursor:
            deleted = cursor.rowcount > 0
        await self.db.commit()
        return deleted
