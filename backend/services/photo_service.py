import re
import uuid
import aiofiles
from pathlib import Path
from fastapi import UploadFile
from typing import List, Optional
from backend.config import UPLOADS_DIR
from backend.models.photo import Photo
from backend.repositories.local.photo_repo import LocalPhotoRepository

_UNSAFE = re.compile(r'[\\/:*?"<>|\s]')


def _safe(name: str) -> str:
    """Sanitize a string for use as a folder name."""
    name = _UNSAFE.sub('_', (name or '').strip())
    return name or 'unknown'


class PhotoService:
    def __init__(self, repo: LocalPhotoRepository):
        self.repo = repo

    async def _upload_subdir(self, inspection_id: int, defect_ids: List[int]) -> Path:
        """Return (and create) the subfolder path for this photo.

        Structure:
          <project_name>/<part_number>/<serial_number>/<operation_number>/
              genel/          — no defect assigned
              hata_9/         — single defect
              hata_9_12/      — multiple defects (sorted)
        """
        db = self.repo.db
        async with db.execute(
            "SELECT project_id, part_number, serial_number, operation_number FROM inspections WHERE id=?",
            (inspection_id,)
        ) as cur:
            row = await cur.fetchone()

        if row:
            project_id, part_no, serial_no, op_no = row
            project_name: Optional[str] = None
            if project_id:
                async with db.execute("SELECT name FROM projects WHERE id=?", (project_id,)) as cur2:
                    prow = await cur2.fetchone()
                    if prow:
                        project_name = prow[0]
        else:
            project_name = part_no = serial_no = op_no = None

        if defect_ids:
            leaf = "hata_" + "_".join(str(d) for d in sorted(defect_ids))
        else:
            leaf = "genel"

        subdir = (
            Path(_safe(project_name))
            / _safe(part_no)
            / _safe(serial_no)
            / _safe(op_no)
            / leaf
        )
        (UPLOADS_DIR / subdir).mkdir(parents=True, exist_ok=True)
        return subdir

    async def upload(self, file: UploadFile, inspection_id: int, defect_ids: List[int] = None) -> Photo:
        ext = Path(file.filename).suffix if file.filename else ".jpg"
        if not ext:
            ext = ".jpg"
        ids = defect_ids or []
        subdir = await self._upload_subdir(inspection_id, ids)
        filename_only = f"{uuid.uuid4().hex}{ext}"
        rel_path = (subdir / filename_only).as_posix()
        dest = UPLOADS_DIR / rel_path
        async with aiofiles.open(str(dest), "wb") as f:
            await f.write(await file.read())
        return await self.repo.create(inspection_id, rel_path, ids)

    async def list(self, inspection_id: int = None, defect_id: int = None) -> List[Photo]:
        return await self.repo.list(inspection_id=inspection_id, defect_id=defect_id)

    async def get(self, id: int) -> Optional[Photo]:
        return await self.repo.get(id)

    async def set_defects(self, photo_id: int, defect_ids: List[int]) -> Photo:
        return await self.repo.set_defects(photo_id, defect_ids)

    async def delete(self, id: int) -> bool:
        photo = await self.repo.get(id)
        if not photo:
            return False
        dest = UPLOADS_DIR / photo.filename
        if dest.exists():
            dest.unlink()
        return await self.repo.delete(id)
