"""TP-Link Deco MCP Server - read-only mesh network tools."""

import json
import os
import sys
from base64 import b64decode
from json import dumps

from mcp.server.fastmcp import FastMCP
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from tplinkrouterc6u.client.deco import TPLinkDecoClient


DECO_HOST = os.environ.get("DECO_HOST", "")
DECO_PASSWORD = os.environ.get("DECO_PASSWORD", "")
DECO_USERNAME = os.environ.get("DECO_USERNAME", "admin")

if not DECO_HOST or not DECO_PASSWORD:
    print("Missing required environment variables: DECO_HOST, DECO_PASSWORD", file=sys.stderr)
    sys.exit(1)


def get_client() -> TPLinkDecoClient:
    """Create and authorize a Deco client."""
    client = TPLinkDecoClient(DECO_HOST, DECO_PASSWORD, DECO_USERNAME, verify_ssl=False, timeout=10)
    client.authorize()
    return client


mcp = FastMCP("deco", host="0.0.0.0", port=int(os.environ.get("MCP_PORT", "8086")))


@mcp.custom_route("/health", methods=["GET"])
async def health_check(request: Request) -> Response:
    return JSONResponse({"status": "ok"})


@mcp.tool()
def clients_list() -> str:
    """List all connected clients on the Deco mesh network. Returns array of {mac, name, ip, connection_type, interface, wire_type, online, up_speed, down_speed}."""
    client = get_client()
    try:
        data = client.request(
            "admin/client?form=client_list",
            dumps({"operation": "read", "params": {"device_mac": "default"}}),
        )
        clients = data.get("client_list", [])
        result = []
        for c in clients:
            name = c.get("name", "")
            try:
                name = b64decode(name).decode("utf-8")
            except Exception:
                pass
            result.append({
                "mac": c.get("mac", ""),
                "name": name,
                "ip": c.get("ip", ""),
                "connection_type": c.get("connection_type", ""),
                "interface": c.get("interface", ""),
                "wire_type": c.get("wire_type", ""),
                "online": bool(c.get("online")),
                "up_speed": c.get("up_speed", 0),
                "down_speed": c.get("down_speed", 0),
            })
        return json.dumps(result, indent=2)
    finally:
        try:
            client.logout()
        except Exception:
            pass


@mcp.tool()
def devices_list() -> str:
    """List all Deco mesh nodes. Returns array of {mac, role, nickname, hardware_ver, software_ver, inet_status, connection_types}."""
    client = get_client()
    try:
        data = client.request(
            "admin/device?form=device_list",
            dumps({"operation": "read"}),
        )
        devices = data.get("device_list", [])
        result = []
        for d in devices:
            nickname = d.get("custom_nickname") or d.get("nickname", "")
            try:
                nickname = b64decode(nickname).decode("utf-8")
            except Exception:
                pass
            result.append({
                "mac": d.get("mac", ""),
                "role": d.get("role", ""),
                "nickname": nickname,
                "hardware_ver": d.get("hardware_ver", ""),
                "software_ver": d.get("software_ver", ""),
                "inet_status": d.get("inet_status", ""),
                "connection_types": d.get("connection_type", []),
            })
        return json.dumps(result, indent=2)
    finally:
        try:
            client.logout()
        except Exception:
            pass


@mcp.tool()
def network_status() -> str:
    """Get WAN/LAN network status and CPU/memory performance."""
    client = get_client()
    try:
        wan = client.request(
            "admin/network?form=wan_ipv4",
            dumps({"operation": "read"}),
        )
        performance = client.request(
            "admin/network?form=performance",
            dumps({"operation": "read"}),
        )
        return json.dumps({"wan": wan, "performance": performance}, indent=2)
    finally:
        try:
            client.logout()
        except Exception:
            pass


@mcp.tool()
def wifi_status() -> str:
    """Get WiFi band configuration including which bands are enabled for host, guest, and IoT networks."""
    client = get_client()
    try:
        data = client.request(
            "admin/wireless?form=wlan",
            dumps({"operation": "read"}),
        )
        return json.dumps(data, indent=2)
    finally:
        try:
            client.logout()
        except Exception:
            pass


if __name__ == "__main__":
    mcp.run(transport="streamable-http")
