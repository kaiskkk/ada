'use strict';

const { html, raw } = require('../html');
const { NOTES } = require('../db');

/* ---------- Dessins ---------- */

// Épi de blé, l'emblème de la boutique.
function epi(className = 'epi') {
  const grains = [46, 36.5, 27, 17.5].map((y) => `
    <ellipse cx="13.6" cy="${y}" rx="3.6" ry="7.4" transform="rotate(-34 13.6 ${y})"/>
    <ellipse cx="26.4" cy="${y}" rx="3.6" ry="7.4" transform="rotate(34 26.4 ${y})"/>`).join('');
  return raw(`<svg class="${className}" viewBox="0 0 40 64" aria-hidden="true" focusable="false">
    <path d="M20 63 C20.5 52 20 34 20 14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
    <g fill="currentColor">${grains}<ellipse cx="20" cy="9.5" rx="3.3" ry="7"/></g>
  </svg>`);
}

function marque(settings, { petite = false, lien = null } = {}) {
  const contenu = html`
    <span class="marque-epi">${epi()}</span>
    <span class="marque-texte">
      <strong>${settings.nom}</strong>
      ${settings.sousTitre ? html`<small>${settings.sousTitre}</small>` : ''}
    </span>`;
  const cls = `marque${petite ? ' marque-petite' : ''}`;
  return lien ? html`<a class="${cls}" href="${lien}">${contenu}</a>` : html`<span class="${cls}">${contenu}</span>`;
}

// Visages de satisfaction, du moins content (1) au plus content (5).
const BOUCHES = {
  1: 'M15 35 Q24 25.5 33 35',
  2: 'M16 33.5 Q24 29 32 33.5',
  3: 'M16 31.5 L32 31.5',
  4: 'M15.5 29 Q24 36.5 32.5 29',
  5: 'M13.5 27.5 Q24 42 34.5 27.5 Z',
};

function visage(n, className = 'visage-svg') {
  const yeux = n === 5
    ? '<path d="M13.5 21 Q17 16.5 20.5 21 M27.5 21 Q31 16.5 34.5 21" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>'
    : '<circle cx="17" cy="20" r="2.6" fill="currentColor"/><circle cx="31" cy="20" r="2.6" fill="currentColor"/>';
  const sourcils = n === 1
    ? '<path d="M12.5 13.5 L20 16 M35.5 13.5 L28 16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>'
    : '';
  const bouche = n === 5
    ? `<path d="${BOUCHES[5]}" fill="currentColor" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>`
    : `<path d="${BOUCHES[n]}" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/>`;
  return raw(`<svg class="${className}" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <circle class="visage-fond" cx="24" cy="24" r="21.5" fill="none" stroke="currentColor" stroke-width="2.6"/>
    ${sourcils}${yeux}${bouche}
  </svg>`);
}

const ICONES = {
  qr: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2zM16 16h2v2h-2z" fill="currentColor"/>',
  imprimer: '<path d="M7 9V3h10v6M7 17H4v-6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6h-3M7 14h10v7H7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  liste: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  graphique: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  papier: '<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  oeil: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/>',
  plus: '<path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  haut: '<path d="M6 15l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  bas: '<path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  poubelle: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  crayon: '<path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  copier: '<rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" fill="none" stroke="currentColor" stroke-width="2"/>',
  telecharger: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  ciseaux: '<circle cx="6" cy="6" r="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="6" cy="18" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8.5 7.5L20 18M8.5 16.5L20 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  retour: '<path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  dupliquer: '<rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 16V5a1 1 0 0 1 1-1h11" fill="none" stroke="currentColor" stroke-width="2"/><path d="M14 11v6M11 14h6" stroke="currentColor" stroke-width="2"/>',
  reglages: '<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  sortie: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  coche: '<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
  telephone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10.5 18.5h3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  appareil: '<path d="M4 8h3l2-3h6l2 3h3v11H4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/>',
  main: '<path d="M9 11V5a1.5 1.5 0 0 1 3 0v5M12 10V4a1.5 1.5 0 0 1 3 0v6M15 10V5.5a1.5 1.5 0 0 1 3 0V14c0 4-2.5 7-6.5 7-3 0-4.5-1.5-6-4l-2-3.5a1.5 1.5 0 0 1 2.6-1.5L9 14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
};

function icone(nom, className = 'icone') {
  return raw(`<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONES[nom] || ''}</svg>`);
}

/* ---------- En-tête HTML commun ---------- */

function head({ title, robots = false, extraHead = '' }) {
  return html`<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
${robots ? raw('<meta name="robots" content="noindex, nofollow">') : ''}
<meta name="theme-color" content="#F7EFE2">
<link rel="icon" href="/img/epi.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400..800;1,9..144,400..700&family=Figtree:wght@400;500;600;700;800&display=swap">
<link rel="stylesheet" href="/css/style.css">
${extraHead}
</head>`;
}

/* ---------- Champs du questionnaire (en ligne et saisie papier) ---------- */

function champQuestion(q, index, valeurs = [], erreur = '') {
  const name = `q_${q.id}`;
  const coche = (v) => valeurs.includes(String(v));
  const req = q.required ? raw(' required') : '';
  let champ;

  if (q.type === 'note') {
    champ = html`
      <div class="visages">
        ${[1, 2, 3, 4, 5].map((n) => html`
          <label class="visage" data-note="${n}" data-libelle="${NOTES[n - 1]}">
            <input type="radio" name="${name}" value="${n}"${coche(n) ? raw(' checked') : ''}${req}>
            <span class="visage-pastille">${visage(n)}</span>
            <span class="visage-num" aria-hidden="true">${n}</span>
            <span class="sr">${n} sur 5 : ${NOTES[n - 1]}</span>
          </label>`)}
      </div>
      <div class="visages-legende" aria-hidden="true"><span>${NOTES[0]}</span><span class="visages-choix"></span><span>${NOTES[4]}</span></div>`;
  } else if (q.type === 'choix' || q.type === 'multiple') {
    const type = q.type === 'choix' ? 'radio' : 'checkbox';
    champ = html`
      <div class="options${q.options.length > 4 ? ' options-grille' : ''}">
        ${q.options.map((opt) => html`
          <label class="option">
            <input type="${type}" name="${name}" value="${opt}"${coche(opt) ? raw(' checked') : ''}${type === 'radio' ? req : ''}>
            <span class="option-case" aria-hidden="true">${icone('coche')}</span>
            <span class="option-texte">${opt}</span>
          </label>`)}
      </div>`;
  } else if (q.type === 'oui_non') {
    champ = html`
      <div class="oui-non">
        ${['Oui', 'Non'].map((opt) => html`
          <label class="option option-bouton">
            <input type="radio" name="${name}" value="${opt}"${coche(opt) ? raw(' checked') : ''}${req}>
            <span class="option-case" aria-hidden="true">${icone('coche')}</span>
            <span class="option-texte">${opt}</span>
          </label>`)}
      </div>`;
  } else {
    champ = html`<textarea name="${name}" id="${name}" rows="4" maxlength="2000" placeholder="Écrivez ici…"${req}>${valeurs[0] || ''}</textarea>`;
  }

  const consigne = q.type === 'multiple' ? 'Plusieurs réponses possibles' : '';
  return html`
    <fieldset class="question${erreur ? ' question-erreur' : ''}" id="question-${q.id}" data-type="${q.type}">
      <legend class="question-titre">
        <span class="question-num">${index + 1}</span>
        <span class="question-intitule">${q.label}${q.required ? html` <abbr class="requis" title="Réponse obligatoire">*</abbr>` : ''}</span>
      </legend>
      ${q.help || consigne ? html`<p class="question-aide">${[q.help, consigne].filter(Boolean).join(' · ')}</p>` : ''}
      ${champ}
      ${erreur ? html`<p class="question-message" role="alert">${erreur}</p>` : ''}
    </fieldset>`;
}

function dureeEstimee(questions) {
  const secondes = questions.reduce((t, q) => t + (q.type === 'texte' ? 25 : 8), 0);
  return Math.max(1, Math.round(secondes / 60));
}

module.exports = { epi, marque, visage, icone, head, champQuestion, dureeEstimee };
