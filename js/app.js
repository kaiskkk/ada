/* Affichage des biens, filtres, fiche détaillée et formulaires. */
(function () {
  "use strict";

  const BIENS = window.BIENS || [];
  const SITE = window.SITE || {};
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

  const nombre = new Intl.NumberFormat("fr-FR");
  const euros = (v) => nombre.format(v) + " €";
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const pluriel = (v, un, plusieurs) => `${nombre.format(v)} ${v > 1 ? plusieurs : un}`;
  const auPrixM2 = (b) => euros(Math.round(b.prix / b.surface)) + "/m²";

  const STATUTS = { nouveau: "Nouveau", compromis: "Sous compromis", vendu: "Vendu" };
  const ECHELLE_DPE = [
    ["A", "≤ 70"], ["B", "71 à 110"], ["C", "111 à 180"], ["D", "181 à 250"],
    ["E", "251 à 330"], ["F", "331 à 420"], ["G", "> 420"],
  ];

  /* ---------- Coordonnées ---------- */

  $$("[data-email]").forEach((el) => (el.textContent = SITE.email));
  $$("[data-mailto]").forEach((el) => (el.href = "mailto:" + SITE.email));
  $$("[data-telephone]").forEach((el) => {
    if (SITE.telephone) el.textContent = SITE.telephone;
    else el.closest("[data-bloc-telephone]")?.setAttribute("hidden", "");
  });

  /* ---------- La rue ---------- */

  const rue = $("#rue");
  if (rue && window.Facades) rue.innerHTML = window.Facades.rue(BIENS);

  /* ---------- Annonces ---------- */

  const etat = { type: "tous", budget: 0, pieces: 0, tri: "recent" };
  const grille = $("#grille");
  const compte = $("#compte");
  const vide = $("#vide");
  const effacer = $("#effacer");

  const TRIS = {
    recent: (a, b) => a.rang - b.rang,
    "prix-asc": (a, b) => a.b.prix - b.b.prix,
    "prix-desc": (a, b) => b.b.prix - a.b.prix,
    surface: (a, b) => b.b.surface - a.b.surface,
  };

  function selection() {
    return BIENS.map((b, rang) => ({ b, rang }))
      .filter(({ b }) =>
        (etat.type === "tous" || b.type === etat.type) &&
        (!etat.budget || b.prix <= etat.budget) &&
        (!etat.pieces || b.pieces >= etat.pieces))
      .sort((a, b) => (a.b.statut === "vendu") - (b.b.statut === "vendu") || TRIS[etat.tri](a, b))
      .map((x) => x.b);
  }

  function plaque(b, cls = "") {
    return `<span class="plaque ${cls}"><small>${esc(b.ville)}</small><strong>${esc(b.quartier || b.ville)}</strong></span>`;
  }

  function media(b) {
    if (b.photos && b.photos.length) return `<img src="${esc(b.photos[0])}" alt="" loading="lazy">`;
    return window.Facades ? window.Facades.vignette(b) : "";
  }

  function faits(b) {
    const l = [`${nombre.format(b.surface)} m²`, pluriel(b.pieces, "pièce", "pièces")];
    if (b.chambres) l.push(pluriel(b.chambres, "chambre", "chambres"));
    if (b.terrain) l.push(`Terrain ${nombre.format(b.terrain)} m²`);
    return l;
  }

  function pastilleDpe(b) {
    if (!b.dpe) return "";
    const c = b.dpe.classe.toUpperCase();
    return `<span class="dpe-pastille dpe-${c.toLowerCase()}" title="Classe énergie ${c}"><span class="sr">Classe énergie </span>${c}</span>`;
  }

  function carte(b) {
    const vendu = b.statut === "vendu";
    return `<li><a class="carte${vendu ? " est-vendue" : ""}" href="#${esc(b.id)}" data-id="${esc(b.id)}">
      <div class="carte-media">${media(b)}
        ${b.statut ? `<span class="statut statut-${esc(b.statut)}">${STATUTS[b.statut] || esc(b.statut)}</span>` : ""}
        ${pastilleDpe(b)}
      </div>
      <div class="carte-corps">
        ${plaque(b, "plaque-sm")}
        <h3 class="carte-titre">${esc(b.titre)}</h3>
        <p class="carte-prix"><span class="prix">${euros(b.prix)}</span><span class="prix-m2">${auPrixM2(b)}</span></p>
        <ul class="faits">${faits(b).map((f) => `<li>${f}</li>`).join("")}</ul>
      </div>
    </a></li>`;
  }

  function afficher() {
    const liste = selection();
    grille.innerHTML = liste.map(carte).join("");
    vide.hidden = liste.length > 0;
    compte.textContent = liste.length ? pluriel(liste.length, "bien", "biens") : "Aucun bien";
    $$(".puce[data-type]").forEach((p) => p.setAttribute("aria-pressed", String(p.dataset.type === etat.type)));
    effacer.hidden = etat.type === "tous" && !etat.budget && !etat.pieces;
    $("#r-type").value = etat.type;
    $("#r-budget").value = String(etat.budget);
    $("#r-pieces").value = String(etat.pieces);
  }

  $$(".puce[data-type]").forEach((p) =>
    p.addEventListener("click", () => {
      etat.type = p.dataset.type;
      afficher();
    })
  );

  $("#tri").addEventListener("change", (e) => {
    etat.tri = e.target.value;
    afficher();
  });

  $("#recherche").addEventListener("submit", (e) => {
    e.preventDefault();
    etat.type = $("#r-type").value;
    etat.budget = Number($("#r-budget").value);
    etat.pieces = Number($("#r-pieces").value);
    afficher();
    const doux = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    $("#biens").scrollIntoView({ behavior: doux ? "smooth" : "auto" });
  });

  $$("[data-effacer]").forEach((btn) =>
    btn.addEventListener("click", () => {
      Object.assign(etat, { type: "tous", budget: 0, pieces: 0 });
      afficher();
    })
  );

  /* ---------- Fiche détaillée ---------- */

  const fiche = $("#fiche");

  function galerie(b) {
    if (!(b.photos && b.photos.length)) {
      return `<figure class="fiche-illus">${window.Facades ? window.Facades.vignette(b) : ""}
        <figcaption>Illustration de la façade. Les fenêtres éclairées sont celles du bien.</figcaption></figure>`;
    }
    const vignettes = b.photos.length > 1
      ? `<div class="vignettes">${b.photos.map((p, i) =>
          `<button type="button" data-photo="${esc(p)}" aria-label="Photo ${i + 1}"><img src="${esc(p)}" alt="" loading="lazy"></button>`).join("")}</div>`
      : "";
    return `<figure class="fiche-illus"><img src="${esc(b.photos[0])}" alt="${esc(b.titre)}" data-principale>${vignettes}</figure>`;
  }

  function blocDpe(dpe) {
    const actif = dpe.classe.toUpperCase();
    const lignes = ECHELLE_DPE.map(([l, plage], i) => {
      const estActif = l === actif;
      return `<li class="${estActif ? "actif" : ""}" style="--n:${i}">
        <span class="dpe-barre dpe-${l.toLowerCase()}"><b>${l}</b><small>${plage}</small></span>
        ${estActif ? `<span class="dpe-valeur">${nombre.format(dpe.conso)} kWh/m²/an</span>` : ""}</li>`;
    }).join("");
    const cout = dpe.cout
      ? `<p class="dpe-cout">Montant estimé des dépenses annuelles d'énergie pour un usage standard : entre ${euros(dpe.cout[0])} et ${euros(dpe.cout[1])} par an. Prix moyens des énergies indexés au 1<sup>er</sup> janvier 2021, abonnements compris.</p>`
      : "";
    return `<section class="dpe" aria-label="Diagnostic de performance énergétique : classe ${actif}">
      <h3 class="dpe-titre">Diagnostic de performance énergétique</h3>
      <ol class="dpe-echelle">${lignes}</ol>${cout}</section>`;
  }

  function formulaireVisite(b) {
    const objet = `Demande de visite : ${b.titre}${b.ref ? ` (réf. ${b.ref})` : ""}`;
    return `<form class="formulaire" data-envoi data-objet="${esc(objet)}">
      <h3>Demander une visite</h3>
      <div class="champs">
        <label class="champ"><span>Nom</span><input id="visite-nom" name="Nom" autocomplete="name" required></label>
        <label class="champ"><span>Téléphone ou e-mail</span><input id="visite-contact" name="Contact" autocomplete="email" required></label>
        <label class="champ champ-large"><span>Message</span><textarea id="visite-message" name="Message" rows="3">Bonjour, je souhaiterais visiter ce bien. Je suis disponible </textarea></label>
      </div>
      <button class="bouton" type="submit">Envoyer ma demande</button>
      <div class="form-retour" role="status" hidden></div>
    </form>`;
  }

  function contenuFiche(b) {
    const vendu = b.statut === "vendu";
    const cases = [
      ["Surface", `${nombre.format(b.surface)} m²`],
      ["Pièces", b.pieces],
      ["Chambres", b.chambres || "–"],
      b.terrain ? ["Terrain", `${nombre.format(b.terrain)} m²`] : ["Étage", b.etage || "–"],
    ];
    const mentions = [];
    if (b.copro) mentions.push(`Copropriété de ${b.copro.lots} lots, charges courantes de ${euros(b.copro.charges)} par an.`);
    mentions.push(b.honoraires || "Honoraires à la charge du vendeur.");
    if (b.ref) mentions.push(`Réf. ${b.ref}`);
    return `
      <button class="fiche-fermer" type="button" data-fermer aria-label="Fermer la fiche">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
      <div class="fiche-defile">
        <div class="fiche-grille">
          <div class="fiche-media">${galerie(b)}</div>
          <div class="fiche-info">
            <div class="fiche-tete">${plaque(b)}${b.statut ? `<span class="statut statut-${esc(b.statut)}">${STATUTS[b.statut] || esc(b.statut)}</span>` : ""}</div>
            <h2 id="fiche-titre">${esc(b.titre)}</h2>
            <p class="fiche-prix"><span class="prix">${euros(b.prix)}</span><span class="prix-m2">soit ${auPrixM2(b)}</span></p>
            <dl class="fiche-faits">${cases.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
            <p class="fiche-desc">${esc(b.description)}</p>
            ${b.atouts && b.atouts.length ? `<ul class="atouts">${b.atouts.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>` : ""}
            <p class="mentions">${mentions.map(esc).join(" ")}</p>
            ${b.dpe ? blocDpe(b.dpe) : ""}
            ${vendu
              ? `<p class="fiche-vendu">Ce bien est vendu. Vous cherchez quelque chose de proche ? <a href="#contact" data-fermer>Décrivez-moi votre recherche</a>.</p>`
              : formulaireVisite(b)}
          </div>
        </div>
      </div>`;
  }

  function ouvrir(id) {
    const b = BIENS.find((x) => x.id === id);
    if (!b) return;
    fiche.innerHTML = contenuFiche(b);
    if (!fiche.open) fiche.showModal();
    $(".fiche-defile", fiche).scrollTop = 0;
    brancherFormulaires(fiche);
    try { history.replaceState(null, "", "#" + id); } catch (_) { /* aperçu sans historique */ }
  }

  fiche.addEventListener("close", () => {
    try { history.replaceState(null, "", location.pathname + location.search); } catch (_) { /* idem */ }
  });

  fiche.addEventListener("click", (e) => {
    if (e.target === fiche || e.target.closest("[data-fermer]")) {
      fiche.close();
      return;
    }
    const vignette = e.target.closest("[data-photo]");
    if (vignette) $("[data-principale]", fiche).src = vignette.dataset.photo;
  });

  function depuisAncre() {
    const id = decodeURIComponent(location.hash.slice(1));
    if (BIENS.some((b) => b.id === id)) ouvrir(id);
  }
  window.addEventListener("hashchange", depuisAncre);

  /* ---------- Formulaires (envoi par la messagerie du visiteur) ---------- */

  function brancherFormulaires(racine) {
    $$("form[data-envoi]", racine).forEach((form) => {
      if (form.dataset.branche) return;
      form.dataset.branche = "1";
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        if (!form.reportValidity()) return;
        const lignes = [];
        $$("input, select, textarea", form).forEach((c) => {
          const v = c.value.trim();
          if (!c.name || !v) return;
          lignes.push(c.tagName === "TEXTAREA" ? "\n" + v : `${c.name} : ${v}`);
        });
        const url = `mailto:${SITE.email}?subject=${encodeURIComponent(form.dataset.objet || "Contact")}&body=${encodeURIComponent(lignes.join("\n"))}`;
        const retour = $(".form-retour", form);
        retour.innerHTML =
          `Votre messagerie s'ouvre avec le message prêt à partir. Si rien ne s'ouvre, écrivez à ` +
          `<strong class="email-texte">${esc(SITE.email)}</strong> <button type="button" class="lien-bouton" data-copier>Copier l'adresse</button>`;
        retour.hidden = false;
        window.location.href = url;
      });
    });
  }

  /* ---------- Clics : ouverture des fiches, copie de l'adresse ---------- */

  document.addEventListener("click", (e) => {
    const lien = e.target.closest("a[data-id]");
    if (lien) {
      e.preventDefault();
      ouvrir(lien.dataset.id);
      return;
    }
    const copier = e.target.closest("[data-copier]");
    if (!copier) return;
    const libelle = copier.dataset.libelle || copier.textContent;
    copier.dataset.libelle = libelle;
    const fini = (texte) => {
      copier.textContent = texte;
      setTimeout(() => (copier.textContent = libelle), 2200);
    };
    const selectionner = () => {
      const cible = copier.parentElement.querySelector(".email-texte, [data-email]");
      if (cible) {
        const r = document.createRange();
        r.selectNodeContents(cible);
        const s = getSelection();
        s.removeAllRanges();
        s.addRange(r);
      }
      fini("Adresse sélectionnée");
    };
    try {
      navigator.clipboard.writeText(SITE.email).then(() => fini("Adresse copiée"), selectionner);
    } catch (_) {
      selectionner();
    }
  });

  afficher();
  brancherFormulaires(document);
  depuisAncre();
})();
