#!/usr/bin/env bash
# Quick tunnel jetable (PRD §7.2.7) : URL publique *.trycloudflare.com, SANS
# compte Cloudflare ni domaine — pour tester l'app (et le réseau du bureau)
# avant l'achat du domaine. L'URL change à chaque lancement. Ctrl-C pour couper.
set -euo pipefail

PORT="${PORT:-3000}"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared introuvable — installe-le d'abord : brew install cloudflared" >&2
  exit 1
fi

if ! curl -sf --max-time 3 "http://127.0.0.1:${PORT}/health" >/dev/null; then
  echo "Aucune app ne répond sur http://127.0.0.1:${PORT}/health." >&2
  echo "Lance-la d'abord : npm run build && npm run start:prod (cf. docs/DEPLOY.md §1)." >&2
  exit 1
fi

cat <<'EOF'
─────────────────────────────────────────────────────────────────────
⚠️  QUICK TUNNEL = URL PUBLIQUE, SANS PROTECTION CLOUDFLARE ACCESS
    • N'importe qui possédant l'URL peut accéder au site.
    • Contenu « normal » UNIQUEMENT : aucun pack interne uploadé
      (PRD §7.2.7) — vérifie /admin avant si besoin.
    • Test court, URL jetable, à ne partager qu'avec l'équipe.
─────────────────────────────────────────────────────────────────────
EOF
read -r -p "Continuer ? [o/N] " reply
case "${reply}" in
  o | O | oui | OUI) ;;
  *)
    echo "Annulé."
    exit 0
    ;;
esac

# L'URL https://<aléatoire>.trycloudflare.com s'affiche dans les logs ci-dessous.
exec cloudflared tunnel --url "http://127.0.0.1:${PORT}"
