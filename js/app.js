/* KinéScan — interface, canvas et interactions (version test : goniométrie) */
(() => {
  const A = KS.angles, P = KS.pose;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  const state = {
    img: null,      // HTMLImageElement
    pts: {},        // id -> {x, y} en pixels image
    joint: 'coude',
    side: 'D',
    lms: null,      // derniers landmarks détectés
  };

  const canvas = $('#cv');
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, ox: 0, oy: 0, w: 0, h: 0, dpr: 1 };

  /* ---------- navigation (adresses #/… : le bouton retour du téléphone fonctionne) ---------- */
  const SCREENS = ['home', 'work', 'patients', 'patient'];

  function showScreen(name) {
    const el = $('#screen-' + name);
    if (!el.hidden) return false;
    SCREENS.forEach((s) => { $('#screen-' + s).hidden = s !== name; });
    window.scrollTo({ top: 0 });
    return true;
  }

  function route() {
    const h = location.hash;
    if (h === '#/mesure') {
      showScreen('work');
      if (state.img) { layout(); draw(); renderMetrics(); }
      KS.patients.renderCtx();
      $('#work-title').focus({ preventScroll: true });
    } else if (h === '#/patients') {
      showScreen('patients');
      KS.patients.renderList();
    } else if (h.startsWith('#/patient/')) {
      showScreen('patient');
      KS.patients.renderDetail(decodeURIComponent(h.slice(10)));
    } else if (showScreen('home') && h && !h.startsWith('#/')) {
      const target = document.getElementById(h.slice(1)); // ancre de l'accueil (#how…)
      if (target) target.scrollIntoView();
    }
  }

  // '' = accueil ; si l'adresse ne change pas, on réaffiche quand même l'écran
  function go(h) {
    if (!h) { history.pushState(null, '', location.pathname + location.search); route(); return; }
    if (location.hash === h) route(); else location.hash = h;
  }
  KS.go = go;
  window.addEventListener('hashchange', route);

  function enterWorkspace(joint) {
    if (joint && A.JOINTS[joint]) {
      selectJoint(joint);
      if (state.img) initPoints();
    }
    go('#/mesure');
  }

  $$('[data-joint]').forEach((b) => b.addEventListener('click', () => enterWorkspace(b.dataset.joint)));
  $('#btn-back').addEventListener('click', () => {
    const p = KS.patients.active;
    go(p ? '#/patient/' + encodeURIComponent(p.id) : '');
  });

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
      layout(); initPoints(); draw(); renderMetrics();
      autoDetect();
    };
    img.onerror = () => toast('Impossible de lire cette image. Essayez une photo JPEG ou PNG.');
    img.src = URL.createObjectURL(f);
    e.target.value = '';
  });

  /* ---------- points ---------- */
  function initPoints() {
    if (!state.img) return;
    const iw = state.img.width, ih = state.img.height;
    state.pts = {};
    A.JOINTS[state.joint].points.forEach((sp, i) => {
      const [fx, fy] = sp.def || [0.32 + 0.16 * i, 0.25 + 0.24 * i];
      state.pts[sp.id] = { x: fx * iw, y: fy * ih };
    });
    if (state.lms) applyLms();
  }

  function applyLms() {
    const l = state.lms, iw = state.img.width, ih = state.img.height;
    A.JOINTS[state.joint].points.forEach((sp) => {
      const m = sp.lm && l[sp.lm[state.side]];
      if (m) state.pts[sp.id] = { x: m.x * iw, y: m.y * ih };
    });
  }

  async function autoDetect() {
    if (!state.img) { toast('Ajoutez d’abord une photo'); return; }
    if (P.status !== 'prêt') { toast('Détection indisponible : placez les points à la main'); return; }
    toast('Détection en cours…');
    const lms = await P.detect(state.img);
    if (!lms) { toast('Aucune personne détectée : placez les points à la main'); return; }
    state.lms = lms;
    applyLms();
    draw(); renderMetrics();
    toast('Points proposés : vérifiez-les sur les repères osseux');
  }
  $('#btn-detect').addEventListener('click', autoDetect);

  /* ---------- contrôles ---------- */
  function selectJoint(key) {
    state.joint = key;
    $('#sel-joint').value = key;
    $('#gonio-note').textContent = A.JOINTS[key].note;
    $('#seg-side').style.visibility = key === 'libre' ? 'hidden' : 'visible';
  }

  $('#sel-joint').addEventListener('change', (e) => {
    selectJoint(e.target.value);
    if (state.img) { initPoints(); draw(); renderMetrics(); }
  });

  // état « sélectionné » visible (couleur) ET annoncé aux lecteurs d'écran (aria-pressed)
  function setPressed(btn, on) {
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', String(on));
  }

  $$('#seg-side button').forEach((b) =>
    b.addEventListener('click', () => {
      state.side = b.dataset.side;
      $$('#seg-side button').forEach((x) => setPressed(x, x === b));
      if (state.img) { initPoints(); draw(); renderMetrics(); }
    }));

  /* ---------- canvas ---------- */
  function layout() {
    if (!state.img) return;
    const w = $('#cv-wrap').clientWidth;
    const maxH = Math.round(window.innerHeight * 0.62);
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

  const segments = () => (A.JOINTS[state.joint].parallel ? [['p0', 'p1'], ['p2', 'p3']] : [['p0', 'p1', 'p2']]);

  function pointLabel(id) {
    const sp = A.JOINTS[state.joint].points.find((s) => s.id === id);
    return sp ? sp.label : id;
  }

  function draw() {
    if (!state.img) return;
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.clearRect(0, 0, view.w, view.h);
    ctx.drawImage(state.img, view.ox, view.oy, state.img.width * view.scale, state.img.height * view.scale);
    const pts = state.pts;

    // segments
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(20, 205, 200, 0.85)';
    segments().forEach((chain) => {
      ctx.beginPath();
      chain.forEach((id, i) => {
        const c = toCv(pts[id]);
        i ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y);
      });
      ctx.stroke();
    });

    // arc + valeur d'angle au sommet
    const [P0, P1, P2] = A.gonioTriplet(state.joint, pts);
    const a = A.angleABC(P0, P1, P2);
    const B = toCv(P1), Av = toCv(P0), Cv = toCv(P2);
    if (A.JOINTS[state.joint].parallel) {
      // branche mobile virtuelle (pointillés), parallèle au segment distal
      ctx.save();
      ctx.setLineDash([6, 5]);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(255, 214, 68, 0.95)';
      ctx.beginPath(); ctx.moveTo(B.x, B.y); ctx.lineTo(Cv.x, Cv.y); ctx.stroke();
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
    const dir = bisector(B, Av, Cv);

    // points : petits anneaux transparents (la zone de prise au doigt reste grande)
    Object.keys(pts).forEach((id) => {
      const c = toCv(pts[id]);
      const dragging = drag && id === drag.id;
      const keyed = !drag && document.activeElement === canvas && id === keySel;
      drawRing(c, dragging || keyed ? '#ffd644' : '#14e0d6', dragging || keyed ? 9 : 6);
      if (dragging) return;
      if (id === 'p1') drawText(pointLabel(id), c.x - dir.x * 30, c.y - dir.y * 30 + 4, 11, 'center');
      else drawText(pointLabel(id), c.x + 9, c.y - 7, 11);
    });

    // valeur d'angle dans l'ouverture de l'angle, par-dessus les étiquettes
    drawPill(A.degFr(a), B.x + dir.x * 58, B.y + dir.y * 58, 16);

    if (drag) drawLoupe(drag.id);
  }

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
    ctx.font = '600 ' + size + 'px Geist, system-ui, sans-serif';
    ctx.textAlign = align;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.strokeText(txt, x, y);
    ctx.fillStyle = '#15201e';
    ctx.fillText(txt, x, y);
    ctx.restore();
  }

  // étiquette sur fond sombre, centrée sur (x, y) et gardée dans le canvas
  function drawPill(txt, x, y, size) {
    ctx.save();
    ctx.font = '600 ' + size + 'px "Geist Mono", ui-monospace, monospace';
    const w = ctx.measureText(txt).width + 16, h = size + 12;
    const px = Math.max(2, Math.min(view.w - w - 2, x - w / 2));
    const py = Math.max(2, Math.min(view.h - h - 2, y - h / 2));
    ctx.fillStyle = 'rgba(16, 23, 22, 0.88)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(px, py, w, h, 7); else ctx.rect(px, py, w, h);
    ctx.fill();
    ctx.fillStyle = '#f3d27a';
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
    const x = ua.x + uc.x, y = ua.y + uc.y, L = Math.hypot(x, y);
    if (L < 0.2) return { x: -ua.y, y: ua.x };
    return { x: x / L, y: y / L };
  }

  /* ---------- loupe : zone agrandie autour du point déplacé ---------- */
  const LOUPE_R = 64, LOUPE_ZOOM = 3.5, LOUPE_MARGIN = 10;

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

  /* ---------- alternative clavier au glisser-déposer ----------
     1 / 2 / 3 (4) : choisir un point ; flèches : le déplacer d'1 px écran (Maj : 10 px). */
  let keySel = 'p1';
  canvas.tabIndex = 0;
  canvas.addEventListener('keydown', (e) => {
    if (!state.img) return;
    const ids = Object.keys(state.pts);
    const n = Number(e.key);
    if (n >= 1 && n <= ids.length) { keySel = ids[n - 1]; draw(); toast('Point sélectionné : ' + pointLabel(keySel)); e.preventDefault(); return; }
    const step = (e.shiftKey ? 10 : 1) / view.scale;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d || !state.pts[keySel]) return;
    e.preventDefault();
    const p = state.pts[keySel];
    state.pts[keySel] = {
      x: Math.max(0, Math.min(state.img.width, p.x + d[0])),
      y: Math.max(0, Math.min(state.img.height, p.y + d[1])),
    };
    draw(); renderMetrics();
  });
  canvas.addEventListener('focus', () => draw());
  canvas.addEventListener('blur', () => draw());

  /* ---------- métriques ---------- */
  const metrics = () => (state.img ? A.gonioMetrics(state.joint, state.side, state.pts) : []);

  // le statut est aussi écrit en toutes lettres : la couleur seule ne suffit pas (accessibilité)
  const STATUS_TEXT = { ok: '✓ Dans la norme', warn: '⚠ À vérifier' };

  function renderMetrics() {
    $('#metrics').innerHTML = metrics().map((m) =>
      '<div class="metric ' + (m.status || '') + '">' +
      '<div class="m-label">' + m.label + '</div>' +
      '<div class="m-value">' + m.value + '</div>' +
      (STATUS_TEXT[m.status] ? '<div class="m-status">' + STATUS_TEXT[m.status] + '</div>' : '') +
      (m.detail ? '<div class="m-detail">' + m.detail + '</div>' : '') +
      (m.norm ? '<div class="m-norm">' + m.norm + '</div>' : '') +
      '</div>').join('');
  }

  /* ---------- export ---------- */
  $('#btn-export').addEventListener('click', () => {
    if (!state.img) { toast('Ajoutez d’abord une photo'); return; }
    KS.report.save(canvas, metrics(), 'Goniométrie — ' + A.JOINTS[state.joint].label);
  });

  /* ---------- lien avec les dossiers patients ---------- */
  KS.work = {
    enter: () => enterWorkspace(null),
    reset() {
      state.img = null; state.lms = null; state.pts = {};
      canvas.hidden = true;
      $('#empty').hidden = false;
      $('#metrics').innerHTML = '';
    },
    snapshot() {
      if (!state.img) return null;
      return {
        joint: state.joint,
        jointLabel: A.JOINTS[state.joint].label,
        side: state.joint === 'libre' ? '' : state.side,
        items: metrics().map((m) => ({ label: m.label, value: String(m.value), norm: m.norm || '' })),
        canvas,
      };
    },
  };

  /* ---------- divers ---------- */
  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    $('#sr-status').textContent = msg; // zone toujours présente : annoncée par les lecteurs d'écran
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
  }
  KS.toast = toast;

  let resizeRaf = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => { if (state.img) { layout(); draw(); } });
  });

  /* ---------- init ---------- */
  Object.entries(A.JOINTS).forEach(([k, j]) => {
    const o = document.createElement('option');
    o.value = k;
    o.textContent = j.label;
    $('#sel-joint').append(o);
  });
  $('#work-title').tabIndex = -1;
  selectJoint(state.joint);

  P.onStatus((s) => {
    const el = $('#ai-pill');
    el.dataset.s = s;
    el.querySelector('span').textContent = 'IA : ' + s;
    el.title = 'Détection automatique des repères : ' + s;
  });
  P.init();
  KS.feedback.init();
  KS.patients.init();
  KS.install.init();
  route();
})();
