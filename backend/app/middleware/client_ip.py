import ipaddress
import json
import logging
import re
import sys
import time
import uuid
from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.config import Settings

LOGGER_NAME = "subterra.access"
USER_AGENT_MAX = 200
REQUEST_ID_MAX = 64
_UNSAFE_ID = re.compile(r"[^A-Za-z0-9._-]")
_REDACTED_HEADERS = {"authorization", "cookie", "proxy-authorization"}

LogMode = Literal["full", "masked", "off"]


def _valid_ip(value: str | None) -> str | None:
    if not value:
        return None
    candidate = value.strip()
    try:
        ipaddress.ip_address(candidate)
    except ValueError:
        return None
    return candidate


def resolve_client_ip(
    xff: str | None,
    true_client_ip: str | None,
    cf_ip: str | None,
    socket_ip: str | None,
    hops: int,
    trust_cf: bool,
) -> str | None:
    """Real client address. `hops` = trusted proxies in front of us; the entry that many places
    from the right of X-Forwarded-For is the one our outermost trusted proxy appended. Anything
    further left is client-controlled and never used."""
    if trust_cf:
        for header in (cf_ip, true_client_ip):
            if (ip := _valid_ip(header)) is not None:
                return ip
    if hops >= 1 and xff:
        entries = [e.strip() for e in xff.split(",")]
        if len(entries) >= hops and (ip := _valid_ip(entries[-hops])) is not None:
            return ip
    return socket_ip


def mask_ip(ip: str | None, mode: LogMode) -> str | None:
    """`masked` zeroes the last IPv4 octet / the last 80 bits of IPv6."""
    if ip is None or mode == "off":
        return None
    if mode == "full":
        return ip
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return None
    bits = 8 if addr.version == 4 else 80
    return str(type(addr)(int(addr) >> bits << bits))


def configure_access_logger() -> logging.Logger:
    """Idempotent: one stdout handler however often the app or middleware is built."""
    logger = logging.getLogger(LOGGER_NAME)
    logger.setLevel(logging.INFO)
    logger.propagate = False
    if not any(getattr(h, "_subterra_access", False) for h in logger.handlers):
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(logging.Formatter("%(message)s"))
        handler._subterra_access = True  # type: ignore[attr-defined]
        logger.addHandler(handler)
    return logger


def _request_id(headers: Headers) -> str:
    cleaned = _UNSAFE_ID.sub("", headers.get("x-request-id", ""))[:REQUEST_ID_MAX]
    return cleaned or uuid.uuid4().hex


def _socket_ip(scope: Scope) -> str | None:
    client = scope.get("client")
    return client[0] if client else None


def _resolve_from_scope(scope: Scope, settings: Settings) -> str | None:
    headers = Headers(scope=scope)
    return resolve_client_ip(
        headers.get("x-forwarded-for"),
        headers.get("true-client-ip"),
        headers.get("cf-connecting-ip"),
        _socket_ip(scope),
        settings.trusted_proxy_hops,
        settings.trust_cf_headers,
    )


class AccessLogMiddleware:
    """One JSON line per request with the real client IP. Pure ASGI: responses stream untouched."""

    def __init__(self, app: ASGIApp, settings: Settings) -> None:
        self.app = app
        self.settings = settings
        self.logger = configure_access_logger()

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        request_id = _request_id(headers)
        started = time.perf_counter()
        status = 500

        async def send_wrapper(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                MutableHeaders(scope=message)["x-request-id"] = request_id
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            path = scope["path"]
            level = logging.DEBUG if path == "/api/health" else logging.INFO
            if self.logger.isEnabledFor(level):
                ip = mask_ip(_resolve_from_scope(scope, self.settings), self.settings.log_client_ip)
                line = {
                    "time": datetime.now(UTC).isoformat(timespec="milliseconds"),
                    "method": scope["method"],
                    "path": path,
                    "status": status,
                    "duration_ms": round((time.perf_counter() - started) * 1000, 1),
                    "client_ip": ip,
                    "user_agent": headers.get("user-agent", "")[:USER_AGENT_MAX],
                    "request_id": request_id,
                }
                self.logger.log(level, json.dumps(line))


def debug_router(settings: Settings) -> APIRouter:
    """Mounted only when DEBUG_HEADERS=true, to find the client's position in X-Forwarded-For."""
    router = APIRouter()

    @router.get("/api/debug/headers", include_in_schema=False)
    def debug_headers(request: Request) -> dict[str, object]:
        if not settings.debug_headers:
            raise HTTPException(status_code=404)
        xff = request.headers.get("x-forwarded-for")
        entries = [e.strip() for e in xff.split(",")] if xff else []
        return {
            "x_forwarded_for": xff,
            "from_right": {str(i): e for i, e in enumerate(reversed(entries), start=1)},
            "socket_address": _socket_ip(request.scope),
            "resolved_ip": _resolve_from_scope(request.scope, settings),
            "trusted_proxy_hops": settings.trusted_proxy_hops,
            "headers": {
                k: "[redacted]" if k.lower() in _REDACTED_HEADERS else v
                for k, v in request.headers.items()
            },
        }

    return router
