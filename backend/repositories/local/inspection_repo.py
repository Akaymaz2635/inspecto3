from typing import List, Optional
import aiosqlite
from backend.repositories.base import BaseRepository
from backend.models.inspection import Inspection, InspectionCreate, InspectionUpdate


class LocalInspectionRepository(BaseRepository):

    def __init__(self, db: aiosqlite.Connection):
        self.db = db

    async def get(self, id: int) -> Optional[Inspection]:
        async with self.db.execute(
            "SELECT * FROM inspections WHERE id = ?", (id,)
        ) as cursor:
            row = await cursor.fetchone()
            if row is None:
                return None
            return Inspection(**dict(row))

    async def list(self, **kwargs) -> List[Inspection]:
        status = kwargs.get("status")
        project_id = kwargs.get("project_id")
        search = kwargs.get("search")

        conditions: list[str] = []
        params: list = []

        if status:
            conditions.append("status = ?")
            params.append(status)
        if project_id is not None:
            conditions.append("project_id = ?")
            params.append(project_id)
        if search:
            like = f"%{search}%"
            conditions.append(
                "(part_number LIKE ? OR serial_number LIKE ? OR inspector LIKE ?)"
            )
            params.extend([like, like, like])

        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
        sql = f"SELECT * FROM inspections {where} ORDER BY created_at DESC"

        async with self.db.execute(sql, params) as cursor:
            rows = await cursor.fetchall()
            return [Inspection(**dict(r)) for r in rows]

    async def create(self, data: InspectionCreate) -> Inspection:
        async with self.db.execute(
            """INSERT INTO inspections
                   (project_id, part_number, serial_number, operation_number, inspector, status, notes)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                data.project_id,
                data.part_number or '',
                data.serial_number or '',
                data.operation_number or '',
                data.inspector or '',
                data.status,
                data.notes,
            ),
        ) as cursor:
            row_id = cursor.lastrowid
        await self.db.commit()
        return await self.get(row_id)

    async def update(self, id: int, data: InspectionUpdate) -> Optional[Inspection]:
        existing = await self.get(id)
        if existing is None:
            return None
        fields = data.model_dump(exclude_unset=True)
        if not fields:
            return existing
        set_clause = ", ".join(f"{k} = ?" for k in fields)
        values = list(fields.values()) + [id]
        await self.db.execute(
            f"UPDATE inspections SET {set_clause} WHERE id = ?", values
        )
        await self.db.commit()
        return await self.get(id)

    async def delete(self, id: int) -> bool:
        async with self.db.execute(
            "DELETE FROM inspections WHERE id = ?", (id,)
        ) as cursor:
            deleted = cursor.rowcount > 0
        await self.db.commit()
        return deleted
