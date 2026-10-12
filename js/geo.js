// Calculs partagés par le site et les scripts (aucun accès au DOM).
// Repère local d'Ariane : x vers l'est, y vers le nord, en mètres, origine à l'Entrée.

export const RAYON = 6378137;

/** Projection locale (plan tangent) autour de (lat0, lon0). */
export function projection(lat0, lon0) {
  const c = Math.cos(lat0 * Math.PI / 180);
  return {
    versLocal: (lat, lon) => [(lon - lon0) * Math.PI / 180 * RAYON * c, (lat - lat0) * Math.PI / 180 * RAYON],
    versGPS: (e, n) => [lat0 + n / RAYON * 180 / Math.PI, lon0 + e / (RAYON * c) * 180 / Math.PI],
  };
}

// Nombres complexes [re, im] : une similitude du plan s'écrit z -> k z + t.
const mul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const conj = a => [a[0], -a[1]];

/**
 * Similitude (rotation, échelle, translation) qui envoie les points A (carte) sur B (GPS local).
 * Un seul point : translation pure. Deux points : exacte. Trois ou plus : moindres carrés.
 */
export function similitude(A, B) {
  if (A.length === 1) return { k: [1, 0], t: [B[0][0] - A[0][0], B[0][1] - A[0][1]] };
  const n = A.length;
  const ma = [0, 0], mb = [0, 0];
  for (let i = 0; i < n; i++) { ma[0] += A[i][0] / n; ma[1] += A[i][1] / n; mb[0] += B[i][0] / n; mb[1] += B[i][1] / n; }
  let num = [0, 0], den = 0;
  for (let i = 0; i < n; i++) {
    const a = [A[i][0] - ma[0], A[i][1] - ma[1]], b = [B[i][0] - mb[0], B[i][1] - mb[1]];
    const p = mul(conj(a), b);
    num = [num[0] + p[0], num[1] + p[1]];
    den += a[0] * a[0] + a[1] * a[1];
  }
  const k = [num[0] / den, num[1] / den];
  const km = mul(k, ma);
  return { k, t: [mb[0] - km[0], mb[1] - km[1]] };
}

export const appliquer = (s, p) => { const z = mul(s.k, p); return [z[0] + s.t[0], z[1] + s.t[1]]; };
export const echelle = s => Math.hypot(s.k[0], s.k[1]);
/** Rotation en degrés, sens horaire (comme un cap). */
export const rotation = s => -Math.atan2(s.k[1], s.k[0]) * 180 / Math.PI;

/**
 * Compensation de réseau : déforme la trace Q (points [e, n]) pour qu'elle passe par les points
 * de calage, en répartissant l'écart selon la distance marchée. Chaque lieu-dit (toutes ses
 * visites) est un seul noeud : les bouclages restent fermés. Entre deux visites consécutives,
 * la correction est interpolée en distance.
 *   lieux : [{ createdIdx, visits }]
 *   calage : [{ lieu: index dans lieux, cible: [e, n], sigma: m }]
 *   derive : variance de la dérive en m² par mètre marché.
 */
export function compenser(Q, lieux, calage, derive = 0.6) {
  const s = [0];
  for (let i = 1; i < Q.length; i++) s.push(s[i - 1] + Math.hypot(Q[i][0] - Q[i - 1][0], Q[i][1] - Q[i - 1][1]));
  const occ = [];
  lieux.forEach((l, j) => {
    for (const i of new Set([l.createdIdx, ...l.visits])) if (i >= 0 && i < Q.length) occ.push([i, j]);
  });
  occ.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (!occ.length) return Q.map(p => p.slice());
  const n = lieux.length;
  const M = Array.from({ length: n }, () => new Float64Array(n));
  const bx = new Float64Array(n), by = new Float64Array(n);
  for (let j = 0; j < n; j++) M[j][j] = 1e-9; // noeuds sans lien avec un point de calage : ne bougent pas
  for (let o = 1; o < occ.length; o++) {
    const [i1, a] = occ[o - 1], [i2, c] = occ[o];
    if (a === c) continue;
    const w = 1 / (derive * Math.max(s[i2] - s[i1], 0.5));
    M[a][a] += w; M[c][c] += w; M[a][c] -= w; M[c][a] -= w;
  }
  for (const p of calage) {
    const g = 1 / (p.sigma * p.sigma), q = Q[lieux[p.lieu].createdIdx];
    M[p.lieu][p.lieu] += g;
    bx[p.lieu] += g * (p.cible[0] - q[0]);
    by[p.lieu] += g * (p.cible[1] - q[1]);
  }
  // Élimination de Gauss (matrice symétrique définie positive).
  for (let c = 0; c < n; c++) {
    const piv = M[c][c];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / piv;
      if (f === 0) continue;
      for (let cc = c; cc < n; cc++) M[r][cc] -= f * M[c][cc];
      bx[r] -= f * bx[c]; by[r] -= f * by[c];
    }
  }
  const dx = new Float64Array(n), dy = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let sx = bx[r], sy = by[r];
    for (let cc = r + 1; cc < n; cc++) { sx -= M[r][cc] * dx[cc]; sy -= M[r][cc] * dy[cc]; }
    dx[r] = sx / M[r][r]; dy[r] = sy / M[r][r];
  }
  const out = Q.map(p => p.slice());
  const decaler = (i, x, y) => { out[i][0] = Q[i][0] + x; out[i][1] = Q[i][1] + y; };
  const [premier, j0] = occ[0], [dernier, jn] = occ[occ.length - 1];
  for (let i = 0; i < premier; i++) decaler(i, dx[j0], dy[j0]);
  for (let i = dernier; i < Q.length; i++) decaler(i, dx[jn], dy[jn]);
  for (let o = 1; o < occ.length; o++) {
    const [i1, a] = occ[o - 1], [i2, c] = occ[o];
    for (let i = i1; i <= i2; i++) {
      const t = s[i2] === s[i1] ? 0 : (s[i] - s[i1]) / (s[i2] - s[i1]);
      decaler(i, dx[a] + (dx[c] - dx[a]) * t, dy[a] + (dy[c] - dy[a]) * t);
    }
  }
  return out;
}

/** Simplification de Douglas-Peucker (tolérance dans l'unité des points). */
export function simplifier(P, tol) {
  if (P.length < 3) return P.slice();
  const garder = new Uint8Array(P.length);
  garder[0] = garder[P.length - 1] = 1;
  const pile = [[0, P.length - 1]];
  while (pile.length) {
    const [a, b] = pile.pop();
    const [ax, ay] = P[a], [bx, by] = P[b];
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
    let max = -1, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = L === 0 ? Math.hypot(P[i][0] - ax, P[i][1] - ay) : Math.abs(dy * (P[i][0] - ax) - dx * (P[i][1] - ay)) / L;
      if (d > max) { max = d; idx = i; }
    }
    if (max > tol) { garder[idx] = 1; pile.push([a, idx], [idx, b]); }
  }
  return P.filter((_, i) => garder[i]);
}

/** Distance (m) et cap (degrés depuis le nord, sens horaire) entre deux positions GPS. */
export function distanceCap(lat1, lon1, lat2, lon2) {
  const p = projection(lat1, lon1);
  const [e, n] = p.versLocal(lat2, lon2);
  return { distance: Math.hypot(e, n), cap: (Math.atan2(e, n) * 180 / Math.PI + 360) % 360 };
}

/** Lit des coordonnées collées depuis Google Maps ou une autre app : « 49.15, -0.37 ». */
export function lireCoordonnees(texte) {
  const m = String(texte).trim().match(/^(-?\d+(?:[.,]\d+)?)\s*[,; ]\s*(-?\d+(?:[.,]\d+)?)$/);
  if (!m) return null;
  const lat = parseFloat(m[1].replace(',', '.')), lon = parseFloat(m[2].replace(',', '.'));
  if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return null;
  return [lat, lon];
}

export const CATEGORIES = {
  entree: { nom: 'Entrée', couleur: '#34C759' },
  tag: { nom: 'Tag', couleur: '#AF52DE' },
  voiture: { nom: 'Voiture', couleur: '#FF9500' },
  eau: { nom: 'Eau', couleur: '#0A84FF' },
  salle: { nom: 'Salle', couleur: '#32D4F0' },
  carrefour: { nom: 'Carrefour', couleur: '#FFD60A' },
  fanion: { nom: 'Fanion', couleur: '#FF3B30' },
  danger: { nom: 'Danger', couleur: '#FF2D55' },
  autre: { nom: 'Autre', couleur: '#8E8E93' },
  trou: { nom: 'Trou / puits', couleur: '#C69C6D' },
  objet: { nom: 'Objet', couleur: '#5E5CE6' },
};
