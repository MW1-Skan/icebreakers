# Retro Icebreakers

Mini-jeux d'icebreaker pour rétrospectives d'équipe — multi-device, présentiel, TV.

L'animateur crée un salon sur le poste **projeté sur la TV** : son écran est la vue
publique du jeu (état, timers, QR code, révélations) surmontée d'une barre de
contrôle repliable. Les joueurs rejoignent en scannant le QR avec leur PC : leur
écran porte l'info secrète et les actions individuelles. **Aucun secret ne
transite jamais vers un client non autorisé** — le serveur n'envoie que des
projections par audience, garanties par des tests de non-fuite.

Jeux disponibles (joueurs actifs, animateur exclu) :

- **Undercover** 🕵️ (4–10 j) — rôles cachés : civils, undercover, Mr. White.
  Manches enchaînables (1–5) avec cumul, 1 à 3 tours de parole avant chaque vote.
- **Just One** ☝️ (4–10 j, coop) — un devineur, des indices d'un seul mot qui
  s'annulent s'ils se ressemblent. 5 à 13 manches, arbitre de manche tournant
  (mot injouable, litiges, réponses approximatives), mode doux.
- **Wavelength** 🌊 (3–10 j) — le télépathe voit une cible secrète sur un axe et
  donne un indice ; chacun place SA cible en secret, points à la distance
  (±5/±10/±15), télépathe à la moyenne. Rotation, podium, récap des indices.
- **Ito** 🔢 (3–10 j, coop) — nombres secrets 1–100 à écart minimal garanti,
  à poser dans l'ordre croissant en décrivant via le thème. Vies d'équipe,
  défausse automatique sur erreur, verdict par vies restantes.
- **Spyfall** 🔎 (4–10 j) — thème public + grille des cartes possibles, une
  carte secrète connue de tous… sauf de l'espion. Interrogatoire oral,
  accusations à l'unanimité, coup de l'espion, vote final (égalité = espion).
- **Taboo** ⏱️ (4–10 j, binômes) — faire deviner sans le mot ni les 3 interdits,
  60 s au chrono, les autres joueurs voient la carte et buzzent les fautes.
  Binômes composés ou aléatoires (trio si impair), mort subite sur égalité.

## Démarrage

```bash
npm install
npm run dev
```

- Front (dev) : http://localhost:4200
- API/WS : http://localhost:3000 (proxifié par le dev-server Angular)

En build de prod (`npm run build`), le serveur NestJS sert aussi le front :
tout tourne sur http://localhost:3000.

## Tester à 5 écrans en local

1. `npm run dev` — le premier démarrage compile les deux apps : compte
   20–40 s avant que http://localhost:4200 réponde (le terminal affiche
   « Application bundle generation complete » et « Nest application
   successfully started » quand c'est prêt).
2. Ouvre http://localhost:4200 → **« Créer un salon »**. Cet onglet est
   l'écran animateur (celui qu'on projetterait sur la TV).
3. Ouvre 4 **contextes de navigation séparés** sur l'URL affichée sous le QR
   (`http://localhost:4200/join/CODE`) : prénom + avatar → chacun est un joueur.

   ⚠️ Le jeton de session vit dans le localStorage, partagé entre les onglets
   d'un même profil : **deux onglets ordinaires du même navigateur seraient le
   même joueur** (le second se reconnecte à la place du premier). Pour simuler
   4 joueurs sur une seule machine, mélange : fenêtre privée, autre navigateur
   (Firefox/Chrome/Safari), autres profils Chrome. L'animateur peut cohabiter
   avec UN joueur dans le même profil (jetons distincts). En conditions
   réelles, la question ne se pose pas : un joueur = son propre PC.
4. Sur l'écran animateur : **« Lancer la partie »** (bouton actif dès 4 joueurs).
5. Chaque joueur touche **« Voir mon mot »** ; l'animateur déroule le tour de
   parole (« Joueur suivant »), la discussion, puis le vote se fait sur les
   écrans joueurs. Révélations et fin de partie s'affichent partout.
6. Rafraîchis n'importe quel onglet en cours de partie : le jeton en
   localStorage reconnecte le joueur (ou l'animateur) à sa place.

Paramètres utiles au lancement : **Manches** (1 à 5 manches enchaînées, avec
cumul des points et classement final de série) et **Tours de parole** (1 à 3
passes de description avant chaque vote).

### Barème Undercover

| Issue | Points |
|---|---|
| Victoire des civils | 2 pts par civil, **+1 bonus 🎯** pour ceux qui ont visé un infiltré lors d'un vote **où les civils n'étaient pas unanimes** |
| Victoire des undercover | 3 pts par infiltré vivant |
| Mr. White devine le mot | 4 pts, seul |

Le bonus récompense la lucidité **individuelle** : viser un infiltré compte
même si le groupe n'a pas suivi (re-vote d'égalité compris) — mais un vote où
tous les civils convergent (plébiscite du premier tour, dernier tour à 2 civils
contre 1 undercover…) ne distingue personne et ne rapporte rien, que la cible
commune soit l'undercover ou Mr. White. Max civil (3) = victoire undercover
(3) ; la victoire la plus difficile paie un cran au-dessus (4).

Astuce dev/test : `http://localhost:4200/?seed=42` avant « Créer un salon »
fixe la seed RNG du salon (rôles, paire de mots et ordre reproductibles).
Ignorée en production.

## Structure du monorepo (npm workspaces)

```
libs/shared          Types partagés, catalogue d'événements WS, schémas Zod
                     des packs et des payloads, normalisation/Levenshtein,
                     RNG seedable.
apps/server          NestJS + Socket.IO. Rooms en mémoire (Map<code, Room>),
                     timers serveur, chargeur de packs, moteurs de jeu =
                     réducteurs purs + projections par audience.
  src/games/         Un jeu = un module : réducteur (état + actions + effets),
                     projections, tests. `undercover/` et `justone/` suivent
                     le même patron — copier l'un des deux pour ajouter un jeu.
  src/rooms/         Salons, jetons de reconnexion, timers, projectFor.
  src/packs/         Chargement/validation des packs, anti-répétition.
apps/web             Angular (standalone + signals). L'UI de chaque écran est
                     une fonction pure de la dernière projection `room:state`.
packs/builtin/       Packs de contenu committés (mode `normal` uniquement).
data/packs/          Packs ajoutés à chaud (gitignoré) — lus dès maintenant,
                     l'upload via /admin viendra plus tard.
e2e/                 Test Playwright de bout en bout.
```

## Commandes

| Commande | Effet |
|---|---|
| `npm run dev` | Lance serveur (watch) + front (dev-server, proxy WS) |
| `npm test` | Tests unitaires : moteur Undercover, non-fuite, packs, services |
| `npm run e2e` | Build complet puis Playwright (1 animateur + 4 joueurs, port 3100) |
| `npm run build` | Build serveur + front (le serveur sert alors le front) |

## Contenu (packs)

Tout le contenu vit dans des packs JSON validés par Zod (enveloppe commune +
entrées par jeu). Un pack invalide est rejeté au chargement avec un rapport
lisible — jamais de crash. Ajouter du contenu ne demande aucune modification
de code : déposer un fichier dans `data/packs/` et redémarrer suffit (la page
d'admin arrivera dans une étape ultérieure).

Le libellé affiché du mode `interne` vient de `config.json` (copie locale de
`config.example.json`, gitignorée). Le dépôt ne contient que du contenu
grand public.

## Garanties de confidentialité en jeu

- `projectFor(room, viewer)` calcule, par socket, la seule chose envoyée au
  client. L'état brut (`pair`, `roles`, `votes`…) ne sort jamais du serveur.
- L'écran animateur est **public par construction** (il est projeté) : sa
  projection est identique à celle du miroir, plus l'état des contrôles.
- Les tests `apps/server/src/rooms/project.spec.ts` sérialisent chaque
  projection (phase × audience) et vérifient l'absence de tout secret :
  mots de la paire, rôles des vivants, bulletins de vote, jetons.
