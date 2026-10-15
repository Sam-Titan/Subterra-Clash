"""In-memory state: seeded scene + rules, the latest analysis and review decisions.

Review state is keyed by the engine's stable clash key (not the CLH id string), so decisions
survive re-analysis. ``reset()`` restores the seed and clears every decision.
"""

import threading
from collections.abc import Sequence
from datetime import UTC, datetime

from app.config import get_settings
from app.data.loader import load_rules, load_scene, load_truth
from app.engine.analyze import AnalysisResult, ClashKey, analyze
from app.models import Asset, AuditEntry, Clash, ClashGroup, Review, Rule, Scene, TruthCase, Work


class Store:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self.reset(log=False)

    # -- lifecycle ---------------------------------------------------------------------
    def reset(self, *, log: bool = True) -> None:
        """Restore seed state: drops intake works and review decisions, keeps the audit log."""
        with self._lock:
            audit = getattr(self, "_audit", [])
            self._scene: Scene = load_scene()
            self._rules: list[Rule] = load_rules()
            self._truth: list[TruthCase] = load_truth()
            self._reviews: dict[ClashKey, Review] = {}
            self._audit: list[AuditEntry] = audit
            self._result: AnalysisResult = analyze(
                self._scene, self._rules, get_settings().demo_date
            )
            if log:
                self.log_audit("system", "RESET", None, "State restored to seed data")

    def reanalyze(self) -> AnalysisResult:
        """Re-run the engine on the current scene, keeping clash ids stable."""
        with self._lock:
            self._result = analyze(
                self._scene,
                self._rules,
                get_settings().demo_date,
                previous_ids=self._result.key_to_id,
            )
            return self._result

    # -- reads -------------------------------------------------------------------------
    @property
    def scene(self) -> Scene:
        return self._scene

    @property
    def rules(self) -> list[Rule]:
        return list(self._rules)

    @property
    def truth(self) -> list[TruthCase]:
        return list(self._truth)

    @property
    def result(self) -> AnalysisResult:
        return self._result

    @property
    def audit(self) -> list[AuditEntry]:
        """Newest first."""
        with self._lock:
            return list(reversed(self._audit))

    def clashes(self) -> list[Clash]:
        """Engine order, with stored review decisions overlaid."""
        with self._lock:
            out: list[Clash] = []
            for c in self._result.clashes:
                review = self._reviews.get(self._result.id_to_key[c.id])
                out.append(c.model_copy(update={"review": review}) if review else c)
            return out

    def clash(self, clash_id: str) -> Clash | None:
        return next((c for c in self.clashes() if c.id == clash_id), None)

    def groups(self) -> list[ClashGroup]:
        return sorted(self._result.groups, key=lambda g: g.review_rank)

    def rule(self, rule_id: str | None) -> Rule | None:
        return next((r for r in self._rules if r.id == rule_id), None)

    def assets_by_id(self, ids: Sequence[str]) -> list[Asset]:
        by_id = {a.id: a for a in self._scene.assets}
        return [by_id[i] for i in ids if i in by_id]

    def works_by_id(self, ids: Sequence[str]) -> list[Work]:
        by_id = {w.id: w for w in self._scene.works}
        return [by_id[i] for i in ids if i in by_id]

    # -- writes ------------------------------------------------------------------------
    def set_review(self, clash_id: str, review: Review) -> Clash | None:
        with self._lock:
            key = self._result.id_to_key.get(clash_id)
            if key is None:
                return None
            self._reviews[key] = review
            return self.clash(clash_id)

    def log_audit(self, actor: str, action: str, target_id: str | None, detail: str) -> AuditEntry:
        with self._lock:
            entry = AuditEntry(
                id=f"AUD-{len(self._audit) + 1:04d}",
                at=datetime.now(UTC),
                actor=actor,
                action=action,
                target_id=target_id,
                detail=detail,
            )
            self._audit.append(entry)
            return entry


_store: Store | None = None
_store_lock = threading.Lock()


def get_store() -> Store:
    global _store
    with _store_lock:
        if _store is None:
            _store = Store()
        return _store
