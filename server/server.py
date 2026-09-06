#!/usr/bin/env python3
from __future__ import annotations

import argparse
import concurrent.futures
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


def _resolve_user_uid_gid(spec: UnitSpec) -> tuple[str, int, int]:
    if spec.user:
        pw = pwd.getpwnam(spec.user)
        uid = int(spec.uid) if spec.uid is not None else int(pw.pw_uid)
        return (spec.user, uid, int(pw.pw_gid))
    if spec.uid is not None:
        pw = pwd.getpwuid(int(spec.uid))
        return (str(pw.pw_name), int(spec.uid), int(pw.pw_gid))
    raise ValueError(f"user unit requires user or uid: {spec.unit}")


def _systemctl_cmd(spec: UnitSpec, args: list[str]) -> list[str]:
    if spec.scope == "user":
        user, uid, gid = _resolve_user_uid_gid(spec)
        runtime_dir = f"/run/user/{uid}"
        bus_addr = f"unix:path={runtime_dir}/bus"
        return [
            "setpriv",
            f"--reuid={uid}",
            f"--regid={gid}",
            "--init-groups",
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
        user, uid, gid = _resolve_user_uid_gid(spec)
        runtime_dir = f"/run/user/{uid}"
        return [
            "setpriv",
            f"--reuid={uid}",
            f"--regid={gid}",
            "--init-groups",
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


def _is_ignorable_addr_in_use_line(line: str) -> bool:
    """Filter non-fatal EADDRINUSE noise from optional browser relay startup."""
    low = line.lower()
    if "eaddrinuse" not in low:
        return False
    if "chrome extension relay init failed" in low:
        return True
    if "[browser/server]" in low and "18863" in low:
        return True
    return False


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
                if str(rule.get("key") or "") == "addr_in_use" and _is_ignorable_addr_in_use_line(ln):
                    continue
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
    runtime_name: str | None
    exec_start: str | None
    working_directory: Path | None = None
    permission_mode: str | None = None


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


def _tokenize_exec_start(raw: str) -> list[str]:
    s = (raw or "").strip()
    if not s:
        return []
    try:
        return shlex.split(s.lstrip("-"))
    except Exception:  # noqa: BLE001
        return s.split()


def _unwrap_script_exec(tokens: list[str]) -> list[str]:
    if not tokens:
        return []
    first = Path(tokens[0]).name.strip().lower()
    if first == "env":
        i = 1
        while i < len(tokens):
            tok = str(tokens[i]).strip()
            if not tok:
                i += 1
                continue
            if tok in {"-i", "--ignore-environment"}:
                i += 1
                continue
            if tok == "-u" and i + 1 < len(tokens):
                i += 2
                continue
            if tok.startswith("-u") and len(tok) > 2:
                i += 1
                continue
            if "=" in tok and not tok.startswith("-"):
                i += 1
                continue
            return tokens[i:]
        return tokens
    if first != "script":
        return tokens

    for i, tok in enumerate(tokens[1:], start=1):
        if tok == "--command" and i + 1 < len(tokens):
            return _tokenize_exec_start(tokens[i + 1])
        if tok.startswith("--command="):
            return _tokenize_exec_start(tok.split("=", 1)[1])
        if tok == "-c" and i + 1 < len(tokens):
            return _tokenize_exec_start(tokens[i + 1])
        if tok.startswith("-") and "c" in tok and i + 1 < len(tokens):
            return _tokenize_exec_start(tokens[i + 1])

    return tokens


def _extract_flag_value(tokens: list[str], flag: str) -> str | None:
    for i, tok in enumerate(tokens):
        if tok == flag and i + 1 < len(tokens):
            val = str(tokens[i + 1]).strip()
            return val or None
        if tok.startswith(flag + "="):
            val = tok.split("=", 1)[1].strip()
            return val or None
    return None


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
            runtime_name=None,
            exec_start=None,
        )

    parsed = _parse_unit_file_cached(Path(fragment))
    working_directory = str(parsed.get("working_directory") or "").strip()
    working_dir_path = _resolve_path(working_directory, working_directory=None) if working_directory else None
    exec_start = str(parsed.get("exec_start") or "").strip()
    env: dict[str, str] = dict(parsed.get("env") or {})
    home = (env.get("HOME") or "").strip()
    home_path = _resolve_path(home, working_directory=working_directory or None) if home else None

    tokens = _tokenize_exec_start(exec_start)
    runtime_tokens = _unwrap_script_exec(tokens)

    runtime_name: str | None = None
    if runtime_tokens:
        first = Path(runtime_tokens[0]).name.strip().lower()
        if "openclaw" in first:
            runtime_name = "openclaw"
        elif "clawdbot" in first:
            runtime_name = "clawdbot"
        elif first:
            runtime_name = first

    bot_type = "service"
    token_lowers = [t.lower() for t in runtime_tokens]
    if any(("clawdbot" in t) or ("openclaw" in t) for t in token_lowers):
        bot_type = "clawdbot"
    elif any("droidminimaxbot" in t for t in token_lowers) or any("bot.py" in t for t in token_lowers):
        bot_type = "droid"
    elif runtime_name == "claude":
        bot_type = "claudecode"

    profile = _extract_flag_value(runtime_tokens, "--profile")
    permission_mode = _extract_flag_value(runtime_tokens, "--permission-mode")

    gateway_port = None
    if bot_type == "clawdbot":
        gateway_port = (env.get("OPENCLAW_GATEWAY_PORT") or env.get("CLAWDBOT_GATEWAY_PORT") or "").strip() or None
    if bot_type == "clawdbot" and not (gateway_port or "").strip():
        cfg_raw = (env.get("OPENCLAW_CONFIG_PATH") or env.get("CLAWDBOT_CONFIG_PATH") or "").strip()
        if cfg_raw:
            cfg_path = _resolve_path(cfg_raw, working_directory=working_directory or None)
            gateway_port = _parse_gateway_port_from_config(cfg_path)

    state_dir: Path | None = None
    state_raw = (env.get("OPENCLAW_STATE_DIR") or env.get("CLAWDBOT_STATE_DIR") or "").strip()
    if state_raw:
        state_dir = _resolve_path(state_raw, working_directory=working_directory or None)
    elif bot_type == "clawdbot" and profile:
        base = Path(home) if home else (Path(working_directory) if working_directory else Path("/root"))
        state_prefix = ".openclaw" if runtime_name == "openclaw" else ".clawdbot"
        state_dir = (base / f"{state_prefix}-{profile}").resolve()
    elif bot_type == "claudecode" and home_path:
        state_dir = (home_path / ".claude").resolve()

    return BotDef(
        unit=spec.unit,
        display_name=display_name,
        telegram_handle=telegram_handle,
        bot_type=bot_type,
        profile=profile,
        gateway_port=gateway_port,
        state_dir=state_dir if state_dir and state_dir.exists() else state_dir,
        runtime_name=runtime_name,
        exec_start=exec_start or None,
        working_directory=working_dir_path,
        permission_mode=permission_mode,
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


def _extract_usage_totals(usage: dict[str, object]) -> tuple[float, float]:
    tokens = _safe_float(usage.get("totalTokens"), 0.0)
    if tokens <= 0:
        tokens = _safe_float(usage.get("total_tokens"), 0.0)
    if tokens <= 0:
        tokens = (
            _safe_float(usage.get("input"), 0.0)
            + _safe_float(usage.get("output"), 0.0)
            + _safe_float(usage.get("cacheRead"), 0.0)
            + _safe_float(usage.get("cacheWrite"), 0.0)
            + _safe_float(usage.get("input_tokens"), 0.0)
            + _safe_float(usage.get("output_tokens"), 0.0)
            + _safe_float(usage.get("cache_creation_input_tokens"), 0.0)
            + _safe_float(usage.get("cache_read_input_tokens"), 0.0)
            + _safe_float(usage.get("cacheCreationInputTokens"), 0.0)
            + _safe_float(usage.get("cacheReadInputTokens"), 0.0)
        )

    cost_total = _safe_float(usage.get("costUSD"), 0.0)
    if cost_total <= 0:
        cost_total = _safe_float(usage.get("cost_usd"), 0.0)
    if cost_total <= 0:
        cost_obj = usage.get("cost") or {}
        if isinstance(cost_obj, dict):
            cost_total = _safe_float(cost_obj.get("total"), 0.0)
            if cost_total <= 0:
                cost_total = _safe_float(cost_obj.get("totalUSD"), 0.0)

    return (tokens, cost_total)


def _extract_stop_reason(msg: dict[str, object], rec: dict[str, object]) -> str:
    return str(
        msg.get("stopReason")
        or msg.get("stop_reason")
        or rec.get("stopReason")
        or rec.get("stop_reason")
        or ""
    ).strip().lower()


def _extract_error_message(msg: dict[str, object], rec: dict[str, object]) -> str:
    return str(
        msg.get("errorMessage")
        or msg.get("error_message")
        or rec.get("errorMessage")
        or rec.get("error_message")
        or ""
    ).strip()


def _extract_model_name(msg: dict[str, object], rec: dict[str, object]) -> str:
    return str(
        msg.get("model")
        or msg.get("modelId")
        or rec.get("model")
        or rec.get("modelId")
        or "unknown"
    ).strip() or "unknown"


def _infer_provider_name(provider_raw: object, model_raw: object) -> str:
    provider = str(provider_raw or "").strip()
    if provider:
        return provider

    model = str(model_raw or "").strip().lower()
    if not model:
        return "unknown"
    if "claude" in model:
        return "anthropic"
    if model.startswith("gpt") or model.startswith("o1") or model.startswith("o3") or model.startswith("o4"):
        return "openai"
    if "antigravity" in model:
        return "antigravity"
    if "minimax" in model:
        return "minimax"
    if "kimi" in model:
        return "moonshot"
    return "unknown"


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

                        tokens, cost_total = _extract_usage_totals(usage)
                        stop_reason = _extract_stop_reason(msg, rec)
                        error_message = _extract_error_message(msg, rec)
                        is_error = stop_reason == "error" or bool(error_message)

                        model = _extract_model_name(msg, rec)
                        provider = _infer_provider_name(msg.get("provider") or rec.get("provider"), model)

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
        return _build_usage_output(self.agg, self.sessions_files, self.sessions_bytes, tz)


def _build_usage_output(agg: _UsageAgg, sessions_files: int, sessions_bytes: int, tz: ZoneInfo) -> dict[str, object]:
    now = _utcnow()
    now_min = int(now.timestamp() // 60)
    now_hr = int(now.timestamp() // 3600)

    def _sum_min(minutes: int) -> _UsageBucket:
        start = int((now - _dt.timedelta(minutes=minutes)).timestamp() // 60)
        out = _UsageBucket()
        for k in range(start, now_min + 1):
            b = agg.perMinuteUTC.get(k)
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
            b = agg.perHourUTC.get(k)
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
        b = agg.daily.get(d) or _UsageBucket()
        daily30d.append(
            {
                "date": d,
                "tokens": int(round(b.tokens)),
                "costUSD": float(b.costUSD),
                "requests": int(round(b.requests)),
                "errors": int(round(b.errors)),
            }
        )

    hourly24h: list[dict[str, object]] = []
    for i in range(23, -1, -1):
        hr_key = int((now - _dt.timedelta(hours=i)).timestamp() // 3600)
        b = agg.perHourUTC.get(hr_key) or _UsageBucket()
        hourly24h.append(
            {
                "tokens": int(round(b.tokens)),
                "costUSD": float(b.costUSD),
                "requests": int(round(b.requests)),
                "errors": int(round(b.errors)),
            }
        )

    by_provider_out: dict[str, dict[str, object]] = {}
    for provider, st in agg.byProvider.items():
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
            "timestamp": agg.lastErrorAt.isoformat().replace("+00:00", "Z"),
            "message": agg.lastErrorMsg or "error",
        }
        if agg.lastErrorAt
        else None
    )

    return {
        "sessionsFiles": int(sessions_files),
        "sessionsBytes": int(sessions_bytes),
        "allTime": {
            "tokens": int(round(agg.allTime.tokens)),
            "costUSD": float(agg.allTime.costUSD),
            "requests": int(round(agg.allTime.requests)),
            "errors": int(round(agg.allTime.errors)),
        },
        "windows": window_out,
        "byProvider": by_provider_out,
        "lastActivityAt": agg.lastActivityAt.isoformat().replace("+00:00", "Z") if agg.lastActivityAt else None,
        "lastError": last_error,
        "daily30d": daily30d,
        "hourly24h": hourly24h,
    }


_USAGE_CACHE_LOCK = threading.Lock()
_USAGE_CACHE: dict[str, _UsageCacheEntry] = {}


def _claude_project_slug(path: Path | None) -> str:
    if path is None:
        return ""
    return str(path).replace("\\", "/").replace("/", "-")


def _record_matches_claude_session(
    rec: dict[str, object],
    *,
    expected_cwd: Path | None,
    expected_permission_mode: str | None,
) -> bool:
    if str(rec.get("type") or "").strip().lower() != "user":
        return False

    origin = rec.get("origin") or {}
    if not isinstance(origin, dict):
        return False
    if str(origin.get("kind") or "").strip().lower() != "channel":
        return False
    if str(origin.get("server") or "").strip() != "plugin:telegram:telegram":
        return False

    if expected_permission_mode:
        actual_mode = str(rec.get("permissionMode") or "").strip().lower()
        if actual_mode != expected_permission_mode.strip().lower():
            return False

    if expected_cwd is not None:
        raw_cwd = str(rec.get("cwd") or "").strip()
        if not raw_cwd:
            return False
        try:
            if _resolve_path(raw_cwd, working_directory=None) != expected_cwd:
                return False
        except Exception:  # noqa: BLE001
            return False

    return True


@dataclass
class _ClaudeUsageCacheEntry:
    project_dir: Path
    expected_cwd: Path | None
    permission_mode: str | None
    lock: threading.Lock = field(default_factory=threading.Lock)
    cursors: dict[str, _SessionCursor] = field(default_factory=dict)
    matching_sessions: dict[str, bool] = field(default_factory=dict)
    agg: _UsageAgg = field(default_factory=_UsageAgg)
    last_refresh_mono: float = 0.0
    sessions_files: int = 0
    sessions_bytes: int = 0

    def _full_rebuild(self, tz: ZoneInfo) -> None:
        self.cursors = {}
        self.matching_sessions = {}
        self.agg.reset()
        self._incremental_refresh(tz, allow_rebuild=False)

    def _incremental_refresh(self, tz: ZoneInfo, *, allow_rebuild: bool) -> None:
        sessions = list(self.project_dir.glob("*.jsonl")) if self.project_dir.exists() else []
        sessions = [p for p in sessions if p.is_file()]
        sessions.sort(key=lambda p: p.name)

        session_paths = {str(p) for p in sessions}
        if allow_rebuild and self.cursors and any(p not in session_paths for p in self.cursors.keys()):
            return self._full_rebuild(tz)

        matched_files = 0
        matched_bytes = 0
        now = _utcnow()

        for fp in sessions:
            path = str(fp)
            try:
                st = fp.stat()
            except FileNotFoundError:
                if allow_rebuild:
                    return self._full_rebuild(tz)
                continue

            dev = int(getattr(st, "st_dev", 0))
            ino = int(getattr(st, "st_ino", 0))
            size = int(st.st_size)

            cur = self.cursors.get(path)
            if cur and (cur.dev != dev or cur.ino != ino or size < cur.pos):
                if allow_rebuild:
                    return self._full_rebuild(tz)
                cur = None

            start_pos = cur.pos if cur else 0
            session_matches = bool(self.matching_sessions.get(path, False))

            if size != start_pos:
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

                            if not session_matches:
                                session_matches = _record_matches_claude_session(
                                    rec,
                                    expected_cwd=self.expected_cwd,
                                    expected_permission_mode=self.permission_mode,
                                )
                                if not session_matches:
                                    continue

                            if str(rec.get("type") or "").strip().lower() != "assistant":
                                continue

                            msg = rec.get("message") or {}
                            if not isinstance(msg, dict):
                                continue
                            if msg.get("role") != "assistant":
                                continue

                            usage = msg.get("usage") or rec.get("usage") or {}
                            if not isinstance(usage, dict) or not usage:
                                continue

                            ts = _parse_iso(rec.get("timestamp"))
                            if not ts:
                                continue

                            tokens, cost_total = _extract_usage_totals(usage)
                            stop_reason = _extract_stop_reason(msg, rec)
                            error_message = _extract_error_message(msg, rec)
                            is_error = stop_reason == "error" or bool(error_message)

                            model = _extract_model_name(msg, rec)
                            provider = _infer_provider_name(msg.get("provider") or rec.get("provider"), model)
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
            else:
                end_pos = start_pos

            self.cursors[path] = _SessionCursor(dev=dev, ino=ino, pos=end_pos)
            self.matching_sessions[path] = session_matches
            if session_matches:
                matched_files += 1
                matched_bytes += size

        self.sessions_files = matched_files
        self.sessions_bytes = matched_bytes
        self.agg.prune(now, tz)

    def get_usage(self, tz: ZoneInfo) -> dict[str, object]:
        with self.lock:
            now_mono = time.monotonic()
            if self.last_refresh_mono and (now_mono - self.last_refresh_mono) < 1.0:
                return self._build_output(tz)

            self.last_refresh_mono = now_mono
            self._incremental_refresh(tz, allow_rebuild=True)
            return self._build_output(tz)

    def _build_output(self, tz: ZoneInfo) -> dict[str, object]:
        return _build_usage_output(self.agg, self.sessions_files, self.sessions_bytes, tz)


_CLAUDE_USAGE_CACHE_LOCK = threading.Lock()
_CLAUDE_USAGE_CACHE: dict[str, _ClaudeUsageCacheEntry] = {}


def _scan_claude_usage(
    claude_state_dir: Path,
    working_directory: Path | None,
    permission_mode: str | None,
    tz: ZoneInfo,
) -> dict[str, object]:
    project_dir = claude_state_dir / "projects" / _claude_project_slug(working_directory)
    state_key = str(claude_state_dir.resolve())
    wd_key = str(working_directory.resolve()) if working_directory is not None else ""
    perm_key = str(permission_mode or "").strip().lower()
    cache_key = f"{state_key}::{wd_key}::{perm_key}"

    with _CLAUDE_USAGE_CACHE_LOCK:
        entry = _CLAUDE_USAGE_CACHE.get(cache_key)
        if not entry:
            entry = _ClaudeUsageCacheEntry(
                project_dir=project_dir,
                expected_cwd=working_directory.resolve() if working_directory is not None else None,
                permission_mode=permission_mode,
            )
            _CLAUDE_USAGE_CACHE[cache_key] = entry
    return entry.get_usage(tz)


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

    behind_raw = raw.get("behind")
    behind: list[str] = []
    if isinstance(behind_raw, list):
        for item in behind_raw:
            s = str(item or "").strip()
            if s:
                behind.append(s)

    telegram_raw = raw.get("telegram")
    telegram: list[str] = []
    if isinstance(telegram_raw, list):
        for item in telegram_raw:
            s = str(item or "").strip()
            if s:
                telegram.append(s)

    best_for_raw = raw.get("bestFor")
    best_for: list[str] = []
    if isinstance(best_for_raw, list):
        for item in best_for_raw:
            s = str(item or "").strip()
            if s:
                best_for.append(s)

    runtime_active_raw = raw.get("runtimeActive")
    runtime_active: list[str] = []
    if isinstance(runtime_active_raw, list):
        for item in runtime_active_raw:
            s = str(item or "").strip()
            if s:
                runtime_active.append(s)

    runtime_update_raw = raw.get("runtimeUpdate")
    runtime_update: list[str] = []
    if isinstance(runtime_update_raw, list):
        for item in runtime_update_raw:
            s = str(item or "").strip()
            if s:
                runtime_update.append(s)

    runtime_model_raw = raw.get("runtimeModel")
    runtime_model: list[str] = []
    if isinstance(runtime_model_raw, list):
        for item in runtime_model_raw:
            s = str(item or "").strip()
            if s:
                runtime_model.append(s)

    steps_raw = raw.get("steps")
    steps: list[str] = []
    if isinstance(steps_raw, list):
        for item in steps_raw:
            s = str(item or "").strip()
            if s:
                steps.append(s)

    examples_raw = raw.get("examples")
    examples: list[dict[str, object]] = []
    if isinstance(examples_raw, list):
        for item in examples_raw:
            if not isinstance(item, dict):
                continue
            title = str(item.get("title") or "").strip()
            example_steps_raw = item.get("steps")
            example_steps: list[str] = []
            if isinstance(example_steps_raw, list):
                for step in example_steps_raw:
                    s = str(step or "").strip()
                    if s:
                        example_steps.append(s)
            if title and example_steps:
                examples.append({"title": title, "steps": example_steps})

    out: dict[str, object] = {}
    if how:
        out["how"] = how
    if can:
        out["can"] = can
    if cannot:
        out["cannot"] = cannot
    if behind:
        out["behind"] = behind
    if telegram:
        out["telegram"] = telegram
    if best_for:
        out["bestFor"] = best_for
    if runtime_active:
        out["runtimeActive"] = runtime_active
    if runtime_update:
        out["runtimeUpdate"] = runtime_update
    if runtime_model:
        out["runtimeModel"] = runtime_model
    if steps:
        out["steps"] = steps
    if examples:
        out["examples"] = examples
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

    def _process_spec(spec: UnitSpec) -> dict[str, object]:
        u = spec.unit
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
                runtime_name=botdef.runtime_name,
                exec_start=botdef.exec_start,
                working_directory=botdef.working_directory,
                permission_mode=botdef.permission_mode,
            )

        active_state = (show.get("ActiveState") or "").strip()
        sub_state = (show.get("SubState") or "").strip()

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
        elif botdef.bot_type == "claudecode" and botdef.state_dir and botdef.working_directory:
            usage = _scan_claude_usage(
                botdef.state_dir,
                botdef.working_directory,
                botdef.permission_mode,
                tz,
            )

        return {
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
            "runtimeName": botdef.runtime_name,
            "execStart": _redact_exec_start(botdef.exec_start or ""),
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

    with concurrent.futures.ThreadPoolExecutor(max_workers=min(32, len(specs) or 1)) as executor:
        bots = list(executor.map(_process_spec, specs))

    for b in bots:
        totals["botsTotal"] += 1
        if b["systemd"]["activeState"] == "active":
            totals["botsActive"] += 1
        
        usage = b.get("usage")
        win24 = (usage or {}).get("windows", {}).get("24h", {}) if usage else {}
        totals["tokens24h"] += _safe_int((win24 or {}).get("tokens"), 0)
        totals["cost24h"] += _safe_float((win24 or {}).get("costUSD"), 0.0)
        totals["requests24h"] += _safe_int((win24 or {}).get("requests"), 0)
        totals["errors24h"] += _safe_int((win24 or {}).get("errors"), 0)

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
