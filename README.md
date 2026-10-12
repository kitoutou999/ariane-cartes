# Cartes Ariane

Site de partage des plans de carrières souterraines relevés avec l'application Ariane (export SVG), affichés comme plans ou posés sur la photo aérienne et le relief LiDAR de l'IGN.

Site : https://kitoutou999.github.io/ariane-cartes/

**Avertissement.** Les cartes sont relevées au podomètre et à la boussole par une application expérimentale : plusieurs dizaines de mètres d'erreur sont possibles. Elles ne remplacent ni un plan, ni des repères, ni la prudence. L'accès aux carrières souterraines est souvent interdit et toujours dangereux.

## Consulter une carte

- Une carte placée sur le terrain s'affiche sur la photo aérienne, le relief LiDAR, le plan IGN ou OpenStreetMap. Un plan seul (sans point GPS) s'affiche comme dans Ariane : fond sombre, quadrillage de 10 m, nord en haut.
- Toucher un lieu-dit : son nom, et les boutons « Je suis ici » et « Y aller ».
- **Boussole** (téléphone) : « Activer la boussole », puis accepter la demande d'accès (sur iPhone, elle n'apparaît qu'après un toucher). Sous terre il n'y a pas de GPS : on choisit le lieu-dit où l'on se trouve. Le cône montre la direction du téléphone, la flèche celle du lieu-dit visé, avec la distance et l'angle à tourner. Tenir le téléphone à plat, loin du métal. Le nord des plans est le nord magnétique, celui de la boussole.
- **Carte orientée** : le haut de l'écran suit le téléphone (le déplacement au doigt est alors coupé, le zoom reste disponible).
- **Télécharger le plan (SVG)** : le fichier publié, lisible par n'importe quel visualiseur.

## Ajouter une carte

Dans Ariane : Réglages, Mes sorties, la sortie, Préparer les exports, « Partager la carte SVG ».

- **Directement** : ouvrir le formulaire « Nouvelle carte » du dépôt, mettre le nom après « Carte : » et glisser le SVG. Il est publié comme plan seul.
- **Avec la page « Ajouter une carte »** du site : titre, auteur, lieu, description, et en option les coordonnées GPS de 2 ou 3 lieux-dits relevés à ciel ouvert pour poser la carte sur la photo aérienne. Avec 3 points ou plus, la carte est déformée pour passer exactement par eux, l'écart étant réparti le long de la trace (les lieux-dits revisités restent confondus). La page produit un SVG à déposer dans le même formulaire.

La GitHub Action `ajout-carte.yml` vérifie le fichier, écrit dans `cartes/` un SVG redessiné (le fichier reçu n'est jamais publié tel quel), met le site à jour et répond dans le ticket, en une à deux minutes. En secours, le SVG peut aussi être collé en texte dans un bloc de code.

## Retirer une carte

Supprimer son fichier dans `cartes/` et pousser sur `main` : le site est redéployé sans elle.

## Fonctionnement

- Site statique (HTML, CSS, modules JavaScript, Leaflet), publié par GitHub Pages via `.github/workflows/site.yml`.
- `js/svg.js` : lecture du SVG d'Ariane sans DOM (trace, lieux-dits, échelle, passages retrouvés là où la trace passe exactement sur un lieu-dit) et écriture d'un SVG propre avec un bloc `<metadata>` (titre, auteur, lieu, description, points GPS).
- `js/preparer.js` : calage facultatif (similitude, puis compensation de réseau dans `js/geo.js`).
- `js/valider.js` : contrôle de la carte calculée ; les textes sont toujours affichés comme du texte.
- `scripts/index.js` : construit `cartes/index.json` (liste et aperçus) au déploiement.
- `scripts/ajouter-carte.js` : lit le SVG joint au ticket, le vérifie et le redessine dans `cartes/`.

## Développement

```sh
node scripts/index.js
python3 -m http.server 8000
```

Puis ouvrir http://localhost:8000/. La boussole demande une page servie en HTTPS (ou `localhost`) et un téléphone.
