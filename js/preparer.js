// Transforme une sortie exportée par Ariane (« Partager le JSON ») en carte publiable :
// calage sur des points GPS, trace simplifiée, sans heures ni photos.
import { CATEGORIES, projection, similitude, appliquer, echelle, rotation, compenser, simplifier } from './geo.js';

export const FORMAT = 'ariane-carte';
const DATE_REFERENCE_APPLE = 978307200; // 01/01/2001, origine des dates encodées par Swift

export function lireSortie(obj) {
  if (!obj || !Array.isArray(obj.points) || !Array.isArray(obj.landmarks)) {
    throw new Error("Ce fichier n'est pas une sortie Ariane : utilise « Partager le JSON (sortie complète) ».");
  }
  if (obj.points.length < 2) throw new Error('La sortie ne contient pas de trace.');
  if (!obj.landmarks.length) throw new Error('La sortie ne contient aucun lieu-dit.');
  return obj;
}

export function dateSortie(sortie) {
  if (typeof sortie.startedAt !== 'number') return '';
  const d = new Date((sortie.startedAt + DATE_REFERENCE_APPLE) * 1000);
  const deux = v => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`;
}

/**
 * points : [{ lieu: index du lieu-dit dans sortie.landmarks, lat, lon }]
 * Un point : translation (nord magnétique, échelle d'Ariane). Deux : similitude exacte.
 * Trois ou plus : similitude par moindres carrés, puis déformation si `deformer`.
 */
export function preparer(sortie, points, { deformer = true, infos = {} } = {}) {
  if (!points.length) throw new Error('Il faut au moins un point de calage.');
  const lieux = sortie.landmarks;
  const proj = projection(points[0].lat, points[0].lon);
  const A = points.map(p => [lieux[p.lieu].x, lieux[p.lieu].y]);
  const B = points.map(p => proj.versLocal(p.lat, p.lon));
  const sim = similitude(A, B);
  const brut = sortie.points.map(p => appliquer(sim, [p[0], p[1]]));
  const methode = points.length >= 3 && deformer ? 'deformation' : points.length >= 2 ? 'similitude' : 'translation';
  const Q = methode === 'deformation'
    ? compenser(brut, lieux, points.map((p, j) => ({ lieu: p.lieu, cible: B[j], sigma: 1 })))
    : brut;
  const borne = i => Math.min(Math.max(i, 0), Q.length - 1);
  const posLieu = l => {
    const base = appliquer(sim, [l.x, l.y]), i = borne(l.createdIdx);
    return [base[0] + Q[i][0] - brut[i][0], base[1] + Q[i][1] - brut[i][1]];
  };
  const r6 = v => Math.round(v * 1e6) / 1e6;
  const gps = p => { const [lat, lon] = proj.versGPS(p[0], p[1]); return [r6(lat), r6(lon)]; };

  const debuts = (sortie.segments || []).map(s => s.startIdx).filter(i => i > 0 && i < Q.length).sort((a, b) => a - b);
  const bornes = [0, ...debuts, Q.length];
  const traces = [];
  for (let k = 0; k + 1 < bornes.length; k++) {
    const morceau = simplifier(Q.slice(bornes[k], bornes[k + 1]), 0.4);
    if (morceau.length >= 2) traces.push(morceau.map(gps));
  }

  return {
    format: FORMAT,
    version: 1,
    titre: infos.titre || '',
    auteur: infos.auteur || '',
    lieu: infos.lieu || '',
    description: infos.description || '',
    date: infos.date ?? dateSortie(sortie),
    distance: Math.round(sortie.distance || 0),
    calage: {
      methode,
      echelle: Math.round(echelle(sim) * 1000) / 1000,
      rotation: Math.round(rotation(sim) * 10) / 10,
      points: points.map((p, j) => {
        const pos = posLieu(lieux[p.lieu]);
        return { nom: lieux[p.lieu].name, lat: r6(p.lat), lon: r6(p.lon), ecart: Math.round(Math.hypot(pos[0] - B[j][0], pos[1] - B[j][1]) * 10) / 10 };
      }),
    },
    traces,
    lieux: lieux.map(l => {
      const [lat, lon] = gps(posLieu(l));
      return { nom: String(l.name || 'Sans nom').slice(0, 80), cat: CATEGORIES[l.cat] ? l.cat : 'autre', lat, lon, passages: Math.max(1, (l.visits || []).length) };
    }),
  };
}
