from app.data.loader import load_rules
from app.models import Utility, WorkType

EXCAVATION = {WorkType.TRENCH, WorkType.PIT, WorkType.HDD}


def test_six_rules_in_spec_order_with_spec_values() -> None:
    rules = load_rules()
    assert [(r.id, r.min_clearance_m) for r in rules] == [
        ("R-EXC-GAS", 1.0),
        ("R-EXC-POWER", 0.6),
        ("R-EXC-OTHER", 0.3),
        ("R-WATER-SEWER", 0.5),
        ("R-PIPE-GAS", 0.5),
        ("R-DEFAULT", 0.3),
    ]


def test_applies_to_scopes() -> None:
    by_id = {r.id: r.applies_to for r in load_rules()}
    assert set(by_id["R-EXC-GAS"].work_types) == EXCAVATION
    assert by_id["R-EXC-GAS"].utility == [Utility.GAS]
    assert by_id["R-EXC-POWER"].utility == [Utility.POWER]
    assert set(by_id["R-EXC-OTHER"].utility) == {Utility.WATER, Utility.SEWER, Utility.TELECOM}
    assert by_id["R-WATER-SEWER"].work_types == [WorkType.PIPE_LAY]
    assert by_id["R-WATER-SEWER"].utility == [Utility.SEWER]
    assert by_id["R-WATER-SEWER"].work_utility == [Utility.WATER]
    assert by_id["R-PIPE-GAS"].work_types == [WorkType.PIPE_LAY]
    assert by_id["R-PIPE-GAS"].utility == [Utility.GAS]
    default = by_id["R-DEFAULT"]
    assert default.work_types == [] and default.utility == [] and default.work_utility == []
