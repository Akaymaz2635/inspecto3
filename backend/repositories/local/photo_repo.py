import aiosqlite
from typing import List, Optional
from backend.models.photo import Photo
from backend.repositories.base import BaseRepository


class LocalPhotoRepository(BaseRepository):
    def __init__(self, db: aiosqlite.Connection):
        self.db = db

    async def _defect_ids(self, photo_id: int) -> List[int]:
        async with self.db.execute(
            "SELECT defect_id FROM photo_defects WHERE photo_id=? ORDER BY defect_id",
            (photo_id,)
        ) as cur:
            return [r[0] for r in await cur.fetchall()]

    async def _to_photo(self, row) -> Photo:
        d = dict(row)
        d['defect_ids'] = await self._defect_ids(d['id'])
        return Photo(**d)

    async def get(self, id: int) -> Optional[Photo]:
        async with self.db.execute("SELECT * FROM photos WHERE id=?", (id,)) as cur:
            row = await cur.fetchone()
        return await self._to_photo(row) if row else None

    async def list(self, inspection_id: int = None, defect_id: int = None) -> List[Photo]:
        if defect_id is not None:
            sql = """SELECT p.* FROM photos p
                     JOIN photo_defects pd ON pd.photo_id = p.id
                     WHERE pd.defect_id=? ORDER BY p.created_at"""
            params = (defect_id,)
        elif inspection_id is not None:
            sql = "SELECT * FROM photos WHERE inspection_id=? ORDER BY created_at"
            params = (inspection_id,)
        else:
            sql = "SELECT * FROM photos ORDER BY created_at DESC"
            params = ()
        async with self.db.execute(sql, params) as cur:
            rows = await cur.fetchall()
        result = []
        for row in rows:
            result.append(await self._to_photo(row))
        return result

    async def create(self, inspection_id: int, filename: str, defect_ids: List[int] = None) -> Photo:
        async with self.db.execute(
            "INSERT INTO photos (inspection_id, filename) VALUES (?,?)",
            (inspection_id, filename)
        ) as cur:
            photo_id = cur.lastrowid
        if defect_ids:
            for did in defect_ids:
                await self.db.execute(
                    "INSERT OR IGNORE INTO photo_defects (photo_id, defect_id) VALUES (?,?)",
                    (photo_id, did)
                )
        await self.db.commit()
        return await self.get(photo_id)

    async def set_defects(self, photo_id: int, defect_ids: List[int]) -> Photo:
        """Replace all defect associations for a photo."""
        await self.db.execute("DELETE FROM photo_defects WHERE photo_id=?", (photo_id,))
        for did in defect_ids:
            await self.db.execute(
                "INSERT OR IGNORE INTO photo_defects (photo_id, defect_id) VALUES (?,?)",
                (photo_id, did)
            )
        await self.db.commit()
        return await self.get(photo_id)

    async def update(self, id: int, data=None) -> Optional[Photo]:
        return await self.get(id)

    async def delete(self, id: int) -> bool:
        await self.db.execute("DELETE FROM photos WHERE id=?", (id,))
        await self.db.commit()
        return True
