---
name: write-frontend-tests
description: Conventions for writing Vitest and React Testing Library tests for the React frontend. Use when creating or updating frontend/src test files.
---

# Write frontend tests

**Location:** next to the code: `Component.tsx` → `Component.test.tsx`, `useThing.ts` → `useThing.test.ts` or `.test.tsx` when it needs JSX.

**Style:** Prettier with no semicolons and single quotes. Import `expect`, `it`, `vi` from `vitest`. Reuse `src/test/todoFixture.ts`.

**Components:**
- Isolate from the design system with `vi.mock('<relative path>/design-system', () => import('<relative path>/design-system/mocks'))`, as existing tests do. Check `design-system/mocks.tsx` for what it provides.
- Query by role and accessible name first. Use `userEvent.setup()` for interaction, not `fireEvent`.
- Cover the branches users see: loading, error, empty, disabled, and callbacks with their arguments.
- Assert what is rendered, not styles or internal state.

**Hooks:**
- Use `renderHook`. For React Query hooks, wrap in a `QueryClientProvider` with a new `QueryClient` per test and `retry: false`.
- Mock `todosApi` at the module boundary. Assert the resulting cache via `queryClient.getQueryData`.

**HTTP (`lib/http`, `api/`):** stub `fetch` with `vi.stubGlobal` and restore it with `vi.unstubAllGlobals`. Cover non-OK responses and empty bodies.

**Time:** use `vi.useFakeTimers` and restore real timers afterwards. Wait with `findBy*` or `waitFor`, never a fixed delay.
