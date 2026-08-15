# DECISIONS — écarts et interprétations par rapport au PRD

Ce fichier liste chaque écart, interprétation ou choix fait là où le PRD est
ambigu (règle du prompt de build : « choisis l'option la plus simple, note-la,
continue »). Références : §n = section du PRD, « fiche » = fiche 5.1 Undercover.

## Repo et outillage

- **`.gitignore` du premier commit** : le commit initial du repo ignorait `*.md` en
  bloc, ce qui couvrait bien `PRD*.md` mais aurait aussi exclu `README.md` et
  `DECISIONS.md`. Remplacé dès le 2e commit (avant tout code et avant l'existence
  de `data/` ou `config.json`) par la liste explicite du §4.5.
- **npm workspaces** plutôt que Nx (§6.1 propose les deux, le prompt demande « au
  plus simple ») : `libs/shared`, `apps/server`, `apps/web`.
- **Angular 20** plutôt que 21 : le CLI Angular 21 exige Node ≥ 24.15, la machine
  de dev est en 24.12. Le PRD demande « Angular 18+ » → satisfait. Zone.js
  conservé (le zoneless est encore en preview en v20) ; signals partout.
- **Imports serveur → lib partagée en relatif** via un fichier-pont
  (`apps/server/src/shared.ts`) plutôt qu'un alias TS : le build tsc garde des
  chemins résolubles par Node au runtime, zéro outillage de réécriture. Le front
  Angular, lui, utilise l'alias `@icebreakers/shared` (esbuild le résout).
- **Pas de tests unitaires front** (Karma retiré) : le DoD couvre réducteur,
  non-fuite et packs (Vitest côté serveur/lib) + un e2e Playwright. L'UI étant
  une fonction pure de `room:state`, c'est le e2e qui la vérifie.
- **Nom générique** : « Icebreakers » par défaut (`config.example.json`) ; aucune
  référence au nom de code du PRD ni à quoi que ce soit d'interne.

## Modèle et cycle de vie

- **`status: 'recap'`** (§6.5) interprété comme « écran de fin affiché » : le jeu
  vient de se terminer, `game.phase === 'end'` simultanément ; `host:next` depuis
  cet état revient au lobby (la sélection de jeu est conservée pour « Rejouer »).
- **Reconnexion de l'animateur** : par `room:join { code, token }`, comme les
  joueurs — le §6.4 le dit lui-même (« reconnexion par jeton, comme les
  joueurs ») ; pas d'événement dédié.
- **Jetons** : transmis une seule fois dans l'ack de `room:create`/`room:join`,
  jamais dans `room:state` (une projection n'a pas à porter de credential).
- **Salon plafonné à 10 joueurs** (le produit annonce 3–10 actifs, §1.2) ;
  rejoindre en cours de partie est accepté : le retardataire est spectateur et
  « jouera la prochaine » (l'effectif d'une partie est figé au lancement).
- **Fermeture auto 2 h** : balayage toutes les 5 min sur `lastActivityAt`.

## Règles Undercover (fiche 5.1)

- **Répartition 9–10 joueurs** : la fiche s'arrête à 8. Extrapolé : 9 → 2
  undercover + White, 10 → 3 undercover + White. Validation générale :
  `undercover + White < joueurs / 2` (majorité stricte de civils) et White ≥ 5
  joueurs (explicite dans la fiche).
- **Barème en cas de victoire des infiltrés** : 5 pts par infiltré **vivant**
  (Mr. White inclus s'il est encore en vie — ses 8 pts ne valent que pour une
  victoire au guess). Civils vainqueurs : 2 pts chacun, éliminés compris.
- **Seuil Levenshtein du guess** : calculé sur la longueur du **mot cible
  normalisé** (le mot des civils) — ≤ 1 si ≤ 5 caractères, ≤ 2 sinon.
- **Clôture du vote** : anticipée uniquement quand TOUS les vivants ont voté ;
  sinon le timeout transforme les manquants en votes blancs. Pas de `host:next`
  pendant le vote. L'UI ne propose pas de vote blanc volontaire (la fiche ne le
  prévoit que comme conséquence du timeout) ; le serveur l'accepte par
  robustesse.
- **Re-vote d'égalité** : tous les vivants votent, cibles restreintes aux ex
  æquo (qui votent aussi, pas pour eux-mêmes).
- **Série de tours blancs** : `blankStreak` ne compte que les tours « tous
  blancs » consécutifs ; une élimination ou une égalité le remet à zéro. À 2, la
  TV suggère l'abandon (bandeau), l'abandon lui-même reste un geste du host.
- **Retrait administratif** (`removeFromRound`) : clôt le tour en cours (vote ou
  discussion abandonnés, timer annulé), révélation immédiate du rôle — sans
  droit de guess pour White — puis nouveau tour (ou fin si condition atteinte).
  Interdit pendant `reveal`/`whiteGuess` (résolutions atomiques). Autorisé aussi
  pour un joueur connecté mais AFK (capacité « retirer un AFK », §2) : le seuil
  des 60 s de déconnexion (§3.4) est affiché à l'UI (sablier) mais pas bloqué
  serveur — le host juge, l'UI double-confirme.
- **Kick** : au lobby uniquement ; en partie, c'est « retirer de la manche ».
- **Transitions** : discussion → vote automatique au timeout (le host peut
  écourter) ; distribution → description : geste du host (les ✓ l'informent,
  pas d'auto-avance) ; `reveal`/`whiteGuess` → suite : geste du host
  (« Continuer »), y compris vers l'écran de fin.
- **`abortRound`** : retour au lobby sans entrée au récap (une manche abandonnée
  ne compte pas) — c'est aussi la réponse à la suggestion d'abandon.

## Socle (§3)

- **Pause auto** (§3.4) : déconnexion de l'animateur → timers auto-pausés +
  bandeau sur les écrans joueurs ; sa reconnexion reprend automatiquement les
  timers auto-pausés — une pause posée MANUELLEMENT avant la coupure survit.
- **« Reprendre l'animation »** (bouton joueur après 60 s, §3.4) et
  `transferHost` : **différés** (hors DoD étapes 0–1). La pause auto + la
  reconnexion par jeton couvrent le besoin courant ; l'événement du catalogue
  reviendra avec cette feature.
- **Sons/bips** (§3.3) : non implémentés (off par défaut dans le PRD) ; le
  changement de couleur des 10 dernières secondes est là.
- **Miroir `/tv`** : supporté côté serveur (`mirror:join`, `viewer.kind =
  'mirror'`, projections testées contre les fuites) ; pas de route front (exclu
  du périmètre étape 0–1).
- **Anti-répétition inter-rétros** (§3.5) : interface `TeamHistoryStore` +
  implémentation no-op (stub demandé par le périmètre). L'intra-salon est
  complète (ids `packId#index` dans `usedEntryIds`, re-mélange signalé).
- **Bandeau « contenu recyclé »** : calculé au tirage (lancement de la partie),
  affiché pendant toute la partie, remis à zéro au retour lobby.
- **`game:event`** : le serveur émet les événements ponctuels (revote,
  élimination, guess résolu…) mais l'UI actuelle se contente de `room:state`
  (source de vérité) — ces événements sont les hooks des anims/sons futurs.

## Évolutions demandées après la v1 (manches, tours de parole, bonus)

- **Manches enchaînées** (`manchesCount`, 1–5) : une « partie » d'Undercover peut
  être une série ; entre deux manches, `host:next` déclenche côté serveur un
  nouveau tirage (l'I/O reste hors réducteur), le cumul des points est transmis
  (`carriedPoints`) et l'effectif est re-validé (des joueurs ont pu partir ou
  arriver — les arrivants intègrent la manche suivante, les points suivent le
  `playerId`). Le récap de soirée reçoit UNE entrée par série (cumul) ; un
  abandon en cours de série est tracé « Série écourtée (N manches jouées) » si
  au moins une manche est terminée.
- **« Plusieurs tours de table »** interprété comme : nombre de **passes de
  description avant chaque vote** (`describePasses`, 1–3, même ordre de parole
  répété). L'autre lecture (retarder le premier vote uniquement) est moins
  régulière ; celle-ci s'applique uniformément à chaque cycle d'élimination.
- **Barème révisé** (remplace les points suggérés de la fiche, à la demande) :
  civils vainqueurs 2 pts chacun **+ 1 pt bonus** pour ceux qui ont « bien
  voté » ; undercover vainqueurs 3 pts par infiltré vivant ; Mr. White 4 pts
  sur guess gagnant (le 8 de la fiche écraserait la nouvelle échelle ; 4 = un
  cran au-dessus du max civil de 3, pour la victoire la plus difficile).
- **Définition du « bon vote »** (équité, affinée sur demande) : à CHAQUE
  dépouillement (élimination, égalité, y compris celui qui déclenche un
  re-vote), un civil dont le bulletin visait un infiltré est marqué — **à
  condition que les civils vivants n'aient pas tous voté la même chose**. Une
  convergence unanime ne distingue personne : plébiscite dès le premier tour,
  dernier tour à 2 civils contre 1 undercover, vote groupé contre Mr. White…
  → aucun bonus (la règle s'applique quelle que soit la cible commune, White
  compris ; les blancs comptent comme un choix distinct, donc un civil qui vote
  juste pendant que les autres s'abstiennent est bien marqué ; un civil seul en
  vie est trivialement « unanime » → jamais de marque). Une seule marque par
  manche (bonus plat de +1) ; une marque acquise lors d'un tour divergent reste
  acquise même si les tours suivants sont unanimes. Réservé aux civils, versé
  uniquement si les civils gagnent. Votes blancs et votes contre un civil ne
  marquent jamais. Le suivi (`goodVoterIds`) ne sort JAMAIS du serveur avant la
  phase de fin (test de non-fuite dédié) : en cours de manche, il révélerait à
  la fois des bulletins et des rôles.

## Just One (fiche 5.3 — étape 2)

- **Ressemblance entre indices** : la règle Levenshtein de la fiche (≤ 1 si ≤ 5
  caractères, ≤ 2 sinon) est appliquée par paire avec la tolérance du plus long
  des deux mots, et le regroupement est transitif (« soleil/soleils/solail »
  tombent d'un bloc). Conséquence assumée de la règle : deux mots courts très
  différents mais à 1 lettre d'écart (« mer »/« mur ») s'annulent aussi — c'est
  la fiche. Un indice auto-annulé est **verrouillé** (pas de ré-autorisation
  manuelle) ; les toggles manuels, eux, jouent dans les deux sens, dernier
  gagne, et l'arbitre tranche les litiges en forçant la clôture.
- **Indice ≈ mot mystère** : auto-annulé (règle officielle du jeu, implicite
  dans la fiche — le serveur connaît le mot, autant l'appliquer).
- **Indice modifiable** jusqu'à la clôture de l'écriture (comme les votes
  Undercover) ; clôture anticipée quand tous les donneurs CONNECTÉS ont écrit.
- **Aucun indice à la clôture** : la validation est sautée, devinette directe
  (l'écran du devineur propose explicitement de tenter à l'aveugle ou passer).
- **Arbitrage d'une réponse approximative** : la fiche ne prévoit pas de délai —
  timer de 30 s ajouté ; s'il expire, la réponse est ACCEPTÉE (même esprit de
  tolérance que les fautes de frappe pardonnées).
- **« Réponse en direct » pour les donneurs** (fiche, phase devinette) :
  interprétée comme l'affichage de la proposition à sa soumission, pas la frappe
  en temps réel (hors modèle room:state, gain nul en présentiel).
- **Manche annulée** (devineur absent > 60 s) : elle est consommée (la rotation
  passe au devineur suivant, le total de manches ne bouge pas) — ni point ni
  malus, tracée « ∅ » au récap.
- **Barème de fin** : les paliers de la fiche (calibrés sur 8) sont appliqués en
  proportion du nombre de manches choisi (parfait = 100 %, ≥ 85 % « Incroyable ! »,
  ≥ 60 % « Waouh ! », ≥ 35 % « Pas mal », sinon « On réessaie ? »).
- **Récap de soirée coopératif** : pas de points individuels (liste vide), le
  score d'équipe vit dans le résumé (« Score d'équipe : 6/8 — Waouh ! »).
- **Gel du devineur** : implémenté via pause/reprise des timers serveur
  (nouveaux effets `timer:pause`/`timer:resume`), déclenché par le gateway sur
  déconnexion/reconnexion du devineur.

## Wavelength (fiche 5.2 v3 — étape 3)

- **Phases Tirage + Indice fusionnées** (`clue`) : écrans TV quasi identiques
  dans la fiche, l'indice s'affiche dès sa saisie. Pas de timer sur cette phase
  (la fiche n'en prévoit pas) — un télépathe AFK se gère par l'abandon host ou
  la règle de déconnexion.
- **Télépathe déconnecté avant l'indice** : manche annulée immédiatement
  (fiche : « la cible est compromise »), **rejouée en fin de partie** — le
  télépathe est repoussé en fin de file, UNE seule fois (anti-boucle si la
  déconnexion persiste). Après l'indice : la manche continue (rôle passif).
- **Règles d'indice vérifiées serveur (best-effort)** : chiffres interdits et
  mots des pôles (correspondance normalisée tolérante) refusés à la saisie ;
  traductions/périphrases relèvent de l'invalidation host (`invalidateClue`),
  qui renvoie en saisie d'indice ET efface les curseurs déjà posés (ils
  répondaient à un indice invalide). La cible ne change pas (fiche).
- **Moyenne du télépathe** : arrondie, calculée sur les joueurs AYANT placé —
  un déconnecté (0 pt pour lui) ne pénalise pas la note d'indice ; personne n'a
  placé → 0.
- **Clôture anticipée** du placement quand tous les placeurs CONNECTÉS ont
  placé (cohérent avec Just One) ; sinon timeout 45 s.
- **Roadmap §8 « curseurs temps réel, dial miroir »** : caduque depuis la v3
  (placements individuels secrets) — seul le compteur « X/Y ont placé » est
  temps réel. La fiche v3 fait foi.
- **< 3 joueurs actifs** : bandeau TV (notice), sans gel dur des timers.

## Ito (fiche 5.5 — étape 4)

- **Phases Découverte + Expression fusionnées** (`play`) : « Je pose » est
  disponible d'emblée, protégé par une **double confirmation** (interprétation
  du « tap long / double-tap » anti-mispose de la fiche). Le « Changer de
  thème » host reste verrouillé par la première pose, comme exigé.
- **Tirage à écart garanti** : n valeurs distinctes tirées dans
  1..(max − (n−1)(écart−1)) puis étalées — écart pair-à-pair ≥ g garanti,
  réduit automatiquement au maximum faisable (bandeau « écart réduit à N »),
  suggestion de repasser en 1–100 sous 4.
- **Poses sérialisées** : l'event-loop du serveur ordonne les poses ; chacune
  est évaluée dans l'état résultant de la précédente. Une carte défaussée par
  l'erreur d'un autre rend toute pose ultérieure de son détenteur illégale
  (message clair), pas de crash.
- **Vies plancher à 0** : la partie continue jusqu'au bout (résultat défaite).
- **« Libérer la carte »** branché sur le contrôle catalogue `removeFromRound`
  (même geste host qu'Undercover, libellé UI dédié, sans coût de vie).
- **Verdict générique** par ratio de vies (fiche calibrée sur 3) : 100 % =
  « Télépathes ! », ≥ 50 % = « Accordés », > 0 = « Ric-rac », 0 =
  « Désaccordés » (défaite).
- **Pas de timers** : phases orales, poses pilotées par les joueurs, host en
  arbitre du rythme.

## Spyfall (fiche 5.4 v3 — étape 5)

- **Coup de l'espion en deux temps** : « Je me révèle » (fige le jeu, identité
  publique, TV « L'espion se révèle ! ») puis le choix dans la grille — avec un
  timer de 45 s ajouté (absent de la fiche) : s'il expire, le choix est réputé
  raté (l'équipe gagne) pour ne pas bloquer la partie.
- **Espion déconnecté** : gel de la manche (timers en pause, bandeau) pendant
  60 s avant l'annulation « aucune valeur » — la fiche dit directement
  « > 60 s : annulée », le gel matérialise l'attente.
- **Unanimité d'accusation** : calculée sur les votants CONNECTÉS hors accusé
  (fiche) ; un timeout avec des votes manquants vaut non-unanimité (le timer
  reprend). L'accusation est consommée dès son ouverture, y compris si le vote
  échoue (fiche) — mais une accusation REFUSÉE par sérialisation (une autre en
  cours) n'est pas consommée.
- **Thème choisi par l'animateur** (paramètre évoqué par la fiche) : non
  implémenté à cette étape — tirage aléatoire uniquement (le changement de
  thème host viendra avec la page /admin s'il manque vraiment).
- **Multi-manches (1–3)** : cumul des points au fil des manches, nouvel
  espion/carte/thème à chaque fois, accusations remises à zéro.

## Taboo (fiche 5.6 — étape 6)

- **Deck injecté à l'init** : toutes les cartes du mode (union dédupliquée),
  mélangées par le RNG du salon — aucun tirage en cours de partie (pureté du
  réducteur). L'anti-répétition PAR ÉLÉMENT ne s'applique pas à Taboo (une
  partie consomme des dizaines de cartes) ; le re-mélange en cours de passage
  ne reprend que les cartes des passages PRÉCÉDENTS (fiche), y compris au
  lancement d'un passage si le deck est vide.
- **Sérialisation buzz ↔ trouvé** : chaque action cite le numéro de la carte
  courante (`cardSeq`) ; un numéro périmé est refusé avec un message (« le
  premier événement reçu fait foi », fiche).
- **Annulation de buzz** : deux variantes host — « annuler » (rend le −1) et
  « annuler + compter trouvé » (rend le −1 et restitue le +1, cas du trouvé
  quasi simultané) ; possible tant que le buzz est le dernier événement du
  passage (live ou récap).
- **Composition des binômes** : éditeur simple (une équipe par joueur +
  pré-remplissage par paires) plutôt que le drag & drop de la fiche ; des
  binômes invalides retombent en composition aléatoire avec avertissement.
  Trio tournant si effectif impair (fiche).
- **Passage annulé** (orateur/devineur absent > 30 s) : score ignoré, rejoué en
  fin de rotation avec de nouvelles cartes — UNE seule fois par passage
  (anti-boucle si la déconnexion persiste).
- **Mort subite** : une seule série (nouvelle égalité → victoire partagée,
  fiche) ; l'orateur y est le membre au plus faible total de « trouvés » en
  tant qu'orateur ; ses points s'ajoutent au cumul (comparaison équivalente
  entre ex æquo).

## Page /admin (§4.3 — étape 7)

- **Mot de passe** : le §4.3 dit « variable d'environnement », le §4.4 le place
  dans `config.json` — les deux sont supportés, `ADMIN_PASSWORD` prime.
  Comparaison à temps constant (hachages), jetons opaques en mémoire (12 h) —
  cohérent avec l'état éphémère du serveur.
- **Activation/désactivation** persistée dans `data/packs-disabled.json`
  (à côté de `data/packs/`, gitignoré) ; les packs inactifs sortent des
  tirages, des modes disponibles et des grilles/decks.
- **Upload** : un id de pack `data` existant est REMPLACÉ (flux de mise à
  jour) ; un id de pack builtin est protégé (message explicite). L'id validé
  (`^[a-z0-9][a-z0-9-]*$`) sert de nom de fichier — aucun chemin utilisateur.
- **Suppression** : packs à chaud uniquement ; un builtin se désactive.
- **Templates** : endpoint public (`/api/packs/template/<jeu>`) — un squelette
  ne porte aucun secret, et un lien direct est plus simple qu'un blob authentifié.
  Chaque template est lui-même un pack valide (testé).
- **Salons ouverts** : les modes disponibles se rafraîchissent au prochain
  événement du salon (pas de push global sur changement de packs) — négligeable
  en pratique, l'admin s'utilise entre deux parties.

## Paramétrage et configuration

- **Défauts adaptatifs** : tant que le host ne touche à rien, la répartition des
  rôles suit l'effectif (tableau de la fiche, y compris White auto dès 5). Dès
  qu'il modifie un champ du panneau, les valeurs affichées deviennent des
  surcharges épinglées (envoyées ensemble) — comportement prévisible, au prix de
  l'adaptativité.
- **`config.json`** : optionnel, fusionné par-dessus les défauts de
  `config.example.json` ; `adminPassword` présent mais inutilisé avant l'étape 7
  (`/admin`).
- **Seed RNG** : `room:create { seed }` (exposée par `/?seed=N` sur la home),
  acceptée si `NODE_ENV !== 'production'` ou `ALLOW_TEST_SEED=1`. Toutes les
  décisions aléatoires d'un salon (mot des civils, rôles, ordres de parole,
  tirages de contenu) consomment ce RNG → parties reproductibles.
- **E2E** : serveur de test sur le port 3100 (pas de collision avec `npm run
  dev`) ; la cible du vote est déduite par la règle du mot minoritaire plutôt
  que codée en dur — le test reste vrai même si la seed change les rôles.
