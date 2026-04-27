---
name: deploy-check
description: Use when someone wants to deploy, run a pre-deployment checklist, verify the system is ready to deploy, or check if it's safe to release.
argument-hint: "dev | uat | prod"
disable-model-invocation: true
---

## What This Skill Does

Runs a pre-deployment checklist before deploying to an environment. Spawns the `devops-engineer` agent to validate infrastructure readiness. Blocks deployment if any critical check fails.

## Steps

### 1. Determine target environment

If `$ARGUMENTS` is one of `dev`, `uat`, or `prod`, use it. Otherwise ask the user.

If target is `prod` — warn immediately:
> "⚠️ You are targeting PRODUCTION. All checks must pass before proceeding."

### 2. Run pre-flight checks in parallel

**Git checks:**
```bash
git status --short
git log --oneline -5
git branch --show-current
```

**Env file check:**
```bash
# Check env file exists and required keys are present
grep -c "JWT_SECRET\|POSTGRES_PASSWORD\|GEMINI_API_KEY\|GOOGLE_CLIENT_ID" env.[TARGET]
```
Read the env file (without printing secret values) and verify no value is empty, `changeme`, `your_*`, or a placeholder.

**Backend tests:**
```bash
cd backend && mvn test -q 2>&1 | tail -5
```

**AI service syntax check:**
```bash
cd ai-service && python3 -m compileall app/ -q 2>&1
```

**Docker compose validate:**
```bash
docker compose -f docker-compose.[TARGET].yml config --quiet 2>&1
```

### 3. Spawn devops-engineer agent for env audit

Pass the env file check results and compose config to the devops-engineer agent:

```
Pre-deployment check for [TARGET] environment.

## Results so far
[paste all check results from step 2]

## Instructions
1. Validate that all required env vars are set and non-empty (JWT_SECRET, POSTGRES_PASSWORD, GEMINI_API_KEY, GOOGLE_CLIENT_ID, AI_BASE_URL).
2. Check that AI_BASE_URL does not point to localhost for non-local environments.
3. Flag any values that look like placeholders or test secrets.
4. Review the docker-compose config for obvious issues.
5. Produce a GO / NO-GO recommendation with a checklist.
```

### 4. Present checklist result

```
# Pre-Deployment Checklist — [TARGET]

| Check | Status | Notes |
|-------|--------|-------|
| Git working tree clean | ✅ / ❌ | |
| On correct branch | ✅ / ❌ | |
| Env file exists | ✅ / ❌ | |
| All required env vars set | ✅ / ❌ | |
| No placeholder secrets | ✅ / ❌ | |
| Backend tests pass | ✅ / ❌ | |
| AI service syntax valid | ✅ / ❌ | |
| Docker compose valid | ✅ / ❌ | |
| GCR images built & pushed (prod) | ✅ / ❌ | Required — VM cannot build |

## Verdict: ✅ GO / ❌ NO-GO

[If NO-GO: list the specific checks that failed and what to fix]
[If GO: confirm the deploy steps to run]
```

### 5. Confirm before deploying

If all checks pass, show the deployment steps based on environment:

**For prod** (GCR-based — do NOT build on VM):
```
⚠️  DO NOT run deploy_to_gcp_prod.sh — it creates a NEW VM, not updates the existing one.

Steps to deploy to production:
1. docker build -t gcr.io/my-project-poc-478915/health-coach-ai:latest ./ai-service
2. docker build -t gcr.io/my-project-poc-478915/health-coach-backend:latest ./backend
3. docker push gcr.io/my-project-poc-478915/health-coach-ai:latest
4. docker push gcr.io/my-project-poc-478915/health-coach-backend:latest
5. gcloud compute scp [updated files] health-coach-dev:/opt/health-coach/ --zone=us-central1-a
6. gcloud compute ssh health-coach-dev --zone=us-central1-a --command='
     cd /opt/health-coach &&
     sudo docker pull gcr.io/my-project-poc-478915/health-coach-ai:latest &&
     sudo docker pull gcr.io/my-project-poc-478915/health-coach-backend:latest &&
     sudo docker compose -f docker-compose.prod.yml up -d postgres fastapi-ai springboot-app &&
     sudo systemctl restart health-coach-nginx'
7. curl https://healthcoach.duckdns.org/actuator/health
```

**For dev/uat:** `./deploy_to_gcp_[TARGET].sh` (these scripts are safe)

Ask: "All checks passed. Proceed with the deployment steps above?"

Do NOT execute any deploy without explicit user confirmation.

## Notes

- Never print the actual values of secrets — only confirm they are set and non-empty.
- A dirty git working tree is a warning for dev/uat but a blocker for prod.
- Failed backend tests are always a blocker regardless of environment.
- **Prod VM is e2-micro (1 GB RAM)** — building Docker images will OOM and freeze the VM. Always use GCR pre-built images for prod.
