/* KinéScan — calculs d'angles et définitions cliniques */
window.KS = window.KS || {};
KS.angles = (() => {
  const deg = (r) => (r * 180) / Math.PI;
  const r1 = (v) => Math.round(v * 10) / 10;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  // Angle intérieur au sommet B, en degrés (0–180)
  function angleABC(A, B, C) {
    const v1 = { x: A.x - B.x, y: A.y - B.y };
    const v2 = { x: C.x - B.x, y: C.y - B.y };
    const m = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y);
    if (!m) return 0;
    const cos = Math.min(1, Math.max(-1, (v1.x * v2.x + v1.y * v2.y) / m));
    return deg(Math.acos(cos));
  }

  // Inclinaison de la ligne A→B par rapport à l'horizontale (y vers le bas)
  const tilt = (a, b) => deg(Math.atan2(b.y - a.y, b.x - a.x));

  const sideTxt = (s) => (s === 'D' ? ' (droit)' : s === 'G' ? ' (gauche)' : '');

  /* ---------- Goniométrie ---------- */
  // lm : index MediaPipe par côté du sujet (D = droit, G = gauche)
  const JOINTS = {
    coude: {
      label: 'Coude — flexion / extension',
      note: 'Repères : acromion → épicondyle latéral → styloïde radiale. Photo de profil du bras.',
      points: [
        { id: 'p0', label: 'Épaule', lm: { D: 12, G: 11 } },
        { id: 'p1', label: 'Coude', lm: { D: 14, G: 13 } },
        { id: 'p2', label: 'Poignet', lm: { D: 16, G: 15 } },
      ],
      metrics(a, side) {
        return [{ label: 'Flexion du coude' + sideTxt(side), value: r1(180 - a) + '°', norm: 'Norme AAOS : flexion 0–150°, extension 0°' }];
      },
    },
    epaule: {
      label: 'Épaule — élévation (flexion / abduction)',
      note: 'Vue de profil = flexion · vue de face = abduction. Repères : grand trochanter → acromion → épicondyle latéral.',
      points: [
        { id: 'p0', label: 'Hanche', lm: { D: 24, G: 23 } },
        { id: 'p1', label: 'Épaule', lm: { D: 12, G: 11 } },
        { id: 'p2', label: 'Coude', lm: { D: 14, G: 13 } },
      ],
      metrics(a, side) {
        return [{ label: 'Élévation de l’épaule' + sideTxt(side), value: r1(a) + '°', norm: 'Norme AAOS : flexion 0–180° · abduction 0–180°' }];
      },
    },
    hanche: {
      label: 'Hanche — flexion',
      note: 'Photo de profil. Repères : acromion (tronc) → grand trochanter → condyle latéral du genou.',
      points: [
        { id: 'p0', label: 'Épaule', lm: { D: 12, G: 11 } },
        { id: 'p1', label: 'Hanche', lm: { D: 24, G: 23 } },
        { id: 'p2', label: 'Genou', lm: { D: 26, G: 25 } },
      ],
      metrics(a, side) {
        return [{ label: 'Flexion de hanche' + sideTxt(side), value: r1(180 - a) + '°', norm: 'Norme AAOS : 0–120° genou fléchi · ~0–90° genou tendu' }];
      },
    },
    genou: {
      label: 'Genou — flexion / extension',
      note: 'Photo de profil. Repères : grand trochanter → condyle latéral → malléole externe.',
      points: [
        { id: 'p0', label: 'Hanche', lm: { D: 24, G: 23 } },
        { id: 'p1', label: 'Genou', lm: { D: 26, G: 25 } },
        { id: 'p2', label: 'Cheville', lm: { D: 28, G: 27 } },
      ],
      metrics(a, side) {
        return [{ label: 'Flexion du genou' + sideTxt(side), value: r1(180 - a) + '°', norm: 'Norme AAOS : flexion 0–135°, extension 0°' }];
      },
    },
    cheville: {
      label: 'Cheville — flexion dorsale / plantaire',
      note: 'Photo de profil du pied. Repères : tête de la fibula → malléole externe → 5e métatarsien.',
      points: [
        { id: 'p0', label: 'Genou', lm: { D: 26, G: 25 } },
        { id: 'p1', label: 'Malléole', lm: { D: 28, G: 27 } },
        { id: 'p2', label: 'Avant-pied', lm: { D: 32, G: 31 } },
      ],
      metrics(a, side) {
        const pos = r1(90 - a);
        if (pos >= 0) {
          return [{ label: 'Flexion dorsale' + sideTxt(side), value: pos + '°', norm: 'Norme AAOS : 0–20° (position neutre = 90° entre jambe et pied)' }];
        }
        return [{ label: 'Flexion plantaire' + sideTxt(side), value: -pos + '°', norm: 'Norme AAOS : 0–50° (position neutre = 90° entre jambe et pied)' }];
      },
    },
    libre: {
      label: 'Goniomètre libre (3 points)',
      note: 'Placez librement les 3 points : l’angle est mesuré au point « Sommet ».',
      points: [
        { id: 'p0', label: 'Branche A' },
        { id: 'p1', label: 'Sommet' },
        { id: 'p2', label: 'Branche B' },
      ],
      metrics(a) {
        return [
          { label: 'Angle mesuré au sommet', value: r1(a) + '°' },
          { label: 'Angle supplémentaire (180° − angle)', value: r1(180 - a) + '°' },
        ];
      },
    },
  };

  function gonioMetrics(jointKey, side, p) {
    const j = JOINTS[jointKey];
    const a = angleABC(p.p0, p.p1, p.p2);
    return j.metrics(a, jointKey === 'libre' ? null : side);
  }

  /* ---------- Morphostatique face ---------- */
  // Convention : point D placé sur le côté droit du sujet (à gauche de l'image, sujet face caméra)
  function tiltRow(label, pD, pG, thr) {
    const t = r1(tilt(pD, pG));
    const v = Math.abs(t);
    return {
      label,
      value: v + '°',
      detail: v <= thr ? 'symétrique' : t > 0 ? 'abaissement côté gauche' : 'abaissement côté droit',
      status: v <= thr ? 'ok' : 'warn',
    };
  }

  function faceMetrics(p) {
    const rows = [];
    rows.push(tiltRow('Tête — ligne bipupillaire', p.oeilD, p.oeilG, 3));
    rows.push(tiltRow('Épaules — ligne bi-acromiale', p.epauleD, p.epauleG, 3));
    rows.push(tiltRow('Bassin — ligne bi-iliaque', p.hancheD, p.hancheG, 3));

    const ratio = dist(p.genouD, p.genouG) / Math.max(1, dist(p.chevilleD, p.chevilleG));
    let axe = 'alignement neutre', st = 'ok';
    if (ratio < 0.85) { axe = 'tendance valgus (genoux rapprochés)'; st = 'warn'; }
    else if (ratio > 1.15) { axe = 'tendance varus (genoux écartés)'; st = 'warn'; }
    rows.push({
      label: 'Axe des genoux (indicatif)',
      value: (Math.round(ratio * 100) / 100).toFixed(2),
      detail: axe, norm: 'Ratio écart genoux / écart chevilles', status: st,
    });

    // Fil à plomb : verticale passant entre les deux malléoles
    const plumb = mid(p.chevilleD, p.chevilleG);
    const h = Math.max(1, plumb.y - mid(p.oeilD, p.oeilG).y);
    const off = (pt, name) => {
      const pc = r1(((pt.x - plumb.x) / h) * 100);
      const v = Math.abs(pc);
      rows.push({
        label: name + ' / fil à plomb',
        value: v + ' %',
        detail: v <= 2 ? 'centré' : pc > 0 ? 'déviation vers la gauche du sujet' : 'déviation vers la droite du sujet',
        status: v <= 2 ? 'ok' : 'warn',
      });
    };
    off(mid(p.oeilD, p.oeilG), 'Tête');
    off(mid(p.epauleD, p.epauleG), 'Tronc (épaules)');
    off(mid(p.hancheD, p.hancheG), 'Bassin');
    return rows;
  }

  /* ---------- Morphostatique profil ---------- */
  function profilMetrics(p, facing) {
    const rows = [];
    // Angle crânio-vertébral approché : ligne acromion → tragus vs horizontale
    const dy = p.epaule.y - p.oreille.y;
    const dx = Math.max(1e-6, Math.abs(p.oreille.x - p.epaule.x));
    const cva = r1(deg(Math.atan2(dy, dx)));
    rows.push({
      label: 'Angle crânio-vertébral (approx. tragus–acromion)',
      value: cva + '°',
      detail: cva >= 48 ? 'posture de tête dans la norme' : 'tête projetée en avant',
      norm: 'Norme : ≥ 48°', status: cva >= 48 ? 'ok' : 'warn',
    });

    // Fil à plomb depuis la malléole externe
    const h = Math.max(1, p.malleole.y - p.oreille.y);
    const sign = facing === 'gauche' ? -1 : 1; // regard vers la gauche → l'avant = x plus petit
    [['Genou', 'genou'], ['Bassin (grand trochanter)', 'hanche'], ['Épaule (acromion)', 'epaule'], ['Oreille (tragus)', 'oreille']].forEach(([nm, id]) => {
      const pc = r1((((p[id].x - p.malleole.x) * sign) / h) * 100);
      const v = Math.abs(pc);
      rows.push({
        label: nm + ' / fil à plomb (malléole)',
        value: v + ' %',
        detail: pc >= 0 ? 'en avant de la ligne' : 'en arrière de la ligne',
        status: v <= 6 ? 'ok' : 'warn',
      });
    });
    return rows;
  }

  return { angleABC, tilt, dist, mid, r1, JOINTS, gonioMetrics, faceMetrics, profilMetrics };
})();
