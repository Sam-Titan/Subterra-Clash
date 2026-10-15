"""Load the committed seed files into validated models (fresh copies on every call)."""

import json
from pathlib import Path

from app.models import Rule, Scene, TruthCase

DATA_DIR = Path(__file__).parent
SEED_DIR = DATA_DIR / "seed"


def load_scene(seed_dir: Path = SEED_DIR) -> Scene:
    return Scene.model_validate_json((seed_dir / "scene.json").read_text(encoding="utf-8"))


def load_truth(seed_dir: Path = SEED_DIR) -> list[TruthCase]:
    raw = json.loads((seed_dir / "truth.json").read_text(encoding="utf-8"))
    return [TruthCase.model_validate(item) for item in raw]


def load_rules(path: Path = DATA_DIR / "rules.json") -> list[Rule]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    return [Rule.model_validate(item) for item in raw]
