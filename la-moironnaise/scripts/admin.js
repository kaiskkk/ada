'use strict';
// Crée un compte administrateur ou remplace son mot de passe.
// Utilisation : npm run admin -- adresse@mail.fr "MotDePasse"
const db = require('../src/db');
const { hashPassword } = require('../src/auth');

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error('Utilisation : npm run admin -- adresse@mail.fr "MotDePasse"');
  process.exit(1);
}
if (password.length < 8) {
  console.error('Le mot de passe doit faire au moins 8 caractères.');
  process.exit(1);
}
const existait = Boolean(db.getAdminByEmail(email));
db.upsertAdmin(email, hashPassword(password));
console.log(existait ? `✓ Mot de passe de ${email} remplacé.` : `✓ Compte administrateur ${email} créé.`);
