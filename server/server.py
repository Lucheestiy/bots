#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime as _dt
import json
import os
import pwd
import re
import shlex
import subprocess
import threading
import time
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG_PATH = ROOT / "config.json"


def _utcnow() -> _dt.datetime:
    return _dt.datetime.now(tz=_dt.timezone.utc)


def _json_dumps(obj: Any) -> str:
    # Compact JSON for speed (API is consumed by JS; readability isn't needed here).
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def _safe_int(v: object, default: int = 0) -> int:
    try:
        if v is None:
            return default
        if isinstance(v, bool):
            return int(v)
        if isinstance(v, (int, float)):
            return int(v)
        return int(str(v).strip() or default)
    except Exception:  # noqa: BLE001
        return default


def _safe_float(v: object, default: float = 0.0) -> float:
    try:
        if v is None:
            return default
        if isinstance(v, bool):
            return float(int(v))
        if isinstance(v, (int, float)):
            return float(v)
        return float(str(v).strip() or default)
    except Exception:  # noqa: BLE001
        return default


def _parse_iso(ts: str | None) -> _dt.datetime | None:
    if not ts:
        return None
    s = ts.strip()
    if not s:
        return None
    try:
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        dt = _dt.datetime.fromisoformat(s)
        if dt.tzinfo is None:
            return dt.replace(tzinfo=_dt.timezone.utc)
        return dt.astimezone(_dt.timezone.utc)
    except Exception:  # noqa: BLE001
        return None


def _run(cmd: list[str], timeout_s: int = 30) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            cmd,
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=timeout_s,
        )
    except subprocess.TimeoutExpired as e:
        stdout = (e.stdout or "").strip() if isinstance(e.stdout, str) else ""
        stderr = (e.stderr or "").strip() if isinstance(e.stderr, str) else ""
        if stderr:
            stderr = f"{stderr}\nTimeout after {timeout_s}s"
        else:
            stderr = f"Timeout after {timeout_s}s"
        return subprocess.CompletedProcess(cmd, 124, stdout=stdout, stderr=stderr)


_JOURNAL_TS_FORMATS = ("%Y-%m-%dT%H:%M:%S.%f%z", "%Y-%m-%dT%H:%M:%S%z")


def _parse_journal_ts(raw: str) -> _dt.datetime | None:
    token = (raw or "").strip()
    if not token:
        return None
    for fmt in _JOURNAL_TS_FORMATS:
        try:
            return _dt.datetime.strptime(token, fmt).astimezone(_dt.timezone.utc)
        except Exception:  # noqa: BLE001
            continue
    return None


def _extract_journal_ts_iso(line: str) -> str | None:
    token = (line or "").split(" ", 1)[0].strip()
    dt = _parse_journal_ts(token)
    if not dt:
        return None
    return dt.isoformat().replace("+00:00", "Z")


@dataclass(frozen=True)
class UnitSpec:
    unit: str
    scope: str = "system"  # "system" | "user"
    user: str | None = None
    uid: int | None = None


def _resolve_user_uid(spec: UnitSpec) -> tuple[str, int]:
    if spec.user:
        uid = int(spec.uid) if spec.uid is not None else int(pwd.getpwnam(spec.user).pw_uid)
        return (spec.user, uid)
    if spec.uid is not None:
        user = str(pwd.getpwuid(int(spec.uid)).pw_name)
        return (user, int(spec.uid))
    raise ValueError(f"user unit requires user or uid: {spec.unit}")


def _systemctl_cmd(spec: UnitSpec, args: list[str]) -> list[str]:
    if spec.scope == "user":
        user, uid = _resolve_user_uid(spec)
        runtime_dir = f"/run/user/{uid}"
        bus_addr = f"unix:path={runtime_dir}/bus"
        return [
            "sudo",
            "-u",
            user,
            "env",
            f"XDG_RUNTIME_DIR={runtime_dir}",
            f"DBUS_SESSION_BUS_ADDRESS={bus_addr}",
            "systemctl",
            "--user",
            *args,
        ]
    return ["systemctl", *args]


def _journalctl_cmd(spec: UnitSpec, args: list[str]) -> list[str]:
    if spec.scope == "user":
        user, uid = _resolve_user_uid(spec)
        runtime_dir = f"/run/user/{uid}"
        return [
            "sudo",
            "-u",
            user,
            "env",
            f"XDG_RUNTIME_DIR={runtime_dir}",
            "journalctl",
            *args,
        ]
    return ["journalctl", *args]


def _systemctl_show(spec: UnitSpec, props: list[str]) -> dict[str, str]:
    cmd = _systemctl_cmd(spec, ["show", spec.unit, "--no-pager"])
    for p in props:
        cmd += ["-p", p]
    proc = _run(cmd, timeout_s=10)
    out: dict[str, str] = {}
    for line in (proc.stdout or "").splitlines():
        if "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip()
    return out


def _systemctl_action(spec: UnitSpec, action: str) -> dict[str, object]:
    # Stopping some bots can take a while (Playwright / browser trees, etc.).
    proc = _run(_systemctl_cmd(spec, [action, spec.unit]), timeout_s=180)
    return {
        "exitCode": int(proc.returncode),
        "stdout": (proc.stdout or "").strip(),
        "stderr": (proc.stderr or "").strip(),
    }


def _proc_uptime_seconds() -> float:
    try:
        raw = Path("/proc/uptime").read_text(encoding="utf-8").strip().split()
        return float(raw[0])
    except Exception:  # noqa: BLE001
        return 0.0


def _collect_journal(spec: UnitSpec, lines: int, *, since: _dt.datetime | None = None) -> str:
    args: list[str]
    if spec.scope == "user":
        args = [f"--user-unit={spec.unit}", "-n", str(lines), "--no-pager", "-o", "short-iso"]
    else:
        args = ["-u", spec.unit, "-n", str(lines), "--no-pager", "-o", "short-iso"]
    if since is not None:
        args += [f"--since=@{int(since.timestamp())}"]
    proc = _run(_journalctl_cmd(spec, args), timeout_s=30)
    if proc.returncode != 0 and (proc.stderr or "").strip():
        return (proc.stderr or "").strip()
    return (proc.stdout or "").strip()


_SINCE_RE = re.compile(r"^(\d+)([smhd])$", re.IGNORECASE)


def _since_from_query(raw: str) -> _dt.datetime | None:
    s = (raw or "").strip().lower()
    if not s:
        return None
    if s.isdigit():
        try:
            return _dt.datetime.fromtimestamp(int(s), tz=_dt.timezone.utc)
        except Exception:  # noqa: BLE001
            return None
    m = _SINCE_RE.match(s)
    if not m:
        return None
    n = int(m.group(1))
    unit = m.group(2).lower()
    if n <= 0:
        return None
    if unit == "s":
        delta = _dt.timedelta(seconds=n)
    elif unit == "m":
        delta = _dt.timedelta(minutes=n)
    elif unit == "h":
        delta = _dt.timedelta(hours=n)
    elif unit == "d":
        delta = _dt.timedelta(days=n)
    else:
        return None
    return _utcnow() - delta


def _active_since(spec: UnitSpec) -> _dt.datetime | None:
    show = _systemctl_show(spec, ["ActiveState", "ActiveEnterTimestampMonotonic"])
    active_state = (show.get("ActiveState") or "").strip()
    if active_state != "active":
        return None
    boot_uptime = _proc_uptime_seconds()
    active_enter_mono_us = _safe_float(show.get("ActiveEnterTimestampMonotonic"), 0.0) / 1_000_000.0
    if active_enter_mono_us <= 0 or boot_uptime <= 0:
        return None
    uptime_seconds = max(0.0, boot_uptime - active_enter_mono_us)
    if uptime_seconds <= 0:
        return None
    return _utcnow() - _dt.timedelta(seconds=uptime_seconds)


_LOG_ISSUE_RULES: list[dict[str, object]] = [
    {
        "key": "anthropic_oauth_refresh_failed",
        "severity": "error",
        "pattern": re.compile(r"OAuth token refresh failed for anthropic", re.IGNORECASE),
        "message": "Anthropic OAuth token refresh failed",
        "hint": "Re-auth Claude (Claude CLI) and re-sync tokens for this bot",
    },
    {
        "key": "backend_binary_unavailable",
        "severity": "error",
        "pattern": re.compile(r"Backend binary unavailable", re.IGNORECASE),
        "message": "Backend binary unavailable",
        "hint": "Restart the service or fix the missing CLI binary",
    },
    {
        "key": "addr_in_use",
        "severity": "error",
        "pattern": re.compile(r"EADDRINUSE", re.IGNORECASE),
        "message": "Port already in use (EADDRINUSE)",
        "hint": "Check for port conflicts and restart",
    },
]


def _scan_recent_log_issues(logs: str) -> list[dict[str, object]]:
    if not logs:
        return []
    lines = [ln for ln in logs.splitlines() if ln.strip()]
    if not lines:
        return []
    issues: list[dict[str, object]] = []
    for rule in _LOG_ISSUE_RULES:
        pat = rule.get("pattern")
        if not isinstance(pat, re.Pattern):
            continue
        last_line = None
        for ln in reversed(lines):
            if pat.search(ln):
                last_line = ln
                break
        if not last_line:
            continue
        issues.append(
            {
                "source": "journal",
                "key": str(rule.get("key") or "unknown"),
                "severity": str(rule.get("severity") or "warn"),
                "message": str(rule.get("message") or "issue"),
                "hint": str(rule.get("hint") or ""),
                "timestamp": _extract_journal_ts_iso(last_line),
            }
        )
    return issues


@dataclass(frozen=True)
class BotDef:
    unit: str
    display_name: str
    telegram_handle: str | None
    bot_type: str
    profile: str | None
    gateway_port: str | None
    state_dir: Path | None


def _parse_unit_env(env_values: list[str]) -> dict[str, str]:
    env: dict[str, str] = {}
    for raw in env_values:
        for token in shlex.split(raw):
            if "=" not in token:
                continue
            k, v = token.split("=", 1)
            env[k] = v
    return env


def _parse_unit_file(fragment_path: Path) -> dict[str, object]:
    env_values: list[str] = []
    out: dict[str, object] = {
        "description": "",
        "working_directory": "",
        "exec_start": "",
        "env": {},
    }
    for line in fragment_path.read_text(encoding="utf-8", errors="replace").splitlines():
        s = line.strip()
        if not s or s.startswith("#") or s.startswith(";") or s.startswith("["):
            continue
        if "=" not in s:
            continue
        k, v = s.split("=", 1)
        key = k.strip()
        val = v.strip()
        if key == "Description":
            out["description"] = val
        elif key == "WorkingDirectory":
            out["working_directory"] = val
        elif key == "ExecStart":
            out["exec_start"] = val
        elif key == "Environment":
            env_values.append(val)

    out["env"] = _parse_unit_env(env_values)
    return out


_ENV_ALLOWLIST = {
    "CLAWDBOT_CONFIG_PATH",
    "CLAWDBOT_GATEWAY_PORT",
    "CLAWDBOT_STATE_DIR",
}

_REDACT_KV_RE = re.compile(r"(?i)((?:api[_-]?key|token|secret|password|passwd)=)(\S+)")
_REDACT_FLAG_RE = re.compile(r"(?i)(--(?:api[-_]?key|apikey|token|secret|password|passwd))(\s+)(\S+)")
_REDACT_BEARER_RE = re.compile(r"(?i)(bearer)(\s+)(\S+)")


def _redact_exec_start(raw: str) -> str:
    s = (raw or "").strip()
    if not s:
        return ""
    s = _REDACT_KV_RE.sub(r"\1***", s)
    s = _REDACT_BEARER_RE.sub(r"\1\2***", s)

    def _mask_flag(m: re.Match[str]) -> str:
        return f"{m.group(1)}{m.group(2)}***"

    s = _REDACT_FLAG_RE.sub(_mask_flag, s)
    return s


def _env_safe_view(env: dict[str, str]) -> dict[str, object]:
    shown: dict[str, str] = {}
    hidden: list[str] = []
    for k, v in sorted(env.items(), key=lambda it: it[0]):
        if k in _ENV_ALLOWLIST:
            shown[k] = v
        else:
            hidden.append(k)
    return {"shown": shown, "hiddenKeys": hidden}


def _resolve_path(raw: str, *, working_directory: str | None) -> Path:
    s = (raw or "").strip()
    p = Path(s)
    if p.is_absolute():
        return p
    wd = Path(working_directory) if working_directory else Path("/")
    return (wd / p).resolve()


def _parse_gateway_port_from_config(config_path: Path) -> str | None:
    try:
        raw = config_path.read_text(encoding="utf-8", errors="replace")
    except Exception:  # noqa: BLE001
        return None
    try:
        data = json.loads(raw)
    except Exception:  # noqa: BLE001
        return None
    if not isinstance(data, dict):
        return None
    gw = data.get("gateway")
    if not isinstance(gw, dict):
        return None
    port = gw.get("port")
    if isinstance(port, bool):
        return None
    if isinstance(port, (int, float)):
        if port != port or port == float("inf") or port < 0:
            return None
        return str(int(port))
    if isinstance(port, str):
        s = port.strip()
        if s.isdigit():
            return s
    return None


@dataclass(frozen=True)
class _FileSig:
    size: int
    mtime_ns: int


_UNIT_FILE_CACHE_LOCK = threading.Lock()
_UNIT_FILE_CACHE: dict[str, tuple[_FileSig, dict[str, object]]] = {}


def _parse_unit_file_cached(fragment_path: Path) -> dict[str, object]:
    try:
        st = fragment_path.stat()
        sig = _FileSig(size=int(st.st_size), mtime_ns=int(st.st_mtime_ns))
    except FileNotFoundError:
        return {"description": "", "working_directory": "", "exec_start": "", "env": {}}

    key = str(fragment_path)
    with _UNIT_FILE_CACHE_LOCK:
        cached = _UNIT_FILE_CACHE.get(key)
        if cached and cached[0] == sig:
            return cached[1]

    parsed = _parse_unit_file(fragment_path)
    with _UNIT_FILE_CACHE_LOCK:
        _UNIT_FILE_CACHE[key] = (sig, parsed)
    return parsed


def _detect_bot_def(spec: UnitSpec, show: dict[str, str]) -> BotDef:
    fragment = (show.get("FragmentPath") or "").strip()
    display_name = (show.get("Description") or spec.unit).strip() or spec.unit
    telegram_handle = None
    m = re.search(r"(@[A-Za-z0-9_]+)", display_name)
    if m:
        telegram_handle = m.group(1)

    if not fragment:
        return BotDef(
            unit=spec.unit,
            display_name=display_name,
            telegram_handle=telegram_handle,
            bot_type="unknown",
            profile=None,
            gateway_port=None,
            state_dir=None,
        )

    parsed = _parse_unit_file_cached(Path(fragment))
    working_directory = str(parsed.get("working_directory") or "").strip()
    exec_start = str(parsed.get("exec_start") or "").strip()
    env: dict[str, str] = dict(parsed.get("env") or {})

    tokens: list[str] = []
    if exec_start:
        try:
            tokens = shlex.split(exec_start.lstrip("-"))
        except Exception:  # noqa: BLE001
            tokens = exec_start.split()

    bot_type = "service"
    if any("clawdbot" in t for t in tokens):
        bot_type = "clawdbot"
    elif any("droidminimaxbot" in t for t in tokens) or any("bot.py" in t for t in tokens):
        bot_type = "droid"

    profile: str | None = None
    for i, t in enumerate(tokens):
        if t == "--profile" and i + 1 < len(tokens):
            profile = tokens[i + 1]
            break
        if t.startswith("--profile="):
            profile = t.split("=", 1)[1].strip() or None
            break

    gateway_port = env.get("CLAWDBOT_GATEWAY_PORT") if bot_type == "clawdbot" else None
    if bot_type == "clawdbot" and not (gateway_port or "").strip():
        cfg_raw = (env.get("CLAWDBOT_CONFIG_PATH") or "").strip()
        if cfg_raw:
            cfg_path = _resolve_path(cfg_raw, working_directory=working_directory or None)
            gateway_port = _parse_gateway_port_from_config(cfg_path)

    state_dir: Path | None = None
    state_raw = (env.get("CLAWDBOT_STATE_DIR") or "").strip()
    if state_raw:
        state_dir = _resolve_path(state_raw, working_directory=working_directory or None)
    elif bot_type == "clawdbot" and profile:
        home = (env.get("HOME") or "").strip()
        base = Path(home) if home else (Path(working_directory) if working_directory else Path("/root"))
        state_dir = (base / f".clawdbot-{profile}").resolve()

    return BotDef(
        unit=spec.unit,
        display_name=display_name,
        telegram_handle=telegram_handle,
        bot_type=bot_type,
        profile=profile,
        gateway_port=gateway_port,
        state_dir=state_dir if state_dir and state_dir.exists() else state_dir,
    )


def _dates_last_n(tz: ZoneInfo, days: int) -> list[str]:
    now = _utcnow().astimezone(tz)
    end = now.date()
    out: list[str] = []
    for i in range(days - 1, -1, -1):
        d = end - _dt.timedelta(days=i)
        out.append(d.isoformat())
    return out


def _scan_clawdbot_usage(state_dir: Path, tz: ZoneInfo) -> dict[str, object]:
    # NOTE: kept for compatibility; actual scanning is now cached + incremental.
    cache_key = f"{state_dir.resolve()}::{tz.key}"
    with _USAGE_CACHE_LOCK:
        entry = _USAGE_CACHE.get(cache_key)
        if not entry:
            entry = _UsageCacheEntry(state_dir=state_dir.resolve(), tz_key=tz.key)
            _USAGE_CACHE[cache_key] = entry
    return entry.get_usage(tz)


@dataclass
class _UsageBucket:
    tokens: float = 0.0
    costUSD: float = 0.0
    requests: float = 0.0
    errors: float = 0.0

    def add(self, tokens: float, cost_usd: float, is_error: bool) -> None:
        self.tokens += float(tokens)
        self.costUSD += float(cost_usd)
        self.requests += 1.0
        if is_error:
            self.errors += 1.0


@dataclass
class _UsageAgg:
    allTime: _UsageBucket = field(default_factory=_UsageBucket)
    byProvider: dict[str, dict[str, object]] = field(default_factory=dict)
    daily: dict[str, _UsageBucket] = field(default_factory=dict)  # tz date -> bucket
    perMinuteUTC: dict[int, _UsageBucket] = field(default_factory=dict)  # epoch minute -> bucket
    perHourUTC: dict[int, _UsageBucket] = field(default_factory=dict)  # epoch hour -> bucket
    lastActivityAt: _dt.datetime | None = None
    lastErrorAt: _dt.datetime | None = None
    lastErrorMsg: str = ""

    def reset(self) -> None:
        self.allTime = _UsageBucket()
        self.byProvider = {}
        self.daily = {}
        self.perMinuteUTC = {}
        self.perHourUTC = {}
        self.lastActivityAt = None
        self.lastErrorAt = None
        self.lastErrorMsg = ""

    def add_event(
        self,
        ts: _dt.datetime,
        tz: ZoneInfo,
        *,
        tokens: float,
        cost_usd: float,
        is_error: bool,
        provider: str,
        model: str,
        error_text: str,
    ) -> None:
        self.allTime.add(tokens, cost_usd, is_error)

        if not self.lastActivityAt or ts > self.lastActivityAt:
            self.lastActivityAt = ts

        if is_error and (not self.lastErrorAt or ts >= self.lastErrorAt):
            self.lastErrorAt = ts
            self.lastErrorMsg = error_text or "error"

        prov = self.byProvider.get(provider)
        if not prov:
            prov = {
                "tokens": 0.0,
                "costUSD": 0.0,
                "requests": 0.0,
                "errors": 0.0,
                "models": {},
            }
            self.byProvider[provider] = prov

        prov["tokens"] = float(prov.get("tokens", 0.0)) + float(tokens)
        prov["costUSD"] = float(prov.get("costUSD", 0.0)) + float(cost_usd)
        prov["requests"] = float(prov.get("requests", 0.0)) + 1.0
        if is_error:
            prov["errors"] = float(prov.get("errors", 0.0)) + 1.0

        models = prov.get("models")
        if not isinstance(models, dict):
            models = {}
            prov["models"] = models

        m = models.get(model)
        if not m:
            m = {"tokens": 0.0, "costUSD": 0.0, "requests": 0.0, "errors": 0.0}
            models[model] = m
        m["tokens"] = float(m.get("tokens", 0.0)) + float(tokens)
        m["costUSD"] = float(m.get("costUSD", 0.0)) + float(cost_usd)
        m["requests"] = float(m.get("requests", 0.0)) + 1.0
        if is_error:
            m["errors"] = float(m.get("errors", 0.0)) + 1.0

        day = ts.astimezone(tz).date().isoformat()
        self.daily.setdefault(day, _UsageBucket()).add(tokens, cost_usd, is_error)

        minute = int(ts.timestamp() // 60)
        self.perMinuteUTC.setdefault(minute, _UsageBucket()).add(tokens, cost_usd, is_error)

        hour = int(ts.timestamp() // 3600)
        self.perHourUTC.setdefault(hour, _UsageBucket()).add(tokens, cost_usd, is_error)

    def prune(self, now: _dt.datetime, tz: ZoneInfo) -> None:
        # Keep per-minute bins for ~25h, per-hour bins for ~31d.
        now_min = int(now.timestamp() // 60)
        min_cut = now_min - (25 * 60)
        if self.perMinuteUTC:
            for k in [k for k in self.perMinuteUTC.keys() if k < min_cut]:
                del self.perMinuteUTC[k]

        now_hr = int(now.timestamp() // 3600)
        hr_cut = now_hr - (31 * 24)
        if self.perHourUTC:
            for k in [k for k in self.perHourUTC.keys() if k < hr_cut]:
                del self.perHourUTC[k]

        # Keep daily buckets for ~60d to bound memory.
        today = now.astimezone(tz).date()
        day_cut = today - _dt.timedelta(days=60)
        if self.daily:
            for k in list(self.daily.keys()):
                try:
                    if _dt.date.fromisoformat(k) < day_cut:
                        del self.daily[k]
                except Exception:  # noqa: BLE001
                    continue


@dataclass
class _SessionCursor:
    dev: int
    ino: int
    pos: int


@dataclass
class _UsageCacheEntry:
    state_dir: Path
    tz_key: str
    lock: threading.Lock = field(default_factory=threading.Lock)
    cursors: dict[str, _SessionCursor] = field(default_factory=dict)  # path -> cursor
    agg: _UsageAgg = field(default_factory=_UsageAgg)
    last_refresh_mono: float = 0.0
    sessions_files: int = 0
    sessions_bytes: int = 0

    def _full_rebuild(self, tz: ZoneInfo) -> None:
        self.cursors = {}
        self.agg.reset()
        self._incremental_refresh(tz, allow_rebuild=False)

    def _incremental_refresh(self, tz: ZoneInfo, *, allow_rebuild: bool) -> None:
        sessions = list(self.state_dir.glob("agents/*/sessions/*.jsonl"))
        sessions.sort(key=lambda p: p.name)

        session_paths = {str(p) for p in sessions}
        if allow_rebuild and self.cursors and any(p not in session_paths for p in self.cursors.keys()):
            return self._full_rebuild(tz)

        total_bytes = 0
        now = _utcnow()

        for fp in sessions:
            path = str(fp)
            try:
                st = fp.stat()
            except FileNotFoundError:
                if allow_rebuild:
                    return self._full_rebuild(tz)
                continue

            total_bytes += int(st.st_size)

            dev = int(getattr(st, "st_dev", 0))
            ino = int(getattr(st, "st_ino", 0))
            size = int(st.st_size)

            cur = self.cursors.get(path)
            if cur and (cur.dev != dev or cur.ino != ino or size < cur.pos):
                if allow_rebuild:
                    return self._full_rebuild(tz)
                cur = None

            start_pos = cur.pos if cur else 0
            if size == start_pos:
                if not cur:
                    self.cursors[path] = _SessionCursor(dev=dev, ino=ino, pos=start_pos)
                continue

            try:
                with fp.open("rb") as f:
                    if start_pos > 0:
                        f.seek(start_pos)
                    for raw_line in f:
                        line = raw_line.decode("utf-8", errors="replace").strip()
                        if not line:
                            continue
                        try:
                            rec = json.loads(line)
                        except Exception:  # noqa: BLE001
                            continue
                        if rec.get("type") != "message":
                            continue
                        msg = rec.get("message") or {}
                        if msg.get("role") != "assistant":
                            continue
                        usage = msg.get("usage") or rec.get("usage") or {}
                        if not isinstance(usage, dict) or not usage:
                            continue

                        ts = _parse_iso(rec.get("timestamp"))
                        if not ts:
                            continue

                        tokens = _safe_float(usage.get("totalTokens"), 0.0)
                        if tokens <= 0:
                            tokens = (
                                _safe_float(usage.get("input"), 0.0)
                                + _safe_float(usage.get("output"), 0.0)
                                + _safe_float(usage.get("cacheRead"), 0.0)
                                + _safe_float(usage.get("cacheWrite"), 0.0)
                            )

                        cost_obj = usage.get("cost") or {}
                        cost_total = _safe_float(cost_obj.get("total"), 0.0) if isinstance(cost_obj, dict) else 0.0

                        stop_reason = str(msg.get("stopReason") or rec.get("stopReason") or "").strip().lower()
                        error_message = str(msg.get("errorMessage") or rec.get("errorMessage") or "").strip()
                        is_error = stop_reason == "error" or bool(error_message)

                        provider = str(msg.get("provider") or rec.get("provider") or "unknown").strip() or "unknown"
                        model = str(
                            msg.get("model")
                            or msg.get("modelId")
                            or rec.get("model")
                            or rec.get("modelId")
                            or "unknown"
                        ).strip() or "unknown"

                        error_text = error_message or stop_reason or "error"
                        self.agg.add_event(
                            ts,
                            tz,
                            tokens=tokens,
                            cost_usd=cost_total,
                            is_error=is_error,
                            provider=provider,
                            model=model,
                            error_text=error_text,
                        )
                    end_pos = int(f.tell())
            except FileNotFoundError:
                if allow_rebuild:
                    return self._full_rebuild(tz)
                continue

            self.cursors[path] = _SessionCursor(dev=dev, ino=ino, pos=end_pos)

        self.sessions_files = len(sessions)
        self.sessions_bytes = int(total_bytes)
        self.agg.prune(now, tz)

    def get_usage(self, tz: ZoneInfo) -> dict[str, object]:
        # Avoid multiple expensive refreshes in bursts (e.g., several clients opening at once).
        with self.lock:
            now_mono = time.monotonic()
            if self.last_refresh_mono and (now_mono - self.last_refresh_mono) < 1.0:
                return self._build_output(tz)

            self.last_refresh_mono = now_mono
            self._incremental_refresh(tz, allow_rebuild=True)
            return self._build_output(tz)

    def _build_output(self, tz: ZoneInfo) -> dict[str, object]:
        now = _utcnow()
        now_min = int(now.timestamp() // 60)
        now_hr = int(now.timestamp() // 3600)

        def _sum_min(minutes: int) -> _UsageBucket:
            start = int((now - _dt.timedelta(minutes=minutes)).timestamp() // 60)
            out = _UsageBucket()
            for k in range(start, now_min + 1):
                b = self.agg.perMinuteUTC.get(k)
                if b:
                    out.tokens += b.tokens
                    out.costUSD += b.costUSD
                    out.requests += b.requests
                    out.errors += b.errors
            return out

        def _sum_hr(hours: int) -> _UsageBucket:
            start = int((now - _dt.timedelta(hours=hours)).timestamp() // 3600)
            out = _UsageBucket()
            for k in range(start, now_hr + 1):
                b = self.agg.perHourUTC.get(k)
                if b:
                    out.tokens += b.tokens
                    out.costUSD += b.costUSD
                    out.requests += b.requests
                    out.errors += b.errors
            return out

        windows = {
            "1h": _sum_min(60),
            "5h": _sum_min(300),
            "24h": _sum_min(24 * 60),
            "7d": _sum_hr(7 * 24),
            "30d": _sum_hr(30 * 24),
        }

        window_out: dict[str, dict[str, object]] = {}
        for win, b in windows.items():
            window_out[win] = {
                "tokens": int(round(b.tokens)),
                "costUSD": float(b.costUSD),
                "requests": int(round(b.requests)),
                "errors": int(round(b.errors)),
            }

        daily_keys = _dates_last_n(tz, 30)
        daily30d: list[dict[str, object]] = []
        for d in daily_keys:
            b = self.agg.daily.get(d) or _UsageBucket()
            daily30d.append(
                {
                    "date": d,
                    "tokens": int(round(b.tokens)),
                    "costUSD": float(b.costUSD),
                    "requests": int(round(b.requests)),
                    "errors": int(round(b.errors)),
                }
            )

        by_provider_out: dict[str, dict[str, object]] = {}
        for provider, st in self.agg.byProvider.items():
            models_out: dict[str, dict[str, object]] = {}
            models = st.get("models")
            if isinstance(models, dict):
                for model, ms in models.items():
                    if not isinstance(ms, dict):
                        continue
                    models_out[str(model)] = {
                        "tokens": int(round(float(ms.get("tokens", 0.0)))),
                        "costUSD": float(ms.get("costUSD", 0.0)),
                        "requests": int(round(float(ms.get("requests", 0.0)))),
                        "errors": int(round(float(ms.get("errors", 0.0)))),
                    }

            by_provider_out[str(provider)] = {
                "tokens": int(round(float(st.get("tokens", 0.0)))),
                "costUSD": float(st.get("costUSD", 0.0)),
                "requests": int(round(float(st.get("requests", 0.0)))),
                "errors": int(round(float(st.get("errors", 0.0)))),
                "models": models_out,
            }

        last_error = (
            {
                "timestamp": self.agg.lastErrorAt.isoformat().replace("+00:00", "Z"),
                "message": self.agg.lastErrorMsg or "error",
            }
            if self.agg.lastErrorAt
            else None
        )

        return {
            "sessionsFiles": int(self.sessions_files),
            "sessionsBytes": int(self.sessions_bytes),
            "allTime": {
                "tokens": int(round(self.agg.allTime.tokens)),
                "costUSD": float(self.agg.allTime.costUSD),
                "requests": int(round(self.agg.allTime.requests)),
                "errors": int(round(self.agg.allTime.errors)),
            },
            "windows": window_out,
            "byProvider": by_provider_out,
            "lastActivityAt": self.agg.lastActivityAt.isoformat().replace("+00:00", "Z") if self.agg.lastActivityAt else None,
            "lastError": last_error,
            "daily30d": daily30d,
        }


_USAGE_CACHE_LOCK = threading.Lock()
_USAGE_CACHE: dict[str, _UsageCacheEntry] = {}


def _load_config(path: Path) -> dict[str, object]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise ValueError("config.json must be a JSON object")
    return raw


def _normalize_telegram_handle(raw: object) -> str | None:
    if not isinstance(raw, str):
        return None
    s = raw.strip()
    if not s:
        return None
    s = "@" + s.lstrip("@")
    if s == "@":
        return None
    return s


def _normalize_bot_doc_lang(raw: object) -> dict[str, object] | None:
    if not isinstance(raw, dict):
        return None

    how = str(raw.get("how") or "").strip()

    can_raw = raw.get("can")
    can: list[str] = []
    if isinstance(can_raw, list):
        for item in can_raw:
            s = str(item or "").strip()
            if s:
                can.append(s)

    cannot_raw = raw.get("cannot")
    cannot: list[str] = []
    if isinstance(cannot_raw, list):
        for item in cannot_raw:
            s = str(item or "").strip()
            if s:
                cannot.append(s)

    out: dict[str, object] = {}
    if how:
        out["how"] = how
    if can:
        out["can"] = can
    if cannot:
        out["cannot"] = cannot
    return out or None


def _normalize_bot_docs(raw: object) -> dict[str, object] | None:
    if raw is None:
        return None
    if not isinstance(raw, dict):
        raise ValueError("docs must be an object with 'en'/'ru' keys")
    out: dict[str, object] = {}
    en = _normalize_bot_doc_lang(raw.get("en"))
    ru = _normalize_bot_doc_lang(raw.get("ru"))
    if en:
        out["en"] = en
    if ru:
        out["ru"] = ru
    return out or None


def _parse_bot_mappings(cfg: dict[str, object]) -> dict[str, dict[str, object]]:
    raw = cfg.get("botMappings")
    if raw is None:
        return {}
    if not isinstance(raw, dict):
        raise ValueError("config.botMappings must be an object")

    out: dict[str, dict[str, object]] = {}
    for k, v in raw.items():
        unit = str(k).strip()
        if not unit:
            continue

        if isinstance(v, str):
            display_name = v.strip()
            telegram_handle = None
            docs = None
        elif isinstance(v, dict):
            display_name = str(v.get("displayName") or "").strip()
            telegram_handle = _normalize_telegram_handle(v.get("telegramHandle"))
            docs = _normalize_bot_docs(v.get("docs"))
        else:
            raise ValueError(f"config.botMappings[{unit}] must be a string or object")

        entry: dict[str, object] = {}
        if display_name:
            entry["displayName"] = display_name
        if telegram_handle:
            entry["telegramHandle"] = telegram_handle
        if docs:
            entry["docs"] = docs
        if entry:
            out[unit] = entry
    return out


def _parse_unit_specs(cfg: dict[str, object]) -> tuple[list[UnitSpec], dict[str, UnitSpec]]:
    units_raw = cfg.get("units") or []
    if not isinstance(units_raw, list):
        raise ValueError("config.units must be an array")

    specs: list[UnitSpec] = []
    by_unit: dict[str, UnitSpec] = {}

    for i, item in enumerate(units_raw):
        spec: UnitSpec
        if isinstance(item, str):
            unit = item.strip()
            if not unit:
                continue
            spec = UnitSpec(unit=unit, scope="system")
        elif isinstance(item, dict):
            unit = str(item.get("unit") or "").strip()
            if not unit:
                raise ValueError(f"config.units[{i}] missing unit")
            scope = str(item.get("scope") or "system").strip().lower()
            if scope not in {"system", "user"}:
                raise ValueError(f"config.units[{i}].scope must be 'system' or 'user'")
            user = str(item.get("user") or "").strip() or None
            uid = item.get("uid")
            uid_i = _safe_int(uid, -1) if uid is not None else None
            if uid_i is not None and uid_i < 0:
                uid_i = None
            spec = UnitSpec(unit=unit, scope=scope, user=user, uid=uid_i)
            if scope == "user" and not (spec.user or spec.uid is not None):
                raise ValueError(f"user-scoped unit requires user/uid: {unit}")
        else:
            raise ValueError(f"config.units[{i}] must be a string or object")

        if spec.unit in by_unit:
            raise ValueError(f"duplicate unit in config: {spec.unit}")
        by_unit[spec.unit] = spec
        specs.append(spec)

    return specs, by_unit


def _build_payload(cfg: dict[str, object]) -> dict[str, object]:
    title = str(cfg.get("title") or "Bots Dashboard")
    timezone_name = str(cfg.get("timezone") or "America/New_York")
    tz = ZoneInfo(timezone_name)
    now = _utcnow()
    bot_mappings = _parse_bot_mappings(cfg)
    specs, _ = _parse_unit_specs(cfg)

    props = [
        "Id",
        "Description",
        "FragmentPath",
        "LoadState",
        "ActiveState",
        "SubState",
        "UnitFileState",
        "MainPID",
        "NRestarts",
        "MemoryCurrent",
        "CPUUsageNSec",
        "ActiveEnterTimestamp",
        "ActiveEnterTimestampMonotonic",
    ]
    boot_uptime = _proc_uptime_seconds()

    bots: list[dict[str, object]] = []
    totals = {
        "botsTotal": 0,
        "botsActive": 0,
        "tokens24h": 0,
        "cost24h": 0.0,
        "requests24h": 0,
        "errors24h": 0,
    }

    for spec in specs:
        u = spec.unit
        totals["botsTotal"] += 1
        show = _systemctl_show(spec, props)
        botdef = _detect_bot_def(spec, show)
        override = bot_mappings.get(spec.unit)
        bot_docs = override.get("docs") if override else None
        if override:
            botdef = BotDef(
                unit=botdef.unit,
                display_name=str(override.get("displayName") or botdef.display_name),
                telegram_handle=str(override.get("telegramHandle") or botdef.telegram_handle or "") or None,
                bot_type=botdef.bot_type,
                profile=botdef.profile,
                gateway_port=botdef.gateway_port,
                state_dir=botdef.state_dir,
            )

        active_state = (show.get("ActiveState") or "").strip()
        sub_state = (show.get("SubState") or "").strip()
        if active_state == "active":
            totals["botsActive"] += 1

        active_enter_mono_us = _safe_float(show.get("ActiveEnterTimestampMonotonic"), 0.0) / 1_000_000.0
        uptime_seconds = 0.0
        if active_state == "active" and active_enter_mono_us > 0 and boot_uptime > 0:
            uptime_seconds = max(0.0, boot_uptime - active_enter_mono_us)

        health_issues: list[dict[str, object]] = []
        active_since: _dt.datetime | None = None
        if active_state != "active":
            health_issues.append(
                {
                    "source": "systemd",
                    "key": "not_active",
                    "severity": "error",
                    "message": f"Service is not active ({active_state or 'unknown'})",
                    "hint": "Start the service",
                    "timestamp": None,
                }
            )
        elif sub_state and sub_state != "running":
            health_issues.append(
                {
                    "source": "systemd",
                    "key": "not_running",
                    "severity": "warn",
                    "message": f"Service subState is {sub_state}",
                    "hint": "Check logs and restart if needed",
                    "timestamp": None,
                }
            )
        if _safe_int(show.get("NRestarts"), 0) > 0:
            health_issues.append(
                {
                    "source": "systemd",
                    "key": "restarts",
                    "severity": "warn",
                    "message": "Service restarted recently",
                    "hint": "Check logs for repeated failures",
                    "timestamp": None,
                }
            )
        if active_state == "active" and uptime_seconds > 0:
            active_since = now - _dt.timedelta(seconds=uptime_seconds)
        if active_state == "active":
            logs = _collect_journal(spec, 200, since=active_since)
            health_issues.extend(_scan_recent_log_issues(logs))

        usage: dict[str, object] | None = None
        if botdef.bot_type == "clawdbot" and botdef.state_dir and botdef.state_dir.exists():
            usage = _scan_clawdbot_usage(botdef.state_dir, tz)

        win24 = (usage or {}).get("windows", {}).get("24h", {}) if usage else {}
        totals["tokens24h"] += _safe_int((win24 or {}).get("tokens"), 0)
        totals["cost24h"] += _safe_float((win24 or {}).get("costUSD"), 0.0)
        totals["requests24h"] += _safe_int((win24 or {}).get("requests"), 0)
        totals["errors24h"] += _safe_int((win24 or {}).get("errors"), 0)

        bots.append(
            {
                "unit": u,
                "scope": spec.scope,
                "user": spec.user,
                "displayName": botdef.display_name,
                "telegramHandle": botdef.telegram_handle,
                "docs": bot_docs,
                "type": botdef.bot_type,
                "profile": botdef.profile,
                "gatewayPort": botdef.gateway_port,
                "stateDir": str(botdef.state_dir) if botdef.state_dir else None,
                "systemd": {
                    "loadState": show.get("LoadState") or "",
                    "activeState": active_state,
                    "subState": sub_state,
                    "unitFileState": show.get("UnitFileState") or "",
                    "mainPid": _safe_int(show.get("MainPID"), 0),
                    "nRestarts": _safe_int(show.get("NRestarts"), 0),
                    "memoryCurrentBytes": _safe_int(show.get("MemoryCurrent"), 0),
                    "cpuUsageNSec": _safe_int(show.get("CPUUsageNSec"), 0),
                    "activeEnterTimestamp": show.get("ActiveEnterTimestamp") or "",
                    "uptimeSeconds": uptime_seconds,
                },
                "health": {
                    "status": "issue" if health_issues else "ok",
                    "issues": health_issues,
                },
                "usage": usage,
            }
        )

    return {
        "title": title,
        "timezone": timezone_name,
        "generatedAt": _utcnow().isoformat().replace("+00:00", "Z"),
        "totals": totals,
        "bots": bots,
    }


@dataclass
class _BotsPayloadCache:
    lock: threading.Lock = field(default_factory=threading.Lock)
    cfg_sig: _FileSig | None = None
    payload: dict[str, object] | None = None
    built_mono: float = 0.0


_BOTS_PAYLOAD_CACHE = _BotsPayloadCache()


def _get_bots_payload(config_path: Path) -> dict[str, object]:
    try:
        st = config_path.stat()
        sig = _FileSig(size=int(st.st_size), mtime_ns=int(st.st_mtime_ns))
    except FileNotFoundError:
        raise

    now_mono = time.monotonic()
    with _BOTS_PAYLOAD_CACHE.lock:
        if (
            _BOTS_PAYLOAD_CACHE.payload is not None
            and _BOTS_PAYLOAD_CACHE.cfg_sig == sig
            and (now_mono - _BOTS_PAYLOAD_CACHE.built_mono) < 1.0
        ):
            return _BOTS_PAYLOAD_CACHE.payload

    cfg = _load_config(config_path)
    payload = _build_payload(cfg)
    with _BOTS_PAYLOAD_CACHE.lock:
        _BOTS_PAYLOAD_CACHE.cfg_sig = sig
        _BOTS_PAYLOAD_CACHE.payload = payload
        _BOTS_PAYLOAD_CACHE.built_mono = now_mono
    return payload


class Handler(BaseHTTPRequestHandler):
    server_version = "bots-dashboard/1.0"

    def _send(self, code: int, body: str, content_type: str = "application/json") -> None:
        raw = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(raw)

    def _send_json(self, code: int, obj: object) -> None:
        self._send(code, _json_dumps(obj), "application/json")

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path == "/healthz":
            return self._send_json(200, {"ok": True})

        if parsed.path == "/api/bots":
            try:
                payload = _get_bots_payload(self.server.config_path)  # type: ignore[attr-defined]
                return self._send_json(200, payload)
            except Exception as e:  # noqa: BLE001
                return self._send_json(500, {"error": str(e)})

        m = re.match(r"^/api/units/([^/]+)/details$", parsed.path)
        if m:
            unit = unquote(m.group(1))
            cfg = _load_config(self.server.config_path)  # type: ignore[attr-defined]
            _, by_unit = _parse_unit_specs(cfg)
            if unit not in by_unit:
                return self._send_json(403, {"error": "unit not allowed"})

            spec = by_unit[unit]
            show = _systemctl_show(spec, ["FragmentPath", "User", "Group"])
            fragment = (show.get("FragmentPath") or "").strip()

            unit_file: dict[str, object] = {}
            if fragment:
                try:
                    parsed_unit = _parse_unit_file(Path(fragment))
                    env = dict(parsed_unit.get("env") or {})
                    unit_file = {
                        "description": str(parsed_unit.get("description") or ""),
                        "workingDirectory": str(parsed_unit.get("working_directory") or ""),
                        "execStart": _redact_exec_start(str(parsed_unit.get("exec_start") or "")),
                        "env": _env_safe_view(env),
                    }
                except Exception:  # noqa: BLE001
                    unit_file = {}

            return self._send_json(
                200,
                {
                    "unit": unit,
                    "scope": spec.scope,
                    "user": spec.user,
                    "fragmentPath": fragment or None,
                    "systemd": {
                        "user": (show.get("User") or "").strip() or None,
                        "group": (show.get("Group") or "").strip() or None,
                    },
                    "unitFile": unit_file,
                },
            )

        m = re.match(r"^/api/units/([^/]+)/logs$", parsed.path)
        if m:
            unit = unquote(m.group(1))
            qs = parse_qs(parsed.query)
            lines = _safe_int((qs.get("lines") or ["200"])[0], 200)
            lines = max(10, min(2000, lines))
            since_raw = str((qs.get("since") or [""])[0] or "").strip()
            cfg = _load_config(self.server.config_path)  # type: ignore[attr-defined]
            _, by_unit = _parse_unit_specs(cfg)
            if unit not in by_unit:
                return self._send_json(403, {"error": "unit not allowed"})

            since_dt: _dt.datetime | None = None
            if since_raw:
                if since_raw.lower() == "active":
                    since_dt = _active_since(by_unit[unit])
                else:
                    since_dt = _since_from_query(since_raw)

            logs = _collect_journal(by_unit[unit], lines, since=since_dt)
            return self._send_json(
                200,
                {
                    "unit": unit,
                    "lines": lines,
                    "since": since_raw or None,
                    "sinceResolvedAt": since_dt.isoformat().replace("+00:00", "Z") if since_dt else None,
                    "logs": logs,
                },
            )

        return self._send_json(404, {"error": "not found"})

    def do_HEAD(self) -> None:  # noqa: N802
        return self.do_GET()

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)

        if parsed.path == "/api/claude/sync":
            proc = _run(
                ["/usr/bin/python3", str(ROOT / "server" / "sync_claude_oauth.py")],
                timeout_s=60,
            )
            ok = int(proc.returncode) == 0
            return self._send_json(
                200 if ok else 500,
                {
                    "ok": ok,
                    "exitCode": int(proc.returncode),
                    "stdout": (proc.stdout or "").strip(),
                    "stderr": (proc.stderr or "").strip(),
                },
            )

        m = re.match(r"^/api/units/([^/]+)/([^/]+)$", parsed.path)
        if not m:
            return self._send_json(404, {"error": "not found"})

        unit = unquote(m.group(1))
        action = unquote(m.group(2))
        if action not in {"start", "stop", "restart", "enable", "disable"}:
            return self._send_json(400, {"error": "invalid action"})

        cfg = _load_config(self.server.config_path)  # type: ignore[attr-defined]
        _, by_unit = _parse_unit_specs(cfg)
        if unit not in by_unit:
            return self._send_json(403, {"error": "unit not allowed"})

        try:
            spec = by_unit[unit]
            result = _systemctl_action(spec, action)
            show = _systemctl_show(spec, ["LoadState", "ActiveState", "SubState", "UnitFileState", "MainPID"])
            ok = int(result.get("exitCode") or 0) == 0
            return self._send_json(
                200 if ok else 500,
                {
                    "ok": ok,
                    "unit": unit,
                    "action": action,
                    "result": result,
                    "status": show,
                },
            )
        except Exception as e:  # noqa: BLE001
            return self._send_json(500, {"error": str(e)})

    def log_message(self, fmt: str, *args: object) -> None:
        # Keep journald noise low.
        return


def main() -> int:
    ap = argparse.ArgumentParser(description="Bots Dashboard API")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8124)
    ap.add_argument("--config", type=Path, default=DEFAULT_CONFIG_PATH)
    args = ap.parse_args()

    cfg_path = args.config.resolve()
    if not cfg_path.exists():
        raise SystemExit(f"Config not found: {cfg_path}")

    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    httpd.config_path = cfg_path  # type: ignore[attr-defined]
    print(f"bots-dashboard listening on http://{args.host}:{args.port} (config {cfg_path})", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        return 0
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
