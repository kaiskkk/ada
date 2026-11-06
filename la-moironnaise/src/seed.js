'use strict';

// Sondage proposé au premier démarrage. Tout est modifiable depuis l'espace admin.
const db = require('./db');

function seedIfEmpty() {
  if (db.listSurveys().length) return;
  const { nom } = db.getSettings();

  const id = db.createSurvey({
    title: `Votre avis sur ${nom}`,
    slug: 'votre-avis',
    intro: `Bonjour ! Chez ${nom}, on pétrit, on façonne et on cuit chaque jour pour vous.\n\nDites-nous ce que vous pensez de nos produits et de notre accueil : vos réponses nous aident à faire encore mieux.`,
    thanks: 'Votre avis a bien été reçu. Toute l’équipe vous remercie et vous dit à très bientôt à la boutique !',
  });

  const questions = [
    { type: 'note', label: 'Que pensez-vous de l’accueil en boutique ?', help: 'Sourire, amabilité, conseils', required: true },
    { type: 'note', label: 'Comment jugez-vous la rapidité du service ?', help: 'Temps d’attente en caisse' },
    { type: 'note', label: 'Comment trouvez-vous notre pain ?', help: 'Goût, cuisson, fraîcheur' },
    { type: 'note', label: 'Comment trouvez-vous nos viennoiseries ?', help: 'Croissants, pains au chocolat, brioches…' },
    { type: 'note', label: 'Comment trouvez-vous nos pâtisseries ?', help: 'Gâteaux, tartes, entremets…' },
    { type: 'note', label: 'Êtes-vous satisfait du choix de produits ?' },
    { type: 'note', label: 'Que pensez-vous du rapport qualité-prix ?' },
    { type: 'note', label: 'Comment trouvez-vous la propreté de la boutique ?' },
    { type: 'note', label: `Dans l’ensemble, êtes-vous satisfait de ${nom} ?`, required: true },
    {
      type: 'multiple', label: 'Qu’achetez-vous le plus souvent chez nous ?',
      options: ['Baguette ou pain tradition', 'Pains spéciaux (campagne, céréales…)', 'Viennoiseries', 'Pâtisseries', 'Sandwichs et snacking', 'Gâteaux sur commande'],
    },
    {
      type: 'choix', label: 'À quelle fréquence venez-vous ?',
      options: ['Tous les jours ou presque', 'Plusieurs fois par semaine', 'Une fois par semaine', 'Quelques fois par mois', 'C’est ma première visite'],
    },
    {
      type: 'choix', label: `Recommanderiez-vous ${nom} à vos proches ?`,
      options: ['Oui, sans hésiter', 'Probablement', 'Je ne sais pas', 'Non'],
    },
    { type: 'texte', label: 'Un produit que vous aimeriez trouver chez nous ?' },
    { type: 'texte', label: 'Un mot pour l’équipe ?', help: 'Remarques, idées, compliments… tout nous intéresse !' },
  ];
  for (const q of questions) db.addQuestion(id, q);
  console.log('✓ Sondage d’exemple créé : /s/votre-avis');
}

module.exports = { seedIfEmpty };
