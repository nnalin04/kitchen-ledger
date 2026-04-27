# /performance-analysis

Bottleneck detection across all three service tiers. Produces a ranked optimization report.

## Usage
```
/performance-analysis [mobile|backend|ai-service|full]
```
Default: `full` (all tiers).

## What to analyse per tier

### mobile (Flutter / Riverpod)
- **Rebuild storm**: Grep `lib/` for `Consumer` / `watch()` inside `build()` of widget trees that rebuild on every state change. Flag providers that are too broad.
- **Unnecessary awaits**: Grep for `await` inside `ListView.builder` builders or `build()` methods.
- **Image loading**: Check for uncached network images (missing `cached_network_image` or `CachedNetworkImageProvider`).
- **Dio timeouts**: Read `core/` for Dio config — flag missing `connectTimeout`/`receiveTimeout`.
- **Bundle size**: Run `flutter build apk --analyze-size` and report largest packages.

### backend (Spring Boot / JPA)
- **N+1 queries**: Grep `@OneToMany`/`@ManyToOne` for missing `fetch = FetchType.LAZY` or missing `@EntityGraph`.
- **Missing indexes**: Read all `V*.sql` Flyway migrations — flag FK columns without an `CREATE INDEX`.
- **Slow endpoints**: Read `application.yml` — check if `spring.jpa.show-sql` is enabled in prod (disable it). Check if connection pool (`spring.datasource.hikari.maximum-pool-size`) is tuned.
- **Serialization**: Grep controllers for `@ResponseBody` returning raw entities (should be DTOs).
- **Transaction scope**: Grep `@Transactional` for methods that are too broad (spanning HTTP calls).

### ai-service (FastAPI / Gemini)
- **Blocking calls**: Grep `routers/` for non-async route handlers (`def ` instead of `async def `).
- **Gemini payload size**: Read service layer — flag requests sending entire conversation history every call vs. summarising.
- **Cold start**: Read `main.py` — check if startup is doing heavy work synchronously (DB connections, model loading).
- **Missing caching**: Grep for repeated identical Gemini calls with same prompt pattern (candidate for `functools.lru_cache` or Redis).
- **Error propagation**: Grep for bare `except Exception` that swallow errors and hide latency spikes.

## Output format
Produce a ranked table:

```
Priority | Tier    | Issue                     | File:Line          | Fix
---------|---------|---------------------------|--------------------|-----
CRITICAL | backend | N+1 on WorkoutLog.user    | WorkoutService:42  | Add @EntityGraph
HIGH     | mobile  | Provider rebuilds dashboard| dashboard_screen   | Narrow provider scope
MEDIUM   | ai      | Blocking route handler    | insights_router:18 | Add async def
LOW      | backend | show-sql enabled in prod  | application.yml:31 | Remove/disable
```

Finish with: **Top 3 quick wins** (≤ 30 min each) and **1 architectural improvement** (> 1 day).

## Learnings — nothing to report this run.
