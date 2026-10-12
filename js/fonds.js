// Fonds de carte. Les couches IGN (Géoplateforme) sont libres et sans clé, mais ne couvrent que la France.
const ign = (couche, format, matrice, zoomMax) => L.tileLayer(
  `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${couche}&STYLE=normal&TILEMATRIXSET=${matrice}&FORMAT=${format}&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`,
  { maxZoom: 21, maxNativeZoom: zoomMax },
);

export function fonds() {
  return {
    photo: { nom: 'Photo aérienne (IGN)', couche: ign('ORTHOIMAGERY.ORTHOPHOTOS', 'image/jpeg', 'PM', 19), credit: 'Fond : IGN Géoplateforme' },
    relief: { nom: 'Relief LiDAR (IGN)', couche: ign('IGNF_LIDAR-HD_MNT_ELEVATION.ELEVATIONGRIDCOVERAGE.SHADOW', 'image/png', 'PM_0_18', 18), credit: 'Fond : IGN Géoplateforme, LiDAR HD' },
    plan: { nom: 'Plan (IGN)', couche: ign('GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', 'image/png', 'PM', 19), credit: 'Fond : IGN Géoplateforme' },
    osm: {
      nom: 'OpenStreetMap',
      couche: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 21, maxNativeZoom: 19 }),
      credit: 'Fond : contributeurs OpenStreetMap',
    },
  };
}

export function lireFond(defaut = 'photo') {
  try { return localStorage.getItem('fond') || defaut; } catch { return defaut; }
}

export function memoriserFond(cle) {
  try { localStorage.setItem('fond', cle); } catch { /* stockage indisponible : sans effet */ }
}
