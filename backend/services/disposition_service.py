import json
from typing import List, Optional
import aiosqlite
from backend.models.disposition import Disposition, DispositionCreate
from backend.repositories.local.disposition_repo import LocalDispositionRepository

_SNAPSHOT_FIELDS = ("depth", "width", "length", "radius", "angle", "color", "notes")


class DispositionService:

    def __init__(self, db: aiosqlite.Connection):
        self.db   = db
        self.repo = LocalDispositionRepository(db)

    async def _snapshot(self, defect_id: int) -> Optional[str]:
        """Capture current defect measurements as JSON string."""
        cols = ", ".join(_SNAPSHOT_FIELDS)
        async with self.db.execute(
            f"SELECT {cols} FROM defects WHERE id = ?", (defect_id,)
        ) as cur:
            row = await cur.fetchone()
        if not row:
            return None
        data = {k: v for k, v in zip(_SNAPSHOT_FIELDS, row) if v is not None}
        return json.dumps(data, ensure_ascii=False)

    async def create(self, data: DispositionCreate) -> Disposition:
        if data.decision in ("REWORK", "RE_INSPECT", "CTP_RE_INSPECT"):
            snap = await self._snapshot(data.defect_id)
            data = data.model_copy(update={"measurements_snapshot": snap})
        return await self.repo.create(data)

    async def list(self, defect_id: int) -> List[Disposition]:
        return await self.repo.list(defect_id)

    async def get_active(self, defect_id: int) -> Optional[Disposition]:
        return await self.repo.get_active(defect_id)

    async def delete_active(self, id: int) -> bool:
        return await self.repo.delete_if_active(id)
