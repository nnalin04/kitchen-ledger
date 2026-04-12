# Security Guidelines

## Mandatory Security Checks Before Any Commit

- [ ] No hardcoded secrets (API keys, passwords, tokens)
- [ ] All user inputs validated and sanitized
- [ ] SQL injection prevention (parameterized queries only)
- [ ] XSS prevention (sanitized HTML output)
- [ ] CSRF protection enabled on state-changing endpoints
- [ ] Authentication/authorization verified on all protected routes
- [ ] Rate limiting on all public-facing endpoints
- [ ] Error messages do not leak sensitive data (stack traces, DB schemas)
- [ ] Dependencies scanned for known CVEs

## Secret Management

- NEVER hardcode secrets in source code
- ALWAYS use environment variables or a secret manager
- Validate that required secrets are present at startup (fail fast)
- Rotate any secrets that may have been exposed immediately

## Input Validation Rules

- Validate at ALL system boundaries: HTTP request bodies, query params, headers, file uploads, env vars, external API responses
- Reject unexpected fields (no pass-through of unknown input)
- Use schema validation libraries (Zod, Joi, Pydantic, etc.)

## Security Response Protocol

If a security issue is found:
1. STOP immediately — do not commit or push
2. Use **security-engineer** agent
3. Fix CRITICAL issues before continuing any other work
4. Rotate any exposed secrets
5. Review similar patterns in the rest of the codebase
6. Document the fix and root cause in the commit message
