'use strict';

// Petit moteur de gabarits : tout ce qui est interpolé est échappé,
// sauf ce qui est déjà du HTML produit par html`` ou raw().

class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}

const raw = (s) => new Raw(String(s));

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function render(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(render).join('');
  return esc(v);
}

function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += render(values[i]) + strings[i + 1];
  return new Raw(out);
}

// Texte sur plusieurs lignes -> paragraphes.
function paragraphs(text) {
  return String(text || '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => html`<p>${raw(esc(p).replace(/\n/g, '<br>'))}</p>`);
}

const TZ = 'Europe/Paris';
const toDate = (sqlite) => new Date(String(sqlite).replace(' ', 'T') + 'Z');

function dateFr(sqlite, withTime = true) {
  if (!sqlite) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(toDate(sqlite));
}

function dateCourte(sqlite) {
  if (!sqlite) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(toDate(sqlite));
}

function nombre(n, digits = 1) {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);
}

function pluriel(n, singulier, plurielForme) {
  return `${n} ${n > 1 ? (plurielForme || `${singulier}s`) : singulier}`;
}

module.exports = { html, raw, esc, paragraphs, dateFr, dateCourte, nombre, pluriel, Raw };
