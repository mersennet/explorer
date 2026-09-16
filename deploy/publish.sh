#!/usr/bin/env bash
# publish.sh — the only way the explorer frontend should reach the app host.
#
#   deploy/publish.sh            # check, rsync, purge the Cloudflare cache for changed JS/CSS
#   deploy/publish.sh --check    # checks only
#
# Runs the same checks as CI first (every ES module parses, index.html points
# at existing assets). On 2026-09-15 a duplicate `const` in app.js was rsynced
# without this and the explorer rendered a blank page for ~15 hours: a module
# with a syntax error fails to load and takes the whole app with it, and
# `node --check` would have caught it in 100 ms.
set -euo pipefail
cd "$(dirname "$0")/.."

HOST="${EXPLORER_HOST:-root@178.104.211.138}"
DEST="${EXPLORER_DEST:-/var/www/explorer.mersennet.com/}"
CHECK_ONLY=0
[[ "${1:-}" == "--check" ]] && CHECK_ONLY=1

echo "==> Syntax check"
n=0
while IFS= read -r f; do
    cp "$f" /tmp/explorer-check.mjs
    if ! node --check /tmp/explorer-check.mjs 2>/tmp/explorer-check.err; then
        echo "syntax error in $f:" >&2
        cat /tmp/explorer-check.err >&2
        exit 1
    fi
    n=$((n + 1))
done < <(find assets/js -name '*.js')
echo "    $n modules parse"

echo "==> Asset references"
for ref in $(grep -oE '(href|src)="/?assets/[^"]+' index.html | sed -E 's/^(href|src)="\/?//' | sort -u); do
    test -f "$ref" || { echo "missing asset: $ref" >&2; exit 1; }
done
echo "    ok"

[[ $CHECK_ONLY -eq 1 ]] && exit 0

echo "==> rsync to $HOST:$DEST"
# Static files only: the indexer (indexer.js, contract-verify.js, node_modules)
# is deployed separately as a service.
rsync -az --delete \
    --include='index.html' --include='robots.txt' --include='sitemap.xml' \
    --include='*.png' --include='*.ico' --include='*.svg' \
    --include='assets/***' --include='known-contracts/***' \
    --exclude='*' \
    ./ "$HOST:$DEST"
echo "    done"

echo "==> Purge Cloudflare cache for JS/CSS changed in the last commit(s)"
# Everything under assets/ is cached at the edge for four hours. Purge what
# changed since the last deploy marker so operators see fixes immediately.
# Uses the cloudflare CLI token if present; otherwise prints the list to purge.
files=$(git diff --name-only "$(git rev-parse HEAD~3)" HEAD -- assets index.html 2>/dev/null | sed 's#^#https://explorer.mersennet.com/#' | sed 's#/index.html$#/#')
if [[ -z "$files" ]]; then
    echo "    nothing to purge"
elif [[ -n "${CF_API_TOKEN:-}" && -n "${CF_ZONE_ID:-}" ]]; then
    body=$(printf '%s\n' "$files" | python3 -c 'import json,sys; print(json.dumps({"files":[l.strip() for l in sys.stdin if l.strip()]}))')
    curl -fsS -X POST "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/purge_cache" \
        -H "Authorization: Bearer $CF_API_TOKEN" -H 'Content-Type: application/json' --data "$body" >/dev/null
    echo "    purged:"; printf '      %s\n' $files
else
    echo "    CF_API_TOKEN/CF_ZONE_ID not set — purge these in the Cloudflare dashboard (or via the Cloudflare MCP):"
    printf '      %s\n' $files
fi
