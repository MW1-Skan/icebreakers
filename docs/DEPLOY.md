# Déploiement — Mac mini + Cloudflare Tunnel + Cloudflare Access

Pas-à-pas du PRD §7.2 (étape 8). Critère de done : **accessible depuis le
bureau, refusé sans login**.

```
Navigateur (bureau) ──HTTPS──► Cloudflare (TLS + Access : login OTP obligatoire)
                                    │
                                    │ tunnel chiffré SORTANT (aucun port entrant,
                                    │ IP résidentielle jamais exposée)
                                    ▼
                          Mac mini : cloudflared ──► app sur 127.0.0.1:3000
                          (les deux en LaunchDaemon : boot + relance auto)
```

Principes non négociables :

- **Aucun port entrant** : en production l'app écoute `127.0.0.1` uniquement
  (défaut du code dès `NODE_ENV=production`) ; seul cloudflared, en connexion
  sortante, l'expose.
- **Access d'abord, l'URL ensuite** : ne partage l'URL à personne avant d'avoir
  vu de tes yeux le mur de login (§5, test « refusé sans login »).
- **Zéro info interne dans le repo** (PRD §4.5) : domaine, emails, id de tunnel
  et credentials vivent dans `~/.cloudflared/`, `.env` et `config.json` —
  gitignorés. Ce document n'utilise que des placeholders (`jeux.example.fr`,
  `<TUNNEL_ID>`, `<TON_EMAIL>`).

## Qui fait quoi

| Prêt dans le repo (préparé par l'agent) | À faire à la main (toi) |
|---|---|
| Garde-fous de prod : bind local, refus de démarrer si mot de passe admin par défaut/vide, `robots.txt` deny all, méta `noindex` | Acheter le domaine (~10 €/an) et créer le compte Cloudflare (§3) |
| `.env.example` → ton `.env` | Créer le tunnel nommé et ses credentials (§4) |
| `deploy/launchd/*.plist` (app + cloudflared, placeholders) + commandes d'installation (§6) | Politique **Cloudflare Access** (§5) |
| `deploy/cloudflared/config.example.yml` | Réglages anti-veille du Mac mini (§7) |
| `scripts/deploy.sh`, `scripts/status.sh`, `scripts/quick-tunnel.sh` | Ping UptimeRobot sur `/health` (§8) |
| `Dockerfile` + `docker-compose.yml` testés (secours VPS, §11) | **Test depuis le réseau du bureau** (§2 puis §9) |

Étapes dans l'ordre : 1 → 9. La §2 (essai réseau bureau) peut se faire dès
aujourd'hui, sans domaine ni compte — c'est le risque n°1 du projet, teste-le
tôt.

---

## 1. Lancement de prod en local (sans compte, 5 min)

Sur le Mac mini (ou n'importe quelle machine pour valider) :

```bash
git clone <URL_DU_REPO> icebreakers && cd icebreakers
```

> ⚠️ **Emplacement du clone** : hors de `~/Documents`, `~/Desktop` et
> `~/Téléchargements` — macOS restreint l'accès de ces dossiers aux daemons
> (TCC), et le LaunchDaemon de §6 doit lire le repo au boot, sans session.
> Bon choix : `~/Apps/icebreakers`.

```bash
npm ci
npm run build
cp config.example.json config.json   # personnalise siteName / libellé du mode interne
cp .env.example .env                 # renseigne ADMIN_PASSWORD (obligatoire)
chmod 600 .env
npm run start:prod
```

Vérifications (l'e2e `e2e/deploy.spec.ts` joue les mêmes, automatiquement) :

- `curl http://127.0.0.1:3000/health` → `{"ok":true,...}`
- `curl http://127.0.0.1:3000/robots.txt` → `Disallow: /`
- http://127.0.0.1:3000 dans un navigateur → home, création de salon OK
- http://127.0.0.1:3000/admin → login avec ton `ADMIN_PASSWORD`
- Si tu laisses `ADMIN_PASSWORD` vide : le serveur **refuse de démarrer** avec
  un message explicite — c'est le garde-fou, pas un bug.

## 2. Essai réseau bureau avec un quick tunnel (dès aujourd'hui, sans compte)

Le vrai risque du montage n'est pas technique, c'est **le proxy/filtrage du
bureau** : il faut savoir tôt si `*.trycloudflare.com` (puis ton futur domaine)
et les WebSockets passent.

```bash
scripts/quick-tunnel.sh
```

Le script vérifie que l'app tourne, affiche l'avertissement (⚠️ **un quick
tunnel n'a AUCUNE protection Access** : URL publique jetable → contenu
`normal` uniquement, jamais de pack interne uploadé), puis imprime une URL
`https://<aléatoire>.trycloudflare.com`.

Depuis un PC du bureau, sur cette URL : la home charge, un salon se crée, un
deuxième appareil rejoint (le QR code), une manche d'Undercover se lance. Si ça
passe, le montage cible passera aussi (même réseau Cloudflare). Si c'est
bloqué, inutile d'acheter le domaine avant d'avoir un plan B (demande IT,
autre DNS, option VPS §11).

Ctrl-C coupe le tunnel ; l'URL meurt avec lui.

## 3. Domaine + zone Cloudflare (manuel, ~15 min + propagation)

1. Achète un domaine chez n'importe quel registrar (~10 €/an). Aucun rapport
   avec la boîte dans le nom — c'est ton domaine perso (ex. fictif :
   `example.fr`).
2. Crée un compte sur https://dash.cloudflare.com (plan **Free**).
3. Dashboard → **Add a site** → saisis `example.fr` → plan Free → Cloudflare
   affiche **deux serveurs de noms** (ex. `xxx.ns.cloudflare.com`).
4. Chez le registrar, remplace les serveurs de noms du domaine par ces deux-là.
5. Attends l'email « example.fr is now active on Cloudflare » (minutes → heures).

Rien à créer dans la zone DNS : la commande `route dns` de §4 s'en charge.

## 4. Tunnel nommé (manuel, commandes exactes)

Sur le Mac mini :

```bash
brew install cloudflared
```

```bash
cloudflared tunnel login
```

→ ouvre le navigateur : connecte-toi, choisis la zone `example.fr`, autorise.
Un certificat est écrit dans `~/.cloudflared/cert.pem`.

```bash
cloudflared tunnel create icebreakers
```

→ affiche l'**id du tunnel** (UUID, noté `<TUNNEL_ID>` partout ici) et écrit
ses credentials dans `~/.cloudflared/<TUNNEL_ID>.json`. **Ces deux fichiers
sont les clés du tunnel : jamais dans le repo, à inclure dans tes sauvegardes
(§10).**

```bash
cp deploy/cloudflared/config.example.yml ~/.cloudflared/config.yml
```

Édite `~/.cloudflared/config.yml` : remplace `<TUNNEL_ID>` (2 occurrences),
`<TON_USER>` (ton `whoami`) et `jeux.example.fr` (le sous-domaine que tu veux).

```bash
cloudflared tunnel route dns icebreakers jeux.example.fr
```

→ crée le CNAME `jeux` → `<TUNNEL_ID>.cfargotunnel.com` dans la zone.

Test manuel (l'app de §1 doit tourner) :

```bash
cloudflared tunnel run icebreakers
```

Depuis un autre appareil : `https://jeux.example.fr` → l'app répond (HTTPS
géré par Cloudflare). **Coupe ensuite le tunnel (Ctrl-C) et ne partage pas
encore l'URL : Access n'est pas posé.** Ces quelques minutes d'exposition sont
le seul moment sans mur de login (URL inconnue de tous, `noindex` +
`robots.txt` actifs).

## 5. Cloudflare Access — AVANT de partager l'URL (manuel, dashboard)

Objectif : personne n'atteint le site sans s'être identifié par email + code
OTP. Menus au 15/08/2026 (libellés parfois traduits « Applications » /
« Accès ») :

1. https://one.dash.cloudflare.com → **Zero Trust**. À la première visite,
   choisis un nom d'équipe (ex. `<ton-pseudo>.cloudflareaccess.com`) — plan
   **Free** (50 utilisateurs, largement assez ; re-vérifie au passage).
2. Vérifie la méthode de login : **Settings → Authentication → Login methods**
   doit lister **One-time PIN** (présent par défaut ; sinon « Add new » →
   One-time PIN).
3. **Access → Applications → Add an application → Self-hosted** :
   - **Application name** : `Icebreakers`
   - **Session Duration** : `1 week` (une connexion par navigateur et par
     semaine — confort rétro : la TV et les PC restent connectés)
   - **Public hostname** : subdomain `jeux`, domain `example.fr`, path vide
     (= tout le site)
   - **Add a policy** :
     - **Policy name** : `Équipe`
     - **Action** : `Allow`
     - **Include** → **Selector : Emails** → la liste des emails de l'équipe
       (`<TON_EMAIL>, <EMAIL_COLLEGUE_1>, …`). Variante : « Emails ending
       in » `@<domaine-de-la-boite>` si tu préfères ouvrir à toute la boîte.
   - **Login methods** : One-time PIN suffit. Enregistre (**Add application**).
4. **Exception monitoring** (sinon UptimeRobot, §8, verra le mur de login au
   lieu de l'app) : **Add an application → Self-hosted** à nouveau :
   - **Application name** : `Icebreakers health`
   - **Public hostname** : subdomain `jeux`, domain `example.fr`, **path
     `health`**
   - **Add a policy** : name `Monitoring`, **Action : Bypass**, **Include →
     Everyone**.
   - `/health` ne révèle que `{"ok":true,"uptime":…}` — aucun contenu.

**Test immédiat (critère de done du PRD)** : relance `cloudflared tunnel run
icebreakers`, puis en **fenêtre privée** : `https://jeux.example.fr` →
redirection vers `<ton-pseudo>.cloudflareaccess.com`, saisie d'email :

- un email **hors liste** → pas de code / accès refusé ✅
- ton email → code reçu, saisi → l'app s'affiche ✅
- `https://jeux.example.fr/health` sans login → `{"ok":true,…}` ✅

`scripts/status.sh https://jeux.example.fr` vérifie ce comportement à tout
moment (302 attendu ; il **alerte si le site répond 200 sans login**).

## 6. LaunchDaemons : app + tunnel au boot (Mac mini)

Les deux plists committés (placeholders, lintés) s'installent ainsi. Depuis la
racine du repo :

```bash
mkdir -p ~/Library/Logs/icebreakers
```

```bash
sed -e "s|__REPO_DIR__|$PWD|g" -e "s|__NODE_BIN__|$(which node)|g" -e "s|__USER__|$USER|g" \
  deploy/launchd/com.icebreakers.app.plist | sudo tee /Library/LaunchDaemons/com.icebreakers.app.plist >/dev/null
```

```bash
sed -e "s|__CLOUDFLARED_BIN__|$(which cloudflared)|g" -e "s|__USER__|$USER|g" \
  deploy/launchd/com.icebreakers.cloudflared.plist | sudo tee /Library/LaunchDaemons/com.icebreakers.cloudflared.plist >/dev/null
```

```bash
sudo chown root:wheel /Library/LaunchDaemons/com.icebreakers.*.plist && sudo chmod 644 /Library/LaunchDaemons/com.icebreakers.*.plist
```

```bash
sudo plutil -lint /Library/LaunchDaemons/com.icebreakers.app.plist /Library/LaunchDaemons/com.icebreakers.cloudflared.plist
```

```bash
sudo launchctl bootstrap system /Library/LaunchDaemons/com.icebreakers.app.plist
```

```bash
sudo launchctl bootstrap system /Library/LaunchDaemons/com.icebreakers.cloudflared.plist
```

Contrôle : `scripts/status.sh https://jeux.example.fr` → app ✅, daemons ✅,
Access ✅. Puis le vrai test : **redémarre le Mac mini** et relance
`status.sh` sans avoir ouvert de session (depuis un autre poste en SSH, ou
après login sans rien lancer) — tout doit être revenu tout seul.

Aide-mémoire :

| Action | Commande |
|---|---|
| État d'un daemon | `sudo launchctl print system/com.icebreakers.app` |
| Redémarrer l'app | `sudo launchctl kickstart -k system/com.icebreakers.app` |
| Redémarrer le tunnel | `sudo launchctl kickstart -k system/com.icebreakers.cloudflared` |
| Arrêter / désinstaller | `sudo launchctl bootout system/com.icebreakers.app` |
| Logs app | `tail -f ~/Library/Logs/icebreakers/app.log` (`.error.log` pour les crashs) |
| Logs tunnel | `tail -f ~/Library/Logs/icebreakers/cloudflared.error.log` |

Si l'app boucle au démarrage : `app.error.log` — le cas classique est le
garde-fou (`.env` absent ou `ADMIN_PASSWORD` vide) ; launchd retente toutes
les 10 s, corrige le `.env` et `kickstart`.

## 7. Réglages du Mac mini (manuel)

- **Réglages Système → Économie d'énergie** (ou « Énergie ») :
  - « Empêcher la suspension d'activité automatique lorsque l'écran est
    éteint » : **activé** / mise en veille : **jamais**.
  - « Démarrer automatiquement après une panne de courant » : **activé**.
- **FileVault** (Réglages → Confidentialité et sécurité) : s'il est activé, le
  Mac attend un mot de passe au boot → les daemons ne démarrent pas après une
  coupure. Pour un serveur de salon : FileVault **désactivé**, ou assume un
  déverrouillage manuel après chaque coupure.
- **Mises à jour macOS** (Réglages → Général → Mise à jour de logiciels) :
  installation automatique **hors** créneaux de rétro (un redémarrage relance
  tout, mais pas pendant une partie 🙂).
- Session : rien d'autre à prévoir — les LaunchDaemons vivent hors session.

## 8. Monitoring UptimeRobot (manuel, 5 min)

1. Compte gratuit sur https://uptimerobot.com.
2. **Add New Monitor** : type **HTTP(s)**, Friendly Name `Icebreakers`, URL
   `https://jeux.example.fr/health`, interval 5 min.
3. Alert contact : ton email.

Grâce à l'application Bypass de §5.4, le monitor voit le vrai `/health`. S'il
alerte : `scripts/status.sh` sur le Mac mini dit qui est tombé (app, tunnel,
box, courant).

## 9. Test final depuis le bureau (critère de done)

Depuis un PC du bureau, sur le réseau du bureau :

- [ ] `https://jeux.example.fr` → mur de login Cloudflare Access (pas l'app).
- [ ] Login avec un email de la liste + code OTP → l'app s'affiche.
- [ ] Fenêtre privée (ou collègue hors liste) → **refusé**.
- [ ] Un salon se crée, un deuxième PC (ou téléphone) rejoint par QR, une
      manche se joue — les WebSockets passent le proxy du bureau.
- [ ] `/admin` : login **admin** (encore un autre mot de passe — celui de
      `.env`) OK.
- [ ] La TV de la salle de rétro s'authentifie une fois (session 1 semaine).

## 10. Sauvegarde

**Tout l'état persistant tient dans `data/` + `config.json`** (packs uploadés,
activations, historique anti-répétition, config d'instance). Les salons sont
en mémoire, volontairement éphémères — rien d'autre à sauver côté app. Ajoute
`~/.cloudflared/` (credentials du tunnel) pour restaurer le montage complet :

```bash
tar czf ~/sauvegarde-icebreakers-$(date +%F).tgz -C ~ .cloudflared -C <REPO_DIR> data config.json .env
```

Restauration = re-dérouler §1 et §6 sur une machine neuve puis déposer ces
fichiers au même endroit.

## 11. Secours : bascule VPS en 30 min (§7.2 « limites honnêtes »)

Si le Mac mini/la box lâche un matin de rétro, l'app est un conteneur sans
état obligatoire :

1. Un VPS EU à quelques €/mois (Scaleway/OVH/Hetzner), Docker installé.
2. `git clone <URL_DU_REPO> && cd icebreakers`
3. Recopie depuis la sauvegarde (§10) : `data/`, `config.json`, `.env`
   (`chmod 600 .env`), et `~/.cloudflared/` (cert, credentials, config.yml).
4. `cp config.example.json config.json` et `.env` depuis `.env.example` si tu
   pars de zéro (le garde-fou exigera `ADMIN_PASSWORD`).
5. `docker compose up -d --build` → app sur `127.0.0.1:3000` du VPS
   (rien d'exposé publiquement, comme sur le Mac mini).
   Sur un VPS Linux, le volume `data/` appartient à l'uid 1000 du conteneur :
   si l'upload de pack échoue, `sudo chown -R 1000:1000 data`.
6. Le tunnel suit les credentials, pas la machine :
   `cloudflared tunnel run icebreakers` sur le VPS (installe cloudflared, ou
   ajoute un service systemd : `sudo cloudflared --config ~/.cloudflared/config.yml service install`).
   **Aucun changement DNS ni Access** — `jeux.example.fr` pointe déjà sur le
   tunnel, où qu'il tourne.

Le même `docker compose up` sert de banc d'essai local du conteneur (testé :
partie jouable, pack uploadé retrouvé après `docker compose restart`).

## 12. Exploitation courante

- **Déployer une mise à jour** : `scripts/deploy.sh` (pull → ci → build →
  relance de l'app seule ; le tunnel reste debout).
- **État** : `scripts/status.sh [https://jeux.example.fr]`.
- **Étape 9 de la roadmap** (au bureau) : générer les packs `interne` avec
  l'agent IA de la boîte (prompt en Annexe B du PRD) et les uploader via
  `https://jeux.example.fr/admin` — ils vivent dans `data/packs/` sur le Mac
  mini, jamais dans Git (PRD §4.5).

## Checklist sécurité/confidentialité (PRD §7.4)

- [ ] Cloudflare Access actif (aucun accès anonyme) — **testé depuis le
      bureau** (§5 puis §9)
- [ ] `robots.txt` deny all + méta `noindex` (servis par l'app — vérifiés par
      l'e2e)
- [ ] Packs `interne` relus : zéro nom de client/personne, zéro donnée réelle
      (règles Annexe B — étape 9)
- [ ] Page admin : mot de passe fort dans `.env` (chmod 600), jamais dans le
      repo ; le serveur refuse de démarrer en prod avec le défaut
- [ ] Aucune analytics/tracker tiers ; mention pied de page sur les prénoms
- [ ] Le repo Git ne contient **aucune** info interne : `data/`, `config.json`,
      `.env`, PRD gitignorés ; placeholders partout dans `deploy/` et cette doc

## Dépannage

| Symptôme | Piste |
|---|---|
| `Démarrage refusé : NODE_ENV=production…` dans `app.error.log` | Le garde-fou : renseigne `ADMIN_PASSWORD` dans `.env` puis `kickstart` (§6) |
| L'app tourne mais `https://jeux.example.fr` ne répond pas | `status.sh` ; tunnel : `cloudflared.error.log`, `cloudflared tunnel info icebreakers` |
| Mur de login absent (200 anonyme) | Access : l'application couvre-t-elle bien `jeux.example.fr` sans path ? (§5.3) |
| UptimeRobot voit le login au lieu de `/health` | L'application Bypass `path: health` manque (§5.4) |
| Marche à la maison, pas au bureau | Le proxy du bureau — §2 aurait dû le dire tôt ; voir IT, ou option VPS (§11) |
| Boot du Mac : rien ne démarre | FileVault ? (§7) `sudo launchctl print system/com.icebreakers.app` (§6) |
| WebSocket coupé en pleine partie | Reconnexion automatique par jeton (PRD §3.4) — vérifier `app.log` si récurrent |
