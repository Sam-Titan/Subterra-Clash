import json

import pytest

from app.api.schemas import ListResponse
from app.models import Clash, ClashGroup, Scene
from app.permits.models import PermitDraft
from scripts import export_mocks

MODELS = {
    "scene.json": Scene,
    "clashes.json": ListResponse[Clash],
    "groups.json": ListResponse[ClashGroup],
    "permit_parse.json": PermitDraft,
}
STALE = "shared/mocks is stale: run `uv run python scripts/export_mocks.py`"


@pytest.fixture(scope="module")
def api_output() -> dict[str, object]:
    return export_mocks.build()


@pytest.mark.parametrize("name", list(MODELS))
def test_generated_mock_validates_and_matches_api(name: str, api_output: dict[str, object]) -> None:
    on_disk = json.loads((export_mocks.MOCKS_DIR / name).read_text(encoding="utf-8"))
    MODELS[name].model_validate(on_disk)
    assert on_disk == api_output[name], STALE


def test_summary_mock_has_contract_keys() -> None:
    data = json.loads((export_mocks.MOCKS_DIR / "summary.json").read_text(encoding="utf-8"))
    assert set(data) == {"counts", "by_utility", "by_certainty", "evaluation"}
    assert set(data["evaluation"]) == {"ours", "baseline", "cases"}


def test_permit_parse_mock_has_contract_keys() -> None:
    data = json.loads((export_mocks.MOCKS_DIR / "permit_parse.json").read_text(encoding="utf-8"))
    expected = {
        "draft_id",
        "source_text",
        "llm_mode_used",
        "fields",
        "missing_fields",
        "geocode",
        "preview_clash_count",
    }
    assert expected <= set(data)
