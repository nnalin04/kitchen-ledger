---
name: prd
description: Use when someone wants to create a PRD, product requirements document, write up what the product does, document the features and requirements, or create a product spec.
argument-hint: "optional: focus area e.g. 'v2' or 'ai-features'"
disable-model-invocation: true
---

## What This Skill Does

Creates a comprehensive PRD by dispatching domain agents in parallel to research their areas, collecting all findings, asking the user clarifying questions, then synthesising everything into a structured PRD saved to `plans/PRD.md`.

**Orchestration pattern:**
1. PM announces execution plan
2. Domain agents run in parallel (read-only research)
3. PM asks user clarifying questions
4. PM synthesises PRD from all agent input + user answers

---

## Step 1 — Announce Execution Plan

```
## Execution Plan — PRD Creation

Dispatching 4 domain agents in parallel to audit their areas.

| Agent | Reviews |
|-------|---------|
| reviewer | Backend APIs, mobile screens, AI service, UX quality — all code domains |
| devops-engineer | Environments, deployment model, infra state, blockers |
| security-engineer | Security posture, compliance gaps, pre-release requirements |
| qa-tester | Test coverage, E2E readiness, quality gaps |

Gathering data now...
```

---

## Step 2 — Dispatch Agents in Parallel

Spawn all 4 agents simultaneously using the Agent tool with `run_in_background: true`.

### reviewer prompt:
```
Research task for PRD creation. DO NOT modify any files.

Read the codebase and produce a comprehensive Code & UX Capabilities Report covering:

**Backend (Spring Boot):**
1. List every REST endpoint group (controller name + base path + HTTP methods)
2. List all data entities and their key fields
3. Describe the authentication model (JWT, OAuth, token lifecycle)
4. Identify any endpoints that are stubbed, incomplete, or TODO-marked
5. Note CRUD gaps (missing DELETE/UPDATE operations)

**AI Service (FastAPI + Gemini):**
1. List every FastAPI route with its path, method, and purpose
2. Describe each Gemini integration (prompt purpose, input, expected output)
3. List all Pydantic schemas (request + response) with key fields
4. Identify any AI features planned but not yet implemented
5. Note limitations or known issues

**Mobile (Flutter):**
1. List every screen in features/ with its purpose and key user actions
2. Map the primary navigation flows
3. List all Riverpod providers and what state they manage
4. Identify screens that are empty, placeholder, or partially implemented
5. Note UX gaps: backend features with no mobile screen

**UX/Design:**
1. List all screens and their visual completeness (Complete / Partial / Placeholder)
2. Assess overall design consistency against Material Design 3
3. Identify the top 3 UX friction points for a new user
4. Note accessibility gaps visible from code

Relevant dirs: backend/src/, ai-service/app/, mobile/lib/

Output format:
## Code & UX Capabilities Report
### Backend Endpoints
### Data Models
### Auth Model
### AI Service Routes & Gemini Integrations
### Mobile Screen Inventory
### Incomplete / Stub Features
### UX Quality Assessment
### Gaps

## Learnings — [gap/improvement/pattern if any]
```

### devops-engineer prompt:
```
Research task for PRD creation. DO NOT modify any files.

Review the infrastructure and produce an Infrastructure Report:
1. List all environments (local/dev/uat/prod) and their current state
2. Describe the deployment model (Docker Compose, GCP setup)
3. Read PROJECT_TODO.md and list all pending infrastructure tasks
4. Identify the current production readiness blockers

Relevant files: docker-compose*.yml, deploy_to_gcp*.sh, PROJECT_TODO.md, env.*

Output format:
## Infrastructure Report
### Environments
### Deployment Model
### Pending Infra Tasks (from PROJECT_TODO.md)
### Production Readiness Blockers

## Learnings — [gap/improvement/pattern if any]
```

### security-engineer prompt:
```
Research task for PRD creation. DO NOT modify any files.

Review security-relevant files and produce a Security Posture Report:
1. Check AndroidManifest for security flags (debuggable, allowBackup, exported activities)
2. Identify how JWT tokens are stored in the mobile app
3. Check if rate limiting is configured on the backend
4. List the top 3 security requirements that must be met before public release

Relevant files: mobile/android/app/src/main/AndroidManifest.xml,
backend/src/main/java/com/healthcoach/security/,
mobile/lib/ (grep for secure_storage, SharedPreferences)

Output format:
## Security Posture Report
### Android Manifest Status
### Token Storage
### Rate Limiting Status
### Top 3 Pre-Release Security Requirements

## Learnings — [gap/improvement/pattern if any]
```

### qa-tester prompt:
```
Research task for PRD creation. DO NOT modify any files.

Review the test suite and produce a QA Readiness Report:
1. List all test files found (backend, AI service, mobile)
2. Assess current test coverage quality (not just count — are critical paths covered?)
3. Identify the top 3 untested flows that pose the highest release risk
4. List any E2E or integration test infrastructure gaps

Relevant dirs: backend/src/test/, ai-service/tests/, mobile/integration_test/

Output format:
## QA Readiness Report
### Test Suite Inventory
### Coverage Assessment
### Highest-Risk Untested Flows
### Infrastructure Gaps

## Learnings — [gap/improvement/pattern if any]
```

---

## Step 3 — Collect and Store Learnings

After all agents complete:
- Collect each agent's `## Learnings` block
- Append to `.Codex/memory/learnings.md`

---

## Step 4 — Ask User Clarifying Questions

Before writing the PRD, ask the user these questions in a single round (use AskUserQuestion):

1. **Who is the primary user?** Personal use only / small group of users / plan to release publicly
2. **What is the #1 problem this product solves?** (in one sentence, from the user's perspective)
3. **Prioritisation for next 3 months:** New features / Bug fixes & stability / Production deployment / All equally
4. **Any features NOT in the codebase yet that you want included in the PRD?**

---

## Step 5 — Synthesise PRD

Using all agent reports + user answers, write the PRD to `plans/PRD.md`.

### PRD Structure:

```markdown
# Product Requirements Document
**Product:** Personal AI Health Intelligence System
**Version:** [date]
**Status:** Draft

## 1. Executive Summary
## 2. Problem Statement
## 3. Target Users
## 4. Goals & Success Metrics
## 5. Feature Inventory (Existing)
  ### 5.1 Backend Features
  ### 5.2 AI Features
  ### 5.3 Mobile Features
## 6. Feature Requirements (Planned)
## 7. Non-Functional Requirements
  ### 7.1 Security
  ### 7.2 Performance
  ### 7.3 Accessibility
  ### 7.4 Reliability
## 8. UX Requirements
## 9. Infrastructure & Deployment
## 10. Out of Scope
## 11. Release Plan
## 12. Open Questions
## 13. Appendix
```

---

## Step 6 — Save and Report

Save the PRD to `plans/PRD.md`. Tell the user:
> "PRD created at `plans/PRD.md`. Agents consulted: reviewer (code + UX), devops-engineer, security-engineer, qa-tester."

## Notes

- The PRD is a living document — re-run `/prd` at any milestone to update it
- `$ARGUMENTS` can scope the PRD to a specific area (e.g., `/prd ai-features`)
- User answers in Step 4 override agent assumptions where they conflict
