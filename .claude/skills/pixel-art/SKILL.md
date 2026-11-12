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
2. **Sprite (PixelLab, pixellab.ai)** :
   - Characters → Create Character → **Create from Reference**, Humanoid, mode v3, **Camera View : Sidescroller**.
   - Mettre l'image de face dans la case **South** (seule obligatoire). Description en anglais, précise sur les couleurs et la tenue.
3. **Animations, par le MCP PixelLab** (serveur `pixellab`, doc : https://api.pixellab.ai/mcp/docs ; `search_help(tool="animate_character")` donne la référence complète, gratuitement) :
   - Commencer par `get_balance` (générations restantes) et `get_character` (animations existantes, URL de chaque image).
   - `animate_character` avec `mode="pixminimax"`, `directions=["east"]`, `keep_first_frame=false`, 4 ou 8 images : **1 génération** par animation pour un perso 64 × 96. Uniquement East, le jeu fait le miroir.
   - `action_description` : le mouvement seul, en anglais. Commencer par « side view facing right » si le perso risque de se retourner (le premier uppercut est parti de dos).
   - **Cohérence des poses** : `custom_start_frame_url` = l'URL d'une image existante (renvoyée par `get_character`). Variantes accroupies depuis la dernière image de « Crouch », coups sautés depuis une image en l'air de « Jump », relevé depuis la dernière image de « Knockdown ».
   - Pour qu'il revienne à une pose (accroupi qui ne se relève pas, relevé qui finit en garde) : `end_frame_url` de la même taille que l'image de départ (une image d'animation 132 × 132, pas la rotation 64 × 96).
   - Les templates (`taking-punch`…) et Skeleton v3 échouent sur un perso créé depuis une référence : rester en pixminimax.
   - Une seule génération à la fois : `wait_for_jobs` puis `pixelart_workbench(argv=["inspect", "character:<id>:east:<Nom>"])` pour voir les images sans rien télécharger. Raté : `delete_animation` (par `animation_group_id`) puis relancer sous le même nom.
   - Le ZIP de téléchargement répond 423 tant qu'une génération tourne.
4. **Import dans le jeu** : `tools/.venv/Scripts/python tools/build_sheet.py <uuid PixelLab> [id du perso]`.
   - Télécharge le ZIP du perso, garde les animations East listées dans `ANCHORS` et écrit `assets/<id>/sheet.png` + `sheet.json` (ligne 0 = rotations, une ligne par animation, cases carrées à la taille de la plus grande image).
   - Recale chaque image : pieds sur la ligne de base, torse (marche, garde) ou talon arrière (coups) sur la même colonne que la vue East, tête alignée pour les images en l'air. Sans ça, PixelLab fait glisser le perso de 30 px dans sa case.
   - Retire les amas de pixels détachés du corps (traînées, croissants d'effet).
   - Nouvelle animation : l'ajouter à `ANCHORS` (script) et à `ANIMATION_KEYS` (`src/roster.js`), qui fait le lien nom PixelLab → clé `ANIMATION` utilisée par `src/stage.js`.
   - Déclarer le perso dans `src/roster.js` et ses textes dans `src/i18n.js` (FR et EN).
   - `loadSheet` (`src/sprites.js`) mesure chaque image (haut, bas, point le plus en avant) : la portée d'un coup et le point d'impact viennent de l'image la plus en avant de l'animation.
5. **Portrait** : `tools/.venv/Scripts/python tools/build_game_assets.py source/<image>`. La vignette de la grille de sélection n'est pas un fichier : `drawBust` (`src/sprites.js`) affiche le buste de la vue South à taille réelle, sans jamais l'étirer.
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
- Vérifier : écran titre → sélection (portrait, stats, preview qui tourne) → Entrée → combat contre le partenaire (marche sans glisser, saut, accroupi, coups rapides et forts, variantes accroupies et sautées, parade, touché, chute et relevé, K.O. et victoire). Les étincelles n'apparaissent que quand un coup touche.
