/* Exemples pour découvrir l'appli : un mois et demi d'achat-revente.
   Chaque entrée porte « exemple: true » pour pouvoir les effacer d'un coup. */
(function (racine) {
  'use strict';

  function decaler(iso, jours) {
    const [a, m, j] = iso.split('-').map(Number);
    const d = new Date(Date.UTC(a, m - 1, j + jours));
    return d.toISOString().slice(0, 10);
  }

  racine.PM_EXEMPLES = function (aujourdhui) {
    const il_y_a = (n) => decaler(aujourdhui, -n);
    // Heure de création : sert à ordonner les opérations d'une même journée.
    const quand = (n, h) => Date.parse(il_y_a(n) + 'T00:00:00Z') + (h || 12) * 3600000;

    const achat = (n, nom, categorie, lieuAchat, prixAchat, fraisAchat, prixPrevu, note) => ({
      nom, categorie, lieuAchat, prixAchat, fraisAchat, prixPrevu, note: note || '',
      dateAchat: il_y_a(n), statut: 'stock', cree: quand(n, 10), exemple: true,
    });
    const vendu = (article, n, prixVente, fraisVente, lieuVente) => Object.assign(article, {
      statut: 'vendu', prixVente, fraisVente, lieuVente, dateVente: il_y_a(n), venduLe: quand(n, 18),
    });

    const articles = {
      'ex-longchamp': vendu(achat(70, 'Sac Longchamp Le Pliage', 'Mode', 'Vide-grenier', 30, 0, 55), 62, 55, 0, 'Vinted'),
      'ex-tolix': achat(60, 'Chaise Tolix vert d\'eau', 'Meubles', 'Brocante', 15, 0, 65, 'Un peu de rouille sur un pied'),
      'ex-bose': vendu(achat(50, 'Casque Bose QC35', 'High-tech', 'Leboncoin', 60, 0, 90, 'Batterie fatiguée'), 41, 45, 0, 'Leboncoin'),
      'ex-switch': vendu(achat(45, 'Nintendo Switch Lite turquoise', 'Jeux vidéo', 'Leboncoin', 95, 0, 140), 38, 140, 0, 'Main propre'),
      'ex-dunk': vendu(achat(34, 'Nike Dunk Low Panda 42', 'Sneakers', 'Vinted', 70, 4.5, 120), 20, 115, 0, 'Vinted'),
      'ex-ps4': vendu(achat(30, 'PS4 Slim 500 Go + 2 manettes', 'Jeux vidéo', 'Leboncoin', 90, 0, 160), 18, 150, 0, 'Leboncoin'),
      'ex-carhartt': vendu(achat(28, 'Veste Carhartt Detroit vintage', 'Vêtements', 'Friperie', 25, 0, 75), 10, 68, 0, 'Vinted'),
      'ex-pokemon': vendu(achat(25, 'Lot de 200 cartes Pokémon', 'Collection', 'Brocante', 30, 0, 80), 5, 95, 0, 'eBay'),
      'ex-iphone': vendu(achat(21, 'iPhone 11 64 Go (écran rayé)', 'High-tech', 'Facebook Marketplace', 120, 0, 190), 3, 175, 8.75, 'eBay'),
      'ex-aj4': achat(12, 'Air Jordan 4 Military Black 43', 'Sneakers', 'Vinted', 160, 6, 230),
      'ex-nuptse': achat(6, 'Doudoune The North Face Nuptse M', 'Vêtements', 'Vinted', 85, 0, 150),
      'ex-lampe': achat(2, 'Lampe champignon vintage', 'Déco', 'Vide-grenier', 8, 0, 35),
    };

    const mouvements = {
      'ex-depart': { type: 'depot', montant: 400, note: 'Mise de départ', date: il_y_a(72), cree: quand(72, 9), exemple: true },
      'ex-sortie': { type: 'retrait', montant: 60, note: 'Resto avec les potes', date: il_y_a(15), cree: quand(15, 20), exemple: true },
    };

    return { articles, mouvements };
  };
})(typeof window !== 'undefined' ? window : globalThis);
