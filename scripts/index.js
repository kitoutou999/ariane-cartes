// Construit cartes/index.json (liste et aperçus) à partir des fichiers de cartes.
// Lancé au déploiement du site ; une carte invalide est ignorée avec un avertissement.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { valider } from '../js/valider.js';
import { simplifier } from '../js/geo.js';

const dossier = new URL('../cartes/', import.meta.url);
const r5 = v => Math.round(v * 1e5) / 1e5;
const entrees = [];
for (const fichier of readdirSync(dossier).filter(f => f.endsWith('.json') && f !== 'index.json').sort()) {
  const id = fichier.slice(0, -5);
  if (!/^[a-z0-9-]+$/.test(id)) { console.warn(`Ignorée (nom de fichier) : ${fichier}`); continue; }
  let c;
  try { c = valider(JSON.parse(readFileSync(new URL(fichier, dossier), 'utf8'))); } catch (e) { console.warn(`Ignorée : ${fichier} : ${e.message}`); continue; }
  const pts = c.traces.flat(), cos = Math.cos(pts[0][0] * Math.PI / 180);
  const lats = pts.map(p => p[0]), lons = pts.map(p => p[1] * cos);
  const tol = Math.hypot(Math.max(...lats) - Math.min(...lats), Math.max(...lons) - Math.min(...lons)) / 250;
  const apercu = c.traces
    .map(t => simplifier(t.map(([la, lo]) => [lo * cos, la]), tol).map(([x, y]) => [r5(y), r5(x / cos)]))
    .filter(t => t.length >= 2);
  entrees.push({ id, titre: c.titre, auteur: c.auteur, lieu: c.lieu, date: c.date, distance: c.distance, lieux: c.lieux.length, apercu });
}
entrees.sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.titre.localeCompare(b.titre, 'fr'));
writeFileSync(new URL('index.json', dossier), JSON.stringify(entrees));
console.log(`${entrees.length} carte(s) dans l'index.`);
