# bots.lucheestiy.com — Details Page Improvements Plan

Last updated: 2026-01-31

This plan focuses on the **Details** view opened from the Bots table (“Details” button / row click). The Details UI is currently implemented as a modal overlay in `bots.lucheestiy.com/public/index.html` and rendered by `bots.lucheestiy.com/public/app.js`.

## Goals

1. **Faster debugging:** make it easy to answer “what’s wrong?” within 10–20 seconds.
2. **Fewer clicks:** common workflows should be possible without leaving the Details modal.
3. **Shareable context:** allow copying a link / state that opens the same bot details.
4. **Safe by default:** don’t expose secrets (env vars / unit content) without redaction.
5. **Low-risk deploy:** small, reversible iterations; keep backwards compatibility.

## Non-goals (for now)

- Editing unit files from the UI
- Arbitrary shell execution from the UI
- Exposing raw unredacted environment variables

## Current Baseline (as of `?v=21`)

Details modal includes:
- Deep-linkable Details via `?unit=...` + Back/Forward support
- Prev/Next navigation (buttons + keyboard `←/→` or `k/j`)
- Header meta line + quick actions (Start/Stop/Restart/Enable/Disable + Close)
- **Health** issues list (incl. auto “Sync Claude auth” action for Anthropic OAuth failures)
- **Systemd** info box (state, enabled, uptime, restarts, memory, CPU, etc.)
- **Unit details** section (safe/redacted; includes unit file path, workdir, exec start, env summary + copy buttons)
- **Usage** summary + 30-day charts + provider breakdown
- **Usage charts**: hover tooltips + 7d/30d window toggle
- **Recent logs** (on-demand load + copy + since presets + search/highlight)

## Risks / Constraints

- `bots.lucheestiy.com` is protected, but still treat it as **sensitive**:
  - Unit environment variables and `ExecStart` may contain secrets.
  - Journald logs can contain secrets (already visible in the UI when loaded).
- `/api/bots` is refreshed frequently: avoid adding heavy per-bot commands there.
- Prefer **on-demand** endpoints for “deep” details (unit file, show/cat output, etc.).

## Roadmap (Step-by-step)

Each step is designed to be shippable independently. We will bump cache-bust query params
(`index.html` → `styles.css?v=…` and `app.js?v=…`) after each shipped UI change.

### Phase 1 — Shareable + Navigable Details (UX)

**P1.1 — Deep link to details via URL**
- Add support for `?unit=<systemd-unit>` to auto-open Details on page load.
- Update URL via `history.pushState()` on open/close.
- Support browser Back/Forward to close/open Details.
- Acceptance:
  - Opening a bot sets `?unit=...`.
  - Refreshing the page preserves the open bot details.
  - Back closes Details (and restores table scroll position if possible).

**P1.2 — Prev/Next navigation within Details**
- Add “Prev/Next” buttons in Details header (or compact arrows).
- Keyboard shortcuts while Details is open (proposal):
  - `j/k` or `ArrowDown/ArrowUp` → next/prev visible bot (based on current filter/sort/show).
  - `Esc` already closes; keep it.
- Acceptance:
  - You can iterate through bots without closing the modal.
  - Works consistently with filter/show/sort (only navigates visible list).

**P1.3 — Small UX polish**
- Sticky Details header while scrolling inside the modal.
- Add a “Copy link” action (copies current URL with `?unit=`).

### Phase 2 — Logs: faster triage

**P2.1 — Log “since” presets**
- Extend logs API to accept `since=` (unix seconds) or presets (`since=1h`, `since=active`).
- UI adds presets next to line count (e.g., “15m / 1h / 6h / since active”).
- Acceptance:
  - Loading logs with a preset shows relevant window quickly.

**P2.2 — Log search + highlight**
- Add client-side search box for loaded logs (does not hit API).
- Highlight matches + highlight common severity keywords (`ERROR`, `WARN`, etc.).
- Keep copy button copying **raw** logs.

**P2.3 — Optional: “Auto-load logs on open”**
- Toggle in Details: OFF by default; stored in `localStorage`.
- If ON, load logs automatically when opening Details (respect selected preset).

### Phase 3 — Unit/Service Details (safe, on-demand)

**P3.1 — New endpoint: unit diagnostics (redacted)**
- Add `GET /api/units/<unit>/details` (or `/api/units/<unit>/meta`) that returns:
  - `systemctl show` selected props not currently exposed (e.g., FragmentPath, ExecStart, WorkingDirectory, User)
  - (Optional) `systemctl status --no-pager` excerpt
  - Redacted env values:
    - allowlist keys (safe to show values): `CLAWDBOT_GATEWAY_PORT`, `CLAWDBOT_STATE_DIR`, `CLAWDBOT_CONFIG_PATH`
    - show other env keys without values, or with `***` after redaction
- Acceptance:
  - UI shows useful unit info without leaking secrets.

**P3.2 — Render “Unit details” section**
- Add a new Details block: “Unit details”.
- Show fragment path, working directory, exec start (redacted), user, and safe env.
- Provide “Copy” buttons for key fields (unit, port, state dir, fragment path).

### Phase 4 — Charts/Usage: more informative, still lightweight

**P4.1 — Chart tooltips**
- Hover a bar shows date + value (tokens/cost).
- Use existing 30d date list from API if present; otherwise infer index.

**P4.2 — 7d/30d toggle**
- Add a toggle to switch chart window between 7d and 30d (client-side).

### Phase 5 — Health actions: targeted repairs

**P5.1 — Expand actionable health issue mappings**
- For known issue keys, add contextual action buttons:
  - `backend_binary_unavailable` → “Restart”
  - `addr_in_use` → “Restart”
  - (Keep existing) `anthropic_oauth_refresh_failed` → “Sync Claude auth”
- Keep actions conservative: only call existing API endpoints unless needed.

## Tracking

Use this checklist as the source of truth across chat sessions:

- [x] P1.1 Deep link + back/forward support
- [x] P1.2 Prev/Next navigation (buttons + keyboard)
- [x] P1.3 Sticky header + Copy link
- [x] P2.1 Log “since” presets (API + UI)
- [x] P2.2 Log search + highlight
- [x] P2.3 Auto-load logs toggle (optional)
- [x] P3.1 Unit diagnostics endpoint (redacted)
- [x] P3.2 “Unit details” section (copy buttons)
- [x] P4.1 Chart tooltips
- [x] P4.2 7d/30d toggle
- [x] P5.1 More health repair actions

## Validation / Smoke Tests (repeat per step)

Local:
```bash
curl -fsS http://127.0.0.1:8124/healthz
curl -fsS http://127.0.0.1:8123/api/bots | head
```

Manual UI:
- Open Details, close with Esc, close by clicking outside.
- Trigger an action (Restart) and confirm UI refresh.
- Load logs at least once and verify copy works.
