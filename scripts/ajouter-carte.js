// Lancé par la GitHub Action à l'ouverture d'un ticket « Nouvelle carte » : télécharge le fichier
// joint, le valide et l'écrit dans cartes/. Le contenu du ticket n'est jamais exécuté ni passé au shell.
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { valider, identifiant } from '../js/valider.js';

const TAILLE_MAX = 20 * 1024 * 1024;
const evenement = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
const ticket = evenement.issue;
const temp = process.env.RUNNER_TEMP || '.';
const [proprio, depot] = (process.env.GITHUB_REPOSITORY || 'proprio/depot').split('/');
const site = `https://${proprio}.github.io/${depot}/`;

function terminer(ok, reponse) {
  writeFileSync(`${temp}/reponse.md`, reponse);
  appendFileSync(process.env.GITHUB_OUTPUT || `${temp}/sorties.txt`, `ok=${ok}\n`);
}

async function lireFichier(corps) {
  const liens = [...corps.matchAll(/https:\/\/github\.com\/(?:user-attachments\/files|[\w.-]+\/[\w.-]+\/files)\/\d+\/[^\s)\]"'<>]+/g)].map(m => m[0]);
  const lien = liens.find(u => /\.json$/i.test(u)) || liens[0];
  if (lien) {
    const r = await fetch(lien, { redirect: 'follow' });
    if (!r.ok) throw new Error(`téléchargement du fichier joint impossible (erreur ${r.status}).`);
    const donnees = await r.arrayBuffer();
    if (donnees.byteLength > TAILLE_MAX) throw new Error('fichier trop gros.');
    return new TextDecoder().decode(donnees);
  }
  const bloc = corps.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (bloc) return bloc[1];
  throw new Error("aucun fichier trouvé. Glisse le fichier .json préparé par la page « Ajouter une carte » dans le formulaire.");
}

try {
  const texte = await lireFichier(String(ticket.body || ''));
  let brut;
  try { brut = JSON.parse(texte); } catch { throw new Error("le fichier n'est pas un JSON valide."); }
  let carte;
  try { carte = valider(brut); } catch (e) { throw new Error(e.message.charAt(0).toLowerCase() + e.message.slice(1)); }
  const base = identifiant(carte.titre, carte.date);
  let id = base;
  for (let n = 2; existsSync(`cartes/${id}.json`); n++) id = `${base}-${n}`;
  writeFileSync(`cartes/${id}.json`, JSON.stringify(carte));
  writeFileSync(`${temp}/commit.txt`, `Nouvelle carte : ${carte.titre}\n\nDéposée avec le ticket #${ticket.number}.\n`);
  terminer(true, `Carte publiée : ${site}carte.html?c=${id}\n\nLe site sera à jour dans une à deux minutes. Pour retirer la carte, demande-le dans un nouveau ticket.`);
} catch (e) {
  terminer(false, `La carte n'a pas pu être publiée : ${e.message}\n\nCorrige le problème depuis la page « Ajouter une carte » (${site}ajouter.html), puis dépose le fichier dans un nouveau ticket.`);
}
