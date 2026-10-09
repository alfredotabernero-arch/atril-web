/* Atril — estadísticas: previsto frente a real, tiempo por obra, evolución del tempo */
(function (A) {
  'use strict';
  const { u, DB, modelo } = A;
  const { h } = u;
  const NS = 'http://www.w3.org/2000/svg';
  const s = (tag, attrs, ...hijos) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
    hijos.flat().forEach(c => c && e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return e;
  };

  const PERIODOS = [{ id: '4s', nombre: '4 semanas', sem: 4 }, { id: '12s', nombre: '3 meses', sem: 13 }, { id: '52s', nombre: 'Año', sem: 52 }];

  A.vistas.estadisticas = {
    titulo: 'Progreso',
    async render({ main, params }) {
      const per = PERIODOS.find(p => p.id === params[0]) || PERIODOS[0];
      main.appendChild(h('div.segmentado', { style: { marginBottom: '14px' } }, PERIODOS.map(p =>
        h('button' + (p.id === per.id ? '.on' : ''), { onclick: () => (location.hash = '#/estadisticas/' + p.id) }, p.nombre))));

      const [plan, sesiones, obras, secciones, tempos] = await Promise.all([
        modelo.plan(), DB.all('sesiones'), DB.all('obras'), DB.all('secciones'), DB.all('tempos')]);
      if (!sesiones.length) {
        main.appendChild(h('div.tarjeta.vacio', h('h3', 'Aún no hay datos'), h('p', 'Cuando registres sesiones de estudio verás aquí tu evolución: tiempo previsto frente a real, reparto por obras y progreso del tempo.')));
        return;
      }
      const porDia = modelo.minutosPorDia(sesiones);
      const hoy = new Date();
      const lunesActual = u.inicioSemana(hoy);
      const desde = u.sumarDias(lunesActual, -7 * (per.sem - 1));
      const enPeriodo = sesiones.filter(x => x.inicio >= desde.getTime());

      // ---------- semanas previsto/real
      const semanas = [];
      for (let w = 0; w < per.sem; w++) {
        const ini = u.sumarDias(desde, w * 7);
        let prev = 0, real = 0;
        for (let d = 0; d < 7; d++) {
          const f = u.sumarDias(ini, d);
          if (f > hoy) continue; // no contar días futuros de la semana en curso
          prev += modelo.previstoDia(plan, f);
          real += porDia[u.claveDia(f)] || 0;
        }
        semanas.push({ ini, prev, real });
      }
      const totReal = semanas.reduce((a, x) => a + x.real, 0);
      const totPrev = semanas.reduce((a, x) => a + x.prev, 0);
      const diasConEstudio = Object.keys(porDia).filter(k => k >= u.claveDia(desde) && porDia[k] > 0).length;
      const diasPeriodo = u.diasEntre(desde, hoy) + 1;

      main.appendChild(h('section.tarjeta',
        h('h2', 'Previsto frente a real'),
        h('div.metricas',
          h('div.metrica', h('b', u.minutos(totReal)), h('span', 'estudiado')),
          h('div.metrica', h('b', totPrev ? Math.round(totReal / totPrev * 100) + '%' : '—'), h('span', 'del plan (' + u.minutos(totPrev) + ')')),
          h('div.metrica', h('b', diasConEstudio + '/' + diasPeriodo), h('span', 'días con estudio'))),
        h('div.grafico', { style: { marginTop: '12px' } }, graficoSemanas(semanas)),
        h('div.leyenda',
          h('span', h('i', { style: { background: 'var(--acento)' } }), 'Real'),
          h('span', h('i', { style: { background: 'var(--tinta-3)', height: '3px', verticalAlign: '3px' } }), 'Previsto'))));

      // ---------- mapa de calor
      main.appendChild(h('section.tarjeta', h('h2', 'Constancia'), mapaCalor(porDia, plan, 18), h('p.mini.tenue', { style: { margin: '8px 0 0' } }, 'Últimas 18 semanas. Más intenso = más cerca (o por encima) del objetivo del día.')));

      // ---------- tiempo por obra
      const porObra = {};
      enPeriodo.forEach(x => { const k = x.obraId || '_'; porObra[k] = (porObra[k] || 0) + x.minutos; });
      const nombres = Object.fromEntries(obras.map(o => [o.id, o]));
      const filas = Object.entries(porObra).sort((a, b) => b[1] - a[1]);
      const maxO = Math.max(...filas.map(f => f[1]), 1);
      main.appendChild(h('section.tarjeta.barras-h', h('h2', 'Tiempo por obra'),
        filas.map(([id, m]) => {
          const o = nombres[id];
          return h('div.fila',
            h('span.nombre', o ? o.titulo : id === '_' ? 'Técnica / general' : 'Obra borrada'),
            h('div.barra', h('i', { style: { width: (m / maxO * 100) + '%', background: o ? o.color : 'var(--tinta-3)' } })),
            h('span.valor', u.minutos(m)));
        })));

      // ---------- hábitos
      const porSemanaDia = [0, 0, 0, 0, 0, 0, 0], porFranja = { 'mañana': 0, 'tarde': 0, 'noche': 0 };
      enPeriodo.forEach(x => {
        const d = new Date(x.inicio);
        porSemanaDia[(d.getDay() + 6) % 7] += x.minutos;
        const hh = d.getHours();
        porFranja[hh < 14 ? 'mañana' : hh < 21 ? 'tarde' : 'noche'] += x.minutos;
      });
      const mejorDia = porSemanaDia.indexOf(Math.max(...porSemanaDia));
      const franja = Object.entries(porFranja).sort((a, b) => b[1] - a[1])[0][0];
      const media = enPeriodo.length ? totReal / enPeriodo.length : 0;
      const val = enPeriodo.filter(x => x.valoracion);
      main.appendChild(h('section.tarjeta', h('h2', 'Hábitos'),
        h('div.metricas',
          h('div.metrica', h('b', u.minutos(media)), h('span', 'por sesión')),
          h('div.metrica', h('b', u.DIAS[(mejorDia + 1) % 7]), h('span', 'tu mejor día')),
          h('div.metrica', h('b', franja), h('span', 'sueles estudiar'))),
        val.length ? h('p.mini.tenue', { style: { margin: '10px 0 0' } }, `Valoración media de tus sesiones: ${(val.reduce((a, x) => a + x.valoracion, 0) / val.length).toFixed(1)} ★`) : null));

      // ---------- evolución del tempo
      const conTempo = secciones.filter(x => tempos.some(t => t.seccionId === x.id));
      if (conTempo.length) {
        const sel = h('select', conTempo.map(x => h('option', { value: x.id }, (nombres[x.obraId] ? nombres[x.obraId].titulo + ' · ' : '') + x.nombre)));
        const caja = h('div.grafico', { style: { marginTop: '10px' } });
        const pintar = () => {
          const sec = conTempo.find(x => x.id === sel.value);
          const puntos = tempos.filter(t => t.seccionId === sec.id).sort((a, b) => a.fecha - b.fecha);
          caja.replaceChildren(graficoTempo(puntos, sec.tempoObjetivo, nombres[sec.obraId] ? nombres[sec.obraId].color : null));
        };
        sel.addEventListener('change', pintar);
        main.appendChild(h('section.tarjeta', h('h2', 'Evolución del tempo'), sel, caja));
        pintar();
      }
    }
  };

  function graficoSemanas(semanas) {
    const W = 600, H = 200, ml = 34, mb = 22, mt = 8;
    const max = Math.max(60, ...semanas.map(x => Math.max(x.prev, x.real))) * 1.1;
    const n = semanas.length, bw = (W - ml) / n;
    const y = v => mt + (H - mt - mb) * (1 - v / max);
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Minutos por semana, previsto y real' });
    // rejilla
    const pasoH = max > 600 ? 120 : max > 200 ? 60 : 30;
    for (let v = 0; v <= max; v += pasoH) {
      svg.appendChild(s('line', { x1: ml, x2: W, y1: y(v), y2: y(v), stroke: 'var(--borde)', 'stroke-width': 1 }));
      svg.appendChild(s('text', { x: ml - 6, y: y(v) + 4, 'text-anchor': 'end' }, v >= 60 ? (v / 60) + 'h' : v + ''));
    }
    const cada = Math.ceil(n / 8);
    semanas.forEach((x, i) => {
      const cx = ml + i * bw;
      const ancho = Math.max(3, bw * 0.62);
      const cumple = x.prev && x.real >= x.prev;
      svg.appendChild(s('rect', {
        x: cx + (bw - ancho) / 2, y: y(x.real), width: ancho, height: Math.max(0, y(0) - y(x.real)), rx: Math.min(5, ancho / 3),
        fill: cumple ? 'var(--bien)' : 'var(--acento)'
      }, s('title', {}, `Semana del ${u.fechaCorta(x.ini)}: ${u.minutos(x.real)} de ${u.minutos(x.prev)}`)));
      if (x.prev) svg.appendChild(s('line', { x1: cx + 2, x2: cx + bw - 2, y1: y(x.prev), y2: y(x.prev), stroke: 'var(--tinta-3)', 'stroke-width': 3, 'stroke-linecap': 'round' }));
      if (i % cada === 0) svg.appendChild(s('text', { x: cx + bw / 2, y: H - 6, 'text-anchor': 'middle' }, u.fechaCorta(x.ini)));
    });
    return svg;
  }

  function mapaCalor(porDia, plan, semanas) {
    const caja = h('div.mapa-calor');
    const ini = u.sumarDias(u.inicioSemana(new Date()), -7 * (semanas - 1));
    const hoy = new Date();
    for (let i = 0; i < semanas * 7; i++) {
      const f = u.sumarDias(ini, i);
      const m = porDia[u.claveDia(f)] || 0;
      const prev = modelo.previstoDia(plan, f) || 30;
      const r = Math.min(1, m / prev);
      caja.appendChild(h('i', {
        title: `${u.fechaCorta(f)}: ${u.minutos(m)}`,
        style: f > hoy ? { opacity: 0.25 } : m ? { background: `color-mix(in srgb, var(--acento) ${Math.round(25 + r * 75)}%, var(--superficie-2))` } : {}
      }));
    }
    return caja;
  }

  function graficoTempo(puntos, objetivo, color) {
    const W = 600, H = 180, ml = 34, mb = 22, mt = 10, mr = 10;
    const vals = puntos.map(p => p.bpm).concat(objetivo ? [objetivo] : []);
    const lo = Math.max(0, Math.min(...vals) - 10), hi = Math.max(...vals) + 10;
    const t0 = puntos[0].fecha, t1 = Math.max(puntos[puntos.length - 1].fecha, t0 + 86400000);
    const x = t => ml + (W - ml - mr) * (t - t0) / (t1 - t0);
    const y = v => mt + (H - mt - mb) * (1 - (v - lo) / (hi - lo));
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Evolución del tempo' });
    const paso = hi - lo > 80 ? 20 : 10;
    for (let v = Math.ceil(lo / paso) * paso; v <= hi; v += paso) {
      svg.appendChild(s('line', { x1: ml, x2: W - mr, y1: y(v), y2: y(v), stroke: 'var(--borde)' }));
      svg.appendChild(s('text', { x: ml - 6, y: y(v) + 4, 'text-anchor': 'end' }, String(v)));
    }
    if (objetivo) {
      svg.appendChild(s('line', { x1: ml, x2: W - mr, y1: y(objetivo), y2: y(objetivo), stroke: 'var(--bien)', 'stroke-dasharray': '6 5', 'stroke-width': 2 }));
      svg.appendChild(s('text', { x: W - mr, y: y(objetivo) - 6, 'text-anchor': 'end', style: 'fill:var(--bien);font-weight:600' }, 'Objetivo ' + objetivo));
    }
    const c = color || 'var(--acento)';
    svg.appendChild(s('polyline', { points: puntos.map(p => x(p.fecha) + ',' + y(p.bpm)).join(' '), fill: 'none', stroke: c, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
    puntos.forEach(p => svg.appendChild(s('circle', { cx: x(p.fecha), cy: y(p.bpm), r: 4, fill: c }, s('title', {}, `${u.fechaCorta(p.fecha)}: ${p.bpm} BPM`))));
    svg.appendChild(s('text', { x: ml, y: H - 6 }, u.fechaCorta(t0)));
    svg.appendChild(s('text', { x: W - mr, y: H - 6, 'text-anchor': 'end' }, u.fechaCorta(t1)));
    return svg;
  }
})(window.Atril);
