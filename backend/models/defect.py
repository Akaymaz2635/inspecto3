from __future__ import annotations
from typing import Optional, List
from pydantic import BaseModel
from backend.models.disposition import Disposition


class PhotoRef(BaseModel):
    id: int
    filename: str
    created_at: str

    model_config = {"from_attributes": True}


class DefectBase(BaseModel):
    inspection_id: int
    defect_type_id: int
    depth: Optional[float] = None
    width: Optional[float] = None
    length: Optional[float] = None
    radius: Optional[float] = None
    angle: Optional[float] = None
    color: Optional[str] = None
    notes: Optional[str] = None
    origin_defect_id: Optional[int] = None


class DefectCreate(DefectBase):
    pass


class DefectUpdate(BaseModel):
    inspection_id: Optional[int] = None
    defect_type_id: Optional[int] = None
    depth: Optional[float] = None
    width: Optional[float] = None
    length: Optional[float] = None
    radius: Optional[float] = None
    angle: Optional[float] = None
    color: Optional[str] = None
    notes: Optional[str] = None


class Defect(DefectBase):
    id: int
    defect_type_name: Optional[str] = None
    created_at: str
    updated_at: str
    photos: List[PhotoRef] = []
    active_disposition: Optional[Disposition] = None
    dispositions: List[Disposition] = []
    child_defect_ids: List[int] = []

    model_config = {"from_attributes": True}
