'use strict';

const { html, raw, paragraphs, dateFr, dateCourte, nombre, pluriel } = require('../html');
const { TYPES, NOTES } = require('../db');
const { head, marque, visage, icone, champQuestion, epi } = require('./common');

const FLASH = {
  enregistre: 'Modifications enregistrées.',
  question_ajoutee: 'Question ajoutée.',
  question_modifiee: 'Question modifiée.',
  question_supprimee: 'Question supprimée.',
  reponse_enregistree: 'Questionnaire papier enregistré. Vous pouvez saisir le suivant.',
  reponse_supprimee: 'Réponse supprimée.',
  sondage_cree: 'Sondage créé. Ajoutez vos questions, puis cochez « Ouvert aux réponses » dans les réglages.',
  sondage_duplique: 'Copie créée. Elle est fermée aux réponses tant que vous ne l’ouvrez pas.',
  sondage_supprime: 'Sondage supprimé.',
  mdp: 'Mot de passe modifié.',
};

const csrfField = (csrf) => html`<input type="hidden" name="_csrf" value="${csrf}">`;

function page({ title, req, body, settings, flash, erreur, actif = 'sondages', className = '' }) {
  const message = flash && FLASH[flash];
  return html`${head({ title: `${title} · Admin ${settings.nom}`, robots: true })}
<body class="admin ${className}">
  <header class="admin-barre">
    <div class="admin-barre-in">
      <a class="admin-logo" href="/admin">${marque(settings, { petite: true })}<span class="admin-etiquette">Admin</span></a>
      <nav class="admin-nav" aria-label="Menu administrateur">
        <a href="/admin"${actif === 'sondages' ? raw(' aria-current="page"') : ''}>${icone('liste')}<span>Sondages</span></a>
        <a href="/admin/parametres"${actif === 'parametres' ? raw(' aria-current="page"') : ''}>${icone('reglages')}<span>Paramètres</span></a>
      </nav>
      <form method="post" action="/admin/deconnexion" class="admin-sortie">
        ${csrfField(req.csrf)}
        <button type="submit" class="bouton-texte" title="Se déconnecter (${req.admin.email})">${icone('sortie')}<span>Déconnexion</span></button>
      </form>
    </div>
  </header>
  <main class="admin-contenu">
    ${message ? html`<p class="alerte alerte-ok" role="status">${icone('coche')} ${message}</p>` : ''}
    ${erreur ? html`<p class="alerte alerte-erreur" role="alert">${erreur}</p>` : ''}
    ${body}
  </main>
  <script src="/js/admin.js" defer></script>
  <script src="/js/sondage.js" defer></script>
</body>
</html>`;
}

/* ---------- Connexion ---------- */

function connexion({ settings, erreur = '', email = '', suite = '' }) {
  return html`${head({ title: `Connexion · ${settings.nom}`, robots: true })}
<body class="connexion">
  <main class="connexion-carte">
    <div class="connexion-embleme">${epi()}</div>
    <p class="surtitre">Espace administrateur</p>
    <h1>${settings.nom}</h1>
    <p class="connexion-sous">Gérez vos sondages, imprimez les feuilles et consultez les avis de vos clients.</p>
    ${erreur ? html`<p class="alerte alerte-erreur" role="alert">${erreur}</p>` : ''}
    <form method="post" action="/admin/connexion" class="pile">
      <input type="hidden" name="suite" value="${suite}">
      <label class="champ"><span>Adresse e-mail</span>
        <input type="email" name="email" value="${email}" autocomplete="username" required autofocus></label>
      <label class="champ"><span>Mot de passe</span>
        <span class="mdp"><input type="password" name="password" autocomplete="current-password" required>
        <button type="button" class="mdp-voir" data-voir-mdp aria-label="Afficher le mot de passe">${icone('oeil')}</button></span></label>
      <button class="bouton bouton-grand" type="submit">Se connecter</button>
    </form>
    <a class="connexion-retour" href="/">${icone('retour')} Retour au sondage</a>
  </main>
  <script src="/js/admin.js" defer></script>
</body>
</html>`;
}

/* ---------- Tableau de bord ---------- */

function statut(survey) {
  return survey.is_open
    ? html`<span class="statut statut-ouvert"><span class="point"></span>Ouvert</span>`
    : html`<span class="statut statut-ferme"><span class="point"></span>Fermé</span>`;
}

function tableauDeBord({ req, settings, surveys, flash }) {
  return page({
    title: 'Sondages', req, settings, flash,
    body: html`
    <div class="titre-ligne">
      <div>
        <p class="surtitre">Bonjour</p>
        <h1>Vos sondages</h1>
      </div>
      <form class="nouveau-sondage" method="post" action="/admin/sondages">
        ${csrfField(req.csrf)}
        <label class="sr" for="nouveau-titre">Titre du nouveau sondage</label>
        <input id="nouveau-titre" name="title" required maxlength="120" placeholder="Titre d’un nouveau sondage…">
        <button class="bouton" type="submit">${icone('plus')} Créer</button>
      </form>
    </div>

    ${surveys.length ? html`
    <div class="cartes-sondages">
      ${surveys.map((s) => html`
      <article class="carte carte-sondage">
        <div class="carte-sondage-haut">
          ${statut(s)}
          <span class="discret">${pluriel(s.nb_questions, 'question')}</span>
        </div>
        <h2><a href="/admin/sondages/${s.id}">${s.title}</a></h2>
        <dl class="chiffres">
          <div><dt>Réponses</dt><dd>${s.nb_reponses}</dd></div>
          <div><dt>dont papier</dt><dd>${s.nb_papier}</dd></div>
          <div><dt>Note moyenne</dt><dd>${s.moyenne ? html`${nombre(s.moyenne)}<small>/5</small>` : '—'}</dd></div>
        </dl>
        <p class="discret">${s.derniere_reponse ? `Dernière réponse le ${dateFr(s.derniere_reponse)}` : 'Pas encore de réponse'}</p>
        <div class="carte-sondage-actions">
          <a class="bouton bouton-clair" href="/admin/sondages/${s.id}">${icone('crayon')} Questions</a>
          <a class="bouton bouton-clair" href="/admin/sondages/${s.id}/resultats">${icone('graphique')} Résultats</a>
          <a class="bouton bouton-clair" href="/admin/sondages/${s.id}/partager">${icone('imprimer')} Imprimer</a>
        </div>
      </article>`)}
    </div>` : html`
    <div class="carte vide">
      <p>Aucun sondage pour l’instant. Donnez un titre ci-dessus et cliquez sur « Créer ».</p>
    </div>`}`,
  });
}

/* ---------- En-tête d'un sondage + onglets ---------- */

function enteteSondage(survey, onglet, url) {
  const onglets = [
    ['questions', `/admin/sondages/${survey.id}`, 'Questions', 'crayon'],
    ['resultats', `/admin/sondages/${survey.id}/resultats`, 'Résultats', 'graphique'],
    ['reponses', `/admin/sondages/${survey.id}/reponses`, 'Réponses', 'liste'],
    ['saisie', `/admin/sondages/${survey.id}/saisie`, 'Saisie papier', 'papier'],
    ['partager', `/admin/sondages/${survey.id}/partager`, 'Imprimer & partager', 'qr'],
  ];
  return html`
    <div class="entete-sondage">
      <a class="retour" href="/admin">${icone('retour')} Tous les sondages</a>
      <div class="titre-ligne">
        <div>
          <h1>${survey.title}</h1>
          <p class="entete-sondage-meta">${statut(survey)} <span class="discret">${url}</span></p>
        </div>
        <a class="bouton bouton-clair" href="/s/${survey.slug}" target="_blank" rel="noopener">${icone('oeil')} Voir comme un client</a>
      </div>
      <nav class="onglets" aria-label="Sections du sondage">
        ${onglets.map(([cle, href, libelle, ic]) => html`<a href="${href}"${cle === onglet ? raw(' aria-current="page"') : ''}>${icone(ic)}<span>${libelle}</span></a>`)}
      </nav>
    </div>`;
}

/* ---------- Éditeur de questions ---------- */

const APERCUS = {
  note: () => html`<span class="apercu-visages">${[1, 3, 5].map((n) => visage(n))}</span>`,
  choix: () => raw('<span class="apercu-lignes"><i class="rond plein"></i><i class="rond"></i><i class="rond"></i></span>'),
  multiple: () => raw('<span class="apercu-lignes"><i class="carre plein"></i><i class="carre plein"></i><i class="carre"></i></span>'),
  oui_non: () => raw('<span class="apercu-ouinon"><b>Oui</b><b>Non</b></span>'),
  texte: () => raw('<span class="apercu-texte"><i></i><i></i><i></i></span>'),
};

function champsQuestion(q = {}) {
  const type = q.type || 'note';
  return html`
    <fieldset class="types">
      <legend>Type de réponse</legend>
      <div class="types-grille">
        ${Object.entries(TYPES).map(([cle, t]) => html`
        <label class="type-carte">
          <input type="radio" name="type" value="${cle}"${cle === type ? raw(' checked') : ''}>
          <span class="type-apercu">${APERCUS[cle]()}</span>
          <span class="type-nom">${t.label}</span>
        </label>`)}
      </div>
    </fieldset>
    <label class="champ"><span>Intitulé de la question</span>
      <input name="label" value="${q.label || ''}" required maxlength="300" placeholder="Ex. : Comment trouvez-vous nos croissants ?"></label>
    <label class="champ champ-options"><span>Choix proposés <small>— un par ligne</small></span>
      <textarea name="options" rows="5" placeholder="Baguette&#10;Pain de campagne&#10;Croissant">${(q.options || []).join('\n')}</textarea></label>
    <label class="champ"><span>Précision <small>— facultatif, affichée sous la question</small></span>
      <input name="help" value="${q.help || ''}" maxlength="300" placeholder="Ex. : goût, fraîcheur, cuisson"></label>
    <label class="case"><input type="checkbox" name="required" value="1"${q.required ? raw(' checked') : ''}> Réponse obligatoire en ligne</label>`;
}

function editeur({ req, settings, survey, questions, flash, erreur, url, nbReponses }) {
  return page({
    title: survey.title, req, settings, flash, erreur,
    body: html`
    ${enteteSondage(survey, 'questions', url)}
    <div class="editeur">
      <section class="editeur-questions">
        <h2 class="section-titre">Questions <span class="compteur">${questions.length}</span></h2>
        ${nbReponses ? html`<p class="note-info">Ce sondage a déjà ${pluriel(nbReponses, 'réponse')}. Supprimer une question efface aussi ses réponses ; renommer un choix garde les anciennes réponses sous l’ancien nom.</p>` : ''}
        ${questions.length ? html`
        <ol class="q-liste">
          ${questions.map((q, i) => html`
          <li class="carte q-item" id="q-${q.id}">
            <div class="q-resume">
              <span class="q-num">${i + 1}</span>
              <div class="q-corps">
                <p class="q-type">${TYPES[q.type] ? TYPES[q.type].court : q.type}${q.required ? ' · obligatoire' : ''}</p>
                <h3>${q.label}</h3>
                ${q.help ? html`<p class="q-aide">${q.help}</p>` : ''}
                ${q.type === 'note' ? html`<p class="q-visages">${[1, 2, 3, 4, 5].map((n) => visage(n))}</p>` : ''}
                ${q.options.length && TYPES[q.type] && TYPES[q.type].options ? html`<ul class="q-options">${q.options.map((o) => html`<li>${o}</li>`)}</ul>` : ''}
              </div>
              <div class="q-actions">
                <form method="post" action="/admin/questions/${q.id}/monter">${csrfField(req.csrf)}
                  <button class="bouton-icone" type="submit" aria-label="Monter la question"${i === 0 ? raw(' disabled') : ''}>${icone('haut')}</button></form>
                <form method="post" action="/admin/questions/${q.id}/descendre">${csrfField(req.csrf)}
                  <button class="bouton-icone" type="submit" aria-label="Descendre la question"${i === questions.length - 1 ? raw(' disabled') : ''}>${icone('bas')}</button></form>
              </div>
            </div>
            <details class="q-edition">
              <summary>${icone('crayon')} Modifier</summary>
              <form method="post" action="/admin/questions/${q.id}" class="form-question pile">
                ${csrfField(req.csrf)}
                ${champsQuestion(q)}
                <div class="boutons">
                  <button class="bouton" type="submit">Enregistrer la question</button>
                </div>
              </form>
              <form method="post" action="/admin/questions/${q.id}/supprimer" class="q-supprimer" data-confirmer="Supprimer la question « ${q.label} »${nbReponses ? ' et ses réponses' : ''} ?">
                ${csrfField(req.csrf)}
                <button class="bouton-texte danger" type="submit">${icone('poubelle')} Supprimer cette question</button>
              </form>
            </details>
          </li>`)}
        </ol>` : html`<div class="carte vide"><p>Pas encore de question. Ajoutez la première ci-dessous.</p></div>`}

        <section class="carte ajout" id="ajouter">
          <h2 class="section-titre">${icone('plus')} Ajouter une question</h2>
          <form method="post" action="/admin/sondages/${survey.id}/questions" class="form-question pile">
            ${csrfField(req.csrf)}
            ${champsQuestion()}
            <div class="boutons"><button class="bouton" type="submit">Ajouter la question</button></div>
          </form>
        </section>
      </section>

      <aside class="editeur-reglages">
        <section class="carte">
          <h2 class="section-titre">Réglages</h2>
          <form method="post" action="/admin/sondages/${survey.id}" class="pile">
            ${csrfField(req.csrf)}
            <label class="interrupteur">
              <input type="checkbox" name="is_open" value="1"${survey.is_open ? raw(' checked') : ''}>
              <span class="interrupteur-piste"><span></span></span>
              <span>Ouvert aux réponses</span>
            </label>
            <label class="champ"><span>Titre</span><input name="title" value="${survey.title}" required maxlength="120"></label>
            <label class="champ"><span>Texte d’accueil</span><textarea name="intro" rows="4" maxlength="1500">${survey.intro}</textarea></label>
            <label class="champ"><span>Message de remerciement</span><textarea name="thanks" rows="3" maxlength="1000">${survey.thanks}</textarea></label>
            <label class="champ"><span>Adresse du lien <small>— /s/…</small></span>
              <span class="prefixe"><span>/s/</span><input name="slug" value="${survey.slug}" maxlength="40" pattern="[a-z0-9-]+" title="Lettres minuscules, chiffres et tirets"></span></label>
            <p class="note-info">Changer l’adresse rend les QR codes déjà imprimés inutilisables.</p>
            <button class="bouton" type="submit">Enregistrer</button>
          </form>
        </section>
        <section class="carte zone-actions">
          <form method="post" action="/admin/sondages/${survey.id}/dupliquer">${csrfField(req.csrf)}
            <button class="bouton bouton-clair" type="submit">${icone('dupliquer')} Dupliquer ce sondage</button></form>
          <form method="post" action="/admin/sondages/${survey.id}/supprimer" data-confirmer="Supprimer définitivement « ${survey.title} » et toutes ses réponses ?">${csrfField(req.csrf)}
            <button class="bouton-texte danger" type="submit">${icone('poubelle')} Supprimer le sondage</button></form>
        </section>
      </aside>
    </div>`,
  });
}

/* ---------- Résultats ---------- */

function puce(href, libelle, actif) {
  return html`<a class="puce" href="${href}"${actif ? raw(' aria-current="true"') : ''}>${libelle}</a>`;
}

function barre({ libelle, compte, part, avant = '' }) {
  const pct = Math.round(part * 100);
  return html`
    <div class="barre-ligne" title="${libelle} : ${pluriel(compte, 'réponse')} (${pct} %)">
      <span class="barre-libelle">${avant}${libelle}</span>
      <span class="barre-piste"><span class="barre" style="width:${Math.max(part * 100, compte ? 1.5 : 0).toFixed(1)}%"></span></span>
      <span class="barre-valeur">${compte}<small> · ${pct} %</small></span>
    </div>`;
}

function resultats({ req, settings, survey, url, resultats: res, totaux, moyenne, periode, source }) {
  const base = `/admin/sondages/${survey.id}/resultats`;
  const lien = (p, s) => {
    const params = new URLSearchParams();
    if (p) params.set('periode', p);
    if (s) params.set('source', s);
    const q = params.toString();
    return q ? `${base}?${q}` : base;
  };
  const notes = res.filter((r) => r.q.type === 'note' && r.moyenne !== null);
  const total = totaux.total || 0;

  return page({
    title: `Résultats · ${survey.title}`, req, settings,
    body: html`
    ${enteteSondage(survey, 'resultats', url)}
    <div class="filtres">
      <div class="filtre-groupe" role="group" aria-label="Période">
        ${puce(lien('', source), 'Tout', !periode)}
        ${puce(lien('365', source), '12 mois', periode === '365')}
        ${puce(lien('30', source), '30 jours', periode === '30')}
        ${puce(lien('7', source), '7 jours', periode === '7')}
      </div>
      <div class="filtre-groupe" role="group" aria-label="Origine des réponses">
        ${puce(lien(periode, ''), 'Toutes', !source)}
        ${puce(lien(periode, 'en_ligne'), 'En ligne', source === 'en_ligne')}
        ${puce(lien(periode, 'papier'), 'Papier', source === 'papier')}
      </div>
      <div class="filtre-actions">
        <a class="bouton bouton-clair" href="/admin/sondages/${survey.id}/export.csv">${icone('telecharger')} Export Excel (CSV)</a>
        <button class="bouton bouton-clair" type="button" data-imprimer>${icone('imprimer')} Imprimer</button>
      </div>
    </div>

    <div class="kpis">
      <div class="kpi"><span class="kpi-libelle">Réponses</span><span class="kpi-valeur">${total}</span></div>
      <div class="kpi"><span class="kpi-libelle">dont questionnaires papier</span><span class="kpi-valeur">${totaux.papier || 0}</span></div>
      <div class="kpi"><span class="kpi-libelle">Note moyenne</span><span class="kpi-valeur">${moyenne !== null ? html`${nombre(moyenne)}<small>/5</small>` : '—'}</span></div>
      <div class="kpi"><span class="kpi-libelle">Dernière réponse</span><span class="kpi-valeur kpi-date">${totaux.derniere ? dateFr(totaux.derniere, false) : '—'}</span></div>
    </div>

    ${!total ? html`<div class="carte vide"><p>Aucune réponse sur cette période. Partagez le QR code ou saisissez des questionnaires papier.</p></div>` : html`
    ${notes.length > 1 ? html`
    <section class="carte apercu-notes">
      <h2 class="section-titre">Les notes en un coup d’œil <small>moyenne sur 5</small></h2>
      ${notes.map((r) => html`
      <div class="barre-ligne barre-ligne-note" title="${r.q.label} : ${nombre(r.moyenne)} sur 5 (${pluriel(r.repondants, 'réponse')})">
        <span class="barre-libelle">${r.q.label}</span>
        <span class="barre-piste"><span class="barre" style="width:${(r.moyenne / 5 * 100).toFixed(1)}%"></span></span>
        <span class="barre-valeur">${nombre(r.moyenne)}</span>
      </div>`)}
    </section>` : ''}

    <div class="resultats-grille">
      ${res.map((r, i) => html`
      <section class="carte resultat${r.q.type === 'texte' ? ' resultat-large' : ''}">
        <p class="q-type">Question ${i + 1} · ${TYPES[r.q.type] ? TYPES[r.q.type].court : r.q.type}</p>
        <h3>${r.q.label}</h3>
        <p class="discret">${r.repondants ? pluriel(r.repondants, 'réponse') : 'Pas de réponse'}</p>
        ${r.q.type === 'note' ? html`
          ${r.moyenne !== null ? html`<p class="note-grosse">${nombre(r.moyenne)}<small>/5</small></p>` : ''}
          <div class="barres">${r.lignes.map((l) => barre({ ...l, avant: visage(l.note, 'barre-visage') }))}</div>`
        : r.q.type === 'texte' ? html`
          ${r.textes.length ? html`<ul class="citations">${r.textes.map((t) => html`
            <li><blockquote>${t.texte}</blockquote><p class="discret">${dateFr(t.date)}${t.source === 'papier' ? ' · papier' : ''}</p></li>`)}</ul>` : ''}`
        : html`<div class="barres">${r.lignes.map((l) => barre({ ...l, libelle: l.ancienne ? `${l.libelle} (ancien choix)` : l.libelle }))}</div>
          ${r.q.type === 'multiple' ? html`<p class="discret">Pourcentages calculés sur les personnes ayant répondu ; plusieurs choix possibles.</p>` : ''}`}
      </section>`)}
    </div>`}`,
  });
}

/* ---------- Réponses une par une ---------- */

function reponses({ req, settings, survey, url, questions, liste, page: numPage, pages, total, source, flash }) {
  const base = `/admin/sondages/${survey.id}/reponses`;
  const lien = (p, s) => {
    const params = new URLSearchParams();
    if (s) params.set('source', s);
    if (p > 1) params.set('page', p);
    const q = params.toString();
    return q ? `${base}?${q}` : base;
  };
  return page({
    title: `Réponses · ${survey.title}`, req, settings, flash,
    body: html`
    ${enteteSondage(survey, 'reponses', url)}
    <div class="filtres">
      <div class="filtre-groupe" role="group" aria-label="Origine des réponses">
        ${puce(lien(1, ''), 'Toutes', !source)}
        ${puce(lien(1, 'en_ligne'), 'En ligne', source === 'en_ligne')}
        ${puce(lien(1, 'papier'), 'Papier', source === 'papier')}
      </div>
      <p class="discret">${pluriel(total, 'réponse')}</p>
    </div>
    ${liste.length ? html`
    <div class="reponses">
      ${liste.map((r) => html`
      <article class="carte reponse">
        <header class="reponse-tete">
          <h2>Réponse n° ${r.id}</h2>
          <span class="etiquette${r.source === 'papier' ? ' etiquette-papier' : ''}">${r.source === 'papier' ? 'Papier' : 'En ligne'}</span>
          <span class="discret">${dateFr(r.created_at)}</span>
          <form method="post" action="/admin/reponses/${r.id}/supprimer" data-confirmer="Supprimer la réponse n° ${r.id} ?">
            ${csrfField(req.csrf)}
            <button class="bouton-icone danger" type="submit" aria-label="Supprimer la réponse n° ${r.id}">${icone('poubelle')}</button>
          </form>
        </header>
        <dl class="reponse-detail">
          ${questions.map((q) => {
            const v = r.answers.get(q.id);
            if (!v || !v.length) return '';
            const val = q.type === 'note' ? html`<span class="mini-note">${visage(Number(v[0]), 'mini-visage')} ${v[0]}/5 · ${NOTES[Number(v[0]) - 1] || ''}</span>` : v.join(', ');
            return html`<div><dt>${q.label}</dt><dd>${val}</dd></div>`;
          })}
        </dl>
      </article>`)}
    </div>
    ${pages > 1 ? html`
    <nav class="pagination" aria-label="Pages">
      ${numPage > 1 ? html`<a class="bouton bouton-clair" href="${lien(numPage - 1, source)}">${icone('retour')} Plus récentes</a>` : html`<span></span>`}
      <span class="discret">Page ${numPage} sur ${pages}</span>
      ${numPage < pages ? html`<a class="bouton bouton-clair" href="${lien(numPage + 1, source)}">Plus anciennes</a>` : html`<span></span>`}
    </nav>` : ''}` : html`<div class="carte vide"><p>Aucune réponse pour l’instant.</p></div>`}`,
  });
}

/* ---------- Saisie d'un questionnaire papier ---------- */

function saisie({ req, settings, survey, url, questions, flash, aujourdhui }) {
  return page({
    title: `Saisie papier · ${survey.title}`, req, settings, flash,
    className: 'page-saisie',
    body: html`
    ${enteteSondage(survey, 'saisie', url)}
    <div class="saisie">
      <div class="note-info note-info-grande">
        ${icone('papier')}
        <p>Recopiez ici un questionnaire rempli à la main. Il est ajouté aux résultats avec la mention « papier ». Laissez vide ce que la personne n’a pas rempli.</p>
      </div>
      ${questions.length ? html`
      <form method="post" action="/admin/sondages/${survey.id}/saisie" class="questionnaire questionnaire-saisie">
        ${csrfField(req.csrf)}
        <label class="champ champ-date"><span>Date du questionnaire</span><input type="date" name="date" value="${aujourdhui}" max="${aujourdhui}"></label>
        ${questions.map((q, i) => champQuestion({ ...q, required: false }, i))}
        <div class="envoi"><button class="bouton bouton-grand" type="submit">Enregistrer ce questionnaire</button></div>
      </form>` : html`<div class="carte vide"><p>Ajoutez d’abord des questions au sondage.</p></div>`}
    </div>`,
  });
}

/* ---------- Imprimer & partager ---------- */

// Petites illustrations des trois formats imprimables.
const C = { papier: '#FFFCF7', encre: '#2B1C12', dore: '#B26A24', pale: '#F4E3C8', trait: '#D9C8B0' };

function miniQr(x, y, t) {
  const m = t / 21;
  let out = `<rect x="${x}" y="${y}" width="${t}" height="${t}" fill="#fff"/>`;
  const finder = (fx, fy) => `<rect x="${x + fx * m}" y="${y + fy * m}" width="${7 * m}" height="${7 * m}" fill="${C.encre}"/>`
    + `<rect x="${x + (fx + 1) * m}" y="${y + (fy + 1) * m}" width="${5 * m}" height="${5 * m}" fill="#fff"/>`
    + `<rect x="${x + (fx + 2) * m}" y="${y + (fy + 2) * m}" width="${3 * m}" height="${3 * m}" fill="${C.encre}"/>`;
  out += finder(0, 0) + finder(14, 0) + finder(0, 14);
  for (let i = 0; i < 21; i++) {
    for (let j = 0; j < 21; j++) {
      const coin = (i < 8 && j < 8) || (i > 12 && j < 8) || (i < 8 && j > 12);
      if (!coin && (i * 7 + j * 13 + i * j) % 5 < 2) out += `<rect x="${(x + i * m).toFixed(2)}" y="${(y + j * m).toFixed(2)}" width="${m.toFixed(2)}" height="${m.toFixed(2)}" fill="${C.encre}"/>`;
    }
  }
  return out;
}

const feuille = (contenu) => raw(`<svg viewBox="0 0 92 130" xmlns="http://www.w3.org/2000/svg"><rect width="92" height="130" rx="2.5" fill="${C.papier}"/>${contenu}</svg>`);

const MINIATURES = {
  affiche: () => feuille(`
    <circle cx="46" cy="12" r="4.5" fill="${C.encre}"/>
    <rect x="22" y="21" width="48" height="5" rx="2" fill="${C.encre}"/>
    <rect x="27" y="29" width="38" height="4" rx="2" fill="${C.dore}"/>
    <rect x="25" y="39" width="42" height="42" rx="3" fill="#fff" stroke="${C.trait}"/>
    ${miniQr(29, 43, 34)}
    <circle cx="26" cy="91" r="3.5" fill="${C.pale}"/><circle cx="46" cy="91" r="3.5" fill="${C.pale}"/><circle cx="66" cy="91" r="3.5" fill="${C.pale}"/>
    <rect x="19" y="97" width="14" height="2" rx="1" fill="${C.trait}"/><rect x="39" y="97" width="14" height="2" rx="1" fill="${C.trait}"/><rect x="59" y="97" width="14" height="2" rx="1" fill="${C.trait}"/>
    <rect x="9" y="106" width="74" height="13" rx="3" fill="${C.pale}"/>`),
  cartes: () => {
    let c = '';
    for (let r = 0; r < 4; r++) {
      for (let k = 0; k < 2; k++) {
        const x = k * 46;
        const y = r * 32.5;
        c += `<circle cx="${x + 7}" cy="${y + 8}" r="2.5" fill="${C.encre}"/>
          <rect x="${x + 5}" y="${y + 14}" width="18" height="3" rx="1.5" fill="${C.encre}"/>
          <rect x="${x + 5}" y="${y + 20}" width="16" height="1.6" rx=".8" fill="${C.trait}"/>
          <rect x="${x + 5}" y="${y + 23}" width="12" height="1.6" rx=".8" fill="${C.trait}"/>
          ${miniQr(x + 26, y + 9, 15)}`;
      }
    }
    c += `<path d="M46 0V130M0 32.5H92M0 65H92M0 97.5H92" stroke="${C.trait}" stroke-dasharray="2 1.5" stroke-width=".7"/>`;
    return feuille(c);
  },
  questionnaire: () => {
    let c = `<circle cx="11" cy="11" r="4" fill="${C.encre}"/><rect x="17" y="9" width="26" height="4" rx="2" fill="${C.encre}"/>
      <rect x="8" y="18" width="76" height=".8" fill="${C.encre}"/>
      <rect x="8" y="23" width="44" height="4.5" rx="2" fill="${C.encre}"/>
      <rect x="8" y="31" width="76" height="6" rx="1.5" fill="${C.pale}"/>`;
    for (let r = 0; r < 6; r++) {
      const y = 42 + r * 7.5;
      c += `<rect x="8" y="${y + 1}" width="${22 + (r % 3) * 5}" height="2.2" rx="1" fill="${C.encre}" opacity=".75"/>`;
      for (let k = 0; k < 5; k++) c += `<rect x="${47 + k * 8}" y="${y}" width="4.5" height="4.5" rx="1" fill="#fff" stroke="${C.encre}" stroke-width=".7"/>`;
    }
    c += `<rect x="8" y="90" width="40" height="2.2" rx="1" fill="${C.encre}" opacity=".75"/>`;
    for (let k = 0; k < 3; k++) c += `<rect x="${8 + k * 25}" y="96" width="4.5" height="4.5" rx="1" fill="#fff" stroke="${C.encre}" stroke-width=".7"/><rect x="${15 + k * 25}" y="97.5" width="13" height="1.6" rx=".8" fill="${C.trait}"/>`;
    c += `<rect x="8" y="107" width="34" height="2.2" rx="1" fill="${C.encre}" opacity=".75"/>
      <rect x="8" y="115" width="76" height=".6" fill="${C.trait}"/><rect x="8" y="121" width="76" height=".6" fill="${C.trait}"/>`;
    return feuille(c);
  },
};


function partager({ req, settings, survey, url, qrSvg, local }) {
  const formats = [
    {
      cle: 'affiche', titre: 'Affiche avec QR code', icone: 'qr',
      texte: 'Une page A4 à mettre en vitrine ou près de la caisse : grand QR code et explication pas à pas pour ceux qui ne connaissent pas.',
    },
    {
      cle: 'cartes', titre: 'Petites cartes à découper', icone: 'ciseaux',
      texte: 'Huit cartes par page A4 à glisser avec le pain ou à poser sur le comptoir. Un trait de coupe sépare chaque carte.',
    },
    {
      cle: 'questionnaire', titre: 'Questionnaire papier', icone: 'papier',
      texte: 'Toutes les questions imprimées en gros caractères, avec des cases à cocher. Idéal pour les clients sans smartphone.',
    },
  ];
  return page({
    title: `Imprimer & partager · ${survey.title}`, req, settings,
    body: html`
    ${enteteSondage(survey, 'partager', url)}
    ${!survey.is_open ? html`<p class="alerte alerte-attention">Ce sondage est fermé : les clients qui scannent le QR code verront un message « sondage terminé ». Ouvrez-le dans l’onglet Questions.</p>` : ''}
    ${local ? html`<p class="alerte alerte-attention">Le site tourne sur votre ordinateur (${url}) : ce QR code ne marchera pas sur les téléphones des clients. Mettez le site en ligne ou indiquez son adresse publique dans PUBLIC_URL (voir le README).</p>` : ''}
    <div class="partage">
      <section class="carte partage-lien">
        <div class="partage-qr">${raw(qrSvg)}</div>
        <div class="partage-infos">
          <h2 class="section-titre">Le lien du sondage</h2>
          <div class="copie">
            <input type="text" readonly value="${url}" aria-label="Lien du sondage" data-lien>
            <button class="bouton" type="button" data-copier>${icone('copier')} Copier</button>
          </div>
          <p class="discret">À envoyer par SMS, WhatsApp, e-mail ou à publier sur vos réseaux.</p>
          <div class="boutons">
            <a class="bouton bouton-clair" href="/admin/sondages/${survey.id}/qr.png" download="qr-${survey.slug}.png">${icone('telecharger')} QR code en image (PNG)</a>
            <a class="bouton bouton-clair" href="/admin/sondages/${survey.id}/qr.svg" download="qr-${survey.slug}.svg">${icone('telecharger')} Format SVG (imprimeur)</a>
          </div>
        </div>
      </section>

      <h2 class="section-titre">Feuilles à imprimer</h2>
      <div class="formats">
        ${formats.map((f) => html`
        <a class="carte format" href="/admin/sondages/${survey.id}/imprimer/${f.cle}">
          <span class="format-mini" aria-hidden="true">${MINIATURES[f.cle]()}</span>
          <span class="format-texte">
            <strong>${icone(f.icone)} ${f.titre}</strong>
            <span>${f.texte}</span>
          </span>
          <span class="format-action">${icone('imprimer')} Aperçu et impression</span>
        </a>`)}
      </div>
    </div>`,
  });
}

/* ---------- Paramètres ---------- */

function parametres({ req, settings, flash, erreur }) {
  return page({
    title: 'Paramètres', req, settings, flash, erreur, actif: 'parametres',
    body: html`
    <div class="titre-ligne"><div><p class="surtitre">Réglages</p><h1>Paramètres</h1></div></div>
    <div class="parametres">
      <section class="carte">
        <h2 class="section-titre">La boutique</h2>
        <p class="discret">Ces informations apparaissent sur le site et sur les feuilles imprimées.</p>
        <form method="post" action="/admin/parametres" class="pile">
          ${csrfField(req.csrf)}
          <label class="champ"><span>Nom</span><input name="nom" value="${settings.nom}" required maxlength="60"></label>
          <label class="champ"><span>Sous-titre</span><input name="sousTitre" value="${settings.sousTitre}" maxlength="80"></label>
          <label class="champ"><span>Adresse ou ville <small>— facultatif</small></span><input name="adresse" value="${settings.adresse}" maxlength="120" placeholder="Ex. : 12 rue de la République, Moirans"></label>
          <label class="champ"><span>Où rendre le questionnaire papier</span><input name="urne" value="${settings.urne}" maxlength="160"></label>
          <button class="bouton" type="submit">Enregistrer</button>
        </form>
      </section>
      <section class="carte">
        <h2 class="section-titre">Mon compte</h2>
        <p class="discret">Connecté en tant que <strong>${req.admin.email}</strong>.</p>
        <form method="post" action="/admin/parametres/mot-de-passe" class="pile">
          ${csrfField(req.csrf)}
          <label class="champ"><span>Mot de passe actuel</span><input type="password" name="actuel" autocomplete="current-password" required></label>
          <label class="champ"><span>Nouveau mot de passe <small>— 8 caractères minimum</small></span><input type="password" name="nouveau" autocomplete="new-password" minlength="8" required></label>
          <label class="champ"><span>Confirmer le nouveau mot de passe</span><input type="password" name="confirmation" autocomplete="new-password" minlength="8" required></label>
          <button class="bouton" type="submit">Changer le mot de passe</button>
        </form>
      </section>
    </div>`,
  });
}

module.exports = { connexion, tableauDeBord, editeur, resultats, reponses, saisie, partager, parametres, csrfField, paragraphs };
