/* ==========================================================
   Labo de lumière : app.js (version finale)
   Sources, miroirs (plats, courbes, semi-transparents), verres
   (prismes, blocs, billes, lentilles), réseau de diffraction,
   filtres colorés et écrans, avec tout ce qu'il faut pour les
   placer et les régler.

   Tout le code est dans une fonction qui s'exécute tout de
   suite (IIFE) : nos variables restent privées.
   ========================================================== */
(function () {
  "use strict";

  const canvas = document.getElementById("canvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");

  /* ---------- 1. CONFIGURATION ---------- */
  const CONFIG = {
    couleurRayon: "255, 244, 214", // blanc chaud de l'ampoule, en R, G, B
    epaisseurCoeur: 1.5, // trait fin et vif au centre du rayon
    epaisseurHalo: 6, // trait large et pâle autour
    rayonSource: 7, // taille de l'ampoule, en pixels

    // Lumière blanche = plusieurs longueurs d'onde (en nm) lancées ensemble.
    nbCouleurs: 32,
    lambdaMin: 400, // violet
    lambdaMax: 700, // rouge
    poidsSpectre: 0.5, // intensité de chaque couleur (leur somme redonne du blanc)

    // Verre : n(λ) = A + B / λ²  (loi de Cauchy, λ en micromètres).
    // B est volontairement plus grand que pour du vrai verre, pour que l'arc-en-ciel se voie.
    // Valeurs de départ de chaque forme de verre : A = indice, B = dispersion.
    // L'eau (bille) a un indice plus faible que le verre.
    verres: {
      prisme: { indice: 1.5, dispersion: 0.02 },
      bloc: { indice: 1.5, dispersion: 0.02 },
      bille: { indice: 1.33, dispersion: 0.01 },
      convergente: { indice: 1.5, dispersion: 0.015 },
      divergente: { indice: 1.5, dispersion: 0.015 },
    },

    // Réseau de diffraction (modèle simplifié)
    traitsReseau: 500, // traits par millimètre
    ordresMax: 2, // on calcule les ordres -2 à +2
    poidsOrdres: [0.12, 0.38, 0.06], // part de lumière des ordres 0, ±1, ±2 (répartie sur ceux qui existent)

    // Filtre coloré : largeur (en nm) de la bande de couleurs qu'il laisse passer
    largeurFiltre: 35,

    // Miroir courbe : nombre de petits segments qui forment l'arc
    pasArcMiroir: 48,
    couleurEcran: "#3a4566",

    interactionsMax: 24, // changements de direction maximum pour un même rayon
    rayonsMax: 1200, // nombre maximum de rayons par source
    intensiteMin: 0.005, // en dessous, un rayon est trop faible : on l'abandonne
    maxSources: 6,
    maxObjets: 20,

    couleurMiroir: "#8fa6cc",
    couleurMiroirReflet: "#e3ecff",
    couleurReseau: "#e0b96a",
    couleurVerre: "rgba(140, 180, 255, 0.10)",
    contourVerre: "rgba(190, 215, 255, 0.55)",
  };

  // On lit les couleurs dans le CSS (variables --fond et --accent) : une seule source de vérité.
  function lireVariableCSS(nom, parDefaut) {
    return (
      getComputedStyle(document.documentElement).getPropertyValue(nom).trim() ||
      parDefaut
    );
  }
  const couleurFond = lireVariableCSS("--fond", "#0b0f1a");
  const couleurAccent = lireVariableCSS("--accent", "#ffd98a");

  /* ---------- 2. LA SCÈNE ----------
     Repère du canvas : origine en haut à gauche, axe y vers le BAS.
     Angle 0 = vers la droite ; un angle positif tourne dans le sens des aiguilles d'une montre. */
  const scene = {
    sources: [],
    miroirs: [],
    verres: [], // tous les objets en verre : prisme, bloc, bille, lentilles
    reseaux: [],
    filtres: [],
    ecrans: [],
  };

  // longueurOnde : null pour de la lumière blanche, ou un nombre en nm (ex. 532 pour du vert).
  function creerSource(x, y, angle, longueurOnde) {
    return { x: x, y: y, angle: angle, longueurOnde: longueurOnde };
  }

  // Un miroir est un segment, éventuellement courbé en arc.
  // courbure : flèche de l'arc divisée par la longueur du miroir (0 = plat ; le signe dit de quel côté il bombe).
  // reflexion : part de lumière réfléchie (1 = miroir parfait ; 0,5 = semi-transparent).
  function creerMiroir(x1, y1, x2, y2, courbure, reflexion) {
    return {
      x1: x1,
      y1: y1,
      x2: x2,
      y2: y2,
      courbure: courbure || 0,
      reflexion: reflexion === undefined ? 1 : reflexion,
    };
  }

  // Les points du miroir. Plat : les deux extrémités. Courbe : une parabole entre les deux
  // extrémités (un miroir parabolique concentre en un seul point, le foyer, les rayons
  // parallèles à son axe).
  function pointsDuMiroir(miroir) {
    if (Math.abs(miroir.courbure) < 0.005) {
      return [
        { x: miroir.x1, y: miroir.y1 },
        { x: miroir.x2, y: miroir.y2 },
      ];
    }
    const ex = miroir.x2 - miroir.x1;
    const ey = miroir.y2 - miroir.y1;
    const longueur = Math.hypot(ex, ey) || 1;
    const fleche = miroir.courbure * longueur;
    const points = [];
    for (let i = 0; i <= CONFIG.pasArcMiroir; i++) {
      const u = i / CONFIG.pasArcMiroir; // 0 à une extrémité, 1 à l'autre
      const ecart = fleche * 4 * u * (1 - u); // 0 aux extrémités, "fleche" au milieu
      points.push({
        x: miroir.x1 + u * ex - (ey / longueur) * ecart,
        y: miroir.y1 + u * ey + (ex / longueur) * ecart,
      });
    }
    return points;
  }

  // Un réseau est un segment comme un miroir, mais il laisse passer la lumière en la diffractant.
  function creerReseau(x1, y1, x2, y2, traits) {
    return { x1: x1, y1: y1, x2: x2, y2: y2, traits: traits };
  }

  // Un filtre laisse passer les couleurs proches de sa longueur d'onde lambda et absorbe les autres.
  function creerFiltre(x1, y1, x2, y2, lambda) {
    return { x1: x1, y1: y1, x2: x2, y2: y2, lambda: lambda };
  }

  // Un écran arrête les rayons et affiche la lumière qu'il reçoit.
  function creerEcran(x1, y1, x2, y2) {
    return { x1: x1, y1: y1, x2: x2, y2: y2 };
  }

  // Un verre est un polygone : une forme ('prisme', 'bloc', 'bille', 'convergente' ou
  // 'divergente'), un centre, une taille (rayon), une rotation, un indice et une dispersion.
  // La lumière est réfractée sur chaque côté du polygone, quelle que soit la forme.
  function creerVerre(forme, cx, cy, rayon, rotation) {
    const verre = {
      forme: "",
      cx: cx,
      cy: cy,
      rayon: rayon,
      rotation: rotation,
      indiceBase: 0,
      dispersion: 0,
      sommets: [],
    };
    changerForme(verre, forme);
    return verre;
  }

  // Change la forme et reprend l'indice et la dispersion habituels de cette forme.
  function changerForme(verre, forme) {
    verre.forme = forme;
    verre.indiceBase = CONFIG.verres[forme].indice;
    verre.dispersion = CONFIG.verres[forme].dispersion;
    calculerSommets(verre);
  }

  // Le contour de chaque forme dans un repère local : centre en (0, 0), "haut" vers −y,
  // taille 1 = le rayon du verre. calculerSommets le met à l'échelle, le tourne et le place.
  function contourLocal(forme) {
    const points = [];

    if (forme === "prisme") {
      // triangle équilatéral, pointe en haut
      for (let k = 0; k < 3; k++) {
        const angle = -Math.PI / 2 + k * ((2 * Math.PI) / 3);
        points.push({ x: Math.cos(angle), y: Math.sin(angle) });
      }
    } else if (forme === "bloc") {
      // lame à faces parallèles
      points.push(
        { x: -1.1, y: -0.55 },
        { x: 1.1, y: -0.55 },
        { x: 1.1, y: 0.55 },
        { x: -1.1, y: 0.55 },
      );
    } else if (forme === "bille") {
      // un cercle, approché par 48 côtés
      for (let k = 0; k < 48; k++) {
        const angle = (k * 2 * Math.PI) / 48;
        points.push({ x: Math.cos(angle), y: Math.sin(angle) });
      }
    } else {
      // Lentille : deux arcs de cercle de rayon de courbure 1,5, sur une hauteur de y = −1 à +1.
      // Convergente : fine au bord, épaisse au centre. Divergente : l'inverse.
      const courbure = 1.5;
      const bord = Math.sqrt(courbure * courbure - 1);
      const fleche = courbure - bord;
      const demiEpaisseur = function (y) {
        const arc = Math.sqrt(courbure * courbure - y * y);
        if (forme === "convergente") return arc - bord;
        return 0.5 - fleche + (courbure - arc);
      };
      const pas = 14;
      for (let k = 0; k <= pas; k++) {
        // côté droit, de haut en bas
        const y = -1 + (2 * k) / pas;
        points.push({ x: demiEpaisseur(y), y: y });
      }
      for (let k = pas; k >= 0; k--) {
        // côté gauche, de bas en haut
        const y = -1 + (2 * k) / pas;
        points.push({ x: -demiEpaisseur(y), y: y });
      }
    }
    return points;
  }

  function calculerSommets(verre) {
    const cos = Math.cos(verre.rotation);
    const sin = Math.sin(verre.rotation);
    verre.sommets = contourLocal(verre.forme).map(function (p) {
      const x = p.x * verre.rayon;
      const y = p.y * verre.rayon;
      return {
        x: verre.cx + x * cos - y * sin,
        y: verre.cy + x * sin + y * cos,
      }; // rotation puis déplacement
    });
  }

  // Ce point est-il dans ce verre ? On lance un trait horizontal vers la droite
  // et on compte les côtés croisés : nombre impair = dedans.
  function pointDansVerre(verre, px, py) {
    const s = verre.sommets;
    let dedans = false;
    for (let i = 0; i < s.length; i++) {
      const a = s[i];
      const b = s[(i + 1) % s.length];
      if (a.y > py !== b.y > py) {
        const xCroisement = a.x + ((py - a.y) * (b.x - a.x)) / (b.y - a.y);
        if (px < xCroisement) dedans = !dedans;
      }
    }
    return dedans;
  }

  function verreContenant(px, py) {
    for (const verre of scene.verres) {
      if (pointDansVerre(verre, px, py)) return verre;
    }
    return null;
  }

  // Tout ce qui arrête ou dévie un rayon est une "surface" : un segment avec un type
  // ('miroir', 'reseau' ou 'verre') et un lien vers l'objet d'origine.
  function listerSurfaces() {
    const surfaces = [];
    for (const m of scene.miroirs) {
      const p = pointsDuMiroir(m); // un miroir courbe est une suite de petits segments plats
      for (let i = 0; i < p.length - 1; i++) {
        surfaces.push({
          x1: p[i].x,
          y1: p[i].y,
          x2: p[i + 1].x,
          y2: p[i + 1].y,
          type: "miroir",
          miroir: m,
        });
      }
    }
    for (const r of scene.reseaux) {
      surfaces.push({
        x1: r.x1,
        y1: r.y1,
        x2: r.x2,
        y2: r.y2,
        type: "reseau",
        reseau: r,
      });
    }
    for (const f of scene.filtres) {
      surfaces.push({
        x1: f.x1,
        y1: f.y1,
        x2: f.x2,
        y2: f.y2,
        type: "filtre",
        filtre: f,
      });
    }
    for (const e of scene.ecrans) {
      surfaces.push({ x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, type: "ecran" });
    }
    for (const verre of scene.verres) {
      const s = verre.sommets;
      for (let i = 0; i < s.length; i++) {
        const a = s[i];
        const b = s[(i + 1) % s.length];
        surfaces.push({
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
          type: "verre",
          verre: verre,
        });
      }
    }
    return surfaces;
  }

  // La scène de départ : un verre, un miroir et une source de lumière blanche.
  function creerSceneParDefaut() {
    scene.sources.length = 0;
    scene.miroirs.length = 0;
    scene.verres.length = 0;
    scene.reseaux.length = 0;
    scene.filtres.length = 0;
    scene.ecrans.length = 0;

    const verre = creerVerre(
      "prisme",
      largeur * 0.5,
      hauteur * 0.5,
      Math.min(largeur, hauteur) * 0.22,
      0,
    );
    scene.verres.push(verre);
    scene.miroirs.push(
      creerMiroir(
        largeur * 0.9,
        hauteur * 0.12,
        largeur * 0.84,
        hauteur * 0.88,
      ),
    );

    // La source arrive d'en bas à gauche, un peu vers le haut (-18°), et touche la face gauche
    // du verre en son milieu : le passage est presque symétrique, l'arc-en-ciel est net.
    const angleDepart = (-18 * Math.PI) / 180;
    const cibleX = (verre.sommets[0].x + verre.sommets[2].x) / 2;
    const cibleY = (verre.sommets[0].y + verre.sommets[2].y) / 2;
    const departX = largeur * 0.12;
    const distance = (cibleX - departX) / Math.cos(angleDepart);
    scene.sources.push(
      creerSource(
        departX,
        cibleY - distance * Math.sin(angleDepart),
        angleDepart,
        null,
      ),
    );
  }

  /* ---------- 3. TAILLE DU CANVAS ---------- */
  let largeur = 0;
  let hauteur = 0;

  function redimensionner() {
    const ancienneLargeur = largeur;
    const ancienneHauteur = hauteur;
    const densite = Math.min(window.devicePixelRatio || 1, 2);

    largeur = canvas.clientWidth;
    hauteur = canvas.clientHeight;
    canvas.width = Math.round(largeur * densite); // ceci efface le canvas
    canvas.height = Math.round(hauteur * densite);
    ctx.setTransform(densite, 0, 0, densite, 0, 0);

    // Les objets gardent la même place relative quand la fenêtre change de taille.
    if (ancienneLargeur > 0 && ancienneHauteur > 0) {
      const echelleX = largeur / ancienneLargeur;
      const echelleY = hauteur / ancienneHauteur;

      for (const source of scene.sources) {
        source.x *= echelleX;
        source.y *= echelleY;
      }
      for (const segment of scene.miroirs.concat(
        scene.reseaux,
        scene.filtres,
        scene.ecrans,
      )) {
        segment.x1 *= echelleX;
        segment.y1 *= echelleY;
        segment.x2 *= echelleX;
        segment.y2 *= echelleY;
      }
      for (const verre of scene.verres) {
        verre.cx *= echelleX;
        verre.cy *= echelleY;
        verre.rayon *= Math.min(echelleX, echelleY); // le triangle reste équilatéral
        calculerSommets(verre);
      }
    }
  }

  /* ---------- 4. OPTIQUE ----------
     Du calcul pur, sans dessin. Une direction est un vecteur (dx, dy) de longueur 1. */

  // Distance t parcourue par un rayon (origine ox, oy ; direction dx, dy) avant de
  // toucher le segment (x1, y1)-(x2, y2), ou null s'il le rate.
  // Point d'impact : O + t·d = P1 + u·e, avec e = P2 − P1. Il y a impact si t > 0 et 0 ≤ u ≤ 1.
  function intersecterSegment(ox, oy, dx, dy, x1, y1, x2, y2) {
    const ex = x2 - x1;
    const ey = y2 - y1;
    const denominateur = dx * ey - dy * ex;
    if (Math.abs(denominateur) < 1e-9) return null; // parallèles

    const fx = x1 - ox;
    const fy = y1 - oy;
    const t = (fx * ey - fy * ex) / denominateur;
    const u = (fx * dy - fy * dx) / denominateur;

    if (t > 1e-6 && u >= 0 && u <= 1) return t;
    return null;
  }

  // Vecteur de longueur 1 perpendiculaire au segment.
  function normaleDuSegment(segment) {
    const ex = segment.x2 - segment.x1;
    const ey = segment.y2 - segment.y1;
    const norme = Math.hypot(ex, ey) || 1; // évite de diviser par zéro pour un segment réduit à un point
    return { nx: -ey / norme, ny: ex / norme };
  }

  // Loi de la réflexion : r = d − 2·(d·n)·n
  function reflechir(dx, dy, nx, ny) {
    const scalaire = dx * nx + dy * ny;
    return { dx: dx - 2 * scalaire * nx, dy: dy - 2 * scalaire * ny };
  }

  // Loi de Snell-Descartes : n1·sin(i) = n2·sin(t).
  // La normale (nx, ny) doit être tournée VERS le rayon ; cosI = cos de l'angle d'incidence.
  // Renvoie la direction du rayon transmis et cosT, ou null s'il y a réflexion totale.
  function refracter(dx, dy, nx, ny, cosI, n1, n2) {
    const rapport = n1 / n2;
    const k = 1 - rapport * rapport * (1 - cosI * cosI); // k = cos²(t)
    if (k < 0) return null; // sin(t) > 1 : réflexion totale
    const cosT = Math.sqrt(k);
    const facteur = rapport * cosI - cosT;
    return {
      dx: rapport * dx + facteur * nx,
      dy: rapport * dy + facteur * ny,
      cosT: cosT,
    };
  }

  // Part de la lumière réfléchie quand elle change de milieu (formules de Fresnel,
  // lumière non polarisée). Air → verre en incidence normale : environ 4 %.
  function reflectanceFresnel(n1, n2, cosI, cosT) {
    const rs = (n1 * cosI - n2 * cosT) / (n1 * cosI + n2 * cosT);
    const rp = (n1 * cosT - n2 * cosI) / (n1 * cosT + n2 * cosI);
    return (rs * rs + rp * rp) / 2;
  }

  // Dispersion : l'indice du verre dépend de la longueur d'onde (loi de Cauchy).
  // Le violet (λ petit) est plus dévié que le rouge (λ grand).
  function indiceDuVerre(verre, lambda) {
    const micrometres = lambda / 1000;
    return verre.indiceBase + verre.dispersion / (micrometres * micrometres);
  }

  // Réseau de diffraction : les directions des ordres m = -2 … +2 qui existent.
  // (tx, ty) = direction du réseau ; (nx, ny) = normale tournée vers le rayon.
  // Formule des réseaux : sin θm = sin θi + m·λ / pas, où le pas est la distance entre deux traits.
  // sin θ est la composante de la direction le long du réseau.
  function ordresDeDiffraction(dx, dy, tx, ty, nx, ny, lambda, traitsParMm) {
    const pas = 1e6 / traitsParMm; // en nm (1 mm = 1 000 000 nm)
    const sinI = dx * tx + dy * ty;
    const ordres = [];
    let total = 0;

    for (let m = -CONFIG.ordresMax; m <= CONFIG.ordresMax; m++) {
      const sinM = sinI + (m * lambda) / pas;
      if (Math.abs(sinM) >= 1) continue; // cet ordre n'existe pas : angle impossible
      const cosM = Math.sqrt(1 - sinM * sinM);
      const poids = CONFIG.poidsOrdres[Math.abs(m)];
      // Le rayon continue de l'autre côté du réseau : on part de −n, d'où le signe moins.
      ordres.push({
        dx: sinM * tx - cosM * nx,
        dy: sinM * ty - cosM * ny,
        poids: poids,
      });
      total += poids;
    }

    if (total === 0) return [];
    for (const ordre of ordres) ordre.poids /= total; // toute la lumière se répartit entre les ordres existants
    return ordres;
  }

  // Part de la lumière qui traverse un filtre centré sur "centre" (en nm) : une cloche de largeur CONFIG.largeurFiltre.
  function transmissionFiltre(centre, lambda) {
    const ecart = (lambda - centre) / CONFIG.largeurFiltre;
    return Math.exp(-0.5 * ecart * ecart);
  }

  // Longueur d'onde (nm) → couleur "r, g, b". Approximation classique, par morceaux.
  function longueurOndeVersRVB(lambda) {
    let r = 0;
    let g = 0;
    let b = 0;

    if (lambda < 440) {
      r = (440 - lambda) / 60;
      b = 1;
    } else if (lambda < 490) {
      g = (lambda - 440) / 50;
      b = 1;
    } else if (lambda < 510) {
      g = 1;
      b = (510 - lambda) / 20;
    } else if (lambda < 580) {
      r = (lambda - 510) / 70;
      g = 1;
    } else if (lambda < 645) {
      r = 1;
      g = (645 - lambda) / 65;
    } else {
      r = 1;
    }

    // L'œil est moins sensible aux extrémités du spectre : on les assombrit un peu.
    let attenuation = 1;
    if (lambda < 420) attenuation = 0.3 + (0.7 * (lambda - 380)) / 40;
    else if (lambda > 700) attenuation = 0.3 + (0.7 * (780 - lambda)) / 80;

    const canal = function (valeur) {
      return Math.round(255 * Math.pow(valeur * attenuation, 0.8)); // 0,8 : correction d'affichage
    };
    return canal(r) + ", " + canal(g) + ", " + canal(b);
  }

  // Les rayons qu'émet une source : un seul pour une couleur pure,
  // plusieurs (du violet au rouge) pour de la lumière blanche.
  function faisceauDeLaSource(source) {
    if (source.longueurOnde !== null) {
      return [{ lambda: source.longueurOnde, intensite: 1 }];
    }
    const faisceau = [];
    const n = CONFIG.nbCouleurs;
    for (let i = 0; i < n; i++) {
      const lambda =
        CONFIG.lambdaMin +
        (i * (CONFIG.lambdaMax - CONFIG.lambdaMin)) / (n - 1);
      faisceau.push({ lambda: lambda, intensite: CONFIG.poidsSpectre });
    }
    return faisceau;
  }

  /* ---------- 5. PROPAGATION ----------
     Un rayon peut se diviser (verre, réseau) et une source blanche émet plusieurs couleurs.
     On renvoie donc une liste de segments, chacun avec sa couleur et son intensité. */
  function calculerSegments(source, surfaces) {
    const segments = [];
    const longueur = Math.hypot(largeur, hauteur); // sort forcément de l'écran
    const dansDepart = verreContenant(source.x, source.y); // la source est-elle dans du verre ?

    // La file d'attente contient les rayons à suivre : un par couleur au départ,
    // puis un de plus à chaque division.
    const file = [];
    for (const echantillon of faisceauDeLaSource(source)) {
      file.push({
        x: source.x,
        y: source.y,
        dx: Math.cos(source.angle),
        dy: Math.sin(source.angle),
        intensite: echantillon.intensite,
        lambda: echantillon.lambda,
        couleur: longueurOndeVersRVB(echantillon.lambda),
        dans: dansDepart, // le verre où se trouve le rayon, ou null (air)
        derniere: null,
      });
    }
    let rayonsTraites = 0;

    while (file.length > 0 && rayonsTraites < CONFIG.rayonsMax) {
      const rayon = file.pop();
      rayonsTraites++;

      let x = rayon.x;
      let y = rayon.y;
      let dx = rayon.dx;
      let dy = rayon.dy;
      let intensite = rayon.intensite;
      let dans = rayon.dans;
      let derniere = rayon.derniere; // surface qu'on vient de quitter : on ne la retouche pas
      const lambda = rayon.lambda;
      const couleur = rayon.couleur;

      for (let i = 0; i < CONFIG.interactionsMax; i++) {
        // 1) Surface la plus proche sur la trajectoire
        let distanceMin = Infinity;
        let surface = null;
        for (const candidate of surfaces) {
          if (candidate === derniere) continue;
          const t = intersecterSegment(
            x,
            y,
            dx,
            dy,
            candidate.x1,
            candidate.y1,
            candidate.x2,
            candidate.y2,
          );
          if (t !== null && t < distanceMin) {
            distanceMin = t;
            surface = candidate;
          }
        }

        // 2) Rien sur le chemin : le rayon file jusqu'au bord de l'écran
        if (surface === null) {
          segments.push({
            x1: x,
            y1: y,
            x2: x + dx * longueur,
            y2: y + dy * longueur,
            intensite: intensite,
            couleur: couleur,
          });
          break;
        }

        // 3) On avance jusqu'à la surface
        const xi = x + dx * distanceMin;
        const yi = y + dy * distanceMin;
        segments.push({
          x1: x,
          y1: y,
          x2: xi,
          y2: yi,
          intensite: intensite,
          couleur: couleur,
        });
        x = xi;
        y = yi;
        derniere = surface;

        // La normale, tournée vers le rayon (peu importe de quel côté on arrive)
        const normale = normaleDuSegment(surface);
        let nx = normale.nx;
        let ny = normale.ny;
        if (dx * nx + dy * ny > 0) {
          nx = -nx;
          ny = -ny;
        }

        // 4a) Miroir : réflexion (partielle si le miroir est semi-transparent)
        if (surface.type === "miroir") {
          const r = reflechir(dx, dy, nx, ny);
          const part = surface.miroir.reflexion;
          if (part >= 1) {
            dx = r.dx;
            dy = r.dy;
            continue;
          }
          // Semi-miroir : un rayon réfléchi part de son côté, le reste continue tout droit
          if (intensite * part >= CONFIG.intensiteMin) {
            file.push({
              x: x,
              y: y,
              dx: r.dx,
              dy: r.dy,
              intensite: intensite * part,
              lambda: lambda,
              couleur: couleur,
              dans: dans,
              derniere: surface,
            });
          }
          intensite *= 1 - part;
          if (intensite < CONFIG.intensiteMin) break;
          continue;
        }

        // 4b) Filtre : le rayon traverse tout droit, mais les couleurs hors de sa bande sont absorbées
        if (surface.type === "filtre") {
          intensite *= transmissionFiltre(surface.filtre.lambda, lambda);
          if (intensite < CONFIG.intensiteMin) break;
          continue;
        }

        // 4c) Écran : le rayon s'arrête ici et laisse une tache de lumière (dessinée plus loin)
        if (surface.type === "ecran") {
          segments[segments.length - 1].impact = true;
          break;
        }

        // 4d) Réseau : le rayon s'arrête ici et laisse place à un rayon par ordre de diffraction
        if (surface.type === "reseau") {
          // La direction du réseau est fixe (de l'extrémité 1 vers l'extrémité 2) :
          // l'ordre +1 part toujours du même côté.
          const ordres = ordresDeDiffraction(
            dx,
            dy,
            normale.ny,
            -normale.nx,
            nx,
            ny,
            lambda,
            surface.reseau.traits,
          );
          for (const ordre of ordres) {
            if (intensite * ordre.poids >= CONFIG.intensiteMin) {
              file.push({
                x: x,
                y: y,
                dx: ordre.dx,
                dy: ordre.dy,
                intensite: intensite * ordre.poids,
                lambda: lambda,
                couleur: couleur,
                dans: dans,
                derniere: surface,
              });
            }
          }
          break;
        }

        // 4e) Verre : on regarde si on entre ou on sort
        const cosI = -(dx * nx + dy * ny);
        const verre = surface.verre;
        const nVerre = indiceDuVerre(verre, lambda); // dépend de la couleur de CE rayon
        const entre = dans !== verre;
        const n1 = entre ? 1 : nVerre;
        const n2 = entre ? nVerre : 1;

        const reflechi = reflechir(dx, dy, nx, ny);
        const transmis = refracter(dx, dy, nx, ny, cosI, n1, n2);

        if (transmis === null) {
          // Réflexion totale : toute la lumière reste dans le même milieu
          dx = reflechi.dx;
          dy = reflechi.dy;
          continue;
        }

        // Division : une partie réfléchie (nouveau rayon), le reste continue en réfraction
        const part = reflectanceFresnel(n1, n2, cosI, transmis.cosT);
        if (intensite * part >= CONFIG.intensiteMin) {
          file.push({
            x: x,
            y: y,
            dx: reflechi.dx,
            dy: reflechi.dy,
            intensite: intensite * part,
            lambda: lambda,
            couleur: couleur,
            dans: dans,
            derniere: surface,
          });
        }
        intensite *= 1 - part;
        dx = transmis.dx;
        dy = transmis.dy;
        dans = entre ? verre : null;

        if (intensite < CONFIG.intensiteMin) break;
      }
    }

    return segments;
  }

  /* ---------- 6. DESSIN ---------- */
  function tracerTrait(x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // Un segment de rayon : un halo pâle sous un trait fin et vif, dans la couleur du rayon.
  // Avec le mode "lighter", les 32 couleurs superposées avant le verre s'additionnent
  // et redonnent du blanc. Le cœur s'éteint moins vite que le halo quand l'intensité baisse :
  // les faibles réflexions restent visibles sans que le halo s'épaississe.
  function dessinerSegment(segment) {
    const alphaCoeur = 0.9 * Math.pow(segment.intensite, 0.8);
    const alphaHalo = 0.12 * Math.pow(segment.intensite, 3);
    ctx.lineCap = "round";

    ctx.strokeStyle =
      "rgba(" + segment.couleur + ", " + alphaHalo.toFixed(4) + ")";
    ctx.lineWidth = CONFIG.epaisseurHalo;
    tracerTrait(segment.x1, segment.y1, segment.x2, segment.y2);

    ctx.strokeStyle =
      "rgba(" + segment.couleur + ", " + alphaCoeur.toFixed(3) + ")";
    ctx.lineWidth = CONFIG.epaisseurCoeur;
    tracerTrait(segment.x1, segment.y1, segment.x2, segment.y2);

    // Un rayon qui arrive sur un écran y laisse une tache. Les taches de couleurs différentes
    // s'additionnent : c'est là qu'on voit le mélange des couleurs.
    if (segment.impact) {
      ctx.fillStyle =
        "rgba(" +
        segment.couleur +
        ", " +
        (0.5 * Math.pow(segment.intensite, 0.8)).toFixed(3) +
        ")";
      ctx.beginPath();
      ctx.arc(segment.x2, segment.y2, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Trace une ligne brisée qui passe par tous les points.
  function tracerLigne(points) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
  }

  function dessinerMiroir(miroir) {
    const points = pointsDuMiroir(miroir);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalAlpha = 0.35 + 0.65 * miroir.reflexion; // un semi-miroir est plus transparent
    ctx.strokeStyle = CONFIG.couleurMiroir;
    ctx.lineWidth = 4;
    tracerLigne(points);
    ctx.strokeStyle = CONFIG.couleurMiroirReflet;
    ctx.lineWidth = 1.2;
    tracerLigne(points);
    ctx.globalAlpha = 1;
  }

  // Un filtre : un trait épais de la couleur qu'il laisse passer.
  function dessinerFiltre(filtre) {
    const couleur = longueurOndeVersRVB(filtre.lambda);
    ctx.lineCap = "butt";
    ctx.strokeStyle = "rgba(" + couleur + ", 0.5)";
    ctx.lineWidth = 8;
    tracerTrait(filtre.x1, filtre.y1, filtre.x2, filtre.y2);
    ctx.strokeStyle = "rgba(" + couleur + ", 0.9)";
    ctx.lineWidth = 1.2;
    tracerTrait(filtre.x1, filtre.y1, filtre.x2, filtre.y2);
  }

  // Un écran : une barre sombre, sur laquelle la lumière viendra former des taches.
  function dessinerEcran(ecran) {
    ctx.lineCap = "butt";
    ctx.strokeStyle = CONFIG.couleurEcran;
    ctx.lineWidth = 8;
    tracerTrait(ecran.x1, ecran.y1, ecran.x2, ecran.y2);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.lineWidth = 1;
    tracerTrait(ecran.x1, ecran.y1, ecran.x2, ecran.y2);
  }

  // Un réseau : un trait large en pointillés très serrés, qui évoque les traits gravés.
  function dessinerReseau(reseau) {
    ctx.lineCap = "butt";
    ctx.strokeStyle = CONFIG.couleurReseau;
    ctx.lineWidth = 6;
    ctx.setLineDash([1.5, 3]);
    tracerTrait(reseau.x1, reseau.y1, reseau.x2, reseau.y2);
    ctx.setLineDash([]);
  }

  function cheminVerre(verre) {
    ctx.beginPath();
    verre.sommets.forEach(function (point, i) {
      if (i === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.closePath();
  }

  // Un verre : un polygone translucide avec un contour clair.
  function dessinerVerre(verre) {
    cheminVerre(verre);
    ctx.fillStyle = CONFIG.couleurVerre;
    ctx.fill();
    ctx.strokeStyle = CONFIG.contourVerre;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  function dessinerSource(source) {
    // Ampoule blanche chaude, ou de la couleur de la longueur d'onde si la source est pure.
    const couleur =
      source.longueurOnde === null
        ? CONFIG.couleurRayon
        : longueurOndeVersRVB(source.longueurOnde);
    const rayonLueur = CONFIG.rayonSource * 4;
    const lueur = ctx.createRadialGradient(
      source.x,
      source.y,
      0,
      source.x,
      source.y,
      rayonLueur,
    );
    lueur.addColorStop(0, "rgba(" + couleur + ", 0.9)");
    lueur.addColorStop(0.25, "rgba(" + couleur + ", 0.35)");
    lueur.addColorStop(1, "rgba(" + couleur + ", 0)");

    ctx.fillStyle = lueur;
    ctx.beginPath();
    ctx.arc(source.x, source.y, rayonLueur, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgb(" + couleur + ")";
    ctx.beginPath();
    ctx.arc(source.x, source.y, CONFIG.rayonSource * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Ce qui montre l'objet sélectionné : un contour en pointillés et des poignées à saisir.
  function dessinerSelection() {
    if (!selection) return;
    const objet = selection.objet;

    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = couleurAccent;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);

    if (selection.type === "source") {
      ctx.beginPath();
      ctx.arc(objet.x, objet.y, CONFIG.rayonSource * 2.6, 0, Math.PI * 2);
      ctx.stroke();
    } else if (selection.type === "verre") {
      cheminVerre(objet);
      ctx.stroke();
    }

    const liste = poignees(selection);
    for (const poignee of liste) {
      if (poignee.ancre)
        tracerTrait(poignee.ancre.x, poignee.ancre.y, poignee.x, poignee.y);
    }
    ctx.setLineDash([]);

    ctx.fillStyle = couleurFond;
    for (const poignee of liste) {
      ctx.beginPath();
      ctx.arc(poignee.x, poignee.y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  function dessiner() {
    // 1) Fond, objets : mode normal
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = couleurFond;
    ctx.fillRect(0, 0, largeur, hauteur);

    for (const ecran of scene.ecrans) dessinerEcran(ecran);
    for (const miroir of scene.miroirs) dessinerMiroir(miroir);
    for (const reseau of scene.reseaux) dessinerReseau(reseau);
    for (const verre of scene.verres) dessinerVerre(verre);
    for (const filtre of scene.filtres) dessinerFiltre(filtre);

    // 2) Mode "lighter" : les lumières s'additionnent
    ctx.globalCompositeOperation = "lighter";

    const surfaces = listerSurfaces(); // calculées une fois pour toutes les sources
    for (const source of scene.sources) {
      for (const segment of calculerSegments(source, surfaces)) {
        dessinerSegment(segment);
      }
      dessinerSource(source);
    }

    // 3) Retour au mode normal pour la sélection
    dessinerSelection();
    ctx.globalCompositeOperation = "source-over";
  }

  // On ne redessine que lorsque quelque chose change.
  let dessinEnAttente = false;

  function demanderDessin() {
    if (dessinEnAttente) return;
    dessinEnAttente = true;
    requestAnimationFrame(function () {
      dessinEnAttente = false;
      dessiner();
    });
  }

  /* ---------- 7. SÉLECTION ET POIGNÉES ----------
     selection vaut null, ou { type: 'source' | 'miroir' | 'verre' | 'reseau', objet: ... } */
  let selection = null;

  const LISTES = {
    source: scene.sources,
    miroir: scene.miroirs,
    verre: scene.verres,
    reseau: scene.reseaux,
    filtre: scene.filtres,
    ecran: scene.ecrans,
  };

  const LONGUEUR_POIGNEE_SOURCE = 64; // distance entre l'ampoule et sa poignée de direction

  // Les poignées de l'objet sélectionné : des points qu'on peut saisir pour le modifier.
  function poignees(sel) {
    const o = sel.objet;
    if (sel.type === "source") {
      return [
        {
          id: "direction",
          x: o.x + LONGUEUR_POIGNEE_SOURCE * Math.cos(o.angle),
          y: o.y + LONGUEUR_POIGNEE_SOURCE * Math.sin(o.angle),
          ancre: { x: o.x, y: o.y },
        },
      ];
    }
    if (sel.type === "verre") {
      const angle = o.rotation - Math.PI / 2; // au-delà de la pointe
      return [
        {
          id: "rotation",
          x: o.cx + (o.rayon + 34) * Math.cos(angle),
          y: o.cy + (o.rayon + 34) * Math.sin(angle),
          ancre: { x: o.cx, y: o.cy },
        },
      ];
    }
    return [
      { id: "a", x: o.x1, y: o.y1 },
      { id: "b", x: o.x2, y: o.y2 },
    ]; // miroir ou réseau
  }

  function distanceAuSegment(px, py, s) {
    const ex = s.x2 - s.x1;
    const ey = s.y2 - s.y1;
    const carre = ex * ex + ey * ey;
    let u = carre === 0 ? 0 : ((px - s.x1) * ex + (py - s.y1) * ey) / carre;
    u = Math.max(0, Math.min(1, u)); // on reste sur le segment
    return Math.hypot(px - (s.x1 + u * ex), py - (s.y1 + u * ey));
  }

  // Quel objet est sous le pointeur ? Les plus fins (sources, segments) passent avant les verres.
  function trouverObjet(px, py, tolerance) {
    for (const s of scene.sources) {
      if (Math.hypot(px - s.x, py - s.y) <= tolerance + 4)
        return { type: "source", objet: s };
    }
    for (const m of scene.miroirs) {
      const p = pointsDuMiroir(m); // on teste chaque petit segment d'un miroir courbe
      for (let i = 0; i < p.length - 1; i++) {
        const morceau = {
          x1: p[i].x,
          y1: p[i].y,
          x2: p[i + 1].x,
          y2: p[i + 1].y,
        };
        if (distanceAuSegment(px, py, morceau) <= tolerance)
          return { type: "miroir", objet: m };
      }
    }
    for (const type of ["reseau", "filtre", "ecran"]) {
      for (const objet of LISTES[type]) {
        if (distanceAuSegment(px, py, objet) <= tolerance)
          return { type: type, objet: objet };
      }
    }
    for (const v of scene.verres) {
      if (pointDansVerre(v, px, py)) return { type: "verre", objet: v };
    }
    return null;
  }

  function trouverPoignee(px, py, tolerance) {
    if (!selection) return null;
    for (const poignee of poignees(selection)) {
      if (Math.hypot(px - poignee.x, py - poignee.y) <= tolerance)
        return poignee;
    }
    return null;
  }

  /* ---------- 8. GLISSER ET DÉPOSER ---------- */
  let glisse = null; // pendant un glissement : { poignee: id ou null, x, y }

  function positionPointeur(evenement) {
    const cadre = canvas.getBoundingClientRect(); // position du canvas dans la fenêtre
    return {
      x: Math.max(0, Math.min(largeur, evenement.clientX - cadre.left)),
      y: Math.max(0, Math.min(hauteur, evenement.clientY - cadre.top)),
    };
  }

  // Un doigt est moins précis qu'une souris : la zone de saisie est plus large.
  function tolerance(evenement) {
    return evenement.pointerType === "touch" ? 24 : 14;
  }

  function deplacerObjet(dx, dy) {
    const o = selection.objet;
    if (selection.type === "source") {
      o.x += dx;
      o.y += dy;
    } else if (selection.type === "verre") {
      o.cx += dx;
      o.cy += dy;
      calculerSommets(o);
    } else {
      o.x1 += dx;
      o.y1 += dy;
      o.x2 += dx;
      o.y2 += dy;
    }
  }

  function deplacerPoignee(id, p) {
    const o = selection.objet;
    if (id === "direction") {
      o.angle = Math.atan2(p.y - o.y, p.x - o.x);
    } else if (id === "rotation") {
      o.rotation = Math.atan2(p.y - o.cy, p.x - o.cx) + Math.PI / 2;
      calculerSommets(o);
    } else if (id === "a") {
      o.x1 = p.x;
      o.y1 = p.y;
    } else {
      o.x2 = p.x;
      o.y2 = p.y;
    }
  }

  canvas.addEventListener("pointerdown", function (evenement) {
    const p = positionPointeur(evenement);
    const tol = tolerance(evenement);

    // 1) Une poignée de l'objet sélectionné ?
    const poignee = trouverPoignee(p.x, p.y, tol + 2);
    if (poignee) {
      glisse = { poignee: poignee.id, x: p.x, y: p.y };
    } else {
      // 2) Sinon un objet : on le sélectionne et on peut le déplacer
      const trouve = trouverObjet(p.x, p.y, tol);
      selectionner(trouve);
      glisse = trouve ? { poignee: null, x: p.x, y: p.y } : null;
    }

    if (glisse) {
      canvas.setPointerCapture(evenement.pointerId); // on suit le pointeur même hors du canvas
      canvas.style.cursor = "grabbing";
    }
    demanderDessin();
  });

  canvas.addEventListener("pointermove", function (evenement) {
    const p = positionPointeur(evenement);

    if (glisse) {
      if (glisse.poignee) deplacerPoignee(glisse.poignee, p);
      else deplacerObjet(p.x - glisse.x, p.y - glisse.y);
      glisse.x = p.x;
      glisse.y = p.y;
      majPanneau(); // la taille d'un verre, par exemple, peut avoir changé
      demanderDessin();
      return;
    }

    // Sans glisser : le curseur indique ce qu'on peut saisir.
    const tol = tolerance(evenement);
    if (trouverPoignee(p.x, p.y, tol + 2)) canvas.style.cursor = "crosshair";
    else if (trouverObjet(p.x, p.y, tol)) canvas.style.cursor = "grab";
    else canvas.style.cursor = "default";
  });

  function finDuGlissement() {
    glisse = null;
    canvas.style.cursor = "default";
  }
  canvas.addEventListener("pointerup", finDuGlissement);
  canvas.addEventListener("pointercancel", finDuGlissement);

  /* ---------- 9. PANNEAU DE RÉGLAGES ----------
     Les id viennent de index.html. Si l'un manque, la console l'indique. */
  function el(id) {
    const element = document.getElementById(id);
    if (!element) console.error("Élément introuvable dans index.html : #" + id);
    return element;
  }

  const TITRES = {
    source: "Source",
    miroir: "Miroir",
    verre: "Verre",
    reseau: "Réseau de diffraction",
    filtre: "Filtre coloré",
    ecran: "Écran",
  };

  const FORMES = {
    prisme: "Prisme",
    bloc: "Bloc de verre",
    bille: "Bille ou goutte",
    convergente: "Lentille convergente",
    divergente: "Lentille divergente",
  };

  const NOTES = {
    source: "Glisse la poignée pour orienter le faisceau.",
    miroir:
      "Glisse les deux extrémités pour l'allonger ou le tourner. Courbé, il concentre la lumière d'un côté et la disperse de l'autre.",
    verre:
      "Glisse la poignée au-dessus de la pièce pour la tourner. Indice : 1,33 eau, 1,5 verre, 2,4 diamant.",
    reseau:
      "Glisse les extrémités pour l'orienter. Le rayon se sépare en ordres 0, ±1, ±2 (modèle simplifié).",
    filtre:
      "Le filtre laisse passer les couleurs proches de la sienne et absorbe les autres.",
    ecran:
      "L'écran arrête la lumière et affiche ce qu'il reçoit : les couleurs qui se superposent s'additionnent.",
  };

  // Le titre du panneau s'adapte à l'objet : « Lentille convergente », « Semi-miroir »...
  function titreDe(sel) {
    const o = sel.objet;
    if (sel.type === "verre") return FORMES[o.forme];
    if (sel.type === "miroir") {
      if (o.reflexion < 0.99) return "Semi-miroir";
      if (Math.abs(o.courbure) >= 0.005) return "Miroir courbe";
    }
    return TITRES[sel.type];
  }

  function selectionner(sel) {
    selection = sel;
    majPanneau();
    demanderDessin();
  }

  // Affiche le bon groupe de réglages et met les curseurs à jour avec l'objet sélectionné.
  function majPanneau() {
    const panneau = el("panneau");
    if (!selection) {
      panneau.hidden = true;
      return;
    }

    const o = selection.objet;
    const type = selection.type;

    panneau.hidden = false;
    el("panneau-titre").textContent = titreDe(selection);
    el("note-panneau").textContent = NOTES[type];
    el("groupe-source").hidden = type !== "source";
    el("groupe-miroir").hidden = type !== "miroir";
    el("groupe-verre").hidden = type !== "verre";
    el("groupe-reseau").hidden = type !== "reseau";
    el("groupe-filtre").hidden = type !== "filtre";

    if (type === "source") {
      const blanche = o.longueurOnde === null;
      el("reg-blanche").checked = blanche;
      el("ligne-lambda").hidden = blanche;
      if (!blanche) {
        el("reg-lambda").value = o.longueurOnde;
        el("sortie-lambda").textContent = Math.round(o.longueurOnde) + " nm";
      }
    } else if (type === "verre") {
      el("reg-forme").value = o.forme;
      el("reg-taille").value = Math.round(o.rayon);
      el("sortie-taille").textContent = Math.round(o.rayon);
      el("reg-indice").value = o.indiceBase;
      el("sortie-indice").textContent = o.indiceBase.toFixed(2);
      el("reg-dispersion").value = o.dispersion;
      el("sortie-dispersion").textContent = o.dispersion.toFixed(3);
    } else if (type === "reseau") {
      el("reg-traits").value = o.traits;
      el("sortie-traits").textContent = o.traits;
    } else if (type === "miroir") {
      el("reg-courbure").value = o.courbure;
      el("sortie-courbure").textContent = o.courbure.toFixed(2);
      el("reg-reflexion").value = Math.round(o.reflexion * 100);
      el("sortie-reflexion").textContent = Math.round(o.reflexion * 100) + " %";
    } else if (type === "filtre") {
      el("reg-filtre").value = o.lambda;
      el("sortie-filtre").textContent = Math.round(o.lambda) + " nm";
    }
  }

  // Relie un curseur à l'objet sélectionné : action(objet, valeur) est appelée à chaque mouvement.
  function brancher(id, action) {
    el(id).addEventListener("input", function (evenement) {
      if (!selection) return;
      action(selection.objet, Number(evenement.target.value));
      majPanneau();
      demanderDessin();
    });
  }

  brancher("reg-lambda", function (o, v) {
    o.longueurOnde = v;
  });
  brancher("reg-taille", function (o, v) {
    o.rayon = v;
    calculerSommets(o);
  });
  brancher("reg-indice", function (o, v) {
    o.indiceBase = v;
  });
  brancher("reg-dispersion", function (o, v) {
    o.dispersion = v;
  });
  brancher("reg-traits", function (o, v) {
    o.traits = v;
  });
  brancher("reg-courbure", function (o, v) {
    o.courbure = v;
  });
  brancher("reg-reflexion", function (o, v) {
    o.reflexion = v / 100;
  });
  brancher("reg-filtre", function (o, v) {
    o.lambda = v;
  });

  el("reg-forme").addEventListener("change", function (evenement) {
    if (!selection || selection.type !== "verre") return;
    changerForme(selection.objet, evenement.target.value);
    majPanneau();
    demanderDessin();
  });

  el("reg-blanche").addEventListener("input", function (evenement) {
    if (!selection || selection.type !== "source") return;
    selection.objet.longueurOnde = evenement.target.checked
      ? null
      : Number(el("reg-lambda").value);
    majPanneau();
    demanderDessin();
  });

  /* ---------- 10. AJOUTER, SUPPRIMER, RÉINITIALISER ---------- */
  const texteAide = el("aide").textContent;
  let nbAjouts = 0;

  function ajouter(type) {
    const total = Object.keys(LISTES).reduce(function (somme, cle) {
      return somme + LISTES[cle].length;
    }, 0);
    if (
      total >= CONFIG.maxObjets ||
      (type === "source" && scene.sources.length >= CONFIG.maxSources)
    ) {
      el("aide").textContent =
        "Limite atteinte : supprime un objet avant d'en ajouter un autre.";
      return;
    }
    el("aide").textContent = texteAide;

    // Chaque nouvel objet apparaît près du centre, un peu décalé pour ne pas cacher le précédent.
    const decalage = ((nbAjouts++ % 5) - 2) * 28;
    const cx = largeur * 0.5 + decalage;
    const cy = hauteur * 0.5 + decalage;
    const demi = Math.min(largeur, hauteur) * 0.14;
    let objet;

    if (type === "source") {
      objet = creerSource(cx, cy, 0, null);
    } else if (type === "miroir") {
      objet = creerMiroir(cx, cy - demi, cx, cy + demi);
    } else if (type === "reseau") {
      objet = creerReseau(cx, cy - demi, cx, cy + demi, CONFIG.traitsReseau);
    } else if (type === "filtre") {
      objet = creerFiltre(cx, cy - demi, cx, cy + demi, 580); // jaune
    } else if (type === "ecran") {
      objet = creerEcran(cx, cy - demi, cx, cy + demi);
    } else {
      objet = creerVerre("prisme", cx, cy, demi, 0); // on change la forme dans le panneau
    }

    LISTES[type].push(objet);
    selectionner({ type: type, objet: objet });
  }

  function supprimerSelection() {
    if (!selection) return;
    const liste = LISTES[selection.type];
    const position = liste.indexOf(selection.objet);
    if (position >= 0) liste.splice(position, 1);
    selectionner(null);
  }

  document.querySelectorAll("[data-ajout]").forEach(function (bouton) {
    bouton.addEventListener("click", function () {
      ajouter(bouton.dataset.ajout); // lit l'attribut data-ajout du bouton
    });
  });

  el("btn-supprimer").addEventListener("click", supprimerSelection);

  el("btn-reinit").addEventListener("click", function () {
    el("aide").textContent = texteAide;
    creerSceneParDefaut();
    selectionner(null);
  });

  // Clavier : Suppr efface l'objet sélectionné, Échap le désélectionne.
  document.addEventListener("keydown", function (evenement) {
    if (evenement.target.matches("input, textarea, select")) return; // on ne vole pas les touches d'un champ
    if (evenement.key === "Delete" || evenement.key === "Backspace") {
      supprimerSelection();
    } else if (evenement.key === "Escape") {
      selectionner(null);
    }
  });

  /* ---------- 11. DÉMARRAGE ---------- */
  redimensionner();
  creerSceneParDefaut();

  window.addEventListener("resize", function () {
    redimensionner();
    dessiner();
  });

  dessiner();
})();
