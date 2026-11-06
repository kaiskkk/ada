'use strict';

const { NOTES } = require('./db');

// Regroupe les réponses par question et calcule ce qu'il faut afficher.
function calculer(questions, rows) {
  const parQuestion = new Map(questions.map((q) => [q.id, []]));
  for (const r of rows) if (parQuestion.has(r.question_id)) parQuestion.get(r.question_id).push(r);

  return questions.map((q) => {
    const reponses = parQuestion.get(q.id);
    const repondants = new Set(reponses.map((r) => r.response_id)).size;

    if (q.type === 'note') {
      const compte = [0, 0, 0, 0, 0];
      let somme = 0;
      for (const r of reponses) {
        const n = Number(r.value);
        if (n >= 1 && n <= 5) { compte[n - 1] += 1; somme += n; }
      }
      const total = compte.reduce((a, b) => a + b, 0);
      return {
        q, repondants: total,
        moyenne: total ? somme / total : null,
        lignes: compte.map((c, i) => ({ libelle: NOTES[i], note: i + 1, compte: c, part: total ? c / total : 0 })).reverse(),
      };
    }

    if (q.type === 'texte') {
      return {
        q, repondants,
        textes: reponses.filter((r) => r.value.trim()).map((r) => ({ texte: r.value, date: r.created_at, source: r.source })),
      };
    }

    // Choix unique, multiple, oui/non.
    const options = q.type === 'oui_non' ? ['Oui', 'Non'] : [...q.options];
    const compte = new Map(options.map((o) => [o, 0]));
    for (const r of reponses) compte.set(r.value, (compte.get(r.value) || 0) + 1);
    const lignes = [...compte.entries()].map(([libelle, c]) => ({
      libelle, compte: c, part: repondants ? c / repondants : 0, ancienne: !options.includes(libelle),
    }));
    return { q, repondants, lignes };
  });
}

// Moyenne de toutes les notes (toutes questions « note » confondues).
function moyenneGlobale(resultats) {
  let somme = 0;
  let n = 0;
  for (const r of resultats) {
    if (r.q.type !== 'note') continue;
    for (const l of r.lignes) { somme += l.note * l.compte; n += l.compte; }
  }
  return n ? somme / n : null;
}

module.exports = { calculer, moyenneGlobale };
