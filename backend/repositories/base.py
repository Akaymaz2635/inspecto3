from abc import ABC, abstractmethod
from typing import Any, List, Optional


class BaseRepository(ABC):

    @abstractmethod
    async def get(self, id: int) -> Optional[Any]:
        ...

    @abstractmethod
    async def list(self, **kwargs) -> List[Any]:
        ...

    @abstractmethod
    async def create(self, data: Any) -> Any:
        ...

    @abstractmethod
    async def update(self, id: int, data: Any) -> Optional[Any]:
        ...

    @abstractmethod
    async def delete(self, id: int) -> bool:
        ...
