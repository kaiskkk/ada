'use strict';

const { html, paragraphs } = require('../html');
const { head, marque, epi, champQuestion, dureeEstimee, icone } = require('./common');

function page({ title, settings, body, className = '' }) {
  return html`${head({ title })}
<body class="public ${className}">
  <header class="public-entete">
    ${marque(settings)}
  </header>
  ${body}
  <footer class="public-pied">
    <span class="pied-epi">${epi()}</span>
    <p>${settings.nom}${settings.adresse ? ` · ${settings.adresse}` : ''}</p>
  </footer>
  <script src="/js/sondage.js" defer></script>
</body>
</html>`;
}

function sondage({ survey, questions, settings, valeurs = {}, erreurs = {}, action }) {
  const nbErreurs = Object.keys(erreurs).length;
  const duree = dureeEstimee(questions);
  return page({
    title: `${survey.title} · ${settings.nom}`,
    settings,
    body: html`
  <div class="progression" aria-hidden="true"><span class="progression-barre"></span></div>
  <main class="sondage">
    <section class="sondage-tete">
      <p class="surtitre">Votre avis compte</p>
      <h1>${survey.title}</h1>
      <div class="sondage-intro">${paragraphs(survey.intro)}</div>
      <ul class="rassurance">
        <li>${icone('coche')} ${questions.length} questions</li>
        <li>${icone('coche')} Environ ${duree} minute${duree > 1 ? 's' : ''}</li>
        <li>${icone('coche')} Anonyme</li>
      </ul>
    </section>

    ${nbErreurs ? html`<p class="alerte alerte-erreur" role="alert">Il manque ${nbErreurs > 1 ? `${nbErreurs} réponses` : 'une réponse'}. Les questions concernées sont signalées en rouge.</p>` : ''}

    <form class="questionnaire" method="post" action="${action}" data-total="${questions.length}">
      ${questions.map((q, i) => champQuestion(q, i, valeurs[q.id] || [], erreurs[q.id]))}
      <div class="pot" aria-hidden="true">
        <label>Ne pas remplir ce champ <input type="text" name="site_web" tabindex="-1" autocomplete="off"></label>
      </div>
      <div class="envoi">
        <button class="bouton bouton-grand" type="submit">Envoyer mon avis</button>
        <p>Les questions marquées d’un <span class="requis">*</span> sont obligatoires. Vos réponses restent anonymes.</p>
      </div>
    </form>
  </main>`,
  });
}

function merci({ survey, settings }) {
  return page({
    title: `Merci ! · ${settings.nom}`,
    settings,
    className: 'page-merci',
    body: html`
  <main class="merci">
    <div class="merci-carte">
      <div class="merci-embleme">${epi()}</div>
      <p class="surtitre">C’est envoyé</p>
      <h1>Merci beaucoup&nbsp;!</h1>
      <div class="merci-texte">${paragraphs(survey.thanks || 'Votre avis a bien été reçu. Il nous aide à faire encore mieux, chaque matin.')}</div>
      <p class="merci-signature">L’équipe de ${settings.nom}</p>
    </div>
  </main>`,
  });
}

function message({ settings, titre, texte, surtitre = '' }) {
  return page({
    title: `${titre} · ${settings.nom}`,
    settings,
    className: 'page-merci',
    body: html`
  <main class="merci">
    <div class="merci-carte">
      <div class="merci-embleme">${epi()}</div>
      ${surtitre ? html`<p class="surtitre">${surtitre}</p>` : ''}
      <h1>${titre}</h1>
      <div class="merci-texte">${paragraphs(texte)}</div>
    </div>
  </main>`,
  });
}

module.exports = { sondage, merci, message };
