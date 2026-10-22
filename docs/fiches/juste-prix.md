# Fiche — Le Juste Prix 🏷️ (8e jeu)

> **Statut : validée et implémentée (22/10).** Images par URL, barème au
> classement, option « sans dépasser », finale reportée. Reste ouvert : le
> pack intégré (§15). Les écarts d'implémentation sont dans `DECISIONS.md`. Une fois validée, cette
> fiche est la spec de référence du jeu (comme la fiche Codenames, hors PRD) ;
> les écarts d'implémentation iront dans `DECISIONS.md`.

## 1. Concept

Un vrai article, trouvé sur internet, s'affiche en grand sur la TV : photo,
nom, un détail ou deux. Chacun estime son prix **en secret** sur son écran.
Puis le juste prix tombe : toutes les estimations apparaissent d'un coup sur
une frise autour du vrai prix, et les trois plus proches marquent. N articles,
puis classement final.

Pourquoi ça marche en icebreaker : aucun prérequis, tout le monde a un avis
sur un prix, et la révélation déclenche les réactions (« 900 € pour ÇA ?! »).

## 2. Fiche

| | |
|---|---|
| Joueurs | 3–10 actifs (animateur exclu, comme les autres jeux) |
| Durée | ~8–10 min pour 6 articles (≈ 45 s d'estimation + 30–45 s de révélation par article) |
| Type | Estimation, score individuel |
| Identité | 🏷️, couleur signature or (`--game-justeprix: #ffc145`), id technique `justeprix` |

Description de la carte du lobby :

> Un article bien réel s'affiche à l'écran : combien coûte-t-il ? Chacun mise
> son estimation en secret, puis le juste prix tombe. Les trois estimations
> les plus proches marquent 3, 2 et 1 points !

## 3. Déroulé

### Lancement

Tirage de **N articles distincts** dans l'union des packs cochés (uniforme par
entrée, préférence aux articles jamais joués dans le salon, recyclage signalé
♻️ sinon). Un même article ne revient **jamais** deux fois dans une partie :
blocker au lobby si l'union des packs cochés compte moins de N articles.

### Phase `guess` — Estimation (chrono, défaut 45 s)

- **TV** : photo en grand, nom, détails, « Article 3/6 », chrono, rangée des
  joueurs avec ✓ quand ils ont misé (« 4/6 ont misé ») — jamais les montants.
- **Joueur** : la même photo (plus petite), nom, détails ; champ « Ton
  estimation » en € (tolère `1 299,90`, `1299.9`, `1299`), aperçu formaté,
  bouton « Miser ». Modifiable jusqu'à la clôture (« ✓ 1 299,90 € — tu peux
  changer d'avis jusqu'à la fin du chrono »).
- **Clôture** anticipée quand tous les joueurs CONNECTÉS ont misé, sinon au
  timeout. Pas de mise = « — », non classé, 0 pt.
- Parler à voix haute est libre (et encouragé) : on débat, mais chacun mise seul.

### Phase `reveal` — Le juste prix

- **TV** : le prix tombe en grand (« 349,90 € ») ; frise linéaire de 0 à 2× le
  prix, avatars posés à leur estimation (au-delà de 2× : épinglés au bord,
  valeur affichée), 🥇🥈🥉 sur les trois plus proches ; classement de
  l'article (estimation, écart signé « +12 % » pour info, points) ; 🎯 « LE
  JUSTE PRIX ! » si quelqu'un est à ≤ 1 % ; provenance « Relevé sur
  exemple.fr · oct. 2026 » ; cumul de la partie.
- **Joueur** : « Tu as dit 280 € · Juste prix : 349,90 € · −20 % → 2e, +2 pts »,
  son cumul.
- **Host** : « Article suivant » (`host:next`) ; après le dernier, fin de partie.

### Phase `end`

- Podium (composant de fin existant) + récap des articles : vignette, nom,
  prix, meilleure estimation (qui, combien, écart).
- Récap de soirée : « En tête : Alice (14 pts) » + points individuels.
  Égalité en tête = victoire partagée.

## 4. Barème — classement de l'article

On classe les mises par écart au prix `|estimation − prix|` (pour un article
donné, c'est le même ordre que l'écart relatif).

| Rang | Points |
|---|---|
| 1er | 3 |
| 2e | 2 |
| 3e | 1 |
| suivants, et sans mise | 0 |

- **Ex æquo** (même écart, ex. 190 € et 210 € pour 200 €) : même rang, mêmes
  points ; le rang suivant est sauté (classement « 1, 1, 3 »).
- Max 3 pts par article, donc 18 pts sur une partie de 6.
- 🎯 « Le juste prix ! » (écart ≤ 1 %) : célébration à l'écran, sans point
  supplémentaire.
- Point d'attention assumé : à 8–10 joueurs, la majorité ne marque pas sur un
  article donné ; le cumul sur 6 articles lisse. À revoir après les premières
  parties si ça frustre.
- **Option « Sans dépasser »** (règle TV, désactivée par défaut) : toute mise
  au-dessus du prix vaut 0 (« 💥 Dépassé ») ; le classement ne porte que sur
  les mises inférieures ou égales au prix ; si tout le monde dépasse,
  personne ne marque.

Exemple — prix 200 € :

| Joueur | Estimation | Écart | Points | Avec « sans dépasser » |
|---|---|---|---|---|
| A | 190 € | −5 % | 1er → **3** | 1er → **3** |
| B | 260 € | +30 % | 2e → **2** | 💥 0 |
| C | 120 € | −40 % | 3e → **1** | 2e → **2** |
| D | 500 € | +150 % | **0** | 💥 0 |

## 5. Paramètres (modale du lobby)

| Réglage | Défaut | Plage |
|---|---|---|
| Articles (= manches) | 6 | 1–15 |
| Chrono d'estimation | 45 s | 15–120 s |
| Sans dépasser | non | oui / non |
| Packs | tous les packs actifs cochés | ≥ 1 |

Blockers : effectif hors 3–10, aucun pack coché, moins d'articles distincts
que N dans les packs cochés.

## 6. Contrôles animateur

- **Génériques inchangés** : pause / reprise / +30 s du chrono, abandon
  (retour lobby), kick au lobby.
- **« 🎲 Changer d'article »** pendant l'estimation — réutilise le contrôle
  `changeTheme` (précédent Ito) : nouvel article tiré (jamais joué dans la
  partie), mises effacées, chrono relancé. Cas d'usage : « je l'ai chez
  moi ! », image cassée, article qui ne passe pas. Refusé avec un message s'il
  ne reste aucun article frais.
- `host:next` uniquement depuis la révélation (pas pendant l'estimation :
  le chrono ou la clôture anticipée tranchent, comme pour les votes).

## 7. Cas limites

- **Déconnexion pendant l'estimation** : le joueur ne bloque pas la clôture
  anticipée ; s'il revient avant la clôture il peut miser, sinon 0 pt sur
  l'article. Pas de gel : aucun rôle central dans ce jeu.
- **Retardataire** : spectateur, joue la prochaine (règle du salon).
- **Joueur connecté mais AFK** : pas de retrait (le chrono borne l'attente) ;
  un joueur qui se DÉCONNECTE n'est plus attendu, la clôture anticipée est
  réévaluée aussitôt.
- **< 3 joueurs connectés** : bandeau, pas de gel (comme Wavelength).
- **Abandon** : retour au lobby ; si au moins un article a été révélé, la
  partie entre au récap (« partie écourtée, 3/6 articles »).
- **Animateur déconnecté** : pause auto (socle).
- **Pack modifié ou désactivé en cours de partie** : sans effet, les articles
  sont tirés au lancement.
- **Image qui ne charge pas** (lien mort, hotlink refusé) : le nom + « image
  indisponible » s'affichent ; l'animateur peut changer d'article.
- **Saisie** : nombre ≥ 0 et ≤ 1 000 000 000, arrondi au centime.

## 8. Contenu : format des packs

### Entrée de pack (annexe A.9)

```json
{
  "name": "Échiquier en marbre et laiton",
  "details": "40 × 40 cm, pièces lestées",
  "price": 349.9,
  "image": "https://cdn.exemple.fr/produits/7f3a9c.jpg",
  "source": "https://www.exemple.fr/echiquier-marbre",
  "seenAt": "2026-10",
  "credit": "Photo : Jane Doe, CC BY-SA 4.0"
}
```

| Champ | Règle | Visible |
|---|---|---|
| `name` | texte 1–80 | dès l'estimation |
| `details` | optionnel, texte 1–80 | dès l'estimation |
| `price` | nombre > 0, ≤ 1 000 000 000, 2 décimales max — prix public TTC en euros, hors livraison | 🔒 à la révélation |
| `image` | URL **https** (≤ 2 000 caractères) de la photo | dès l'estimation |
| `source` | optionnel, URL http(s) de la page produit | 🔒 à la révélation (nom de domaine seulement) |
| `seenAt` | optionnel, `AAAA-MM` ou `AAAA-MM-JJ` (date du relevé) | à la révélation |
| `credit` | optionnel, texte 1–80 (photo sous licence libre à créditer) | à la révélation |

- Doublons refusés : même nom (normalisé) ou même URL d'image.
- Euros uniquement en v1 (le curateur convertit).

### Images : liens directs (hotlink) — choix assumé

Le champ `image` est une URL vers la photo, chargée directement par les
navigateurs (TV et joueurs). **Rien n'est stocké sur le serveur.**

Pourquoi :

- rien à stocker ni à gérer côté serveur : ni upload, ni validation de
  fichiers, ni nettoyage ;
- aucune photo de marchand copiée dans le dépôt Git : le pack intégré n'en
  contient que les liens ;
- l'espace disque, lui, n'aurait pas été un vrai frein : 30 photos
  redimensionnées pèsent ~5 Mo.

Ce que ça coûte, et les parades :

| Risque | Parade |
|---|---|
| Liens morts (produit retiré, CDN réorganisé) | `source` conservée pour retrouver une image ; bouton admin « Vérifier les images » ; « Changer d'article » en partie ; repli « image indisponible » |
| Hotlink refusé par certains sites | URLs testées à la curation ; sinon, une autre photo du même produit chez un autre revendeur |
| Requêtes vers des tiers : le CDN voit l'IP de chaque écran | `referrerpolicy="no-referrer"` (le CDN ne sait pas d'où vient la requête) ; exception assumée au principe « aucune requête vers un tiers », tracée dans `DECISIONS.md` |
| L'URL peut contenir le nom du produit (inspecteur du navigateur) | Accepté : même niveau de triche qu'une recherche d'image inversée sur la TV |
| Contenu mixte (`http://` sur une page https) | Schéma : https uniquement |

Porte de sortie si les liens morts deviennent pénibles : un bouton « Figer
les images » (téléchargement dans `data/`, quelques Mo) — hors v1.

## 9. Pack intégré : une trentaine d'articles choisis

Objectif : des articles dont le prix trompe l'intuition. Règles de sélection :

1. **Trois familles de pièges, à parts à peu près égales** :
   - *l'air de rien, prix fou* — un objet banal dont le prix choque ;
   - *l'air luxueux, prix doux* — un objet impressionnant ou technique,
     étonnamment bon marché ;
   - *aucun repère* — matériel pro, institutionnel ou de niche dont personne
     ne connaît le prix.

   L'équilibre empêche toute stratégie constante (« toujours viser haut »).
2. **Prix étalés sur 5 à 6 ordres de grandeur** (≈ 1 € → 100 000 €), à peu
   près uniformément en échelle log : pas d'ancrage du type « c'est toujours
   entre 50 et 500 € ».
3. **Variété** : luxe, maison, matériel pro, santé (clin d'œil au métier de
   l'équipe), gastronomie, nature et curiosités, tech, jouets, papeterie, et
   quelques articles d'échecs. Deux articles maximum par marque.
4. **Pas de prix « connus »** : ni produits stars (iPhone, PS5), ni prix
   devenus des mèmes, ni prix lisible dans le nom ou sur la photo.
5. **Prix vérifiables** : prix public TTC (hors livraison) affiché à prix fixe
   sur le site d'une marque ou d'un marchand, de préférence en euros sur un
   site français ou européen ; ni enchères, ni « prix sur demande », ni
   occasion à l'unité. Chaque article garde sa `source` et sa date de relevé.
6. **Image exploitable** : URL https directe, testée sans Referer, produit
   bien visible, sans prix ni texte incrusté.
7. **Grand public et OK au travail** : ni alcool, ni tabac, ni armes, ni
   contenu sexuel ou politique, ni animaux vivants. La quantité ou le poids
   figure dans `details` quand c'est indispensable pour estimer.

Fichier : `packs/builtin/justeprix-normal-01.json`, créé une fois les prix
vérifiés et les images choisies. La shortlist en cours vit dans
`docs/fiches/juste-prix-candidats.md` (⚠️ elle contient les prix).

## 10. Administration (`/admin`)

- **Éditeur Juste Prix** : par article, nom, détails, prix (€), URL de
  l'image avec aperçu immédiat, source, date du relevé, crédit.
- **Geste** : sur le site marchand, clic droit sur la photo → « Copier
  l'adresse de l'image » → coller dans le champ.
- **« Vérifier les images »** : l'admin charge chaque image dans son
  navigateur et liste celles qui échouent. Aucun appel sortant du serveur
  (donc pas de risque SSRF).
- **Sauvegarde** : flux existant (validation Zod, rapport lisible).
- **Template** téléchargeable : une entrée d'exemple (le template reste un
  pack valide, comme pour les autres jeux).

## 11. Confidentialité (non-fuite)

Secrets : **prix et source** de l'article courant (avant la révélation),
**mises des autres** (avant la révélation), **articles suivants** (jamais
projetés : ni nom, ni image, ni prix).

- Joueur : voit sa propre mise. TV / miroir : nombre de mises + ✓, jamais les
  montants.
- Tests bloquants `project-justeprix.spec.ts` : chaque projection (phase ×
  audience) est sérialisée et ne doit contenir ni le prix (fixture au prix
  improbable, ex. 1 234,56 €, sous toutes ses formes), ni la source, ni les
  mises d'autrui, ni les articles suivants.
- **Accepté** : l'URL de l'image est forcément visible (et peut nommer le
  produit) ; une recherche d'image inversée reste possible — c'est de la
  triche de soirée, pas une fuite du serveur. De même, l'auteur d'un pack
  connaît ses prix : il joue hors concours, ou les packs se préparent à
  plusieurs.

## 12. Technique (résumé)

- `GameId` + `'justeprix'` ; `libs/shared/src/justeprix/{types,view}.ts` ;
  moteur `apps/server/src/games/justeprix/` (réducteur pur + projections), sur
  le patron de Wavelength.
- Articles tirés au lancement et injectés à l'init (comme le deck Taboo ou la
  grille Codenames) : aucune I/O dans le réducteur. « Changer d'article » tire
  côté service et injecte l'article via l'action.
- Action joueur `estimate { amount }` (Zod : nombre fini, 0 à 1e9), arrondie
  au centime côté serveur. Phases `guess` → `reveal` → … → `end`, timer `guess`.
- Schéma de pack A.9 dans `libs/shared/src/packs.ts` ;
  `drawJustePrixItems(n, packIds, used, rng)` dans `PacksService` (articles
  distincts, préférence aux jamais joués).
- Front : `<img referrerpolicy="no-referrer">` avec repli ;
  `justeprix-host.component`, `justeprix-player.component`, frise
  `price-scale.component` ; carte et modale du lobby ; grille du lobby en 4×2
  sur grand écran (8 jeux), 2 colonnes sous 640 px.

## 13. Tests (DoD)

- **Moteur** : classement et points (ex æquo « 1, 1, 3 », mises absentes),
  « sans dépasser » (dont « tout le monde dépasse »), clôture anticipée sur
  les connectés, timeout avec mises manquantes, changement d'article, fin et
  récap.
- **Packs** : schéma (prix, décimales, https obligatoire, doublons nom/image,
  `seenAt`), template valide, pack intégré valide.
- **Non-fuite** : `project-justeprix.spec.ts` (bloquant).
- **E2E** : partie complète 1 animateur + 3 joueurs (seed). Le test ne dépend
  pas du chargement réel des images (pas de réseau en CI) : il vérifie le
  `src` et le repli.

## 14. Hors périmètre v1 (pistes)

- Manche finale « C'est plus ! C'est moins ! ».
- Mode « Mon article » : chaque joueur apporte un objet perso (photo + prix).
- Import depuis l'URL d'une page produit (og:image + JSON-LD `Product`) —
  fragile selon les sites, et demande un durcissement SSRF côté serveur.
- Import assisté par IA (ex. Gemini) : une capture d'écran de fiche produit →
  nom, prix et photo pré-remplis ; marche sur n'importe quel site, sans
  scraping.
- « Figer les images » (cache local) ; devises autres que l'euro.

## 15. Décisions et points ouverts

Tranché le 22/10 :

- **Images** : URLs directes (hotlink), rien de stocké sur le serveur (§8).
- **Barème** : classement de l'article, 3/2/1 (§4).
- **Finale « C'est plus ! C'est moins ! »** : plus tard (§14).
- **Pack intégré** : oui, une trentaine d'articles choisis selon §9.
- **Option « Sans dépasser »** : gardée en réglage, désactivée par défaut (§4).
- **Import depuis l'URL d'une page produit** : piste v2 ; en v1, l'admin
  colle l'URL de l'image (§10, §14).

Encore ouvert :

1. **Pack intégré** : la vérification des prix sur les pages produits et le
   choix des URLs d'images demandent un accès réseau que l'environnement de
   développement actuel bloque.
