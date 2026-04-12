# Coding Style

## Immutability (Critical)

ALWAYS create new objects, NEVER mutate existing ones:
- Prevents side effects
- Simplifies debugging
- Supports safe concurrent operations

## File Organization

- Many focused files over fewer large ones
- 200–400 lines typical, 800 max
- Organize by feature or domain (not by file type)
- High cohesion, loose coupling

## Error Handling

- Explicit error handling at ALL levels
- User-friendly error messages in UI-facing code
- Detailed server-side logging
- Never silently ignore failures

## Input Validation

- ALWAYS validate at system boundaries (user input, external APIs)
- Schema-based validation where possible
- Fail fast with clear messages
- Never trust external data sources

## Code Quality Checklist

Before completion, verify:
- [ ] Readable naming
- [ ] Functions under 50 lines
- [ ] Focused files under 800 lines
- [ ] Shallow nesting (4 levels max)
- [ ] Proper error handling
- [ ] No hardcoded values
- [ ] Consistent immutable patterns
- [ ] No unnecessary comments (code should be self-explanatory)
