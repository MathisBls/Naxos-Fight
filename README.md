# Naxos Fight

Jeu de combat 2D en pixel art, jouable dans le navigateur (JS vanilla + canvas, sans moteur).

## Lancer
- `python tools/serve.py 8790` à la racine (ou `python -m http.server 8790`, sans le relais en ligne), puis http://localhost:8790.
- Écran titre → sélection du combattant → Entrée ou Espace → entraînement dans le vide.

## Commandes en combat
- Joueur 1 : `ZQSD` (`WASD` en QWERTY) pour bouger, sauter et s'accroupir ; `F` / `G` poing rapide / fort ; `V` / `B` pied rapide / fort.
- Joueur 2 : flèches ; `I` / `O` poing rapide / fort ; `K` / `L` pied rapide / fort (ou pavé numérique 4 5 1 2).
- Reculer : parade (accroupi pour les coups bas, debout pour les coups sautés). `BAS` + pied : balayette. Poing ou pied en l'air : coups sautés.
- Un coup qui touche peut être annulé dans un autre coup ou un saut.
- `Tab` : joueur 2 humain ou ordinateur (debout, accroupi, parade, attaque). `1 2 3 4` : tests touché, au sol, victoire, K.O.
- `H` : liste des touches, `Échap` : retour.

## En ligne (chacun sur son PC)
- L'hôte appuie sur `N` dans le combat : un code à 4 caractères s'affiche et le lien est copié.
- L'adversaire appuie sur `R` et tape le code (ou ouvre le lien) : il joue le perso de droite avec ses touches habituelles.
- Lancer le jeu avec `python tools/serve.py 8790` (au lieu de `http.server`) : il sert les fichiers et relaie la partie par WebSocket sur la même adresse, donc ça passe par un tunnel `ngrok http 8790` et par les réseaux d'entreprise.
- L'adversaire ouvre la même adresse (tunnel ngrok, ou `http://<IP de l'hôte>:8790` sur le même réseau).
- L'hôte fait tourner le combat, l'invité envoie ses touches. Garder la fenêtre de l'hôte au premier plan.
- Servi par un simple `http.server`, le jeu se rabat sur PeerJS (WebRTC, serveur public de mise en relation), souvent bloqué en entreprise.

## Fichiers
- `src/main.js` : canvas plein écran à échelle entière, entrées, transitions, chargement.
- `src/title.js`, `src/select.js`, `src/stage.js` : écran titre, sélection, combat.
- `src/sprites.js` : lecture des planches PixelLab (PNG + JSON) et mesure des images.
- `src/net.js` : connexion en ligne (code de partie, relais WebSocket de `tools/serve.py`, PeerJS en secours).
- `src/draw.js` : texte pixel, cadres, barres, couleurs. `src/i18n.js` : textes FR / EN.
- `assets/<perso>/` : portrait, vignette, planche de sprites. `assets/logo.png` : logo de l'écran titre.
- `tools/` : scripts Python (environnement dans `tools/.venv`) pour préparer portraits et sprites ; `tools/build_sheet.py` importe et recale les animations PixelLab.
- `.claude/skills/pixel-art/SKILL.md` : pipeline graphique et règles de style.
