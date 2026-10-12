// Lancé par la GitHub Action à l'ouverture d'un ticket « Nouvelle carte » : télécharge le SVG joint
// (brut d'Ariane ou préparé par le site), le vérifie et écrit dans cartes/ un SVG redessiné.
// Le fichier reçu n'est jamais publié tel quel, ni exécuté, ni passé au shell.
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { identifiant } from '../js/valider.js';
import { carteDepuisSVG, ecrireSVG, TAILLE_MAX_SVG } from '../js/svg.js';

const evenement = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
const ticket = evenement.issue;
const temp = process.env.RUNNER_TEMP || '.';
const [proprio, depot] = (process.env.GITHUB_REPOSITORY || 'proprio/depot').split('/');
const site = `https://${proprio}.github.io/${depot}/`;

function terminer(ok, reponse) {
  writeFileSync(`${temp}/reponse.md`, reponse);
  appendFileSync(process.env.GITHUB_OUTPUT || `${temp}/sorties.txt`, `ok=${ok}\n`);
}

/** Pièces jointes du ticket : fichiers (…/files/…) et images (…/assets/…, cas des SVG). */
async function lireSVGJoint(corps) {
  const liens = [...corps.matchAll(/https:\/\/github\.com\/(?:user-attachments\/(?:files\/\d+\/[^\s)\]"'<>]+|assets\/[0-9a-f-]{36})|[\w.-]+\/[\w.-]+\/(?:files|assets)\/[^\s)\]"'<>]+)/gi)].map(m => m[0]);
  if (!liens.length) {
    // Secours : SVG collé en texte dans un bloc de code.
    const bloc = corps.match(/```(?:svg|xml)?\s*(<svg[\s\S]*?<\/svg>)\s*```/i);
    if (bloc) return bloc[1];
    throw new Error("aucun fichier trouvé. Glisse le SVG exporté par Ariane dans le formulaire.");
  }
  liens.sort((a, b) => /\.svg$/i.test(b) - /\.svg$/i.test(a));
  for (const lien of liens) {
    const r = await fetch(lien, { redirect: 'follow' });
    if (!r.ok) continue;
    const donnees = await r.arrayBuffer();
    if (donnees.byteLength > TAILLE_MAX_SVG) throw new Error('fichier trop gros (5 Mo au plus).');
    const texte = new TextDecoder().decode(donnees);
    if (/<svg[\s>]/i.test(texte)) return texte;
  }
  throw new Error("le fichier joint n'est pas un SVG lisible. Utilise « Partager la carte SVG » dans Ariane.");
}

try {
  const texte = await lireSVGJoint(String(ticket.body || ''));
  const titreTicket = String(ticket.title || '').replace(/^\s*carte\s*:\s*/i, '').trim().slice(0, 80);
  let lu, carte;
  try {
    ({ lu, carte } = carteDepuisSVG(texte, { titreParDefaut: titreTicket || 'Carte sans titre' }));
  } catch (e) {
    throw new Error(e.message.charAt(0).toLowerCase() + e.message.slice(1));
  }
  const infos = { titre: carte.titre, auteur: carte.auteur, lieu: carte.lieu, description: carte.description, date: carte.date };
  const base = identifiant(carte.titre, carte.date);
  let id = base;
  for (let n = 2; existsSync(`cartes/${id}.svg`); n++) id = `${base}-${n}`;
  writeFileSync(`cartes/${id}.svg`, ecrireSVG({ sortie: lu.sortie, infos, calage: lu.calage, deformer: lu.deformer }));
  writeFileSync(`${temp}/commit.txt`, `Nouvelle carte : ${carte.titre}\n\nDéposée avec le ticket #${ticket.number}.\n`);
  const placement = carte.calage.methode === 'aucun' ? 'Publiée comme plan seul (sans point GPS).' : `Placée sur le terrain avec ${carte.calage.points.length} point(s) GPS.`;
  terminer(true, `Carte publiée : ${site}carte.html?c=${id}\n\n${placement} Le site sera à jour dans une à deux minutes. Pour retirer la carte, demande-le dans un nouveau ticket.`);
} catch (e) {
  terminer(false, `La carte n'a pas pu être publiée : ${e.message}\n\nCorrige le problème (au besoin avec la page « Ajouter une carte » : ${site}ajouter.html), puis dépose le fichier dans un nouveau ticket.`);
}
