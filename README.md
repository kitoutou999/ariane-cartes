# Cartes Ariane

Site de partage des cartes de carrières souterraines relevées avec l'application Ariane, calées sur la photo aérienne et le relief LiDAR de l'IGN.

Site : https://kitoutou999.github.io/ariane-cartes/

**Avertissement.** Les cartes sont relevées au podomètre et à la boussole par une application expérimentale : plusieurs dizaines de mètres d'erreur sont possibles. Elles ne remplacent ni un plan, ni des repères, ni la prudence. L'accès aux carrières souterraines est souvent interdit et toujours dangereux.

## Consulter une carte

- Fonds : photo aérienne, relief LiDAR, plan IGN ou OpenStreetMap.
- Toucher un lieu-dit : son nom, et les boutons « Je suis ici » et « Y aller ».
- **Boussole** (téléphone) : « Activer la boussole », puis accepter la demande d'accès (sur iPhone, elle n'apparaît qu'après un toucher). Sous terre il n'y a pas de GPS : on choisit le lieu-dit où l'on se trouve. Le cône montre la direction du téléphone, la flèche celle du lieu-dit visé, avec la distance et l'angle à tourner. Tenir le téléphone à plat, loin du métal.
- **Carte orientée** : le haut de l'écran suit le téléphone (le déplacement au doigt est alors coupé, le zoom reste disponible).
- **Ma position GPS** : utile en surface pour trouver une entrée.

## Ajouter une carte

1. Dans Ariane : Réglages, Mes sorties, la sortie, Préparer les exports, « Partager le JSON (sortie complète) ».
2. Sur la page « Ajouter une carte » du site : déposer ce fichier, puis saisir les coordonnées GPS de 2 ou 3 lieux-dits relevés à ciel ouvert (entrées, puits), le plus éloignés possible les uns des autres. Avec 3 points ou plus, la carte est déformée pour passer exactement par eux, l'écart étant réparti le long de la trace (les lieux-dits revisités restent confondus).
3. Remplir le titre, télécharger le fichier préparé, ouvrir le formulaire GitHub (compte gratuit nécessaire) et y glisser le fichier.

La GitHub Action `ajout-carte.yml` vérifie le fichier, l'ajoute dans `cartes/`, met le site à jour et répond dans le ticket, en une à deux minutes.

Le fichier publié contient la trace, les noms des lieux-dits, leurs positions et le jour de la sortie. Les heures et les photos ne sont pas publiées.

## Retirer une carte

Supprimer son fichier dans `cartes/` et pousser sur `main` : le site est redéployé sans elle.

## Fonctionnement

- Site statique (HTML, CSS, modules JavaScript, Leaflet), publié par GitHub Pages via `.github/workflows/site.yml`.
- `js/preparer.js` : calage d'une sortie Ariane (similitude, puis compensation de réseau dans `js/geo.js`).
- `js/valider.js` : validation stricte d'une carte, utilisée par le site et par l'Action ; seuls les champs connus sont recopiés et les textes sont toujours affichés comme du texte.
- `scripts/index.js` : construit `cartes/index.json` (liste et aperçus) au déploiement.
- `scripts/ajouter-carte.js` : lit le fichier joint au ticket, le valide et l'écrit dans `cartes/`.

## Développement

```sh
node scripts/index.js
python3 -m http.server 8000
```

Puis ouvrir http://localhost:8000/. La boussole demande une page servie en HTTPS (ou `localhost`) et un téléphone.
