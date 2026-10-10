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
      note: 'Photo de profil du pied. Tête de la fibula → malléole externe, puis 2 points sur le 5e métatarsien (base / styloïde et tête) : la ligne du pied passe par la malléole, parallèle au 5e métatarsien (méthode Norkin & White).',
      // branche mobile virtuelle : passe par la malléole, parallèle à base → tête du 5e métatarsien
      parallel: true,
      points: [
        { id: 'p0', label: 'Tête fibula', lm: { D: 26, G: 25 }, def: [0.45, 0.15] },
        { id: 'p1', label: 'Malléole', lm: { D: 28, G: 27 }, def: [0.45, 0.62] },
        { id: 'p2', label: 'Base 5e méta', lm: { D: 30, G: 29 }, def: [0.42, 0.76] },
        { id: 'p3', label: 'Tête 5e méta', lm: { D: 32, G: 31 }, def: [0.75, 0.76] },
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

  // Les 3 points qui définissent l'angle mesuré : pour une articulation « parallel »,
  // la 2e branche part du sommet parallèlement à la ligne p2 → p3.
  function gonioTriplet(jointKey, p) {
    if (!JOINTS[jointKey].parallel) return [p.p0, p.p1, p.p2];
    return [p.p0, p.p1, { x: p.p1.x + (p.p3.x - p.p2.x), y: p.p1.y + (p.p3.y - p.p2.y) }];
  }

  function gonioMetrics(jointKey, side, p) {
    const j = JOINTS[jointKey];
    const a = angleABC(...gonioTriplet(jointKey, p));
    return j.metrics(a, jointKey === 'libre' ? null : side);
  }

  /* ---------- Référence morphostatique ----------
     Fil à plomb virtuel passant par la malléole externe (profil) ou entre les
     chevilles (face). Sa direction est soit la verticale de l'image (v1), soit
     une vraie verticale repérée sur la photo — fil, bord de porte, angle de
     mur — qui corrige l'inclinaison du téléphone (v2). L'échelle en cm vient de
     la taille du sujet rapportée à la distance haut du crâne → sol.
     ref = { vertical: {top, bottom} | null, height: {top, bottom, cm} | null } */
  function refFrame(ref, anchor) {
    const V = ref && ref.vertical;
    let u = { x: 0, y: 1 }; // vers le bas
    if (V) {
      const L = Math.max(1, dist(V.top, V.bottom));
      u = { x: (V.bottom.x - V.top.x) / L, y: (V.bottom.y - V.top.y) / L };
      if (u.y < 0) u = { x: -u.x, y: -u.y }; // points posés à l'envers
    }
    const n = { x: u.y, y: -u.x }; // vers la droite de l'image
    const dot = (a, b, v) => (b.x - a.x) * v.x + (b.y - a.y) * v.y;
    const H = ref && ref.height;
    const hPx = H ? Math.abs(dot(H.top, H.bottom, u)) : 0;
    return {
      tilt: V ? deg(Math.atan2(u.x, u.y)) : null, // 0° = verticale de l'image
      cmPerPx: H && H.cm > 0 && hPx > 1 ? H.cm / hPx : null,
      off: (pt) => dot(anchor, pt, n),    // distance signée à la ligne (px), + = droite de l'image
      down: (a, b) => dot(a, b, u),       // composante verticale de a→b
      across: (a, b) => dot(a, b, n),     // composante horizontale de a→b
    };
  }

  // Distance à la ligne : en cm si l'échelle est connue, sinon en % de la hauteur de référence
  function lineDistance(px, F, hPx) {
    const pc = r1((px / Math.max(1, hPx)) * 100);
    const v = F.cmPerPx ? r1(px * F.cmPerPx) : pc;
    return { pc, value: Math.abs(v) + (F.cmPerPx ? ' cm' : ' %') };
  }

  function photoTiltRow(F) {
    const t = r1(Math.abs(F.tilt));
    return {
      label: 'Inclinaison de la photo (verticale repérée / bord de l’image)',
      value: t + '°',
      detail: t <= 1 ? 'photo droite' : 'photo penchée — corrigée',
      status: t <= 1 ? 'ok' : 'warn',
    };
  }

  /* ---------- Morphostatique face ---------- */
  // Convention : point D placé sur le côté droit du sujet (à gauche de l'image, sujet face caméra)
  function tiltRow(label, tRaw, thr) {
    const t = r1(tRaw);
    const v = Math.abs(t);
    return {
      label,
      value: v + '°',
      detail: v <= thr ? 'symétrique' : t > 0 ? 'abaissement côté gauche' : 'abaissement côté droit',
      status: v <= thr ? 'ok' : 'warn',
    };
  }

  function faceMetrics(p, ref) {
    const feet = mid(p.chevilleD, p.chevilleG), eyes = mid(p.oeilD, p.oeilG);
    const F = refFrame(ref, feet);
    const lineTilt = (a, b) => deg(Math.atan2(F.down(a, b), F.across(a, b))); // / horizontale vraie
    const rows = [];
    if (F.tilt !== null) rows.push(photoTiltRow(F));
    rows.push(tiltRow('Tête — ligne bipupillaire', lineTilt(p.oeilD, p.oeilG), 3));
    rows.push(tiltRow('Épaules — ligne bi-acromiale', lineTilt(p.epauleD, p.epauleG), 3));
    rows.push(tiltRow('Bassin — ligne bi-iliaque', lineTilt(p.hancheD, p.hancheG), 3));

    const ratio = dist(p.genouD, p.genouG) / Math.max(1, dist(p.chevilleD, p.chevilleG));
    let axe = 'alignement neutre', st = 'ok';
    if (ratio < 0.85) { axe = 'tendance valgus (genoux rapprochés)'; st = 'warn'; }
    else if (ratio > 1.15) { axe = 'tendance varus (genoux écartés)'; st = 'warn'; }
    rows.push({
      label: 'Axe des genoux (indicatif)',
      value: (Math.round(ratio * 100) / 100).toFixed(2),
      detail: axe, norm: 'Ratio écart genoux / écart chevilles', status: st,
    });

    // Fil à plomb : ligne passant entre les deux malléoles
    const hPx = F.down(eyes, feet);
    const off = (pt, name) => {
      const d = lineDistance(F.off(pt), F, hPx);
      const ok = Math.abs(d.pc) <= 2;
      rows.push({
        label: name + ' / fil à plomb',
        value: d.value,
        detail: ok ? 'centré' : d.pc > 0 ? 'déviation vers la gauche du sujet' : 'déviation vers la droite du sujet',
        status: ok ? 'ok' : 'warn',
      });
    };
    off(eyes, 'Tête');
    off(mid(p.epauleD, p.epauleG), 'Tronc (épaules)');
    off(mid(p.hancheD, p.hancheG), 'Bassin');
    return rows;
  }

  /* ---------- Morphostatique profil ---------- */
  function profilMetrics(p, facing, ref) {
    const F = refFrame(ref, p.malleole);
    const rows = [];
    if (F.tilt !== null) rows.push(photoTiltRow(F));
    // Angle crânio-vertébral approché : ligne acromion → tragus vs horizontale
    const dy = F.down(p.oreille, p.epaule);
    const dx = Math.max(1e-6, Math.abs(F.across(p.epaule, p.oreille)));
    const cva = r1(deg(Math.atan2(dy, dx)));
    rows.push({
      label: 'Angle crânio-vertébral (approx. tragus–acromion)',
      value: cva + '°',
      detail: cva >= 48 ? 'posture de tête dans la norme' : 'tête projetée en avant',
      norm: 'Norme : ≥ 48°', status: cva >= 48 ? 'ok' : 'warn',
    });

    // Fil à plomb passant par la malléole externe
    const sign = facing === 'gauche' ? -1 : 1; // regard vers la gauche → l'avant = x plus petit
    const hPx = F.down(p.oreille, p.malleole);
    [['Genou', 'genou'], ['Bassin (grand trochanter)', 'hanche'], ['Épaule (acromion)', 'epaule'], ['Oreille (tragus)', 'oreille']].forEach(([nm, id]) => {
      const d = lineDistance(F.off(p[id]) * sign, F, hPx);
      rows.push({
        label: nm + ' / fil à plomb (malléole)',
        value: d.value,
        detail: d.pc >= 0 ? 'en avant de la ligne' : 'en arrière de la ligne',
        status: Math.abs(d.pc) <= 6 ? 'ok' : 'warn',
      });
    });
    return rows;
  }

  return { angleABC, tilt, dist, mid, r1, JOINTS, gonioMetrics, gonioTriplet, faceMetrics, profilMetrics, refFrame };
})();
