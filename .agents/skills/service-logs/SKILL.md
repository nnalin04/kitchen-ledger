---
name: service-logs
description: Use when someone wants to see logs, check what a service is doing, diagnose a crash, view error logs, or tail a container's output.
argument-hint: "service: backend | ai-service | postgres | all] [optional: --lines N"
disable-model-invocation: true
---

## What This Skill Does

Fetches logs from running Docker containers and uses the `devops-engineer` agent to diagnose errors, crashes, or anomalies.

## Steps

### 1. Parse arguments

From `$ARGUMENTS`:
- Service name: `backend`, `ai-service`, `postgres`, or `all`
- Line count: look for `--lines N` pattern, default to `100`

If no service specified, default to `all`.

Map service names to Docker Compose service names:
- `backend` → `springboot-app`
- `ai-service` → `fastapi-ai`
- `postgres` → `postgres`

### 2. Check container status

```bash
docker compose ps
```

List which services are running, stopped, or restarting. Flag any that are not in "running" state.

### 3. Fetch logs

For each requested service:

```bash
docker compose logs --tail=[N] --timestamps [service-name] 2>&1
```

If a service is not running, still fetch its last logs:
```bash
docker compose logs --tail=50 [service-name] 2>&1
```

### 4. Spawn devops-engineer agent to analyse

Pass the logs to the devops-engineer agent:

```
Analyse the following service logs from the Personal Health Coach system.

## Container Status
[docker compose ps output]

## Logs
### [Service Name]
[log output]

## Instructions
1. Identify any errors, warnings, exceptions, or crash signatures.
2. For each issue found:
   - Quote the relevant log line(s)
   - Explain what it means
   - Suggest the fix
3. Flag any: OOM kills, port conflicts, DB connection errors, Gemini API errors, JWT failures, startup failures.
4. If logs look healthy, confirm that explicitly.
5. Produce a summary: health status per service + top issues to investigate.
```

### 5. Present results

Show the devops-engineer's analysis. Include the raw log snippet for each issue identified so the user can see the exact error.

If a service is crashed or restarting:
> "⚠️ [service] is not running. Last known error: [from log analysis]. Suggested fix: [from agent]."

## Notes

- Never filter out stack traces — they are the most useful part.
- If postgres logs show `FATAL: role does not exist` or `database does not exist`, that's a first-boot init issue — suggest `docker compose down -v && docker compose up -d`.
- If springboot-app logs show `Connection refused` to fastapi-ai, check that the AI service started first and `AI_BASE_URL` is correct.
- Truncate log output shown to the user to last 50 lines per service to avoid flooding the chat — but pass full output to the agent.
