from __future__ import annotations
from typing import Optional
from pydantic import BaseModel


class ProjectBase(BaseModel):
    name: str
    description: Optional[str] = None
    customer: Optional[str] = None


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    customer: Optional[str] = None


class Project(ProjectBase):
    id: int
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}
