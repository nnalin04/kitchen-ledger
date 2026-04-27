# /memory — Agent Memory Store

Typed, persistent memory for cross-session knowledge sharing between Codex agents.
Replaces ruflo's `memory/query` + `memory/store` MCP tools — no external dependency.

## Usage
```
/memory store  <type> <tags> "<content>"
/memory query  [type] [tag]
/memory clean                            ← removes expired entries
/memory export                           ← prints full store as JSON
```

## Entry Types (mirrors ruflo's memory schema)
| Type | When to use |
|------|-------------|
| `insight` | Something discovered about the codebase (patterns, gotchas) |
| `decision` | Architectural or implementation decision + rationale |
| `pattern` | Reusable solution pattern (e.g. "always use ResponseEntity.noContent()") |
| `error` | Bug root-cause and fix, so it's not repeated |
| `observation` | Neutral observation (performance data, test results) |

## Mode: store
Read `.Codex/memory/agent-memory.json`. Append a new entry:
```json
{
  "id": "<8-char-hex>",
  "type": "<type>",
  "tags": ["<tag1>", "<tag2>"],
  "content": "<content>",
  "created": "<ISO-8601>",
  "expires": "<ISO-8601 +30 days>"
}
```
Write the file back. Print: `Stored [<id>] <type>: <content[:60]>`.

## Mode: query
Read `.Codex/memory/agent-memory.json`. Filter entries by:
- `type` (if given) — exact match
- `tag` (if given) — entry must include the tag
- Skip entries where `expires` < now

Print as a table:
```
ID       Type       Tags                  Created     Content
-------- ---------- --------------------- ----------- ----------------------------------------
a3f2c1b0 insight    [backend, jpa]        2026-03-10  N+1 risk on WorkoutLog: use @EntityGraph
```
If no filters given, show all non-expired entries (latest 20).

## Mode: clean
Remove entries where `expires` < now. Print count removed.

## Mode: export
Print full JSON of non-expired entries (for backup or audit).

## Agent workflow (how agents SHOULD use this)
Every agent that discovers something non-obvious should STORE it:
```
At task end → /memory store insight [domain,tags] "what I learned"
At task start → /memory query [domain] to check prior knowledge
```

This gives future agents accumulated context without repeating investigation work.

## Learnings — nothing to report this run.
