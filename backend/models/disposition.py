from __future__ import annotations
from typing import Optional, Literal
from pydantic import BaseModel

DecisionEnum = Literal[
    "USE_AS_IS", "KABUL_RESIM", "CONFORMS",
    "REWORK", "RE_INSPECT", "CTP_RE_INSPECT",
    "MRB_SUBMITTED", "MRB_CTP", "MRB_ACCEPTED", "MRB_REJECTED",
    "VOID", "REPAIR", "SCRAP",
]

DECISION_LABELS = {
    "USE_AS_IS":       "Kabul (Spec)",
    "KABUL_RESIM":     "Kabul (Resim)",
    "CONFORMS":        "Uygun (Inspector)",
    "REWORK":          "Rework",
    "RE_INSPECT":      "Yeniden İnceleme",
    "CTP_RE_INSPECT":  "CTP — Sonraki Op. Yeniden İnceleme",
    "MRB_SUBMITTED":   "MRB Gönderildi",
    "MRB_CTP":         "CTP — MRB (Devam)",
    "MRB_ACCEPTED":    "MRB Kabul",
    "MRB_REJECTED":    "MRB Ret",
    "VOID":            "Void",
    "REPAIR":          "Repair",
    "SCRAP":           "Scrap",
}

NEUTRALIZED = frozenset({"USE_AS_IS", "KABUL_RESIM", "CONFORMS", "MRB_ACCEPTED", "MRB_REJECTED", "VOID", "REPAIR", "SCRAP"})
PENDING     = frozenset({"REWORK", "RE_INSPECT", "CTP_RE_INSPECT", "MRB_SUBMITTED", "MRB_CTP"})


def build_note(decision: str, data: "DispositionCreate") -> str:
    eng  = data.engineer or "—"
    sicil = data.entered_by
    date  = data.decided_at

    if decision == "USE_AS_IS":
        return f"Kabul (Spec) — {data.spec_ref or '—'} | Müh: {eng} | Sicil: {sicil} | {date}"
    if decision == "KABUL_RESIM":
        return f"Kabul (Resim) — {data.spec_ref or '—'} | Müh: {eng} | Sicil: {sicil} | {date}"
    if decision == "REWORK":
        return f"Rework talimatı | Müh: {eng} | Sicil: {sicil} | {date}"
    if decision == "CONFORMS":
        return f"Hata giderildi, uygun | Sicil: {sicil} | {date}"
    if decision == "RE_INSPECT":
        return f"Yeniden inceleme | Müh: {eng} | Sicil: {sicil} | {date}"
    if decision == "CTP_RE_INSPECT":
        return (
            f"CTP — Sonraki operasyonda yeniden inceleme"
            + (f" — Op: {data.spec_ref}" if data.spec_ref else "")
            + f" | Müh: {eng} | Sicil: {sicil} | {date}"
        )
    if decision == "MRB_SUBMITTED":
        return f"MRB'ye gönderildi | Müh: {eng} | Sicil: {sicil} | {date}"
    if decision == "MRB_CTP":
        return (
            f"CTP aşaması"
            + (f" — {data.spec_ref}" if data.spec_ref else "")
            + f" | Müh: {eng} | Sicil: {sicil} | {date}"
        )
    if decision == "MRB_ACCEPTED":
        return f"MRB Kabul — {data.concession_no} | Müh: {eng} | Sicil: {sicil} | {date}"
    if decision == "MRB_REJECTED":
        return (
            f"MRB Ret"
            + (f" — {data.concession_no}" if data.concession_no else "")
            + f" | Müh: {eng} | Sicil: {sicil} | {date}"
        )
    if decision == "VOID":
        return (
            f"Void — {data.void_reason or '—'} | Müh: {eng} | Sicil: {sicil} | {date}"
        )
    if decision == "REPAIR":
        return f"Repair — {data.repair_ref or '—'} | Müh: {eng} | Sicil: {sicil} | {date}"
    if decision == "SCRAP":
        return (
            f"Scrap — {data.scrap_reason or '—'} | Müh: {eng} | Sicil: {sicil} | {date}"
        )
    return ""


class DispositionCreate(BaseModel):
    defect_id:             int
    decision:              DecisionEnum
    entered_by:            str
    decided_at:            str
    spec_ref:              Optional[str] = None
    engineer:              Optional[str] = None
    reinspector:           Optional[str] = None
    concession_no:         Optional[str] = None
    void_reason:           Optional[str] = None
    repair_ref:            Optional[str] = None
    scrap_reason:          Optional[str] = None
    measurements_snapshot: Optional[str] = None  # JSON, set by service


class Disposition(BaseModel):
    id:                    int
    defect_id:             int
    decision:              str
    entered_by:            str
    decided_at:            str
    note:                  str
    spec_ref:              Optional[str] = None
    engineer:              Optional[str] = None
    reinspector:           Optional[str] = None
    concession_no:         Optional[str] = None
    void_reason:           Optional[str] = None
    repair_ref:            Optional[str] = None
    scrap_reason:          Optional[str] = None
    measurements_snapshot: Optional[str] = None
    created_at:            str

    model_config = {"from_attributes": True}
