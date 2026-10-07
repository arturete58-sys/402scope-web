#!/usr/bin/env bash
# Serves https://402scope.org/.well-known/stellar.toml the way SEP-1 requires:
# readable from any origin (CORS *) and as plain text. Adds three lines to the
# 402scope.org block in Caddy, with a backup, and reloads only if it validates.
# The file itself is published with the rest of the site.
# Usage (as root):  bash /opt/402scope-web/deploy/install-stellar-toml.sh
set -euo pipefail
CADDY="/etc/caddy/Caddyfile"
say() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mXX  %s\033[0m\n' "$*"; exit 1; }
[ "$(id -u)" -eq 0 ] || die "Run as root."
bash /opt/402scope-web/deploy/update.sh --force >/dev/null

say "Caddy headers for stellar.toml"
if grep -q 'stellartoml' "$CADDY"; then
  echo "Already present."
else
  cp -a "$CADDY" "$CADDY.bak-$(date +%Y%m%d%H%M%S)"
  TMP="$(mktemp)"
  awk 'done==0 && /^[[:space:]]*handle[[:space:]]*\{[[:space:]]*$/ {
         print "\t# SEP-1: stellar.toml must be readable from any origin, as plain text.";
         print "\t@stellartoml path /.well-known/stellar.toml";
         print "\theader @stellartoml Access-Control-Allow-Origin \"*\"";
         print "\theader @stellartoml >Content-Type \"text/plain; charset=utf-8\"";
         print "";
         done=1 }
       { print }' "$CADDY" > "$TMP"
  grep -q 'stellartoml' "$TMP" || die "Could not find the website block in $CADDY. Nothing was changed."
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
curl -sI --max-time 10 https://402scope.org/.well-known/stellar.toml | grep -iE '^(HTTP|content-type|access-control-allow-origin)'
