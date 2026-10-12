// Construit cartes/index.json (liste et aperçus) à partir des plans SVG publiés.
// Lancé au déploiement du site ; un plan illisible est ignoré avec un avertissement.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { carteDepuisSVG } from '../js/svg.js';
import { simplifier } from '../js/geo.js';

const dossier = new URL('../cartes/', import.meta.url);
const r5 = v => Math.round(v * 1e5) / 1e5;
const entrees = [];
for (const fichier of readdirSync(dossier).filter(f => f.endsWith('.svg')).sort()) {
  const id = fichier.slice(0, -4);
  if (!/^[a-z0-9-]+$/.test(id)) { console.warn(`Ignorée (nom de fichier) : ${fichier}`); continue; }
  let c;
  try { c = carteDepuisSVG(readFileSync(new URL(fichier, dossier), 'utf8'), { titreParDefaut: id }).carte; } catch (e) { console.warn(`Ignorée : ${fichier} : ${e.message}`); continue; }
  const pts = c.traces.flat(), cos = Math.cos(pts[0][0] * Math.PI / 180);
  const lats = pts.map(p => p[0]), lons = pts.map(p => p[1] * cos);
  const tol = Math.hypot(Math.max(...lats) - Math.min(...lats), Math.max(...lons) - Math.min(...lons)) / 250;
  const apercu = c.traces
    .map(t => simplifier(t.map(([la, lo]) => [lo * cos, la]), tol).map(([x, y]) => [r5(y), r5(x / cos)]))
    .filter(t => t.length >= 2);
  entrees.push({ id, titre: c.titre, auteur: c.auteur, lieu: c.lieu, date: c.date, distance: c.distance, lieux: c.lieux.length, place: c.calage.methode !== 'aucun', apercu });
}
entrees.sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.titre.localeCompare(b.titre, 'fr'));
writeFileSync(new URL('index.json', dossier), JSON.stringify(entrees));
console.log(`${entrees.length} carte(s) dans l'index.`);
