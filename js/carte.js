// Visionneuse : une carte, la boussole du téléphone, la direction d'un lieu-dit à l'autre.
import { distanceCap } from './geo.js';
import { fonds, lireFond, memoriserFond } from './fonds.js';
import { dessiner, afficherNoms, el, nomCategorie, cardinal, formaterDistance, formaterDate, texteCalage } from './rendu.js';
import { valider } from './valider.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const cadre = $('cadre'), mapEl = $('map');
const map = L.map(mapEl, { zoomControl: false, attributionControl: false, maxZoom: 21 });
const couleur = nom => getComputedStyle(document.documentElement).getPropertyValue(nom).trim();

// --- Fonds de carte ---
const lesFonds = fonds();
let fondActif = null;
function choisirFond(cle) {
  if (!lesFonds[cle]) cle = 'photo';
  if (fondActif) map.removeLayer(fondActif.couche);
  fondActif = lesFonds[cle];
  fondActif.couche.addTo(map);
  $('fond').value = cle;
  $('credit').textContent = fondActif.credit;
  memoriserFond(cle);
}
for (const [cle, f] of Object.entries(lesFonds)) $('fond').append(el('option', { texte: f.nom, attrs: { value: cle } }));
$('fond').addEventListener('change', e => choisirFond(e.target.value));
choisirFond(lireFond());

$('zplus').addEventListener('click', () => map.zoomIn());
$('zmoins').addEventListener('click', () => map.zoomOut());
$('poignee').addEventListener('click', () => {
  const ouvert = $('panneau').classList.toggle('ouvert');
  $('poignee').setAttribute('aria-expanded', String(ouvert));
});

let minuterie = null;
function message(texte) {
  const m = $('message');
  m.textContent = texte;
  m.hidden = false;
  clearTimeout(minuterie);
  minuterie = setTimeout(() => { m.hidden = true; }, 6000);
}

// --- État ---
let carte = null, marqueurs = [];
let jeSuis = null, cible = null;         // index de lieu-dit
let cap = null, precision = null;        // degrés depuis le nord magnétique
let gpsPos = null;                       // [lat, lon, précision en m]
let boussoleActive = false, orientee = false;

const lieuLL = i => [carte.lieux[i].lat, carte.lieux[i].lon];
/** Point de départ du cône et de la direction : le lieu-dit choisi, sinon la position GPS. */
const origine = () => jeSuis !== null ? lieuLL(jeSuis) : gpsPos ? [gpsPos[0], gpsPos[1]] : null;

const ici = L.marker([0, 0], {
  icon: L.divIcon({
    className: 'ici',
    html: '<svg viewBox="-40 -40 80 80" width="80" height="80" aria-hidden="true"><path class="cone" d="M0 0 L-18 -34 A38 38 0 0 1 18 -34 Z"/><circle class="point" r="7"/></svg>',
    iconSize: [80, 80], iconAnchor: [40, 40],
  }),
  interactive: false, keyboard: false, zIndexOffset: 1000,
});
const anneauCible = L.circleMarker([0, 0], { radius: 13, color: couleur('--cible'), weight: 3, fill: false, interactive: false });
const ligneCible = L.polyline([], { color: couleur('--cible'), weight: 2, dashArray: '6 6', interactive: false });
const gpsCercle = L.circle([0, 0], { radius: 1, color: couleur('--gps'), weight: 1, fillOpacity: 0.12, interactive: false });
const gpsPoint = L.circleMarker([0, 0], { radius: 6, color: '#fff', weight: 2, fillColor: couleur('--gps'), fillOpacity: 1, interactive: false });

function majAffichage() {
  if (!carte) return;
  const o = origine();
  if (o) { ici.setLatLng(o); if (!map.hasLayer(ici)) ici.addTo(map); } else map.removeLayer(ici);
  const cone = ici.getElement()?.querySelector('.cone');
  if (cone) {
    cone.style.display = cap === null ? 'none' : '';
    if (cap !== null) cone.setAttribute('transform', `rotate(${cap.toFixed(1)})`);
  }
  if (cible !== null) {
    anneauCible.setLatLng(lieuLL(cible)).addTo(map);
    if (o) ligneCible.setLatLngs([o, lieuLL(cible)]).addTo(map); else map.removeLayer(ligneCible);
  } else {
    map.removeLayer(anneauCible);
    map.removeLayer(ligneCible);
  }
  const angle = orientee ? -(cap ?? 0) : 0;
  if (orientee) mapEl.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`;
  $('nord').style.transform = `rotate(${angle}deg)`;
  majHud(o);
}

function majHud(o) {
  const montrer = boussoleActive || cible !== null;
  $('hud').hidden = !montrer;
  if (!montrer) return;
  let ligneCap = '';
  if (boussoleActive) {
    ligneCap = cap === null ? 'Boussole : en attente...' : `Cap ${Math.round(cap)}° ${cardinal(cap)}`;
    if (cap !== null && precision > 0) ligneCap += ` (±${Math.round(precision)}°)`;
  }
  $('hud-cap').textContent = ligneCap;
  $('hud-cap').hidden = !ligneCap;
  let note = '';
  if (precision > 25) note = 'Boussole imprécise : fais un 8 avec le téléphone, loin du métal.';
  if (cible === null) {
    $('hud-cible').hidden = true;
  } else if (!o) {
    $('hud-cible').hidden = true;
    note = `Pour aller à « ${carte.lieux[cible].nom} », choisis d'abord où tu es.`;
  } else {
    $('hud-cible').hidden = false;
    const l = carte.lieux[cible];
    const d = distanceCap(o[0], o[1], l.lat, l.lon);
    $('hud-cible-nom').textContent = l.nom;
    let detail;
    if (d.distance < 3) {
      detail = 'Tu y es.';
      $('fleche').style.visibility = 'hidden';
    } else {
      $('fleche').style.visibility = '';
      detail = `${formaterDistance(d.distance)}, cap ${Math.round(d.cap)}° ${cardinal(d.cap)}`;
      if (cap !== null) {
        const rel = ((d.cap - cap + 540) % 360) - 180;
        $('fleche').style.transform = `rotate(${rel}deg)`;
        detail += Math.abs(rel) < 10 ? ' : droit devant' : ` : ${Math.round(Math.abs(rel))}° à ${rel > 0 ? 'droite' : 'gauche'}`;
      } else {
        $('fleche').style.transform = `rotate(${d.cap}deg)`; // par rapport au haut de la carte (nord)
      }
    }
    $('hud-cible-detail').textContent = detail;
  }
  $('hud-note').textContent = note;
  $('hud-note').hidden = !note;
}

// --- Boussole ---
// iOS : webkitCompassHeading (nord magnétique). Android : deviceorientationabsolute, cap = 360 - alpha.
const angleEcran = () => screen.orientation && typeof screen.orientation.angle === 'number'
  ? screen.orientation.angle : typeof window.orientation === 'number' ? window.orientation : 0;
let hx = 0, hy = 0, dessinPrevu = false;
function recevoirCap(h, acc) {
  const r = (h + angleEcran()) * Math.PI / 180;
  if (cap === null) { hx = Math.sin(r); hy = Math.cos(r); } else { hx = 0.75 * hx + 0.25 * Math.sin(r); hy = 0.75 * hy + 0.25 * Math.cos(r); }
  cap = (Math.atan2(hx, hy) * 180 / Math.PI + 360) % 360;
  precision = typeof acc === 'number' ? acc : null;
  if (!dessinPrevu) {
    dessinPrevu = true;
    requestAnimationFrame(() => { dessinPrevu = false; majAffichage(); });
  }
}
function surOrientation(e) {
  if (typeof e.webkitCompassHeading === 'number' && !Number.isNaN(e.webkitCompassHeading)) recevoirCap(e.webkitCompassHeading, e.webkitCompassAccuracy);
  else if (e.absolute && typeof e.alpha === 'number') recevoirCap(360 - e.alpha, null);
}
function arreterBoussole() {
  window.removeEventListener('deviceorientationabsolute', surOrientation);
  window.removeEventListener('deviceorientation', surOrientation);
  boussoleActive = false;
  cap = null;
  $('boussole').textContent = 'Activer la boussole';
  if (orientee) orienter(false);
  majAffichage();
}
async function basculerBoussole() {
  if (boussoleActive) return arreterBoussole();
  try {
    // iOS 13+ : l'autorisation doit être demandée pendant le toucher.
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      if (await DeviceOrientationEvent.requestPermission() !== 'granted') throw new Error('refus');
    }
  } catch {
    message("Accès à la boussole refusé. Sur iPhone, ferme et rouvre l'onglet puis réessaie, et accepte la demande.");
    return;
  }
  boussoleActive = true;
  $('boussole').textContent = 'Arrêter la boussole';
  window.addEventListener('deviceorientationabsolute', surOrientation);
  window.addEventListener('deviceorientation', surOrientation);
  majAffichage();
  setTimeout(() => { if (boussoleActive && cap === null) message('Aucune boussole détectée sur cet appareil.'); }, 3000);
}
$('boussole').addEventListener('click', basculerBoussole);

// --- Carte orientée : le haut de l'écran suit le téléphone ---
// La carte est agrandie à la diagonale de l'écran puis tournée ; le déplacement au doigt est
// coupé (il ne suit pas la rotation), le zoom reste centré.
function dimensionnerOrientee() {
  const d = Math.ceil(Math.hypot(cadre.clientWidth, cadre.clientHeight));
  mapEl.style.width = mapEl.style.height = `${d}px`;
}
function orienter(oui) {
  if (oui && !boussoleActive) {
    $('orientee').checked = false;
    message("Active d'abord la boussole.");
    return;
  }
  orientee = oui;
  $('orientee').checked = oui;
  cadre.classList.toggle('orientee', oui);
  const centre = origine() || map.getCenter();
  if (oui) dimensionnerOrientee(); else { mapEl.style.width = mapEl.style.height = ''; mapEl.style.transform = ''; }
  map.invalidateSize({ animate: false });
  map.setView(centre, map.getZoom(), { animate: false });
  for (const option of ['touchZoom', 'doubleClickZoom', 'scrollWheelZoom']) map.options[option] = oui ? 'center' : true;
  if (oui) map.dragging.disable(); else map.dragging.enable();
  majAffichage();
}
$('orientee').addEventListener('change', e => orienter(e.target.checked));
window.addEventListener('resize', () => { if (orientee) { dimensionnerOrientee(); map.invalidateSize({ animate: false }); } });

// --- GPS (utile en surface, pour trouver une entrée) ---
let suiviGps = null;
$('gps').addEventListener('click', () => {
  if (suiviGps !== null) {
    navigator.geolocation.clearWatch(suiviGps);
    suiviGps = null;
    gpsPos = null;
    map.removeLayer(gpsCercle);
    map.removeLayer(gpsPoint);
    $('gps').textContent = 'Ma position GPS';
    majAffichage();
    return;
  }
  if (!navigator.geolocation) return message('Géolocalisation indisponible sur cet appareil.');
  let premiere = true;
  suiviGps = navigator.geolocation.watchPosition(p => {
    gpsPos = [p.coords.latitude, p.coords.longitude, p.coords.accuracy];
    const ll = [gpsPos[0], gpsPos[1]];
    gpsCercle.setLatLng(ll).setRadius(gpsPos[2]).addTo(map);
    gpsPoint.setLatLng(ll).addTo(map);
    if (premiere) { premiere = false; if (!map.getBounds().contains(ll)) map.panTo(ll); }
    majAffichage();
  }, err => {
    message(err.code === 1 ? 'Position refusée : autorise la localisation pour ce site.' : 'Position indisponible (pas de signal GPS sous terre).');
  }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
  $('gps').textContent = 'Arrêter le GPS';
});

// --- Lieux-dits ---
function definirJeSuis(i) {
  jeSuis = i;
  $('jesuis').value = i === null ? '' : String(i);
  if (i !== null) {
    if (orientee) map.setView(lieuLL(i), Math.max(map.getZoom(), 18), { animate: false });
    else map.panTo(lieuLL(i));
  }
  majAffichage();
}
function definirCible(i) {
  cible = i;
  $('cible').value = i === null ? '' : String(i);
  majAffichage();
  if (i === null || orientee) return;
  const o = origine();
  if (o) map.fitBounds(L.latLngBounds([o, lieuLL(i)]).pad(0.4), { maxZoom: 19 });
  else map.panTo(lieuLL(i));
}
$('jesuis').addEventListener('change', e => definirJeSuis(e.target.value === '' ? null : Number(e.target.value)));
$('cible').addEventListener('change', e => definirCible(e.target.value === '' ? null : Number(e.target.value)));

// Popup ouverte sur la position du lieu-dit (et non du doigt, faussée quand la carte est tournée).
function ouvrirPopup(i) {
  const l = carte.lieux[i];
  const details = [nomCategorie(l.cat)];
  if (l.passages > 1) details.push(`vu ${l.passages} fois`);
  const contenu = el('div', { classe: 'popup-lieu' }, [el('strong', { texte: l.nom }), el('div', { classe: 'discret', texte: details.join(' · ') })]);
  if (jeSuis !== null && jeSuis !== i) {
    const o = lieuLL(jeSuis), d = distanceCap(o[0], o[1], l.lat, l.lon);
    contenu.append(el('div', { classe: 'discret', texte: `${formaterDistance(d.distance)}, cap ${Math.round(d.cap)}° depuis « ${carte.lieux[jeSuis].nom} »` }));
  }
  const boutonIci = el('button', { classe: 'bouton petit', texte: 'Je suis ici', attrs: { type: 'button' } });
  const boutonAller = el('button', { classe: 'bouton petit secondaire', texte: 'Y aller', attrs: { type: 'button' } });
  boutonIci.addEventListener('click', () => { map.closePopup(); definirJeSuis(i); });
  boutonAller.addEventListener('click', () => { map.closePopup(); definirCible(i); });
  contenu.append(el('div', { classe: 'ligne-boutons' }, [boutonIci, boutonAller]));
  L.popup({ autoPanPadding: [24, 96] }).setLatLng(lieuLL(i)).setContent(contenu).openOn(map);
}

let modeNoms = 'auto', nomsAffiches = null;
try { modeNoms = localStorage.getItem('noms') || 'auto'; } catch { /* sans stockage : mode auto */ }
function appliquerNoms() {
  if (!carte) return;
  const voulu = modeNoms === 'auto' ? (map.getZoom() >= 18 ? 'toujours' : 'jamais') : modeNoms;
  if (voulu !== nomsAffiches) { afficherNoms(carte, marqueurs, voulu); nomsAffiches = voulu; }
}
$('noms').value = modeNoms;
$('noms').addEventListener('change', e => {
  modeNoms = e.target.value;
  try { localStorage.setItem('noms', modeNoms); } catch { /* sans effet */ }
  appliquerNoms();
});
map.on('zoomend', appliquerNoms);

function remplirInfos() {
  const meta = [carte.auteur && `Par ${carte.auteur}`, formaterDate(carte.date), carte.lieu].filter(Boolean).join(' · ');
  const blocs = [];
  if (meta) blocs.push(el('p', { texte: meta }));
  blocs.push(el('p', { texte: `${formaterDistance(carte.distance)} parcourus, ${carte.lieux.length} lieux-dits.` }));
  blocs.push(el('p', { classe: 'discret', texte: texteCalage(carte.calage) }));
  if (carte.description) blocs.push(el('p', { classe: 'description', texte: carte.description }));
  $('infos').replaceChildren(...blocs);
  const ordre = carte.lieux.map((_, i) => i).sort((a, b) => carte.lieux[a].nom.localeCompare(carte.lieux[b].nom, 'fr', { numeric: true }));
  for (const sel of [$('jesuis'), $('cible')]) {
    for (const i of ordre) sel.append(el('option', { texte: carte.lieux[i].nom, attrs: { value: String(i) } }));
  }
}

async function charger() {
  if (params.has('apercu')) {
    let brut = null;
    try { brut = JSON.parse(localStorage.getItem('carte-apercu')); } catch { /* rien */ }
    if (!brut) throw new Error("Aperçu introuvable : relance-le depuis la page « Ajouter une carte ».");
    return valider(brut);
  }
  const id = params.get('c') || '';
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error('Carte introuvable.');
  const r = await fetch(`cartes/${id}.json`);
  if (!r.ok) throw new Error('Carte introuvable.');
  return valider(await r.json());
}

try {
  carte = await charger();
  document.title = carte.titre;
  $('titre').textContent = carte.titre;
  ({ marqueurs } = dessiner(map, carte, { noms: 'jamais', auClic: ouvrirPopup }));
  map.fitBounds(L.latLngBounds(carte.traces.flat()).pad(0.08));
  remplirInfos();
  appliquerNoms();
} catch (e) {
  $('titre').textContent = 'Carte introuvable';
  $('infos').replaceChildren(el('p', { texte: e.message }), el('p', {}, [el('a', { texte: 'Retour aux cartes', attrs: { href: './' } })]));
  $('panneau').classList.add('ouvert');
  map.setView([46.6, 2.4], 6);
}
