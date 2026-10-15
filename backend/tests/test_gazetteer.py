from shapely.geometry import LineString, Point

from app.data.gazetteer import BOUNDS, JUNCTIONS, LANDMARKS, STREETS


def test_counts_and_unique_ids() -> None:
    assert len(STREETS) == 6
    assert len(JUNCTIONS) == 8
    assert len(LANDMARKS) == 5
    for items in (STREETS, JUNCTIONS, LANDMARKS):
        assert len({i.id for i in items}) == len(items)


def test_street_names_are_the_spec_names() -> None:
    assert {s.name for s in STREETS} == {
        "Vikas Marg",
        "Station Road",
        "Gulmohar Lane",
        "Nehru Path",
        "Lake View Road",
        "Sector Main Road",
    }


def test_everything_inside_sector_bounds() -> None:
    min_x, min_y, max_x, max_y = BOUNDS
    assert (max_x - min_x, max_y - min_y) == (600, 400)
    points = [p for s in STREETS for p in s.centerline]
    points += [(j.x, j.y) for j in JUNCTIONS] + [(m.x, m.y) for m in LANDMARKS]
    assert all(min_x <= x <= max_x and min_y <= y <= max_y for x, y in points)


def test_j3_and_bus_depot_exist() -> None:
    j3 = next(j for j in JUNCTIONS if j.id == "JN-03")
    assert j3.name == "J3 — Vikas Marg × Station Road"
    assert (j3.x, j3.y) == (180, 200)
    assert any(m.name == "Bus Depot" for m in LANDMARKS)


def test_junctions_lie_on_both_named_streets() -> None:
    for j in JUNCTIONS:
        named = [s for s in STREETS if s.name in j.name]
        assert len(named) == 2, j.name
        for s in named:
            assert LineString(s.centerline).distance(Point(j.x, j.y)) < 1e-9, (j.id, s.id)
