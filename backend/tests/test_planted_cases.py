"""T1–T9 outcomes on the real seed and the SPEC §8.7 evaluation numbers, plus id stability."""

from datetime import date

import pytest

from app.data.loader import load_rules, load_scene, load_truth
from app.engine.analyze import analyze
from app.engine.baseline import evaluate
from app.models import Band, Certainty, Clash, ClashKind, TruthCase

TODAY = date(2026, 10, 28)
SCENE = load_scene()
RULES = load_rules()
TRUTH = {t.case_id: t for t in load_truth()}
RESULT = analyze(SCENE, RULES, TODAY)


def find(case: TruthCase) -> Clash | None:
    for c in RESULT.clashes:
        if case.other_work_id is not None:
            if set(c.work_ids) == {case.work_id, case.other_work_id}:
                return c
        elif case.asset_id is not None:
            if case.work_id in c.work_ids and case.asset_id in c.asset_ids:
                return c
        elif case.work_id in c.work_ids:
            return c
    return None


def approx(v: float) -> object:
    return pytest.approx(v, abs=1e-3)


def test_t1_trench_through_gas_main() -> None:
    c = find(TRUTH["T1"])
    assert c is not None
    assert (c.kind, c.certainty, c.severity.band) == (
        ClashKind.INTERSECTION,
        Certainty.LIKELY,
        Band.CRITICAL,
    )
    assert c.measured_gap_m == approx(-0.6)
    assert c.required_clearance_m == 1.0
    assert c.rule_id == "R-EXC-GAS"
    assert c.baseline_flagged is True


def test_t2_hdd_beside_power_cable() -> None:
    c = find(TRUTH["T2"])
    assert c is not None
    assert (c.kind, c.certainty) == (ClashKind.CLEARANCE, Certainty.LIKELY)
    assert c.measured_gap_m == approx(0.18)
    assert c.uncertainty_m == approx(0.283)
    assert c.baseline_flagged is False


def test_t3_digitised_telecom_is_possible() -> None:
    c = find(TRUTH["T3"])
    assert c is not None
    assert (c.kind, c.certainty) == (ClashKind.CLEARANCE, Certainty.POSSIBLE)
    assert c.measured_gap_m == approx(1.045)
    assert c.uncertainty_m == approx(2.062)
    assert c.rule_id == "R-DEFAULT"
    assert c.baseline_flagged is False


def test_t4_deep_sewer_is_no_clash_but_baseline_false_alarm() -> None:
    case = TRUTH["T4"]
    assert find(case) is None
    assert (case.work_id, case.asset_id) in RESULT.baseline_pairs


def test_t5_parallel_water_main_is_likely() -> None:
    c = find(TRUTH["T5"])
    assert c is not None
    assert (c.kind, c.certainty) == (ClashKind.CLEARANCE, Certainty.LIKELY)
    assert c.measured_gap_m == approx(0.2)
    assert c.baseline_flagged is False


def test_t6_unknown_depth_is_needs_data_and_never_invents_a_gap() -> None:
    c = find(TRUTH["T6"])
    assert c is not None
    assert (c.kind, c.certainty) == (ClashKind.CLEARANCE, Certainty.NEEDS_DATA)
    assert c.measured_gap_m is None
    assert c.uncertainty_m is None
    assert c.missing_data == ["AST-0027.depth"]
    assert c.baseline_flagged is True


def test_t7_schedule_overlap() -> None:
    c = find(TRUTH["T7"])
    assert c is not None
    assert c.kind is ClashKind.SCHEDULE_OVERLAP
    assert c.schedule is not None
    assert c.schedule.overlap_days == 5  # Nov 16..20 inclusive


def test_t8_dig_once_is_info() -> None:
    c = find(TRUTH["T8"])
    assert c is not None
    assert (c.kind, c.certainty, c.severity.band) == (
        ClashKind.DIG_ONCE,
        Certainty.LIKELY,
        Band.INFO,
    )
    assert c.schedule is not None
    assert c.schedule.gap_days == 45  # Nov 13 -> Dec 28


def test_t9_isolated_trench_has_no_clash_and_no_baseline_hit() -> None:
    case = TRUTH["T9"]
    assert find(case) is None
    assert not any(w == case.work_id for w, _ in RESULT.baseline_pairs)


def test_evaluation_numbers_match_spec() -> None:
    ev = evaluate(list(TRUTH.values()), RESULT.clashes, RESULT.baseline_pairs)
    assert (ev.ours.found, ev.ours.false_alarms, ev.ours.misses) == (5, 0, 0)
    assert (ev.ours.precision, ev.ours.recall) == (1.0, 1.0)
    assert (ev.baseline.found, ev.baseline.false_alarms, ev.baseline.misses) == (2, 1, 3)
    assert ev.baseline.precision == 0.67
    assert ev.baseline.recall == 0.4
    assert all(r.passed for r in ev.cases)
    for r in ev.cases:
        assert r.baseline_flagged == TRUTH[r.case_id].expected.baseline_flagged


# ------------------------------------------------------------ domain rules


def test_every_clash_has_rule_evidence_and_visible_uncertainty() -> None:
    for c in RESULT.clashes:
        assert c.explanation
        assert c.evidence, c.id
        if c.kind in (ClashKind.INTERSECTION, ClashKind.CLEARANCE):
            types = {e.type for e in c.evidence}
            assert {"ASSET_RECORD", "PERMIT", "RULE", "PRECISION"} <= types
            assert c.rule_id and c.required_clearance_m is not None
        if c.certainty is Certainty.NEEDS_DATA:
            assert c.missing_data
        text = c.explanation.lower()
        assert "approve" not in text
        assert "reject" not in text


def test_analysis_is_deterministic() -> None:
    again = analyze(SCENE, RULES, TODAY)
    assert [c.model_dump() for c in again.clashes] == [c.model_dump() for c in RESULT.clashes]
    assert [g.model_dump() for g in again.groups] == [g.model_dump() for g in RESULT.groups]
    ids = [c.id for c in RESULT.clashes]
    assert len(set(ids)) == len(ids)


# ------------------------------------------------------------ stable ids


def test_clash_ids_are_stable_when_a_work_is_added() -> None:
    new_work = SCENE.works[0].model_copy(update={"id": "WRK-012", "title": "Added trench"})
    bigger = SCENE.model_copy(update={"works": [*SCENE.works, new_work]})

    # Without previous ids the new work (sorted after WRK-011) shifts the schedule ids...
    naive = analyze(bigger, RULES, TODAY)
    naive_map = {naive.id_to_key[c.id]: c.id for c in naive.clashes}
    assert any(naive_map[k] != v for k, v in RESULT.key_to_id.items())

    # ...with previous ids every original keeps its CLH id.
    second = analyze(bigger, RULES, TODAY, previous_ids=RESULT.key_to_id)
    new_by_id = {c.id: c for c in second.clashes}
    for key, cid in RESULT.key_to_id.items():
        assert second.key_to_id[key] == cid
        assert second.id_to_key[cid] == key
        assert cid in new_by_id

    old_max = max(int(v.rsplit("-", 1)[1]) for v in RESULT.key_to_id.values())
    fresh = [c for c in second.clashes if c.id not in RESULT.id_to_key]
    assert fresh
    assert all(int(c.id.rsplit("-", 1)[1]) > old_max for c in fresh)
    assert all("WRK-012" in c.work_ids for c in fresh)
    assert any(c.kind is ClashKind.INTERSECTION for c in fresh)  # spatial
    assert any(c.kind is ClashKind.SCHEDULE_OVERLAP for c in fresh)  # schedule

    # new keys are numbered in engine order: spatial (by asset id) before schedule
    nums = [int(c.id.rsplit("-", 1)[1]) for c in sorted(fresh, key=lambda c: c.id)]
    assert nums == list(range(old_max + 1, old_max + 1 + len(fresh)))
    spatial = [c for c in fresh if c.asset_ids]
    schedule = [c for c in fresh if not c.asset_ids]
    assert max(c.id for c in spatial) < min(c.id for c in schedule)
    assert [c.asset_ids[0] for c in sorted(spatial, key=lambda c: c.id)] == sorted(
        c.asset_ids[0] for c in spatial
    )


def test_previous_ids_are_never_reused_when_a_clash_disappears() -> None:
    fewer = SCENE.model_copy(update={"works": [w for w in SCENE.works if w.id != "WRK-006"]})
    r = analyze(fewer, RULES, TODAY, previous_ids=RESULT.key_to_id)
    assert r.key_to_id == RESULT.key_to_id  # retired key stays reserved
    assert len(r.clashes) == len(RESULT.clashes) - 1
