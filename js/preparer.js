// Transforme un plan Ariane (lu depuis son SVG) en carte affichable : calage facultatif sur des
// points GPS, trace simplifiée.
import { CATEGORIES, projection, similitude, appliquer, echelle, rotation, compenser, simplifier } from './geo.js';

export const FORMAT = 'ariane-carte';

/**
 * sortie : { points: [[x, y]], landmarks: [{ name, cat, x, y, createdIdx, visits }], segments, distance }
 * points : points GPS facultatifs [{ lieu: index du lieu-dit, lat, lon }].
 * Aucun point : plan seul, placé sur des coordonnées fictives autour de (0, 0), nord en haut.
 * Un point : translation (nord magnétique, échelle d'Ariane). Deux : similitude exacte.
 * Trois ou plus : similitude par moindres carrés, puis déformation si `deformer`.
 */
export function preparer(sortie, points, { deformer = true, infos = {} } = {}) {
  const lieux = sortie.landmarks;
  const proj = points.length ? projection(points[0].lat, points[0].lon) : projection(0, 0);
  const A = points.map(p => [lieux[p.lieu].x, lieux[p.lieu].y]);
  const B = points.map(p => proj.versLocal(p.lat, p.lon));
  const sim = points.length ? similitude(A, B) : { k: [1, 0], t: [0, 0] };
  const brut = sortie.points.map(p => appliquer(sim, [p[0], p[1]]));
  const methode = !points.length ? 'aucun' : points.length >= 3 && deformer ? 'deformation' : points.length >= 2 ? 'similitude' : 'translation';
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
    date: infos.date || '',
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
