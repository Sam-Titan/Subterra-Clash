import json
import logging
from collections.abc import Iterator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import app as main_app
from app.middleware.client_ip import (
    LOGGER_NAME,
    AccessLogMiddleware,
    configure_access_logger,
    debug_router,
    mask_ip,
    resolve_client_ip,
)

CHAIN = "1.1.1.1, 2.2.2.2, 3.3.3.3"


def resolve(xff=None, tci=None, cf=None, sock="9.9.9.9", hops=0, trust_cf=False):
    return resolve_client_ip(xff, tci, cf, sock, hops, trust_cf)


@pytest.mark.parametrize(
    ("hops", "expected"), [(0, "9.9.9.9"), (1, "3.3.3.3"), (2, "2.2.2.2"), (3, "1.1.1.1")]
)
def test_hop_resolution(hops: int, expected: str) -> None:
    assert resolve(xff=CHAIN, hops=hops) == expected


def test_spoofed_leftmost_entry_is_ignored() -> None:
    assert resolve(xff="6.6.6.6, 203.0.113.7", hops=1) == "203.0.113.7"
    assert resolve(xff="6.6.6.6, 203.0.113.7", hops=1) != "6.6.6.6"


@pytest.mark.parametrize("xff", [None, "", "1.1.1.1", "not-an-ip, nope", "1.1.1.1, garbage, nope"])
def test_fallback_is_the_scope_client_not_xff(xff: str | None) -> None:
    got = resolve(xff=xff, hops=2)
    assert got == "9.9.9.9"


def test_fewer_entries_than_hops_falls_back_to_socket() -> None:
    assert resolve(xff="1.1.1.1", hops=2) == "9.9.9.9"


def test_zero_hops_ignores_xff() -> None:
    assert resolve(xff="1.1.1.1", hops=0) == "9.9.9.9"


def test_cf_headers_only_when_trusted() -> None:
    assert resolve(cf="5.5.5.5", tci="4.4.4.4") == "9.9.9.9"
    assert resolve(cf="5.5.5.5", tci="4.4.4.4", trust_cf=True) == "5.5.5.5"
    assert resolve(tci="4.4.4.4", trust_cf=True) == "4.4.4.4"
    assert resolve(cf="junk", xff=CHAIN, hops=1, trust_cf=True) == "3.3.3.3"


def test_mask_ip() -> None:
    assert mask_ip("203.0.113.77", "masked") == "203.0.113.0"
    assert mask_ip("2001:db8:1:2:3:4:5:6", "masked") == "2001:db8:1::"
    assert mask_ip("203.0.113.77", "full") == "203.0.113.77"
    assert mask_ip("203.0.113.77", "off") is None
    assert mask_ip(None, "full") is None


class _Capture(logging.Handler):
    def __init__(self) -> None:
        super().__init__()
        self.lines: list[str] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.lines.append(record.getMessage())


@pytest.fixture
def captured() -> Iterator[_Capture]:
    handler = _Capture()
    logger = configure_access_logger()
    logger.addHandler(handler)
    yield handler
    logger.removeHandler(handler)


def make_app(**values: object) -> FastAPI:
    settings = Settings(_env_file=None, **values)  # type: ignore[arg-type]
    api = FastAPI()
    api.add_middleware(AccessLogMiddleware, settings=settings)

    @api.get("/api/ok")
    def ok() -> dict[str, str]:
        return {"ok": "yes"}

    @api.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @api.get("/api/boom")
    def boom() -> None:
        raise RuntimeError("boom")

    @api.get("/api/item/{n}")
    def item(n: int) -> int:
        return n

    return api


def test_one_json_line_per_request(captured: _Capture) -> None:
    client = TestClient(make_app(trusted_proxy_hops=1))
    res = client.get("/api/ok", headers={"X-Forwarded-For": "6.6.6.6, 203.0.113.77"})
    assert res.status_code == 200
    assert len(captured.lines) == 1
    line = json.loads(captured.lines[0])
    assert set(line) == {
        "time",
        "method",
        "path",
        "status",
        "duration_ms",
        "client_ip",
        "user_agent",
        "request_id",
    }
    assert (line["method"], line["path"], line["status"]) == ("GET", "/api/ok", 200)
    assert line["client_ip"] == "203.0.113.0"
    assert line["request_id"] == res.headers["x-request-id"]
    assert line["time"].endswith("+00:00")


def test_full_and_off_modes(captured: _Capture) -> None:
    TestClient(make_app(trusted_proxy_hops=1, log_client_ip="full")).get(
        "/api/ok", headers={"X-Forwarded-For": "203.0.113.77"}
    )
    TestClient(make_app(trusted_proxy_hops=1, log_client_ip="off")).get(
        "/api/ok", headers={"X-Forwarded-For": "203.0.113.77"}
    )
    full, off = (json.loads(x) for x in captured.lines)
    assert full["client_ip"] == "203.0.113.77"
    assert off["client_ip"] is None


def test_health_not_logged_at_info(captured: _Capture) -> None:
    TestClient(make_app()).get("/api/health")
    assert captured.lines == []


def test_request_id_reused_and_sanitised(captured: _Capture) -> None:
    client = TestClient(make_app())
    assert (
        client.get("/api/ok", headers={"X-Request-ID": "abc-123"}).headers["x-request-id"]
        == "abc-123"
    )
    res = client.get("/api/ok", headers={"X-Request-ID": "a b<script>" + "x" * 100})
    rid = res.headers["x-request-id"]
    assert rid.startswith("abscriptx") and len(rid) == 64
    assert json.loads(captured.lines[-1])["request_id"] == rid
    assert len(client.get("/api/ok").headers["x-request-id"]) == 32


def test_health_logged_at_debug(captured: _Capture) -> None:
    client = TestClient(make_app())
    client.get("/api/ok")  # builds the middleware stack, which configures the logger
    logger = logging.getLogger(LOGGER_NAME)
    logger.setLevel(logging.DEBUG)
    try:
        client.get("/api/health")
    finally:
        logger.setLevel(logging.INFO)
    assert [json.loads(x)["path"] for x in captured.lines] == ["/api/ok", "/api/health"]


def test_cf_headers_read_through_the_middleware_only_when_trusted(captured: _Capture) -> None:
    headers = {"CF-Connecting-IP": "5.5.5.5", "True-Client-IP": "4.4.4.4"}
    trusted = TestClient(make_app(trust_cf_headers=True, log_client_ip="full"))
    untrusted = TestClient(make_app(trust_cf_headers=False, log_client_ip="full"))
    trusted.get("/api/ok", headers=headers)
    trusted.get("/api/ok", headers={"True-Client-IP": "4.4.4.4"})
    untrusted.get("/api/ok", headers=headers)
    on_both, on_tci, off = (json.loads(x)["client_ip"] for x in captured.lines)
    assert (on_both, on_tci) == ("5.5.5.5", "4.4.4.4")
    assert off == "testclient"


def test_errors_are_logged_with_their_status(captured: _Capture) -> None:
    client = TestClient(make_app(), raise_server_exceptions=False)
    assert client.get("/api/missing").status_code == 404
    assert client.get("/api/item/abc").status_code == 422
    assert client.get("/api/boom").status_code == 500
    assert [json.loads(x)["status"] for x in captured.lines] == [404, 422, 500]


def test_unhandled_exception_is_reraised(captured: _Capture) -> None:
    with pytest.raises(RuntimeError):
        TestClient(make_app()).get("/api/boom")
    assert json.loads(captured.lines[0])["status"] == 500


def test_logger_setup_is_idempotent_across_app_builds(captured: _Capture) -> None:
    for _ in range(3):
        configure_access_logger()
    first, second = make_app(), make_app()
    TestClient(first).get("/api/ok")
    TestClient(second).get("/api/ok")
    logger = logging.getLogger(LOGGER_NAME)
    assert sum(getattr(h, "_subterra_access", False) for h in logger.handlers) == 1
    assert len(captured.lines) == 2


def test_query_string_is_not_logged(captured: _Capture) -> None:
    TestClient(make_app()).get("/api/ok?token=secret")
    assert json.loads(captured.lines[0])["path"] == "/api/ok"
    assert "secret" not in captured.lines[0]


def test_control_characters_in_user_agent_stay_on_one_line(captured: _Capture) -> None:
    ua = 'a\nb\r{"x":1}'
    # h11 rejects raw newlines in header values, so send them as a latin-1 tab / escape-free form
    client = TestClient(make_app())
    client.get("/api/ok", headers={"User-Agent": ua.replace("\n", "\x0b").replace("\r", "\x0c")})
    assert len(captured.lines) == 1
    assert "\n" not in captured.lines[0] and "\r" not in captured.lines[0]
    line = json.loads(captured.lines[0])
    assert line["user_agent"] == 'a\x0bb\x0c{"x":1}'
    assert line["method"] == "GET"


def test_newline_escaped_by_json_dumps(captured: _Capture) -> None:
    # drive the ASGI app directly: a server could pass any bytes through in a header value
    import asyncio

    api = make_app()
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/api/ok",
        "query_string": b"",
        "headers": [(b"user-agent", b'a\nb\r{"x":1}')],
        "client": ("9.9.9.9", 1234),
        "server": ("test", 80),
        "scheme": "http",
        "http_version": "1.1",
        "root_path": "",
    }

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(_):
        return None

    asyncio.run(api(scope, receive, send))
    assert len(captured.lines) == 1
    assert "\n" not in captured.lines[0]
    assert json.loads(captured.lines[0])["user_agent"] == 'a\nb\r{"x":1}'


def test_user_agent_truncated(captured: _Capture) -> None:
    TestClient(make_app()).get("/api/ok", headers={"User-Agent": "u" * 500})
    assert len(json.loads(captured.lines[0])["user_agent"]) == 200


def test_fallback_in_middleware_is_the_real_client(captured: _Capture) -> None:
    # TestClient's socket address is "testclient"; XFF must not leak in when it is unusable
    client = TestClient(make_app(trusted_proxy_hops=1, log_client_ip="full"))
    client.get("/api/ok", headers={"X-Forwarded-For": "not-an-ip"})
    assert json.loads(captured.lines[0])["client_ip"] == "testclient"


def test_debug_route_absent_by_default() -> None:
    assert TestClient(main_app).get("/api/debug/headers").status_code == 404


def test_debug_route_redacts_and_reports() -> None:
    settings = Settings(_env_file=None, debug_headers=True, trusted_proxy_hops=1)  # type: ignore[arg-type]
    api = FastAPI()
    api.include_router(debug_router(settings))
    res = TestClient(api).get(
        "/api/debug/headers",
        headers={"X-Forwarded-For": "6.6.6.6, 203.0.113.7", "Authorization": "Bearer s"},
    )
    body = res.json()
    assert body["resolved_ip"] == "203.0.113.7"
    assert body["from_right"] == {"1": "203.0.113.7", "2": "6.6.6.6"}
    assert body["headers"]["authorization"] == "[redacted]"
