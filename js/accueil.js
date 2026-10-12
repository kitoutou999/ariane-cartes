// Accueil : toutes les cartes sur un fond de plan, et leur liste.
import { fonds } from './fonds.js';
import { projection } from './geo.js';
import { el, formaterDate, formaterDistance } from './rendu.js';

const liste = document.getElementById('liste');
const map = L.map('apercu', { attributionControl: false, scrollWheelZoom: false, maxZoom: 19 });
const lesFonds = fonds();
lesFonds.plan.couche.addTo(map);
document.getElementById('credit').textContent = lesFonds.plan.credit;
const couleur = getComputedStyle(document.documentElement).getPropertyValue('--trace').trim();

const SVG = 'http://www.w3.org/2000/svg';
function vignette(apercu) {
  const [lat0, lon0] = apercu[0][0];
  const proj = projection(lat0, lon0);
  const lignes = apercu.map(t => t.map(([la, lo]) => proj.versLocal(la, lo)));
  const tous = lignes.flat();
  const xs = tous.map(p => p[0]), ys = tous.map(p => p[1]);
  const minX = Math.min(...xs), maxY = Math.max(...ys);
  const taille = Math.max(Math.max(...xs) - minX, maxY - Math.min(...ys), 1);
  const decalX = (taille - (Math.max(...xs) - minX)) / 2, decalY = (taille - (maxY - Math.min(...ys))) / 2;
  const f = 56 / taille;
  const d = lignes.map(t => t.map(([x, y], i) => `${i ? 'L' : 'M'}${(4 + (x - minX + decalX) * f).toFixed(1)} ${(4 + (maxY - y + decalY) * f).toFixed(1)}`).join('')).join('');
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('class', 'vignette');
  svg.setAttribute('aria-hidden', 'true');
  const chemin = document.createElementNS(SVG, 'path');
  chemin.setAttribute('d', d);
  svg.append(chemin);
  return svg;
}

let index = [];
try {
  const r = await fetch('cartes/index.json', { cache: 'no-cache' });
  if (r.ok) index = await r.json();
} catch { /* pas d'index : liste vide */ }
if (!Array.isArray(index)) index = [];

// Seules les cartes placées sur le terrain (points GPS) apparaissent sur la carte de l'accueil.
const bornes = L.latLngBounds([]);
for (const c of index) {
  if (!c || !/^[a-z0-9-]+$/.test(c.id) || !Array.isArray(c.apercu) || !c.apercu.length) continue;
  const lien = `carte.html?c=${c.id}`;
  if (c.place) {
    const traces = L.polyline(c.apercu, { color: couleur, weight: 3 }).addTo(map);
    traces.bindTooltip(el('span', { texte: String(c.titre) }), { sticky: true });
    traces.on('click', () => { location.href = lien; });
    L.circleMarker(c.apercu[0][0], { radius: 6, color: '#fff', weight: 2, fillColor: couleur, fillOpacity: 1 })
      .bindTooltip(el('span', { texte: String(c.titre) }))
      .on('click', () => { location.href = lien; })
      .addTo(map);
    bornes.extend(traces.getBounds());
  }
  const details = [c.auteur && `Par ${c.auteur}`, formaterDate(c.date), c.lieu].filter(Boolean).join(' · ');
  const chiffres = `${formaterDistance(c.distance || 0)} parcourus, ${c.lieux || 0} lieux-dits${c.place ? '' : ', plan seul'}`;
  liste.append(el('li', {}, [el('a', { classe: 'carte-ligne', attrs: { href: lien } }, [
    vignette(c.apercu),
    el('div', {}, [el('strong', { texte: String(c.titre) }), el('div', { classe: 'discret', texte: details }), el('div', { classe: 'discret', texte: chiffres })]),
  ])]));
}

if (bornes.isValid()) map.fitBounds(bornes.pad(0.3), { maxZoom: 16 });
else {
  document.getElementById('apercu').hidden = true;
  document.getElementById('credit').hidden = true;
}
if (!liste.children.length) liste.append(el('li', { classe: 'vide', texte: 'Aucune carte pour le moment.' }));
