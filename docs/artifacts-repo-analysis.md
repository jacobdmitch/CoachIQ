# Repo analysis: `benchflow-ai/artifacts`

*Analysis prepared 2026-08-12. Source: [github.com/benchflow-ai/artifacts](https://github.com/benchflow-ai/artifacts), commit `b3276eb`.*

## What it is

A tiny (1,001 LoC, 3 scripts), stdlib-only Python toolkit for treating a private code repository
as a **data asset** — specifically, for the emerging market of AI labs buying codebases to build
verifiable SWE-bench-style RL training environments (issue → gold fix → a test that provably goes
fail → pass). It is packaged as three **Claude/agent "skills"** (a `SKILL.md` instruction file plus
a runnable script each), meant to be dropped into an agent's skills directory or invoked by hand.

| Skill | Runs where | Purpose |
|---|---|---|
| `repo-report` | seller's machine, offline | Mines LoC, PR/commit history, test ratio, function/class counts, license, and picks real code excerpts + sample PR diffs for a buyer's catalog. **No pricing or scoring** — mining only. |
| `repo-verify` | dynamic, online | *Executes* a fix PR in a throwaway `git worktree`: checks out the pre-PR commit, applies only the PR's tests (expects FAIL), then the source fix (expects PASS). A real FAIL→PASS is `verified: true`; anything else is an honest `verified: false` with a reason. |
| `repo-scrub` | before sharing | Scans tracked files + git history for leaked secrets, checks for a LICENSE, flags AI/bot committers. `--fix` untracks `.env`, writes a blanked `.env.example`, and scaffolds a LICENSE. Never rewrites history automatically. |

Repo stats: 7 commits, single author (Xiangyi Li, benchflow.ai), created and last touched
2026-08-11/12, AGPL-3.0 licensed, no CI/tests/lockfiles — this is a young, single-purpose internal
tool, not a maintained library.

## Design strengths

- **Honesty-biased by construction.** The stated design goal — "fail in the honest direction" — is
  actually implemented, not just asserted in the README:
  - `repo-verify` only reports `verified: true` after observing an actual FAIL→PASS transition in
    a real subprocess run (`verify_env.py:185`); a build that won't reproduce is coded as a
    legitimate `verified: false` with a `reason` string, never silently dropped.
  - `repo-report` explicitly has no pricing/scoring path — it emits metrics and marks
    `"% Rich PRs is a lower bound"` and `"functions/classes ... regex estimates"` directly in the
    output (`build_highlights`, `write_markdown`), so the limitation travels with the number instead
    of living only in a README a buyer won't read.
- **Redaction is applied before data leaves the machine, not after.** Every code excerpt and PR
  diff passes through `redact_secrets()` before being written to the JSON/Markdown output
  (`repo_report.py:318`), and the same regex set is reused (with additions) in `scrub_repo.py`.
- **Destructive operations require a human.** `repo-scrub --fix` only does reversible actions
  (`git rm --cached`, `.gitignore` edit, blanked `.env.example`, LICENSE scaffold); history rewrites
  are never executed — the tool prints the exact `git filter-repo` command and stops
  (`scrub_repo.py:166`). `repo-verify` never touches the caller's working checkout; it operates in
  an isolated `git worktree` that is removed in a `finally` block even on failure
  (`verify_env.py:194`).
- **Good git plumbing craftsmanship.** Small but real correctness details: earliest-commit
  detection uses `rev-list --max-parents=0` rather than `log --reverse -n1`, with a comment
  explaining why the latter is wrong for repos with multiple roots (`repo_report.py:179`); PR
  sampling excludes vendor paths and non-code files so diffs don't open on `package-lock.json`;
  sample-PR selection actively penalizes dependency-bump/translation churn so a buyer isn't shown
  padding as if it were engineering (`repo_report.py:404`).

## Weaknesses and risks

- **`repo-verify` shells out to `npm ci`, `pip install -e .`, `uv sync`, and `npx vitest/jest`
  against arbitrary target-repo dependency manifests** (`verify_env.py:102-118`), with no sandboxing
  beyond an OS-level `git worktree`. Any target repo can run arbitrary `postinstall`/setup-time code
  during dependency installation. That's a normal cost of "actually build and run the tests," but it
  means `repo-verify` should only ever be pointed at a repo the operator already trusts enough to
  `npm install` — nothing about the tool enforces that boundary, and neither `SKILL.md` calls it out.
- **`repo-scrub`'s secret scan is regex-only** — `AKIA[0-9A-Z]{16}`, PEM headers, `key/token/secret =
  "..."` assignments, and (for `.env` files) any `NAME=value` line where the value is ≥12 chars
  (`scrub_repo.py:27-33`). It will miss anything shaped differently (secrets in JSON/YAML config,
  base64-wrapped keys, secrets split across concatenation) and has no allowlisting for
  false-positive-prone constants. Its own author output demonstrates this isn't hypothetical: see
  below.
- **Demonstrated false positive in `repo-scrub`'s own self-scan.** Running
  `scrub_repo.py` against the `artifacts` repo itself reports 5 "history hits" for `AKIA`,
  `PRIVATE KEY`, `API_KEY`, `SECRET`, `TOKEN` — but these are matches on the *literal regex pattern
  strings* inside `scrub_repo.py`'s and `repo_report.py`'s own source (e.g. the string `"AKIA"`
  appearing inside `re.compile(r"\bAKIA[0-9A-Z]{16}\b")`), because `git log -S<term>` is a raw
  substring pickaxe search with no awareness that the match is sitting inside a regex literal
  rather than a real credential. This isn't a bug exactly — `-S` search is doing what it's told —
  but it means every run against a repo that *contains this tool's own source* (or any other
  security scanner) will report history hits that require a human to dismiss, and `SKILL.md`
  doesn't mention this specific self-referential failure mode.
- **`resolve_pr()` in `repo-verify` falls back to the `gh` CLI** (`verify_env.py:61`) for PRs it
  can't resolve from local merge-commit history, but neither the script nor its `SKILL.md` documents
  that `gh` (with repo auth) needs to be installed/available for that path — it will silently no-op
  back to "could not resolve" territory on a machine without it.
- **No automated tests for the tools themselves.** `repo-report`'s own self-report (produced during
  this analysis) shows `0 test files`, `0.0% test-to-code ratio` for a toolkit whose entire value
  proposition is proving other repos' tests are real — dogfooding it against itself is the most
  direct sanity check available, and it currently fails its own bar for what an ideal target repo
  looks like. That's consistent with a young/prototype-stage tool (7 commits, one contributor,
  2 days old) but is worth flagging before it's relied on for buyer-facing evaluations.

## Notable implementation details

- **License classification is text-based, not filename-based**, and handles the common case where
  BSD/MIT license bodies never contain the word "BSD"/"MIT" — it checks canonical phrasing
  ("permission is hereby granted, free of charge", "redistribution and use in source and binary
  forms") before falling back to keyword matching (`repo_report.py:258-272`), which is more robust
  than most ad hoc license detectors.
- **Excerpt selection is control-flow-density-based**, not just "biggest function": it scores
  candidate code blocks by count of `if/else/for/while/try/except/await/async/raise` tokens plus
  non-blank line count, on the reasoning that buyers judge "real engineering vs. boilerplate" by
  branching density (`repo_report.py:332-350`, `BRANCHY` regex).
- **PR-tier heuristic is buyer-catalog-aware**: "rich" requires an issue reference *and* either
  touched tests or ≥3 files; "simple" is ≤2 files with no issue reference — mirroring the tier
  definitions documented verbatim in `references/catalog-template.md`, so the script's output and
  the human-facing column definitions can't drift apart silently.
- The AGPL-3.0 license on the toolkit itself is a reasonable choice given it's aimed at other
  companies building similar seller-side tooling, though worth double-checking against how
  `benchflow.ai` intends this to be distributed/embedded (AGPL's network-copyleft trigger doesn't
  usually apply to a locally-run CLI script, but linking/embedding this into a hosted SaaS product
  would need review).

## Bottom line

This is a small, sharply-scoped internal tool built with a clear point of view: **be honest about
what you don't know rather than inflating a metric to look better for a sale.** That principle is
implemented consistently across all three scripts, not just claimed in the docs — the "verified"
flag genuinely requires an observed FAIL→PASS, and every quantitative claim in `repo-report`'s
output carries its own caveat inline. The main gaps are the kind you'd expect from a 2-day-old,
single-author, test-free codebase: no sandboxing boundary around `repo-verify`'s arbitrary
dependency installs, a purely regex-based secret scanner with a demonstrable self-referential false
positive, and no test suite exercising the tools' own correctness. None of those are architectural
problems — they're the natural next hardening pass for a prototype that already got the harder
design decision (fail honest, not fail impressive) right.
