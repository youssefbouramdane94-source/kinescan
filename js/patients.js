/* KinéScan — dossiers patients : liste, fiche (diagnostics), suivi des mesures, sauvegarde.
   Tout est stocké sur l'appareil (voir db.js). */
window.KS = window.KS || {};
KS.patients = (() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const D = KS.db;
  const toast = (m) => KS.toast && KS.toast(m);
  const go = (h) => KS.go(h);

  let active = null;   // patient pour lequel on enregistre les mesures
  let current = null;  // patient affiché dans la fiche
  let afterCreate = null; // action à faire après la création d'un patient (ex. enregistrer la mesure)

  // éléments créés sans innerHTML : les saisies ne sont jamais interprétées comme du HTML
  function el(tag, props = {}, ...kids) {
    const n = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    });
    kids.flat().forEach((c) => c != null && n.append(c));
    return n;
  }
  const SVGNS = 'http://www.w3.org/2000/svg';
  function sv(tag, attrs = {}, text) {
    const n = document.createElementNS(SVGNS, tag);
    Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
    if (text != null) n.textContent = text;
    return n;
  }

  const fmtDate = (iso) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const fmtShort = (iso) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  const numOf = (v) => { const m = /-?\d+(?:[.,]\d+)?/.exec(String(v)); return m ? parseFloat(m[0].replace(',', '.')) : null; };
  const signed = (v) => (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(Math.round(v * 10) / 10).toLocaleString('fr-FR');
  const plural = (n, w) => n + ' ' + w + (n > 1 ? 's' : '');
  const fail = (e) => toast('Erreur : ' + (e && e.message ? e.message : 'stockage indisponible'));

  /* ---------- liste ---------- */
  async function renderList() {
    let pts;
    try { pts = await D.listPatients(); } catch (e) { fail(e); pts = []; }
    pts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const q = $('#pt-search').value.trim().toLowerCase();
    const shown = q ? pts.filter((p) => [p.name, p.dxMed, p.dxKine, p.sport].join(' ').toLowerCase().includes(q)) : pts;
    $('#pt-list').replaceChildren(...shown.map(card));
    $('#pt-empty').hidden = pts.length > 0;
    $('#pt-search-wrap').hidden = pts.length === 0;
    $('#pt-noresult').hidden = !(pts.length && !shown.length);
    $('#pt-count').textContent = pts.length ? plural(pts.length, 'patient') : '';
  }

  const card = (p) => el('li', {},
    el('a', { class: 'pt-card', href: '#/patient/' + encodeURIComponent(p.id) },
      el('span', { class: 'pt-name', text: p.name }),
      el('span', { class: 'pt-dx', text: p.dxMed || p.dxKine || 'Diagnostic non renseigné' }),
      el('span', { class: 'pt-meta', text: [p.age != null ? p.age + ' ans' : '', p.sport].filter(Boolean).join(' · ') }),
      el('span', { class: 'pt-date', text: 'Mis à jour le ' + fmtDate(p.updatedAt) })));

  /* ---------- fiche ---------- */
  async function renderDetail(id) {
    let p = null, ms = [];
    try { [p, ms] = await Promise.all([D.getPatient(id), D.listMeasures(id)]); } catch (e) { fail(e); }
    if (!p) { toast('Dossier introuvable sur ce téléphone'); go('#/patients'); return; }
    current = p;
    $('#pt-title').textContent = p.name;
    $('#pt-meta').textContent = [p.age != null ? p.age + ' ans' : '', p.sport, 'dossier créé le ' + fmtDate(p.createdAt)].filter(Boolean).join(' · ');
    fillDx('#pt-dx-med', p.dxMed);
    fillDx('#pt-dx-kine', p.dxKine);
    $('#pt-notes-box').hidden = !p.notes;
    $('#pt-notes').textContent = p.notes || '';
    renderSeries(ms);
  }

  function fillDx(sel, v) {
    const n = $(sel);
    n.textContent = v || 'Non renseigné';
    n.classList.toggle('muted', !v);
  }

  // une série = même articulation, même côté, même mesure (ex. « Flexion du coude (droit) »)
  function renderSeries(ms) {
    ms.sort((a, b) => a.date.localeCompare(b.date));
    const groups = new Map();
    ms.forEach((m) => {
      const it = m.items && m.items[0];
      if (!it) return;
      const key = m.joint + '|' + m.side + '|' + it.label;
      if (!groups.has(key)) groups.set(key, { title: it.label, norm: it.norm, rows: [] });
      groups.get(key).rows.push(m);
    });
    $('#pt-series').replaceChildren(...[...groups.values()].map(seriesCard));
    $('#pt-nomeasure').hidden = groups.size > 0;
    $('#pt-mcount').textContent = ms.length ? plural(ms.length, 'mesure') : '';
  }

  function seriesCard(g) {
    const vals = g.rows.map((m) => numOf(m.items[0].value));
    const first = g.rows[0], last = g.rows[g.rows.length - 1];
    const delta = vals.length > 1 ? vals[vals.length - 1] - vals[0] : null;
    return el('article', { class: 'series' },
      el('header', { class: 'series-head' },
        el('h3', { text: g.title }),
        el('p', { class: 'series-delta', text: delta == null
          ? '1 mesure, le ' + fmtDate(first.date)
          : 'Évolution : ' + signed(delta) + '° entre le ' + fmtDate(first.date) + ' et le ' + fmtDate(last.date) })),
      g.rows.length > 1 ? chart(g.rows, vals) : null,
      g.norm ? el('p', { class: 'series-norm', text: g.norm }) : null,
      el('ol', { class: 'm-rows', reversed: true }, ...g.rows.slice().reverse().map(row)));
  }

  function row(m) {
    const it = m.items[0];
    return el('li', { class: 'm-row' },
      el('time', { datetime: m.date, text: fmtDate(m.date) }),
      el('span', { class: 'm-val', text: it.value }),
      m.thumb ? el('button', { class: 'link-btn', type: 'button', text: 'Photo', onclick: () => viewPhoto(m) }) : el('span'),
      el('button', { class: 'icon-btn m-del', type: 'button', 'aria-label': 'Supprimer la mesure du ' + fmtDate(m.date), onclick: () => removeMeasure(m) },
        el('span', { 'aria-hidden': 'true', text: '×' })));
  }

  // courbe d'évolution : abscisse proportionnelle aux dates (ou à l'ordre si même jour)
  function chart(rows, vals) {
    // largeur réelle du conteneur : le texte du graphique garde la même taille sur téléphone et sur ordinateur
    const box = $('#pt-series').clientWidth - 34;
    const W = box > 0 ? Math.max(280, Math.min(760, box)) : 320, H = 140, L = 40, R = 12, T = 14, B = 26;
    const t = rows.map((m) => Date.parse(m.date));
    const tSpan = t[t.length - 1] - t[0];
    const xs = rows.map((m, i) => L + (W - L - R) * (tSpan > 0 ? (t[i] - t[0]) / tSpan : i / (rows.length - 1)));
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (hi - lo < 10) { const c = (hi + lo) / 2; lo = c - 5; hi = c + 5; }
    const ys = vals.map((v) => T + (H - T - B) * (1 - (v - lo) / (hi - lo)));
    const desc = rows.map((m, i) => fmtShort(m.date) + ' : ' + m.items[0].value).join(', ');
    const s = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': 'Évolution — ' + desc });
    [[lo, H - B], [hi, T]].forEach(([v, y]) => {
      s.append(sv('line', { x1: L, x2: W - R, y1: y, y2: y, class: 'c-grid' }));
      s.append(sv('text', { x: L - 6, y: y + 4, 'text-anchor': 'end', class: 'c-lab' }, Math.round(v) + '°'));
    });
    s.append(sv('polyline', { points: xs.map((x, i) => x + ',' + ys[i]).join(' '), class: 'c-line' }));
    xs.forEach((x, i) => s.append(sv('circle', { cx: x, cy: ys[i], r: i === xs.length - 1 ? 4.5 : 3.5, class: 'c-pt' })));
    s.append(sv('text', { x: xs[0], y: H - 6, 'text-anchor': 'start', class: 'c-lab' }, fmtShort(rows[0].date)));
    s.append(sv('text', { x: xs[xs.length - 1], y: H - 6, 'text-anchor': 'end', class: 'c-lab' }, fmtShort(rows[rows.length - 1].date)));
    return s;
  }

  let photoUrl = null;
  function viewPhoto(m) {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoUrl = URL.createObjectURL(m.thumb);
    $('#photo-img').src = photoUrl;
    $('#photo-img').alt = 'Photo annotée — ' + m.items[0].label + ', ' + fmtDate(m.date);
    $('#photo-cap').textContent = m.items.map((it) => it.label + ' : ' + it.value).join(' · ') + ' — ' + fmtDate(m.date);
    $('#photo-view').showModal();
  }

  async function removeMeasure(m) {
    if (!confirm('Supprimer la mesure du ' + fmtDate(m.date) + ' (' + m.items[0].value + ') ?')) return;
    try { await D.deleteMeasure(m.id); toast('Mesure supprimée'); renderDetail(m.patientId); } catch (e) { fail(e); }
  }

  /* ---------- formulaire patient ---------- */
  const F = () => $('#pt-form');
  let formDirty = false;

  // fermeture du formulaire : on prévient si des saisies seraient perdues
  function closeForm(e) {
    if (formDirty && !confirm('Fermer sans enregistrer les modifications ?')) { if (e) e.preventDefault(); return; }
    formDirty = false;
    $('#pt-dialog').close();
  }

  function openForm(p) {
    const f = F();
    f.reset();
    f.elements.id.value = p ? p.id : '';
    if (p) {
      f.elements.name.value = p.name;
      f.elements.age.value = p.age != null ? p.age : '';
      f.elements.sport.value = p.sport || '';
      f.elements.dxMed.value = p.dxMed || '';
      f.elements.dxKine.value = p.dxKine || '';
      f.elements.notes.value = p.notes || '';
    }
    $('#pt-form-title').textContent = p ? 'Modifier le dossier' : 'Nouveau patient';
    $('#pt-delete').hidden = !p;
    $('#pt-name-error').hidden = true;
    $('#pt-age-error').hidden = true;
    formDirty = false;
    $('#pt-dialog').showModal();
    if (matchMedia('(pointer: fine)').matches) f.elements.name.focus(); // pas de clavier imposé sur téléphone
  }

  async function submitForm(e) {
    e.preventDefault();
    const f = F().elements;
    const name = f.name.value.trim();
    if (!name) { $('#pt-name-error').hidden = false; f.name.focus(); return; }
    const ageRaw = f.age.value.trim();
    const age = ageRaw === '' ? null : Math.round(Number(ageRaw));
    $('#pt-age-error').hidden = true;
    if (age != null && !(age >= 0 && age <= 120)) { $('#pt-age-error').hidden = false; f.age.focus(); return; }
    const id = f.id.value || null;
    const prev = id ? current : null;
    try {
      const saved = await D.savePatient({
        ...(prev || {}), id, name: name.slice(0, 80), age, sport: f.sport.value.trim().slice(0, 80),
        dxMed: f.dxMed.value.trim().slice(0, 600), dxKine: f.dxKine.value.trim().slice(0, 600), notes: f.notes.value.trim().slice(0, 2000),
      });
      formDirty = false;
      $('#pt-dialog').close();
      if (!id) D.persist();
      if (active && active.id === saved.id) active = { id: saved.id, name: saved.name };
      if (afterCreate && !id) { const fn = afterCreate; afterCreate = null; fn(saved); return; }
      toast(id ? 'Dossier mis à jour' : 'Dossier créé');
      if (id) renderDetail(saved.id); else go('#/patient/' + encodeURIComponent(saved.id));
    } catch (err) { fail(err); }
  }

  async function deleteCurrent() {
    if (!current) return;
    let n = 0;
    try { n = (await D.listMeasures(current.id)).length; } catch (e) { /* le décompte n'est qu'indicatif */ }
    if (!confirm('Supprimer définitivement le dossier de ' + current.name + ' et ' + plural(n, 'mesure') + ' ?')) return;
    try {
      await D.deletePatient(current.id);
      if (active && active.id === current.id) setActive(null);
      $('#pt-dialog').close();
      toast('Dossier supprimé');
      go('#/patients');
    } catch (e) { fail(e); }
  }

  /* ---------- patient actif pendant la mesure ---------- */
  function setActive(p) {
    active = p ? { id: p.id, name: p.name } : null;
    renderCtx();
  }

  function renderCtx() {
    $('#patient-ctx').hidden = !active;
    $('#ctx-name').textContent = active ? active.name : '';
    $('#btn-save').textContent = active ? 'Enregistrer dans le dossier' : 'Enregistrer dans un dossier';
  }

  async function openPicker() {
    let pts = [];
    try { pts = await D.listPatients(); } catch (e) { fail(e); }
    pts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    $('#pick-list').replaceChildren(...pts.map((p) => el('li', {},
      el('button', { type: 'button', class: 'pick-item', onclick: () => { $('#pt-pick').close(); setActive(p); saveMeasure(); } },
        el('span', { class: 'pt-name', text: p.name }),
        el('span', { class: 'pt-dx', text: p.dxMed || p.dxKine || '' })))));
    $('#pick-empty').hidden = pts.length > 0;
    $('#pt-pick').showModal();
  }

  function newFromPicker() {
    $('#pt-pick').close();
    afterCreate = (p) => { setActive(p); saveMeasure(); };
    openForm(null);
  }

  // miniature JPEG de la photo annotée (≤ 720 px de large)
  function makeThumb(canvas) {
    const k = Math.min(1, 720 / canvas.width);
    const c = document.createElement('canvas');
    c.width = Math.round(canvas.width * k);
    c.height = Math.round(canvas.height * k);
    c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
    return new Promise((res) => c.toBlob((b) => res(b), 'image/jpeg', 0.8));
  }

  let saving = false;
  async function saveMeasure() {
    const snap = KS.work && KS.work.snapshot();
    if (!snap) { toast('Ajoutez d’abord une photo'); return; }
    if (!active) { openPicker(); return; }
    if (saving) return;
    saving = true;
    const btn = $('#btn-save');
    btn.disabled = true;
    btn.textContent = 'Enregistrement…';
    const target = active;
    try {
      const thumb = await makeThumb(snap.canvas);
      await D.addMeasure({ patientId: target.id, joint: snap.joint, jointLabel: snap.jointLabel, side: snap.side, items: snap.items, thumb });
      const p = await D.getPatient(target.id);
      if (p) await D.savePatient(p); // date de mise à jour
      toast('Mesure enregistrée dans le dossier de ' + target.name);
      // si la fiche est déjà affichée (retour rapide), on la met à jour
      if (location.hash === '#/patient/' + encodeURIComponent(target.id)) renderDetail(target.id);
    } catch (e) { fail(e); }
    btn.disabled = false;
    saving = false;
    renderCtx();
  }

  /* ---------- sauvegarde / restauration ---------- */
  async function backup() {
    try {
      const data = await D.exportAll();
      if (!data.patients.length) { toast('Aucun dossier à sauvegarder'); return; }
      const name = 'kinescan-sauvegarde-' + new Date().toISOString().slice(0, 10) + '.json';
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const file = new File([blob], name, { type: 'application/json' });
      if (matchMedia('(pointer: coarse)').matches && navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'Sauvegarde KinéScan' }); return; }
        catch (e) { if (e.name === 'AbortError') return; }
      }
      const a = el('a', { href: URL.createObjectURL(blob), download: name });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      toast('Sauvegarde créée : rangez ce fichier en lieu sûr');
    } catch (e) { fail(e); }
  }

  async function restore(file) {
    if (!file) return;
    if (file.size > 60e6) { toast('Fichier trop volumineux'); return; }
    try {
      const data = JSON.parse(await file.text());
      const n = Array.isArray(data && data.patients) ? data.patients.length : 0;
      if (!confirm('Restaurer ' + plural(n, 'dossier') + ' ? Les dossiers déjà présents sont conservés ; un dossier identique est remplacé.')) return;
      const r = await D.importAll(data);
      D.persist();
      toast(plural(r.patients, 'dossier') + ' et ' + plural(r.measures, 'mesure') + ' restaurés');
      renderList();
    } catch (e) { toast(e instanceof SyntaxError ? 'Fichier illisible : choisissez une sauvegarde KinéScan (.json)' : 'Restauration impossible : ' + e.message); }
  }

  /* ---------- init ---------- */
  function init() {
    $('#pt-search').addEventListener('input', renderList);
    $$('[data-new-patient]').forEach((b) => b.addEventListener('click', () => { afterCreate = null; openForm(null); }));
    $('#pt-edit').addEventListener('click', () => current && openForm(current));
    $('#pt-measure').addEventListener('click', () => { if (!current) return; setActive(current); KS.work.reset(); KS.work.enter(); });
    F().addEventListener('submit', submitForm);
    $('#pt-delete').addEventListener('click', deleteCurrent);
    $('#btn-save').addEventListener('click', saveMeasure);
    $('#ctx-change').addEventListener('click', openPicker);
    $('#ctx-close').addEventListener('click', () => setActive(null));
    $('#pick-new').addEventListener('click', newFromPicker);
    $('#pt-backup').addEventListener('click', backup);
    $('#pt-restore').addEventListener('click', () => $('#pt-restore-file').click());
    $('#pt-restore-file').addEventListener('change', (e) => { restore(e.target.files[0]); e.target.value = ''; });
    $('#photo-view').addEventListener('close', () => { if (photoUrl) { URL.revokeObjectURL(photoUrl); photoUrl = null; } });
    $$('[data-close]').forEach((b) => b.addEventListener('click', (e) => (b.closest('dialog').id === 'pt-dialog' ? closeForm(e) : b.closest('dialog').close())));
    F().addEventListener('input', () => { formDirty = true; });
    $('#pt-dialog').addEventListener('cancel', closeForm);
    // clic sur le fond assombri : fermeture des feuilles
    ['#pt-dialog', '#pt-pick', '#photo-view', '#install-ios'].forEach((s) => {
      const d = $(s);
      if (d) d.addEventListener('click', (e) => { if (e.target !== d) return; if (s === '#pt-dialog') closeForm(); else d.close(); });
    });
    renderCtx();
  }
  return { init, renderList, renderDetail, renderCtx, saveMeasure, get active() { return active; } };
})();
