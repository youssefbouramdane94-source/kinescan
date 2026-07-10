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
      A.JOINTS[state.joint].points.forEach((sp, i) => set(sp.id, 0.32 + 0.16 * i, 0.25 + 0.24 * i));
    } else {
      Object.entries(DEFAULTS[state.mode]).forEach(([id, [fx, fy]]) => set(id, fx, fy));
    }
    if (state.lms) applyLms();
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
    if (state.mode === 'gonio') return [['p0', 'p1', 'p2']];
    if (state.mode === 'face') {
      return [['oeilD', 'oeilG'], ['epauleD', 'epauleG'], ['hancheD', 'hancheG'], ['genouD', 'genouG'], ['chevilleD', 'chevilleG']];
    }
    return [['oreille', 'epaule', 'hanche', 'genou', 'malleole']];
  }

  function pointLabel(id) {
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

    // fil à plomb
    if (state.mode === 'face' || state.mode === 'profil') {
      const px = state.mode === 'face'
        ? toCv(A.mid(pts.chevilleD, pts.chevilleG)).x
        : toCv(pts.malleole).x;
      ctx.save();
      ctx.setLineDash([7, 6]);
      ctx.strokeStyle = 'rgba(255, 214, 68, 0.95)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, view.h);
      ctx.stroke();
      ctx.restore();
    }

    // segments
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(20, 205, 200, 0.95)';
    segmentsForMode().forEach((chain) => {
      ctx.beginPath();
      chain.forEach((id, i) => {
        const c = toCv(pts[id]);
        i ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y);
      });
      ctx.stroke();
    });

    // arc + valeur d'angle au sommet (goniométrie)
    if (state.mode === 'gonio') {
      const a = A.angleABC(pts.p0, pts.p1, pts.p2);
      const B = toCv(pts.p1), Av = toCv(pts.p0), Cv = toCv(pts.p2);
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
      drawText(A.r1(a) + '°', B.x + 32, B.y - 12, 16);
    }

    // points
    Object.keys(pts).forEach((id) => {
      const c = toCv(pts[id]);
      ctx.beginPath();
      ctx.fillStyle = '#ffffff';
      ctx.arc(c.x, c.y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.fillStyle = '#0e7c7b';
      ctx.arc(c.x, c.y, 5, 0, Math.PI * 2);
      ctx.fill();
      drawText(pointLabel(id), c.x + 12, c.y - 10, 12);
    });
  }

  function drawText(txt, x, y, size) {
    ctx.font = '700 ' + size + 'px system-ui, sans-serif';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.strokeText(txt, x, y);
    ctx.fillStyle = '#17211f';
    ctx.fillText(txt, x, y);
  }

  /* ---------- glisser-déposer ---------- */
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (!state.img) return;
    const r = canvas.getBoundingClientRect();
    const m = { x: e.clientX - r.left, y: e.clientY - r.top };
    let best = null, bd = 28;
    Object.entries(state.pts).forEach(([id, p]) => {
      const c = toCv(p);
      const d = Math.hypot(c.x - m.x, c.y - m.y);
      if (d < bd) { bd = d; best = id; }
    });
    if (best) {
      drag = best;
      canvas.setPointerCapture(e.pointerId);
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const r = canvas.getBoundingClientRect();
    const p = toImg({ x: e.clientX - r.left, y: e.clientY - r.top });
    p.x = Math.max(0, Math.min(state.img.width, p.x));
    p.y = Math.max(0, Math.min(state.img.height, p.y));
    state.pts[drag] = p;
    draw(); renderMetrics();
  });

  ['pointerup', 'pointercancel'].forEach((ev) =>
    canvas.addEventListener(ev, () => { drag = null; }));

  /* ---------- métriques ---------- */
  function metrics() {
    if (!state.img) return [];
    if (state.mode === 'gonio') return A.gonioMetrics(state.joint, state.side, state.pts);
    if (state.mode === 'face') return A.faceMetrics(state.pts);
    return A.profilMetrics(state.pts, state.facing);
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
