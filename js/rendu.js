// Dessin d'une carte (trace et lieux-dits) sur une carte Leaflet.
// Les noms viennent de fichiers déposés par n'importe qui : toujours insérés comme texte.
import { CATEGORIES } from './geo.js';

export function el(tag, { classe, texte, attrs } = {}, enfants = []) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texte !== undefined) e.textContent = texte;
  if (attrs) for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  for (const x of enfants) e.append(x);
  return e;
}

export const couleurLieu = cat => (CATEGORIES[cat] || CATEGORIES.autre).couleur;
export const nomCategorie = cat => (CATEGORIES[cat] || CATEGORIES.autre).nom;

const variable = (nom, defaut) => getComputedStyle(document.documentElement).getPropertyValue(nom).trim() || defaut;

/** Dessine la carte ; renvoie le groupe et un marqueur par lieu-dit (même ordre que carte.lieux). */
export function dessiner(map, carte, { noms = 'survol', auClic } = {}) {
  const groupe = L.featureGroup().addTo(map);
  const couleur = variable('--trace', '#ff7a1a');
  for (const t of carte.traces) {
    L.polyline(t, { color: '#000', weight: 6, opacity: 0.35, interactive: false }).addTo(groupe);
    L.polyline(t, { color: couleur, weight: 3, opacity: 0.95, interactive: false }).addTo(groupe);
  }
  const marqueurs = carte.lieux.map((l, i) => {
    const m = L.circleMarker([l.lat, l.lon], {
      radius: l.cat === 'entree' ? 8 : 5.5, color: '#fff', weight: 1.5, fillColor: couleurLieu(l.cat), fillOpacity: 1,
    }).addTo(groupe);
    if (auClic) m.on('click', () => auClic(i, m));
    return m;
  });
  afficherNoms(carte, marqueurs, noms);
  return { groupe, marqueurs };
}

/** noms : 'toujours' (étiquettes fixes), 'survol' (au passage de la souris) ou 'jamais'. */
export function afficherNoms(carte, marqueurs, noms) {
  marqueurs.forEach((m, i) => {
    m.unbindTooltip();
    if (noms === 'jamais') return;
    m.bindTooltip(el('span', { texte: carte.lieux[i].nom }), {
      permanent: noms === 'toujours', direction: 'right', offset: [8, 0], className: 'nom-lieu',
    });
  });
}

const POINTS_CARDINAUX = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
export const cardinal = cap => POINTS_CARDINAUX[Math.round(((cap % 360) + 360) % 360 / 45) % 8];

export const formaterDistance = m => m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m)} m`;

export function formaterDate(iso) {
  if (!iso) return '';
  const [a, m, j] = iso.split('-').map(Number);
  return new Date(a, m - 1, j).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function texteCalage(calage) {
  if (!calage) return 'Calage inconnu.';
  const n = calage.points.length;
  const max = Math.max(0, ...calage.points.map(p => p.ecart));
  if (calage.methode === 'deformation') return `Carte déformée pour passer par ${n} points GPS (écart maximal ${max.toFixed(1).replace('.', ',')} m).`;
  if (calage.methode === 'similitude') return `Carte tournée et mise à l'échelle sur ${n} points GPS (écart maximal ${Math.round(max)} m).`;
  return 'Carte placée sur un seul point GPS : orientation et échelle non vérifiées.';
}
