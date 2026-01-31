# bots.lucheestiy.com — Details Page Aesthetics & Layout Refresh Plan

Last updated: 2026-01-31

Scope: the **Details** modal for a single bot (opened from the table). This UI is implemented in:
- `bots.lucheestiy.com/public/index.html` (DOM skeleton)
- `bots.lucheestiy.com/public/app.js` (rendering + actions)
- `bots.lucheestiy.com/public/styles.css` (visual design)

This document is focused on **aesthetics + layout** (visual hierarchy, spacing, responsiveness). Functional/feature roadmap lives in `bots.lucheestiy.com/DETAILS_PAGE_PLAN.md`.

## Current Issues (what feels “off”)

1. **Header meta is hard to scan:** a single long “•” line mixes identity + status + uptime + activity.
2. **Inconsistent vertical rhythm:** some blocks have extra bottom padding/spacing due to `margin-bottom` defaults on inner boxes.
3. **Wasted vertical space on desktop:** charts are stacked even when there’s plenty of horizontal room.
4. **Logs are too narrow:** bottom grid is 50/50; providers don’t need half the width, logs do.
5. **Section hierarchy could be stronger:** titles and “surface” containers could be more consistent and cohesive.

## Design Goals

- **Scan in 5 seconds:** title + status + enabled + uptime + last activity + issues.
- **Desktop uses width; mobile stays clean:** reduce scrolling on wide screens; stack naturally on small screens.
- **Low-risk iteration:** prefer CSS-first changes; keep existing element IDs so JS continues to work.
- **No new secrets exposure:** design work must not add any new sensitive content.

## Target Layout (visual map)

1. **Header**
   - Title
   - Meta chips (status/enabled colored)
   - Actions row: Prev/Next, Start/Stop/Restart, Enable/Disable, Copy link, Close

2. **Overview grid (top)**
   - Health
   - Systemd
   - Usage summary
   - Last error
   - Desktop: 4 columns when there’s room; Medium: 2×2; Mobile: stacked

3. **Usage**
   - Section header + 7d/30d switch
   - Tokens/day and Cost/day charts side-by-side on desktop; stacked on mobile

4. **Bottom**
   - Unit details (full width)
   - Providers (narrow column)
   - Logs (wide column)

## Step-by-step Implementation Plan

Each step should be shippable by itself. After each shipped UI change, bump cache-bust query params
(`index.html` → `styles.css?v=…` and `app.js?v=…`) so browsers don’t use stale assets.

### Step A — Normalize surfaces + spacing (CSS)

**Changes**
- Introduce/standardize a small set of “surface” styles used inside Details:
  - consistent radius, border, background, and padding
- Remove “automatic” bottom spacing in Details where it causes extra blank space (override inside `.detailModalCard`).

**Acceptance**
- Details sections look more consistent (no unexplained extra padding at the bottom of some blocks).
- No visible regressions in the main table view.

### Step B — Header meta chips (JS + CSS)

**Changes**
- Render `#detailMetaLine` as a set of chips instead of a single text line.
- Add severity coloring where it helps scanning:
  - status chip (good/warn/bad based on systemd + health)
  - enabled chip (enabled/disabled)

**Acceptance**
- Meta wraps cleanly on small screens, never overflows horizontally.
- Status is visually obvious without reading the whole line.

### Step C — Layout grids (CSS)

**Changes**
- Top overview grid becomes **4 columns** on wide screens (desktop), with responsive collapse.
- Usage charts become a **2-column grid** on wide screens.
- Bottom grid becomes **narrow Providers / wide Logs** (ratio like ~35/65) instead of 50/50.

**Acceptance**
- No horizontal scrolling inside the Details modal.
- Logs are comfortably readable on desktop (more width).
- On mobile, everything stacks and remains usable.

### Step D — “Copy link” action (JS)

**Changes**
- Add a “Copy link” button to Details actions. It should copy the current URL (which includes `?unit=` while Details is open).

**Acceptance**
- Copied URL re-opens the same bot Details when pasted in a new tab.

### Step E — QA + deploy hygiene

**Smoke checks**
- Open a few bots and verify:
  - Close on `Esc`
  - Prev/Next navigation still works
  - Load logs + search highlight still works
  - Copy buttons still work
- API health:
  - `curl -fsS http://127.0.0.1:8124/healthz`
  - `curl -fsS http://127.0.0.1:8123/api/bots | head`

## Tracking Checklist

- [x] Step A — Normalize surfaces + spacing (CSS)
- [x] Step B — Header meta chips (JS + CSS)
- [x] Step C — Layout grids (CSS)
- [x] Step D — “Copy link” action (JS)
- [x] Step E — QA + cache-bust bump (`?v=22`)
