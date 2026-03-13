from pydantic import BaseModel
from typing import List


class Photo(BaseModel):
    id: int
    inspection_id: int
    defect_ids: List[int] = []
    filename: str
    created_at: str
    model_config = {"from_attributes": True}
