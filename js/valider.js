// Validation stricte d'une carte : utilisée par le site et par la GitHub Action qui publie
// les cartes déposées. Seuls les champs connus sont recopiés.
import { CATEGORIES } from './geo.js';

const METHODES = ['deformation', 'similitude', 'translation'];

function texte(v, max, champ, { requis = false, lignes = false } = {}) {
  if (v === undefined || v === null || v === '') {
    if (requis) throw new Error(`Champ « ${champ} » manquant.`);
    return '';
  }
  if (typeof v !== 'string') throw new Error(`Champ « ${champ} » invalide.`);
  const s = v.replace(lignes ? /[\u0000-\u0009\u000b-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g, ' ').trim();
  if (requis && !s) throw new Error(`Champ « ${champ} » manquant.`);
  if (s.length > max) throw new Error(`Champ « ${champ} » trop long (${max} caractères au plus).`);
  return s;
}

function nombre(v, min, max, champ) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new Error(`Valeur « ${champ} » invalide.`);
  return v;
}

const r6 = v => Math.round(v * 1e6) / 1e6;
const point = (p, champ) => {
  if (!Array.isArray(p) || p.length !== 2) throw new Error(`Point de « ${champ} » invalide.`);
  return [r6(nombre(p[0], -90, 90, 'latitude')), r6(nombre(p[1], -180, 180, 'longitude'))];
};

export function valider(c) {
  if (!c || typeof c !== 'object' || c.format !== 'ariane-carte') {
    throw new Error("Ce fichier n'est pas une carte préparée par la page « Ajouter une carte ».");
  }
  if (c.version !== 1) throw new Error('Version de carte non prise en charge.');
  const date = texte(c.date, 10, 'date');
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Champ « date » invalide.');

  if (!Array.isArray(c.traces) || !c.traces.length || c.traces.length > 200) throw new Error('Trace absente ou invalide.');
  let total = 0;
  const traces = c.traces.map(t => {
    if (!Array.isArray(t) || t.length < 2) throw new Error('Trace invalide.');
    total += t.length;
    if (total > 100000) throw new Error('Trace trop longue.');
    return t.map(p => point(p, 'trace'));
  });

  if (!Array.isArray(c.lieux) || c.lieux.length > 5000) throw new Error('Liste des lieux-dits invalide.');
  const lieux = c.lieux.map(l => {
    if (!l || typeof l !== 'object') throw new Error('Lieu-dit invalide.');
    const [lat, lon] = point([l.lat, l.lon], 'lieu-dit');
    const passages = l.passages === undefined ? 1 : Math.round(nombre(l.passages, 1, 100000, 'passages'));
    return { nom: texte(l.nom, 80, 'nom du lieu-dit', { requis: true }), cat: CATEGORIES[l.cat] ? l.cat : 'autre', lat, lon, passages };
  });

  let calage = null;
  if (c.calage !== undefined && c.calage !== null) {
    const k = c.calage;
    if (typeof k !== 'object' || !METHODES.includes(k.methode) || !Array.isArray(k.points) || k.points.length > 50) {
      throw new Error('Calage invalide.');
    }
    calage = {
      methode: k.methode,
      echelle: nombre(k.echelle, 0.01, 100, 'échelle'),
      rotation: nombre(k.rotation, -360, 360, 'rotation'),
      points: k.points.map(p => {
        const [lat, lon] = point([p.lat, p.lon], 'calage');
        return { nom: texte(p.nom, 80, 'nom du point de calage', { requis: true }), lat, lon, ecart: nombre(p.ecart, 0, 1e5, 'écart') };
      }),
    };
  }

  // Garde-fou : une carte de carrière tient dans quelques kilomètres.
  const [lat0, lon0] = traces[0][0];
  for (const p of [...traces.flat(), ...lieux.map(l => [l.lat, l.lon])]) {
    if (Math.abs(p[0] - lat0) > 0.3 || Math.abs(p[1] - lon0) > 0.5) {
      throw new Error('Carte trop étendue (plus de 30 km) : vérifie les points de calage.');
    }
  }

  return {
    format: 'ariane-carte',
    version: 1,
    titre: texte(c.titre, 80, 'titre', { requis: true }),
    auteur: texte(c.auteur, 40, 'auteur'),
    lieu: texte(c.lieu, 60, 'lieu'),
    description: texte(c.description, 1000, 'description', { lignes: true }),
    date,
    distance: Math.round(nombre(c.distance ?? 0, 0, 1e6, 'distance')),
    calage,
    traces,
    lieux,
  };
}

/** Nom de fichier : titre simplifié et date. */
export function identifiant(titre, date) {
  const base = titre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '') || 'carte';
  return date ? `${base}-${date}` : base;
}
