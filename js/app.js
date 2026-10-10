/* KinéScan — interface, canvas et interactions */
(() => {
  const A = KS.angles, P = KS.pose;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  const state = {
    mode: null,        // 'gonio' | 'face' | 'profil'
    img: null,         // HTMLImageElement
    pts: {},           // id -> {x, y} en pixels image
    joint: 'coude',
    side: 'D',
    facing: 'gauche',  // direction du regard en vue de profil
    lms: null,         // derniers landmarks détectés
    ref: { vertical: false, heightCm: null }, // verticale repérée sur la photo + taille du sujet
  };

  const canvas = $('#cv');
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, ox: 0, oy: 0, w: 0, h: 0, dpr: 1 };

  const MODE_TITLES = {
    gonio: 'Goniométrie',
    face: 'Morphostatique — face',
    profil: 'Morphostatique — profil',
  };

  const FACE_LM = { oeilD: 5, oeilG: 2, epauleD: 12, epauleG: 11, hancheD: 24, hancheG: 23, genouD: 26, genouG: 25, chevilleD: 28, chevilleG: 27 };
  const FACE_LABELS = { oeilD: 'Œil D', oeilG: 'Œil G', epauleD: 'Épaule D', epauleG: 'Épaule G', hancheD: 'Hanche D', hancheG: 'Hanche G', genouD: 'Genou D', genouG: 'Genou G', chevilleD: 'Chev. D', chevilleG: 'Chev. G' };
  const PROFIL_LABELS = { oreille: 'Oreille', epaule: 'Épaule', hanche: 'Hanche', genou: 'Genou', malleole: 'Malléole' };
  const REF_LABELS = { vH: 'Verticale (haut)', vB: 'Verticale (bas)', crane: 'Haut du crâne', sol: 'Sol (sous le talon)' };

  const DEFAULTS = {
    face: { oeilD: [0.44, 0.10], oeilG: [0.56, 0.10], epauleD: [0.35, 0.24], epauleG: [0.65, 0.24], hancheD: [0.40, 0.50], hancheG: [0.60, 0.50], genouD: [0.42, 0.70], genouG: [0.58, 0.70], chevilleD: [0.43, 0.90], chevilleG: [0.57, 0.90] },
    profil: { oreille: [0.5, 0.10], epaule: [0.5, 0.25], hanche: [0.5, 0.52], genou: [0.5, 0.72], malleole: [0.5, 0.92] },
  };

  /* ---------- navigation ---------- */
  $$('[data-mode]').forEach((b) =>
    b.addEventListener('click', () => { state.mode = b.dataset.mode; enterWorkspace(); }));

  $('#btn-back').addEventListener('click', () => {
    $('#screen-work').hidden = true;
    $('#screen-home').hidden = false;
  });

  function enterWorkspace() {
    $('#screen-home').hidden = true;
    $('#screen-work').hidden = false;
    $('#work-title').textContent = MODE_TITLES[state.mode];
    $('#bar-gonio').hidden = state.mode !== 'gonio';
    $('#bar-profil').hidden = state.mode !== 'profil';
    $('#bar-ref').hidden = state.mode === 'gonio';
    syncRefUI();
    if (state.img) {
      initPoints();
      layout(); draw(); renderMetrics();
    }
  }

  /* ---------- photo ---------- */
  const openFile = () => $('#file').click();
  $('#btn-photo').addEventListener('click', openFile);
  $('#btn-photo-empty').addEventListener('click', openFile);

  $('#file').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const img = new Image();
    img.onload = () => {
      state.img = img;
      state.lms = null;
      $('#empty').hidden = true;
      canvas.hidden = false;
      initPoints();
      layout(); draw(); renderMetrics();
      autoDetect();
    };
    img.src = URL.createObjectURL(f);
    e.target.value = '';
  });

  /* ---------- points ---------- */
  function initPoints() {
    if (!state.img) return;
    const iw = state.img.width, ih = state.img.height;
    state.pts = {};
    const set = (id, fx, fy) => { state.pts[id] = { x: fx * iw, y: fy * ih }; };
    if (state.mode === 'gonio') {
      A.JOINTS[state.joint].points.forEach((sp, i) => set(sp.id, ...(sp.def || [0.32 + 0.16 * i, 0.25 + 0.24 * i])));
    } else {
      Object.entries(DEFAULTS[state.mode]).forEach(([id, [fx, fy]]) => set(id, fx, fy));
    }
    if (state.lms) applyLms();
    if (state.mode !== 'gonio') {
      if (state.ref.vertical) addVerticalPoints();
      if (state.ref.heightCm) addHeightPoints();
    }
  }

  /* ---------- référence morphostatique ----------
     Fil à plomb virtuel par la malléole (profil) / entre les chevilles (face).
     « Verticale » : 2 points posés sur n'importe quoi de vertical dans la photo
     (fil, bord de porte, angle de mur) pour redresser une photo penchée.
     « Taille » : haut du crâne + sol → échelle en cm. */
  const clampX = (x) => Math.max(0, Math.min(state.img.width, x));
  const clampY = (y) => Math.max(0, Math.min(state.img.height, y));
  const anchorPoint = () => (state.mode === 'profil'
    ? state.pts.malleole
    : A.mid(state.pts.chevilleD, state.pts.chevilleG));
  const headPoint = () => (state.mode === 'profil'
    ? state.pts.oreille
    : A.mid(state.pts.oeilD, state.pts.oeilG));

  function addVerticalPoints() {
    const x = clampX(anchorPoint().x + 0.08 * state.img.width);
    state.pts.vH = { x, y: 0.04 * state.img.height };
    state.pts.vB = { x, y: 0.97 * state.img.height };
  }

  function addHeightPoints() {
    const ih = state.img.height, head = headPoint(), foot = anchorPoint();
    state.pts.crane = { x: head.x, y: clampY(head.y - 0.09 * ih) };
    // sol décalé vers le talon pour ne pas masquer le point de la malléole
    const back = state.mode === 'profil' ? (state.facing === 'gauche' ? 1 : -1) * 0.05 * state.img.width : 0;
    state.pts.sol = { x: clampX(foot.x + back), y: clampY(foot.y + 0.045 * ih) };
  }

  function refOpts() {
    const p = state.pts;
    if (state.mode === 'gonio') return null;
    return {
      vertical: state.ref.vertical && p.vH && p.vB ? { top: p.vH, bottom: p.vB } : null,
      height: state.ref.heightCm && p.crane && p.sol ? { top: p.crane, bottom: p.sol, cm: state.ref.heightCm } : null,
    };
  }

  function applyLms() {
    const l = state.lms, iw = state.img.width, ih = state.img.height;
    const put = (id, idx) => {
      const m = l[idx];
      if (m) state.pts[id] = { x: m.x * iw, y: m.y * ih };
    };
    if (state.mode === 'gonio') {
      A.JOINTS[state.joint].points.forEach((sp) => { if (sp.lm) put(sp.id, sp.lm[state.side]); });
    } else if (state.mode === 'face') {
      Object.entries(FACE_LM).forEach(([id, idx]) => put(id, idx));
    } else {
      const right = [8, 12, 24, 26, 28], left = [7, 11, 23, 25, 27];
      const vis = (arr) => arr.reduce((s, i) => s + ((l[i] && l[i].visibility) || 0), 0);
      const side = vis(right) >= vis(left) ? right : left;
      ['oreille', 'epaule', 'hanche', 'genou', 'malleole'].forEach((id, i) => put(id, side[i]));
      if (l[0] && l[side[0]]) {
        state.facing = l[0].x < l[side[0]].x ? 'gauche' : 'droite';
        syncFacingUI();
      }
    }
  }

  async function autoDetect() {
    if (!state.img) { toast('Ajoutez d’abord une photo'); return; }
    if (P.status !== 'prêt') {
      toast('Modèle IA non disponible — placez les points manuellement');
      return;
    }
    toast('Détection en cours…');
    const lms = await P.detect(state.img);
    if (!lms) { toast('Aucune personne détectée — ajustez les points manuellement'); return; }
    state.lms = lms;
    applyLms();
    draw(); renderMetrics();
    toast('Points placés automatiquement — ajustez-les si besoin');
  }
  $('#btn-detect').addEventListener('click', autoDetect);

  /* ---------- contrôles goniométrie / profil ---------- */
  $('#sel-joint').addEventListener('change', (e) => {
    state.joint = e.target.value;
    $('#gonio-note').textContent = A.JOINTS[state.joint].note;
    $('#seg-side').style.visibility = state.joint === 'libre' ? 'hidden' : 'visible';
    if (state.img) { initPoints(); draw(); renderMetrics(); }
  });

  $$('#seg-side button').forEach((b) =>
    b.addEventListener('click', () => {
      state.side = b.dataset.side;
      $$('#seg-side button').forEach((x) => x.classList.toggle('on', x === b));
      if (state.img) { initPoints(); draw(); renderMetrics(); }
    }));

  $$('#seg-facing button').forEach((b) =>
    b.addEventListener('click', () => {
      state.facing = b.dataset.facing;
      syncFacingUI();
      if (state.img) { draw(); renderMetrics(); }
    }));

  function syncFacingUI() {
    $$('#seg-facing button').forEach((x) => x.classList.toggle('on', x.dataset.facing === state.facing));
  }

  /* ---------- référence morphostatique : interface ---------- */
  function syncRefUI() {
    $('#chk-vert').checked = state.ref.vertical;
    const where = state.mode === 'face' ? 'entre les chevilles' : 'par la malléole';
    $('#ref-hint').textContent = (state.ref.vertical
      ? 'Posez « Verticale (haut) » et « Verticale (bas) » sur quelque chose de vertical (fil, bord de porte, angle de mur) : la photo est redressée. '
      : 'Fil à plomb virtuel ' + where + ', vertical par rapport à la photo : activez le niveau de l’appareil photo pour qu’elle soit droite. ')
      + (state.ref.heightCm
        ? 'Placez « Haut du crâne » et « Sol (sous le talon) » : résultats en cm.'
        : 'Indiquez la taille du sujet pour avoir des cm (sinon %).');
  }

  function refChanged() {
    syncRefUI();
    if (state.img) { draw(); renderMetrics(); }
  }

  $('#chk-vert').addEventListener('change', (e) => {
    state.ref.vertical = e.target.checked;
    if (state.img && state.mode !== 'gonio') {
      if (state.ref.vertical) addVerticalPoints();
      else { delete state.pts.vH; delete state.pts.vB; }
    }
    refChanged();
  });

  $('#in-taille').addEventListener('input', (e) => {
    const v = parseFloat(String(e.target.value).replace(',', '.'));
    state.ref.heightCm = v > 0 ? v : null;
    if (state.img && state.mode !== 'gonio') {
      if (state.ref.heightCm && !state.pts.crane) addHeightPoints();
      if (!state.ref.heightCm) { delete state.pts.crane; delete state.pts.sol; }
    }
    refChanged();
  });
  syncRefUI();

  /* ---------- canvas ---------- */
  function layout() {
    if (!state.img) return;
    const w = $('#cv-wrap').clientWidth;
    const maxH = Math.round(window.innerHeight * 0.6);
    const h = Math.min(maxH, Math.round((w * state.img.height) / state.img.width));
    view.dpr = window.devicePixelRatio || 1;
    view.w = w; view.h = h;
    canvas.width = Math.round(w * view.dpr);
    canvas.height = Math.round(h * view.dpr);
    canvas.style.height = h + 'px';
    view.scale = Math.min(w / state.img.width, h / state.img.height);
    view.ox = (w - state.img.width * view.scale) / 2;
    view.oy = (h - state.img.height * view.scale) / 2;
  }

  const toCv = (p) => ({ x: p.x * view.scale + view.ox, y: p.y * view.scale + view.oy });
  const toImg = (p) => ({ x: (p.x - view.ox) / view.scale, y: (p.y - view.oy) / view.scale });

  function segmentsForMode() {
    if (state.mode === 'gonio') {
      return A.JOINTS[state.joint].parallel ? [['p0', 'p1'], ['p2', 'p3']] : [['p0', 'p1', 'p2']];
    }
    if (state.mode === 'face') {
      return [['oeilD', 'oeilG'], ['epauleD', 'epauleG'], ['hancheD', 'hancheG'], ['genouD', 'genouG'], ['chevilleD', 'chevilleG']];
    }
    return [['oreille', 'epaule', 'hanche', 'genou', 'malleole']];
  }

  function pointLabel(id) {
    if (REF_LABELS[id]) return REF_LABELS[id];
    if (state.mode === 'gonio') {
      const sp = A.JOINTS[state.joint].points.find((s) => s.id === id);
      return sp ? sp.label : id;
    }
    return state.mode === 'face' ? FACE_LABELS[id] : PROFIL_LABELS[id];
  }

  function draw() {
    if (!state.img) return;
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.clearRect(0, 0, view.w, view.h);
    ctx.drawImage(state.img, view.ox, view.oy, state.img.width * view.scale, state.img.height * view.scale);

    const pts = state.pts;

    if (state.mode === 'face' || state.mode === 'profil') drawPlumb(pts);

    // segments
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(20, 205, 200, 0.8)';
    segmentsForMode().forEach((chain) => {
      ctx.beginPath();
      chain.forEach((id, i) => {
        const c = toCv(pts[id]);
        i ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y);
      });
      ctx.stroke();
    });

    // arc + valeur d'angle au sommet (goniométrie)
    let angleLabel = null;
    if (state.mode === 'gonio') {
      const [P0, P1, P2] = A.gonioTriplet(state.joint, pts);
      const a = A.angleABC(P0, P1, P2);
      const B = toCv(P1), Av = toCv(P0), Cv = toCv(P2);
      if (A.JOINTS[state.joint].parallel) {
        // branche mobile virtuelle (pointillés) parallèle au 5e métatarsien
        ctx.save();
        ctx.setLineDash([6, 5]);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(255, 214, 68, 0.95)';
        ctx.beginPath();
        ctx.moveTo(B.x, B.y);
        ctx.lineTo(Cv.x, Cv.y);
        ctx.stroke();
        ctx.restore();
      }
      const a1 = Math.atan2(Av.y - B.y, Av.x - B.x);
      const a2 = Math.atan2(Cv.y - B.y, Cv.x - B.x);
      let diff = a2 - a1;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255, 214, 68, 0.95)';
      ctx.lineWidth = 2;
      ctx.arc(B.x, B.y, 26, a1, a2, diff < 0);
      ctx.stroke();
      angleLabel = { text: A.r1(a) + '°', B, dir: bisector(B, Av, Cv) };
    }

    // points : petits anneaux transparents pour laisser voir le repère dessous
    // (la zone de prise au doigt reste grande, voir HIT_RADIUS)
    Object.keys(pts).forEach((id) => {
      const c = toCv(pts[id]);
      const dragging = drag && id === drag.id;
      drawRing(c, dragging ? '#ffd644' : pointColor(id), dragging ? 9 : POINT_R);
      if (dragging) return;
      // le nom du sommet passe du côté opposé à la valeur d'angle
      if (angleLabel && id === 'p1') {
        const d = angleLabel.dir;
        drawText(pointLabel(id), c.x - d.x * 30, c.y - d.y * 30 + 4, 11, 'center');
      } else {
        drawText(pointLabel(id), c.x + 9, c.y - 7, 11);
      }
    });

    // valeur d'angle dans l'ouverture de l'angle, par-dessus les étiquettes
    if (angleLabel) {
      const { B, dir, text } = angleLabel;
      drawPill(text, B.x + dir.x * 58, B.y + dir.y * 58, 16);
    }

    if (drag) drawLoupe(drag.id);
  }

  // Fil à plomb virtuel (pointillés jaunes) par la malléole / entre les chevilles,
  // parallèle à la verticale repérée si elle existe (trait bleu fin), avec les
  // perpendiculaires vers chaque repère mesuré.
  function drawPlumb(pts) {
    const O = toCv(anchorPoint());
    let v = { x: 0, y: 1 };
    ctx.save();
    if (pts.vH && pts.vB) {
      const T = toCv(pts.vH), B = toCv(pts.vB);
      const L = Math.hypot(B.x - T.x, B.y - T.y) || 1;
      v = { x: (B.x - T.x) / L, y: (B.y - T.y) / L };
      if (v.y < 0) v = { x: -v.x, y: -v.y };
      ctx.strokeStyle = 'rgba(80, 200, 255, 0.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(T.x, T.y);
      ctx.lineTo(B.x, B.y);
      ctx.stroke();
    }
    const far = view.w + view.h;
    ctx.setLineDash([7, 6]);
    ctx.strokeStyle = 'rgba(255, 214, 68, 0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(O.x - v.x * far, O.y - v.y * far);
    ctx.lineTo(O.x + v.x * far, O.y + v.y * far);
    ctx.stroke();

    const targets = state.mode === 'profil'
      ? ['oreille', 'epaule', 'hanche', 'genou'].map((id) => pts[id])
      : [['oeilD', 'oeilG'], ['epauleD', 'epauleG'], ['hancheD', 'hancheG']].map(([a, b]) => A.mid(pts[a], pts[b]));
    ctx.setLineDash([3, 4]);
    ctx.lineWidth = 1.2;
    targets.forEach((pt) => {
      const P = toCv(pt);
      const k = (P.x - O.x) * v.x + (P.y - O.y) * v.y;
      ctx.beginPath();
      ctx.moveTo(P.x, P.y);
      ctx.lineTo(O.x + v.x * k, O.y + v.y * k);
      ctx.stroke();
    });
    ctx.restore();
  }

  /* ---------- loupe : zone agrandie autour du point déplacé ---------- */
  const LOUPE_R = 64;      // rayon en px écran
  const LOUPE_ZOOM = 3.5;  // grossissement par rapport à l'affichage
  const LOUPE_MARGIN = 10;

  function drawLoupe(id) {
    const c = toCv(state.pts[id]);
    const d = 2 * LOUPE_R + 2 * LOUPE_MARGIN;
    // coin haut-gauche, sauf si le point s'y trouve → coin haut-droit
    const left = !(c.x < d + 20 && c.y < d + 20);
    const lx = left ? LOUPE_MARGIN + LOUPE_R : view.w - LOUPE_MARGIN - LOUPE_R;
    const ly = LOUPE_MARGIN + LOUPE_R;

    ctx.save();
    ctx.beginPath();
    ctx.arc(lx, ly, LOUPE_R, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#000';
    ctx.fillRect(lx - LOUPE_R, ly - LOUPE_R, 2 * LOUPE_R, 2 * LOUPE_R);
    ctx.translate(lx, ly);
    ctx.scale(LOUPE_ZOOM, LOUPE_ZOOM);
    ctx.translate(-c.x, -c.y);
    ctx.drawImage(state.img, view.ox, view.oy, state.img.width * view.scale, state.img.height * view.scale);
    ctx.restore();

    // réticule avec un vide au centre pour voir le repère exact
    const gap = 6, arm = 22;
    ctx.save();
    ctx.strokeStyle = '#ffd644';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(lx - gap - arm, ly); ctx.lineTo(lx - gap, ly);
    ctx.moveTo(lx + gap, ly); ctx.lineTo(lx + gap + arm, ly);
    ctx.moveTo(lx, ly - gap - arm); ctx.lineTo(lx, ly - gap);
    ctx.moveTo(lx, ly + gap); ctx.lineTo(lx, ly + gap + arm);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(lx, ly, 2, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd644';
    ctx.fill();
    ctx.beginPath();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.arc(lx, ly, LOUPE_R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    drawText(pointLabel(id), lx - LOUPE_R + 4, ly + LOUPE_R + 16, 13);
  }

  const POINT_R = 6;
  const pointColor = (id) => (id === 'vH' || id === 'vB' ? '#50c8ff'
    : id === 'crane' || id === 'sol' ? '#5cff7a' : '#14e0d6');

  // anneau coloré cerné de sombre (lisible sur fond clair ou foncé) + point central fin
  function drawRing(c, color, r) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(c.x, c.y, 1.4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  function drawText(txt, x, y, size, align = 'left') {
    ctx.save();
    ctx.font = '700 ' + size + 'px system-ui, sans-serif';
    ctx.textAlign = align;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.strokeText(txt, x, y);
    ctx.fillStyle = '#17211f';
    ctx.fillText(txt, x, y);
    ctx.restore();
  }

  // étiquette sur fond sombre, centrée sur (x, y) et gardée dans le canvas
  function drawPill(txt, x, y, size) {
    ctx.save();
    ctx.font = '800 ' + size + 'px system-ui, sans-serif';
    const w = ctx.measureText(txt).width + 14, h = size + 10;
    const px = Math.max(2, Math.min(view.w - w - 2, x - w / 2));
    const py = Math.max(2, Math.min(view.h - h - 2, y - h / 2));
    ctx.fillStyle = 'rgba(23, 33, 31, 0.88)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(px, py, w, h, h / 2); else ctx.rect(px, py, w, h);
    ctx.fill();
    ctx.fillStyle = '#ffd644';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, px + w / 2, py + h / 2 + 1);
    ctx.restore();
  }

  // direction unitaire de la bissectrice de l'angle A-B-C (perpendiculaire si angle plat)
  function bisector(B, Av, Cv) {
    const unit = (P) => {
      const dx = P.x - B.x, dy = P.y - B.y, L = Math.hypot(dx, dy) || 1;
      return { x: dx / L, y: dy / L };
    };
    const ua = unit(Av), uc = unit(Cv);
    let x = ua.x + uc.x, y = ua.y + uc.y;
    const L = Math.hypot(x, y);
    if (L < 0.2) return { x: -ua.y, y: ua.x };
    return { x: x / L, y: y / L };
  }

  /* ---------- glisser-déposer ----------
     Déplacement relatif : le point suit le mouvement du doigt sans sauter
     dessous, on peut donc le saisir à côté et garder le repère visible. */
  const HIT_RADIUS = { mouse: 28, touch: 40 };
  let drag = null; // { id, startFinger, startPoint } en px écran

  canvas.addEventListener('pointerdown', (e) => {
    if (!state.img) return;
    const r = canvas.getBoundingClientRect();
    const m = { x: e.clientX - r.left, y: e.clientY - r.top };
    let best = null, bd = e.pointerType === 'mouse' ? HIT_RADIUS.mouse : HIT_RADIUS.touch;
    Object.entries(state.pts).forEach(([id, p]) => {
      const c = toCv(p);
      const d = Math.hypot(c.x - m.x, c.y - m.y);
      if (d < bd) { bd = d; best = id; }
    });
    if (!best) return;
    drag = { id: best, startFinger: m, startPoint: toCv(state.pts[best]) };
    draw();
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const r = canvas.getBoundingClientRect();
    const p = toImg({
      x: drag.startPoint.x + (e.clientX - r.left - drag.startFinger.x),
      y: drag.startPoint.y + (e.clientY - r.top - drag.startFinger.y),
    });
    p.x = Math.max(0, Math.min(state.img.width, p.x));
    p.y = Math.max(0, Math.min(state.img.height, p.y));
    state.pts[drag.id] = p;
    draw(); renderMetrics();
  });

  ['pointerup', 'pointercancel'].forEach((ev) =>
    canvas.addEventListener(ev, () => {
      if (!drag) return;
      drag = null;
      draw();
    }));

  /* ---------- métriques ---------- */
  function metrics() {
    if (!state.img) return [];
    if (state.mode === 'gonio') return A.gonioMetrics(state.joint, state.side, state.pts);
    if (state.mode === 'face') return A.faceMetrics(state.pts, refOpts());
    return A.profilMetrics(state.pts, state.facing, refOpts());
  }

  function renderMetrics() {
    const ms = metrics();
    $('#metrics').innerHTML = ms.map((m) =>
      '<div class="metric ' + (m.status || '') + '">' +
      '<div class="m-label">' + m.label + '</div>' +
      '<div class="m-value">' + m.value + '</div>' +
      (m.detail ? '<div class="m-detail">' + m.detail + '</div>' : '') +
      (m.norm ? '<div class="m-norm">' + m.norm + '</div>' : '') +
      '</div>').join('');
  }

  /* ---------- export ---------- */
  $('#btn-export').addEventListener('click', () => {
    if (!state.img) { toast('Ajoutez d’abord une photo'); return; }
    KS.report.save(canvas, metrics(), MODE_TITLES[state.mode]);
  });

  /* ---------- divers ---------- */
  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  window.addEventListener('resize', () => {
    if (state.img) { layout(); draw(); }
  });

  /* ---------- init ---------- */
  Object.entries(A.JOINTS).forEach(([k, j]) => {
    const o = document.createElement('option');
    o.value = k;
    o.textContent = j.label;
    $('#sel-joint').append(o);
  });
  $('#gonio-note').textContent = A.JOINTS[state.joint].note;

  P.onStatus((s) => {
    const el = $('#ai-pill');
    el.textContent = 'IA : ' + s;
    el.dataset.s = s;
  });
  P.init();
})();
