from __future__ import annotations
from typing import Optional, List, Literal
from pydantic import BaseModel
from backend.models.defect import Defect, PhotoRef
from backend.models.disposition import Disposition

StatusEnum = Literal["open", "completed", "rejected"]


class InspectionBase(BaseModel):
    project_id: Optional[int] = None
    part_number: Optional[str] = None
    serial_number: Optional[str] = None
    operation_number: Optional[str] = None
    inspector: Optional[str] = None
    status: StatusEnum = "open"
    notes: Optional[str] = None


class InspectionCreate(InspectionBase):
    pass


class InspectionUpdate(BaseModel):
    project_id: Optional[int] = None
    part_number: Optional[str] = None
    serial_number: Optional[str] = None
    operation_number: Optional[str] = None
    inspector: Optional[str] = None
    status: Optional[StatusEnum] = None
    notes: Optional[str] = None


class Inspection(InspectionBase):
    id: int
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


class InspectionDetail(Inspection):
    defects: List[Defect] = []
    project_name: Optional[str] = None


class ReportDefect(BaseModel):
    id: int
    defect_type_name: Optional[str]
    depth: Optional[float]
    width: Optional[float]
    length: Optional[float]
    radius: Optional[float]
    angle: Optional[float]
    color: Optional[str]
    notes: Optional[str]
    created_at: str
    photos: List[PhotoRef] = []
    dispositions: List[Disposition] = []
    active_disposition: Optional[Disposition] = None


class ReportData(BaseModel):
    id: int
    part_number: Optional[str]
    serial_number: Optional[str]
    operation_number: Optional[str]
    inspector: Optional[str]
    status: str
    notes: Optional[str]
    created_at: str
    project_name: Optional[str]
    customer: Optional[str]
    defects: List[ReportDefect] = []
    summary: dict = {}
