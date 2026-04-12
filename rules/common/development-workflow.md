# Development Workflow

## Feature Implementation Workflow

### 0. Research & Reuse (mandatory before any new implementation)

- **GitHub code search first**: `gh search code` to find existing implementations
- **Library docs second**: Use primary vendor docs to confirm API behavior
- **Check package registries**: npm, PyPI, crates.io before writing utility code
- **Search for adaptable implementations**: Look for open-source solutions covering 80%+ of the problem
- Prefer adopting/porting a proven approach over writing net-new code

### 1. Plan First

- Use **planner** agent to create implementation plan
- Break down into phases with dependencies and risks
- Identify external API contracts before implementation

### 2. TDD Approach

- Use **tdd-guide** agent
- Write tests first (RED)
- Implement to pass tests (GREEN)
- Refactor (IMPROVE)
- Verify 80%+ coverage

### 3. Code Review

- Use **reviewer** agent immediately after writing code
- Address CRITICAL and HIGH issues before moving on
- Fix MEDIUM issues when possible

### 4. Commit & Push

- Conventional commits format: `type(scope): description`
- Detailed commit messages — "why" over "what"
- Reference issue numbers when applicable

## Session Management

- Run `/save-session` at natural stopping points
- Run `/resume-session` at the start of a new session
- Run `/checkpoint create` before major refactors
- Run `/learn-eval` after solving non-trivial problems

## Continuous Improvement

- Every 5–10 tasks: run `/learn-eval` to extract patterns
- Every 10–20 tasks: run `/skill-stocktake` to audit skill portfolio
- After multi-session projects: run `/retrospective` to update agent/skill files
