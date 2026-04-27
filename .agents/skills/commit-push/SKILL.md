---
name: commit-push
description: Use when someone asks to commit and push code, save changes to git, stage and commit work, or push commits to the remote repository.
argument-hint: "optional commit message"
disable-model-invocation: true
---

## What This Skill Does

Stages changed files, drafts a conventional commit message, commits, and pushes to the remote tracking branch. Requires explicit user confirmation before pushing.

If `$ARGUMENTS` is provided, use it as the commit message (skip drafting). Otherwise draft one from the diff.

## Steps

### 1. Gather context

Run these in parallel:
- `git status --short` — see what is staged, modified, and untracked
- `git diff HEAD` — see all changes to understand intent
- `git log --oneline -5` — learn the project's commit message style
- `git branch --show-current` — know the current branch
- `git remote -v` — confirm a remote exists

### 2. Safety checks

- If there are **no changes** (clean working tree), tell the user and stop.
- If the current branch is `main` or `master`, warn the user explicitly before proceeding:
  > "You are about to commit directly to `main`. Are you sure?"
  Ask them to confirm before continuing.
- If there are **untracked files**, list them but do NOT stage them automatically. Tell the user:
  > "These untracked files will NOT be staged. Stage them manually if needed: [list]"

### 3. Stage files

Stage only **modified and deleted tracked files** — never untracked files blindly:

```
git add -u
```

If the user passed specific file paths in `$ARGUMENTS`, parse them out and stage those files instead:

```
git add <paths from $ARGUMENTS>
```

### 4. Draft commit message

If `$ARGUMENTS` contains a commit message (not file paths), use it verbatim.

Otherwise, analyze `git diff --cached` and write a message following the project's existing style (from step 1). Use conventional commit format when the project already uses it:

```
<type>(<scope>): <short summary>

<optional body — what changed and why, max 3 bullet points>
```

Common types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`.

- Keep the subject line under 72 characters.
- Focus on **why**, not just what.
- Do NOT add `Co-Authored-By` lines — this is a user commit.

Show the drafted message to the user:
> "Proposed commit message:"
> ```
> <message>
> ```
> "Proceeding with commit..."

### 5. Commit

```bash
git commit -m "$(cat <<'EOF'
<commit message here>
EOF
)"
```

If the commit fails due to a **pre-commit hook**:
- Show the hook output to the user.
- Do NOT use `--no-verify`.
- Fix the underlying issue (linting error, test failure, etc.) and retry.

### 6. Confirm before pushing

Tell the user:
> "Commit created. Ready to push to `<remote>/<branch>`. Pushing now..."

Then push:

```bash
git push
```

If the branch has no upstream tracking branch yet:
```bash
git push --set-upstream origin <branch>
```

If push is rejected (diverged history):
- Do NOT force push.
- Tell the user the push was rejected and show the error.
- Suggest: `git pull --rebase` to reconcile, then retry.

### 7. Report result

On success:
> "Pushed to `<remote>/<branch>`. Commit: `<short-sha>` — <subject line>"

On failure:
> "Push failed: <error>. <suggested next step>"

## Notes

- Never use `git add .` or `git add -A` — untracked files may include secrets (`.env`, credentials, build artifacts).
- Never use `--no-verify` to bypass hooks.
- Never force push to `main` or `master` under any circumstances.
- If there are staged changes already (user staged manually), skip step 3 and commit what is already staged.
- Check for staged changes first: `git diff --cached --quiet` exits non-zero if there are staged changes.
