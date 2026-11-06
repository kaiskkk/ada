'use strict';

// Base de données SQLite (module intégré à Node.js, aucun serveur à installer).
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'sondage.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
    csrf TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS surveys (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    intro TEXT NOT NULL DEFAULT '',
    thanks TEXT NOT NULL DEFAULT '',
    is_open INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY,
    survey_id INTEGER NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    type TEXT NOT NULL,
    label TEXT NOT NULL,
    help TEXT NOT NULL DEFAULT '',
    options TEXT NOT NULL DEFAULT '[]',
    required INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS responses (
    id INTEGER PRIMARY KEY,
    survey_id INTEGER NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
    source TEXT NOT NULL DEFAULT 'en_ligne',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS answers (
    id INTEGER PRIMARY KEY,
    response_id INTEGER NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
    question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    value TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_questions_survey ON questions(survey_id, position);
  CREATE INDEX IF NOT EXISTS idx_responses_survey ON responses(survey_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_answers_response ON answers(response_id);
  CREATE INDEX IF NOT EXISTS idx_answers_question ON answers(question_id);
`);

// Types de questions proposés dans l'éditeur.
const TYPES = {
  note: { label: 'Note de 1 à 5 (visages)', court: 'Note 1 à 5', options: false },
  choix: { label: 'Choix unique', court: 'Choix unique', options: true },
  multiple: { label: 'Choix multiples', court: 'Choix multiples', options: true },
  oui_non: { label: 'Oui / Non', court: 'Oui / Non', options: false },
  texte: { label: 'Réponse libre (texte)', court: 'Texte libre', options: false },
};

const NOTES = ['Pas du tout satisfait', 'Peu satisfait', 'Correct', 'Satisfait', 'Très satisfait'];

// Une transaction simple autour d'une fonction.
function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/* ---------- Paramètres de la boutique ---------- */

const DEFAULT_SETTINGS = {
  nom: 'La Moironnaise',
  sousTitre: 'Boulangerie · Pâtisserie',
  adresse: '',
  urne: 'Déposez-le dans l’urne au comptoir ou remettez-le à la vendeuse.',
};

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const s = { ...DEFAULT_SETTINGS };
  for (const r of rows) s[r.key] = r.value;
  return s;
}

function saveSettings(values) {
  const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  transaction(() => {
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (values[key] !== undefined) stmt.run(key, String(values[key]));
    }
  });
}

/* ---------- Sondages ---------- */

function slugify(text) {
  const base = String(text)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'sondage';
  let slug = base;
  let n = 2;
  while (db.prepare('SELECT 1 FROM surveys WHERE slug = ?').get(slug)) slug = `${base}-${n++}`;
  return slug;
}

function listSurveys() {
  return db.prepare(`
    SELECT s.*,
      (SELECT COUNT(*) FROM questions q WHERE q.survey_id = s.id) AS nb_questions,
      (SELECT COUNT(*) FROM responses r WHERE r.survey_id = s.id) AS nb_reponses,
      (SELECT COUNT(*) FROM responses r WHERE r.survey_id = s.id AND r.source = 'papier') AS nb_papier,
      (SELECT MAX(created_at) FROM responses r WHERE r.survey_id = s.id) AS derniere_reponse,
      (SELECT AVG(CAST(a.value AS REAL)) FROM answers a JOIN questions q ON q.id = a.question_id
         WHERE q.survey_id = s.id AND q.type = 'note') AS moyenne
    FROM surveys s ORDER BY s.is_open DESC, s.updated_at DESC
  `).all();
}

function getSurvey(id) {
  return db.prepare('SELECT * FROM surveys WHERE id = ?').get(id);
}

function getSurveyBySlug(slug) {
  return db.prepare('SELECT * FROM surveys WHERE slug = ?').get(slug);
}

function latestOpenSurvey() {
  return db.prepare('SELECT * FROM surveys WHERE is_open = 1 ORDER BY updated_at DESC LIMIT 1').get();
}

function createSurvey({ title, intro = '', thanks = '', slug }) {
  const r = db.prepare('INSERT INTO surveys (slug, title, intro, thanks) VALUES (?, ?, ?, ?)')
    .run(slug ? slugify(slug) : slugify(title), title, intro, thanks);
  return Number(r.lastInsertRowid);
}

function updateSurvey(id, { title, intro, thanks, is_open, slug }) {
  const current = getSurvey(id);
  let newSlug = current.slug;
  if (slug && slug !== current.slug) newSlug = slugify(slug);
  db.prepare(`UPDATE surveys SET title = ?, intro = ?, thanks = ?, is_open = ?, slug = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(title, intro, thanks, is_open ? 1 : 0, newSlug, id);
}

function touchSurvey(id) {
  db.prepare(`UPDATE surveys SET updated_at = datetime('now') WHERE id = ?`).run(id);
}

function deleteSurvey(id) {
  db.prepare('DELETE FROM surveys WHERE id = ?').run(id);
}

function duplicateSurvey(id) {
  const s = getSurvey(id);
  return transaction(() => {
    const newId = createSurvey({ title: `${s.title} (copie)`, intro: s.intro, thanks: s.thanks });
    db.prepare('UPDATE surveys SET is_open = 0 WHERE id = ?').run(newId);
    for (const q of getQuestions(id)) {
      db.prepare('INSERT INTO questions (survey_id, position, type, label, help, options, required) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(newId, q.position, q.type, q.label, q.help, JSON.stringify(q.options), q.required ? 1 : 0);
    }
    return newId;
  });
}

/* ---------- Questions ---------- */

function parseQuestion(q) {
  if (!q) return q;
  let options = [];
  try { options = JSON.parse(q.options); } catch { options = []; }
  return { ...q, options, required: Boolean(q.required) };
}

function getQuestions(surveyId) {
  return db.prepare('SELECT * FROM questions WHERE survey_id = ? ORDER BY position, id').all(surveyId).map(parseQuestion);
}

function getQuestion(id) {
  return parseQuestion(db.prepare('SELECT * FROM questions WHERE id = ?').get(id));
}

function addQuestion(surveyId, { type, label, help = '', options = [], required = false }) {
  const max = db.prepare('SELECT COALESCE(MAX(position), 0) AS m FROM questions WHERE survey_id = ?').get(surveyId).m;
  const r = db.prepare('INSERT INTO questions (survey_id, position, type, label, help, options, required) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(surveyId, max + 1, type, label, help, JSON.stringify(options), required ? 1 : 0);
  touchSurvey(surveyId);
  return Number(r.lastInsertRowid);
}

function updateQuestion(id, { type, label, help, options, required }) {
  db.prepare('UPDATE questions SET type = ?, label = ?, help = ?, options = ?, required = ? WHERE id = ?')
    .run(type, label, help, JSON.stringify(options), required ? 1 : 0, id);
  touchSurvey(getQuestion(id).survey_id);
}

function deleteQuestion(id) {
  const q = getQuestion(id);
  db.prepare('DELETE FROM questions WHERE id = ?').run(id);
  touchSurvey(q.survey_id);
}

function moveQuestion(id, direction) {
  const q = getQuestion(id);
  const list = getQuestions(q.survey_id);
  const i = list.findIndex((x) => x.id === q.id);
  const j = direction === 'haut' ? i - 1 : i + 1;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  transaction(() => {
    list.forEach((item, index) => db.prepare('UPDATE questions SET position = ? WHERE id = ?').run(index + 1, item.id));
  });
  touchSurvey(q.survey_id);
}

/* ---------- Réponses ---------- */

function saveResponse(surveyId, source, answers, createdAt = null) {
  return transaction(() => {
    const r = createdAt
      ? db.prepare('INSERT INTO responses (survey_id, source, created_at) VALUES (?, ?, ?)').run(surveyId, source, createdAt)
      : db.prepare('INSERT INTO responses (survey_id, source) VALUES (?, ?)').run(surveyId, source);
    const responseId = Number(r.lastInsertRowid);
    const stmt = db.prepare('INSERT INTO answers (response_id, question_id, value) VALUES (?, ?, ?)');
    for (const { questionId, values } of answers) {
      for (const v of values) stmt.run(responseId, questionId, v);
    }
    return responseId;
  });
}

function periodClause(periode) {
  if (periode === '7') return `AND r.created_at >= datetime('now', '-7 days')`;
  if (periode === '30') return `AND r.created_at >= datetime('now', '-30 days')`;
  if (periode === '365') return `AND r.created_at >= datetime('now', '-365 days')`;
  return '';
}

function sourceClause(source) {
  if (source === 'en_ligne' || source === 'papier') return `AND r.source = '${source}'`;
  return '';
}

function countResponses(surveyId, periode, source) {
  return db.prepare(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN r.source = 'papier' THEN 1 ELSE 0 END) AS papier,
      MAX(r.created_at) AS derniere
    FROM responses r WHERE r.survey_id = ? ${periodClause(periode)} ${sourceClause(source)}
  `).get(surveyId);
}

function answersFor(surveyId, periode, source) {
  return db.prepare(`
    SELECT a.question_id, a.value, r.id AS response_id, r.created_at, r.source
    FROM answers a JOIN responses r ON r.id = a.response_id
    WHERE r.survey_id = ? ${periodClause(periode)} ${sourceClause(source)}
    ORDER BY r.created_at DESC, a.id
  `).all(surveyId);
}

function listResponses(surveyId, { limit = 50, offset = 0, source } = {}) {
  const responses = db.prepare(`
    SELECT r.* FROM responses r WHERE r.survey_id = ? ${sourceClause(source)}
    ORDER BY r.created_at DESC, r.id DESC LIMIT ? OFFSET ?
  `).all(surveyId, limit, offset);
  if (!responses.length) return [];
  const ids = responses.map((r) => r.id);
  const rows = db.prepare(`SELECT * FROM answers WHERE response_id IN (${ids.map(() => '?').join(',')}) ORDER BY id`).all(...ids);
  const byResponse = new Map(responses.map((r) => [r.id, { ...r, answers: new Map() }]));
  for (const a of rows) {
    const resp = byResponse.get(a.response_id);
    if (!resp.answers.has(a.question_id)) resp.answers.set(a.question_id, []);
    resp.answers.get(a.question_id).push(a.value);
  }
  return [...byResponse.values()];
}

function getResponse(id) {
  return db.prepare('SELECT * FROM responses WHERE id = ?').get(id);
}

function deleteResponse(id) {
  db.prepare('DELETE FROM responses WHERE id = ?').run(id);
}

/* ---------- Administrateurs et sessions ---------- */

function getAdminByEmail(email) {
  return db.prepare('SELECT * FROM admins WHERE email = ?').get(String(email).trim());
}

function getAdmin(id) {
  return db.prepare('SELECT id, email, created_at FROM admins WHERE id = ?').get(id);
}

function upsertAdmin(email, passwordHash) {
  db.prepare('INSERT INTO admins (email, password_hash) VALUES (?, ?) ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash')
    .run(String(email).trim().toLowerCase(), passwordHash);
}

function setAdminPassword(id, passwordHash) {
  db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(passwordHash, id);
}

function countAdmins() {
  return db.prepare('SELECT COUNT(*) AS n FROM admins').get().n;
}

function createSession(tokenHash, adminId, csrf, expiresAt) {
  db.prepare('INSERT INTO sessions (token_hash, admin_id, csrf, expires_at) VALUES (?, ?, ?, ?)').run(tokenHash, adminId, csrf, expiresAt);
}

function getSession(tokenHash) {
  return db.prepare('SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?').get(tokenHash, Date.now());
}

function deleteSession(tokenHash) {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
}

function deleteSessionsOf(adminId, exceptHash) {
  db.prepare('DELETE FROM sessions WHERE admin_id = ? AND token_hash != ?').run(adminId, exceptHash || '');
}

function purgeSessions() {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
}

module.exports = {
  db, TYPES, NOTES, transaction,
  getSettings, saveSettings,
  slugify, listSurveys, getSurvey, getSurveyBySlug, latestOpenSurvey, createSurvey, updateSurvey, deleteSurvey, duplicateSurvey,
  getQuestions, getQuestion, addQuestion, updateQuestion, deleteQuestion, moveQuestion,
  saveResponse, countResponses, answersFor, listResponses, getResponse, deleteResponse,
  getAdminByEmail, getAdmin, upsertAdmin, setAdminPassword, countAdmins,
  createSession, getSession, deleteSession, deleteSessionsOf, purgeSessions,
};
