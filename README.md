# Ada Immobilier

Site vitrine d'agent immobilier : maisons et appartements à vendre, estimation pour les vendeurs, contact.

Le site est fait de fichiers statiques (HTML, CSS, JavaScript), sans outil à installer. Ouvrez `index.html` dans un navigateur pour le voir.

## Ce qu'il y a sur le site

- **Accueil** : une rue dessinée où chaque façade est un bien à vendre. Les fenêtres éclairées montrent l'appartement concerné. En thème sombre, la rue passe en vue de nuit.
- **Recherche et annonces** : filtres par type, budget et nombre de pièces, tri par prix ou surface. Les biens vendus passent en fin de liste.
- **Fiche d'un bien** : prix au m², surface, pièces, description, étiquette énergie (DPE) avec le coût annuel estimé, charges de copropriété, formulaire de demande de visite. Chaque fiche a son lien direct (`monsite.fr/#ainay-4-pieces`).
- **Vendre** : les cinq étapes d'une vente, de l'estimation à la signature chez le notaire, et un formulaire d'estimation.
- **À propos** et **Contact**.

## Personnaliser

| Quoi | Où |
| --- | --- |
| Adresse e-mail et téléphone | `js/biens.js`, en haut (`window.SITE`) |
| Annonces | `js/biens.js`, liste `window.BIENS` |
| Nom, textes, secteurs, horaires | `index.html` |
| Couleurs et polices | `css/style.css`, en haut (variables `--…`) |

Avant la mise en ligne :

1. Supprimez la ligne `<p class="bandeau-demo">…</p>` au début de `index.html`.
2. Remplacez les annonces d'exemple par les vôtres.
3. Ajoutez vos mentions légales (carte professionnelle, assurance responsabilité civile professionnelle, garantie financière, médiateur de la consommation) et votre barème d'honoraires.

### Ajouter des photos

Déposez les photos dans le dossier `images/`, puis indiquez-les dans le bien :

```js
photos: ["images/ainay-salon.jpg", "images/ainay-chambre.jpg"],
```

La première photo sert de vignette. Tant qu'un bien n'a pas de photo, le site dessine sa façade à partir du champ `facade`.

## Formulaires

Les formulaires (visite, estimation) ouvrent la messagerie du visiteur avec un message déjà rempli, adressé à l'e-mail de `window.SITE`. Pour recevoir les demandes sans passer par la messagerie du visiteur, on peut brancher un service comme Formspree ou Netlify Forms.

## Mettre en ligne

Le plus simple, gratuit : **GitHub Pages**. Dans le dépôt GitHub, allez dans *Settings → Pages*, choisissez la branche à publier et le dossier racine. Le site est en ligne quelques minutes plus tard. Netlify et Vercel fonctionnent aussi, par simple glisser-déposer du dossier.

## Porte-monnaie revente

Le dossier `porte-monnaie/` contient une appli à part pour suivre un achat-revente. Ouvrez `porte-monnaie/index.html` dans un navigateur, rien à installer.

- **Le porte-monnaie**, en haut : un porte-monnaie en cuir dont les billets et les pièces qui dépassent correspondent au solde (75 € = un billet de 50, un de 20, un de 5). On y met ses sous (« Mettre des sous »), chaque achat est déduit tout de suite et fait s'envoler les billets, chaque vente en fait revenir. Le solde n'est jamais tapé à la main, il se recalcule à partir des dépôts, retraits, achats et ventes.
- **Stock** : chaque article acheté sur une étiquette kraft, avec le prix de vente prévu écrit au marqueur, ce qu'il a coûté (prix + frais) et le bénéfice attendu. Au moment de l'achat, l'appli propose un prix de vente selon la marge visée (+30 %, +50 %, ×2…). Les articles en stock depuis plus de 30 jours sont signalés.
- **Vendu !** : on indique le prix de vente et les frais (commission, envoi), l'appli affiche ce qui revient et le bénéfice.
- **Ventes**, **Journal** (toutes les entrées et sorties d'argent, façon ticket de caisse), **Stats** (bénéfice par mois, marge moyenne, temps pour vendre, par catégorie) et **Calculette** de prix.
- **Photos** : une photo par article, réduite automatiquement, accrochée à l'étiquette comme un polaroid.
- **Marque, taille, état** pour les vêtements (les états reprennent ceux de Vinted).
- **Annonce avec Claude** : dans la version publiée sur claude.ai, Claude écrit le titre, la description et les hashtags de l'annonce à partir de la photo et des infos de l'article. Un bouton copie le texte.
- **La vente** : un tampon « VENDU » claque sur l'étiquette, elle s'envole, les pièces tombent dans le porte-monnaie avec un bruit de tiroir-caisse (son coupable en haut de l'écran).
- **Objectif, rang et trophées** : une jauge vers l'objectif fixé dans les réglages (sous en poche + stock), un rang qui monte avec le bénéfice (de Débutant à Légende) et 12 trophées à débloquer.
- **Réglages** : nom de la boutique, objectif, marge visée, frais de vente habituels, export pour Excel (.csv), sauvegarde et restauration (.json).

Ouverte depuis un fichier ou un hébergement classique, l'appli enregistre les données et les photos dans le navigateur (`localStorage`), sur cet appareil seulement : faites une sauvegarde de temps en temps. L'annonce avec Claude n'y est pas disponible. Publiée en artifact claude.ai, elle enregistre tout dans le compte du propriétaire et reste privée.
