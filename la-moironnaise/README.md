# Sondage La Moironnaise

Site de sondage de satisfaction pour la boulangerie-pâtisserie **La Moironnaise**.

- **Les clients** scannent un QR code et répondent sur leur téléphone (visages de 1 à 5, cases à cocher, réponse libre). C'est anonyme et ça prend environ 2 minutes.
- **Les clients sans smartphone** remplissent un questionnaire papier imprimé en gros caractères. La boutique recopie ensuite leurs réponses dans l'espace admin.
- **L'administrateur** crée et modifie les questions, imprime les feuilles et consulte les résultats.

Un sondage prêt à l'emploi est créé au premier démarrage (accueil, rapidité du service, pain, viennoiseries, pâtisseries, choix, rapport qualité-prix, propreté, satisfaction globale, habitudes d'achat, recommandation, suggestions). Tout se modifie depuis l'espace admin.

## Ce que contient l'espace admin (`/admin`)

| Onglet | À quoi ça sert |
| --- | --- |
| **Questions** | Ajouter, modifier, supprimer et réordonner les questions. Ouvrir ou fermer le sondage, changer le texte d'accueil et le message de remerciement. |
| **Résultats** | Note moyenne, nombre de réponses, graphiques par question, avis écrits. Filtres par période (7 jours, 30 jours, 12 mois) et par origine (en ligne ou papier). Export Excel (CSV). |
| **Réponses** | Chaque réponse une par une, avec suppression possible (par exemple une réponse farfelue). |
| **Saisie papier** | Recopier un questionnaire rempli à la main. Il compte dans les résultats avec la mention « papier ». |
| **Imprimer & partager** | Le lien du sondage, le QR code à télécharger (PNG ou SVG) et trois feuilles A4 à imprimer : |

Les trois feuilles à imprimer :

1. **Affiche avec QR code** : un grand QR code et l'explication en trois étapes (ouvrir l'appareil photo, viser, toucher le lien), l'adresse à taper, et un encart « Pas de smartphone ? Demandez un questionnaire papier au comptoir ».
2. **Cartes à découper** : 8 petites cartes avec QR code par page, à glisser avec le pain ou à poser sur le comptoir.
3. **Questionnaire papier** : toutes les questions en gros caractères avec des cases à cocher, sur un recto-verso. Un petit QR code peut être ajouté en haut (case à cocher dans l'aperçu). Une case « Saisi » en bas permet de repérer les questionnaires déjà recopiés.

Dans la fenêtre d'impression, choisissez le papier A4, l'échelle 100 % et cochez « Graphiques d'arrière-plan ».

**Paramètres** : nom de la boutique, sous-titre, adresse (affichés sur le site et les feuilles), et changement du mot de passe.

## Démarrer sur un ordinateur

Il faut [Node.js](https://nodejs.org) en version 22.13 ou plus récente.

```bash
cd la-moironnaise
npm install
cp .env.example .env     # puis remplissez ADMIN_EMAIL et ADMIN_PASSWORD
npm start
```

- Le sondage : <http://localhost:3000>
- L'espace admin : <http://localhost:3000/admin>

### Le compte administrateur

Le compte est créé au premier démarrage avec l'e-mail et le mot de passe indiqués dans le fichier `.env` (`ADMIN_EMAIL` et `ADMIN_PASSWORD`). Ce fichier n'est **jamais envoyé sur GitHub** : le mot de passe ne figure nulle part dans le code. Dans la base de données, il est stocké chiffré (scrypt).

Ensuite, le mot de passe se change dans **Paramètres**. Pour le remplacer si vous l'avez oublié, ou pour ajouter un autre administrateur :

```bash
npm run admin -- adresse@mail.fr "NouveauMotDePasse"
```

## Mettre en ligne

Le QR code doit pointer vers une adresse accessible depuis n'importe quel téléphone : il faut donc mettre le site en ligne. Il faut un hébergeur qui fait tourner **Node.js** et qui garde les fichiers d'un redémarrage à l'autre (les réponses sont rangées dans un fichier SQLite).

Ça marche par exemple avec **Railway** (avec un « volume »), **Render** (avec un « disque persistant »), **Fly.io** (avec un « volume ») ou un petit serveur VPS.

Réglages à indiquer chez l'hébergeur :

| Réglage | Valeur |
| --- | --- |
| Dossier du projet (*root directory*) | `la-moironnaise` |
| Commande d'installation | `npm install` |
| Commande de démarrage | `npm start` |
| Variable `ADMIN_EMAIL` | l'e-mail de l'administrateur |
| Variable `ADMIN_PASSWORD` | le mot de passe de l'administrateur |
| Variable `DATA_DIR` | le dossier du volume / disque persistant (par exemple `/data`) |
| Variable `PUBLIC_URL` | l'adresse du site, par exemple `https://avis.lamoironnaise.fr` (facultatif, mais conseillé pour que les QR codes utilisent toujours la bonne adresse) |

Une fois en ligne : connectez-vous sur `/admin`, ouvrez **Imprimer & partager**, imprimez l'affiche et quelques questionnaires papier.

> Attention : si vous changez l'adresse du sondage (le `/s/...`) ou le nom de domaine, les QR codes déjà imprimés ne marcheront plus. Réimprimez les feuilles.

## Sauvegarder les réponses

Toutes les données sont dans le fichier `data/sondage.db` (ou dans le dossier `DATA_DIR`). Copiez ce fichier de temps en temps pour garder une sauvegarde. L'export CSV de l'onglet Résultats s'ouvre aussi directement dans Excel.

## Personnaliser

| Quoi | Où |
| --- | --- |
| Nom, sous-titre, adresse de la boutique | Espace admin → Paramètres |
| Questions, textes d'accueil et de remerciement | Espace admin → Questions |
| Couleurs et polices | `public/css/style.css`, en haut (variables `--…`) |
| Mise en page des feuilles imprimées | `src/views/print.js` et `public/css/print.css` |
| Sondage créé au premier démarrage | `src/seed.js` |

## Sécurité

- Mot de passe stocké chiffré (scrypt), jamais écrit dans le code.
- Session dans un cookie protégé (`HttpOnly`, `SameSite`), valable 30 jours.
- Tous les formulaires de l'espace admin sont protégés contre les envois venant d'un autre site (jeton CSRF).
- Après 10 essais de connexion ratés, il faut attendre un quart d'heure.
- Côté sondage : champ piège contre les robots et limite de 30 réponses par heure depuis une même connexion.
