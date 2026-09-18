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

echo "==> Stage with versioned module URLs"
# Every deploy ships a fresh module graph (see deploy/version-modules.py):
# browsers and the CDN either have the whole new graph or the whole old one,
# never a stale ui.js next to a fresh page module. index.html is no-cache.
SHA="$(git rev-parse --short HEAD)"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
rsync -a \
    --include='index.html' --include='robots.txt' --include='sitemap.xml' \
    --include='*.png' --include='*.ico' --include='*.svg' \
    --include='assets/***' --include='known-contracts/***' \
    --exclude='*' \
    ./ "$STAGE/"
python3 deploy/version-modules.py "$STAGE" "$SHA"
# The versioned graph must still parse.
while IFS= read -r f; do cp "$f" /tmp/explorer-check.mjs; node --check /tmp/explorer-check.mjs || { echo "versioned module fails to parse: $f" >&2; exit 1; }; done < <(find "$STAGE/assets/js" -name '*.js')

echo "==> rsync to $HOST:$DEST"
# Static files only: the indexer (indexer.js, contract-verify.js, node_modules)
# is deployed separately as a service.
rsync -az --delete "$STAGE/" "$HOST:$DEST"
echo "    done"

echo "==> Purge Cloudflare cache for the entry points"
# Module URLs are versioned, so only the un-versioned entry points can be
# stale at the edge: the SPA routes (all serve index.html).
[[ -f "$HOME/.mersennet/cloudflare.env" ]] && set -a && . "$HOME/.mersennet/cloudflare.env" && set +a
files=$(printf 'https://explorer.mersennet.com/\nhttps://explorer.mersennet.com/index.html\nhttps://explorer.mersennet.com/validators\nhttps://explorer.mersennet.com/network\nhttps://explorer.mersennet.com/clob/1\n')
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
