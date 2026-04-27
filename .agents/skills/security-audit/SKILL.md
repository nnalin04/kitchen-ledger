---
name: security-audit
description: Pre-release comprehensive OWASP audit (Mobile Top 10, API Top 10) via security-engineer agent. Use when preparing a feature or whole system for production. For inline dev patterns use `/security-review`; for Codex config scanning use `/security-scan`.
argument-hint: "optional: scope — full | backend | mobile | ai-service | auth | deps"
disable-model-invocation: true
---

## What This Skill Does

Spawns the `security-engineer` agent to audit the system for vulnerabilities across OWASP Mobile Top 10, OWASP API Security Top 10, and health-data privacy standards. Routes all fixes through `project-manager` to the correct engineer.

<!-- ADAPT TO YOUR PROJECT STRUCTURE: Update scope labels and discovery commands below to match your actual stack and directory layout. -->

## Steps

### 1. Determine scope

From `$ARGUMENTS`:
- `full` or no argument → audit everything
- `backend` → server-side auth, API security, database access
- `mobile` → mobile app manifest, secure storage, token handling
- `frontend` → client-side XSS, CSP, auth token storage
- `api` → REST/GraphQL endpoints, rate limiting, input validation
- `auth` → JWT/OAuth/session end-to-end
- `deps` → dependency vulnerability scan only

### 2. Discover and gather security-relevant context in parallel

Run these discovery commands to find security-critical files — adapt paths as needed:

**Auth and security config:**
```bash
find . -name "*SecurityConfig*" -o -name "*JwtFilter*" -o -name "*AuthConfig*" -o -name "*auth*.py" \
  | grep -v "node_modules\|.git\|test" | head -10 | xargs cat 2>/dev/null | head -150
```

**Token/credential handling:**
```bash
find . -name "*JwtUtil*" -o -name "*TokenUtil*" -o -name "*credentials*" \
  | grep -v "node_modules\|.git\|test" | head -10 | xargs cat 2>/dev/null | head -100
```

**Dependency manifests (adjust for your stack):**
```bash
# Java/Maven
cat pom.xml 2>/dev/null | grep -A2 "<dependency>" | grep "artifactId\|version" | head -60
# Node.js
cat package.json 2>/dev/null | grep -A1 '"dependencies"' | head -40
# Python
cat requirements.txt 2>/dev/null || cat pyproject.toml 2>/dev/null | head -40
# Flutter
cat pubspec.yaml 2>/dev/null | grep -A1 "dependencies:" | head -40
```

**Hardcoded secrets (all source files):**
```bash
grep -rn "api_key\s*=\s*['\"].\|password\s*=\s*['\"].\|secret\s*=\s*['\"].\|sk-\|-----BEGIN" \
  --include="*.java" --include="*.py" --include="*.ts" --include="*.js" --include="*.dart" \
  --include="*.yml" --include="*.yaml" --include="*.properties" \
  . 2>/dev/null | grep -v "node_modules\|.git\|test\|#\|//" | head -20
```

**Environment variable usage (ensure secrets aren't hardcoded):**
```bash
grep -rn "process\.env\|os\.environ\|System\.getenv" \
  --include="*.ts" --include="*.js" --include="*.py" --include="*.java" \
  . 2>/dev/null | grep -v "node_modules\|.git" | head -20
```

### 3. Check for dependency CVEs

Run whichever is applicable to your stack:

```bash
# Node.js
npm audit 2>&1 | tail -20

# Java/Maven
mvn org.owasp:dependency-check-maven:check -DfailBuildOnCVSS=7 2>&1 | tail -20

# Python
pip install safety --quiet && safety check 2>&1 | tail -20

# Flutter
flutter pub outdated 2>&1 | head -30
```

### 4. Spawn security-engineer agent

```
You are performing a security audit for this project.
(Infer the project name from AGENTS.md, git remote, or package.json.)

## Scope
$ARGUMENTS [or "Full system audit" if no argument]

## Auth / Security Configuration
[content from discovery commands]

## Token / Credential Handling
[content from discovery commands]

## Dependency Files
[content from dependency manifests]

## Hardcoded Secrets Check
[grep results — flag any findings]

## Dependency CVE Check Results
[output from applicable CVE check commands]

## Instructions
1. Audit all provided context against your full security checklist (OWASP API Top 10, OWASP Mobile Top 10 if applicable).
2. Produce your standard Security Audit Report.
3. For each finding, include:
   - Exact file/line reference
   - OWASP category
   - Severity (Critical/High/Medium/Low)
   - Specific remediation
4. End with a PASS / CONDITIONAL PASS / FAIL release recommendation.
```

### 5. Route critical and high findings

If the report contains any **Critical** or **High** findings, immediately flag them to the user with a clear summary:

```
Security audit complete. [N] issues require immediate attention.

## Critical Findings (block release)
[paste Critical section]

## High Findings (fix before production)
[paste High section]

## Recommended Fix Priority
[list each finding with: file, severity, fix]
```

### 6. Present to user

Show the full security report. Prepend:
> "Security Audit complete: [N] Critical, [N] High, [N] Medium, [N] Low findings."
> "Release recommendation: **[PASS / CONDITIONAL PASS / FAIL]**"

If FAIL: "The following must be fixed before any production deployment: [list Critical issues]"

## Notes

- Never print actual secret values — only flag that they exist and where
- The dependency CVE check commands may be slow or require network — if they timeout, note it and proceed with manual review
- If `$ARGUMENTS` is `deps`, skip steps 2-4 and only run the dependency checks
