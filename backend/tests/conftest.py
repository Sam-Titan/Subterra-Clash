from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.store import Store, get_store


@pytest.fixture
def store() -> Store:
    return Store()


@pytest.fixture
def api(store: Store) -> Iterator[TestClient]:
    """TestClient wired to an isolated, freshly seeded store."""
    app.dependency_overrides[get_store] = lambda: store
    yield TestClient(app)
    app.dependency_overrides.pop(get_store, None)
