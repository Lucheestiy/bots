# bots.lucheestiy.com

Dashboard for bot monitoring + control:
- systemd status (active/enabled/uptime/memory)
- Clawdbot transcript usage (tokens/cost/errors) per bot
- actions: start/stop/restart/enable/disable

## Local machine

### Start

```bash
sudo systemctl enable --now bots-dashboard.service
cd /home/mlweb/bots.lucheestiy.com && docker compose up -d
```

### Stop

```bash
cd /home/mlweb/bots.lucheestiy.com && docker compose down
sudo systemctl disable --now bots-dashboard.service
```

### API smoke test

```bash
curl -fsS http://127.0.0.1:8124/healthz
curl -fsS http://127.0.0.1:8123/api/bots | head
```

## VPS reverse proxy

Create an nginx vhost that proxies:
`bots.lucheestiy.com` → `http://100.93.127.52:8123` (Tailscale).

