from typing import Annotated

from pydantic import Field

from app.models.base import ApiModel

Point2 = tuple[float, float]
Point3 = tuple[float, float, float]

StreetId = Annotated[str, Field(pattern=r"^ST-\d{2,}$")]
JunctionId = Annotated[str, Field(pattern=r"^JN-\d{2,}$")]
LandmarkId = Annotated[str, Field(pattern=r"^LM-\d{2,}$")]


class Street(ApiModel):
    id: StreetId
    name: str
    centerline: list[Point2] = Field(min_length=2)
    width_m: float = Field(gt=0)


class Junction(ApiModel):
    id: JunctionId
    name: str
    x: float
    y: float


class Landmark(ApiModel):
    id: LandmarkId
    name: str
    x: float
    y: float
