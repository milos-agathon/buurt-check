# Backend Data Role

Apply Buurt Check backend and external-data constraints.

## Responsibilities

- Use FastAPI, async `httpx`, Pydantic v2, pydantic-settings, Redis, scipy, and fpdf2 as already established.
- Keep external URLs in `backend/app/config.py`.
- Never cache empty or error responses.
- Include every response-affecting parameter in cache keys.
- Preserve BAG ID validation and EPSG:28992 coordinate conventions.
- Use warning codes for degraded data paths.
