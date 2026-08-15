#!/usr/bin/env bash
# Santé du déploiement : app locale, daemons launchd, tunnel, derniers logs.
#
# Usage : scripts/status.sh [https://jeux.example.fr]
#   L'URL publique est optionnelle et jamais committée (PRD §4.5). Si elle est
#   fournie, on vérifie que Cloudflare Access répond bien par une redirection
#   de login (302) — un 200 anonyme signalerait un site NON protégé.
set -uo pipefail # pas de -e : on veut afficher tous les checks, même en échec

PORT="${PORT:-3000}"
LOG_DIR="${LOG_DIR:-$HOME/Library/Logs/icebreakers}"
PUBLIC_URL="${1:-}"

section() { printf '\n── %s ' "$1"; printf '─%.0s' $(seq 1 $((55 - ${#1}))); printf '\n'; }

section "App locale (http://127.0.0.1:${PORT})"
if health="$(curl -sf --max-time 3 "http://127.0.0.1:${PORT}/health")"; then
  echo "✅ /health : ${health}"
else
  echo "❌ /health ne répond pas — l'app est-elle lancée ?"
fi

section "Daemons launchd"
for label in com.icebreakers.app com.icebreakers.cloudflared; do
  if sudo -n true 2>/dev/null; then
    if state="$(sudo launchctl print "system/${label}" 2>/dev/null | grep -E 'state = |pid = ' | tr -s ' \t' ' ' | xargs)"; then
      echo "✅ ${label} : ${state:-chargé}"
    else
      echo "❌ ${label} : non chargé (installation : docs/DEPLOY.md §6)"
    fi
  else
    # Sans sudo, on se rabat sur la présence du process.
    case "${label}" in
      *app) pattern="apps/server/dist" ;;
      *) pattern="cloudflared" ;;
    esac
    if pgrep -f "${pattern}" >/dev/null; then
      echo "✅ ${label} : process présent (détail launchd : relancer avec sudo)"
    else
      echo "❌ ${label} : aucun process (détail launchd : relancer avec sudo)"
    fi
  fi
done

if [ -n "${PUBLIC_URL}" ]; then
  section "URL publique (${PUBLIC_URL})"
  code="$(curl -s -o /dev/null --max-time 10 -w '%{http_code}' "${PUBLIC_URL}")"
  case "${code}" in
    302 | 303) echo "✅ HTTP ${code} : Cloudflare Access redirige vers le login (site protégé)." ;;
    200) echo "⚠️  HTTP 200 SANS login : le site répond anonymement — Access est-il actif ?! (§7.4)" ;;
    000) echo "❌ Pas de réponse : tunnel coupé, DNS, ou réseau." ;;
    *) echo "⚠️  HTTP ${code} — à investiguer (cloudflared.error.log, dashboard Cloudflare)." ;;
  esac
fi

section "Derniers logs (${LOG_DIR})"
found=0
for f in app.log app.error.log cloudflared.log cloudflared.error.log; do
  if [ -s "${LOG_DIR}/${f}" ]; then
    found=1
    echo "· ${f} :"
    tail -n "${LINES:-6}" "${LOG_DIR}/${f}" | sed 's/^/    /'
  fi
done
[ "${found}" = 1 ] || echo "(aucun log — daemons pas encore installés ?)"
