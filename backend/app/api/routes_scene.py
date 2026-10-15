from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.schemas import ResetResponse, RulesResponse
from app.models import Scene
from app.store import Store, get_store

router = APIRouter(prefix="/api", tags=["scene"])
StoreDep = Annotated[Store, Depends(get_store)]


@router.get("/scene", response_model=Scene)
def get_scene(store: StoreDep) -> Scene:
    return store.scene


@router.get("/rules", response_model=RulesResponse)
def get_rules(store: StoreDep) -> RulesResponse:
    rules = store.rules
    return RulesResponse(items=rules, total=len(rules))


@router.post("/reset", response_model=ResetResponse)
def reset(store: StoreDep) -> ResetResponse:
    store.reset()
    return ResetResponse()
