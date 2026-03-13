import re
from pathlib import Path
from typing import List, Optional
import aiosqlite
from backend.config import UPLOADS_DIR
from backend.repositories.local.inspection_repo import LocalInspectionRepository
from backend.repositories.local.defect_repo import LocalDefectRepository
from backend.repositories.local.disposition_repo import LocalDispositionRepository
from backend.models.inspection import Inspection, InspectionCreate, InspectionUpdate, InspectionDetail, ReportData, ReportDefect

_UNSAFE = re.compile(r'[\\/:*?"<>|\s]')


def _safe(name: str) -> str:
    name = _UNSAFE.sub('_', (name or '').strip())
    return name or 'unknown'


class InspectionService:

    def __init__(self, db: aiosqlite.Connection):
        self.db = db
        self.repo = LocalInspectionRepository(db)
        self.defect_repo = LocalDefectRepository(db)

    async def list_inspections(self, **filters) -> List[Inspection]:
        return await self.repo.list(**filters)

    async def get_inspection(self, id: int) -> Optional[Inspection]:
        return await self.repo.get(id)

    async def get_detail(self, id: int) -> Optional[InspectionDetail]:
        inspection = await self.repo.get(id)
        if inspection is None:
            return None

        defects = await self.defect_repo.list(inspection_id=id)

        project_name: Optional[str] = None
        if inspection.project_id is not None:
            async with self.db.execute(
                "SELECT name FROM projects WHERE id = ?", (inspection.project_id,)
            ) as cursor:
                row = await cursor.fetchone()
                if row:
                    project_name = row["name"]

        return InspectionDetail(
            **inspection.model_dump(),
            defects=defects,
            project_name=project_name,
        )

    async def create_inspection(self, data: InspectionCreate) -> Inspection:
        return await self.repo.create(data)

    async def get_unneutralized_count(self, inspection_id: int) -> int:
        """Dispositionsuz (karara bağlanmamış) kusur sayısını döner."""
        async with self.db.execute(
            """SELECT COUNT(*) FROM defects d
               WHERE d.inspection_id = ?
               AND NOT EXISTS (
                   SELECT 1 FROM dispositions dp WHERE dp.defect_id = d.id
               )""",
            (inspection_id,),
        ) as cur:
            row = await cur.fetchone()
            return row[0]

    async def update_inspection(self, id: int, data: InspectionUpdate) -> Optional[Inspection]:
        if data.status == "completed":
            count = await self.get_unneutralized_count(id)
            if count > 0:
                raise ValueError(
                    f"{count} kusur henüz karara bağlanmamış. "
                    "Tüm kusurlar için disposition girilmeden operasyon tamamlanamaz."
                )
        return await self.repo.update(id, data)

    async def delete_inspection(self, id: int) -> bool:
        return await self.repo.delete(id)

    async def get_pdf_path_info(self, id: int, rtype: str) -> Optional[dict]:
        """Return save path info for the PDF report.

        Returns dict with keys: path (absolute), display_path (relative), exists (bool).
        """
        inspection = await self.repo.get(id)
        if inspection is None:
            return None

        project_name: Optional[str] = None
        if inspection.project_id:
            async with self.db.execute(
                "SELECT name FROM projects WHERE id = ?", (inspection.project_id,)
            ) as cur:
                row = await cur.fetchone()
                if row:
                    project_name = row[0]

        suffix   = "yatay" if rtype == "landscape" else "dikey"
        filename = f"muayene_{id}_{suffix}.pdf"
        subdir   = (
            Path(_safe(project_name))
            / _safe(inspection.part_number)
            / _safe(inspection.serial_number)
            / _safe(inspection.operation_number)
        )
        full_path    = UPLOADS_DIR / subdir / filename
        display_path = (subdir / filename).as_posix()
        return {
            "path":         str(full_path),
            "display_path": display_path,
            "exists":       full_path.exists(),
        }

    async def save_pdf_file(self, id: int, rtype: str, data: bytes) -> Optional[dict]:
        """Save PDF bytes to the inspection's upload folder."""
        info = await self.get_pdf_path_info(id, rtype)
        if info is None:
            return None
        dest = Path(info["path"])
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        return {"saved_path": info["display_path"]}

    async def get_report_data(self, id: int) -> Optional[ReportData]:
        inspection = await self.repo.get(id)
        if inspection is None:
            return None

        defects = await self.defect_repo.list(inspection_id=id)

        project_name: Optional[str] = None
        customer: Optional[str] = None
        if inspection.project_id is not None:
            async with self.db.execute(
                "SELECT name, customer FROM projects WHERE id = ?", (inspection.project_id,)
            ) as cur:
                row = await cur.fetchone()
                if row:
                    project_name = row["name"]
                    customer = row["customer"]

        TERMINAL = {"USE_AS_IS", "REWORK", "MRB_ACCEPTED", "VOID", "REPAIR", "SCRAP"}
        disp_repo = LocalDispositionRepository(self.db)

        report_defects = []
        by_decision: dict = {}
        by_type: dict = {}
        neutralized = 0

        for d in defects:
            all_disps = await disp_repo.list(d.id)
            active = all_disps[-1] if all_disps else None

            report_defects.append(ReportDefect(
                id=d.id,
                defect_type_name=d.defect_type_name,
                depth=d.depth, width=d.width, length=d.length,
                radius=d.radius, angle=d.angle, color=d.color, notes=d.notes,
                created_at=d.created_at,
                photos=d.photos,
                dispositions=all_disps,
                active_disposition=active,
            ))

            type_key = d.defect_type_name or "Bilinmiyor"
            by_type[type_key] = by_type.get(type_key, 0) + 1

            if active:
                dec = active.decision
                by_decision[dec] = by_decision.get(dec, 0) + 1
                if dec in TERMINAL:
                    neutralized += 1
            else:
                by_decision["PENDING"] = by_decision.get("PENDING", 0) + 1

        total = len(defects)
        return ReportData(
            id=inspection.id,
            part_number=inspection.part_number,
            serial_number=inspection.serial_number,
            inspector=inspection.inspector,
            status=inspection.status,
            notes=inspection.notes,
            created_at=inspection.created_at,
            project_name=project_name,
            customer=customer,
            defects=report_defects,
            summary={
                "total": total,
                "neutralized": neutralized,
                "pending": total - neutralized,
                "by_decision": by_decision,
                "by_type": by_type,
            },
        )
