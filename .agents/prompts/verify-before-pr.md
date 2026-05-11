# Verify Before PR Prompt

Verify the branch before opening or updating a PR.

Required checks by touched area:

- Backend: `cd backend && ruff check .`
- Backend behavior: `cd backend && pytest -x -q -m "not live"`
- Frontend type/build: `cd frontend && npm run build`
- Frontend behavior: `cd frontend && npm run test`

If a full check is too expensive, run the narrow check first and state which full gate remains.
