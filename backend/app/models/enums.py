from enum import StrEnum


class Utility(StrEnum):
    WATER = "WATER"
    SEWER = "SEWER"
    POWER = "POWER"
    TELECOM = "TELECOM"
    GAS = "GAS"


class WorkType(StrEnum):
    TRENCH = "TRENCH"
    PIT = "PIT"
    HDD = "HDD"
    PIPE_LAY = "PIPE_LAY"


class WorkOrigin(StrEnum):
    SEED = "SEED"
    INTAKE = "INTAKE"


class RecordMethod(StrEnum):
    SURVEYED = "SURVEYED"
    AS_BUILT = "AS_BUILT"
    DIGITISED = "DIGITISED"
    ESTIMATED = "ESTIMATED"


class ClashKind(StrEnum):
    INTERSECTION = "INTERSECTION"
    CLEARANCE = "CLEARANCE"
    SCHEDULE_OVERLAP = "SCHEDULE_OVERLAP"
    DIG_ONCE = "DIG_ONCE"


class Certainty(StrEnum):
    LIKELY = "LIKELY"
    POSSIBLE = "POSSIBLE"
    NEEDS_DATA = "NEEDS_DATA"


class Band(StrEnum):
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"
    INFO = "INFO"


class ReviewStatus(StrEnum):
    OPEN = "OPEN"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    ESCALATED = "ESCALATED"
    DISMISSED = "DISMISSED"


class ReviewAction(StrEnum):
    ACKNOWLEDGE = "ACKNOWLEDGE"
    ESCALATE = "ESCALATE"
    DISMISS = "DISMISS"
    REOPEN = "REOPEN"


class TruthOutcome(StrEnum):
    CLASH = "CLASH"
    NO_CLASH = "NO_CLASH"


class TruthCategory(StrEnum):
    SPATIAL = "SPATIAL"
    SCHEDULE = "SCHEDULE"
