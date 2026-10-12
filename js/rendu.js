// Dessin d'une carte (trace et lieux-dits) sur une carte Leaflet.
// Les noms viennent de fichiers déposés par n'importe qui : toujours insérés comme texte.
import { CATEGORIES, projection } from './geo.js';

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
  if (!calage || calage.methode === 'aucun') return "Plan seul, non placé sur le terrain : nord en haut (nord magnétique, celui de la boussole).";
  const n = calage.points.length;
  const max = Math.max(0, ...calage.points.map(p => p.ecart));
  if (calage.methode === 'deformation') return `Carte déformée pour passer par ${n} points GPS (écart maximal ${max.toFixed(1).replace('.', ',')} m).`;
  if (calage.methode === 'similitude') return `Carte tournée et mise à l'échelle sur ${n} points GPS (écart maximal ${Math.round(max)} m).`;
  return 'Carte placée sur un seul point GPS : orientation et échelle non vérifiées.';
}

/** Plan seul (sans point GPS) : quadrillage de 10 m, comme sur le SVG d'Ariane. */
export function grillePlan(carte) {
  const proj = projection(0, 0), groupe = L.layerGroup();
  const pts = carte.traces.flat().map(([la, lo]) => proj.versLocal(la, lo));
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs) - 200, Math.max(...xs) + 200, Math.min(...ys) - 200, Math.max(...ys) + 200];
  const style = { color: '#2a2a2a', weight: 1, interactive: false };
  for (let x = Math.ceil(x0 / 10) * 10; x <= x1; x += 10) L.polyline([proj.versGPS(x, y0), proj.versGPS(x, y1)], style).addTo(groupe);
  for (let y = Math.ceil(y0 / 10) * 10; y <= y1; y += 10) L.polyline([proj.versGPS(x0, y), proj.versGPS(x1, y)], style).addTo(groupe);
  return groupe;
}

export const estPlace = carte => carte.calage && carte.calage.methode !== 'aucun';
