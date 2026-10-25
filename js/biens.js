/*
 * Données du site : coordonnées et annonces.
 * C'est le seul fichier à modifier pour ajouter, changer ou retirer un bien.
 */

window.SITE = {
  email: "contact@example.com",
  telephone: "", // ex. "04 00 00 00 00" — laissé vide, la ligne téléphone n'apparaît pas
};

/*
 * Un bien =
 *   id        identifiant unique, sans espace ni accent (sert de lien direct : monsite.fr/#id)
 *   statut    "nouveau", "compromis", "vendu" ou ""
 *   type      "appartement" ou "maison"
 *   prix      en euros, sans espace
 *   surface   en m² ; terrain en m² (maisons) ; etage en texte (appartements)
 *   dpe       classe énergie (A à G), consommation en kWh/m²/an, coût annuel estimé [min, max]
 *   copro     nombre de lots et charges courantes annuelles (obligatoire pour une copropriété)
 *   photos    liste de chemins, ex. ["images/ainay-1.jpg", "images/ainay-2.jpg"].
 *             Tant qu'elle est vide, le site dessine la façade décrite dans `facade`.
 *   facade    style : "haussmann", "canut", "maison", "villa" ou "moderne".
 *             bien : l'étage (et les fenêtres) à éclairer pour montrer l'appartement.
 */
window.BIENS = [
  {
    id: "ainay-4-pieces",
    ref: "ADA-1024",
    statut: "nouveau",
    type: "appartement",
    titre: "4 pièces haussmannien, balcon filant",
    ville: "Lyon 2e",
    quartier: "Ainay",
    prix: 735000,
    surface: 112,
    pieces: 4,
    chambres: 2,
    etage: "3e sur 5",
    dpe: { classe: "D", conso: 212, cout: [1690, 2330] },
    copro: { lots: 22, charges: 2640 },
    description:
      "Au troisième étage d'un immeuble en pierre de taille, à deux rues de la place Bellecour. Double séjour traversant ouvert sur le balcon filant, cuisine fermée, deux chambres sur cour au calme. 3,20 m sous plafond.",
    atouts: ["Balcon filant", "Parquet point de Hongrie", "Cheminées en marbre", "Ascenseur", "Cave"],
    photos: [],
    facade: { style: "haussmann", baies: 5, etages: 5, bien: { etage: 3, baies: [0, 1, 2] } },
  },
  {
    id: "croix-rousse-canut",
    ref: "ADA-1019",
    statut: "",
    type: "appartement",
    titre: "Appartement canut, 4 m sous plafond",
    ville: "Lyon 4e",
    quartier: "Croix-Rousse",
    prix: 829000,
    surface: 138,
    pieces: 4,
    chambres: 3,
    etage: "2e sur 4",
    dpe: { classe: "C", conso: 164, cout: [1520, 2100] },
    copro: { lots: 14, charges: 1380 },
    description:
      "Dans un immeuble de 1830 sur le plateau, un ancien atelier de soyeux. Grandes fenêtres plein ouest, mezzanine en chêne, poutres apparentes. Une traboule traverse le rez-de-chaussée jusqu'à la rue voisine.",
    atouts: ["4 m sous plafond", "Mezzanine", "Poutres apparentes", "Vue sur les toits"],
    photos: [],
    facade: { style: "canut", baies: 4, etages: 4, teinte: "ocre", bien: { etage: 2 } },
  },
  {
    id: "monplaisir-maison",
    ref: "ADA-1027",
    statut: "nouveau",
    type: "maison",
    titre: "Maison de ville avec jardin clos",
    ville: "Lyon 8e",
    quartier: "Monplaisir",
    prix: 790000,
    surface: 145,
    pieces: 6,
    chambres: 4,
    terrain: 320,
    dpe: { classe: "C", conso: 152, cout: [1750, 2400] },
    description:
      "Maison des années 1930 à cinq minutes à pied du métro Monplaisir-Lumière. Grand séjour de plain-pied sur le jardin, quatre chambres à l'étage, garage et cave voûtée.",
    atouts: ["Jardin de 320 m²", "Garage", "Métro D à 5 min", "Cave voûtée"],
    photos: [],
    facade: { style: "maison", toit: "pignon", teinte: "rose" },
  },
  {
    id: "ecully-villa",
    ref: "ADA-0998",
    statut: "",
    type: "maison",
    titre: "Villa contemporaine avec piscine",
    ville: "69130",
    quartier: "Écully",
    prix: 1390000,
    surface: 210,
    pieces: 7,
    chambres: 5,
    terrain: 1450,
    dpe: { classe: "B", conso: 98, cout: [1400, 1950] },
    description:
      "Villa d'architecte de 2016 sur un terrain arboré. Pièce de vie de 70 m² ouverte sur la piscine, suite parentale à l'étage, deux chambres d'enfants avec salle d'eau. Pompe à chaleur et panneaux solaires.",
    atouts: ["Piscine chauffée", "Suite parentale", "Pompe à chaleur", "Garage double"],
    photos: [],
    facade: { style: "villa" },
  },
  {
    id: "confluence-t2",
    ref: "ADA-1012",
    statut: "compromis",
    type: "appartement",
    titre: "2 pièces récent, terrasse plein sud",
    ville: "Lyon 2e",
    quartier: "Confluence",
    prix: 289000,
    surface: 48,
    pieces: 2,
    chambres: 1,
    etage: "5e sur 6",
    dpe: { classe: "A", conso: 62, cout: [340, 480] },
    copro: { lots: 86, charges: 1150 },
    description:
      "Dans une résidence de 2023 au bord de la Saône. Séjour sur une terrasse de 14 m² exposée plein sud, chambre avec placards, place de parking en sous-sol. Garantie décennale en cours.",
    atouts: ["Terrasse 14 m²", "Plein sud", "Parking", "Ascenseur"],
    photos: [],
    facade: { style: "moderne", baies: 4, etages: 6, bien: { etage: 5, baies: [2, 3] } },
  },
  {
    id: "guillotiere-studio",
    ref: "ADA-0987",
    statut: "vendu",
    type: "appartement",
    titre: "Studio sous les toits, vendu meublé",
    ville: "Lyon 7e",
    quartier: "Guillotière",
    prix: 139000,
    surface: 24,
    pieces: 1,
    chambres: 0,
    etage: "6e sur 6",
    dpe: { classe: "D", conso: 238, cout: [610, 840] },
    copro: { lots: 30, charges: 720 },
    description:
      "Studio rénové en 2024 au dernier étage, à deux pas des quais du Rhône. Coin cuisine équipé, salle d'eau avec WC, vendu meublé. Idéal pour un premier achat ou un investissement locatif.",
    atouts: ["Rénové en 2024", "Vendu meublé", "Proche des quais", "Faibles charges"],
    photos: [],
    facade: { style: "haussmann", baies: 4, etages: 5, bien: { etage: 6, baies: [1, 2] } },
  },
];
