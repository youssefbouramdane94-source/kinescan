/* KinéScan — export du bilan en PNG */
window.KS = window.KS || {};
KS.report = (() => {
  const INK = '#17211f', SOFT = '#5c6a66', ACC = '#0e7c7b', LINE = '#e3e4df';

  function save(displayCanvas, metrics, title) {
    const W = 1000, pad = 36;
    const imgH = Math.round((displayCanvas.height / displayCanvas.width) * W);
    const lineH = 58;
    const headH = 104, footH = 96;
    const H = headH + imgH + 28 + metrics.length * lineH + footH;

    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');

    x.fillStyle = '#ffffff';
    x.fillRect(0, 0, W, H);

    // entête
    x.fillStyle = INK;
    x.font = '800 32px system-ui, sans-serif';
    x.fillText('KinéScan — ' + title, pad, 50);
    x.fillStyle = SOFT;
    x.font = '400 19px system-ui, sans-serif';
    x.fillText('Bilan du ' + new Date().toLocaleString('fr-FR'), pad, 82);
    x.fillStyle = ACC;
    x.fillRect(pad, headH - 12, W - pad * 2, 3);

    // capture annotée
    x.drawImage(displayCanvas, 0, headH, W, imgH);

    // métriques
    let y = headH + imgH + 46;
    metrics.forEach((m) => {
      x.fillStyle = INK;
      x.font = '600 20px system-ui, sans-serif';
      x.fillText(m.label + (m.detail ? ' — ' + m.detail : ''), pad, y);
      x.font = '700 24px ui-monospace, Menlo, monospace';
      x.textAlign = 'right';
      x.fillText(String(m.value), W - pad, y);
      x.textAlign = 'left';
      if (m.norm) {
        x.fillStyle = SOFT;
        x.font = '400 16px system-ui, sans-serif';
        x.fillText(m.norm, pad, y + 22);
      }
      x.strokeStyle = LINE;
      x.beginPath();
      x.moveTo(pad, y + 32);
      x.lineTo(W - pad, y + 32);
      x.stroke();
      y += lineH;
    });

    // pied de page
    x.fillStyle = SOFT;
    x.font = '400 15px system-ui, sans-serif';
    x.fillText('Outil pédagogique — mesures 2D indicatives, sensibles au cadrage et à la perpendicularité', pad, H - 52);
    x.fillText('de la prise de vue. Ne remplace pas le goniomètre clinique ni l’examen du praticien.', pad, H - 30);

    const a = document.createElement('a');
    a.download = 'kinescan-bilan-' + Date.now() + '.png';
    a.href = c.toDataURL('image/png');
    a.click();
  }

  return { save };
})();
