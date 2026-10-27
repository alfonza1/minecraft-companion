# Repository Working Agreement

## Report the active branch

- Begin every user-facing progress update and final response with
  `Branch: <branch-name>.`
- Check the current branch before reporting it, and check again after any operation
  that may change `HEAD`.
- If `HEAD` is detached, report the short commit SHA instead.

## Commit frequently

Treat this as standing authorization to create local Git commits while implementing
requested changes in this repository.

- Commit after each coherent, working increment: a feature slice, bug fix, refactor,
  test addition, or meaningful documentation/configuration change.
- For larger tasks, prefer several small logical commits over one final bulk commit.
- Before committing, review `git status` and the relevant diff, then run targeted
  validation appropriate to the change.
- Stage explicit paths. Never include unrelated or pre-existing user changes.
- Use concise, scoped commit messages consistent with the repository history, such as
  `dashboard: add needs-attention cards` or `core: fix unit conversion rounding`.
- Do not commit secrets, generated outputs, dependency directories, or knowingly
  broken code unless the user explicitly requests a checkpoint commit.
- Do not commit directly to `main`; create or use a feature branch.
- Do not push commits or open a pull request unless the user explicitly asks.

## Think about edge cases and trade-offs

Don't just build the happy path. Surface the implications a change creates, even when
the user didn't ask — then proceed with a sensible default rather than blocking.

- Call out second-order effects: trust and correctness (e.g. a margin-formula tweak
  silently changing every number on the dashboard), security, performance, cost,
  data migration, and backwards compatibility.
- Expose the tuning knobs: when behavior hinges on a constant or threshold, name it,
  keep it in one place, and tell the user how to adjust it.
- Consider the boundaries: empty/zero/overflow inputs, first/last item, offline and
  signed-out states, mobile vs desktop, and concurrent or repeated actions.
- State the trade-off and your assumption so the user can course-correct.

## Follow Clean Code best practices

Write code in the spirit of Robert C. "Uncle Bob" Martin's *Clean Code*.

- Intention-revealing names; no magic numbers — name the constant.
- Small functions that do one thing at a single level of abstraction.
- Prefer self-explanatory code over comments; when you do comment, explain the *why*,
  not the *what*.
- DRY — extract real duplication, but don't over-abstract before a second use exists.
- Keep side effects obvious and localized; functions should hold no surprises.
- Leave each file cleaner than you found it (the Boy Scout Rule), matching the
  surrounding style.
# Minecraft Companion

Extends Mineness with a localhost Realm runtime, dashboard, local speech and survival build tools. Preserve upstream src/ MCP entry points. Runtime owns exactly one bot; models output validated structured actions, never shell commands. Secrets and user state belong under LOCALAPPDATA/MinecraftCompanion outside this repo. Use npm test, npm run typecheck and npm run build. Real Realm tests require the user's licensed bot account and invitation. Never run privileged upstream test scripts against a Realm.

The workspace user instructions authorize scoped commits and normal feature-branch pushes; that authorization supersedes the copied agreement's default no-push rule.
