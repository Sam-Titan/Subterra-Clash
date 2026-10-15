from typing import Annotated

from pydantic import BaseModel, Field

Point2 = tuple[float, float]
Point3 = tuple[float, float, float]

StreetId = Annotated[str, Field(pattern=r"^ST-\d{2,}$")]
JunctionId = Annotated[str, Field(pattern=r"^JN-\d{2,}$")]
LandmarkId = Annotated[str, Field(pattern=r"^LM-\d{2,}$")]


class Street(BaseModel):
    id: StreetId
    name: str
    centerline: list[Point2] = Field(min_length=2)
    width_m: float = Field(gt=0)


class Junction(BaseModel):
    id: JunctionId
    name: str
    x: float
    y: float


class Landmark(BaseModel):
    id: LandmarkId
    name: str
    x: float
    y: float
