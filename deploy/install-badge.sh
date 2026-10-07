#!/usr/bin/env bash
# Installs the 402Scope badge service (badge.svg / badge.json) on the server.
# - Copies services/badge to /opt/402scope-badge and runs it with systemd on 127.0.0.1:3003
#   as an unprivileged user, read-only. It only reads the observatory API on :3002.
# - Adds two routes to Caddy for 402scope.org (/badge.svg and /badge.json), with a backup,
#   and only reloads Caddy if the new configuration validates.
# Code updates are not automatic: run this script again after pulling to update the service.
# Usage (as root):  bash /opt/402scope-web/deploy/install-badge.sh
set -euo pipefail
SRC="/opt/402scope-web/services/badge"
DST="/opt/402scope-badge"
CADDY="/etc/caddy/Caddyfile"
say() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mXX  %s\033[0m\n' "$*"; exit 1; }
[ "$(id -u)" -eq 0 ] || die "Run as root."
[ -d "$SRC" ] || die "Run: bash /opt/402scope-web/deploy/update.sh first."

say "Service"
git -C /opt/402scope-web pull --ff-only -q || true
mkdir -p "$DST" && cp -a "$SRC/." "$DST/"
NODE="$(command -v node)"
cat > /etc/systemd/system/402scope-badge.service <<UNIT
[Unit]
Description=402Scope badges
After=network-online.target

[Service]
ExecStart=$NODE $DST/server.mjs
Environment=PORT=3003 HOST=127.0.0.1 API_URL=http://127.0.0.1:3002
DynamicUser=yes
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now 402scope-badge >/dev/null
systemctl restart 402scope-badge
sleep 1
curl -fsS http://127.0.0.1:3003/badge/health >/dev/null && echo "Badge service answers on 127.0.0.1:3003" || die "Service did not start: journalctl -u 402scope-badge -n 30"

say "Caddy routes"
if grep -q '/badge.svg' "$CADDY"; then
  echo "Routes already present."
else
  cp -a "$CADDY" "$CADDY.bak-$(date +%Y%m%d%H%M%S)"
  TMP="$(mktemp)"
  # Insert the badge routes before the first plain "handle {" (the website block).
  awk 'done==0 && /^[[:space:]]*handle[[:space:]]*\{[[:space:]]*$/ {
         print "\t# Badges: an image per measured endpoint, from the badge service.";
         print "\t@badge path /badge.svg /badge.json";
         print "\thandle @badge {";
         print "\t\treverse_proxy 127.0.0.1:3003";
         print "\t}";
         print "";
         done=1 }
       { print }' "$CADDY" > "$TMP"
  grep -q '/badge.svg' "$TMP" || die "Could not find the website block in $CADDY. Nothing was changed."
  if caddy validate --config "$TMP" --adapter caddyfile >/dev/null 2>&1; then
    cat "$TMP" > "$CADDY" && rm -f "$TMP"
    systemctl reload caddy
    echo "Caddy updated and reloaded."
  else
    rm -f "$TMP"
    die "The new Caddy configuration did not validate. Nothing was changed."
  fi
fi

say "Check"
sleep 1
printf 'https://402scope.org/badge.svg  %s\n' "$(curl -s -o /dev/null -w '%{http_code} %{content_type}' --max-time 10 'https://402scope.org/badge.svg?endpoint=https://example.com')"
