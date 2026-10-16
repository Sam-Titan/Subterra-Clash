"""Deterministic seed generator: `python -m app.data.generator`.

Writes `seed/scene.json` (GET /api/scene shape) and `seed/truth.json` (planted cases T1-T9,
SPEC §8.7). Filler assets use `random.Random(42)`; planted assets and works are hand-set
with the exact SPEC values and never touch the RNG.
"""

import json
import random
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path

from app.data.gazetteer import BOUNDS, JUNCTIONS, LANDMARKS, STREETS
from app.models import (
    Area,
    Asset,
    Bounds,
    Certainty,
    ClashKind,
    Point3,
    RecordMethod,
    Scene,
    SourcePermit,
    SourceRecord,
    Street,
    TruthCase,
    TruthCategory,
    TruthExpected,
    TruthOutcome,
    Utility,
    Work,
    WorkType,
)
from app.models.enums import Band

SEED_DIR = Path(__file__).parent / "seed"
CHUNK_M = 200.0  # filler lanes are cut into segments at multiples of this


@dataclass(frozen=True)
class Lane:
    utility: Utility
    offset: float  # signed distance from street centreline (+north / +east)
    depth: float  # base centre depth (positive m)


LANES: dict[str, list[Lane]] = {
    "ST-01": [
        Lane(Utility.SEWER, 0.0, 4.0),
        Lane(Utility.WATER, 3.5, 1.5),
        Lane(Utility.GAS, -6.0, 1.0),
        Lane(Utility.POWER, 7.0, 0.9),
        Lane(Utility.TELECOM, -8.0, 0.7),
    ],
    "ST-02": [
        Lane(Utility.SEWER, 0.0, 3.8),
        Lane(Utility.WATER, 2.5, 1.4),
        Lane(Utility.GAS, 4.5, 1.0),
        Lane(Utility.TELECOM, 6.0, 0.7),
        Lane(Utility.POWER, -6.0, 1.0),
    ],
    "ST-03": [
        Lane(Utility.SEWER, 0.0, 3.6),
        Lane(Utility.POWER, 3.5, 0.9),
        Lane(Utility.TELECOM, -3.5, 0.7),
    ],
    "ST-04": [
        Lane(Utility.SEWER, 0.0, 3.8),
        Lane(Utility.WATER, 2.5, 1.4),
        Lane(Utility.GAS, -4.0, 1.0),
        Lane(Utility.TELECOM, 4.5, 0.7),
    ],
    "ST-05": [
        Lane(Utility.WATER, 0.0, 1.4),
        Lane(Utility.POWER, 4.0, 0.9),
        Lane(Utility.TELECOM, -4.0, 0.7),
    ],
    "ST-06": [
        Lane(Utility.SEWER, 0.0, 3.9),
        Lane(Utility.WATER, -4.0, 1.4),
        Lane(Utility.GAS, 5.5, 1.0),
        Lane(Utility.POWER, -6.5, 0.9),
        Lane(Utility.TELECOM, 7.0, 0.7),
    ],
}


@dataclass(frozen=True)
class Profile:
    owner: str
    prefix: str
    kind: str
    diameters: tuple[float, ...]
    methods: tuple[RecordMethod, ...]


PROFILES: dict[Utility, Profile] = {
    Utility.GAS: Profile(
        "Navgarh Gas Ltd",
        "NGL-GIS",
        "MDPE gas main",
        (0.11, 0.16, 0.2),
        (RecordMethod.SURVEYED, RecordMethod.AS_BUILT),
    ),
    Utility.POWER: Profile(
        "NVVN Discom",
        "NVVN-AB",
        "power cable",
        (0.1, 0.15),
        (RecordMethod.AS_BUILT, RecordMethod.SURVEYED),
    ),
    Utility.TELECOM: Profile(
        "Navgarh FiberNet",
        "NFN-GIS",
        "HDPE telecom duct",
        (0.11,),
        (RecordMethod.DIGITISED, RecordMethod.AS_BUILT),
    ),
    Utility.WATER: Profile(
        "Navgarh Jal Board",
        "NJB-WT",
        "DI water main",
        (0.2, 0.3, 0.4),
        (RecordMethod.AS_BUILT, RecordMethod.SURVEYED),
    ),
    Utility.SEWER: Profile(
        "Navgarh Jal Board",
        "NJB-SW",
        "RCC sewer",
        (0.45, 0.6),
        (RecordMethod.AS_BUILT,),
    ),
}

PRECISION: dict[RecordMethod, tuple[tuple[float, float], ...]] = {
    RecordMethod.SURVEYED: ((0.1, 0.1), (0.2, 0.2)),
    RecordMethod.AS_BUILT: ((0.15, 0.2), (0.25, 0.3), (0.3, 0.3)),
    RecordMethod.DIGITISED: ((1.0, 0.4), (2.0, 0.5)),
    RecordMethod.ESTIMATED: ((0.5, 0.5),),
}

SOURCE_NAME: dict[RecordMethod, str] = {
    RecordMethod.SURVEYED: "GIS export",
    RecordMethod.AS_BUILT: "as-built drawings",
    RecordMethod.DIGITISED: "scanned route map",
    RecordMethod.ESTIMATED: "feeder sketch",
}


@dataclass(frozen=True)
class Planted:
    """A hand-set asset occupying `span` (along-street metres) of a street lane."""

    key: str
    street_id: str
    utility: Utility
    span: tuple[float, float]
    depth: float
    diameter_m: float
    horiz_precision_m: float
    depth_precision_m: float | None
    depth_known: bool
    label: str
    owner: str
    record_id: str
    source: str
    captured_on: date
    method: RecordMethod


PLANTED: list[Planted] = [
    Planted(  # T1: gas main under the Station Road crossing trench
        "T1_GAS",
        "ST-01",
        Utility.GAS,
        (250, 350),
        1.0,
        0.2,
        0.2,
        0.2,
        True,
        "200 mm MDPE gas main",
        "Navgarh Gas Ltd",
        "NGL-GIS-1187",
        "Navgarh Gas Ltd GIS export",
        date(2023, 6, 14),
        RecordMethod.SURVEYED,
    ),
    Planted(  # T2: power cable the HDD bore runs alongside
        "T2_POWER",
        "ST-05",
        Utility.POWER,
        (300, 400),
        1.2,
        0.15,
        0.2,
        0.2,
        True,
        "11 kV XLPE cable",
        "NVVN Discom",
        "NVVN-SV-0457",
        "NVVN survey export",
        date(2022, 3, 8),
        RecordMethod.SURVEYED,
    ),
    Planted(  # T3: old digitised duct next to the new water pipe
        "T3_TELECOM",
        "ST-03",
        Utility.TELECOM,
        (220, 300),
        0.7,
        0.11,
        2.0,
        0.5,
        True,
        "110 mm HDPE telecom duct",
        "Navgarh FiberNet",
        "NFN-PAPER-044",
        "Scanned 2011 route map",
        date(2011, 9, 30),
        RecordMethod.DIGITISED,
    ),
    Planted(  # T4: deep trunk sewer, no clash despite the crossing trench
        "T4_SEWER",
        "ST-04",
        Utility.SEWER,
        (250, 350),
        4.2,
        0.6,
        0.25,
        0.3,
        True,
        "600 mm RCC trunk sewer",
        "Navgarh Jal Board",
        "NJB-SW-0073",
        "Jal Board sewer register",
        date(2016, 11, 21),
        RecordMethod.AS_BUILT,
    ),
    Planted(  # T5: surveyed water main the new pipe is laid beside
        "T5_WATER",
        "ST-04",
        Utility.WATER,
        (20, 180),
        1.4,
        0.3,
        0.05,
        0.05,
        True,
        "300 mm DI water main",
        "Navgarh Jal Board",
        "NJB-WT-0212",
        "Jal Board GIS export",
        date(2024, 1, 19),
        RecordMethod.SURVEYED,
    ),
    Planted(  # T6: cable with unknown depth under the pit
        "T6_POWER",
        "ST-02",
        Utility.POWER,
        (200, 260),
        1.0,
        0.1,
        0.5,
        None,
        False,
        "LT cable (depth not recorded)",
        "NVVN Discom",
        "NVVN-LT-0912",
        "NVVN feeder sketch",
        date(2008, 4, 11),
        RecordMethod.ESTIMATED,
    ),
]


def _lane_point(street: Street, along: float, offset: float, z: float) -> Point3:
    (x0, y0), (_, y1) = street.centerline[0], street.centerline[-1]
    if y0 == y1:  # east-west
        return (round(along, 3), round(y0 + offset, 3), z)
    return (round(x0 + offset, 3), round(along, 3), z)


def _source(profile: Profile, method: RecordMethod, record_id: str, captured: date) -> SourceRecord:
    return SourceRecord(
        record_id=record_id,
        source=f"{profile.owner} {SOURCE_NAME[method]}",
        captured_on=captured,
        method=method,
    )


def _build_assets(rng: random.Random) -> tuple[list[Asset], dict[str, str]]:
    planted_by_lane: dict[tuple[str, Utility], Planted] = {
        (p.street_id, p.utility): p for p in PLANTED
    }
    used_records = {p.record_id for p in PLANTED}
    drafts: list[tuple[str | None, Asset]] = []  # (planted key, asset with placeholder id)

    for street in STREETS:
        length = max(
            abs(street.centerline[-1][0] - street.centerline[0][0]),
            abs(street.centerline[-1][1] - street.centerline[0][1]),
        )
        for lane in LANES[street.id]:
            planted = planted_by_lane.get((street.id, lane.utility))
            profile = PROFILES[lane.utility]
            cuts = {0.0, length}
            cuts.update(
                i * CHUNK_M for i in range(1, int(length // CHUNK_M) + 1) if i * CHUNK_M < length
            )
            if planted:
                cuts.update(planted.span)
            stops = sorted(cuts)
            for start, end in zip(stops, stops[1:], strict=False):
                if planted and (start, end) == planted.span:
                    z = -planted.depth
                    drafts.append(
                        (
                            planted.key,
                            Asset(
                                id="AST-0000",
                                utility=planted.utility,
                                owner=planted.owner,
                                label=planted.label,
                                path=[
                                    _lane_point(street, start, lane.offset, z),
                                    _lane_point(street, end, lane.offset, z),
                                ],
                                diameter_m=planted.diameter_m,
                                horiz_precision_m=planted.horiz_precision_m,
                                depth_precision_m=planted.depth_precision_m,
                                depth_known=planted.depth_known,
                                source_record=SourceRecord(
                                    record_id=planted.record_id,
                                    source=planted.source,
                                    captured_on=planted.captured_on,
                                    method=planted.method,
                                ),
                            ),
                        )
                    )
                    continue
                method = rng.choice(profile.methods)
                horiz, depth_p = rng.choice(PRECISION[method])
                diameter = rng.choice(profile.diameters)
                z = -round(lane.depth + rng.choice((-0.1, 0.0, 0.1)), 2)
                record_id = f"{profile.prefix}-{rng.randint(1000, 9999)}"
                while record_id in used_records:
                    record_id = f"{profile.prefix}-{rng.randint(1000, 9999)}"
                used_records.add(record_id)
                captured = date(2008, 1, 1) + timedelta(days=rng.randrange(0, 6200))
                drafts.append(
                    (
                        None,
                        Asset(
                            id="AST-0000",
                            utility=lane.utility,
                            owner=profile.owner,
                            label=f"{round(diameter * 1000)} mm {profile.kind}",
                            path=[
                                _lane_point(street, start, lane.offset, z),
                                _lane_point(street, end, lane.offset, z),
                            ],
                            diameter_m=diameter,
                            horiz_precision_m=horiz,
                            depth_precision_m=depth_p,
                            depth_known=True,
                            source_record=_source(profile, method, record_id, captured),
                        ),
                    )
                )

    assets: list[Asset] = []
    planted_ids: dict[str, str] = {}
    for n, (key, asset) in enumerate(drafts, start=1):
        asset = asset.model_copy(update={"id": f"AST-{n:04d}"})
        assets.append(asset)
        if key:
            planted_ids[key] = asset.id
    return assets, planted_ids


def _permit(no: str, source: str, submitted: date) -> SourcePermit:
    return SourcePermit(permit_no=no, source=source, submitted_on=submitted)


def _build_works() -> list[Work]:
    portal = "Municipal permit portal"
    return [
        Work(  # T1
            id="WRK-001",
            title="Fibre ducting crossing, Station Road",
            agency="Navgarh FiberNet",
            work_type=WorkType.TRENCH,
            utility=Utility.TELECOM,
            path=[(300, 188), (300, 212)],
            width_m=0.8,
            depth_from_m=0.0,
            depth_to_m=1.5,
            start_date=date(2026, 11, 3),
            end_date=date(2026, 11, 12),
            source_permit=_permit("NFN/2026/0412", portal, date(2026, 10, 2)),
        ),
        Work(  # T6
            id="WRK-002",
            title="LT cable jointing pit, Vikas Marg",
            agency="NVVN Discom",
            work_type=WorkType.PIT,
            utility=Utility.POWER,
            path=[(172, 230), (176, 230), (176, 234), (172, 234), (172, 230)],
            width_m=4.0,
            depth_from_m=0.0,
            depth_to_m=2.0,
            start_date=date(2026, 11, 5),
            end_date=date(2026, 11, 9),
            source_permit=_permit("NVVN/2026/0188", "NVVN work order", date(2026, 10, 6)),
        ),
        Work(  # T2: bore centre 0.355 m north of the cable (surface gap 0.18 m)
            id="WRK-003",
            title="Fibre HDD bore, Lake View Road",
            agency="Navgarh FiberNet",
            work_type=WorkType.HDD,
            utility=Utility.TELECOM,
            path=[(320, 84.355), (380, 84.355)],
            width_m=0.2,
            depth_from_m=1.1,
            depth_to_m=1.3,
            bore_path=[(320, 84.355, -1.2), (380, 84.355, -1.2)],
            bore_diameter_m=0.2,
            start_date=date(2026, 11, 16),
            end_date=date(2026, 11, 20),
            source_permit=_permit("NFN/2026/0431", portal, date(2026, 10, 9)),
        ),
        Work(  # T3: pipe centre 0.7 m deep, 1.2 m inboard of the duct
            id="WRK-004",
            title="Water service pipe, Gulmohar Lane",
            agency="Navgarh Jal Board",
            work_type=WorkType.PIPE_LAY,
            utility=Utility.WATER,
            path=[(397.7, 230), (397.7, 290)],
            width_m=0.8,
            depth_from_m=0.0,
            depth_to_m=0.8,
            bore_diameter_m=0.2,
            start_date=date(2026, 11, 23),
            end_date=date(2026, 12, 4),
            source_permit=_permit("NJB/2026/052", "Jal Board work order", date(2026, 10, 12)),
        ),
        Work(  # T4
            id="WRK-005",
            title="Drain connection trench, Nehru Path",
            agency="Navgarh Municipal Corporation",
            work_type=WorkType.TRENCH,
            utility=None,
            path=[(300, 308), (300, 332)],
            width_m=0.8,
            depth_from_m=0.0,
            depth_to_m=1.5,
            start_date=date(2026, 12, 1),
            end_date=date(2026, 12, 5),
            source_permit=_permit("NMC/2026/219", portal, date(2026, 10, 14)),
        ),
        Work(  # T5: pipe centre 1.4 m deep, 0.45 m south of the main
            id="WRK-006",
            title="Water main extension, Nehru Path",
            agency="Navgarh Jal Board",
            work_type=WorkType.PIPE_LAY,
            utility=Utility.WATER,
            path=[(60, 322.05), (140, 322.05)],
            width_m=0.8,
            depth_from_m=0.0,
            depth_to_m=1.5,
            bore_diameter_m=0.2,
            start_date=date(2026, 12, 8),
            end_date=date(2026, 12, 15),
            source_permit=_permit("NJB/2026/057", "Jal Board work order", date(2026, 10, 15)),
        ),
        Work(  # T7 (A): overlaps WRK-008 by 5 days
            id="WRK-007",
            title="11 kV cable trench, Station Road (north verge)",
            agency="NVVN Discom",
            work_type=WorkType.TRENCH,
            utility=Utility.POWER,
            path=[(440, 212), (490, 212)],
            width_m=0.6,
            depth_from_m=0.0,
            depth_to_m=1.2,
            start_date=date(2026, 11, 9),
            end_date=date(2026, 11, 20),
            source_permit=_permit("NVVN/2026/0201", "NVVN work order", date(2026, 10, 8)),
        ),
        Work(  # T7 (B)
            id="WRK-008",
            title="Fibre ducting, Station Road (north verge)",
            agency="Navgarh FiberNet",
            work_type=WorkType.TRENCH,
            utility=Utility.TELECOM,
            path=[(450, 215.5), (500, 215.5)],
            width_m=0.6,
            depth_from_m=0.0,
            depth_to_m=1.0,
            start_date=date(2026, 11, 16),
            end_date=date(2026, 11, 27),
            source_permit=_permit("NFN/2026/0440", portal, date(2026, 10, 10)),
        ),
        Work(  # T8 (A): ends 13 Nov, WRK-010 starts 45 days later
            id="WRK-009",
            title="Gas service line trench, Vikas Marg (east verge)",
            agency="Navgarh Gas Ltd",
            work_type=WorkType.TRENCH,
            utility=Utility.GAS,
            path=[(192, 120), (192, 170)],
            width_m=0.6,
            depth_from_m=0.0,
            depth_to_m=1.0,
            start_date=date(2026, 11, 2),
            end_date=date(2026, 11, 13),
            source_permit=_permit("NGL/2026/071", "Navgarh Gas Ltd work order", date(2026, 9, 28)),
        ),
        Work(  # T8 (B)
            id="WRK-010",
            title="Fibre ducting, Vikas Marg (east verge)",
            agency="Navgarh FiberNet",
            work_type=WorkType.TRENCH,
            utility=Utility.TELECOM,
            path=[(195, 130), (195, 180)],
            width_m=0.6,
            depth_from_m=0.0,
            depth_to_m=1.0,
            start_date=date(2026, 12, 28),
            end_date=date(2027, 1, 8),
            source_permit=_permit("NFN/2026/0455", portal, date(2026, 10, 13)),
        ),
        Work(  # T9: block interior, away from every asset and work
            id="WRK-011",
            title="Street-light cable trench, Sector 7 block interior",
            agency="Navgarh Municipal Corporation",
            work_type=WorkType.TRENCH,
            utility=Utility.POWER,
            path=[(270, 260), (310, 260)],
            width_m=0.8,
            depth_from_m=0.0,
            depth_to_m=1.2,
            start_date=date(2026, 11, 10),
            end_date=date(2026, 11, 12),
            source_permit=_permit("NMC/2026/224", portal, date(2026, 10, 11)),
        ),
    ]


def _build_truth(ids: dict[str, str]) -> list[TruthCase]:
    def spatial(
        case: str,
        desc: str,
        work: str,
        asset_key: str | None,
        outcome: TruthOutcome,
        baseline: bool,
        kind: ClashKind | None = None,
        certainty: Certainty | None = None,
        band: Band | None = None,
    ) -> TruthCase:
        return TruthCase(
            case_id=case,
            description=desc,
            category=TruthCategory.SPATIAL,
            work_id=work,
            asset_id=ids[asset_key] if asset_key else None,
            expected=TruthExpected(
                outcome=outcome,
                kind=kind,
                certainty=certainty,
                band=band,
                baseline_flagged=baseline,
            ),
        )

    clash, none = TruthOutcome.CLASH, TruthOutcome.NO_CLASH
    return [
        spatial(
            "T1",
            "Trench cuts through a gas main (needs 1.0 m, gap -0.6 m)",
            "WRK-001",
            "T1_GAS",
            clash,
            True,
            ClashKind.INTERSECTION,
            Certainty.LIKELY,
            Band.CRITICAL,
        ),
        spatial(
            "T2",
            "HDD bore runs 0.18 m beside a power cable, never crossing in plan",
            "WRK-003",
            "T2_POWER",
            clash,
            False,
            ClashKind.CLEARANCE,
            Certainty.LIKELY,
        ),
        spatial(
            "T3",
            "New water pipe 1.05 m from a digitised telecom duct (+-2.06 m)",
            "WRK-004",
            "T3_TELECOM",
            clash,
            False,
            ClashKind.CLEARANCE,
            Certainty.POSSIBLE,
        ),
        spatial(
            "T4",
            "Trench crosses a deep trunk sewer 2.4 m below the trench floor",
            "WRK-005",
            "T4_SEWER",
            none,
            True,
        ),
        spatial(
            "T5",
            "New water pipe laid 0.2 m from a surveyed water main",
            "WRK-006",
            "T5_WATER",
            clash,
            False,
            ClashKind.CLEARANCE,
            Certainty.LIKELY,
        ),
        spatial(
            "T6",
            "Pit over a power cable whose depth is not recorded",
            "WRK-002",
            "T6_POWER",
            clash,
            True,
            ClashKind.CLEARANCE,
            Certainty.NEEDS_DATA,
        ),
        TruthCase(
            case_id="T7",
            description="Two works within 5 m on Station Road with overlapping dates",
            category=TruthCategory.SCHEDULE,
            work_id="WRK-007",
            other_work_id="WRK-008",
            expected=TruthExpected(
                outcome=clash,
                kind=ClashKind.SCHEDULE_OVERLAP,
                certainty=Certainty.LIKELY,
                baseline_flagged=False,
            ),
        ),
        TruthCase(
            case_id="T8",
            description="Two works within 5 m on Vikas Marg, 45 days apart",
            category=TruthCategory.SCHEDULE,
            work_id="WRK-009",
            other_work_id="WRK-010",
            expected=TruthExpected(
                outcome=clash,
                kind=ClashKind.DIG_ONCE,
                certainty=Certainty.LIKELY,
                band=Band.INFO,
                baseline_flagged=False,
            ),
        ),
        spatial("T9", "Trench far from every asset and work", "WRK-011", None, none, False),
    ]


def build() -> tuple[Scene, list[TruthCase]]:
    """Build the full seed in memory (pure; same output on every call)."""
    rng = random.Random(42)
    assets, planted_ids = _build_assets(rng)
    min_x, min_y, max_x, max_y = BOUNDS
    scene = Scene(
        area=Area(
            name="Navgarh — Sector 7",
            bounds=Bounds(min_x=min_x, min_y=min_y, max_x=max_x, max_y=max_y),
        ),
        streets=STREETS,
        junctions=JUNCTIONS,
        landmarks=LANDMARKS,
        assets=assets,
        works=_build_works(),
    )
    return scene, _build_truth(planted_ids)


def _dump(path: Path, data: object) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def write_seed(out_dir: Path = SEED_DIR) -> None:
    scene, truth = build()
    out_dir.mkdir(parents=True, exist_ok=True)
    _dump(out_dir / "scene.json", scene.model_dump(mode="json"))
    _dump(out_dir / "truth.json", [c.model_dump(mode="json") for c in truth])


if __name__ == "__main__":
    write_seed()
    print(f"seed written to {SEED_DIR}")
