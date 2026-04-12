# Performance Optimization

## Model Selection Strategy

Use `/model-route` to get a recommendation. General table:

| Model | Use When | Cost |
|-------|----------|------|
| **Haiku 4.5** | Lightweight agents, frequent invocation, pair programming, worker agents in multi-agent systems | 3x cheaper than Sonnet |
| **Sonnet 4.6** | Main development work, implementation, refactoring, complex coding, orchestrating multi-agent workflows | Default |
| **Opus 4.6** | Architecture decisions, deep system design, ambiguous requirements, maximum reasoning | Most expensive |

**Default**: Sonnet 4.6 for everything unless a clear reason exists to escalate or downgrade.

## Context Window Management

Avoid last 20% of context window for:
- Large-scale refactoring spanning multiple files
- Feature implementation across many files
- Debugging complex multi-file interactions

Lower context sensitivity (safe near limit):
- Single-file edits
- Independent utility creation
- Documentation updates
- Simple bug fixes

## When to Use Extended Thinking

Enable for:
- Complex architectural decisions with many trade-offs
- Ambiguous requirements that need deep analysis
- Debugging non-obvious multi-system interactions

Toggle: Option+T (macOS) / Alt+T (Windows/Linux)

## Build Troubleshooting

If build fails:
1. Use **build-error-resolver** agent
2. Analyze error messages
3. Fix incrementally
4. Verify after each fix
