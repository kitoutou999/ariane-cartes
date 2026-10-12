// Préparation d'une carte : sortie Ariane + points GPS -> fichier publiable.
// Tout se passe dans le navigateur : rien n'est envoyé avant le dépôt sur GitHub.
import { distanceCap, lireCoordonnees } from './geo.js';
import { preparer, lireSortie, dateSortie } from './preparer.js';
import { valider, identifiant } from './valider.js';
import { fonds } from './fonds.js';
import { dessiner, el, formaterDistance, texteCalage } from './rendu.js';
import { FORMULAIRE } from './config.js';

const $ = id => document.getElementById(id);
const couleur = nom => getComputedStyle(document.documentElement).getPropertyValue(nom).trim();
let sortie = null, carte = null, ordre = [];
const lignes = [];

const map = L.map('apercu', { attributionControl: false, maxZoom: 21 });
const lesFonds = fonds(), couches = {};
for (const f of Object.values(lesFonds)) couches[f.nom] = f.couche;
lesFonds.photo.couche.addTo(map);
L.control.layers(couches, null, { position: 'topright' }).addTo(map);
map.setView([46.6, 2.4], 5);
const calques = L.layerGroup().addTo(map);

function erreur(texte) { $('erreur').textContent = texte; }
function montrer(id, oui) { $(id).hidden = !oui; }

$('fichier').addEventListener('change', async e => {
  const fichier = e.target.files[0];
  if (!fichier) return;
  erreur('');
  try {
    sortie = lireSortie(JSON.parse(await fichier.text()));
  } catch (err) {
    sortie = null;
    $('resume-sortie').textContent = err instanceof SyntaxError ? "Ce fichier n'est pas un JSON valide." : err.message;
    ['etape-calage', 'etape-infos', 'etape-publier'].forEach(id => montrer(id, false));
    return;
  }
  ordre = sortie.landmarks.map((_, i) => i)
    .sort((a, b) => String(sortie.landmarks[a].name).localeCompare(String(sortie.landmarks[b].name), 'fr', { numeric: true }));
  $('resume-sortie').textContent = `${sortie.landmarks.length} lieux-dits, ${formaterDistance(sortie.distance || 0)} parcourus.`;
  $('points').replaceChildren();
  lignes.length = 0;
  const entree = sortie.landmarks.findIndex(l => l.cat === 'entree');
  ajouterLigne(entree >= 0 ? entree : '');
  $('date').value = dateSortie(sortie);
  montrer('etape-calage', true);
  recalculer();
});

function ajouterLigne(lieu = '') {
  const select = el('select', { attrs: { 'aria-label': 'Lieu-dit' } }, [el('option', { texte: '(lieu-dit)', attrs: { value: '' } })]);
  for (const i of ordre) select.append(el('option', { texte: String(sortie.landmarks[i].name), attrs: { value: String(i) } }));
  select.value = String(lieu);
  const champ = el('input', { attrs: { type: 'text', inputmode: 'decimal', placeholder: '49.15622, -0.37110', 'aria-label': 'Coordonnées GPS', autocomplete: 'off', spellcheck: 'false' } });
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
$('ajouter-point').addEventListener('click', () => ajouterLigne());
$('deformer').addEventListener('change', recalculer);

function recalculer() {
  erreur('');
  if (!sortie) return;
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
  calques.clearLayers();
  carte = null;
  map.invalidateSize();
  const pret = points.length > 0;
  montrer('etape-infos', pret);
  montrer('etape-publier', pret);
  if (!pret) { $('bilan').replaceChildren(el('p', { texte: 'Ajoute au moins un point GPS pour placer la carte.' })); return; }
  try {
    carte = preparer(sortie, points, { deformer: $('deformer').checked });
  } catch (e) {
    erreur(e.message);
    return;
  }
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
  if (k.methode !== 'translation') {
    const pourcent = Math.abs(1 - k.echelle) * 100;
    bilan.push(el('p', { classe: 'discret', texte: `Échelle x${String(k.echelle).replace('.', ',')} (carte d'Ariane ${k.echelle < 1 ? 'trop grande' : 'trop petite'} de ${pourcent.toFixed(1).replace('.', ',')} %), rotation ${k.rotation > 0 ? '+' : ''}${String(k.rotation).replace('.', ',')}°.` }));
    if (pourcent > 15 || Math.abs(k.rotation) > 15) {
      bilan.push(el('p', { classe: 'erreur', texte: 'Écart important : vérifie que chaque point correspond au bon lieu-dit, et que les coordonnées sont dans l\'ordre latitude, longitude.' }));
    }
    const [a, b] = points;
    if (points.length === 2 && distanceCap(a.lat, a.lon, b.lat, b.lon).distance < 80) {
      bilan.push(el('p', { classe: 'erreur', texte: 'Les deux points sont proches : l\'orientation sera imprécise. Prends des points éloignés.' }));
    }
  }
  if (points.length >= 3 && k.methode === 'similitude') {
    bilan.push(el('p', { classe: 'discret', texte: `Écarts : ${k.points.map(p => `${p.nom} ${Math.round(p.ecart)} m`).join(', ')}.` }));
  }
  $('bilan').replaceChildren(...bilan);
}

function carteFinale({ titreParDefaut = '' } = {}) {
  if (!carte) throw new Error("Place d'abord la carte avec au moins un point GPS.");
  return valider({
    ...carte,
    titre: $('titre').value.trim() || titreParDefaut,
    auteur: $('auteur').value,
    lieu: $('lieu').value,
    date: $('date').value,
    description: $('description').value,
  });
}

function majLienFormulaire() {
  const titre = $('titre').value.trim();
  $('formulaire').href = `${FORMULAIRE}&title=${encodeURIComponent(`Carte : ${titre || 'sans titre'}`)}`;
}
$('titre').addEventListener('input', majLienFormulaire);
majLienFormulaire();

$('telecharger').addEventListener('click', () => {
  erreur('');
  let c;
  try { c = carteFinale(); } catch (e) { erreur(e.message); return; }
  const lien = el('a', { attrs: { href: URL.createObjectURL(new Blob([JSON.stringify(c)], { type: 'application/json' })), download: `${identifiant(c.titre, c.date)}.json` } });
  document.body.append(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(lien.href), 30000);
  majLienFormulaire();
  $('apres-telechargement').hidden = false;
});

$('voir').addEventListener('click', () => {
  erreur('');
  try {
    localStorage.setItem('carte-apercu', JSON.stringify(carteFinale({ titreParDefaut: 'Aperçu' })));
  } catch (e) {
    erreur(e instanceof DOMException ? 'Aperçu impossible dans ce navigateur (navigation privée ?).' : e.message);
    return;
  }
  window.open('carte.html?apercu=1', '_blank', 'noopener');
});
