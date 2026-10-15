from datetime import UTC, datetime

from app.models import Review, ReviewStatus
from app.store import Store


def test_seeded_analysis_on_load(store: Store) -> None:
    assert len(store.clashes()) == 13
    assert len(store.groups()) == 8
    assert len(store.scene.assets) == 72
    assert len(store.scene.works) == 11


def test_groups_ordered_by_review_rank(store: Store) -> None:
    assert [g.review_rank for g in store.groups()] == list(range(1, 9))


def test_reanalyze_keeps_ids_stable(store: Store) -> None:
    before = [(c.id, c.work_ids, c.asset_ids) for c in store.clashes()]
    store.reanalyze()
    assert [(c.id, c.work_ids, c.asset_ids) for c in store.clashes()] == before


def test_review_survives_reanalyze_and_attaches_to_stable_key(store: Store) -> None:
    review = Review(
        status=ReviewStatus.ACKNOWLEDGED,
        reviewer="A. Sharma",
        note="Field check booked",
        updated_at=datetime.now(UTC),
    )
    assert store.set_review("CLH-0001", review) is not None
    store.reanalyze()
    clash = store.clash("CLH-0001")
    assert clash is not None
    assert clash.review.status == ReviewStatus.ACKNOWLEDGED
    assert clash.review.reviewer == "A. Sharma"
    others = [c for c in store.clashes() if c.id != "CLH-0001"]
    assert all(c.review.status == ReviewStatus.OPEN for c in others)


def test_set_review_unknown_id_returns_none(store: Store) -> None:
    assert store.set_review("CLH-9999", Review()) is None


def test_reset_clears_reviews_and_logs_audit(store: Store) -> None:
    store.set_review("CLH-0001", Review(status=ReviewStatus.ESCALATED, reviewer="X"))
    store.reset()
    clash = store.clash("CLH-0001")
    assert clash is not None
    assert clash.review.status == ReviewStatus.OPEN
    assert len(store.clashes()) == 13
    assert [a.action for a in store.audit] == ["RESET"]
    store.reset()
    assert [a.action for a in store.audit] == ["RESET", "RESET"]
    assert [a.id for a in store.audit] == ["AUD-0002", "AUD-0001"]


def test_stores_are_independent(store: Store) -> None:
    other = Store()
    store.set_review("CLH-0001", Review(status=ReviewStatus.DISMISSED, note="n"))
    clash = other.clash("CLH-0001")
    assert clash is not None
    assert clash.review.status == ReviewStatus.OPEN
