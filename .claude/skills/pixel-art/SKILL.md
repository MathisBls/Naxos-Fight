---
name: pixel-art
description: Pipeline and style rules for Naxos Fight pixel art. Use whenever creating or importing a fighter, a portrait, an animation, a logo or any screen of the game, or when touching src/sprites.js, src/draw.js, assets/ or tools/.
---

# Pixel art de Naxos Fight

Style visé : jeu de combat d'arcade 16 bits, gros pixels nets, palette limitée, contour noir d'un pixel, ombrage par aplats. Pas de néon, pas de lueur, pas de flou.

## Pipeline d'un combattant

1. **Look de référence (ChatGPT / GPT Image)** : photo de la personne + prompt « personnage de jeu de combat en pixel art 16 bits, de face, en garde, fond uni ».
   - Fond uni d'une couleur **absente des vêtements** (vert vif plutôt que bleu si la tenue est bleue), sinon le détourage laisse des points.
   - Demander le portrait en gros plan et le perso en pied dans deux cases séparées.
2. **Sprite et animations (PixelLab, pixellab.ai)** :
   - Characters → Create Character → **Create from Reference**, Humanoid, mode v3, **Camera View : Sidescroller**.
   - Mettre l'image de face dans la case **South** (seule obligatoire). Description en anglais, précise sur les couleurs et la tenue.
   - Animations : **Free motion → PixMiniMax** (1 génération par direction). Générer **uniquement la direction East** : l'autre côté se fait par miroir dans le jeu.
   - Le mode Template « Skeleton v3 » échoue sur un perso créé depuis une référence (pas de squelette 3D). Pour une animation absente de Free motion, passer par « Describe your own ».
   - Compte gratuit : une seule génération à la fois, les lancer l'une après l'autre.
   - Export : **Export → Spritesheet (PNG + JSON)**. Ligne 0 = 8 rotations, une ligne par animation, cases de taille fixe (132 × 132 pour un perso 64 × 96).
3. **Import dans le jeu** :
   - Copier le PNG et le JSON dans `assets/<id>/sheet.png` et `assets/<id>/sheet.json`.
   - Déclarer le perso dans `src/roster.js` et ses textes dans `src/i18n.js` (FR et EN).
   - Si PixelLab nomme l'animation autrement, ajouter la correspondance dans `ANIMATION_KEYS` (`src/roster.js`).
   - `loadSheet` (`src/sprites.js`) mesure chaque image (haut, bas, point le plus en avant) : les pieds sont alignés sur la ligne de base de la vue East, et les étincelles partent du point le plus en avant de l'image active.
4. **Portrait et vignette** : `tools/.venv/Scripts/python tools/build_game_assets.py source/<image>`.
   - Le script recale l'image sur sa vraie grille de gros pixels (`GRID`, souvent 10 px chez ChatGPT) au lieu de la redimensionner, sinon les traits du visage disparaissent.

## Règles de rendu

- Canvas interne à basse résolution, agrandi d'un **facteur entier** (hauteur visée 240, largeur mini 400), `imageSmoothingEnabled = false`, CSS `image-rendering: pixelated`.
- **Plein écran, sans bandes noires** : la taille interne s'adapte à la fenêtre.
- Coordonnées toujours arrondies à l'entier avant de dessiner.
- Police **Press Start 2P**, en majuscules. Elle n'a ni majuscules accentuées ni flèches : passer par `text()` / `measure()` de `src/draw.js`, qui retirent les accents. Écrire `< >`, `HAUT`, `BAS` au lieu des flèches.
- Effets en pixels pleins : étincelles, poussière, anneau d'impact, tremblement de 2 à 4 px. Pas de flou ni de dégradé lumineux sur les persos.
- Couleurs de l'interface : utiliser `COLORS` dans `src/draw.js`, pas de couleur en dur ailleurs.

## Vérification

- Lancer le serveur `naxos-fight` (python http.server sur le port 8790) et ouvrir http://localhost:8790.
- Vérifier : écran titre → sélection (portrait, stats, preview qui tourne) → Entrée → combat (marche, saut, accroupi, poing, pied, étincelles au bon endroit).
