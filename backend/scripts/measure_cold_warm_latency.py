"""Measure cold vs warm latency for key buurt-check endpoints."""

from __future__ import annotations

import argparse
import time
from dataclasses import dataclass

import httpx


@dataclass
class EndpointCheck:
    name: str
    path: str
    params: dict[str, str]


def _time_request(client: httpx.Client, url: str, params: dict[str, str]) -> tuple[float, int]:
    start = time.perf_counter()
    response = client.get(url, params=params)
    duration_ms = (time.perf_counter() - start) * 1000
    return duration_ms, response.status_code


def _format_ms(value: float) -> str:
    return f"{value:.1f}ms"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000", help="Backend base URL")
    parser.add_argument("--vbo-id", default="0363010000696734")
    parser.add_argument("--lat", default="52.3676")
    parser.add_argument("--lng", default="4.8846")
    parser.add_argument("--rd-x", default="121000")
    parser.add_argument("--rd-y", default="487000")
    parser.add_argument("--buurt-code", default="BU0363AD07")
    parser.add_argument("--postcode", default="1015AA")
    parser.add_argument("--house-number", default="100")
    args = parser.parse_args()

    checks = [
        EndpointCheck(
            name="building",
            path=f"/api/address/{args.vbo_id}/building",
            params={},
        ),
        EndpointCheck(
            name="risks",
            path=f"/api/address/{args.vbo_id}/risks",
            params={
                "rd_x": args.rd_x,
                "rd_y": args.rd_y,
                "lat": args.lat,
                "lng": args.lng,
            },
        ),
        EndpointCheck(
            name="neighborhood",
            path=f"/api/address/{args.vbo_id}/neighborhood",
            params={
                "lat": args.lat,
                "lng": args.lng,
                "buurt_code": args.buurt_code,
            },
        ),
        EndpointCheck(
            name="tier-b",
            path=f"/api/address/{args.vbo_id}/tier-b",
            params={
                "buurt_code": args.buurt_code,
                "postcode": args.postcode,
                "house_number": args.house_number,
            },
        ),
    ]

    print("Endpoint latency check (cold vs warm)")
    print(f"Base URL: {args.base_url}")
    with httpx.Client(timeout=30.0) as client:
        for check in checks:
            url = f"{args.base_url}{check.path}"
            cold_ms, cold_status = _time_request(client, url, check.params)
            warm_ms, warm_status = _time_request(client, url, check.params)
            delta = cold_ms - warm_ms
            print(
                f"- {check.name:12} cold={_format_ms(cold_ms)} ({cold_status}) "
                f"warm={_format_ms(warm_ms)} ({warm_status}) delta={_format_ms(delta)}"
            )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
