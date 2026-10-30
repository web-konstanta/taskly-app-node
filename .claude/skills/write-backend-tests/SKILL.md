---
name: write-backend-tests
description: Conventions for writing Vitest unit tests for the Express and Prisma backend. Use when creating or updating tests under backend/tests.
---

# Write backend tests

**Location:** `backend/tests/<module>.test.ts`, flat. Extend the existing file for a module when there is one.

**Imports:** use relative paths with the `.ts` extension, such as `../src/features/todos/router.ts`. Import from `vitest` explicitly. Reuse `tests/fixture.ts` (`record`, `todo`).

**Style:** match the existing tests: top-level `it` / `it.each`, a small local `setup()` function, and one behaviour per test.

**By layer:**
- **Routers:** build a real Express app with a mocked store and call it with Supertest. Assert status and body, and that the store was or was not called with the expected arguments. Cover validation failures (422), missing resources (404) and malformed IDs.
- **Repository:** create the client with `createDatabase('postgresql://test:test@localhost:5432/test')` and mock its IO with `vi.spyOn(database.todo, ...)`. No PostgreSQL runs. Restore mocks in `afterEach`.
- **`createApp`:** pass a stub `Database`. Cover the 404 fallback, the error handler's branches and `/openapi.json`. Silence and assert `console.error` where the handler logs.
- **Config:** use `vi.stubEnv` and `vi.unstubAllEnvs`. Never rely on a real `.env` value: clear the variables a test depends on.
- **Startup and shutdown:** mock `./database` and the listener boundary. Never bind a fixed port, and remove any signal handlers a test registers.

Express 5 forwards rejected async handlers to the error middleware, so test those paths through `createApp`.
