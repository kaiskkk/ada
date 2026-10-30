/* Porte-monnaie revente.
   Le solde n'est jamais saisi à la main : il se recalcule à partir des dépôts,
   des retraits, des achats (coût = prix + frais) et des ventes (encaissé = prix − frais). */
(function () {
  'use strict';

  const CLE_LOCALE = 'porte-monnaie:v1';
  const REGLAGES_DEFAUT = { nom: 'Ma revente', marge: 50, commission: 0 };
  const LIEUX = ['Vinted', 'Leboncoin', 'eBay', 'Facebook Marketplace', 'Brocante', 'Vide-grenier', 'Friperie', 'Boutique', 'Main propre'];
  const CATEGORIES = ['Sneakers', 'Vêtements', 'Mode', 'High-tech', 'Jeux vidéo', 'Collection', 'Meubles', 'Déco', 'Livres'];
  const JOURS_DORT = 30;
  const MARQUES = ['Stone Island', 'C.P. Company', 'Nike', 'Adidas', 'Under Armour', 'The North Face', 'Ralph Lauren', 'Lacoste', 'Carhartt', "Levi's", "Arc'teryx", 'Moncler', 'Patagonia', 'Tommy Hilfiger', 'Zara'];
  const CLE_SON = 'porte-monnaie:son';

  // Le rang monte avec le bénéfice encaissé au total.
  const RANGS = [
    { min: 0, nom: 'Débutant' },
    { min: 50, nom: 'Chineur' },
    { min: 200, nom: 'Revendeur' },
    { min: 500, nom: 'Boss du tri' },
    { min: 1000, nom: 'Requin' },
    { min: 2500, nom: 'Légende' },
  ];

  const TROPHEES = [
    { id: 'premier-achat', glyphe: '1er', nom: 'Premier achat', desc: 'Enregistrer ton premier achat.', test: (s) => s.nbArticles >= 1 },
    { id: 'premiere-vente', glyphe: '€', nom: 'Première vente', desc: 'Vendre ton premier article.', test: (s) => s.nbVendus >= 1 },
    { id: 'cinq-ventes', glyphe: '5', nom: 'Bien lancé', desc: 'Faire 5 ventes.', test: (s) => s.nbVendus >= 5 },
    { id: 'vingt-ventes', glyphe: '20', nom: 'Machine', desc: 'Faire 20 ventes.', test: (s) => s.nbVendus >= 20 },
    { id: 'eclair', glyphe: '24h', nom: 'Éclair', desc: "Revendre un article moins de 24 h après l'avoir acheté.", test: (s) => s.eclair },
    { id: 'fois-deux', glyphe: '×2', nom: 'Fois deux', desc: 'Revendre un article au moins deux fois son prix.', test: (s) => s.maxRatio >= 2 },
    { id: 'fois-cinq', glyphe: '×5', nom: 'Coup de génie', desc: 'Revendre un article au moins cinq fois son prix.', test: (s) => s.maxRatio >= 5 },
    { id: 'gros-coup', glyphe: '50', nom: 'Gros coup', desc: 'Gagner 50 € sur une seule vente.', test: (s) => s.maxBenef >= 50 },
    { id: 'cent', glyphe: '100', nom: 'Premiers 100 €', desc: 'Atteindre 100 € de bénéfice au total.', test: (s) => s.benef >= 100 },
    { id: 'mille', glyphe: '1k', nom: 'Le millier', desc: 'Atteindre 1 000 € de bénéfice au total.', test: (s) => s.benef >= 1000 },
    { id: 'grossiste', glyphe: '10', nom: 'Grossiste', desc: 'Acheter 10 articles.', test: (s) => s.nbArticles >= 10 },
    { id: 'sans-faute', glyphe: '0', nom: 'Sans faute', desc: 'Faire 10 ventes sans aucune à perte.', test: (s) => s.nbVendus >= 10 && s.pertes === 0 },
  ];

  const etat = {
    mode: 'demarrage', // demarrage | compte | appareil | lecture
    pret: false,
    articles: new Map(),
    mouvements: new Map(),
    reglages: { ...REGLAGES_DEFAUT },
    recherche: '',
    tri: 'recent',
    vue: 'stock',
    journalMax: 80,
  };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const mouvementReduit = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

  // Ce que la page claude.ai sait faire en plus : stocker des photos, demander à Claude.
  let assetsCap = null;
  let sampleCap = null;
  let sampleImages = false;

  /* ---------- Nombres, dates, texte ---------- */

  const fmtCentimes = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
  const fmtRond = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const fmtCompact = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 });
  const fmtPct = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 0 });
  const fmtJour = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const fmtJourAn = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const fmtJourLong = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const fmtMoisCourt = new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: 'UTC' });
  const fmtMoisLong = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  const arrondi = (n) => (Math.round((Number(n) || 0) * 100) / 100) || 0;
  const MOINS = '−';

  // 120 € ou 74,50 € : les centimes seulement quand il y en a.
  function euros(n) {
    const v = arrondi(n);
    const texte = (Number.isInteger(v) ? fmtRond : fmtCentimes).format(Math.abs(v));
    return v < 0 ? MOINS + texte : texte;
  }
  const eurosExact = (n) => {
    const v = arrondi(n);
    return (v < 0 ? MOINS : '') + fmtCentimes.format(Math.abs(v));
  };
  const eurosSigne = (n) => {
    const v = arrondi(n);
    return v > 0 ? '+' + euros(v) : euros(v);
  };
  function pct(x) {
    if (!Number.isFinite(x)) return '';
    const texte = fmtPct.format(Math.abs(x));
    if (Math.round(x * 100) === 0) return texte;
    return (x > 0 ? '+' : MOINS) + texte;
  }

  // Accepte « 12,50 », « 12.5 », « 1 200 € ».
  function lireMontant(texte) {
    if (texte === undefined || texte === null) return null;
    const propre = String(texte).replace(/[\s  €]/g, '').replace(',', '.');
    if (propre === '') return null;
    const n = Number(propre);
    return Number.isFinite(n) ? arrondi(n) : NaN;
  }

  function aujourdhui() {
    const d = new Date();
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
  }
  const versUTC = (iso) => {
    const [a, m, j] = String(iso || aujourdhui()).split('-').map(Number);
    return Date.UTC(a, (m || 1) - 1, j || 1);
  };
  const joursEntre = (de, a) => Math.max(0, Math.round((versUTC(a) - versUTC(de)) / 86400000));
  function dateCourte(iso) {
    if (!iso) return '';
    const d = new Date(versUTC(iso));
    return (iso.slice(0, 4) === aujourdhui().slice(0, 4) ? fmtJour : fmtJourAn).format(d);
  }
  const dateLongue = (iso) => (iso ? fmtJourLong.format(new Date(versUTC(iso))) : '');
  const pluriel = (n, mot, motPluriel) => `${n} ${n > 1 ? (motPluriel || mot + 's') : mot}`;

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const normaliser = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const nouvelId = () => Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  const comparer = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

  /* ---------- Calculs ---------- */

  const cout = (a) => arrondi((a.prixAchat || 0) + (a.fraisAchat || 0));
  const encaisse = (a) => arrondi((a.prixVente || 0) - (a.fraisVente || 0));
  const benefice = (a) => arrondi(encaisse(a) - cout(a));
  const tauxCommission = () => Math.min(90, Math.max(0, Number(etat.reglages.commission) || 0)) / 100;
  const fraisEstimes = (prix, taux = tauxCommission()) => arrondi(prix * taux);
  const beneficePrevu = (a) => (a.prixPrevu ? arrondi(a.prixPrevu - fraisEstimes(a.prixPrevu) - cout(a)) : null);
  const marge = (gain, base) => (base > 0 ? gain / base : NaN);

  // Prix à afficher pour gagner « gain » une fois la commission prélevée.
  const prixPourGagner = (base, gain, taux = tauxCommission()) => (base + gain) / (1 - taux);
  // Un prix qui se lit bien sur une annonce, jamais en dessous du minimum.
  function prixRond(p) {
    if (!(p > 0)) return 0;
    if (p < 20) return Math.ceil(p);
    if (p < 150) return Math.ceil(p / 5) * 5;
    return Math.ceil(p / 10) * 10;
  }

  const photoUrl = (a) => (a.photo ? '/_blob/' + a.photo : a.photoLocale || null);
  const peutPhotos = () => etat.mode === 'appareil' || Boolean(assetsCap);

  // « Vêtements », « vetement » et « Vetements » sont la même catégorie.
  const cleCategorie = (c) => normaliser(c).trim().replace(/s$/, '');
  function libelleCategorie(c) {
    if (!c) return '';
    return CATEGORIES.find((x) => cleCategorie(x) === cleCategorie(c)) || c;
  }

  function rangPour(benef) {
    let i = 0;
    while (i + 1 < RANGS.length && benef >= RANGS[i + 1].min) i += 1;
    const actuel = RANGS[i];
    const suivant = RANGS[i + 1] || null;
    const progres = suivant ? Math.max(0, Math.min(1, (benef - actuel.min) / (suivant.min - actuel.min))) : 1;
    return { niveau: i + 1, actuel, suivant, progres };
  }

  function statsTrophees(b) {
    const s = { nbArticles: etat.articles.size, nbVendus: 0, benef: b.benefEncaisse, maxRatio: 0, maxBenef: 0, eclair: false, pertes: 0 };
    for (const a of etat.articles.values()) {
      if (a.statut !== 'vendu') continue;
      s.nbVendus += 1;
      const c = cout(a);
      if (c > 0) s.maxRatio = Math.max(s.maxRatio, encaisse(a) / c);
      s.maxBenef = Math.max(s.maxBenef, benefice(a));
      if (benefice(a) < 0) s.pertes += 1;
      const rapide = a.cree && a.venduLe ? a.venduLe - a.cree < 86400000 : a.dateVente === a.dateAchat;
      if (rapide) s.eclair = true;
    }
    return s;
  }

  function bilan() {
    const b = { depots: 0, retraits: 0, achats: 0, ventes: 0, stockCout: 0, stockPrevu: 0, benefEncaisse: 0, nbStock: 0, nbVendus: 0, benefMois: 0 };
    const moisCourant = aujourdhui().slice(0, 7);
    for (const m of etat.mouvements.values()) {
      if (m.type === 'retrait') b.retraits += m.montant || 0;
      else b.depots += m.montant || 0;
    }
    for (const a of etat.articles.values()) {
      b.achats += cout(a);
      if (a.statut === 'vendu') {
        b.ventes += encaisse(a);
        b.benefEncaisse += benefice(a);
        b.nbVendus += 1;
        if ((a.dateVente || '').slice(0, 7) === moisCourant) b.benefMois += benefice(a);
      } else {
        b.nbStock += 1;
        b.stockCout += cout(a);
        b.stockPrevu += a.prixPrevu ? a.prixPrevu - fraisEstimes(a.prixPrevu) : cout(a);
      }
    }
    b.solde = arrondi(b.depots - b.retraits - b.achats + b.ventes);
    b.potentiel = arrondi(b.solde + b.stockPrevu);
    return b;
  }

  /* ---------- Stockage : compte claude.ai si possible, sinon cet appareil ---------- */

  const Stockage = {
    db: null,
    local: { articles: {}, mouvements: {}, reglages: {} },

    brancherAppareil() {
      etat.mode = 'appareil';
      try {
        const brut = localStorage.getItem(CLE_LOCALE);
        if (brut) {
          const d = JSON.parse(brut);
          this.local = { articles: d.articles || {}, mouvements: d.mouvements || {}, reglages: d.reglages || {} };
        }
      } catch (e) { /* stockage bloqué : on garde en mémoire */ }
      this.versEtat();
      etat.pret = true;
      rendre();
    },

    versEtat() {
      etat.articles = new Map(Object.entries(this.local.articles));
      etat.mouvements = new Map(Object.entries(this.local.mouvements));
      etat.reglages = { ...REGLAGES_DEFAUT, ...(this.local.reglages.caisse || {}) };
    },

    sauverLocal() {
      try {
        localStorage.setItem(CLE_LOCALE, JSON.stringify(this.local));
      } catch (e) {
        toast("Ce navigateur bloque l'enregistrement. Fais une sauvegarde (Réglages) pour ne rien perdre.");
      }
    },

    async brancherCompte(db) {
      this.db = db;
      etat.mode = 'compte';
      const recu = { articles: false, mouvements: false };
      const arrive = (quoi) => {
        recu[quoi] = true;
        if (recu.articles && recu.mouvements) etat.pret = true;
        rendre();
      };
      const enErreur = (e) => {
        if (e && e.code === 'revoked') {
          etat.mode = 'lecture';
          rendre();
          return;
        }
        toast('La connexion au porte-monnaie a coupé. Recharge la page pour la retrouver.');
      };
      db.collection('articles').onSnapshot((snap) => {
        etat.articles = new Map(snap.docs.map((d) => [d.id, d.data()]));
        arrive('articles');
      }, enErreur);
      db.collection('mouvements').onSnapshot((snap) => {
        etat.mouvements = new Map(snap.docs.map((d) => [d.id, d.data()]));
        arrive('mouvements');
      }, enErreur);
      db.doc('reglages/caisse').onSnapshot((s) => {
        etat.reglages = { ...REGLAGES_DEFAUT, ...(s.exists ? s.data() : {}) };
        rendre();
      }, enErreur);

      try {
        const user = await window.claude.use('user');
        const peutEcrire = user ? await user.can('data.write') : null;
        if (peutEcrire === false) {
          etat.mode = 'lecture';
          rendre();
        }
      } catch (e) { /* sans réponse, on laisse les boutons ; une écriture refusée tranchera */ }
    },

    async ecrire(col, id, data) {
      if (!this.db) {
        this.local[col][id] = data;
        this.sauverLocal();
        this.versEtat();
        rendre();
        return;
      }
      await reessayer(() => this.db.collection(col).doc(id).set(data));
    },

    async effacer(col, id) {
      if (!this.db) {
        delete this.local[col][id];
        this.sauverLocal();
        this.versEtat();
        rendre();
        return;
      }
      await reessayer(() => this.db.collection(col).doc(id).delete());
    },

    // Plusieurs écritures d'un coup : [{col, id, data}] ; data null = effacer.
    async lot(operations) {
      if (!this.db) {
        for (const op of operations) {
          if (op.data === null) delete this.local[op.col][op.id];
          else this.local[op.col][op.id] = op.data;
        }
        this.sauverLocal();
        this.versEtat();
        rendre();
        return;
      }
      for (let i = 0; i < operations.length; i += 8) {
        await Promise.all(operations.slice(i, i + 8).map((op) => (
          op.data === null ? this.effacer(op.col, op.id) : this.ecrire(op.col, op.id, op.data)
        )));
      }
    },
  };

  async function reessayer(action) {
    try {
      return await action();
    } catch (e) {
      if (e && e.code === 'unavailable') {
        await new Promise((r) => setTimeout(r, 300 + Math.random() * 500));
        return action();
      }
      throw e;
    }
  }

  function messageErreur(e) {
    const code = e && e.code;
    if (code === 'quota_exceeded') return 'Le porte-monnaie est plein. Exporte une sauvegarde puis supprime de vieux articles.';
    if (code === 'invalid_argument' && etat.mode !== 'appareil') {
      etat.mode = 'lecture';
      rendre();
      return "Tu n'as pas le droit de modifier ce porte-monnaie.";
    }
    if (code === 'resource_exhausted') return 'Trop de modifications en même temps. Attends quelques secondes et réessaie.';
    return "L'enregistrement n'a pas marché. Vérifie ta connexion et réessaie.";
  }

  /* ---------- Affichage ---------- */

  let soldeAffiche = null;
  let animSolde = 0;

  function animerSolde(cible) {
    const el = $('#solde');
    const barre = $('#barre-solde-valeur');
    const ecrire = (v) => {
      el.textContent = eurosExact(v);
      barre.textContent = eurosExact(v);
    };
    cancelAnimationFrame(animSolde);
    if (soldeAffiche === null || mouvementReduit || soldeAffiche === cible) {
      soldeAffiche = cible;
      ecrire(cible);
      return;
    }
    const depart = soldeAffiche;
    const debut = performance.now();
    const duree = 800;
    el.classList.remove('brille');
    void el.offsetWidth;
    el.classList.add('brille');
    const pas = (t) => {
      const p = Math.min(1, (t - debut) / duree);
      const v = depart + (cible - depart) * (1 - Math.pow(1 - p, 3));
      ecrire(p < 1 ? v : cible);
      if (p < 1) animSolde = requestAnimationFrame(pas);
    };
    soldeAffiche = cible;
    animSolde = requestAnimationFrame(pas);
  }

  function rendre() {
    document.body.classList.toggle('lecture', etat.mode === 'lecture');
    document.body.classList.toggle('chargement', !etat.pret);
    rendreEntete();
    if (!etat.pret) {
      rendreChargement();
      return;
    }
    const b = bilan();
    if (!commissionCalculetteTouchee) {
      $('#c-commission').value = String(Number(etat.reglages.commission) || 0).replace('.', ',');
      majCalculette();
    }
    rendrePorteMonnaie(b);
    rendreObjectif(b);
    verifierTrophees(b);
    rendreListesSaisie();
    rendreStock(b);
    rendreVentes();
    rendreJournal();
    rendreStats();
  }

  function rendreEntete() {
    const nom = (etat.reglages.nom || '').trim() || REGLAGES_DEFAUT.nom;
    $('#nom-boutique').textContent = nom;
    const textes = {
      demarrage: 'Ouverture…',
      compte: 'Enregistré dans ton compte',
      appareil: 'Enregistré sur cet appareil',
      lecture: 'Lecture seule',
    };
    const etiquette = $('#sauvegarde');
    etiquette.textContent = textes[etat.mode];
    etiquette.dataset.mode = etat.mode;
    const pied = {
      demarrage: '',
      compte: 'Tes comptes sont enregistrés dans ton compte claude.ai : tu les retrouves sur ton téléphone comme sur ton ordinateur.',
      appareil: "Tes comptes sont enregistrés dans ce navigateur, sur cet appareil seulement. Fais une sauvegarde de temps en temps (Réglages) pour ne rien perdre.",
      lecture: '',
    };
    $('#pied-sauvegarde').textContent = pied[etat.mode];
    $('#r-ou').textContent = pied[etat.mode];
    $('#pf-frappe').textContent = nom;
    $('#bandeau-lecture').hidden = etat.mode !== 'lecture';
    const rang = rangPour(etat.pret ? bilan().benefEncaisse : 0);
    $('#rang-nom').textContent = rang.actuel.nom;
    $('#rang').dataset.niveau = String(rang.niveau);
  }

  let objectifAtteintVu = null;

  function rendreObjectif(b) {
    const cible = Number(etat.reglages.objectif) || 0;
    const avoir = arrondi(b.solde + b.stockCout);
    $('#objectif').hidden = !cible;
    $('#obj-fixer').hidden = Boolean(cible);
    if (!cible) {
      objectifAtteintVu = null;
      return;
    }
    const p = Math.max(0, Math.min(1, avoir / cible));
    const atteint = avoir >= cible;
    $('#obj-cible').textContent = euros(cible);
    $('#obj-remplie').style.setProperty('--p', (p * 100).toFixed(1) + '%');
    $('#obj-jauge').setAttribute('aria-valuenow', String(Math.round(p * 100)));
    $('#objectif').classList.toggle('atteint', atteint);
    $('#obj-texte').textContent = atteint
      ? `Objectif atteint : tu as ${euros(avoir)}. Fixe-toi le suivant dans les réglages.`
      : `${euros(avoir)} sur ${euros(cible)} (${fmtPct.format(p)}) : ${euros(Math.max(0, b.solde))} en poche et ${euros(b.stockCout)} en stock. Encore ${euros(cible - avoir)}.`;
    if (objectifAtteintVu === false && atteint) {
      setTimeout(() => {
        Son.fanfare();
        pluieDePieces(16);
        toast(`Objectif de ${euros(cible)} atteint. Bravo.`);
      }, 1200);
    }
    objectifAtteintVu = atteint;
  }

  let tropheesConnus = null;

  function verifierTrophees(b) {
    const s = statsTrophees(b);
    const gagnes = new Set(TROPHEES.filter((t) => t.test(s)).map((t) => t.id));
    if (tropheesConnus) {
      const nouveaux = TROPHEES.filter((t) => gagnes.has(t.id) && !tropheesConnus.has(t.id));
      if (nouveaux.length) setTimeout(() => annoncerTrophees(nouveaux), 1300);
    }
    tropheesConnus = gagnes;
    return gagnes;
  }

  // Plusieurs trophées d'un coup : ils passent l'un après l'autre.
  const fileTrophees = [];
  let tropheeAffiche = false;

  function annoncerTrophees(liste) {
    fileTrophees.push(...liste);
    if (!tropheeAffiche) tropheeSuivant();
  }

  function tropheeSuivant() {
    const pop = $('#trophee-pop');
    const t = fileTrophees.shift();
    if (!t) {
      tropheeAffiche = false;
      pop.hidden = true;
      return;
    }
    tropheeAffiche = true;
    $('#tp-glyphe').textContent = t.glyphe;
    $('#tp-nom').textContent = t.nom;
    $('#tp-desc').textContent = t.desc;
    pop.hidden = false;
    pop.classList.remove('visible');
    void pop.offsetWidth;
    pop.classList.add('visible');
    Son.fanfare();
    vibrer([20, 40, 20, 40, 60]);
    setTimeout(() => {
      pop.hidden = true;
      setTimeout(tropheeSuivant, 250);
    }, fileTrophees.length ? 2600 : 4000);
  }

  function rendreChargement() {
    $('#solde').textContent = '—';
    $('#barre-solde-valeur').textContent = '—';
    $('#pm-note').textContent = 'Ouverture du porte-monnaie…';
    $('#liste-stock').innerHTML = '';
    const vide = $('#vide-stock');
    vide.hidden = false;
    vide.innerHTML = '<p class="vide-titre">Ouverture du porte-monnaie…</p><p>Tes achats et tes ventes arrivent.</p>';
    $('#outils-stock').hidden = true;
  }

  /* Les billets et les pièces qui dépassent du porte-monnaie */

  const BILLETS = [200, 100, 50, 20, 10, 5];
  const PIECES = [200, 100, 50, 20, 10, 5, 2, 1]; // en centimes
  const BILLETS_VISIBLES = 9;
  const PIECES_VISIBLES = 6;

  function decomposer(montant) {
    let reste = Math.max(0, Math.round(montant * 100));
    const billets = [];
    const pieces = [];
    for (const v of BILLETS) {
      const n = Math.floor(reste / (v * 100));
      for (let i = 0; i < n; i += 1) billets.push(v);
      reste -= n * v * 100;
    }
    for (const v of PIECES) {
      const n = Math.floor(reste / v);
      for (let i = 0; i < n; i += 1) pieces.push(v);
      reste -= n * v;
    }
    return { billets, pieces };
  }

  // Un petit décalage propre à chaque billet, toujours le même, pour que la liasse ait l'air vraie.
  function bruit(cle, amplitude) {
    let h = 0;
    for (const c of cle) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return ((h % 1000) / 1000 - 0.5) * 2 * amplitude;
  }

  function avecCles(valeurs) {
    const vus = {};
    return valeurs.map((v) => {
      vus[v] = (vus[v] || 0) + 1;
      return { v, cle: `${v}-${vus[v]}` };
    });
  }

  function synchroniser(conteneur, elements, creer, placer) {
    const existants = new Map();
    for (const el of conteneur.children) if (!el.classList.contains('sort')) existants.set(el.dataset.cle, el);
    elements.forEach((item, i) => {
      let el = existants.get(item.cle);
      if (el) {
        existants.delete(item.cle);
      } else {
        el = creer(item);
        el.dataset.cle = item.cle;
        el.classList.add('entre');
        el.style.animationDelay = (premierRendu ? 120 + i * 90 : i * 40) + 'ms';
        el.addEventListener('animationend', () => el.classList.remove('entre'), { once: true });
        conteneur.appendChild(el);
      }
      // L'ordre d'empilement passe par z-index : déplacer un nœud relancerait ses animations.
      el.style.zIndex = String(i + 1);
      placer(el, item, i, elements.length);
    });
    let k = 0;
    for (const el of existants.values()) {
      el.classList.remove('entre');
      el.classList.add('sort');
      el.style.animationDelay = k * 50 + 'ms';
      k += 1;
      const retirer = () => el.remove();
      el.addEventListener('animationend', retirer, { once: true });
      setTimeout(retirer, 1400);
    }
  }

  let premierRendu = true;

  function rendreBillets(solde) {
    const { billets, pieces } = decomposer(solde);
    const visibles = avecCles(billets.slice(0, BILLETS_VISIBLES));
    synchroniser($('#billets'), visibles, ({ v }) => {
      const el = document.createElement('div');
      el.className = `billet b${v}`;
      el.innerHTML = `<span class="billet-valeur">${v}</span><span class="billet-etoiles"></span><span class="billet-euro">EURO</span><span class="billet-coin">${v}</span>`;
      return el;
    }, (el, { cle }, i, n) => {
      // En éventail : chaque billet décale le suivant assez pour laisser voir sa valeur.
      const milieu = (n - 1) / 2;
      const ecart = i - milieu;
      const pas = n > 1 ? Math.min(14, 50 / (n - 1)) : 0;
      el.style.setProperty('--x', (ecart * pas + bruit(cle, 1.2)).toFixed(2) + '%');
      el.style.setProperty('--y', (Math.abs(ecart) * Math.min(4, pas * 0.35) + bruit(cle + 'y', 3)).toFixed(1) + '%');
      el.style.setProperty('--r', (ecart * Math.min(6, pas * 0.5) + bruit(cle + 'r', 2)).toFixed(2) + 'deg');
    });
    const reste = billets.length - visibles.length;
    const plus = $('#pf-plus');
    plus.hidden = reste <= 0;
    plus.textContent = reste > 0 ? `+${pluriel(reste, 'billet')}` : '';

    const pieceVisibles = avecCles(pieces.slice(0, PIECES_VISIBLES));
    synchroniser($('#pf-pieces'), pieceVisibles, ({ v }) => {
      const el = document.createElement('span');
      el.className = `piece-euro p${v}`;
      el.textContent = v >= 100 ? `${v / 100}€` : `${v}c`;
      return el;
    }, (el, { cle }, i) => {
      el.style.setProperty('--i', i);
      el.style.setProperty('--r', bruit(cle, 25).toFixed(0) + 'deg');
    });
    premierRendu = false;
  }

  function rendrePorteMonnaie(b) {
    animerSolde(b.solde);
    rendreBillets(b.solde);
    const pm = $('#portemonnaie');
    pm.classList.toggle('dans-le-rouge', b.solde < 0);
    let note;
    if (b.solde < 0) note = `Tu es dans le rouge de ${euros(-b.solde)}. Remets des sous ou vends quelque chose.`;
    else if (!b.depots && !b.nbStock && !b.nbVendus) note = 'Commence par mettre tes sous dedans.';
    else note = `Tu as mis ${euros(b.depots)}${b.retraits ? ` et retiré ${euros(b.retraits)}` : ''}.`;
    $('#pm-note').textContent = note;

    $('#pm-stock').textContent = euros(b.stockCout);
    $('#pm-stock-detail').textContent = b.nbStock ? pluriel(b.nbStock, 'article') + ' à vendre' : 'Rien en stock';
    const benef = $('#pm-benef');
    benef.textContent = eurosSigne(b.benefEncaisse);
    $('#pm-benef-detail').textContent = b.nbVendus
      ? `${eurosSigne(b.benefMois)} ce mois-ci`
      : 'Rien de vendu pour l\'instant';
    $('#pm-potentiel').textContent = euros(b.potentiel);
    const enPlus = arrondi(b.stockPrevu - b.stockCout);
    $('#pm-potentiel-detail').textContent = b.nbStock
      ? `soit ${eurosSigne(enPlus)} de bénéfice en plus`
      : 'Rien à vendre pour l\'instant';
  }

  function rendreListesSaisie() {
    const sansDoublon = (base, valeurs) => {
      const vus = new Map();
      for (const v of [...base, ...valeurs]) if (v && !vus.has(cleCategorie(v))) vus.set(cleCategorie(v), v);
      return [...vus.values()];
    };
    const articles = [...etat.articles.values()];
    const options = (valeurs) => valeurs.sort((x, y) => x.localeCompare(y, 'fr')).map((v) => `<option value="${esc(v)}"></option>`).join('');
    $('#liste-categories').innerHTML = options(sansDoublon(CATEGORIES, articles.map((a) => a.categorie)));
    $('#liste-marques').innerHTML = options(sansDoublon(MARQUES, articles.map((a) => a.marque)));
    $('#liste-lieux').innerHTML = options(sansDoublon(LIEUX, articles.flatMap((a) => [a.lieuAchat, a.lieuVente])));
  }

  /* Stock */

  function articlesEnStock() {
    const q = normaliser(etat.recherche.trim());
    let liste = [];
    for (const [id, a] of etat.articles) if (a.statut !== 'vendu') liste.push({ id, a });
    if (q) liste = liste.filter(({ a }) => normaliser([a.nom, a.marque, a.taille, a.categorie, a.lieuAchat, a.note].join(' ')).includes(q));
    const tris = {
      recent: (x, y) => comparer(y.a.dateAchat, x.a.dateAchat) || (y.a.cree || 0) - (x.a.cree || 0),
      ancien: (x, y) => comparer(x.a.dateAchat, y.a.dateAchat) || (x.a.cree || 0) - (y.a.cree || 0),
      benefice: (x, y) => (beneficePrevu(y.a) ?? -Infinity) - (beneficePrevu(x.a) ?? -Infinity),
      prix: (x, y) => cout(y.a) - cout(x.a),
    };
    liste.sort(tris[etat.tri] || tris.recent);
    return liste;
  }

  function carteEtiquette({ id, a }) {
    const age = joursEntre(a.dateAchat, aujourdhui());
    const dort = age >= JOURS_DORT;
    const bp = beneficePrevu(a);
    const url = photoUrl(a);
    const details = [a.marque, a.taille ? `Taille ${a.taille}` : '', a.etat].filter(Boolean).map(esc).join(' · ');
    const meta = [libelleCategorie(a.categorie), a.lieuAchat].filter(Boolean).map(esc).join(' · ');
    const ligneBenef = bp === null
      ? '<div><dt>Bénéfice prévu</dt><dd>pas encore de prix</dd></div>'
      : `<div><dt>${bp >= 0 ? 'Bénéfice prévu' : 'Perte prévue'}</dt><dd class="${bp >= 0 ? 'gain' : 'perte'}">${eurosSigne(bp)}${cout(a) > 0 ? ` <small>${pct(marge(bp, cout(a)))}</small>` : ''}</dd></div>`;
    return `<li class="etiquette${dort ? ' dort' : ''}${url ? ' avec-photo' : ''}" data-id="${esc(id)}">
      <svg class="etq-ficelle" viewBox="0 0 40 120" preserveAspectRatio="none" aria-hidden="true"><path d="M40 60 C 26 60, 12 48, 6 22 S 10 2, 2 0"></path><path d="M40 60 C 28 64, 16 80, 10 104 S 4 118, 0 120"></path></svg>
      ${url ? `<button class="polaroid" type="button" data-action="photo" data-id="${esc(id)}" aria-label="Voir la photo de ${esc(a.nom)}"><img src="${esc(url)}" alt="" loading="lazy"></button>` : ''}
      <div class="etq-papier">
        <span class="etq-trou" aria-hidden="true"></span>
        <h3 class="etq-nom">${esc(a.nom)}</h3>
        ${details ? `<p class="etq-details">${details}</p>` : ''}
        <p class="etq-meta">${meta || 'Sans catégorie'}</p>
        <div class="etq-prix-ligne">
          <p class="etq-marqueur" title="Prix de vente prévu">${a.prixPrevu ? euros(a.prixPrevu) : '? €'}</p>
          ${dort ? `<span class="tampon" aria-hidden="true">Dort<br>${age} j</span>` : ''}
        </div>
        <dl class="etq-lignes">
          <div><dt>Payé</dt><dd>${euros(cout(a))}${a.fraisAchat ? ` <small>dont ${euros(a.fraisAchat)} de frais</small>` : ''}</dd></div>
          ${ligneBenef}
          <div><dt>En stock</dt><dd title="Acheté le ${esc(dateLongue(a.dateAchat))}">${age === 0 ? "depuis aujourd'hui" : `depuis ${pluriel(age, 'jour')}`}</dd></div>
        </dl>
        ${a.note ? `<p class="etq-note">${esc(a.note)}</p>` : ''}
        ${sampleCap ? `<button class="bouton bouton-claude ecrit" type="button" data-action="annonce" data-id="${esc(id)}">
          <svg class="icone" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/></svg>
          Annonce avec Claude</button>` : ''}
        <div class="etq-actions ecrit">
          <button class="bouton bouton-gain" type="button" data-action="vendre" data-id="${esc(id)}">Vendu&nbsp;!</button>
          <button class="bouton bouton-encre" type="button" data-action="modifier" data-id="${esc(id)}">Modifier</button>
          <button class="bouton bouton-lien" type="button" data-action="supprimer" data-id="${esc(id)}" aria-label="Supprimer ${esc(a.nom)}">Supprimer</button>
        </div>
      </div>
    </li>`;
  }

  function rendreStock(b) {
    const liste = articlesEnStock();
    const vide = $('#vide-stock');
    const outils = $('#outils-stock');
    $('#compte-stock').textContent = b.nbStock || '';
    $('#resume-stock').textContent = b.nbStock
      ? `${pluriel(b.nbStock, 'article')} · ${euros(b.stockCout)} payés · ${euros(b.stockPrevu)} prévus à la revente`
      : '';
    outils.hidden = b.nbStock < 2;
    $('#liste-stock').innerHTML = liste.map(carteEtiquette).join('');

    if (liste.length) {
      vide.hidden = true;
      return;
    }
    vide.hidden = false;
    if (etat.mode === 'lecture') {
      vide.innerHTML = '<p class="vide-titre">Rien à afficher.</p><p>Ce porte-monnaie est privé.</p>';
    } else if (b.nbStock) {
      vide.innerHTML = `<p class="vide-titre">Rien ne correspond à « ${esc(etat.recherche)} ».</p><p>Essaie un autre mot.</p>`;
    } else {
      const premier = !etat.articles.size;
      const titre = premier ? 'Ton stock est vide.' : 'Tout est vendu.';
      const texte = b.solde > 0
        ? `Tu as ${euros(b.solde)} pour acheter. Chaque achat est déduit tout de suite, tu fixes ton prix de vente, et quand il part, tu appuies sur « Vendu ! ».`
        : 'Mets des sous dans le porte-monnaie, puis enregistre ton premier achat.';
      vide.innerHTML = `
        <div class="vide-etiquette" aria-hidden="true"><span class="etq-trou"></span><span class="vide-marqueur">${premier ? '1er truc ?' : 'Le suivant ?'}</span></div>
        <div class="vide-texte">
          <p class="vide-titre">${titre}</p>
          <p>${texte}</p>
          <div class="vide-boutons ecrit">
            ${b.solde > 0
              ? `<button class="bouton bouton-or" type="button" data-ouvrir="achat">J'ai acheté un truc</button>`
              : `<button class="bouton bouton-or" type="button" data-ouvrir="depot">Mettre des sous</button>`}
          </div>
        </div>`;
    }
  }

  /* Ventes */

  function rendreVentes() {
    const vendus = [];
    for (const [id, a] of etat.articles) if (a.statut === 'vendu') vendus.push({ id, a });
    vendus.sort((x, y) => comparer(y.a.dateVente, x.a.dateVente) || (y.a.venduLe || 0) - (x.a.venduLe || 0));
    $('#compte-ventes').textContent = vendus.length || '';
    $('#vide-ventes').hidden = vendus.length > 0;
    const totalEncaisse = vendus.reduce((s, { a }) => s + encaisse(a), 0);
    const totalBenef = vendus.reduce((s, { a }) => s + benefice(a), 0);
    $('#resume-ventes').textContent = vendus.length
      ? `${pluriel(vendus.length, 'vente')} · ${euros(totalEncaisse)} encaissés · ${eurosSigne(totalBenef)} de bénéfice`
      : '';
    $('#liste-ventes').innerHTML = vendus.map(({ id, a }) => {
      const g = benefice(a);
      const duree = joursEntre(a.dateAchat, a.dateVente);
      const sous = [
        [a.marque, a.taille ? `taille ${a.taille}` : ''].filter(Boolean).join(' '),
        libelleCategorie(a.categorie),
        `acheté le ${dateCourte(a.dateAchat)}`,
        `vendu le ${dateCourte(a.dateVente)}${a.lieuVente ? ' sur ' + a.lieuVente : ''}`,
        duree === 0 ? 'parti le jour même' : `parti en ${pluriel(duree, 'jour')}`,
      ].filter(Boolean).map(esc).join(' · ');
      return `<li class="vente">
        <div class="vente-texte">
          <p class="vente-nom">${esc(a.nom)}</p>
          <p class="vente-sous">${sous}</p>
        </div>
        <dl class="vente-chiffres">
          <div><dt>Payé</dt><dd>${euros(cout(a))}</dd></div>
          <div><dt>Encaissé</dt><dd>${euros(encaisse(a))}</dd></div>
          <div class="vente-benef ${g >= 0 ? 'gain' : 'perte'}"><dt>${g >= 0 ? 'Bénéfice' : 'Perte'}</dt><dd>${eurosSigne(g)}<small>${cout(a) > 0 ? pct(marge(g, cout(a))) : ''}</small></dd></div>
        </dl>
        <div class="vente-actions ecrit">
          <button class="bouton bouton-lien" type="button" data-action="annuler-vente" data-id="${esc(id)}">Remettre en stock</button>
          <button class="bouton bouton-lien" type="button" data-action="supprimer" data-id="${esc(id)}" aria-label="Supprimer ${esc(a.nom)}">Supprimer</button>
        </div>
      </li>`;
    }).join('');
  }

  /* Journal */

  function lignesJournal() {
    const lignes = [];
    for (const [id, m] of etat.mouvements) {
      const retrait = m.type === 'retrait';
      lignes.push({
        id, col: 'mouvements', type: retrait ? 'retrait' : 'depot', date: m.date, ordre: m.cree || 0,
        libelle: m.note || (retrait ? 'Retrait' : 'Dépôt'), montant: retrait ? -m.montant : m.montant,
      });
    }
    for (const [id, a] of etat.articles) {
      lignes.push({ id, type: 'achat', date: a.dateAchat, ordre: a.cree || 0, libelle: a.nom, montant: -cout(a) });
      if (a.statut === 'vendu') {
        lignes.push({ id, type: 'vente', date: a.dateVente, ordre: a.venduLe || 0, libelle: a.nom, montant: encaisse(a) });
      }
    }
    lignes.sort((x, y) => comparer(x.date, y.date) || x.ordre - y.ordre);
    let solde = 0;
    for (const l of lignes) {
      solde = arrondi(solde + l.montant);
      l.solde = solde;
    }
    return lignes.reverse();
  }

  function rendreJournal() {
    const lignes = lignesJournal();
    const nom = (etat.reglages.nom || '').trim() || REGLAGES_DEFAUT.nom;
    const types = { depot: 'Dépôt', retrait: 'Retrait', achat: 'Achat', vente: 'Vente' };
    if (!lignes.length) {
      $('#ticket').innerHTML = `<p class="ticket-entete"><strong>${esc(nom)}</strong><span>Aucune opération pour l'instant</span></p>`;
      return;
    }
    const visibles = lignes.slice(0, etat.journalMax);
    $('#ticket').innerHTML = `
      <p class="ticket-entete"><strong>${esc(nom)}</strong><span>Ticket de caisse · ${pluriel(lignes.length, 'opération')}</span></p>
      <div class="ticket-colonnes" aria-hidden="true"><span>Date</span><span>Opération</span><span>Montant</span><span>Solde</span></div>
      <ol class="ticket-lignes">
        ${visibles.map((l) => `<li class="tl tl-${l.type}">
          <span class="tl-date">${esc(dateCourte(l.date))}</span>
          <span class="tl-lib"><span class="tl-type">${types[l.type]}</span> ${esc(l.libelle)}${l.col === 'mouvements' ? ` <button class="tl-suppr ecrit" type="button" data-action="supprimer-mouvement" data-id="${esc(l.id)}" aria-label="Supprimer ce ${l.type === 'retrait' ? 'retrait' : 'dépôt'}">×</button>` : ''}</span>
          <span class="tl-montant">${eurosSigne(l.montant)}</span>
          <span class="tl-solde">${eurosExact(l.solde)}</span>
        </li>`).join('')}
      </ol>
      ${lignes.length > visibles.length ? `<p class="ticket-plus"><button class="bouton bouton-discret bouton-petit" type="button" id="journal-plus">Afficher ${Math.min(80, lignes.length - visibles.length)} opérations de plus</button></p>` : ''}
      <p class="ticket-total"><span>Solde</span><strong>${eurosExact(lignes[0].solde)}</strong></p>`;
  }

  /* Stats */

  function moisRecents(n) {
    const [a, m] = aujourdhui().split('-').map(Number);
    const liste = [];
    for (let i = n - 1; i >= 0; i -= 1) {
      const d = new Date(Date.UTC(a, m - 1 - i, 1));
      liste.push({ cle: d.toISOString().slice(0, 7), date: d, benef: 0, ventes: 0, encaisse: 0 });
    }
    return liste;
  }

  function rendreStats() {
    const vendus = [...etat.articles.values()].filter((a) => a.statut === 'vendu');
    const totalBenef = vendus.reduce((s, a) => s + benefice(a), 0);
    const totalCout = vendus.reduce((s, a) => s + cout(a), 0);
    const delais = vendus.map((a) => joursEntre(a.dateAchat, a.dateVente));
    const delaiMoyen = delais.length ? Math.round(delais.reduce((s, d) => s + d, 0) / delais.length) : null;
    const meilleur = vendus.slice().sort((x, y) => benefice(y) - benefice(x))[0];
    const pertes = vendus.filter((a) => benefice(a) < 0).length;

    const tuile = (label, valeur, detail, classe) => `<div class="tuile ${classe || ''}">
      <p class="tuile-label">${label}</p><p class="tuile-valeur">${valeur}</p><p class="tuile-detail">${detail}</p></div>`;
    $('#tuiles').innerHTML = [
      tuile('Bénéfice total', eurosSigne(totalBenef), vendus.length ? `sur ${pluriel(vendus.length, 'vente')}` : 'Aucune vente pour l\'instant', totalBenef < 0 ? 'perte' : ''),
      tuile('Marge moyenne', totalCout > 0 ? pct(marge(totalBenef, totalCout)) : '—', 'du prix payé, gagnée à la revente'),
      tuile('Temps pour vendre', delaiMoyen === null ? '—' : pluriel(delaiMoyen, 'jour'), 'en moyenne, de l\'achat à la vente'),
      tuile('Meilleur coup', meilleur ? eurosSigne(benefice(meilleur)) : '—', meilleur ? esc(meilleur.nom) : 'Ta plus belle vente s\'affichera ici'),
      tuile('Ventes à perte', String(pertes), pertes ? 'Vendues moins cher que leur prix' : 'Aucune, bien joué'),
    ].join('');

    const mois = moisRecents(6);
    const parCle = new Map(mois.map((m) => [m.cle, m]));
    for (const a of vendus) {
      const m = parCle.get((a.dateVente || '').slice(0, 7));
      if (!m) continue;
      m.benef = arrondi(m.benef + benefice(a));
      m.encaisse = arrondi(m.encaisse + encaisse(a));
      m.ventes += 1;
    }
    dernierGraphique = mois;
    dessinerGraphique();
    $('#tableau-mois').innerHTML = `<thead><tr><th scope="col">Mois</th><th scope="col">Ventes</th><th scope="col">Encaissé</th><th scope="col">Bénéfice</th></tr></thead>
      <tbody>${mois.map((m) => `<tr><th scope="row">${fmtMoisLong.format(m.date)}</th><td>${m.ventes}</td><td>${euros(m.encaisse)}</td><td>${eurosSigne(m.benef)}</td></tr>`).join('')}</tbody>`;

    rendreRangEtTrophees();

    const categories = new Map();
    for (const a of vendus) {
      const c = libelleCategorie(a.categorie) || 'Sans catégorie';
      const x = categories.get(c) || { ventes: 0, benef: 0, cout: 0 };
      x.ventes += 1;
      x.benef += benefice(a);
      x.cout += cout(a);
      categories.set(c, x);
    }
    const lignesCat = [...categories].sort((x, y) => y[1].benef - x[1].benef);
    $('#categories').innerHTML = lignesCat.length
      ? `<table class="tableau"><thead><tr><th scope="col">Catégorie</th><th scope="col">Ventes</th><th scope="col">Bénéfice</th><th scope="col">Marge</th></tr></thead>
        <tbody>${lignesCat.map(([c, x]) => `<tr><th scope="row">${esc(c)}</th><td>${x.ventes}</td><td class="${x.benef >= 0 ? 'gain' : 'perte'}">${eurosSigne(x.benef)}</td><td>${x.cout > 0 ? pct(marge(x.benef, x.cout)) : '—'}</td></tr>`).join('')}</tbody></table>`
      : '<p class="stats-aide">Tes catégories les plus rentables apparaîtront après tes premières ventes.</p>';

    const dorment = [...etat.articles.entries()]
      .filter(([, a]) => a.statut !== 'vendu' && joursEntre(a.dateAchat, aujourdhui()) >= JOURS_DORT)
      .sort((x, y) => comparer(x[1].dateAchat, y[1].dateAchat));
    $('#dort').innerHTML = dorment.length
      ? dorment.map(([id, a]) => `<li>
          <span class="dort-nom">${esc(a.nom)}</span>
          <span class="dort-info">${joursEntre(a.dateAchat, aujourdhui())} j · payé ${euros(cout(a))}${a.prixPrevu ? ` · prévu ${euros(a.prixPrevu)}` : ''}</span>
          <button class="bouton bouton-lien ecrit" type="button" data-action="modifier" data-id="${esc(id)}">Changer le prix</button>
        </li>`).join('')
      : '<li class="dort-rien">Rien ne traîne. Ton stock tourne bien.</li>';
  }

  function rendreRangEtTrophees() {
    const b = bilan();
    const r = rangPour(b.benefEncaisse);
    $('#rang-carte').innerHTML = `
      <div class="rang-medaille" aria-hidden="true"><span>${r.niveau}</span></div>
      <div class="rang-infos">
        <p class="rang-label">Ton rang</p>
        <p class="rang-titre">${esc(r.actuel.nom)}</p>
        <div class="jauge jauge-fine"><span class="jauge-remplie" style="--p: ${(r.progres * 100).toFixed(1)}%"></span></div>
        <p class="rang-texte">${r.suivant
          ? `Encore ${euros(r.suivant.min - b.benefEncaisse)} de bénéfice pour passer <strong>${esc(r.suivant.nom)}</strong>.`
          : 'Tu as atteint le rang le plus haut.'}</p>
      </div>
      <ol class="rang-echelle">${RANGS.map((x, i) => `<li class="${i + 1 < r.niveau ? 'passe' : i + 1 === r.niveau ? 'actuel' : ''}"><span>${esc(x.nom)}</span><small>${x.min ? euros(x.min) : '0 €'}</small></li>`).join('')}</ol>`;

    const gagnes = tropheesConnus || new Set();
    $('#trophees-compte').textContent = `${gagnes.size} sur ${TROPHEES.length} débloqués`;
    $('#trophees').innerHTML = TROPHEES.map((t) => {
      const ok = gagnes.has(t.id);
      return `<li class="trophee ${ok ? 'gagne' : 'verrouille'}">
        <span class="medaille" aria-hidden="true">${esc(t.glyphe)}</span>
        <span class="trophee-texte"><strong>${esc(t.nom)}</strong><span>${esc(t.desc)}</span></span>
        <span class="visuellement-cache">${ok ? 'Débloqué' : 'Pas encore débloqué'}</span>
      </li>`;
    }).join('');
  }

  /* Graphique : bénéfice par mois, colonnes depuis une ligne zéro */

  let dernierGraphique = null;

  function echelle(min, max) {
    const etendue = max - min || 1;
    const brut = etendue / 4;
    const puissance = Math.pow(10, Math.floor(Math.log10(brut)));
    const r = brut / puissance;
    const pas = (r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10) * puissance;
    const bas = Math.floor(min / pas) * pas;
    let haut = Math.ceil(max / pas) * pas;
    if (haut === bas) haut = bas + pas;
    const graduations = [];
    for (let v = bas; v <= haut + pas / 2; v += pas) graduations.push(arrondi(v));
    return { bas, haut, graduations };
  }

  const etiquetteAxe = (v) => (Math.abs(v) >= 1000 ? fmtCompact.format(v) : fmtRond.format(v)).replace('-', MOINS);

  function colonne(x, largeur, y0, y1) {
    const h = Math.abs(y1 - y0);
    const r = Math.min(4, h, largeur / 2);
    if (h < 0.5) return '';
    if (y1 < y0) {
      return `M${x},${y0}V${y1 + r}Q${x},${y1} ${x + r},${y1}H${x + largeur - r}Q${x + largeur},${y1} ${x + largeur},${y1 + r}V${y0}Z`;
    }
    return `M${x},${y0}V${y1 - r}Q${x},${y1} ${x + r},${y1}H${x + largeur - r}Q${x + largeur},${y1} ${x + largeur},${y1 - r}V${y0}Z`;
  }

  function dessinerGraphique() {
    const boite = $('#graphique');
    const mois = dernierGraphique;
    if (!mois || boite.offsetParent === null) return;
    const L = Math.max(280, Math.round(boite.clientWidth));
    const H = 220;
    const marge = { haut: 26, droite: 8, bas: 30, gauche: 56 };
    const w = L - marge.gauche - marge.droite;
    const h = H - marge.haut - marge.bas;
    const valeurs = mois.map((m) => m.benef);
    const { bas, haut, graduations } = echelle(Math.min(0, ...valeurs), Math.max(0, ...valeurs));
    const y = (v) => marge.haut + ((haut - v) / (haut - bas)) * h;
    const y0 = y(0);
    const bande = w / mois.length;
    const epaisseur = Math.min(24, bande * 0.55);
    const meilleur = valeurs.indexOf(Math.max(...valeurs));
    const aEtiqueter = new Set([mois.length - 1]);
    if (valeurs[meilleur] > 0) aEtiqueter.add(meilleur);

    let svg = `<svg class="graphique" viewBox="0 0 ${L} ${H}" width="${L}" height="${H}" role="img" aria-label="Bénéfice par mois sur les 6 derniers mois">`;
    for (const g of graduations) {
      const gy = y(g);
      svg += `<line class="grille${g === 0 ? ' zero' : ''}" x1="${marge.gauche}" x2="${L - marge.droite}" y1="${gy}" y2="${gy}"></line>`;
      svg += `<text class="axe" x="${marge.gauche - 8}" y="${gy}" text-anchor="end" dominant-baseline="middle">${etiquetteAxe(g)}</text>`;
    }
    mois.forEach((m, i) => {
      const cx = marge.gauche + bande * i + bande / 2;
      const x = cx - epaisseur / 2;
      const y1 = y(m.benef);
      svg += `<path class="barre ${m.benef < 0 ? 'barre-perte' : 'barre-gain'}" d="${colonne(x, epaisseur, y0, y1)}"></path>`;
      svg += `<text class="axe" x="${cx}" y="${H - 10}" text-anchor="middle">${fmtMoisCourt.format(m.date)}</text>`;
      if (aEtiqueter.has(i) && m.ventes) {
        const ty = m.benef >= 0 ? y1 - 8 : y1 + 15;
        svg += `<text class="valeur" x="${cx}" y="${ty}" text-anchor="middle">${eurosSigne(m.benef)}</text>`;
      }
      svg += `<rect class="cible" data-i="${i}" x="${marge.gauche + bande * i}" y="${marge.haut}" width="${bande}" height="${h}" tabindex="0"
        aria-label="${esc(fmtMoisLong.format(m.date))} : ${esc(eurosSigne(m.benef))}, ${esc(pluriel(m.ventes, 'vente'))}"></rect>`;
    });
    svg += '</svg><div class="infobulle" id="infobulle" hidden></div>';
    boite.innerHTML = svg;
  }

  function montrerInfobulle(cible) {
    const i = Number(cible.dataset.i);
    const m = dernierGraphique && dernierGraphique[i];
    const bulle = $('#infobulle');
    if (!m || !bulle) return;
    bulle.innerHTML = `<strong>${esc(fmtMoisLong.format(m.date))}</strong>
      <span>Bénéfice <b class="${m.benef < 0 ? 'perte' : 'gain'}">${eurosSigne(m.benef)}</b></span>
      <span>${pluriel(m.ventes, 'vente')} · ${euros(m.encaisse)} encaissés</span>`;
    bulle.hidden = false;
    const boite = $('#graphique').getBoundingClientRect();
    const r = cible.getBoundingClientRect();
    const largeur = bulle.offsetWidth;
    let gauche = r.left - boite.left + r.width / 2 - largeur / 2;
    gauche = Math.max(0, Math.min(boite.width - largeur, gauche));
    bulle.style.left = gauche + 'px';
    bulle.style.top = '0px';
    $$('#graphique .barre').forEach((b, j) => b.classList.toggle('estompee', j !== i));
  }

  function cacherInfobulle() {
    const bulle = $('#infobulle');
    if (bulle) bulle.hidden = true;
    $$('#graphique .barre').forEach((b) => b.classList.remove('estompee'));
  }

  /* ---------- Vues (onglets) ---------- */

  const VUES = ['stock', 'ventes', 'journal', 'stats', 'calcul'];

  function afficherVue(nom) {
    etat.vue = VUES.includes(nom) ? nom : 'stock';
    for (const v of VUES) $('#vue-' + v).hidden = v !== etat.vue;
    $$('.onglets a').forEach((a) => {
      if (a.dataset.vue === etat.vue) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    if (etat.vue === 'stats') dessinerGraphique();
  }

  /* ---------- Fenêtres ---------- */

  function ouvrir(dlg) {
    if (typeof dlg.showModal === 'function') {
      if (!dlg.open) dlg.showModal();
    } else {
      dlg.setAttribute('open', '');
    }
  }
  function fermer(dlg) {
    if (typeof dlg.close === 'function') dlg.close();
    else dlg.removeAttribute('open');
  }
  function montrerErreur(sel, texte) {
    const el = $(sel);
    el.textContent = texte || '';
    el.hidden = !texte;
  }

  let confirmation = null;
  function confirmer(texte, oui) {
    $('#confirmer-texte').textContent = texte;
    $('#confirmer-oui').textContent = oui || 'Oui';
    ouvrir($('#dlg-confirmer'));
    return new Promise((resoudre) => { confirmation = resoudre; });
  }
  function repondre(valeur) {
    fermer($('#dlg-confirmer'));
    if (confirmation) confirmation(valeur);
    confirmation = null;
  }

  let minuterieToast = 0;
  let actionToast = null;
  function toast(texte, action) {
    const el = $('#toast');
    $('#toast-texte').textContent = texte;
    const bouton = $('#toast-action');
    actionToast = action ? action.faire : null;
    bouton.hidden = !action;
    if (action) bouton.textContent = action.label;
    el.hidden = false;
    el.classList.remove('visible');
    void el.offsetWidth;
    el.classList.add('visible');
    clearTimeout(minuterieToast);
    minuterieToast = setTimeout(() => { el.hidden = true; actionToast = null; }, action ? 7000 : 4200);
  }

  /* Le son de la caisse, fabriqué à la volée : aucun fichier à charger. */
  const Son = {
    ctx: null,
    actif: (() => {
      try { return localStorage.getItem(CLE_SON) !== 'non'; } catch (e) { return true; }
    })(),
    contexte() {
      if (!this.actif) return null;
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      if (!this.ctx) {
        try { this.ctx = new C(); } catch (e) { return null; }
      }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return this.ctx;
    },
    souffle(ctx, t, duree, volume, filtre, frequence) {
      const n = Math.max(1, Math.floor(ctx.sampleRate * duree));
      const buffer = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = buffer.getChannelData(0);
      for (let i = 0; i < n; i += 1) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const f = ctx.createBiquadFilter();
      f.type = filtre;
      f.frequency.value = frequence;
      const g = ctx.createGain();
      g.gain.setValueAtTime(volume, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
      src.connect(f).connect(g).connect(ctx.destination);
      src.start(t);
      src.stop(t + duree + 0.02);
    },
    tinte(ctx, t, frequence, duree, volume, forme) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = forme || 'sine';
      o.frequency.setValueAtTime(frequence, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(volume, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + duree + 0.05);
    },
    kaching() {
      const ctx = this.contexte();
      if (!ctx) return;
      const t = ctx.currentTime + 0.01;
      this.souffle(ctx, t, 0.09, 0.35, 'bandpass', 1700);
      [[2637, 0.2], [3951, 0.11], [5274, 0.05]].forEach(([f, v]) => this.tinte(ctx, t + 0.07, f, 1.3, v));
      [[3136, 0.15], [4699, 0.07]].forEach(([f, v]) => this.tinte(ctx, t + 0.17, f, 1.1, v));
    },
    tampon() {
      const ctx = this.contexte();
      if (!ctx) return;
      const t = ctx.currentTime + 0.01;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.16);
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.25);
      this.souffle(ctx, t, 0.06, 0.25, 'lowpass', 900);
    },
    pieces() {
      const ctx = this.contexte();
      if (!ctx) return;
      const t = ctx.currentTime + 0.01;
      for (let i = 0; i < 4; i += 1) this.tinte(ctx, t + i * 0.075 + Math.random() * 0.02, 2200 + Math.random() * 1400, 0.3, 0.07, 'triangle');
    },
    papier() {
      const ctx = this.contexte();
      if (!ctx) return;
      this.souffle(ctx, ctx.currentTime + 0.01, 0.22, 0.14, 'highpass', 2600);
    },
    fanfare() {
      const ctx = this.contexte();
      if (!ctx) return;
      const t = ctx.currentTime + 0.01;
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tinte(ctx, t + i * 0.11, f, i === 3 ? 0.9 : 0.3, 0.12, 'triangle'));
    },
  };

  function vibrer(motif) {
    try {
      if (navigator.vibrate) navigator.vibrate(motif);
    } catch (e) { /* pas de vibreur ici */ }
  }

  function rendreSon() {
    const bouton = $('#son');
    bouton.setAttribute('aria-pressed', String(Son.actif));
    bouton.title = Son.actif ? 'Couper le son' : 'Remettre le son';
  }

  function pluieDePieces(nombre) {
    if (mouvementReduit) return;
    const zone = $('#pieces');
    for (let i = 0; i < nombre; i += 1) {
      const p = document.createElement('span');
      p.className = 'piece';
      p.style.left = 30 + Math.random() * 55 + '%';
      p.style.animationDelay = i * 70 + 'ms';
      p.style.setProperty('--derive', (Math.random() * 40 - 20).toFixed(0) + 'px');
      zone.appendChild(p);
      setTimeout(() => p.remove(), 1600 + i * 70);
    }
  }

  /* Achat */

  let achatEnCours = null; // id de l'article modifié, ou null pour un nouvel achat

  function ouvrirAchat(id) {
    achatEnCours = id || null;
    const a = id ? etat.articles.get(id) : null;
    $('#dlg-achat-titre').textContent = a ? 'Modifier l\'achat' : 'J\'ai acheté un truc';
    $('#a-nom').value = a ? a.nom : '';
    $('#a-marque').value = a ? a.marque || '' : '';
    $('#a-taille').value = a ? a.taille || '' : '';
    $('#a-etat').value = a ? a.etat || '' : '';
    reinitPhotoAchat(a);
    $('#a-prix').value = a ? String(a.prixAchat).replace('.', ',') : '';
    $('#a-frais').value = a && a.fraisAchat ? String(a.fraisAchat).replace('.', ',') : '';
    $('#a-categorie').value = a ? a.categorie || '' : '';
    $('#a-lieu').value = a ? a.lieuAchat || '' : '';
    $('#a-date').value = a ? a.dateAchat : aujourdhui();
    $('#a-prevu').value = a && a.prixPrevu ? String(a.prixPrevu).replace('.', ',') : '';
    $('#a-note').value = a ? a.note || '' : '';
    prevuTouche = Boolean(a && a.prixPrevu);
    montrerErreur('#a-erreur', '');
    majAideAchat();
    ouvrir($('#dlg-achat'));
    if (!a) setTimeout(() => $('#a-nom').focus(), 30);
  }

  let prevuTouche = false;

  // La photo choisie dans la fenêtre d'achat, en attente d'enregistrement.
  const photoAchat = { blob: null, url: null, retiree: false };

  function reinitPhotoAchat(a) {
    if (photoAchat.blob && photoAchat.url) URL.revokeObjectURL(photoAchat.url);
    photoAchat.blob = null;
    photoAchat.retiree = false;
    photoAchat.url = a ? photoUrl(a) : null;
    afficherPhotoAchat();
  }

  function afficherPhotoAchat() {
    $('#a-photo-zone').hidden = !peutPhotos();
    $('#a-photo-apercu').hidden = !photoAchat.url;
    if (photoAchat.url) $('#a-photo-img').src = photoAchat.url;
    else $('#a-photo-img').removeAttribute('src');
    $('#a-photo-texte').textContent = photoAchat.url ? 'Changer la photo' : 'Ajouter une photo';
    $('#a-photo-retirer').hidden = !photoAchat.url;
  }

  // Une photo de téléphone pèse plusieurs Mo : on la réduit avant de la garder.
  async function compresserPhoto(fichier, cote) {
    let source;
    let largeur;
    let hauteur;
    let urlTemporaire = null;
    try {
      source = await createImageBitmap(fichier);
      largeur = source.width;
      hauteur = source.height;
    } catch (e) {
      urlTemporaire = URL.createObjectURL(fichier);
      source = new Image();
      source.src = urlTemporaire;
      await source.decode();
      largeur = source.naturalWidth;
      hauteur = source.naturalHeight;
    }
    const k = Math.min(1, cote / Math.max(largeur, hauteur));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(largeur * k));
    canvas.height = Math.max(1, Math.round(hauteur * k));
    canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
    if (urlTemporaire) URL.revokeObjectURL(urlTemporaire);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.82));
    if (!blob) throw new Error('photo illisible');
    return blob;
  }

  const blobVersDataUrl = (blob) => new Promise((resoudre, rejeter) => {
    const lecteur = new FileReader();
    lecteur.onload = () => resoudre(lecteur.result);
    lecteur.onerror = () => rejeter(lecteur.error);
    lecteur.readAsDataURL(blob);
  });

  function messagePhoto(e) {
    const code = e && e.code;
    if (code === 'too_large') return 'La photo est trop lourde. Essaie une autre image.';
    if (code === 'quota_or_state') return "Plus de place pour les photos. Supprime des articles vendus qui en ont une.";
    if (code === 'rate_limited') return 'Trop de photos envoyées à la suite. Attends un peu et réessaie.';
    return "La photo n'a pas pu être envoyée. Vérifie ta connexion et réessaie.";
  }

  function majAideAchat() {
    const prix = lireMontant($('#a-prix').value) || 0;
    const frais = lireMontant($('#a-frais').value) || 0;
    const c = arrondi((Number.isNaN(prix) ? 0 : prix) + (Number.isNaN(frais) ? 0 : frais));
    const ancien = achatEnCours ? etat.articles.get(achatEnCours) : null;
    $('#a-cout').textContent = euros(c);

    const b = bilan();
    const enPlus = ancien ? c - cout(ancien) : c;
    const alerte = $('#a-alerte');
    if (enPlus > 0 && enPlus > b.solde) {
      alerte.hidden = false;
      alerte.textContent = `Il te manque ${euros(enPlus - Math.max(0, b.solde))} dans le porte-monnaie. Tu peux quand même l'enregistrer : le solde passera dans le rouge.`;
    } else {
      alerte.hidden = true;
    }

    if (!prevuTouche && c > 0) {
      const visee = Number(etat.reglages.marge) || 0;
      $('#a-prevu').value = String(prixRond(prixPourGagner(c, c * visee / 100)));
    }
    if (!prevuTouche && c === 0) $('#a-prevu').value = '';

    const prevu = lireMontant($('#a-prevu').value);
    const ligne = $('#a-benef');
    if (prevu && c > 0) {
      const g = arrondi(prevu - fraisEstimes(prevu) - c);
      ligne.className = 'aide-benef ' + (g >= 0 ? 'gain' : 'perte');
      ligne.innerHTML = `À ${euros(prevu)}, tu ${g >= 0 ? 'gagnes' : 'perds'} <strong>${euros(Math.abs(g))}</strong> (${pct(marge(g, c))})${tauxCommission() ? `, après ${euros(fraisEstimes(prevu))} de frais de vente` : ''}.`;
    } else {
      ligne.className = 'aide-benef';
      ligne.textContent = c > 0 ? 'Choisis un prix de vente, ou appuie sur une des propositions.' : '';
    }
    $('#a-valider').textContent = ancien ? 'Enregistrer' : (c > 0 ? `Enregistrer l'achat (${MOINS}${euros(c)})` : 'Enregistrer l\'achat');
  }

  async function validerAchat(e) {
    e.preventDefault();
    const nom = $('#a-nom').value.trim();
    const prix = lireMontant($('#a-prix').value);
    const frais = lireMontant($('#a-frais').value);
    const prevu = lireMontant($('#a-prevu').value);
    if (!nom) return montrerErreur('#a-erreur', 'Donne un nom à ce que tu as acheté.');
    if (prix === null || Number.isNaN(prix) || prix < 0) return montrerErreur('#a-erreur', 'Indique le prix payé, en euros (par exemple 45 ou 12,50).');
    if (Number.isNaN(frais) || (frais !== null && frais < 0)) return montrerErreur('#a-erreur', 'Les frais doivent être un montant en euros, ou rien.');
    if (Number.isNaN(prevu) || (prevu !== null && prevu < 0)) return montrerErreur('#a-erreur', 'Le prix de vente prévu doit être un montant en euros, ou rien.');

    const ancien = achatEnCours ? etat.articles.get(achatEnCours) : null;
    const id = achatEnCours || nouvelId();
    const data = {
      ...(ancien || {}),
      nom,
      categorie: $('#a-categorie').value.trim(),
      lieuAchat: $('#a-lieu').value.trim(),
      prixAchat: prix,
      fraisAchat: frais || 0,
      dateAchat: $('#a-date').value || aujourdhui(),
      prixPrevu: prevu || null,
      note: $('#a-note').value.trim(),
      marque: $('#a-marque').value.trim(),
      taille: $('#a-taille').value.trim(),
      etat: $('#a-etat').value,
      statut: ancien ? ancien.statut : 'stock',
      cree: ancien ? ancien.cree || Date.now() : Date.now(),
    };
    const bouton = $('#a-valider');
    const texteBouton = bouton.textContent;
    bouton.disabled = true;
    let ancienneAsset = null;
    try {
      if (photoAchat.blob) {
        if (Stockage.db) {
          if (!assetsCap) throw { code: 'photo_indisponible' };
          bouton.textContent = 'Envoi de la photo…';
          try {
            const envoi = await assetsCap.upload(photoAchat.blob, { type: 'image/jpeg' });
            data.photo = envoi.id;
          } catch (err) {
            throw { code: 'photo', detail: err };
          }
          data.photoLocale = null;
        } else {
          data.photoLocale = await blobVersDataUrl(photoAchat.blob);
          data.photo = null;
        }
        if (ancien && ancien.photo) ancienneAsset = ancien.photo;
      } else if (photoAchat.retiree) {
        if (ancien && ancien.photo) ancienneAsset = ancien.photo;
        data.photo = null;
        data.photoLocale = null;
      }
      await Stockage.ecrire('articles', id, data);
      if (ancienneAsset && assetsCap) assetsCap.delete(ancienneAsset).catch(() => {});
      fermer($('#dlg-achat'));
      if (ancien) {
        toast(`« ${nom} » est à jour.`);
      } else {
        Son.papier();
        vibrer(25);
        toast(`Achat enregistré : ${MOINS}${euros(cout(data))} dans le porte-monnaie.`);
      }
    } catch (err) {
      if (err && err.code === 'photo') montrerErreur('#a-erreur', messagePhoto(err.detail));
      else if (err && err.code === 'photo_indisponible') montrerErreur('#a-erreur', "Les photos ne sont pas disponibles ici. Retire la photo pour enregistrer l'achat.");
      else montrerErreur('#a-erreur', messageErreur(err));
    } finally {
      bouton.disabled = false;
      bouton.textContent = texteBouton;
    }
  }

  /* Vente */

  let venteEnCours = null;
  let fraisVenteTouche = false;

  function ouvrirVente(id) {
    const a = etat.articles.get(id);
    if (!a) return;
    venteEnCours = id;
    fraisVenteTouche = false;
    $('#dlg-vente-titre').textContent = `Vendu : ${a.nom}`;
    $('#v-rappel').textContent = `Payé ${euros(cout(a))} le ${dateCourte(a.dateAchat)}${a.prixPrevu ? ` · prix prévu ${euros(a.prixPrevu)}` : ''}.`;
    $('#v-prix').value = a.prixPrevu ? String(a.prixPrevu).replace('.', ',') : '';
    $('#v-frais').value = '';
    $('#v-date').value = aujourdhui();
    $('#v-lieu').value = '';
    montrerErreur('#v-erreur', '');
    majVente();
    ouvrir($('#dlg-vente'));
    setTimeout(() => $('#v-prix').select(), 30);
  }

  function majVente() {
    const a = etat.articles.get(venteEnCours);
    if (!a) return;
    const prix = lireMontant($('#v-prix').value);
    if (!fraisVenteTouche) {
      $('#v-frais').value = prix && tauxCommission() ? String(fraisEstimes(prix)).replace('.', ',') : '';
    }
    const frais = lireMontant($('#v-frais').value) || 0;
    const zone = $('#v-resultat');
    if (!prix || Number.isNaN(prix)) {
      zone.innerHTML = '<p>Indique le prix auquel tu l\'as vendu.</p>';
      $('#v-valider').textContent = 'Encaisser';
      return;
    }
    const recu = arrondi(prix - (Number.isNaN(frais) ? 0 : frais));
    const g = arrondi(recu - cout(a));
    zone.className = 'resultat-vente ' + (g >= 0 ? 'gain' : 'perte');
    zone.innerHTML = `
      <div><span>Revient dans le porte-monnaie</span><strong>+${euros(recu)}</strong></div>
      <div><span>${g >= 0 ? 'Ton bénéfice' : 'Ta perte'}</span><strong>${eurosSigne(g)}${cout(a) > 0 ? ` <small>${pct(marge(g, cout(a)))}</small>` : ''}</strong></div>`;
    $('#v-valider').textContent = `Encaisser ${euros(recu)}`;
  }

  async function validerVente(e) {
    e.preventDefault();
    const a = etat.articles.get(venteEnCours);
    if (!a) return fermer($('#dlg-vente'));
    const prix = lireMontant($('#v-prix').value);
    const frais = lireMontant($('#v-frais').value);
    if (prix === null || Number.isNaN(prix) || prix < 0) return montrerErreur('#v-erreur', 'Indique le prix de vente, en euros.');
    if (Number.isNaN(frais) || (frais !== null && frais < 0)) return montrerErreur('#v-erreur', 'Les frais de vente doivent être un montant en euros, ou rien.');
    const dateVente = $('#v-date').value || aujourdhui();
    if (dateVente < a.dateAchat) return montrerErreur('#v-erreur', `La date de vente est avant la date d'achat (${dateCourte(a.dateAchat)}).`);
    const data = {
      ...a,
      statut: 'vendu',
      prixVente: prix,
      fraisVente: frais || 0,
      dateVente,
      lieuVente: $('#v-lieu').value.trim(),
      venduLe: Date.now(),
    };
    const id = venteEnCours;
    const bouton = $('#v-valider');
    bouton.disabled = true;
    fermer($('#dlg-vente'));

    // Le grand moment : le tampon « Vendu » claque sur l'étiquette, puis elle s'envole.
    const carte = document.querySelector(`.etiquette[data-id="${CSS.escape(id)}"]`);
    let animee = false;
    if (carte && !mouvementReduit && etat.vue === 'stock') {
      const r = carte.getBoundingClientRect();
      if (r.bottom > 0 && r.top < window.innerHeight) {
        animee = true;
        carte.classList.add('vendue');
        setTimeout(() => { Son.tampon(); vibrer(45); }, 120);
        await attendre(1050);
      }
    }
    try {
      await Stockage.ecrire('articles', id, data);
      const g = benefice(data);
      Son.kaching();
      vibrer([30, 50, 30, 50, 80]);
      pluieDePieces(g > 0 ? 12 : 4);
      toast(g >= 0
        ? `Vendu ! +${euros(encaisse(data))} dans le porte-monnaie, dont ${euros(g)} de bénéfice.`
        : `Vendu. +${euros(encaisse(data))} dans le porte-monnaie, mais ${euros(-g)} de perte.`);
    } catch (err) {
      if (animee) carte.classList.remove('vendue');
      toast(messageErreur(err));
    } finally {
      bouton.disabled = false;
    }
  }

  async function annulerVente(id) {
    const a = etat.articles.get(id);
    if (!a) return;
    const ok = await confirmer(`Remettre « ${a.nom} » en stock ? Les ${euros(encaisse(a))} de la vente ressortent du porte-monnaie.`, 'Remettre en stock');
    if (!ok) return;
    const data = { ...a, statut: 'stock', prixVente: null, fraisVente: null, dateVente: null, lieuVente: null, venduLe: null };
    try {
      await Stockage.ecrire('articles', id, data);
      toast(`« ${a.nom} » est de retour dans le stock.`);
    } catch (err) {
      toast(messageErreur(err));
    }
  }

  async function supprimerArticle(id) {
    const a = etat.articles.get(id);
    if (!a) return;
    const effet = a.statut === 'vendu'
      ? `L'achat et la vente disparaissent du porte-monnaie (${eurosSigne(-benefice(a))} sur le solde).`
      : `Les ${euros(cout(a))} de l'achat reviennent dans le porte-monnaie.`;
    const ok = await confirmer(`Supprimer « ${a.nom} » ? ${effet}`, 'Supprimer');
    if (!ok) return;
    try {
      await Stockage.effacer('articles', id);
      let annule = false;
      toast(`« ${a.nom} » est supprimé.`, {
        label: 'Annuler',
        faire: () => {
          annule = true;
          Stockage.ecrire('articles', id, a).catch((err) => toast(messageErreur(err)));
        },
      });
      if (a.photo && assetsCap) {
        setTimeout(() => {
          if (!annule && !etat.articles.has(id)) assetsCap.delete(a.photo).catch(() => {});
        }, 9000);
      }
    } catch (err) {
      toast(messageErreur(err));
    }
  }

  /* Dépôt / retrait */

  let typeMouvement = 'depot';

  function ouvrirMouvement(type) {
    typeMouvement = type === 'retrait' ? 'retrait' : 'depot';
    const depot = typeMouvement === 'depot';
    $('#dlg-mouvement-titre').textContent = depot ? 'Mettre des sous' : 'Retirer des sous';
    $('#m-montant').value = '';
    $('#m-note').value = '';
    $('#m-note').placeholder = depot ? (etat.mouvements.size ? 'ex. Paie du mois' : 'ex. Mise de départ') : 'ex. Pour moi';
    $('#m-date').value = aujourdhui();
    montrerErreur('#m-erreur', '');
    majMouvement();
    ouvrir($('#dlg-mouvement'));
    setTimeout(() => $('#m-montant').focus(), 30);
  }

  function majMouvement() {
    const montant = lireMontant($('#m-montant').value);
    const depot = typeMouvement === 'depot';
    const ok = montant && !Number.isNaN(montant) && montant > 0;
    $('#m-valider').textContent = ok ? `${depot ? 'Ajouter' : 'Retirer'} ${euros(montant)}` : (depot ? 'Ajouter' : 'Retirer');
    const alerte = $('#m-alerte');
    const solde = bilan().solde;
    if (!depot && ok && montant > solde) {
      alerte.hidden = false;
      alerte.textContent = `Il n'y a que ${euros(Math.max(0, solde))} dans le porte-monnaie. Le solde passera dans le rouge.`;
    } else {
      alerte.hidden = true;
    }
  }

  async function validerMouvement(e) {
    e.preventDefault();
    const montant = lireMontant($('#m-montant').value);
    if (!montant || Number.isNaN(montant) || montant <= 0) return montrerErreur('#m-erreur', 'Indique un montant en euros, plus grand que zéro.');
    const depot = typeMouvement === 'depot';
    const data = {
      type: typeMouvement,
      montant,
      note: $('#m-note').value.trim(),
      date: $('#m-date').value || aujourdhui(),
      cree: Date.now(),
    };
    const bouton = $('#m-valider');
    bouton.disabled = true;
    try {
      await Stockage.ecrire('mouvements', nouvelId(), data);
      fermer($('#dlg-mouvement'));
      if (depot) {
        pluieDePieces(8);
        Son.pieces();
      } else {
        Son.papier();
      }
      toast(depot ? `+${euros(montant)} dans le porte-monnaie.` : `${MOINS}${euros(montant)} retirés du porte-monnaie.`);
    } catch (err) {
      montrerErreur('#m-erreur', messageErreur(err));
    } finally {
      bouton.disabled = false;
    }
  }

  async function supprimerMouvement(id) {
    const m = etat.mouvements.get(id);
    if (!m) return;
    const depot = m.type !== 'retrait';
    const ok = await confirmer(`Supprimer ce ${depot ? 'dépôt' : 'retrait'} de ${euros(m.montant)} ? Le solde ${depot ? 'baisse' : 'remonte'} d'autant.`, 'Supprimer');
    if (!ok) return;
    try {
      await Stockage.effacer('mouvements', id);
      toast(`${depot ? 'Dépôt' : 'Retrait'} supprimé.`, {
        label: 'Annuler',
        faire: () => Stockage.ecrire('mouvements', id, m).catch((err) => toast(messageErreur(err))),
      });
    } catch (err) {
      toast(messageErreur(err));
    }
  }

  /* Réglages, sauvegardes */

  function ouvrirReglages() {
    $('#r-nom').value = etat.reglages.nom || '';
    $('#r-marge').value = String(etat.reglages.marge ?? REGLAGES_DEFAUT.marge).replace('.', ',');
    $('#r-commission').value = String(etat.reglages.commission ?? 0).replace('.', ',');
    $('#r-objectif').value = etat.reglages.objectif ? String(etat.reglages.objectif).replace('.', ',') : '';
    montrerErreur('#r-erreur', '');
    ouvrir($('#dlg-reglages'));
  }

  async function validerReglages(e) {
    e.preventDefault();
    const margeVisee = lireMontant($('#r-marge').value);
    const commission = lireMontant($('#r-commission').value);
    if (margeVisee === null || Number.isNaN(margeVisee) || margeVisee < 0) return montrerErreur('#r-erreur', 'La marge visée doit être un pourcentage, par exemple 50.');
    if (commission === null || Number.isNaN(commission) || commission < 0 || commission >= 90) return montrerErreur('#r-erreur', 'Les frais de vente doivent être un pourcentage entre 0 et 89.');
    const objectif = lireMontant($('#r-objectif').value);
    if (Number.isNaN(objectif) || (objectif !== null && objectif < 0)) return montrerErreur('#r-erreur', "L'objectif doit être un montant en euros, ou rien.");
    const data = { nom: $('#r-nom').value.trim() || REGLAGES_DEFAUT.nom, marge: margeVisee, commission, objectif: objectif || null };
    try {
      await Stockage.ecrire('reglages', 'caisse', data);
      fermer($('#dlg-reglages'));
      toast('Réglages enregistrés.');
    } catch (err) {
      montrerErreur('#r-erreur', messageErreur(err));
    }
  }

  async function proposerFichier(nom, contenu, type) {
    if (window.claude && typeof window.claude.use === 'function') {
      let telechargements = null;
      try { telechargements = await window.claude.use('downloads'); } catch (e) { telechargements = null; }
      if (!telechargements) {
        toast("Le téléchargement n'est pas disponible ici. Ouvre la page dans claude.ai.");
        return;
      }
      try {
        await telechargements.save({ filename: nom, data: contenu });
        toast('Fichier enregistré.');
      } catch (err) {
        if (err && err.code !== 'declined') toast("Le fichier n'a pas pu être enregistré. Réessaie dans un instant.");
      }
      return;
    }
    const url = URL.createObjectURL(new Blob([contenu], { type }));
    const lien = document.createElement('a');
    lien.href = url;
    lien.download = nom;
    document.body.appendChild(lien);
    lien.click();
    lien.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function exporterCsv() {
    const nombre = (n) => (n === null || n === undefined || n === '' ? '' : String(arrondi(n)).replace('.', ','));
    const cellule = (v) => {
      const s = String(v ?? '');
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const entetes = ['Nom', 'Marque', 'Taille', 'État', 'Catégorie', 'Acheté où', "Date d'achat", "Prix d'achat", "Frais d'achat", 'Prix prévu', 'Statut', 'Date de vente', 'Vendu où', 'Prix de vente', 'Frais de vente', 'Bénéfice', 'Note'];
    const lignes = [...etat.articles.values()]
      .sort((x, y) => comparer(x.dateAchat, y.dateAchat))
      .map((a) => [
        a.nom, a.marque, a.taille, a.etat, a.categorie, a.lieuAchat, a.dateAchat, nombre(a.prixAchat), nombre(a.fraisAchat), nombre(a.prixPrevu),
        a.statut === 'vendu' ? 'Vendu' : 'En stock', a.dateVente || '', a.lieuVente || '',
        a.statut === 'vendu' ? nombre(a.prixVente) : '', a.statut === 'vendu' ? nombre(a.fraisVente) : '',
        a.statut === 'vendu' ? nombre(benefice(a)) : '', a.note,
      ].map(cellule).join(';'));
    const csv = '﻿' + [entetes.join(';'), ...lignes].join('\r\n');
    proposerFichier(`revente-${aujourdhui()}.csv`, csv, 'text/csv;charset=utf-8');
  }

  function exporterJson() {
    const donnees = {
      application: 'porte-monnaie-revente',
      version: 1,
      exporteLe: new Date().toISOString(),
      articles: Object.fromEntries(etat.articles),
      mouvements: Object.fromEntries(etat.mouvements),
      reglages: etat.reglages,
    };
    proposerFichier(`sauvegarde-revente-${aujourdhui()}.json`, JSON.stringify(donnees, null, 2), 'application/json');
  }

  const valeurPropre = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
  const idValide = (id) => /^[A-Za-z0-9_\-.~:@+]{1,120}$/.test(id) && id !== '.' && id !== '..';

  async function importerJson(fichier) {
    let donnees;
    try {
      donnees = JSON.parse(await fichier.text());
    } catch (e) {
      toast("Ce fichier n'est pas une sauvegarde lisible.");
      return;
    }
    const articles = Object.entries(valeurPropre(donnees && donnees.articles) || {}).filter(([id, a]) => idValide(id) && valeurPropre(a) && typeof a.nom === 'string');
    const mouvements = Object.entries(valeurPropre(donnees && donnees.mouvements) || {}).filter(([id, m]) => idValide(id) && valeurPropre(m) && typeof m.montant === 'number');
    if (!articles.length && !mouvements.length) {
      toast('Cette sauvegarde est vide ou ne vient pas de cette appli.');
      return;
    }
    const ok = await confirmer(`Restaurer ${pluriel(articles.length, 'article')} et ${pluriel(mouvements.length, 'mouvement')} ? Ils s'ajoutent à ce qui est déjà là (un même article est remplacé).`, 'Restaurer');
    if (!ok) return;
    const operations = [
      ...articles.map(([id, data]) => ({ col: 'articles', id, data })),
      ...mouvements.map(([id, data]) => ({ col: 'mouvements', id, data })),
    ];
    const reglages = valeurPropre(donnees.reglages);
    if (reglages) operations.push({ col: 'reglages', id: 'caisse', data: { nom: String(reglages.nom || REGLAGES_DEFAUT.nom), marge: Number(reglages.marge) || 0, commission: Number(reglages.commission) || 0, objectif: Number(reglages.objectif) || null } });
    // Les photos gardées dans le navigateur sont trop lourdes pour le compte : elles restent sur l'appareil d'origine.
    if (Stockage.db) for (const op of operations) if (op.col === 'articles' && op.data.photoLocale) op.data = { ...op.data, photoLocale: null };
    try {
      await Stockage.lot(operations);
      fermer($('#dlg-reglages'));
      toast('Sauvegarde restaurée.');
    } catch (err) {
      toast(messageErreur(err));
    }
  }

  async function toutEffacer() {
    const total = etat.articles.size + etat.mouvements.size;
    if (!total) {
      toast('Il n\'y a rien à effacer.');
      return;
    }
    fermer($('#dlg-reglages'));
    const ok = await confirmer(`Effacer ${pluriel(etat.articles.size, 'article')} et ${pluriel(etat.mouvements.size, 'mouvement')} ? Impossible de revenir en arrière sans sauvegarde.`, 'Tout effacer');
    if (!ok) return;
    const photos = [...etat.articles.values()].map((a) => a.photo).filter(Boolean);
    try {
      await Stockage.lot([
        ...[...etat.articles.keys()].map((id) => ({ col: 'articles', id, data: null })),
        ...[...etat.mouvements.keys()].map((id) => ({ col: 'mouvements', id, data: null })),
      ]);
      soldeAffiche = null;
      if (assetsCap) photos.forEach((ref) => assetsCap.delete(ref).catch(() => {}));
      toast('Le porte-monnaie est vide. À toi de jouer.');
    } catch (err) {
      toast(messageErreur(err));
    }
  }

  /* Annonce écrite par Claude */

  let annonceEnCours = null;
  let annonceCtl = null;
  let annonceTexte = { titre: '', description: '', hashtags: '' };

  function promptAnnonce(a, avecPhoto) {
    const lignes = [
      ['Article', a.nom], ['Marque', a.marque], ['Catégorie', libelleCategorie(a.categorie)], ['Taille', a.taille],
      ['État', a.etat], ['Notes du vendeur', a.note], ['Prix demandé', a.prixPrevu ? euros(a.prixPrevu) : ''],
    ].filter(([, v]) => v).map(([k, v]) => `- ${k} : ${v}`).join('\n');
    return `Tu aides un particulier qui revend des articles d'occasion à écrire son annonce pour Vinted ou Leboncoin.
Écris en français courant, sur un ton simple et vendeur, sans exagération et sans emoji.
N'invente aucun détail : utilise seulement les informations ci-dessous${avecPhoto ? ' et ce qui se voit clairement sur la photo jointe (couleur, coupe, matière apparente, logo)' : ''}. Si une information manque (taille, état), n'en parle pas.

${lignes}

Réponds exactement dans ce format, sans rien d'autre :
TITRE: <un titre de 60 caractères maximum, avec la marque, le type d'article, la couleur si elle est connue et la taille si elle est connue>
DESCRIPTION:
<4 à 7 lignes courtes : ce que c'est, l'état, la taille, les détails utiles ; termine par une ligne sur l'envoi rapide et soigné>
HASHTAGS: <5 à 8 mots-clés en hashtags, séparés par des espaces>`;
  }

  function lireAnnonce(texte) {
    const t = String(texte || '').replace(/\r/g, '');
    const titre = (t.match(/TITRE\s*:\s*(.*)/i) || [])[1] || '';
    let description = (t.match(/DESCRIPTION\s*:\s*\n?([\s\S]*?)(?=\n\s*HASHTAGS\s*:|$)/i) || [])[1] || '';
    const hashtags = (t.match(/HASHTAGS\s*:\s*(.*)/i) || [])[1] || '';
    if (!titre && !description && !/TITRE|DESCRIPTION/i.test(t)) description = t;
    return { titre: titre.trim(), description: description.trim(), hashtags: hashtags.trim() };
  }

  function messageClaude(e) {
    const code = e && e.code;
    if (code === 'rate_limited') return "Claude est très demandé, ou tu as atteint ta limite d'utilisation. Réessaie dans un moment.";
    if (code === 'not_granted') return "Tu n'as pas autorisé Claude sur cette page. Recharge-la pour qu'il te le redemande.";
    if (code === 'session_expired') return 'Ta session claude.ai a expiré. Reconnecte-toi puis réessaie.';
    if (code === 'refused') return "Claude n'a pas voulu écrire cette annonce. Modifie le nom ou les notes et réessaie.";
    if (code === 'sampling_disabled') return "Claude n'est pas disponible pour ton compte.";
    return "L'annonce n'a pas pu être écrite. Appuie sur « Autre version » pour réessayer.";
  }

  async function ouvrirAnnonce(id, nouvelle) {
    const a = etat.articles.get(id);
    if (!a || !sampleCap) return;
    annonceEnCours = id;
    if (annonceCtl) annonceCtl.abort();
    const ctl = new AbortController();
    annonceCtl = ctl;

    const url = photoUrl(a);
    const img = $('#an-photo');
    img.hidden = !url;
    if (url) img.src = url;
    $('#an-prix').textContent = a.prixPrevu ? euros(a.prixPrevu) : '';
    $('#an-meta').textContent = [a.marque, a.taille ? `Taille ${a.taille}` : '', a.etat].filter(Boolean).join(' · ');
    annonceTexte = { titre: '', description: '', hashtags: '' };
    $('#an-titre').textContent = a.nom;
    $('#an-description').textContent = '';
    $('#an-hashtags').textContent = '';
    $('#annonce').classList.add('en-cours');
    $('#an-etat').textContent = 'Claude écrit ton annonce…';
    $('#an-copier').disabled = true;
    $('#an-copier-titre').disabled = true;
    $('#an-autre').disabled = true;
    ouvrir($('#dlg-annonce'));

    const afficher = (texte) => {
      annonceTexte = lireAnnonce(texte);
      if (annonceTexte.titre) $('#an-titre').textContent = annonceTexte.titre;
      $('#an-description').textContent = annonceTexte.description;
      $('#an-hashtags').textContent = annonceTexte.hashtags;
    };

    let images = null;
    if (url && sampleImages) {
      try {
        const reponse = await fetch(url);
        if (reponse.ok) images = [await reponse.blob()];
      } catch (e) { images = null; }
    }
    const demander = (avecImages) => {
      const options = { signal: ctl.signal, modelTier: 'quick', onText: ({ text }) => afficher(text) };
      if (avecImages) options.images = avecImages;
      if (nouvelle) options.cache = false;
      return sampleCap(promptAnnonce(a, Boolean(avecImages)), options);
    };

    try {
      let resultat;
      try {
        resultat = await demander(images);
      } catch (e) {
        // Une seule nouvelle tentative, sans la photo, si c'est la photo qui bloque.
        if (!images || !e || !['images_unavailable', 'image_rejected'].includes(e.code)) throw e;
        if (e.code === 'images_unavailable') sampleImages = false;
        resultat = await demander(null);
      }
      if (ctl.signal.aborted) return;
      afficher(resultat.text);
      $('#an-etat').textContent = 'Relis, ajuste si besoin, puis copie le tout dans ton appli de vente.';
      $('#an-copier').disabled = false;
      $('#an-copier-titre').disabled = !annonceTexte.titre;
    } catch (e) {
      if (e && e.code === 'cancelled') return;
      if (e && e.text) afficher(e.text);
      $('#an-etat').textContent = messageClaude(e);
      if (e && ['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'].includes(e.code)) {
        sampleCap = null;
        rendre();
      }
    } finally {
      if (annonceCtl === ctl) {
        $('#annonce').classList.remove('en-cours');
        $('#an-autre').disabled = !sampleCap;
      }
    }
  }

  async function copier(texte) {
    try {
      await navigator.clipboard.writeText(texte);
      toast('Copié. Colle-le dans ton annonce.');
    } catch (e) {
      const zone = document.createElement('textarea');
      zone.value = texte;
      zone.setAttribute('readonly', '');
      zone.style.position = 'fixed';
      zone.style.opacity = '0';
      document.body.appendChild(zone);
      zone.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      zone.remove();
      toast(ok ? 'Copié. Colle-le dans ton annonce.' : 'Copie impossible ici : sélectionne le texte à la main.');
    }
  }

  /* Calculette */

  // Tant que la personne n'y touche pas, la calculette reprend les frais de vente des réglages.
  let commissionCalculetteTouchee = false;

  function majCalculette() {
    const base = lireMontant($('#c-cout').value);
    const parPct = $('#c-mode-pct').checked;
    const objectif = lireMontant($('#c-objectif').value) || 0;
    const commissionSaisie = lireMontant($('#c-commission').value) || 0;
    const taux = Math.min(89, Math.max(0, Number.isNaN(commissionSaisie) ? 0 : commissionSaisie)) / 100;
    $('#c-objectif-label').textContent = parPct ? 'Marge voulue' : 'Bénéfice voulu';
    $('#c-objectif-unite').dataset.unite = parPct ? '%' : '€';

    if (!base || Number.isNaN(base) || base <= 0) {
      $('#c-prix').textContent = '—';
      $('#c-detail').textContent = 'Indique ce que tu as payé.';
      $('#c-echelle').innerHTML = '';
      $('#c-inverse').textContent = '';
      return;
    }
    const gainVoulu = Number.isNaN(objectif) ? 0 : (parPct ? base * objectif / 100 : objectif);
    const exact = prixPourGagner(base, gainVoulu, taux);
    const rond = prixRond(exact);
    const recuRond = arrondi(rond - fraisEstimes(rond, taux));
    $('#c-prix').textContent = euros(rond);
    $('#c-detail').innerHTML = `Minimum exact : ${eurosExact(exact)}. À ${euros(rond)}, tu encaisses ${euros(recuRond)}${taux ? ` après ${euros(fraisEstimes(rond, taux))} de frais` : ''}, soit <strong class="gain">${eurosSigne(recuRond - base)}</strong> de bénéfice.`;

    const paliers = [20, 30, 50, 75, 100, 200];
    $('#c-echelle').innerHTML = `<caption>Selon ta marge</caption>
      <thead><tr><th scope="col">Marge</th><th scope="col">Prix à afficher</th><th scope="col">Bénéfice</th></tr></thead>
      <tbody>${paliers.map((p) => {
        const prix = prixRond(prixPourGagner(base, base * p / 100, taux));
        const g = arrondi(prix - fraisEstimes(prix, taux) - base);
        const libelle = p === 100 ? '×2' : p === 200 ? '×3' : `+${p} %`;
        return `<tr><th scope="row">${libelle}</th><td>${euros(prix)}</td><td>${eurosSigne(g)}</td></tr>`;
      }).join('')}</tbody>`;

    const vente = lireMontant($('#c-vente').value);
    const inverse = $('#c-inverse');
    if (vente && !Number.isNaN(vente)) {
      const g = arrondi(vente - fraisEstimes(vente, taux) - base);
      inverse.className = 'calc-inverse-resultat ' + (g >= 0 ? 'gain' : 'perte');
      inverse.textContent = `À ${euros(vente)}, tu ${g >= 0 ? 'gagnes' : 'perds'} ${euros(Math.abs(g))} (${pct(marge(g, base))}).`;
    } else {
      inverse.className = 'calc-inverse-resultat';
      inverse.textContent = '';
    }
  }

  /* ---------- Branchements ---------- */

  function brancher() {
    document.addEventListener('click', (e) => {
      const ouvreur = e.target.closest('[data-ouvrir]');
      if (ouvreur) {
        const quoi = ouvreur.dataset.ouvrir;
        if (quoi === 'achat') ouvrirAchat(null);
        else ouvrirMouvement(quoi);
        return;
      }
      const action = e.target.closest('[data-action]');
      if (action) {
        const id = action.dataset.id;
        const faire = {
          vendre: () => ouvrirVente(id),
          modifier: () => ouvrirAchat(id),
          supprimer: () => supprimerArticle(id),
          'annuler-vente': () => annulerVente(id),
          'supprimer-mouvement': () => supprimerMouvement(id),
          annonce: () => ouvrirAnnonce(id, false),
          photo: () => {
            const a = etat.articles.get(id);
            if (!a || !photoUrl(a)) return;
            $('#photo-grande').src = photoUrl(a);
            $('#photo-grande').alt = `Photo de ${a.nom}`;
            ouvrir($('#dlg-photo'));
          },
        }[action.dataset.action];
        if (faire) faire();
        return;
      }
      if (e.target.closest('[data-fermer]')) {
        fermer(e.target.closest('dialog'));
        return;
      }
      if (e.target.id === 'journal-plus') {
        etat.journalMax += 80;
        rendreJournal();
      }
    });

    // Un clic sur le fond sombre ferme la fenêtre.
    $$('dialog').forEach((dlg) => {
      dlg.addEventListener('click', (e) => {
        if (e.target !== dlg) return;
        const r = dlg.getBoundingClientRect();
        const dedans = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        if (!dedans) {
          if (dlg.id === 'dlg-confirmer') repondre(false);
          else fermer(dlg);
        }
      });
    });
    $('#dlg-confirmer').addEventListener('cancel', (e) => { e.preventDefault(); repondre(false); });
    $('#form-confirmer').addEventListener('submit', (e) => { e.preventDefault(); repondre(true); });
    $('#confirmer-non').addEventListener('click', () => repondre(false));

    $('#form-achat').addEventListener('submit', validerAchat);
    $('#form-achat').addEventListener('input', (e) => {
      if (e.target.id === 'a-prevu') prevuTouche = e.target.value.trim() !== '';
      if (['a-prix', 'a-frais', 'a-prevu'].includes(e.target.id)) majAideAchat();
    });
    $$('#dlg-achat [data-marge]').forEach((b) => b.addEventListener('click', () => {
      const prix = lireMontant($('#a-prix').value) || 0;
      const frais = lireMontant($('#a-frais').value) || 0;
      const c = arrondi((Number.isNaN(prix) ? 0 : prix) + (Number.isNaN(frais) ? 0 : frais));
      if (c <= 0) {
        montrerErreur('#a-erreur', 'Indique d\'abord le prix payé.');
        $('#a-prix').focus();
        return;
      }
      montrerErreur('#a-erreur', '');
      $('#a-prevu').value = String(prixRond(prixPourGagner(c, c * Number(b.dataset.marge) / 100)));
      prevuTouche = true;
      majAideAchat();
    }));

    $('#form-vente').addEventListener('submit', validerVente);
    $('#form-vente').addEventListener('input', (e) => {
      if (e.target.id === 'v-frais') fraisVenteTouche = true;
      majVente();
    });

    $('#form-mouvement').addEventListener('submit', validerMouvement);
    $('#form-mouvement').addEventListener('input', majMouvement);
    $$('#dlg-mouvement [data-montant]').forEach((b) => b.addEventListener('click', () => {
      $('#m-montant').value = b.dataset.montant;
      majMouvement();
    }));

    $('#ouvrir-reglages').addEventListener('click', ouvrirReglages);
    $('#obj-fixer').addEventListener('click', () => {
      ouvrirReglages();
      setTimeout(() => $('#r-objectif').focus(), 40);
    });

    $('#son').addEventListener('click', () => {
      Son.actif = !Son.actif;
      try { localStorage.setItem(CLE_SON, Son.actif ? 'oui' : 'non'); } catch (e) { /* réglage pour cette visite seulement */ }
      rendreSon();
      if (Son.actif) Son.pieces();
    });
    rendreSon();

    $('#a-photo').addEventListener('change', async (e) => {
      const fichier = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!fichier) return;
      $('#a-photo-texte').textContent = 'Préparation…';
      try {
        const blob = await compresserPhoto(fichier, etat.mode === 'appareil' ? 640 : 1200);
        if (photoAchat.blob && photoAchat.url) URL.revokeObjectURL(photoAchat.url);
        photoAchat.blob = blob;
        photoAchat.url = URL.createObjectURL(blob);
        photoAchat.retiree = false;
      } catch (err) {
        toast("Cette image n'a pas pu être lue. Essaie une autre photo.");
      }
      afficherPhotoAchat();
    });
    $('#a-photo-retirer').addEventListener('click', () => {
      if (photoAchat.blob && photoAchat.url) URL.revokeObjectURL(photoAchat.url);
      photoAchat.blob = null;
      photoAchat.url = null;
      photoAchat.retiree = true;
      afficherPhotoAchat();
    });

    $('#an-autre').addEventListener('click', () => { if (annonceEnCours) ouvrirAnnonce(annonceEnCours, true); });
    $('#an-copier').addEventListener('click', () => {
      copier([annonceTexte.description, annonceTexte.hashtags].filter(Boolean).join('\n\n'));
    });
    $('#an-copier-titre').addEventListener('click', () => copier(annonceTexte.titre));
    $('#form-annonce').addEventListener('submit', (e) => e.preventDefault());
    $('#dlg-annonce').addEventListener('close', () => {
      if (annonceCtl) annonceCtl.abort();
      annonceCtl = null;
    });

    // Une photo qui ne charge plus laisse un cadre vide plutôt qu'une icône cassée.
    document.addEventListener('error', (e) => {
      const img = e.target;
      if (img && img.tagName === 'IMG' && img.closest('.polaroid')) img.closest('.polaroid').classList.add('casse');
    }, true);

    // Le porte-monnaie suit la souris, et on peut le secouer.
    const pf = $('#portemonnaie');
    if (!mouvementReduit && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      const scene = $('.scene');
      scene.addEventListener('pointermove', (e) => {
        const r = pf.getBoundingClientRect();
        const x = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width * 0.8)));
        const y = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (r.height * 0.8)));
        pf.style.setProperty('--ty', (x * 7).toFixed(2) + 'deg');
        pf.style.setProperty('--tx', (-y * 5).toFixed(2) + 'deg');
        pf.style.setProperty('--lx', (50 + x * 45).toFixed(1) + '%');
        pf.style.setProperty('--ly', (35 + y * 40).toFixed(1) + '%');
        pf.style.setProperty('--sx', (50 - x * 50).toFixed(1) + '%');
      });
      scene.addEventListener('pointerleave', () => {
        ['--tx', '--ty', '--lx', '--ly', '--sx'].forEach((v) => pf.style.removeProperty(v));
      });
    }
    pf.addEventListener('click', () => {
      if (mouvementReduit || pf.classList.contains('secoue')) return;
      pf.classList.add('secoue');
      Son.pieces();
      vibrer(20);
      setTimeout(() => pf.classList.remove('secoue'), 650);
    });
    $('#form-reglages').addEventListener('submit', validerReglages);
    $('#export-csv').addEventListener('click', exporterCsv);
    $('#export-json').addEventListener('click', exporterJson);
    $('#import-json').addEventListener('change', (e) => {
      const fichier = e.target.files && e.target.files[0];
      e.target.value = '';
      if (fichier) importerJson(fichier);
    });
    $('#tout-effacer').addEventListener('click', toutEffacer);

    $('#toast-action').addEventListener('click', () => {
      const faire = actionToast;
      $('#toast').hidden = true;
      actionToast = null;
      if (faire) faire();
    });

    $('#recherche').addEventListener('input', (e) => {
      etat.recherche = e.target.value;
      rendreStock(bilan());
    });
    $('#tri').addEventListener('change', (e) => {
      etat.tri = e.target.value;
      rendreStock(bilan());
    });

    $('#form-calcul').addEventListener('input', (e) => {
      if (e.target.id === 'c-commission') commissionCalculetteTouchee = true;
      majCalculette();
    });
    $('#form-calcul').addEventListener('submit', (e) => e.preventDefault());
    $('#c-vente').addEventListener('input', majCalculette);

    const graphique = $('#graphique');
    graphique.addEventListener('pointerover', (e) => { if (e.target.classList.contains('cible')) montrerInfobulle(e.target); });
    graphique.addEventListener('pointerleave', cacherInfobulle);
    graphique.addEventListener('focusin', (e) => { if (e.target.classList.contains('cible')) montrerInfobulle(e.target); });
    graphique.addEventListener('focusout', cacherInfobulle);
    if ('ResizeObserver' in window) {
      let largeur = 0;
      new ResizeObserver((entrees) => {
        const l = Math.round(entrees[0].contentRect.width);
        if (l && l !== largeur) {
          largeur = l;
          dessinerGraphique();
        }
      }).observe(graphique);
    }

    window.addEventListener('hashchange', () => afficherVue(location.hash.slice(1)));

    // Le petit bandeau du solde apparaît quand le porte-monnaie sort de l'écran.
    if ('IntersectionObserver' in window) {
      const barre = $('#barre-solde');
      new IntersectionObserver(([entree]) => {
        const visible = !entree.isIntersecting && entree.boundingClientRect.top < 0;
        barre.classList.toggle('visible', visible);
        document.body.classList.toggle('barre-visible', visible);
        barre.setAttribute('aria-hidden', String(!visible));
        barre.querySelectorAll('button').forEach((b) => { b.tabIndex = visible ? 0 : -1; });
      }, { threshold: 0 }).observe($('#portemonnaie'));
    }
  }

  async function demarrer() {
    document.documentElement.lang = 'fr';
    brancher();
    afficherVue(location.hash.slice(1));
    majCalculette();
    rendre();
    let db = null;
    if (window.claude && typeof window.claude.use === 'function') {
      window.claude.use('assets').then((a) => { assetsCap = a; rendre(); }).catch(() => {});
      window.claude.use('sample').then(async (fonction) => {
        if (!fonction) return;
        sampleCap = fonction;
        try {
          const limites = await fonction.limits();
          sampleImages = Boolean(limites && limites.images);
        } catch (e) { sampleImages = false; }
        rendre();
      }).catch(() => {});
      try { db = await window.claude.use('db'); } catch (e) { db = null; }
    }
    if (db) await Stockage.brancherCompte(db);
    else Stockage.brancherAppareil();
  }

  demarrer();
})();
