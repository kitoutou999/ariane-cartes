// Préparation d'une carte à partir du plan SVG exporté par Ariane.
// Tout se passe dans le navigateur : rien n'est envoyé avant le dépôt sur GitHub.
import { distanceCap, lireCoordonnees } from './geo.js';
import { preparer } from './preparer.js';
import { identifiant } from './valider.js';
import { lireSVG, ecrireSVG, carteDepuisSVG } from './svg.js';
import { fonds } from './fonds.js';
import { dessiner, el, formaterDistance, texteCalage, grillePlan, estPlace } from './rendu.js';
import { FORMULAIRE } from './config.js';

const $ = id => document.getElementById(id);
const couleur = nom => getComputedStyle(document.documentElement).getPropertyValue(nom).trim();
let lu = null, carte = null, ordre = [];
const lignes = [];

const map = L.map('apercu', { attributionControl: false, maxZoom: 21 });
const lesFonds = fonds(), couches = {};
for (const f of Object.values(lesFonds)) couches[f.nom] = f.couche;
const choixFond = L.control.layers(couches, null, { position: 'topright' });
const calques = L.layerGroup().addTo(map);
map.setView([0, 0], 17);

function erreur(texte) { $('erreur').textContent = texte; }
function montrer(id, oui) { $(id).hidden = !oui; }

/** Photo aérienne si la carte est placée, sinon fond sombre et quadrillage comme le SVG. */
function majFond(place) {
  const actif = Object.values(lesFonds).some(f => map.hasLayer(f.couche));
  $('apercu').classList.toggle('plan-seul', !place);
  if (place && !actif) { lesFonds.photo.couche.addTo(map); choixFond.addTo(map); }
  if (!place && actif) {
    for (const f of Object.values(lesFonds)) map.removeLayer(f.couche);
    choixFond.remove();
  }
}

$('fichier').addEventListener('change', async e => {
  const fichier = e.target.files[0];
  if (!fichier) return;
  erreur('');
  try {
    lu = lireSVG(await fichier.text());
  } catch (err) {
    lu = null;
    $('resume-sortie').textContent = err.message;
    ['etape-infos', 'etape-calage', 'etape-publier'].forEach(id => montrer(id, false));
    return;
  }
  const lieux = lu.sortie.landmarks;
  ordre = lieux.map((_, i) => i).sort((a, b) => lieux[a].name.localeCompare(lieux[b].name, 'fr', { numeric: true }));
  $('resume-sortie').textContent = `${lieux.length} lieux-dits, ${formaterDistance(lu.sortie.distance)} parcourus.`;
  $('titre').value = lu.infos.titre;
  $('auteur').value = lu.infos.auteur;
  $('lieu').value = lu.infos.lieu;
  $('date').value = lu.infos.date;
  $('description').value = lu.infos.description;
  $('points').replaceChildren();
  lignes.length = 0;
  for (const p of lu.calage) ajouterLigne(p.lieu, `${p.lat}, ${p.lon}`);
  $('deformer').checked = lu.deformer;
  ['etape-infos', 'etape-calage', 'etape-publier'].forEach(id => montrer(id, true));
  majLienFormulaire();
  recalculer();
});

function ajouterLigne(lieu = '', coordonnees = '') {
  const select = el('select', { attrs: { 'aria-label': 'Lieu-dit' } }, [el('option', { texte: '(lieu-dit)', attrs: { value: '' } })]);
  for (const i of ordre) select.append(el('option', { texte: lu.sortie.landmarks[i].name, attrs: { value: String(i) } }));
  select.value = String(lieu);
  const champ = el('input', { attrs: { type: 'text', inputmode: 'decimal', placeholder: '49.15622, -0.37110', 'aria-label': 'Coordonnées GPS', autocomplete: 'off', spellcheck: 'false' } });
  champ.value = coordonnees;
  const retirer = el('button', { classe: 'bouton secondaire petit', texte: 'Retirer', attrs: { type: 'button' } });
  const etat = el('div', { classe: 'etat-point' });
  const ligne = el('div', { classe: 'ligne-point' }, [select, champ, retirer, etat]);
  const obj = { select, champ, etat };
  retirer.addEventListener('click', () => { lignes.splice(lignes.indexOf(obj), 1); ligne.remove(); recalculer(); });
  select.addEventListener('change', recalculer);
  champ.addEventListener('input', recalculer);
  lignes.push(obj);
  $('points').append(ligne);
}
$('ajouter-point').addEventListener('click', () => {
  if (!lignes.length) {
    const entree = lu.sortie.landmarks.findIndex(l => l.cat === 'entree');
    ajouterLigne(entree >= 0 ? entree : '');
  } else ajouterLigne();
});
$('deformer').addEventListener('change', recalculer);

/** Points GPS complets (les lignes incomplètes sont signalées et ignorées). */
function pointsGPS() {
  const points = [], vus = new Set();
  for (const l of lignes) {
    const lieu = l.select.value === '' ? null : Number(l.select.value);
    const c = lireCoordonnees(l.champ.value);
    let etat = '';
    if (lieu === null) etat = 'Choisis le lieu-dit.';
    else if (!l.champ.value.trim()) etat = 'Colle les coordonnées GPS de ce lieu-dit.';
    else if (!c) etat = 'Coordonnées illisibles. Exemple : 49.15622, -0.37110 (latitude, longitude).';
    else if (vus.has(lieu)) etat = 'Ce lieu-dit est déjà utilisé.';
    else { vus.add(lieu); points.push({ lieu, lat: c[0], lon: c[1] }); }
    l.etat.textContent = etat;
  }
  return points;
}

function recalculer() {
  erreur('');
  if (!lu) return;
  const points = pointsGPS();
  calques.clearLayers();
  map.invalidateSize();
  try {
    carte = preparer(lu.sortie, points, { deformer: $('deformer').checked });
  } catch (e) {
    carte = null;
    erreur(e.message);
    return;
  }
  const place = estPlace(carte);
  majFond(place);
  if (!place) grillePlan(carte).addTo(calques);
  const { groupe } = dessiner(calques, carte, { noms: 'survol' });
  carte.calage.points.forEach((p, j) => {
    const lieu = carte.lieux[points[j].lieu];
    L.polyline([[lieu.lat, lieu.lon], [p.lat, p.lon]], { color: couleur('--gps'), weight: 2, dashArray: '4 4', interactive: false }).addTo(calques);
    L.circleMarker([p.lat, p.lon], { radius: 7, color: '#fff', weight: 2, fillColor: couleur('--gps'), fillOpacity: 1 })
      .bindTooltip(el('span', { texte: `${p.nom} (GPS) : écart ${p.ecart.toFixed(1).replace('.', ',')} m` }))
      .addTo(calques);
  });
  map.fitBounds(groupe.getBounds().pad(0.1));

  const k = carte.calage, bilan = [el('p', { texte: texteCalage(k) })];
  if (k.methode === 'similitude' || k.methode === 'deformation') {
    const pourcent = Math.abs(1 - k.echelle) * 100;
    bilan.push(el('p', { classe: 'discret', texte: `Échelle x${String(k.echelle).replace('.', ',')} (plan d'Ariane ${k.echelle < 1 ? 'trop grand' : 'trop petit'} de ${pourcent.toFixed(1).replace('.', ',')} %), rotation ${k.rotation > 0 ? '+' : ''}${String(k.rotation).replace('.', ',')}°.` }));
    if (pourcent > 15 || Math.abs(k.rotation) > 15) {
      bilan.push(el('p', { classe: 'erreur', texte: "Écart important : vérifie que chaque point correspond au bon lieu-dit, et que les coordonnées sont dans l'ordre latitude, longitude." }));
    }
    const [a, b] = points;
    if (points.length === 2 && distanceCap(a.lat, a.lon, b.lat, b.lon).distance < 80) {
      bilan.push(el('p', { classe: 'erreur', texte: "Les deux points sont proches : l'orientation sera imprécise. Prends des points éloignés." }));
    }
  }
  if (points.length >= 3 && k.methode === 'similitude') {
    bilan.push(el('p', { classe: 'discret', texte: `Écarts : ${k.points.map(p => `${p.nom} ${Math.round(p.ecart)} m`).join(', ')}.` }));
  }
  $('bilan').replaceChildren(...bilan);
}

/** SVG à publier : le plan d'Ariane redessiné, avec les informations et les points GPS. */
function svgFinal({ titreParDefaut = '' } = {}) {
  if (!lu) throw new Error("Choisis d'abord le SVG exporté par Ariane.");
  const infos = {
    titre: $('titre').value.trim() || titreParDefaut,
    auteur: $('auteur').value.trim(),
    lieu: $('lieu').value.trim(),
    date: $('date').value,
    description: $('description').value.trim(),
  };
  const svg = ecrireSVG({ sortie: lu.sortie, infos, calage: pointsGPS(), deformer: $('deformer').checked });
  const { carte: verifiee } = carteDepuisSVG(svg); // mêmes contrôles que la publication
  return { svg, nom: `${identifiant(verifiee.titre, verifiee.date)}.svg` };
}

function majLienFormulaire() {
  const titre = $('titre').value.trim();
  $('formulaire').href = `${FORMULAIRE}&title=${encodeURIComponent(`Carte : ${titre || 'sans titre'}`)}`;
}
$('titre').addEventListener('input', majLienFormulaire);
majLienFormulaire();
$('formulaire-direct').href = FORMULAIRE;

$('telecharger').addEventListener('click', () => {
  erreur('');
  let f;
  try { f = svgFinal(); } catch (e) { erreur(e.message); return; }
  const lien = el('a', { attrs: { href: URL.createObjectURL(new Blob([f.svg], { type: 'image/svg+xml' })), download: f.nom } });
  document.body.append(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(lien.href), 30000);
  majLienFormulaire();
  $('apres-telechargement').hidden = false;
});

$('voir').addEventListener('click', () => {
  erreur('');
  let f;
  try { f = svgFinal({ titreParDefaut: 'Aperçu' }); } catch (e) { erreur(e.message); return; }
  try { localStorage.setItem('carte-apercu', f.svg); } catch {
    erreur('Aperçu impossible dans ce navigateur (navigation privée ?).');
    return;
  }
  window.open('carte.html?apercu=1', '_blank', 'noopener');
});
