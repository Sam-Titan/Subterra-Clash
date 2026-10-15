from pydantic import Field

from app.models.asset import Asset, AssetId
from app.models.base import ApiModel
from app.models.enums import Band, Certainty, ClashKind, TruthCategory, TruthOutcome
from app.models.geography import Junction, Landmark, Street
from app.models.work import Work, WorkId


class Bounds(ApiModel):
    min_x: float
    min_y: float
    max_x: float
    max_y: float


class Area(ApiModel):
    name: str
    bounds: Bounds


class Scene(ApiModel):
    """Shape of GET /api/scene; also the schema of seed/scene.json."""

    area: Area
    streets: list[Street]
    junctions: list[Junction]
    landmarks: list[Landmark]
    assets: list[Asset]
    works: list[Work]


class TruthExpected(ApiModel):
    outcome: TruthOutcome
    kind: ClashKind | None = None
    certainty: Certainty | None = None
    band: Band | None = None
    baseline_flagged: bool


class TruthCase(ApiModel):
    case_id: str = Field(pattern=r"^T\d+$")
    description: str
    category: TruthCategory
    work_id: WorkId
    asset_id: AssetId | None = None
    other_work_id: WorkId | None = None
    expected: TruthExpected
