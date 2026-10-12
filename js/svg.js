// Lecture et écriture des plans SVG exportés par Ariane (« Partager la carte SVG »).
// Sans DOM : fonctionne dans le navigateur et sous Node (GitHub Action, index du site).
//
// Le SVG d'Ariane dessine la trace (chemins bleus #4FC3F7), un cercle par lieu-dit (couleur de sa
// catégorie) suivi de son nom, une barre d'échelle (ligne épaisse suivie de « 20 m ») et un
// sous-titre « jj/mm/aaaa hh:mm - 6497 m, 10091 pas ». Nord en haut.
// Le site y ajoute un bloc <metadata> : titre, auteur, lieu, description et points GPS facultatifs.
import { CATEGORIES, simplifier } from './geo.js';
import { preparer } from './preparer.js';
import { valider } from './valider.js';

export const TAILLE_MAX_SVG = 5 * 1024 * 1024;
const NS = 'https://kitoutou999.github.io/ariane-cartes/ns';
const COULEUR_TRACE = '#4fc3f7';
const PX_PAR_METRE = 4;
const TOLERANCE_VISITE = 0.15; // m : la trace passe exactement par un lieu-dit à chaque passage

const CATEGORIE_PAR_COULEUR = Object.fromEntries(Object.entries(CATEGORIES).map(([cle, c]) => [c.couleur.toLowerCase(), cle]));

export function echapperXML(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function desechapperXML(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function attributs(chaine) {
  const a = {};
  for (const m of chaine.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) a[m[1].toLowerCase()] = desechapperXML(m[2] ?? m[3]);
  if (a.style) {
    for (const decl of a.style.split(';')) {
      const i = decl.indexOf(':');
      if (i > 0) a[decl.slice(0, i).trim().toLowerCase()] = decl.slice(i + 1).trim();
    }
  }
  return a;
}

const nombre = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

/** Sous-chemins d'un attribut d (commandes absolues et relatives ; courbes réduites à leurs extrémités). */
function sousChemins(d) {
  const jetons = d.match(/[MmLlHhVvZzCcSsQqTtAa]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) || [];
  const PARAMETRES = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7 };
  const res = [];
  let courant = null, cmd = null, x = 0, y = 0, x0 = 0, y0 = 0, i = 0;
  while (i < jetons.length) {
    if (/^[a-z]$/i.test(jetons[i])) {
      cmd = jetons[i++];
      if (cmd === 'Z' || cmd === 'z') { x = x0; y = y0; courant = null; continue; }
    } else if (cmd === null) break;
    const C = cmd.toUpperCase(), rel = cmd !== C, n = PARAMETRES[C];
    if (!n || i + n > jetons.length) break;
    const v = jetons.slice(i, i + n).map(Number);
    i += n;
    if (v.some(Number.isNaN)) break;
    if (C === 'H') x = rel ? x + v[0] : v[0];
    else if (C === 'V') y = rel ? y + v[0] : v[0];
    else { x = rel ? x + v[n - 2] : v[n - 2]; y = rel ? y + v[n - 1] : v[n - 1]; }
    if (C === 'M') {
      x0 = x; y0 = y;
      courant = [[x, y]];
      res.push(courant);
      cmd = rel ? 'l' : 'L'; // coordonnées suivantes : lignes
    } else {
      if (!courant) { courant = [[x0, y0]]; res.push(courant); }
      courant.push([x, y]);
    }
  }
  return res.filter(c => c.length >= 2);
}

/**
 * Lit un SVG d'Ariane (brut ou déjà publié par le site).
 * Renvoie { sortie, infos, calage, deformer } ; sortie a la forme attendue par preparer().
 */
export function lireSVG(texte) {
  if (typeof texte !== 'string' || !/<svg[\s>]/i.test(texte)) throw new Error("Ce fichier n'est pas un SVG.");
  if (texte.length > TAILLE_MAX_SVG) throw new Error('SVG trop gros (5 Mo au plus).');
  texte = texte.replace(/<!--[\s\S]*?-->/g, '');

  // Métadonnées ajoutées par le site.
  const meta = attributs((texte.match(/<ariane:carte\b([^>]*?)\/?>/i) || [])[1] || '');
  const description = desechapperXML((texte.match(/<ariane:description>([\s\S]*?)<\/ariane:description>/i) || [])[1] || '');
  const calageBrut = [...texte.matchAll(/<ariane:calage\b([^>]*?)\/?>/gi)].map(m => attributs(m[1]));
  const corps = texte.replace(/<metadata\b[\s\S]*?<\/metadata>/gi, '');

  const traces = [], lieux = [];
  let barre = null, metresBarre = null, titre = '', date = '', distance = null;
  for (const m of corps.matchAll(/<(path|circle|text|line)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1\s*>)/gi)) {
    const nom = m[1].toLowerCase(), a = attributs(m[2]);
    if (nom === 'path') {
      if ((a.stroke || '').toLowerCase() === COULEUR_TRACE && a.d) traces.push(...sousChemins(a.d));
    } else if (nom === 'circle') {
      lieux.push({ px: [nombre(a.cx), nombre(a.cy)], cat: CATEGORIE_PAR_COULEUR[(a.fill || '').toLowerCase()] || 'autre', name: null });
    } else if (nom === 'line') {
      if (a['stroke-width'] === '3') barre = Math.abs(nombre(a.x2) - nombre(a.x1));
    } else {
      const contenu = desechapperXML((m[3] || '').replace(/<[^>]*>/g, '')).trim();
      const echelle = contenu.match(/^(\d+(?:[.,]\d+)?)\s*(k?m)$/);
      const sousTitre = contenu.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
      if (lieux.length && lieux[lieux.length - 1].name === null) lieux[lieux.length - 1].name = contenu || 'Sans nom';
      else if (echelle && barre && metresBarre === null) metresBarre = parseFloat(echelle[1].replace(',', '.')) * (echelle[2] === 'km' ? 1000 : 1);
      else if (sousTitre) {
        date = `${sousTitre[3]}-${sousTitre[2]}-${sousTitre[1]}`;
        const d = contenu.match(/([\d\s]+)\s*m\b/g);
        if (d) distance = nombre(d[d.length - 1].replace(/\s/g, ''));
      } else if (a['font-weight'] === 'bold' && !titre) titre = contenu;
    }
  }
  if (!traces.length) throw new Error("Trace introuvable : utilise le SVG exporté par Ariane (« Partager la carte SVG »).");
  if (!lieux.length) throw new Error('Aucun lieu-dit dans ce SVG.');
  const nbPoints = traces.reduce((s, t) => s + t.length, 0);
  if (nbPoints > 200000 || lieux.length > 5000) throw new Error('SVG trop détaillé.');

  // Pixels vers mètres (x vers l'est, y vers le nord), origine à l'Entrée.
  const k = barre && metresBarre ? barre / metresBarre : PX_PAR_METRE;
  const entree = lieux.find(l => l.cat === 'entree') || { px: traces[0][0] };
  const versMetres = ([px, py]) => [(px - entree.px[0]) / k, -(py - entree.px[1]) / k];
  const points = [], segments = [];
  for (const t of traces) {
    segments.push({ startIdx: points.length });
    for (const p of t) points.push(versMetres(p));
  }
  if (distance === null) {
    distance = 0;
    for (let i = 1; i < points.length; i++) distance += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }

  // Passages : la trace passe exactement par le lieu-dit à sa création et à chaque recalage.
  // Grille de 1 m pour retrouver vite les points proches d'un lieu-dit.
  const grille = new Map(), cle = (gx, gy) => `${gx},${gy}`;
  points.forEach(([x, y], i) => {
    const c = cle(Math.floor(x), Math.floor(y));
    if (!grille.has(c)) grille.set(c, []);
    grille.get(c).push(i);
  });
  const landmarks = lieux.map(l => {
    const [x, y] = versMetres(l.px);
    const proches = [];
    for (let gx = Math.floor(x) - 1; gx <= Math.floor(x) + 1; gx++) {
      for (let gy = Math.floor(y) - 1; gy <= Math.floor(y) + 1; gy++) {
        for (const i of grille.get(cle(gx, gy)) || []) {
          if (Math.hypot(points[i][0] - x, points[i][1] - y) < TOLERANCE_VISITE) proches.push(i);
        }
      }
    }
    proches.sort((p, q) => p - q);
    const visits = proches.filter((i, j) => j === 0 || i !== proches[j - 1] + 1);
    if (!visits.length) {
      let proche = 0, dmin = Infinity;
      points.forEach(([px, py], i) => { const d = Math.hypot(px - x, py - y); if (d < dmin) { dmin = d; proche = i; } });
      visits.push(proche);
    }
    return { name: l.name || 'Sans nom', cat: l.cat, x, y, createdIdx: visits[0], visits };
  });

  const calage = [];
  for (const c of calageBrut) {
    let lieu = Number.parseInt(c.lieu, 10);
    if (!(lieu >= 0 && lieu < landmarks.length) || (c.nom && landmarks[lieu].name !== c.nom)) lieu = landmarks.findIndex(l => l.name === c.nom);
    const lat = Number(c.lat), lon = Number(c.lon);
    if (lieu >= 0 && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !calage.some(p => p.lieu === lieu)) calage.push({ lieu, lat, lon });
  }

  return {
    sortie: { points, landmarks, segments, distance },
    infos: {
      titre: meta.titre || (titre && titre !== 'Ariane' ? titre : ''),
      auteur: meta.auteur || '',
      lieu: meta.lieu || '',
      description,
      date: /^\d{4}-\d{2}-\d{2}$/.test(meta.date || '') ? meta.date : date,
    },
    calage,
    deformer: meta.deformer !== '0',
  };
}

/** Lit un SVG et calcule la carte affichable (validée). */
export function carteDepuisSVG(texte, { titreParDefaut = '' } = {}) {
  const lu = lireSVG(texte);
  const carte = valider(preparer(lu.sortie, lu.calage, { deformer: lu.deformer, infos: { ...lu.infos, titre: lu.infos.titre || titreParDefaut } }));
  return { lu, carte };
}

/**
 * Écrit un SVG propre au style d'Ariane (les textes sont toujours échappés) :
 * trace simplifiée en gardant chaque passage sur un lieu-dit, et métadonnées du site.
 */
export function ecrireSVG({ sortie, infos, calage = [], deformer = true }) {
  const { points, landmarks } = sortie;
  const fmt = v => v.toFixed(1);
  const marge = 15, entete = 18, k = PX_PAR_METRE;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of [...points, ...landmarks.map(l => [l.x, l.y])]) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  minX -= marge; minY -= marge; maxX += marge; maxY += marge + entete;
  const w = (maxX - minX) * k, h = (maxY - minY) * k;
  const sx = x => (x - minX) * k, sy = y => (maxY - y) * k;

  const o = [];
  o.push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:ariane="${NS}" width="${fmt(w)}" height="${fmt(h)}" viewBox="0 0 ${fmt(w)} ${fmt(h)}">`);
  o.push('<metadata>');
  o.push(`<ariane:carte version="1" titre="${echapperXML(infos.titre || '')}" auteur="${echapperXML(infos.auteur || '')}" lieu="${echapperXML(infos.lieu || '')}" date="${echapperXML(infos.date || '')}" deformer="${deformer ? 1 : 0}"/>`);
  if (infos.description) o.push(`<ariane:description>${echapperXML(infos.description)}</ariane:description>`);
  for (const c of calage) {
    o.push(`<ariane:calage lieu="${c.lieu}" nom="${echapperXML(landmarks[c.lieu].name)}" lat="${c.lat.toFixed(7)}" lon="${c.lon.toFixed(7)}"/>`);
  }
  o.push('</metadata>');
  o.push(`<rect x="0" y="0" width="${fmt(w)}" height="${fmt(h)}" fill="#111111"/>`);
  o.push('<g stroke="#2A2A2A" stroke-width="1">');
  for (let gx = Math.ceil(minX / 10) * 10; gx <= maxX; gx += 10) o.push(`<line x1="${fmt(sx(gx))}" y1="0" x2="${fmt(sx(gx))}" y2="${fmt(h)}"/>`);
  for (let gy = Math.ceil(minY / 10) * 10; gy <= maxY; gy += 10) o.push(`<line x1="0" y1="${fmt(sy(gy))}" x2="${fmt(w)}" y2="${fmt(sy(gy))}"/>`);
  o.push('</g>');

  // Trace : simplifiée entre deux points clés (passages sur un lieu-dit, débuts de segment).
  const cles = new Set(landmarks.flatMap(l => l.visits));
  const debuts = sortie.segments.map(s => s.startIdx).concat(points.length).sort((a, b) => a - b);
  for (let s = 0; s + 1 < debuts.length; s++) {
    const [a, b] = [debuts[s], debuts[s + 1]];
    if (b - a < 2) continue;
    const gardes = [];
    let debut = a;
    for (let i = a + 1; i < b; i++) {
      if (cles.has(i) || i === b - 1) {
        const morceau = simplifier(points.slice(debut, i + 1), 0.25);
        gardes.push(...(gardes.length ? morceau.slice(1) : morceau));
        debut = i;
      }
    }
    o.push(`<path d="${gardes.map(([x, y], i) => `${i ? 'L' : 'M'} ${fmt(sx(x))} ${fmt(sy(y))}`).join(' ')}" fill="none" stroke="#4FC3F7" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`);
  }

  for (const l of landmarks) {
    const cx = sx(l.x), cy = sy(l.y);
    o.push(`<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="7" fill="${(CATEGORIES[l.cat] || CATEGORIES.autre).couleur}" stroke="#FFFFFF" stroke-width="1.5"/>`);
    o.push(`<text x="${fmt(cx + 10)}" y="${fmt(cy + 5)}" font-family="Helvetica, Arial, sans-serif" font-size="14" fill="#FFFFFF">${echapperXML(l.name)}</text>`);
  }

  const [an, mo, jo] = (infos.date || '').split('-');
  const sousTitre = [an ? `${jo}/${mo}/${an}` : '', `${Math.round(sortie.distance || 0)} m`].filter(Boolean).join(' - ');
  o.push(`<text x="12" y="26" font-family="Helvetica, Arial, sans-serif" font-size="20" font-weight="bold" fill="#FFFFFF">${echapperXML(infos.titre || 'Ariane')}</text>`);
  o.push(`<text x="12" y="46" font-family="Helvetica, Arial, sans-serif" font-size="13" fill="#BBBBBB">${echapperXML(sousTitre)}</text>`);
  o.push(`<line x1="12.0" y1="${fmt(h - 16)}" x2="${fmt(12 + 20 * k)}" y2="${fmt(h - 16)}" stroke="#FFFFFF" stroke-width="3"/>`);
  o.push(`<text x="12.0" y="${fmt(h - 22)}" font-family="Helvetica, Arial, sans-serif" font-size="12" fill="#FFFFFF">20 m</text>`);
  const nx = w - 24, ny = 20;
  o.push(`<path d="M ${fmt(nx)} ${fmt(ny)} L ${fmt(nx - 7)} ${fmt(ny + 20)} L ${fmt(nx)} ${fmt(ny + 15)} L ${fmt(nx + 7)} ${fmt(ny + 20)} Z" fill="#FFFFFF"/>`);
  o.push(`<text x="${fmt(nx - 5)}" y="${fmt(ny + 36)}" font-family="Helvetica, Arial, sans-serif" font-size="13" fill="#FFFFFF">N</text>`);
  o.push('</svg>');
  return o.join('\n') + '\n';
}
