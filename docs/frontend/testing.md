# Testing

## Setup

- **Framework:** Jest 30 with `ts-jest` for TypeScript support
- **DOM environment:** `jest-environment-jsdom`
- **Assertions:** React Testing Library (`@testing-library/react`) + `@testing-library/jest-dom`
- **Config:** `frontend/jest.config.js`

Run tests:

```sh
pnpm test              # run once
pnpm test:watch        # re-run on file changes
pnpm test:coverage     # run with coverage report
```

---

## File organisation

Tests mirror the `src/` structure under `tests/`:

```
tests/
├── adapters/
├── auth/
├── components/
│   └── __snapshots__/
├── domain/
├── guards/
├── hooks/
├── layouts/
├── modules/
├── pages/
├── utilities/
├── __mocks__/          # manual mocks (modules, assets)
├── setupTests.ts       # RTL setup, jest-dom matchers
└── queryClientWrapper.tsx  # shared React Query wrapper for tests
```

Name test files `<FileName>.test.ts(x)` and place them in the corresponding `tests/` subdirectory.

---

## Testing components

Use React Testing Library. Query by accessible roles, labels, and text — not by class names or implementation details.

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { MyComponent } from 'components/MyComponent';

test('shows confirmation after clicking save', () => {
  render(<MyComponent />);
  fireEvent.click(screen.getByRole('button', { name: /save/i }));
  expect(screen.getByText('Saved successfully')).toBeInTheDocument();
});
```

### Wrapping with providers

Components that use React Query or custom contexts need their providers in the test tree. A shared `queryClientWrapper` is provided:

```tsx
// tests/queryClientWrapper.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
```

Use it in tests:

```tsx
import { renderHook } from '@testing-library/react';
import { createWrapper } from '../queryClientWrapper';
import { useMyHook } from 'hooks/useMyHook';

test('fetches data', async () => {
  const { result } = renderHook(() => useMyHook(), {
    wrapper: createWrapper(),
  });
  // ...
});
```

For contexts other than React Query, wrap with the relevant provider directly in the test or in a shared test utility.

---

## Testing hooks

Use `renderHook` from React Testing Library:

```tsx
import { renderHook, act } from '@testing-library/react';

test('increments counter', () => {
  const { result } = renderHook(() => useCounter());
  act(() => { result.current.increment(); });
  expect(result.current.count).toBe(1);
});
```

---

## Mocking API calls

Do not mock `fetch` directly. Mock the hooks that wrap it instead. This keeps tests independent of the HTTP client implementation.

```tsx
import * as useApiQueryModule from 'hooks/useApiQuery';

jest.spyOn(useApiQueryModule, 'useApiQuery').mockReturnValue({
  data: [{ id: '1', name: 'Test Dataset' }],
  isLoading: false,
  error: null,
} as any);
```

Alternatively, use `msw` (Mock Service Worker) if the project adopts it in future — it intercepts real fetch calls at the network level and is more robust for integration-style tests.

---

## Mocking modules

Manual mocks live in `tests/__mocks__/`. Jest automatically uses files in this directory to replace imports.

Common mocks already in place:
- Asset imports (SVG, PNG) — return a stub string so image imports don't break tests
- i18next — returns the key as-is (`t('some.key')` → `'some.key'`)

---

## Snapshot tests

Snapshot tests for UI components are in `tests/components/__snapshots__/`. They catch unintended visual regressions.

```tsx
import { render } from '@testing-library/react';

test('renders correctly', () => {
  const { asFragment } = render(<Button label="Click me" />);
  expect(asFragment()).toMatchSnapshot();
});
```

Update snapshots intentionally with:

```sh
pnpm test -- --updateSnapshot
```

---

## Testing domain logic

Pure functions in `src/domain/` and `src/adapters/` have no React dependencies and can be tested with plain Jest assertions:

```ts
import { computeDatasetSummary } from 'domain/computeDatasetSummary';

test('sums data points across datasets', () => {
  const result = computeDatasetSummary([dataset1, dataset2]);
  expect(result.totalDataPoints).toBe(1500);
});
```

---

## Coverage

Run `pnpm test:coverage` to generate a coverage report in `coverage/`. The focus should be on:

1. Domain logic (`src/domain/`) — high coverage, pure functions are easy to test
2. Adapters (`src/adapters/`) — verify backend-to-frontend transformations
3. Complex hooks — test state transitions and side effects
4. Critical UI paths — login, download flow, filter application

Avoid chasing 100% coverage on presentational components where snapshot tests are sufficient.

---

## Useful patterns

### Testing async state updates

Wrap async assertions in `waitFor`:

```tsx
import { waitFor } from '@testing-library/react';

test('shows data after loading', async () => {
  render(<MyComponent />);
  await waitFor(() => {
    expect(screen.getByText('Dataset Name')).toBeInTheDocument();
  });
});
```

### Testing error states

Mock a rejected query and assert the error UI renders:

```tsx
jest.spyOn(useApiQueryModule, 'useApiQuery').mockReturnValue({
  data: null,
  isLoading: false,
  error: new Error('Network error'),
} as any);

render(<MyComponent />);
expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
```

### Avoiding `act(...)` warnings

Wrap state-changing interactions and async updates in `act` or `waitFor`. RTL's `fireEvent` and `userEvent` handle this automatically for synchronous events; use `waitFor` for anything that settles asynchronously.
