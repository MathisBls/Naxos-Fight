# Naxos Fight

Jeu de combat 2D en pixel art, jouable dans le navigateur (JS vanilla + canvas, sans moteur).

## Lancer
- `python -m http.server 8790` à la racine, puis http://localhost:8790.
- Écran titre → sélection du combattant → Entrée ou Espace → entraînement dans le vide.

## Commandes en combat
- `< >` (flèches ou Q/D) : bouger, `HAUT` (flèche ou Z) : sauter, `BAS` (flèche ou S) : s'accroupir.
- `J` ou `Espace` : poing, `K` : pied, `Échap` : retour.

## Fichiers
- `src/main.js` : canvas plein écran à échelle entière, entrées, transitions, chargement.
- `src/title.js`, `src/select.js`, `src/stage.js` : écran titre, sélection, combat.
- `src/sprites.js` : lecture des planches PixelLab (PNG + JSON) et mesure des images.
- `src/draw.js` : texte pixel, cadres, barres, couleurs. `src/i18n.js` : textes FR / EN.
- `assets/<perso>/` : portrait, vignette, planche de sprites. `assets/logo.png` : logo de l'écran titre.
- `tools/` : scripts Python (environnement dans `tools/.venv`) pour préparer portraits et sprites.
- `.claude/skills/pixel-art/SKILL.md` : pipeline graphique et règles de style.
