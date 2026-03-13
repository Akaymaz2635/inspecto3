from __future__ import annotations
from typing import Optional
from pydantic import BaseModel


class DefectTypeBase(BaseModel):
    name: str
    description: Optional[str] = None


class DefectTypeCreate(DefectTypeBase):
    pass


class DefectTypeUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class DefectType(DefectTypeBase):
    id: int
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}
