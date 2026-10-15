"""Clearance-rule lookup (SPEC §7.4): the first rule that matches, top to bottom, wins."""

from collections.abc import Sequence

from app.models import Asset, Rule, Work


def rule_matches(rule: Rule, work: Work, asset: Asset) -> bool:
    """An empty ``applies_to`` list means "any"; a work without a utility never matches a
    rule that names a ``work_utility``."""
    a = rule.applies_to
    if a.work_types and work.work_type not in a.work_types:
        return False
    if a.utility and asset.utility not in a.utility:
        return False
    return not (a.work_utility and (work.utility is None or work.utility not in a.work_utility))


def find_rule(rules: Sequence[Rule], work: Work, asset: Asset) -> Rule:
    for rule in rules:
        if rule_matches(rule, work, asset):
            return rule
    raise LookupError(f"no clearance rule matches {work.id} vs {asset.id}; add a catch-all rule")
