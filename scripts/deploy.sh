#!/usr/bin/env bash
# Déploiement d'une mise à jour sur le Mac mini (docs/DEPLOY.md §12) :
# git pull → npm ci → build → relance du daemon de l'app → contrôle de santé.
# Le tunnel cloudflared n'est PAS relancé (il ne dépend pas du build de l'app).
set -euo pipefail
cd "$(dirname "$0")/.."

APP_LABEL="com.icebreakers.app"
PORT="${PORT:-3000}"

echo "── git pull ──────────────────────────────────────────────"
git pull --ff-only

echo "── npm ci ────────────────────────────────────────────────"
npm ci

echo "── build ─────────────────────────────────────────────────"
npm run build

echo "── relance de l'app ──────────────────────────────────────"
if sudo launchctl print "system/${APP_LABEL}" >/dev/null 2>&1; then
  sudo launchctl kickstart -k "system/${APP_LABEL}"
  echo "── santé ─────────────────────────────────────────────────"
  for _ in $(seq 1 20); do
    if curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null; then
      echo "✅ Déployé — http://127.0.0.1:${PORT}/health répond."
      exit 0
    fi
    sleep 1
  done
  echo "❌ /health ne répond pas après 20 s — voir scripts/status.sh" >&2
  exit 1
else
  echo "⚠️  ${APP_LABEL} n'est pas installé dans launchd : build à jour, mais"
  echo "   rien n'a été relancé. Installation des daemons : docs/DEPLOY.md §6."
fi
