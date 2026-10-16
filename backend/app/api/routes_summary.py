from typing import Annotated

from fastapi import APIRouter, Depends

from app.engine.summary import build_summary
from app.models.summary import Summary
from app.store import Store, get_store

router = APIRouter(prefix="/api", tags=["summary"])
StoreDep = Annotated[Store, Depends(get_store)]


@router.get("/summary", response_model=Summary)
def get_summary(store: StoreDep) -> Summary:
    return build_summary(
        store.clashes(), store.scene.assets, store.truth, store.result.baseline_pairs
    )
