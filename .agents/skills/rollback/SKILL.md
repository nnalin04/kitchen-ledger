---
name: rollback
description: Use when someone wants to rollback a deployment, revert to a previous version, undo a release, or recover from a bad deploy.
argument-hint: "dev | uat | prod"
disable-model-invocation: true
---

## What This Skill Does

Guides a safe rollback to the previous stable state. Always confirms with the user before executing any destructive action. Uses the `devops-engineer` agent to assess the situation first.

## Steps

### 1. Determine environment

From `$ARGUMENTS`: `dev`, `uat`, or `prod`. If not provided, ask.

If `prod`: show a strong warning before anything else:
> "⚠️ PRODUCTION ROLLBACK — This will take down the current production deployment. Confirm you want to proceed?"

Wait for explicit confirmation before continuing.

### 2. Assess current state

```bash
docker compose ps
docker compose logs --tail=30 springboot-app 2>&1
docker compose logs --tail=30 fastapi-ai 2>&1
git log --oneline -10
```

### 3. Spawn devops-engineer agent to assess

Pass the current state:

```
A rollback has been requested for [ENVIRONMENT].

## Current Container State
[docker compose ps output]

## Recent Backend Logs
[springboot-app logs]

## Recent AI Service Logs
[fastapi-ai logs]

## Git Log (last 10 commits)
[git log output]

## Instructions
1. Identify what likely caused the need for rollback (from the logs).
2. Determine the rollback strategy:
   a. Code rollback: revert to previous git commit + redeploy
   b. Container rollback: restart with previous image (if tagged)
   c. Config rollback: revert env file change
3. Recommend the safest approach.
4. List exactly what commands to run, in order.
5. Identify any data migration risks (if DB schema changed in the bad deploy, rolling back code won't fix DB state).
```

### 4. Present rollback plan

Show the devops-engineer's recommended plan to the user:

```
# Rollback Plan — [ENVIRONMENT]

## Root Cause Assessment
[from agent]

## Recommended Strategy
[Code / Container / Config rollback]

## Steps to Execute
1. [exact command]
2. [exact command]
...

## ⚠️ Risks
[Data migration risks, user session impact, etc.]

## Verification After Rollback
[What to check to confirm rollback succeeded]
```

Ask: "Proceed with this rollback plan? Type YES to confirm."

### 5. Execute only after YES

Execute the commands from the plan, one at a time, showing output after each.

**Typical rollback commands:**

**Container restart (fastest — no code change, prod):**
```bash
# On prod VM — pull current GCR images and restart
gcloud compute ssh health-coach-dev --zone=us-central1-a --project=my-project-poc-478915 \
  --command='cd /opt/health-coach &&
    sudo docker compose -f docker-compose.prod.yml down fastapi-ai springboot-app &&
    sudo docker pull gcr.io/my-project-poc-478915/health-coach-ai:latest &&
    sudo docker pull gcr.io/my-project-poc-478915/health-coach-backend:latest &&
    sudo docker compose -f docker-compose.prod.yml up -d postgres fastapi-ai springboot-app'
# nginx stays up during backend rollback; restart only if nginx config changed:
# sudo systemctl restart health-coach-nginx
```

**Code rollback + redeploy (prod — GCR-based, NEVER build on VM):**
```bash
git log --oneline -10  # show user the commits to choose from
git revert HEAD        # or git checkout <sha> -- for specific files

# Rebuild and push new images to GCR
docker build -t gcr.io/my-project-poc-478915/health-coach-ai:latest ./ai-service
docker build -t gcr.io/my-project-poc-478915/health-coach-backend:latest ./backend
docker push gcr.io/my-project-poc-478915/health-coach-ai:latest
docker push gcr.io/my-project-poc-478915/health-coach-backend:latest

# Then pull on VM (see container restart above)
```

**If VM is frozen/unresponsive (OOM from accidental build):**
```bash
gcloud compute instances reset health-coach-dev --zone=us-central1-a --project=my-project-poc-478915 --quiet
# Wait ~40 seconds, then containers auto-restart (restart: unless-stopped)
# nginx auto-restarts via health-coach-nginx.service
```

### 6. Verify rollback

After execution:
```bash
curl -s https://healthcoach.duckdns.org/actuator/health
# expected: {"status":"UP"}

gcloud compute ssh health-coach-dev --zone=us-central1-a --project=my-project-poc-478915 \
  --command='sudo docker ps --format "{{.Names}}: {{.Status}}"'
```

Report health status. If services are not healthy after rollback, surface the logs immediately.

## Notes

- Never use `git reset --hard` on a shared/remote branch — use `git revert` to create a new undo commit.
- Never drop or modify the PostgreSQL database during rollback without explicit instruction — data loss is not recoverable.
- If the rollback itself fails, stop and surface the error. Do not loop or retry automatically.
- Always document what happened: tell the user which commit was the bad one and what git SHA they rolled back to.
