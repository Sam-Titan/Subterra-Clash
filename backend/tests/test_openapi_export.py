import json

from scripts import export_openapi

REQUIRED_PATHS = {
    "/api/health",
    "/api/scene",
    "/api/rules",
    "/api/clashes",
    "/api/clashes/{clash_id}",
    "/api/groups",
    "/api/reset",
}


def test_openapi_file_is_current() -> None:
    on_disk = json.loads(export_openapi.OUT.read_text(encoding="utf-8"))
    assert on_disk == json.loads(export_openapi.render()), (
        "shared/openapi.json is stale: run `uv run python scripts/export_openapi.py`"
    )


def test_openapi_has_all_1d_paths() -> None:
    assert set(json.loads(export_openapi.render())["paths"]) >= REQUIRED_PATHS


def test_clash_schema_requires_defaulted_fields() -> None:
    schemas = json.loads(export_openapi.render())["components"]["schemas"]
    assert {"review", "evidence", "missing_data"} <= set(schemas["Clash"]["required"])
