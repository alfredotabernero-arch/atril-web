/* Atril — generador de PDF mínimo (texto Helvetica, rectángulos, líneas y polígonos), sin dependencias */
(function (A) {
  'use strict';

  // anchos de Helvetica y Helvetica-Bold (WinAnsi, caracteres 32–255), en milésimas del cuerpo
  const ANCHOS = {
    F1: [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,350,556,350,222,556,333,1000,556,556,333,1000,667,333,1000,350,611,350,350,222,222,333,333,350,556,1000,333,1000,500,333,944,350,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500],
    F2: [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,350,556,350,278,556,500,1000,556,556,333,1000,667,333,1000,350,611,350,350,278,278,500,500,350,556,1000,333,1000,556,333,944,350,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556]
  };
  const ESPECIALES = { '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8A, '‹': 0x8B, 'Œ': 0x8C, 'Ž': 0x8E,
    '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9A, '›': 0x9B, 'œ': 0x9C, 'ž': 0x9E, 'Ÿ': 0x9F, '♩': -1 };

  /** Convierte un texto a códigos WinAnsi (lo que no existe en Helvetica se quita) */
  function codigos(txt) {
    const out = [];
    for (const ch of String(txt == null ? '' : txt)) {
      const c = ch.codePointAt(0);
      if (ESPECIALES[ch] > 0) out.push(ESPECIALES[ch]);
      else if (c >= 32 && c <= 126) out.push(c);
      else if (c >= 0xA0 && c <= 0xFF) out.push(c);
      else if (c === 10 || c === 9) out.push(32);
    }
    return out;
  }
  function ancho(txt, tam, negrita) {
    const t = ANCHOS[negrita ? 'F2' : 'F1'];
    return codigos(txt).reduce((a, c) => a + (t[c - 32] || 556), 0) * tam / 1000;
  }
  function cadena(cods) {
    return '(' + cods.map(c => c === 40 || c === 41 || c === 92 ? '\\' + String.fromCharCode(c) : c > 126 ? '\\' + c.toString(8).padStart(3, '0') : String.fromCharCode(c)).join('') + ')';
  }
  const n = v => (Math.round(v * 100) / 100).toString();
  function color(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return [0, 0, 0];
    const v = parseInt(m[1], 16);
    return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255];
  }

  /**
   * Documento A4 con coordenadas desde arriba a la izquierda, en puntos.
   * doc.texto(x, y, txt, {tam, negrita, color, alinear}), doc.rect(x, y, w, h, {relleno, borde, radio}),
   * doc.linea(x1, y1, x2, y2, {color, grosor}), doc.estrella(cx, cy, r, {relleno}), doc.pagina(), doc.blob()
   */
  function Documento(ancho_ = 595.28, alto = 841.89) {
    const paginas = [];
    let actual = null;
    const doc = {
      ancho: ancho_, alto,
      pagina() { actual = []; paginas.push(actual); return doc; },
      get numPaginas() { return paginas.length; },
      enPagina(i, fn) { const prev = actual; actual = paginas[i]; fn(); actual = prev; },
      texto(x, y, txt, o = {}) {
        const tam = o.tam || 10, cods = codigos(txt);
        if (!cods.length) return 0;
        const w = ancho(txt, tam, o.negrita);
        if (o.alinear === 'derecha') x -= w; else if (o.alinear === 'centro') x -= w / 2;
        const [r, g, b] = color(o.color || '#1E1B3A');
        actual.push(`BT ${n(r)} ${n(g)} ${n(b)} rg /${o.negrita ? 'F2' : 'F1'} ${n(tam)} Tf ${n(x)} ${n(alto - y)} Td ${cadena(cods)} Tj ET`);
        return w;
      },
      rect(x, y, w, h, o = {}) {
        const yy = alto - y - h, rad = Math.min(o.radio || 0, w / 2, h / 2);
        let p;
        if (rad > 0) {
          const k = rad * 0.5523;
          p = `${n(x + rad)} ${n(yy)} m ${n(x + w - rad)} ${n(yy)} l ${n(x + w - rad + k)} ${n(yy)} ${n(x + w)} ${n(yy + rad - k)} ${n(x + w)} ${n(yy + rad)} c ` +
            `${n(x + w)} ${n(yy + h - rad)} l ${n(x + w)} ${n(yy + h - rad + k)} ${n(x + w - rad + k)} ${n(yy + h)} ${n(x + w - rad)} ${n(yy + h)} c ` +
            `${n(x + rad)} ${n(yy + h)} l ${n(x + rad - k)} ${n(yy + h)} ${n(x)} ${n(yy + h - rad + k)} ${n(x)} ${n(yy + h - rad)} c ` +
            `${n(x)} ${n(yy + rad)} l ${n(x)} ${n(yy + rad - k)} ${n(x + rad - k)} ${n(yy)} ${n(x + rad)} ${n(yy)} c h`;
        } else p = `${n(x)} ${n(yy)} ${n(w)} ${n(h)} re`;
        actual.push(pintar(p, o));
      },
      linea(x1, y1, x2, y2, o = {}) {
        const [r, g, b] = color(o.color || '#D8D4EA');
        actual.push(`${n(r)} ${n(g)} ${n(b)} RG ${n(o.grosor || 0.8)} w ${n(x1)} ${n(alto - y1)} m ${n(x2)} ${n(alto - y2)} l S`);
      },
      estrella(cx, cy, r, o = {}) {
        const pts = [];
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
          pts.push([cx + rr * Math.cos(a), alto - (cy + rr * Math.sin(a))]);
        }
        actual.push(pintar(pts.map((p, i) => `${n(p[0])} ${n(p[1])} ${i ? 'l' : 'm'}`).join(' ') + ' h', o));
      },
      blob() {
        const objs = [];
        const obj = s => { objs.push(s); return objs.length; };
        const catalogo = obj(null), raiz = obj(null);
        const f1 = obj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
        const f2 = obj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
        const kids = paginas.map(cmds => {
          const flujo = cmds.join('\n');
          const c = obj(`<< /Length ${flujo.length} >>\nstream\n${flujo}\nendstream`);
          return obj(`<< /Type /Page /Parent ${raiz} 0 R /MediaBox [0 0 ${n(ancho_)} ${n(alto)}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${c} 0 R >>`);
        });
        objs[catalogo - 1] = `<< /Type /Catalog /Pages ${raiz} 0 R >>`;
        objs[raiz - 1] = `<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
        let s = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
        const pos = [];
        objs.forEach((o, i) => { pos.push(s.length); s += `${i + 1} 0 obj\n${o}\nendobj\n`; });
        const xref = s.length;
        s += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + pos.map(p => String(p).padStart(10, '0') + ' 00000 n \n').join('');
        s += `trailer\n<< /Size ${objs.length + 1} /Root ${catalogo} 0 R /Info << /Producer (Atril) >> >>\nstartxref\n${xref}\n%%EOF`;
        const bytes = new Uint8Array(s.length);
        for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i) & 255;
        return new Blob([bytes], { type: 'application/pdf' });
      }
    };
    function pintar(ruta, o) {
      const rel = o.relleno ? color(o.relleno) : null, bor = o.borde ? color(o.borde) : null;
      let s = '';
      if (rel) s += `${n(rel[0])} ${n(rel[1])} ${n(rel[2])} rg `;
      if (bor) s += `${n(bor[0])} ${n(bor[1])} ${n(bor[2])} RG ${n(o.grosor || 0.8)} w `;
      return s + ruta + (rel && bor ? ' B' : rel ? ' f' : ' S');
    }
    return doc.pagina();
  }

  /** Parte un texto en líneas que caben en «max» puntos */
  function partir(txt, max, tam, negrita) {
    const lineas = [];
    String(txt || '').split(/\n/).forEach(par => {
      let l = '';
      par.split(/\s+/).filter(Boolean).forEach(p => {
        const prueba = l ? l + ' ' + p : p;
        if (ancho(prueba, tam, negrita) <= max || !l) l = prueba;
        else { lineas.push(l); l = p; }
      });
      if (l) lineas.push(l);
    });
    return lineas;
  }

  A.pdf = { Documento, ancho, partir };
})(window.Atril);
