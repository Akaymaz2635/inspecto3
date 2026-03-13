from typing import List, Optional
import aiosqlite
from backend.repositories.base import BaseRepository
from backend.models.defect import Defect, DefectCreate, DefectUpdate, PhotoRef
from backend.repositories.local.disposition_repo import LocalDispositionRepository


class LocalDefectRepository(BaseRepository):

    def __init__(self, db: aiosqlite.Connection):
        self.db = db
        self._disp_repo = LocalDispositionRepository(db)

    async def _load_children(self, parent_id: int) -> List[int]:
        async with self.db.execute(
            "SELECT id FROM defects WHERE origin_defect_id = ? ORDER BY id",
            (parent_id,),
        ) as cursor:
            rows = await cursor.fetchall()
        return [row[0] for row in rows]

    async def _load_children_batch(self, parent_ids: List[int]) -> dict:
        if not parent_ids:
            return {}
        placeholders = ",".join("?" * len(parent_ids))
        async with self.db.execute(
            f"SELECT origin_defect_id, id FROM defects WHERE origin_defect_id IN ({placeholders}) ORDER BY id",
            parent_ids,
        ) as cursor:
            rows = await cursor.fetchall()
        result: dict = {}
        for row in rows:
            pid, cid = row[0], row[1]
            result.setdefault(pid, []).append(cid)
        return result

    async def _load_photos(self, defect_id: int) -> List[PhotoRef]:
        async with self.db.execute(
            """SELECT p.id, p.filename, p.created_at
               FROM photos p
               JOIN photo_defects pd ON pd.photo_id = p.id
               WHERE pd.defect_id=?
               ORDER BY p.created_at""",
            (defect_id,),
        ) as cursor:
            rows = await cursor.fetchall()
            return [PhotoRef(**dict(r)) for r in rows]

    async def get(self, id: int) -> Optional[Defect]:
        async with self.db.execute(
            """SELECT d.*, dt.name AS defect_type_name
               FROM defects d
               LEFT JOIN defect_types dt ON dt.id = d.defect_type_id
               WHERE d.id = ?""",
            (id,),
        ) as cursor:
            row = await cursor.fetchone()
            if row is None:
                return None
        data        = dict(row)
        photos      = await self._load_photos(id)
        active_disp = await self._disp_repo.get_active(id)
        all_disps   = await self._disp_repo.list(id)
        child_ids   = await self._load_children(id)
        return Defect(**data, photos=photos, active_disposition=active_disp,
                      dispositions=all_disps, child_defect_ids=child_ids)

    async def list(self, **kwargs) -> List[Defect]:
        inspection_id = kwargs.get("inspection_id")
        params: list = []
        where = ""
        if inspection_id is not None:
            where = "WHERE d.inspection_id = ?"
            params.append(inspection_id)

        sql = f"""SELECT d.*, dt.name AS defect_type_name
                  FROM defects d
                  LEFT JOIN defect_types dt ON dt.id = d.defect_type_id
                  {where}
                  ORDER BY d.created_at"""

        async with self.db.execute(sql, params) as cursor:
            rows = await cursor.fetchall()

        defect_ids    = [dict(r)["id"] for r in rows]
        active_disps  = await self._disp_repo.get_active_batch(defect_ids)
        all_disps     = await self._disp_repo.list_batch(defect_ids)
        children_map  = await self._load_children_batch(defect_ids)

        result = []
        for row in rows:
            data = dict(row)
            did = data["id"]
            photos = await self._load_photos(did)
            result.append(Defect(
                **data,
                photos=photos,
                active_disposition=active_disps.get(did),
                dispositions=all_disps.get(did, []),
                child_defect_ids=children_map.get(did, []),
            ))
        return result

    async def create(self, data: DefectCreate) -> Defect:
        async with self.db.execute(
            """INSERT INTO defects
                   (inspection_id, defect_type_id, depth, width, length, radius, angle, color, notes, origin_defect_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                data.inspection_id,
                data.defect_type_id,
                data.depth,
                data.width,
                data.length,
                data.radius,
                data.angle,
                data.color,
                data.notes,
                data.origin_defect_id,
            ),
        ) as cursor:
            row_id = cursor.lastrowid
        await self.db.commit()
        return await self.get(row_id)

    async def update(self, id: int, data: DefectUpdate) -> Optional[Defect]:
        existing = await self.get(id)
        if existing is None:
            return None
        fields = data.model_dump(exclude_unset=True)
        if not fields:
            return existing
        set_clause = ", ".join(f"{k} = ?" for k in fields)
        values = list(fields.values()) + [id]
        await self.db.execute(
            f"UPDATE defects SET {set_clause} WHERE id = ?", values
        )
        await self.db.commit()
        return await self.get(id)

    async def delete(self, id: int) -> bool:
        async with self.db.execute(
            "DELETE FROM defects WHERE id = ?", (id,)
        ) as cursor:
            deleted = cursor.rowcount > 0
        await self.db.commit()
        return deleted
