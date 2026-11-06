'use strict';

const { html, raw, paragraphs } = require('../html');
const { NOTES } = require('../db');
const { head, marque, visage, icone } = require('./common');

const PAGE_PLEINE = '@page { size: A4 portrait; margin: 0; }';
const PAGE_MARGES = '@page { size: A4 portrait; margin: 13mm 14mm 12mm; }';

const urlCourte = (url) => url.replace(/^https?:\/\//, '').replace(/\/$/, '');

function cadre({ req, settings, survey, format, titre, options = '', feuilles, pleine }) {
  return html`${head({
    title: `${titre} · ${survey.title}`,
    robots: true,
    extraHead: raw(`<link rel="stylesheet" href="/css/print.css"><style>${pleine ? PAGE_PLEINE : PAGE_MARGES}</style>`),
  })}
<body class="impression impression-${format}">
  <div class="impression-barre">
    <a class="bouton bouton-clair" href="/admin/sondages/${survey.id}/partager">${icone('retour')} Retour</a>
    <div class="impression-titre">
      <strong>${titre}</strong>
      <span>Format A4 · ${survey.title}</span>
    </div>
    ${options}
    <button class="bouton" type="button" data-imprimer>${icone('imprimer')} Imprimer</button>
  </div>
  <p class="impression-conseil">Dans la fenêtre d’impression, choisissez le papier <strong>A4</strong>, l’échelle <strong>100 %</strong> et cochez <strong>« Graphiques d’arrière-plan »</strong> pour garder les couleurs.</p>
  <div class="feuilles">
    ${feuilles}
  </div>
  <script src="/js/admin.js" defer></script>
</body>
</html>`;
}

/* ---------- Affiche A4 avec grand QR code ---------- */

function affiche({ req, settings, survey, url, qrSvg }) {
  const feuille = html`
  <section class="feuille affiche">
    <span class="affiche-decor affiche-decor-1" aria-hidden="true"></span>
    <span class="affiche-decor affiche-decor-2" aria-hidden="true"></span>
    <header class="affiche-tete">${marque(settings)}</header>

    <div class="affiche-titre">
      <p class="affiche-surtitre">${survey.title}</p>
      <h1>Votre avis,<br><em>c’est notre levain.</em></h1>
      <p class="affiche-sous">Aidez-nous à faire encore meilleur&nbsp;: 2 minutes, c’est anonyme.</p>
    </div>

    <div class="affiche-qr">
      <div class="qr-cadre">
        ${raw(qrSvg)}
        <span class="coin coin-hg"></span><span class="coin coin-hd"></span><span class="coin coin-bg"></span><span class="coin coin-bd"></span>
      </div>
      <p class="qr-legende">Scannez-moi&nbsp;!</p>
    </div>

    <ol class="etapes">
      <li><span class="etape-icone">${icone('appareil')}</span><strong>Ouvrez l’appareil photo</strong><span>de votre téléphone</span></li>
      <li><span class="etape-icone">${icone('qr')}</span><strong>Visez le QR code</strong><span>pas besoin de prendre la photo</span></li>
      <li><span class="etape-icone">${icone('main')}</span><strong>Touchez le lien</strong><span>qui s’affiche, puis répondez</span></li>
    </ol>

    <p class="affiche-url">Ou tapez cette adresse&nbsp;: <strong>${urlCourte(url)}</strong></p>

    <footer class="affiche-pied">
      <div class="affiche-papier">
        <span class="affiche-papier-icone">${icone('papier')}</span>
        <p><strong>Pas de smartphone&nbsp;?</strong> Demandez un questionnaire papier au comptoir, on s’occupe du reste&nbsp;!</p>
      </div>
      <p class="affiche-merci">Merci&nbsp;! <span>L’équipe de ${settings.nom}</span></p>
    </footer>
  </section>`;
  return cadre({ req, settings, survey, format: 'affiche', titre: 'Affiche avec QR code', feuilles: feuille, pleine: true });
}

/* ---------- 8 cartes à découper ---------- */

function cartes({ req, settings, survey, url, qrSvg }) {
  const carte = html`
    <div class="carte-qr">
      <div class="carte-qr-texte">
        ${marque(settings, { petite: true })}
        <p class="carte-qr-titre">Votre avis compte&nbsp;!</p>
        <p class="carte-qr-sous">Scannez le code avec l’appareil photo de votre téléphone. 2 minutes, c’est anonyme.</p>
        <p class="carte-qr-url">${urlCourte(url)}</p>
      </div>
      <div class="carte-qr-code">${raw(qrSvg)}</div>
    </div>`;
  const feuille = html`
  <section class="feuille cartes">
    ${Array.from({ length: 8 }, () => carte)}
    <span class="cartes-ciseaux" aria-hidden="true">${icone('ciseaux')}</span>
  </section>`;
  return cadre({ req, settings, survey, format: 'cartes', titre: 'Cartes à découper (8 par page)', feuilles: feuille, pleine: true });
}

/* ---------- Questionnaire papier (personnes sans smartphone) ---------- */

function caseACocher() {
  return raw('<span class="qp-case" aria-hidden="true"></span>');
}

function questionnaire({ req, settings, survey, questions, url, qrSvg, avecQr }) {
  // Les questions « note » qui se suivent sont regroupées dans un même tableau.
  const blocs = [];
  questions.forEach((q, i) => {
    const item = { q, num: i + 1 };
    const dernier = blocs[blocs.length - 1];
    if (q.type === 'note' && dernier && dernier.type === 'notes') dernier.items.push(item);
    else if (q.type === 'note') blocs.push({ type: 'notes', items: [item] });
    else blocs.push({ type: 'autre', item });
  });

  const rendus = blocs.map((b) => {
    if (b.type === 'notes') {
      return html`
      <table class="qp-notes">
        <thead>
          <tr>
            <th scope="col" class="qp-notes-vide"><span>Cochez une case par ligne</span></th>
            ${NOTES.map((libelle, i) => html`<th scope="col">${visage(i + 1, 'qp-visage')}<span>${libelle}</span></th>`)}
          </tr>
        </thead>
        <tbody>
          ${b.items.map(({ q, num }) => html`
          <tr>
            <th scope="row"><span class="qp-num">${num}.</span> ${q.label}${q.help ? html`<small>${q.help}</small>` : ''}</th>
            ${NOTES.map(() => html`<td>${caseACocher()}</td>`)}
          </tr>`)}
        </tbody>
      </table>`;
    }
    const { q, num } = b.item;
    const consigne = q.type === 'multiple' ? 'plusieurs réponses possibles' : (q.type === 'texte' ? '' : 'une seule réponse');
    let corps;
    if (q.type === 'texte') {
      corps = html`<div class="qp-lignes"><span></span><span></span><span></span></div>`;
    } else {
      const opts = q.type === 'oui_non' ? ['Oui', 'Non'] : q.options;
      corps = html`<ul class="qp-options${opts.length > 4 ? ' qp-options-colonnes' : ''}">${opts.map((o) => html`<li>${caseACocher()}<span>${o}</span></li>`)}</ul>`;
    }
    return html`
      <div class="qp-question">
        <p class="qp-intitule"><span class="qp-num">${num}.</span> ${q.label}${consigne ? html` <em>(${consigne})</em>` : ''}</p>
        ${q.help ? html`<p class="qp-aide">${q.help}</p>` : ''}
        ${corps}
      </div>`;
  });

  const feuille = html`
  <section class="feuille-flux questionnaire-papier">
    <header class="qp-tete">
      ${marque(settings)}
      ${avecQr ? html`<div class="qp-qr">${raw(qrSvg)}<span>Vous préférez répondre sur téléphone&nbsp;? Scannez ce code.</span></div>` : ''}
    </header>
    <div class="qp-titre">
      <p class="surtitre">Questionnaire de satisfaction</p>
      <h1>${survey.title}</h1>
      ${paragraphs(survey.intro)}
    </div>
    <div class="qp-consigne">
      <p><strong>Comment répondre&nbsp;?</strong> Avec un stylo, cochez la case qui correspond à votre avis, comme ceci&nbsp;: <span class="qp-case qp-case-exemple" aria-hidden="true">✕</span>. Il n’y a pas de bonne ou de mauvaise réponse et ce questionnaire est anonyme.</p>
    </div>
    ${rendus}
    <footer class="qp-pied">
      <div>
        <p class="qp-merci">Merci pour votre temps&nbsp;!</p>
        <p>${settings.urne}</p>
        <p class="qp-signature">L’équipe de ${settings.nom}</p>
      </div>
      <div class="qp-reserve"><span>Réservé à la boutique</span><span>${caseACocher()} Saisi</span></div>
    </footer>
  </section>`;

  const options = html`
    <form class="impression-options" method="get">
      <label class="case"><input type="checkbox" name="qr" value="1"${avecQr ? raw(' checked') : ''} data-soumettre> Ajouter un petit QR code en haut</label>
    </form>`;

  return cadre({ req, settings, survey, format: 'questionnaire', titre: 'Questionnaire papier', options, feuilles: feuille, pleine: false });
}

module.exports = { affiche, cartes, questionnaire };
