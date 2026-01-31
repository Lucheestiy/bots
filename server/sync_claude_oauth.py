#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import tempfile
from pathlib import Path


def _load_json(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def _atomic_write_json(path: Path, data: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=path.name + ".", dir=str(path.parent))
    try:
        os.close(fd)
        Path(tmp).write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        os.chmod(tmp, 0o600)
        os.replace(tmp, path)
    finally:
        try:
            os.unlink(tmp)
        except FileNotFoundError:
            pass


def _extract_claude_oauth(credentials: dict[str, object]) -> tuple[str, str, int]:
    raw = credentials.get("claudeAiOauth")
    if not isinstance(raw, dict):
        raise ValueError('Missing object "claudeAiOauth" in credentials JSON')
    access = raw.get("accessToken")
    refresh = raw.get("refreshToken")
    expires = raw.get("expiresAt")
    if not isinstance(access, str) or not access.strip():
        raise ValueError('Missing "claudeAiOauth.accessToken"')
    if not isinstance(refresh, str) or not refresh.strip():
        raise ValueError('Missing "claudeAiOauth.refreshToken"')
    if not isinstance(expires, int) or expires <= 0:
        raise ValueError('Missing/invalid "claudeAiOauth.expiresAt"')
    return access.strip(), refresh.strip(), int(expires)


def _sync_auth_profiles(auth_profiles_path: Path, *, access: str, refresh: str, expires: int) -> bool:
    auth: dict[str, object]
    if auth_profiles_path.exists():
        raw = _load_json(auth_profiles_path)
        if not isinstance(raw, dict):
            raise ValueError(f"auth-profiles must be a JSON object: {auth_profiles_path}")
        auth = dict(raw)
    else:
        auth = {}

    profiles = auth.get("profiles")
    if profiles is None:
        profiles = {}
        auth["profiles"] = profiles
    if not isinstance(profiles, dict):
        raise ValueError(f"auth-profiles .profiles must be an object: {auth_profiles_path}")

    profiles["anthropic:claude-cli"] = {
        "type": "oauth",
        "provider": "anthropic",
        "access": access,
        "refresh": refresh,
        "expires": expires,
    }

    last_good = auth.get("lastGood")
    if last_good is None:
        last_good = {}
        auth["lastGood"] = last_good
    if isinstance(last_good, dict):
        last_good["anthropic"] = "anthropic:claude-cli"

    if "version" not in auth:
        auth["version"] = 1

    _atomic_write_json(auth_profiles_path, auth)
    return True


def _iter_state_dirs(glob_paths: list[str], state_dirs: list[str]) -> list[Path]:
    out: list[Path] = []
    for raw in state_dirs:
        p = Path(raw).expanduser().resolve()
        out.append(p)
    for raw in glob_paths:
        for p in sorted(Path("/").glob(raw.lstrip("/")) if raw.startswith("/") else Path.cwd().glob(raw)):
            out.append(p.expanduser().resolve())
    # de-dupe while preserving order
    seen: set[Path] = set()
    uniq: list[Path] = []
    for p in out:
        if p in seen:
            continue
        seen.add(p)
        uniq.append(p)
    return uniq


def main() -> int:
    ap = argparse.ArgumentParser(description="Sync Claude CLI OAuth tokens into Clawdbot auth-profiles.json")
    ap.add_argument(
        "--credentials",
        type=Path,
        default=Path("/root/.claude/.credentials.json"),
        help="Path to Claude CLI credentials JSON",
    )
    ap.add_argument(
        "--glob-state-dir",
        action="append",
        default=[],
        help="Glob for Clawdbot state dirs (repeatable). Default: /root/.clawdbot-*",
    )
    ap.add_argument(
        "--state-dir",
        action="append",
        default=[],
        help="Explicit Clawdbot state dir (repeatable)",
    )
    args = ap.parse_args()

    creds_path: Path = args.credentials
    if not creds_path.exists():
        raise SystemExit(f"Credentials file not found: {creds_path}")

    creds_raw = _load_json(creds_path)
    if not isinstance(creds_raw, dict):
        raise SystemExit(f"Credentials JSON must be an object: {creds_path}")
    access, refresh, expires = _extract_claude_oauth(creds_raw)

    glob_state_dir: list[str] = list(args.glob_state_dir or [])
    state_dirs: list[str] = list(args.state_dir or [])
    if not glob_state_dir and not state_dirs:
        glob_state_dir = ["/root/.clawdbot-*"]
    targets = _iter_state_dirs(glob_state_dir, state_dirs)

    updated = 0
    for state_dir in targets:
        auth_profiles = state_dir / "agents/main/agent/auth-profiles.json"
        if not auth_profiles.exists():
            continue
        _sync_auth_profiles(auth_profiles, access=access, refresh=refresh, expires=expires)
        updated += 1

    if updated <= 0:
        raise SystemExit("No auth-profiles.json found under target state dirs")

    print(f"OK: synced Claude OAuth into {updated} auth-profiles.json file(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
