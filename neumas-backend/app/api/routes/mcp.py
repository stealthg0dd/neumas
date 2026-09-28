from __future__ import annotations

import json
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request

from app.api.routes.agent_commerce import get_external_principal
from app.schemas.agent_commerce import ExternalPrincipal
from app.services.mcp_service import McpService

router = APIRouter()
service = McpService()


def _result(request_id: Any, result: Any) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": request_id, "result": result}


def _error(request_id: Any, code: int, message: str) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}}


@router.post("")
async def mcp_endpoint(
    request: Request,
    principal: Annotated[ExternalPrincipal, Depends(get_external_principal)],
) -> dict[str, Any]:
    payload = await request.json()
    request_id = payload.get("id")
    method = payload.get("method")
    if payload.get("jsonrpc") != "2.0":
        return _error(request_id, -32600, "Invalid JSON-RPC request")
    if method == "initialize":
        return _result(request_id, {"protocolVersion": "2025-06-18", "capabilities": {"tools": {"listChanged": False}}, "serverInfo": {"name": "neumas", "version": "1.0.0"}})
    if method == "notifications/initialized":
        return _result(request_id, {})
    if method == "tools/list":
        return _result(request_id, {"tools": service.tools()})
    if method != "tools/call":
        return _error(request_id, -32601, "Method not found")
    params = payload.get("params") or {}
    try:
        data = await service.call(principal, str(params.get("name") or ""), params.get("arguments") or {})
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except (ValueError, KeyError) as exc:
        return _error(request_id, -32602, str(exc))
    return _result(request_id, {"content": [{"type": "text", "text": json.dumps(data, default=str)}], "structuredContent": data})
