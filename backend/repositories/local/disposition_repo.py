from typing import List, Optional
import aiosqlite
from backend.models.disposition import Disposition, DispositionCreate, build_note


class LocalDispositionRepository:

    def __init__(self, db: aiosqlite.Connection):
        self.db = db

    async def create(self, data: DispositionCreate) -> Disposition:
        note = build_note(data.decision, data)
        async with self.db.execute(
            """INSERT INTO dispositions
               (defect_id, decision, entered_by, decided_at, note,
                spec_ref, engineer, reinspector, concession_no, void_reason,
                repair_ref, scrap_reason, measurements_snapshot)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                data.defect_id, data.decision, data.entered_by,
                data.decided_at, note,
                data.spec_ref, data.engineer, data.reinspector,
                data.concession_no, data.void_reason,
                data.repair_ref, data.scrap_reason,
                data.measurements_snapshot,
            ),
        ) as cur:
            row_id = cur.lastrowid
        await self.db.commit()
        return await self.get(row_id)

    async def get(self, id: int) -> Optional[Disposition]:
        async with self.db.execute(
            "SELECT * FROM dispositions WHERE id=?", (id,)
        ) as cur:
            row = await cur.fetchone()
        return Disposition(**dict(row)) if row else None

    async def list(self, defect_id: int) -> List[Disposition]:
        async with self.db.execute(
            "SELECT * FROM dispositions WHERE defect_id=? ORDER BY created_at",
            (defect_id,),
        ) as cur:
            rows = await cur.fetchall()
        return [Disposition(**dict(r)) for r in rows]

    async def get_active(self, defect_id: int) -> Optional[Disposition]:
        async with self.db.execute(
            "SELECT * FROM dispositions WHERE defect_id=? ORDER BY id DESC LIMIT 1",
            (defect_id,),
        ) as cur:
            row = await cur.fetchone()
        return Disposition(**dict(row)) if row else None

    async def list_batch(self, defect_ids: List[int]) -> dict:
        """Returns {defect_id: [Disposition, ...]} for all dispositions of each defect."""
        if not defect_ids:
            return {}
        placeholders = ",".join("?" * len(defect_ids))
        async with self.db.execute(
            f"SELECT * FROM dispositions WHERE defect_id IN ({placeholders}) ORDER BY defect_id, id",
            defect_ids,
        ) as cur:
            rows = await cur.fetchall()
        result: dict = {}
        for row in rows:
            d = Disposition(**dict(row))
            result.setdefault(d.defect_id, []).append(d)
        return result

    async def delete_if_active(self, id: int) -> bool:
        """Delete a disposition only if it is the latest one for its defect."""
        async with self.db.execute(
            "SELECT defect_id FROM dispositions WHERE id=?", (id,)
        ) as cur:
            row = await cur.fetchone()
        if not row:
            return False
        defect_id = row[0]
        async with self.db.execute(
            "SELECT MAX(id) FROM dispositions WHERE defect_id=?", (defect_id,)
        ) as cur:
            max_row = await cur.fetchone()
        if not max_row or max_row[0] != id:
            return False  # not the active one
        async with self.db.execute(
            "DELETE FROM dispositions WHERE id=?", (id,)
        ) as cur:
            deleted = cur.rowcount > 0
        await self.db.commit()
        return deleted

    async def get_active_batch(self, defect_ids: List[int]) -> dict:
        """Returns {defect_id: Disposition} for the latest disposition of each defect."""
        if not defect_ids:
            return {}
        placeholders = ",".join("?" * len(defect_ids))
        sql = f"""
            SELECT d.* FROM dispositions d
            INNER JOIN (
                SELECT defect_id, MAX(id) AS max_id
                FROM dispositions
                WHERE defect_id IN ({placeholders})
                GROUP BY defect_id
            ) latest ON d.id = latest.max_id
        """
        async with self.db.execute(sql, defect_ids) as cur:
            rows = await cur.fetchall()
        return {dict(r)["defect_id"]: Disposition(**dict(r)) for r in rows}
