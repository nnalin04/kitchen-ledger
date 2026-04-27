---
name: e2e-env-check
description: Use when checking if the E2E environment is ready — services running, Android emulator available, Flutter app builds. First phase of E2E testing. Called by /e2e-test automatically.
disable-model-invocation: true
---

## What This Skill Does

Verifies the full E2E environment is ready: backend services + Android emulator + Flutter build. Requests DevOps to deploy if services are down. Returns a readiness report that `/e2e-run` uses to decide whether to proceed.

---

## Step 1 — Backend Services

```bash
docker compose ps
curl -s --max-time 5 http://localhost:8080/actuator/health
curl -s --max-time 5 http://localhost:8000/health
```

If `springboot-app` or `fastapi-ai` are not running or health endpoints fail:

Spawn `devops-engineer` agent:
```
ESCALATION from qa-tester: E2E tests blocked — backend services not running.
docker compose ps output: [paste]
Please: run `docker compose up -d --build`, wait for healthy, confirm both health endpoints respond.
```

Wait for confirmation. If deploy fails → report BLOCKED, stop. Do not proceed to emulator check.

---

## Step 2 — Android Emulator

```bash
flutter devices
adb devices
```

If no emulator with status `device`:
```bash
flutter emulators
flutter emulators --launch $(flutter emulators 2>/dev/null | grep -oE '\S+_API_\S+|\S+Pixel\S+' | head -1)
```
Wait 15s, re-check. If still no device:

Tell user: "No emulator available. Open Android Studio → AVD Manager → Start an emulator, then re-run."
Report status: EMULATOR_UNAVAILABLE. Stop.

If emulator is `offline`:
```bash
adb kill-server && adb start-server
```
Re-check. If still offline → report EMULATOR_OFFLINE.

---

## Step 3 — Flutter Build Check

```bash
cd mobile && flutter build apk --debug 2>&1 | tail -10
```

If build fails → capture error, spawn `project-manager`:
```
BLOCKER: Flutter debug build failed. Cannot run E2E tests on a broken build.
Error: [paste]
Please route to flutter-expert to fix.
```
Report: BUILD_FAILED. Stop.

---

## Readiness Report

```
## E2E Environment Check

| Component | Status | Detail |
|-----------|--------|--------|
| Backend (8080) | ✅ READY / ❌ DOWN / ⚠️ DEPLOYED | [note] |
| AI Service (8000) | ✅ READY / ❌ DOWN / ⚠️ DEPLOYED | [note] |
| Android Emulator | ✅ READY / ❌ UNAVAILABLE / ⚠️ STARTED | [emulator ID] |
| Flutter Build | ✅ PASS / ❌ FAILED | [note] |

## Overall: ✅ READY TO TEST / ❌ BLOCKED
[If blocked: reason and what to fix]
```

## Learnings
End every response with:
- **Gap:** [anything missing you had to improvise]
- **Improvement:** [what to add to this sub-skill]
- **Pattern:** [recurring env issue]
If nothing: `## Learnings — nothing to report this run.`
