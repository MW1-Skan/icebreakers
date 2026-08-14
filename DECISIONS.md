# DECISIONS — écarts et interprétations par rapport au PRD

Ce fichier liste chaque écart, interprétation ou choix fait là où le PRD est ambigu
(règle du prompt de build : « choisis l'option la plus simple, note-la, continue »).

## Repo et outillage

- **`.gitignore` du premier commit** : le commit initial du repo ignorait `*.md` en bloc,
  ce qui couvrait bien `PRD*.md` mais aurait aussi exclu `README.md` et `DECISIONS.md`.
  Remplacé dès le 2e commit (avant tout code et avant l'existence de `data/` ou
  `config.json`) par la liste explicite du §4.5 : `data/`, `config.json`, `PRD*.md`.
- **npm workspaces** plutôt que Nx : le PRD propose les deux, le prompt demande « au plus
  simple ». Trois workspaces : `libs/shared`, `apps/server`, `apps/web`.
- **Nom générique** : le site s'appelle « Icebreakers » par défaut (`config.example.json`) ;
  aucune référence au nom de code du PRD ni à quoi que ce soit d'interne.

*(sections suivantes complétées au fil du build)*
