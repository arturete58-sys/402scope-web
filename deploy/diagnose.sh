#!/usr/bin/env bash
# Read-only checks of the observatory. Changes nothing. Paste the output to whoever helps you.
say() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
say "API answers locally"
for p in / /v1/health /v1/endpoints /v1/coverage; do
  printf '%-16s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://127.0.0.1:3002$p")"
done
say "First lines of /v1/health"
curl -s --max-time 10 http://127.0.0.1:3002/v1/health | head -c 600; echo
say "Process on :3002"
ss -ltnp 'sport = :3002' 2>/dev/null | tail -n +2 || true
PID="$(ss -ltnpH 'sport = :3002' 2>/dev/null | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)"
if [ -n "$PID" ]; then
  UNIT="$(systemctl status "$PID" 2>/dev/null | head -1 | awk '{print $2}')"
  echo "systemd unit: ${UNIT:-none}"
  command -v pm2 >/dev/null && pm2 list 2>/dev/null | head -20
  [ -n "$UNIT" ] && journalctl -u "$UNIT" -n 30 --no-pager 2>/dev/null | grep -iv 'password\|secret\|token\|postgres://\|key=' || true
fi
say "Database"
systemctl is-active postgresql 2>/dev/null || echo "postgresql service: not found"
command -v pg_isready >/dev/null && pg_isready || true
say "Disk"
df -h / | tail -1
say "Public site"
printf 'https://402scope.org/  %s\n' "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 https://402scope.org/)"
curl -s --max-time 10 https://402scope.org/ | grep -q 'Does an x402 seller deliver' && echo "New front page is live." || echo "The public site does not show the new front page yet: the web server may serve another folder (see the lines above)."
