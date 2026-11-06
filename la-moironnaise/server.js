'use strict';

const path = require('node:path');
const express = require('express');
const QRCode = require('qrcode');

const db = require('./src/db');
const auth = require('./src/auth');
const { seedIfEmpty } = require('./src/seed');
const { calculer, moyenneGlobale } = require('./src/stats');
const vuesPubliques = require('./src/views/public');
const vuesAdmin = require('./src/views/admin');
const vuesImpression = require('./src/views/print');

const PORT = Number(process.env.PORT) || 3000;

auth.ensureAdminFromEnv();
seedIfEmpty();
db.purgeSessions();
setInterval(() => db.purgeSessions(), 6 * 3600 * 1000).unref();

const app = express();
app.disable('x-powered-by');
// Derrière l'hébergeur (Render, Railway, Fly, nginx…) : on fait confiance au proxy local.
app.set('trust proxy', process.env.TRUST_PROXY || 'loopback, linklocal, uniquelocal');

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data:",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
    ].join('; '),
  });
  next();
});

app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));
app.use(express.urlencoded({ extended: false, limit: '200kb', parameterLimit: 2000 }));
app.use((req, res, next) => { req.body = req.body || {}; next(); });

const envoyer = (res, contenu, status = 200) => res.status(status).type('html').send(String(contenu));

function baseUrl(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/+$/, '');
  return `${req.protocol}://${req.get('host')}`;
}
const lienSondage = (req, survey) => `${baseUrl(req)}/s/${survey.slug}`;

/* ---------- Lecture des réponses envoyées ---------- */

function lireReponses(questions, body, { strict }) {
  const answers = [];
  const erreurs = {};
  const valeurs = {};
  for (const q of questions) {
    const brut = body[`q_${q.id}`];
    let vals = brut === undefined ? [] : (Array.isArray(brut) ? brut : [brut]);
    vals = vals.map((v) => String(v).trim()).filter(Boolean);
    if (q.type === 'note') vals = vals.filter((v) => /^[1-5]$/.test(v)).slice(0, 1);
    else if (q.type === 'choix') vals = vals.filter((v) => q.options.includes(v)).slice(0, 1);
    else if (q.type === 'multiple') vals = [...new Set(vals.filter((v) => q.options.includes(v)))];
    else if (q.type === 'oui_non') vals = vals.filter((v) => v === 'Oui' || v === 'Non').slice(0, 1);
    else vals = vals.slice(0, 1).map((v) => v.slice(0, 2000));
    valeurs[q.id] = vals;
    if (strict && q.required && !vals.length) erreurs[q.id] = 'Merci de répondre à cette question.';
    if (vals.length) answers.push({ questionId: q.id, values: vals });
  }
  return { answers, erreurs, valeurs };
}

/* ---------- Côté clients ---------- */

const limiteEnvois = auth.rateLimiter({ windowMs: 3600 * 1000, max: 30 });

app.get('/', (req, res) => {
  const survey = db.latestOpenSurvey();
  if (survey) return res.redirect(`/s/${survey.slug}`);
  envoyer(res, vuesPubliques.message({
    settings: db.getSettings(), titre: 'À bientôt !',
    texte: 'Il n’y a pas de sondage en cours pour le moment. Merci de votre visite !',
  }));
});

function sondageOuvert(req, res) {
  const settings = db.getSettings();
  const survey = db.getSurveyBySlug(req.params.slug);
  if (!survey) {
    envoyer(res, vuesPubliques.message({ settings, titre: 'Page introuvable', texte: 'Ce lien ne correspond à aucun sondage. Vérifiez l’adresse ou scannez à nouveau le QR code.' }), 404);
    return null;
  }
  if (!survey.is_open || !db.getQuestions(survey.id).length) {
    envoyer(res, vuesPubliques.message({ settings, surtitre: survey.title, titre: 'Ce sondage est terminé', texte: 'Merci de votre intérêt ! Les réponses ne sont plus acceptées pour ce sondage. À très bientôt à la boutique.' }));
    return null;
  }
  return { survey, settings, questions: db.getQuestions(survey.id) };
}

app.get('/s/:slug', (req, res) => {
  const ctx = sondageOuvert(req, res);
  if (!ctx) return;
  envoyer(res, vuesPubliques.sondage({ ...ctx, action: `/s/${ctx.survey.slug}` }));
});

app.post('/s/:slug', (req, res) => {
  const ctx = sondageOuvert(req, res);
  if (!ctx) return;
  const merci = `/s/${ctx.survey.slug}/merci`;
  if (req.body.site_web) return res.redirect(303, merci); // robot
  if (!limiteEnvois.hit(req.ip)) {
    return envoyer(res, vuesPubliques.message({ settings: ctx.settings, titre: 'Doucement !', texte: 'Beaucoup de réponses sont arrivées depuis cette connexion. Réessayez un peu plus tard, merci.' }), 429);
  }
  const { answers, erreurs, valeurs } = lireReponses(ctx.questions, req.body, { strict: true });
  if (!answers.length && !Object.keys(erreurs).length && ctx.questions.length) {
    erreurs[ctx.questions[0].id] = 'Répondez au moins à une question avant d’envoyer.';
  }
  if (Object.keys(erreurs).length) {
    return envoyer(res, vuesPubliques.sondage({ ...ctx, valeurs, erreurs, action: `/s/${ctx.survey.slug}` }), 422);
  }
  db.saveResponse(ctx.survey.id, 'en_ligne', answers);
  res.redirect(303, merci);
});

app.get('/s/:slug/merci', (req, res) => {
  const settings = db.getSettings();
  const survey = db.getSurveyBySlug(req.params.slug);
  if (!survey) return res.redirect('/');
  envoyer(res, vuesPubliques.merci({ survey, settings }));
});

/* ---------- Espace administrateur ---------- */

const admin = express.Router();
admin.use(auth.loadSession);

const limiteConnexion = auth.rateLimiter({ windowMs: 15 * 60 * 1000, max: 10 });

const suiteSure = (s) => (typeof s === 'string' && s.startsWith('/admin') && !s.startsWith('//') ? s : '/admin');

admin.get('/connexion', (req, res) => {
  if (req.admin) return res.redirect(suiteSure(req.query.suite));
  envoyer(res, vuesAdmin.connexion({ settings: db.getSettings(), suite: suiteSure(req.query.suite) }));
});

admin.post('/connexion', (req, res) => {
  const settings = db.getSettings();
  const email = String(req.body.email || '').trim();
  const suite = suiteSure(req.body.suite);
  if (!limiteConnexion.hit(req.ip)) {
    return envoyer(res, vuesAdmin.connexion({ settings, email, suite, erreur: 'Trop de tentatives. Patientez un quart d’heure avant de réessayer.' }), 429);
  }
  const compte = db.getAdminByEmail(email);
  const ok = auth.verifyPassword(String(req.body.password || ''), compte ? compte.password_hash : auth.DUMMY_HASH);
  if (!compte || !ok) {
    return envoyer(res, vuesAdmin.connexion({ settings, email, suite, erreur: 'E-mail ou mot de passe incorrect.' }), 401);
  }
  limiteConnexion.reset(req.ip);
  auth.startSession(req, res, compte.id);
  res.redirect(303, suite);
});

admin.use(auth.requireAdmin);

admin.post('/deconnexion', (req, res) => {
  auth.endSession(req, res);
  res.redirect(303, '/admin/connexion');
});

const ctxAdmin = (req) => ({ req, settings: db.getSettings(), flash: req.query.ok });

admin.get('/', (req, res) => {
  envoyer(res, vuesAdmin.tableauDeBord({ ...ctxAdmin(req), surveys: db.listSurveys() }));
});

admin.post('/sondages', (req, res) => {
  const title = String(req.body.title || '').trim().slice(0, 120);
  if (!title) return res.redirect(303, '/admin');
  const id = db.createSurvey({
    title,
    intro: 'Merci de prendre quelques instants pour nous donner votre avis.',
    thanks: 'Votre avis a bien été reçu. Merci et à très bientôt à la boutique !',
  });
  // Fermé tant que les questions ne sont pas prêtes.
  db.updateSurvey(id, { ...db.getSurvey(id), is_open: false });
  res.redirect(303, `/admin/sondages/${id}?ok=sondage_cree`);
});

// Charge le sondage demandé (ou 404) pour toutes les routes /sondages/:id…
admin.param('id', (req, res, next, id) => {
  const survey = db.getSurvey(Number(id));
  if (!survey) return res.status(404).send('Sondage introuvable.');
  req.survey = survey;
  next();
});

admin.param('qid', (req, res, next, qid) => {
  const question = db.getQuestion(Number(qid));
  if (!question) return res.status(404).send('Question introuvable.');
  req.question = question;
  next();
});

admin.get('/sondages/:id', (req, res) => {
  const s = req.survey;
  envoyer(res, vuesAdmin.editeur({
    ...ctxAdmin(req), survey: s, questions: db.getQuestions(s.id), url: lienSondage(req, s),
    nbReponses: db.countResponses(s.id).total,
  }));
});

admin.post('/sondages/:id', (req, res) => {
  const s = req.survey;
  const title = String(req.body.title || '').trim().slice(0, 120) || s.title;
  db.updateSurvey(s.id, {
    title,
    intro: String(req.body.intro || '').trim().slice(0, 1500),
    thanks: String(req.body.thanks || '').trim().slice(0, 1000),
    is_open: req.body.is_open === '1',
    slug: String(req.body.slug || '').trim(),
  });
  res.redirect(303, `/admin/sondages/${s.id}?ok=enregistre`);
});

admin.post('/sondages/:id/dupliquer', (req, res) => {
  const id = db.duplicateSurvey(req.survey.id);
  res.redirect(303, `/admin/sondages/${id}?ok=sondage_duplique`);
});

admin.post('/sondages/:id/supprimer', (req, res) => {
  db.deleteSurvey(req.survey.id);
  res.redirect(303, '/admin?ok=sondage_supprime');
});

function lireQuestion(body) {
  const type = db.TYPES[body.type] ? body.type : 'note';
  const label = String(body.label || '').trim().slice(0, 300);
  const options = db.TYPES[type].options
    ? [...new Set(String(body.options || '').split(/\r?\n/).map((o) => o.trim().slice(0, 120)).filter(Boolean))].slice(0, 30)
    : [];
  let erreur = '';
  if (!label) erreur = 'Donnez un intitulé à la question.';
  else if (db.TYPES[type].options && options.length < 2) erreur = 'Indiquez au moins deux choix (un par ligne).';
  return { erreur, question: { type, label, options, help: String(body.help || '').trim().slice(0, 300), required: body.required === '1' } };
}

function editeurAvecErreur(req, res, survey, erreur) {
  envoyer(res, vuesAdmin.editeur({
    ...ctxAdmin(req), flash: null, erreur, survey, questions: db.getQuestions(survey.id),
    url: lienSondage(req, survey), nbReponses: db.countResponses(survey.id).total,
  }), 422);
}

admin.post('/sondages/:id/questions', (req, res) => {
  const { erreur, question } = lireQuestion(req.body);
  if (erreur) return editeurAvecErreur(req, res, req.survey, erreur);
  const qid = db.addQuestion(req.survey.id, question);
  res.redirect(303, `/admin/sondages/${req.survey.id}?ok=question_ajoutee#q-${qid}`);
});

admin.post('/questions/:qid', (req, res) => {
  const survey = db.getSurvey(req.question.survey_id);
  const { erreur, question } = lireQuestion(req.body);
  if (erreur) return editeurAvecErreur(req, res, survey, erreur);
  db.updateQuestion(req.question.id, question);
  res.redirect(303, `/admin/sondages/${survey.id}?ok=question_modifiee#q-${req.question.id}`);
});

admin.post('/questions/:qid/supprimer', (req, res) => {
  db.deleteQuestion(req.question.id);
  res.redirect(303, `/admin/sondages/${req.question.survey_id}?ok=question_supprimee`);
});

for (const sens of ['monter', 'descendre']) {
  admin.post(`/questions/:qid/${sens}`, (req, res) => {
    db.moveQuestion(req.question.id, sens === 'monter' ? 'haut' : 'bas');
    res.redirect(303, `/admin/sondages/${req.question.survey_id}#q-${req.question.id}`);
  });
}

/* Résultats */

const PERIODES = ['7', '30', '365'];
const SOURCES = ['en_ligne', 'papier'];

admin.get('/sondages/:id/resultats', (req, res) => {
  const s = req.survey;
  const periode = PERIODES.includes(req.query.periode) ? req.query.periode : '';
  const source = SOURCES.includes(req.query.source) ? req.query.source : '';
  const questions = db.getQuestions(s.id);
  const res2 = calculer(questions, db.answersFor(s.id, periode, source));
  envoyer(res, vuesAdmin.resultats({
    ...ctxAdmin(req), survey: s, url: lienSondage(req, s), resultats: res2,
    totaux: db.countResponses(s.id, periode, source), moyenne: moyenneGlobale(res2), periode, source,
  }));
});

const PAR_PAGE = 30;

admin.get('/sondages/:id/reponses', (req, res) => {
  const s = req.survey;
  const source = SOURCES.includes(req.query.source) ? req.query.source : '';
  const total = db.countResponses(s.id, '', source).total;
  const pages = Math.max(1, Math.ceil(total / PAR_PAGE));
  const page = Math.min(pages, Math.max(1, parseInt(req.query.page, 10) || 1));
  envoyer(res, vuesAdmin.reponses({
    ...ctxAdmin(req), survey: s, url: lienSondage(req, s), questions: db.getQuestions(s.id),
    liste: db.listResponses(s.id, { limit: PAR_PAGE, offset: (page - 1) * PAR_PAGE, source }),
    page, pages, total, source,
  }));
});

admin.post('/reponses/:rid/supprimer', (req, res) => {
  const r = db.getResponse(Number(req.params.rid));
  if (!r) return res.redirect(303, '/admin');
  db.deleteResponse(r.id);
  res.redirect(303, `/admin/sondages/${r.survey_id}/reponses?ok=reponse_supprimee`);
});

admin.get('/sondages/:id/export.csv', (req, res) => {
  const s = req.survey;
  const questions = db.getQuestions(s.id);
  const liste = db.listResponses(s.id, { limit: 1e9 });
  const cellule = (v) => {
    let t = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`; // évite l'exécution de formules dans Excel
    return `"${t.replace(/"/g, '""')}"`;
  };
  const lignes = [['N°', 'Date', 'Origine', ...questions.map((q) => q.label)].map(cellule).join(';')];
  for (const r of liste) {
    const date = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' })
      .format(new Date(r.created_at.replace(' ', 'T') + 'Z'));
    lignes.push([r.id, date, r.source === 'papier' ? 'Papier' : 'En ligne',
      ...questions.map((q) => (r.answers.get(q.id) || []).join(' | '))].map(cellule).join(';'));
  }
  res.set('Content-Disposition', `attachment; filename="reponses-${s.slug}.csv"`);
  res.type('text/csv; charset=utf-8').send('﻿' + lignes.join('\r\n'));
});

/* Saisie des questionnaires papier */

const aujourdhuiParis = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());

admin.get('/sondages/:id/saisie', (req, res) => {
  const s = req.survey;
  envoyer(res, vuesAdmin.saisie({
    ...ctxAdmin(req), survey: s, url: lienSondage(req, s), questions: db.getQuestions(s.id), aujourdhui: aujourdhuiParis(),
  }));
});

admin.post('/sondages/:id/saisie', (req, res) => {
  const s = req.survey;
  const { answers } = lireReponses(db.getQuestions(s.id), req.body, { strict: false });
  if (answers.length) {
    const date = String(req.body.date || '');
    const auj = aujourdhuiParis();
    const createdAt = /^\d{4}-\d{2}-\d{2}$/.test(date) && date < auj ? `${date} 11:00:00` : null;
    db.saveResponse(s.id, 'papier', answers, createdAt);
  }
  res.redirect(303, `/admin/sondages/${s.id}/saisie?ok=${answers.length ? 'reponse_enregistree' : ''}`);
});

/* QR codes et impression */

const QR_COULEUR = '#2B1C12';

function qrSvg(texte, marge = 0) {
  return QRCode.toString(texte, { type: 'svg', margin: marge, errorCorrectionLevel: 'M', color: { dark: QR_COULEUR, light: '#FFFFFF00' } });
}

admin.get('/sondages/:id/partager', async (req, res) => {
  const s = req.survey;
  const url = lienSondage(req, s);
  envoyer(res, vuesAdmin.partager({
    ...ctxAdmin(req), survey: s, url, qrSvg: await qrSvg(url),
    local: /^https?:\/\/(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(url),
  }));
});

admin.get('/sondages/:id/qr.svg', async (req, res) => {
  const svg = await QRCode.toString(lienSondage(req, req.survey), { type: 'svg', margin: 2, errorCorrectionLevel: 'M', color: { dark: QR_COULEUR, light: '#FFFFFF' } });
  res.type('image/svg+xml').send(svg);
});

admin.get('/sondages/:id/qr.png', async (req, res) => {
  const png = await QRCode.toBuffer(lienSondage(req, req.survey), { type: 'png', width: 1200, margin: 2, errorCorrectionLevel: 'M', color: { dark: QR_COULEUR, light: '#FFFFFF' } });
  res.type('image/png').send(png);
});

admin.get('/sondages/:id/imprimer/:format', async (req, res, next) => {
  if (!['affiche', 'cartes', 'questionnaire'].includes(req.params.format)) return next();
  const s = req.survey;
  const url = lienSondage(req, s);
  const ctx = { req, settings: db.getSettings(), survey: s, url, qrSvg: await qrSvg(url) };
  if (req.params.format === 'affiche') return envoyer(res, vuesImpression.affiche(ctx));
  if (req.params.format === 'cartes') return envoyer(res, vuesImpression.cartes(ctx));
  envoyer(res, vuesImpression.questionnaire({ ...ctx, questions: db.getQuestions(s.id), avecQr: req.query.qr === '1' }));
});

/* Paramètres */

admin.get('/parametres', (req, res) => {
  envoyer(res, vuesAdmin.parametres(ctxAdmin(req)));
});

admin.post('/parametres', (req, res) => {
  const champ = (k, max) => String(req.body[k] || '').trim().slice(0, max);
  db.saveSettings({
    nom: champ('nom', 60) || 'La Moironnaise',
    sousTitre: champ('sousTitre', 80),
    adresse: champ('adresse', 120),
    urne: champ('urne', 160),
  });
  res.redirect(303, '/admin/parametres?ok=enregistre');
});

admin.post('/parametres/mot-de-passe', (req, res) => {
  const compte = db.getAdminByEmail(req.admin.email);
  const { actuel = '', nouveau = '', confirmation = '' } = req.body;
  let erreur = '';
  if (!auth.verifyPassword(actuel, compte.password_hash)) erreur = 'Le mot de passe actuel est incorrect.';
  else if (String(nouveau).length < 8) erreur = 'Le nouveau mot de passe doit faire au moins 8 caractères.';
  else if (nouveau !== confirmation) erreur = 'Les deux nouveaux mots de passe ne sont pas identiques.';
  if (erreur) return envoyer(res, vuesAdmin.parametres({ ...ctxAdmin(req), flash: null, erreur }), 422);
  db.setAdminPassword(compte.id, auth.hashPassword(nouveau));
  db.deleteSessionsOf(compte.id, req.sessionHash); // déconnecte les autres appareils
  res.redirect(303, '/admin/parametres?ok=mdp');
});

app.use('/admin', admin);

app.use((req, res) => {
  envoyer(res, vuesPubliques.message({ settings: db.getSettings(), titre: 'Page introuvable', texte: 'Cette page n’existe pas.' }), 404);
});

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  res.status(500).send('Une erreur est survenue. Réessayez dans un instant.');
});

app.listen(PORT, () => {
  console.log(`Sondage ${db.getSettings().nom} prêt sur http://localhost:${PORT}`);
  console.log(`Espace administrateur : http://localhost:${PORT}/admin`);
});
