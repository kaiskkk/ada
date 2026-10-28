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
    const duree = 700;
    el.classList.remove('monte', 'descend');
    void el.offsetWidth;
    el.classList.add(cible > depart ? 'monte' : 'descend');
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
    const exemples = [...etat.articles.values(), ...etat.mouvements.values()].some((x) => x.exemple);
    $('#bandeau-exemples').hidden = !exemples || etat.mode === 'lecture';
    $('#bandeau-lecture').hidden = etat.mode !== 'lecture';
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

  function rendrePorteMonnaie(b) {
    animerSolde(b.solde);
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
    const categories = new Set(CATEGORIES);
    const lieux = new Set(LIEUX);
    for (const a of etat.articles.values()) {
      if (a.categorie) categories.add(a.categorie);
      if (a.lieuAchat) lieux.add(a.lieuAchat);
      if (a.lieuVente) lieux.add(a.lieuVente);
    }
    const options = (valeurs) => [...valeurs].sort((x, y) => x.localeCompare(y, 'fr')).map((v) => `<option value="${esc(v)}"></option>`).join('');
    $('#liste-categories').innerHTML = options(categories);
    $('#liste-lieux').innerHTML = options(lieux);
  }

  /* Stock */

  function articlesEnStock() {
    const q = normaliser(etat.recherche.trim());
    let liste = [];
    for (const [id, a] of etat.articles) if (a.statut !== 'vendu') liste.push({ id, a });
    if (q) liste = liste.filter(({ a }) => normaliser([a.nom, a.categorie, a.lieuAchat, a.note].join(' ')).includes(q));
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
    const meta = [a.categorie, a.lieuAchat ? 'acheté sur ' + a.lieuAchat : ''].filter(Boolean).map(esc).join(' · ');
    const puceAge = dort
      ? `<span class="puce puce-alerte" title="Acheté le ${esc(dateLongue(a.dateAchat))}">Dort depuis ${age} j</span>`
      : `<span class="puce" title="Acheté le ${esc(dateLongue(a.dateAchat))}">${age === 0 ? "Acheté aujourd'hui" : `En stock depuis ${age} j`}</span>`;
    let puceBenef;
    if (bp === null) puceBenef = '<span class="puce">Pas encore de prix de vente</span>';
    else puceBenef = `<span class="puce ${bp >= 0 ? 'puce-gain' : 'puce-perte'}">${bp >= 0 ? 'Bénéfice prévu' : 'Perte prévue'} ${eurosSigne(bp)}${cout(a) > 0 ? ' · ' + pct(marge(bp, cout(a))) : ''}</span>`;
    return `<li class="etiquette${dort ? ' dort' : ''}">
      <div class="etq-tete">
        <h3 class="etq-nom">${esc(a.nom)}</h3>
        ${a.exemple ? '<span class="marque-exemple">exemple</span>' : ''}
      </div>
      <p class="etq-meta">${meta || 'Sans catégorie'}</p>
      <div class="etq-prix">
        <div class="etq-col">
          <span class="etq-label">Payé</span>
          <span class="etq-valeur">${euros(cout(a))}</span>
          ${a.fraisAchat ? `<span class="etq-sous">dont ${euros(a.fraisAchat)} de frais</span>` : ''}
        </div>
        <span class="etq-fleche" aria-hidden="true">→</span>
        <div class="etq-col">
          <span class="etq-label">Prix prévu</span>
          <span class="etq-valeur etq-cible">${a.prixPrevu ? euros(a.prixPrevu) : '—'}</span>
        </div>
      </div>
      <div class="etq-puces">${puceBenef}${puceAge}</div>
      ${a.note ? `<p class="etq-note">${esc(a.note)}</p>` : ''}
      <div class="etq-actions ecrit">
        <button class="bouton bouton-gain" type="button" data-action="vendre" data-id="${esc(id)}">Vendu&nbsp;!</button>
        <button class="bouton bouton-discret" type="button" data-action="modifier" data-id="${esc(id)}">Modifier</button>
        <button class="bouton bouton-lien" type="button" data-action="supprimer" data-id="${esc(id)}" aria-label="Supprimer ${esc(a.nom)}">Supprimer</button>
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
    } else if (!etat.articles.size && !etat.mouvements.size) {
      vide.innerHTML = `
        <p class="vide-titre">Ton porte-monnaie est vide.</p>
        <ol class="vide-etapes">
          <li><strong>Mets tes sous dedans</strong> : l'argent que tu consacres à l'achat-revente.</li>
          <li><strong>Enregistre chaque achat</strong> : son prix est déduit tout de suite, et tu fixes ton prix de vente.</li>
          <li><strong>Appuie sur « Vendu ! »</strong> quand il part : l'argent revient et ton bénéfice s'affiche.</li>
        </ol>
        <div class="vide-boutons">
          <button class="bouton bouton-or" type="button" data-ouvrir="depot">Mettre mes premiers sous</button>
          <button class="bouton bouton-discret" type="button" id="charger-exemples">Voir avec des exemples</button>
        </div>`;
    } else {
      vide.innerHTML = `<p class="vide-titre">Tout est vendu.</p><p>Ton stock est vide. Enregistre ton prochain achat avec <strong>J'ai acheté un truc</strong>.</p>`;
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
        a.categorie,
        `acheté le ${dateCourte(a.dateAchat)}`,
        `vendu le ${dateCourte(a.dateVente)}${a.lieuVente ? ' sur ' + a.lieuVente : ''}`,
        duree === 0 ? 'parti le jour même' : `parti en ${pluriel(duree, 'jour')}`,
      ].filter(Boolean).map(esc).join(' · ');
      return `<li class="vente">
        <div class="vente-texte">
          <p class="vente-nom">${esc(a.nom)}${a.exemple ? ' <span class="marque-exemple">exemple</span>' : ''}</p>
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
        libelle: m.note || (retrait ? 'Retrait' : 'Dépôt'), montant: retrait ? -m.montant : m.montant, exemple: m.exemple,
      });
    }
    for (const [id, a] of etat.articles) {
      lignes.push({ id, type: 'achat', date: a.dateAchat, ordre: a.cree || 0, libelle: a.nom, montant: -cout(a), exemple: a.exemple });
      if (a.statut === 'vendu') {
        lignes.push({ id, type: 'vente', date: a.dateVente, ordre: a.venduLe || 0, libelle: a.nom, montant: encaisse(a), exemple: a.exemple });
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

    const categories = new Map();
    for (const a of vendus) {
      const c = a.categorie || 'Sans catégorie';
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
      statut: ancien ? ancien.statut : 'stock',
      cree: ancien ? ancien.cree || Date.now() : Date.now(),
    };
    const bouton = $('#a-valider');
    bouton.disabled = true;
    try {
      await Stockage.ecrire('articles', id, data);
      fermer($('#dlg-achat'));
      if (ancien) toast(`« ${nom} » est à jour.`);
      else toast(`Achat enregistré : ${MOINS}${euros(cout(data))} dans le porte-monnaie.`);
    } catch (err) {
      montrerErreur('#a-erreur', messageErreur(err));
    } finally {
      bouton.disabled = false;
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
    const bouton = $('#v-valider');
    bouton.disabled = true;
    try {
      await Stockage.ecrire('articles', venteEnCours, data);
      fermer($('#dlg-vente'));
      const g = benefice(data);
      pluieDePieces(g > 0 ? 9 : 4);
      toast(g >= 0
        ? `Vendu ! +${euros(encaisse(data))} dans le porte-monnaie, dont ${euros(g)} de bénéfice.`
        : `Vendu. +${euros(encaisse(data))} dans le porte-monnaie, mais ${euros(-g)} de perte.`);
    } catch (err) {
      montrerErreur('#v-erreur', messageErreur(err));
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
      toast(`« ${a.nom} » est supprimé.`, {
        label: 'Annuler',
        faire: () => Stockage.ecrire('articles', id, a).catch((err) => toast(messageErreur(err))),
      });
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
      if (depot) pluieDePieces(6);
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
    montrerErreur('#r-erreur', '');
    ouvrir($('#dlg-reglages'));
  }

  async function validerReglages(e) {
    e.preventDefault();
    const margeVisee = lireMontant($('#r-marge').value);
    const commission = lireMontant($('#r-commission').value);
    if (margeVisee === null || Number.isNaN(margeVisee) || margeVisee < 0) return montrerErreur('#r-erreur', 'La marge visée doit être un pourcentage, par exemple 50.');
    if (commission === null || Number.isNaN(commission) || commission < 0 || commission >= 90) return montrerErreur('#r-erreur', 'Les frais de vente doivent être un pourcentage entre 0 et 89.');
    const data = { nom: $('#r-nom').value.trim() || REGLAGES_DEFAUT.nom, marge: margeVisee, commission };
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
    const entetes = ['Nom', 'Catégorie', 'Acheté où', "Date d'achat", "Prix d'achat", "Frais d'achat", 'Prix prévu', 'Statut', 'Date de vente', 'Vendu où', 'Prix de vente', 'Frais de vente', 'Bénéfice', 'Note'];
    const lignes = [...etat.articles.values()]
      .sort((x, y) => comparer(x.dateAchat, y.dateAchat))
      .map((a) => [
        a.nom, a.categorie, a.lieuAchat, a.dateAchat, nombre(a.prixAchat), nombre(a.fraisAchat), nombre(a.prixPrevu),
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
    if (reglages) operations.push({ col: 'reglages', id: 'caisse', data: { nom: String(reglages.nom || REGLAGES_DEFAUT.nom), marge: Number(reglages.marge) || 0, commission: Number(reglages.commission) || 0 } });
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
    try {
      await Stockage.lot([
        ...[...etat.articles.keys()].map((id) => ({ col: 'articles', id, data: null })),
        ...[...etat.mouvements.keys()].map((id) => ({ col: 'mouvements', id, data: null })),
      ]);
      soldeAffiche = null;
      toast('Le porte-monnaie est vide. À toi de jouer.');
    } catch (err) {
      toast(messageErreur(err));
    }
  }

  async function chargerExemples() {
    const { articles, mouvements } = window.PM_EXEMPLES(aujourdhui());
    try {
      await Stockage.lot([
        ...Object.entries(mouvements).map(([id, data]) => ({ col: 'mouvements', id, data })),
        ...Object.entries(articles).map(([id, data]) => ({ col: 'articles', id, data })),
      ]);
    } catch (err) {
      toast(messageErreur(err));
    }
  }

  async function viderExemples() {
    const operations = [];
    for (const [id, a] of etat.articles) if (a.exemple) operations.push({ col: 'articles', id, data: null });
    for (const [id, m] of etat.mouvements) if (m.exemple) operations.push({ col: 'mouvements', id, data: null });
    try {
      await Stockage.lot(operations);
      soldeAffiche = null;
      toast('Exemples effacés. Commence par mettre tes sous dans le porte-monnaie.');
    } catch (err) {
      toast(messageErreur(err));
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
        }[action.dataset.action];
        if (faire) faire();
        return;
      }
      if (e.target.closest('[data-fermer]')) {
        fermer(e.target.closest('dialog'));
        return;
      }
      if (e.target.id === 'charger-exemples') chargerExemples();
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
    $('#form-reglages').addEventListener('submit', validerReglages);
    $('#export-csv').addEventListener('click', exporterCsv);
    $('#export-json').addEventListener('click', exporterJson);
    $('#import-json').addEventListener('change', (e) => {
      const fichier = e.target.files && e.target.files[0];
      e.target.value = '';
      if (fichier) importerJson(fichier);
    });
    $('#tout-effacer').addEventListener('click', toutEffacer);
    $('#vider-exemples').addEventListener('click', viderExemples);

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
      try { db = await window.claude.use('db'); } catch (e) { db = null; }
    }
    if (db) await Stockage.brancherCompte(db);
    else Stockage.brancherAppareil();
  }

  demarrer();
})();
