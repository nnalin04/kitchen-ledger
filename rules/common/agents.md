# Agent Orchestration

## Available Agents

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| `planner` | Implementation planning | Complex features, refactoring |
| `architect` | System design | Architectural decisions |
| `tdd-guide` | Test-driven development | New features, bug fixes |
| `reviewer` | Code review | After writing code |
| `security-engineer` | Security analysis | Before commits |
| `build-error-resolver` | Fix build errors | When build fails |
| `qa-tester` | E2E testing | Critical user flows |
| `refactor-cleaner` | Dead code cleanup | Code maintenance |
| `doc-updater` | Documentation | Updating docs |
| `database-reviewer` | SQL/schema review | Database work |
| `loop-operator` | Autonomous loop monitoring | Long-running loops |
| `devops-engineer` | Infrastructure | Docker, deploy, GCP |

## Immediate Agent Usage (No User Prompt Needed)

1. Complex feature requests → use **planner** first
2. Code just written → use **reviewer** immediately
3. Bug fix or new feature → use **tdd-guide**
4. Architectural decision → use **architect**
5. SQL / schema work → use **database-reviewer**

## Parallel Task Execution

ALWAYS use parallel Agent tool calls for independent operations:

```
# GOOD: Parallel execution
Launch 3 agents simultaneously:
1. Agent 1: Security analysis of auth module
2. Agent 2: Performance review of cache system
3. Agent 3: Type checking of utilities

# BAD: Sequential when unnecessary
First agent 1, then wait, then agent 2, then wait, then agent 3
```

## Multi-Perspective Analysis

For complex problems, use split-role subagents:
- Factual reviewer
- Senior engineer
- Security expert
- Consistency reviewer
