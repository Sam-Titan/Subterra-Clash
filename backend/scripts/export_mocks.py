"""Write frontend mocks from the real, freshly seeded API (../shared/mocks).

scene.json = GET /api/scene, clashes.json = GET /api/clashes, groups.json = GET /api/groups.
permit_parse.json = POST /api/permits/parse for sample-1. summary.json is hand-maintained (3A).
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # run as a plain script

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.permits.sample_permits import SAMPLE_PERMITS  # noqa: E402
from app.store import Store, get_store  # noqa: E402

MOCKS_DIR = Path(__file__).resolve().parents[2] / "shared" / "mocks"

# mock file -> API route it mirrors
MOCK_ROUTES = {
    "scene.json": "/api/scene",
    "clashes.json": "/api/clashes",
    "groups.json": "/api/groups",
}


def build() -> dict[str, object]:
    """Fetch each mirrored route from an isolated, freshly seeded store."""
    store = Store()
    app.dependency_overrides[get_store] = lambda: store
    try:
        client = TestClient(app)
        out: dict[str, object] = {}
        for name, route in MOCK_ROUTES.items():
            res = client.get(route)
            res.raise_for_status()
            out[name] = res.json()
        sample = SAMPLE_PERMITS[0].text
        res = client.post("/api/permits/parse", json={"text": sample})
        res.raise_for_status()
        out["permit_parse.json"] = res.json()
        return out
    finally:
        app.dependency_overrides.pop(get_store, None)


def render(data: object) -> str:
    return json.dumps(data, indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def main() -> None:
    for name, data in build().items():
        path = MOCKS_DIR / name
        path.write_text(render(data), encoding="utf-8")
        print(f"wrote {path}")


if __name__ == "__main__":
    main()
