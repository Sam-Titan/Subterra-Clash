"""Write the FastAPI OpenAPI schema to ../shared/openapi.json (frontend: pnpm gen:api)."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # run as a plain script

from app.main import app  # noqa: E402

OUT = Path(__file__).resolve().parents[2] / "shared" / "openapi.json"


def render() -> str:
    return json.dumps(app.openapi(), indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def main() -> None:
    OUT.write_text(render(), encoding="utf-8")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
