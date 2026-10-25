/*
 * Façades dessinées à partir de la description de chaque bien (champ `facade` dans js/biens.js).
 * Les fenêtres éclairées (classe f-lit) montrent la partie du bâtiment qui est à vendre.
 * Les couleurs viennent des variables --f-* de css/style.css : jour en thème clair, nuit en thème sombre.
 */
(function () {
  "use strict";

  const n = (v) => Math.round(v * 10) / 10;
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const euros = (v) => new Intl.NumberFormat("fr-FR").format(v) + " €";

  const rect = (x, y, w, h, cls, extra = "") =>
    `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" class="${cls}"${extra}/>`;
  const poly = (pts, cls) => `<polygon points="${pts.map((p) => n(p[0]) + "," + n(p[1])).join(" ")}" class="${cls}"/>`;
  const arche = (x, y, w, h, cls) => {
    const r = w / 2;
    return `<path d="M${n(x)} ${n(y + h)}V${n(y + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + w)} ${n(y + r)}V${n(y + h)}Z" class="${cls}"/>`;
  };

  // Le bien occupe-t-il cette fenêtre ? `bien` vaut "tout" pour une maison entière.
  function allume(bien, etage, baie) {
    if (!bien) return false;
    if (bien === "tout") return true;
    return bien.etage === etage && (!bien.baies || bien.baies.includes(baie));
  }

  function fenetre(ctx, x, y, w, h, lit, opts = {}) {
    let s = rect(x, y, w, h, lit ? "f-lit" : "f-win", lit ? ` style="--d:${ctx.d++}"` : "");
    let d = "";
    if (opts.meneau !== false) d += `M${n(x + w / 2)} ${n(y)}V${n(y + h)}`;
    if (opts.imposte) d += `M${n(x)} ${n(y + h * 0.32)}H${n(x + w)}`;
    if (opts.croisillons) {
      for (let k = 1; k < opts.croisillons; k++) d += `M${n(x + (w * k) / opts.croisillons)} ${n(y)}V${n(y + h)}`;
    }
    if (d) s += `<path d="${d}" class="f-mullion"/>`;
    return s;
  }

  function garde_corps(x, y, w, h) {
    let d = "";
    for (let bx = x + 1.5; bx < x + w - 1; bx += 2.5) d += `M${n(bx)} ${n(y)}V${n(y + h)}`;
    return `<path d="${d}" class="f-bars"/>` + rect(x, y - 0.6, w, 1.4, "f-iron") + rect(x, y + h - 0.6, w, 1, "f-iron");
  }

  /* ---------- Styles de bâtiments ---------- */

  function haussmann(o, ctx) {
    const baies = o.baies || 5, etages = o.etages || 5, u = o.bien;
    const BW = 26, M = 9, FH = 27, RDC = 36, ROOF = 30;
    const w = baies * BW + 2 * M, h = ROOF + 2 + etages * FH + RDC;
    let s = rect(M + 6, 2, 10, 12, "f-chimney") + rect(w - M - 16, 2, 10, 12, "f-chimney");
    s += poly([[0, ROOF], [8, 8], [w - 8, 8], [w, ROOF]], "f-roof");
    for (let i = 0; i < baies; i++) {
      const cx = M + i * BW + BW / 2;
      s += poly([[cx - 8, 16], [cx, 9.5], [cx + 8, 16]], "f-trim") + rect(cx - 6.5, 15.5, 13, 13, "f-wall");
      s += fenetre(ctx, cx - 4, 18, 8, 9, allume(u, etages + 1, i), { meneau: false });
    }
    s += rect(0, ROOF + 2, w, h - ROOF - 2, "f-wall");
    s += rect(-3, ROOF - 3, w + 6, 5, "f-trim");
    for (let f = 1; f <= etages; f++) {
      const top = ROOF + 2 + (etages - f) * FH;
      const filant = f === 2 || f === etages;
      for (let i = 0; i < baies; i++) {
        const x = M + i * BW + 6.5;
        s += fenetre(ctx, x, top + 5, 13, FH - 11, allume(u, f, i), { imposte: true });
        if (!filant) s += garde_corps(x - 1, top + FH - 9, 15, 4);
      }
      if (filant) {
        s += garde_corps(M - 3, top + FH - 10, w - 2 * M + 6, 6);
        s += rect(M - 4, top + FH - 4, w - 2 * M + 8, 2.5, "f-trim");
      }
    }
    const base = h - RDC;
    s += rect(0, base - 3, w, 4, "f-trim");
    s += `<path d="M0 ${base + 12}H${w}M0 ${base + 24}H${w}" class="f-joint"/>`;
    for (let i = 0; i < baies; i++) {
      const x = M + i * BW + 3;
      s += i === Math.floor(baies / 2) ? arche(x, base + 5, BW - 6, RDC - 5, "f-door") : arche(x, base + 8, BW - 6, RDC - 8, "f-win");
    }
    return { w, h, svg: s };
  }

  // Immeuble de canuts (Croix-Rousse) : façade enduite, très hautes fenêtres, toit de tuiles à génoise.
  function canut(o, ctx) {
    const baies = o.baies || 4, etages = o.etages || 4, u = o.bien;
    const BW = 25, M = 8, FH = 34, RDC = 40, ROOF = 14;
    const w = baies * BW + 2 * M, h = ROOF + 5 + etages * FH + RDC;
    let s = poly([[-6, ROOF + 1], [w + 6, ROOF + 1], [w - 4, 3], [4, 3]], "f-tile");
    s += rect(0, ROOF + 5, w, h - ROOF - 5, "f-wall-" + (o.teinte || "ocre"));
    s += rect(-3, ROOF, w + 6, 5, "f-trim");
    for (let f = 1; f <= etages; f++) {
      const top = ROOF + 5 + (etages - f) * FH;
      for (let i = 0; i < baies; i++) {
        const x = M + i * BW + 6;
        s += fenetre(ctx, x, top + 5, 13, FH - 10, allume(u, f, i), { imposte: true });
        s += rect(x - 1.5, top + FH - 5, 16, 2, "f-trim");
      }
    }
    const base = h - RDC;
    s += rect(0, base - 2, w, 3, "f-trim");
    for (let i = 0; i < baies; i++) {
      const x = M + i * BW + 2;
      s += i === 1 ? arche(x, base + 6, BW - 4, RDC - 6, "f-door") : fenetre(ctx, x + 4, base + 10, 13, 18, false);
    }
    return { w, h, svg: s };
  }

  // Maison de ville (toit en pignon) ou pavillon (toit à quatre pans, garage).
  function maison(o, ctx) {
    const u = o.bien ?? "tout";
    const pavillon = o.toit === "croupe";
    const w = pavillon ? 140 : 132, FH = 34, ROOF = pavillon ? 30 : 42, h = ROOF + 2 * FH;
    const mur = "f-wall-" + (o.teinte || "white");
    let s = "";
    if (pavillon) {
      s += rect(w * 0.3, 0, 9, 16, "f-chimney");
      s += poly([[-8, ROOF], [w + 8, ROOF], [w - 28, 4], [28, 4]], "f-tile");
    } else {
      s += rect(w * 0.68, 6, 9, 20, "f-chimney");
      s += poly([[-8, ROOF], [w / 2, 0], [w + 8, ROOF]], "f-tile");
      s += poly([[5, ROOF], [w / 2, 7], [w - 5, ROOF]], mur);
      s += `<circle cx="${n(w / 2)}" cy="${n(ROOF * 0.62)}" r="6" class="${allume(u, 2, 0) ? "f-lit" : "f-win"}"${allume(u, 2, 0) ? ` style="--d:${ctx.d++}"` : ""}/>`;
    }
    s += rect(0, ROOF, w, 2 * FH, mur);
    s += pavillon ? rect(-8, ROOF - 2, w + 16, 3, "f-trim") : rect(0, ROOF - 1, w, 2, "f-trim");
    s += rect(0, ROOF + FH - 1, w, 2, "f-trim");
    const avecVolets = (cx, y, lit) =>
      rect(cx - 14.5, y, 6.5, 21, "f-shutter") + rect(cx + 8, y, 6.5, 21, "f-shutter") + fenetre(ctx, cx - 7.5, y, 15, 21, lit);
    for (const k of [0.2, 0.5, 0.8]) s += avecVolets(w * k, ROOF + 6, allume(u, 1, k));
    const base = ROOF + FH;
    if (pavillon && o.garage) {
      s += rect(10, base + 9, 34, FH - 9, "f-door") + `<path d="M10 ${base + 15}H44M10 ${base + 21}H44M10 ${base + 27}H44" class="f-joint"/>`;
    } else {
      s += avecVolets(w * 0.2, base + 6, allume(u, 0, 0));
    }
    s += avecVolets(w * 0.8, base + 6, allume(u, 0, 2));
    const cx = w * 0.5;
    s += rect(cx - 8, base + 7, 16, FH - 7, "f-door") + fenetre(ctx, cx - 5, base + 10, 10, 8, allume(u, 0, 1), { meneau: false });
    s += rect(cx - 12, h - 2, 24, 2, "f-trim");
    return { w, h, svg: s };
  }

  // Villa contemporaine : deux volumes décalés, grandes baies, bardage bois, piscine devant.
  function villa(o, ctx) {
    const u = o.bien ?? "tout";
    const w = 214, h = 86;
    let s = rect(78, 6, 136, 34, "f-wall-white");
    s += rect(84, 10, 30, 30, "f-wood") + `<path d="${[0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => `M${87 + k * 3} 10V40`).join("")}" class="f-slats"/>`;
    s += fenetre(ctx, 120, 11, 86, 23, allume(u), { meneau: false, croisillons: 4 });
    s += rect(74, 2, 144, 4, "f-trim");
    s += rect(152, 44, 58, 42, "f-shade");
    s += rect(0, 40, 150, 46, "f-wall-white");
    s += fenetre(ctx, 10, 48, 100, 38, allume(u), { meneau: false, croisillons: 4 });
    s += rect(118, 50, 22, 36, "f-wood");
    s += rect(-4, 37, 158, 4, "f-trim");
    const devant = rect(10, -1, 136, 1.5, "f-curb") + rect(14, 0, 128, 7, "f-pool");
    return { w, h, svg: s, devant };
  }

  // Résidence récente : dalles et garde-corps vitrés, panneaux colorés.
  function moderne(o, ctx) {
    const baies = o.baies || 4, etages = o.etages || 6, u = o.bien;
    const BW = 28, M = 7, FH = 25, RDC = 28, TOP = 7;
    const w = baies * BW + 2 * M, h = TOP + 1 + etages * FH + RDC;
    let s = rect(w - 40, 0, 26, TOP - 2, "f-shade");
    s += rect(0, TOP + 1, w, h - TOP - 1, "f-wall-white");
    s += rect(-3, TOP - 3, w + 6, 4, "f-trim");
    for (let f = 1; f <= etages; f++) {
      const top = TOP + 1 + (etages - f) * FH;
      for (let i = 0; i < baies; i++) {
        const x = M + i * BW + 3;
        if ((i + f) % 3 === 0) s += rect(x + 17, top + 3, 5, FH - 7, "f-panel");
        s += fenetre(ctx, x, top + 3, 16, FH - 7, allume(u, f, i));
      }
      s += rect(M - 3, top + FH - 10, w - 2 * M + 6, 7, "f-rail");
      s += rect(M - 4, top + FH - 3, w - 2 * M + 8, 2.5, "f-trim");
    }
    const base = h - RDC;
    s += rect(M, base + 4, w - 2 * M, RDC - 4, "f-glass");
    let d = "";
    for (let x = M + 14; x < w - M; x += 14) d += `M${x} ${base + 4}V${h}`;
    s += `<path d="${d}" class="f-mullion"/>`;
    return { w, h, svg: s };
  }

  const STYLES = { haussmann, canut, maison, villa, moderne };
  const dessiner = (facade, ctx) => {
    const f = facade || {};
    return (STYLES[f.style] || maison)(f, ctx);
  };

  /* ---------- Décor ---------- */

  function arbre(x, g, s = 1) {
    return (
      rect(x - 1.6 * s, g - 18 * s, 3.2 * s, 18 * s, "f-trunk") +
      `<circle cx="${n(x)}" cy="${n(g - 30 * s)}" r="${n(13 * s)}" class="f-tree"/>` +
      `<circle cx="${n(x - 9 * s)}" cy="${n(g - 22 * s)}" r="${n(9 * s)}" class="f-tree"/>` +
      `<circle cx="${n(x + 9 * s)}" cy="${n(g - 23 * s)}" r="${n(10 * s)}" class="f-tree"/>`
    );
  }

  function lampadaire(x, g, s = 1) {
    const top = g - 46 * s;
    return (
      rect(x - 0.9 * s, top, 1.8 * s, 46 * s, "f-iron") +
      `<path d="M${n(x)} ${n(top)}q0 ${n(-5 * s)} ${n(6 * s)} ${n(-5 * s)}" class="f-arm"/>` +
      rect(x + 4 * s, top - 7 * s, 6 * s, 5 * s, "f-lamp", ' rx="1"')
    );
  }

  /* ---------- Rendus ---------- */

  // Vignette d'un bien (carte et fiche) : façade centrée sur son trottoir.
  function vignette(bien) {
    const W = 320, H = 200, G = 178;
    const ctx = { d: 0 };
    const f = dessiner(bien.facade, ctx);
    const s = Math.min((G - 26) / f.h, (W - 120) / f.w, 1.2);
    const bw = f.w * s, bx = (W - bw) / 2, by = G - f.h * s;
    const ts = Math.max(0.75, Math.min(1.1, s));
    let svg = rect(0, 0, W, G, "f-sky") + `<circle cx="${W - 62}" cy="64" r="13" class="f-orb"/>`;
    if (bx > 34) svg += arbre(bx - 24 * ts, G, ts);
    svg += `<g transform="translate(${n(bx)} ${n(by)}) scale(${n(s)})">${f.svg}</g>`;
    if (W - bx - bw > 34) svg += lampadaire(bx + bw + 20 * ts, G, ts);
    svg += rect(0, G, W, H - G, "f-ground") + rect(0, G, W, 2, "f-curb");
    if (f.devant) svg += `<g transform="translate(${n(bx)} ${n(G + 7)}) scale(${n(s)})">${f.devant}</g>`;
    return `<svg class="facade" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">${svg}</svg>`;
  }

  // La rue de l'accueil : tous les biens côte à côte, à la même échelle. Chaque façade ouvre sa fiche.
  function rue(biens) {
    const G = 232;
    let x = 26, corps = "", decor = "";
    biens.forEach((b, k) => {
      const ctx = { d: k * 4 };
      const f = dessiner(b.facade, ctx);
      const y = G - f.h;
      const vendu = b.statut === "vendu";
      const etiquette = vendu ? "VENDU" : euros(b.prix);
      const lw = etiquette.length * 7 + 18;
      const label = `${b.titre}, ${b.quartier || b.ville}, ${vendu ? "vendu" : euros(b.prix)}`;
      corps +=
        `<a href="#${esc(b.id)}" class="rue-bien" data-id="${esc(b.id)}" aria-label="${esc(label)}" style="--i:${k}">` +
        `<g transform="translate(${n(x)} ${n(y)})"><g class="rue-corps">${f.svg}</g></g>` +
        `<g class="rue-etiquette" transform="translate(${n(x + f.w / 2)} ${n(Math.max(y - 24, 2))})">` +
        `<rect x="${n(-lw / 2)}" y="0" width="${n(lw)}" height="19" rx="3"/><text x="0" y="14">${esc(etiquette)}</text></g></a>`;
      x += f.w;
      if (k < biens.length - 1) {
        const gap = 46;
        decor += k % 2 ? arbre(x + gap / 2, G, 1.15) : lampadaire(x + gap / 2, G, 1.1);
        x += gap;
      }
    });
    x += 26;
    return `<svg class="rue-svg" viewBox="0 0 ${n(x)} ${G}" focusable="false"><title>La rue des biens à vendre</title>${decor}${corps}</svg>`;
  }

  window.Facades = { vignette, rue };
})();
