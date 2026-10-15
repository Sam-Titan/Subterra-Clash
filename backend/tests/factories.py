"""Small builders shared by the engine tests."""

from datetime import date

from app.models import (
    Asset,
    Point2,
    Point3,
    RecordMethod,
    SourcePermit,
    SourceRecord,
    Utility,
    Work,
    WorkType,
)


def make_asset(
    path: list[Point3],
    diameter_m: float = 0.3,
    utility: Utility = Utility.WATER,
    *,
    id: str = "AST-9001",
    horiz: float = 0.1,
    depth_prec: float | None = 0.1,
    depth_known: bool = True,
) -> Asset:
    return Asset(
        id=id,
        utility=utility,
        owner="Test Dept",
        label=f"test {utility.value.lower()} line",
        path=path,
        diameter_m=diameter_m,
        horiz_precision_m=horiz,
        depth_precision_m=depth_prec,
        depth_known=depth_known,
        source_record=SourceRecord(
            record_id="REC-1",
            source="test",
            captured_on=date(2020, 1, 1),
            method=RecordMethod.AS_BUILT,
        ),
    )


def make_work(
    work_type: WorkType = WorkType.TRENCH,
    path: list[Point2] | None = None,
    *,
    id: str = "WRK-901",
    utility: Utility | None = None,
    width_m: float = 2.0,
    depth_from_m: float = 0.0,
    depth_to_m: float = 1.5,
    bore_path: list[Point3] | None = None,
    bore_diameter_m: float | None = None,
    start: date = date(2026, 11, 1),
    end: date = date(2026, 11, 10),
) -> Work:
    return Work(
        id=id,
        title=f"test work {id}",
        agency="Test Agency",
        work_type=work_type,
        utility=utility,
        path=path or [(0.0, 0.0), (10.0, 0.0)],
        width_m=width_m,
        depth_from_m=depth_from_m,
        depth_to_m=depth_to_m,
        bore_path=bore_path,
        bore_diameter_m=bore_diameter_m,
        start_date=start,
        end_date=end,
        source_permit=SourcePermit(permit_no="P-1", source="test", submitted_on=date(2026, 10, 1)),
    )
