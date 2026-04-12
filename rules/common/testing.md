# Testing Requirements

## Minimum Test Coverage: 80%

Test Types (ALL required):
1. **Unit Tests** — Individual functions, utilities, components
2. **Integration Tests** — API endpoints, database operations
3. **E2E Tests** — Critical user flows (Playwright, Cypress, etc.)

## Test-Driven Development (Mandatory)

1. Write test first (RED)
2. Run test — it should FAIL
3. Write minimal implementation (GREEN)
4. Run test — it should PASS
5. Refactor (IMPROVE)
6. Verify coverage ≥ 80%

## Test Quality Rules

- Tests must be deterministic — no random data without seeding
- No test interdependencies — each test must be independently runnable
- Mock at system boundaries, not internal functions
- Test names must describe the scenario: `should return 404 when user not found`
- No `// TODO: add tests` comments — write the test or don't merge

## Agent Support

- **tdd-guide** — use PROACTIVELY for new features; enforces write-tests-first
- **qa-tester** — use for E2E verification of critical flows

## Troubleshooting Test Failures

1. Use **tdd-guide** agent
2. Check test isolation (shared state between tests?)
3. Verify mocks are correct
4. Fix implementation, not tests (unless tests are genuinely wrong)
