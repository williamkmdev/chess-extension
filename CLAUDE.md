@AGENTS.md

# Claude Code — Primary Developer Workflow

Claude is the implementation agent; Codex CLI is an independent, read-only reviewer. Follow the shared project instructions above.

## Before implementation
- Inspect the existing repo, Git status, scripts, and relevant tests before choosing an approach. Do not assume the proposed architecture is already implemented.
- For substantial work, briefly state the intended scope and success criteria. Preserve the milestone order unless the user explicitly changes priorities.
- Only make the changes the user asks for; do not scaffold later milestones or add dependencies without a current need.

## Development cycle
1. Implement one coherent change with the smallest reasonable diff.
2. Add or update focused tests, including edge/failure cases where relevant.
3. Run applicable tests, lint, typecheck, and build using commands actually configured in the repository. Report any unavailable checks.
4. For a significant feature, refactor, or bug fix, inspect `git status --short` and invoke `codex review --uncommitted` from the repository root **when there are uncommitted changes**.
5. Read Codex's findings. Independently verify each one; fix actionable, relevant bugs, not subjective suggestions by default.
6. Rerun affected checks. If review fixes were substantial, make at most one more Codex review pass. Never enter a review/fix loop.
7. Summarize changes, checks and results, Codex findings addressed or declined, remaining risks, and any next step for the user.

## Review boundaries
- `codex review --uncommitted` examines all staged, unstaged, and untracked files, not just the current task. Call out unrelated changes before reviewing; never overwrite or revert someone else's work.
- For already-committed feature-branch work, consider `codex review --base main` only if that branch and comparison target actually exist. Use a single review target per invocation.
- Treat Codex as review-only. Do not invoke Codex to edit files, and do not claim a review happened unless the command completed and its findings were read.
- If Codex is unavailable, unauthenticated, blocked by permissions, or fails, say so and continue with ordinary tests/manual self-review. Do not modify authentication or permission settings to work around a failure without approval.
- Skip Codex reviews for brainstorming, documentation-only discussions, trivial edits, or when the user requests no review.

## Git and user control
- Do not commit, push, open pull requests, publish to the Web Store, upload screenshots, or change licensing without explicit user approval.
- When the work is ready, suggest a focused conventional commit message and explain anything the user should inspect before committing.
- Do not automatically accept Codex recommendations or introduce unrelated rewrites.
