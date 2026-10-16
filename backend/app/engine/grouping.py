"""Group related clashes and rank groups for review (SPEC §7.6)."""

import math
from collections.abc import Sequence

import networkx as nx
from shapely.geometry import LineString, Point

from app.models import Band, Clash, ClashGroup, Street, Work

GROUP_RADIUS_M = 15.0


def _num(clash_id: str) -> int:
    return int(clash_id.rsplit("-", 1)[1])


def nearest_street_id(x: float, y: float, streets: Sequence[Street]) -> str | None:
    best: tuple[float, str] | None = None
    p = Point(x, y)
    for s in streets:
        d = LineString(s.centerline).distance(p)
        if best is None or (d, s.id) < best:
            best = (d, s.id)
    return best[1] if best else None


def group_clashes(
    clashes: Sequence[Clash], works: Sequence[Work], streets: Sequence[Street]
) -> tuple[list[Clash], list[ClashGroup]]:
    """Connect clashes that share a work, or lie within 15 m on the same street.

    Group ids ``GRP-01…`` follow the smallest stable clash id in each group; ``review_rank``
    orders groups with any conflict (a non-INFO clash) before INFO-only groups (dig-once
    coordination opportunities), then by max severity, clash count, id. Returns clashes with
    ``group_id`` set (inputs are not mutated).
    """
    graph: nx.Graph = nx.Graph()
    ordered = sorted(clashes, key=lambda c: _num(c.id))
    graph.add_nodes_from(c.id for c in ordered)
    street_of = {c.id: nearest_street_id(c.location.x, c.location.y, streets) for c in ordered}

    for i, a in enumerate(ordered):
        for b in ordered[i + 1 :]:
            shares_work = bool(set(a.work_ids) & set(b.work_ids))
            near = (
                street_of[a.id] == street_of[b.id]
                and math.hypot(a.location.x - b.location.x, a.location.y - b.location.y)
                <= GROUP_RADIUS_M
            )
            if shares_work or near:
                graph.add_edge(a.id, b.id)

    by_id = {c.id: c for c in ordered}
    work_title = {w.id: w.title for w in works}
    components = sorted(
        (sorted(comp, key=_num) for comp in nx.connected_components(graph)),
        key=lambda comp: _num(comp[0]),
    )

    groups: list[ClashGroup] = []
    for n, comp in enumerate(components, start=1):
        members = [by_id[cid] for cid in comp]
        top = max(members, key=lambda c: (c.severity.score, -_num(c.id)))
        work_ids = sorted({w for c in members for w in c.work_ids})
        count = len(members)
        title = (
            f"{work_title.get(top.work_ids[0], top.work_ids[0])} — "
            f"{count} clash{'es' if count != 1 else ''}, highest {top.severity.band.value}"
        )
        groups.append(
            ClashGroup(
                id=f"GRP-{n:02d}",
                clash_ids=comp,
                work_ids=work_ids,
                max_severity_score=top.severity.score,
                review_rank=1,  # set below
                title=title,
            )
        )

    def info_only(g: ClashGroup) -> bool:
        return all(by_id[cid].severity.band is Band.INFO for cid in g.clash_ids)

    ranked = sorted(
        groups, key=lambda g: (info_only(g), -g.max_severity_score, -len(g.clash_ids), g.id)
    )
    rank = {g.id: i for i, g in enumerate(ranked, start=1)}
    groups = [g.model_copy(update={"review_rank": rank[g.id]}) for g in groups]

    gid_of = {cid: g.id for g in groups for cid in g.clash_ids}
    updated = [c.model_copy(update={"group_id": gid_of[c.id]}) for c in ordered]
    return updated, groups
