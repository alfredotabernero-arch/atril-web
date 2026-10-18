/* Atril — pantallas de «Escuchar»: panel en el atril, informe, evolución y modo concierto */
(function (A) {
  'use strict';
  const { u, DB, modelo, icono } = A;
  const { h } = u;
  const E = () => A.escuchar;
  const NS = 'http://www.w3.org/2000/svg';
  const s = (tag, attrs, ...hijos) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
    hijos.flat().forEach(c => c && e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return e;
  };
  const sencillo = () => !!(A.sencillo && A.sencillo.activo);
  // 3.1: Escuchar se puede desactivar en Ajustes (entonces desaparece de toda la app)
  let activo = true;
  async function cargar() { activo = (await DB.kvGet('escucharActivo', true)) !== false; }
  async function poner(v) { activo = !!v; await DB.kvSet('escucharActivo', activo); }

  /**
   * Avisos del micrófono mientras escucha: «Te oigo ✓» en cuanto suena algo y «No te oigo» si pasan
   * unos segundos sin oír nada. Devuelve una función que recibe el estado del motor y da {texto, clase}.
   */
  function vigiaMic() {
    let oido = false, tOido = -1, t0 = null;
    return st => {
      if (t0 === null) t0 = st.t;
      if (st.sonando) { if (!oido) tOido = st.t; oido = true; }
      if (!oido) return st.t - t0 > 5 ? { texto: 'No te oigo: acerca el móvil a tu instrumento', clase: 'aviso' } : { texto: 'Toca cuando quieras: te estoy escuchando', clase: '' };
      if (st.t - tOido < 2.5) return { texto: 'Te oigo ✓', clase: 'ok' };
      const n = [st.paradas ? st.paradas + (st.paradas === 1 ? ' parada' : ' paradas') : '', st.dudas ? st.dudas + (st.dudas === 1 ? ' duda' : ' dudas') : ''].filter(Boolean).join(' · ');
      return { texto: (st.sonando ? 'Te oigo ✓' : 'Escuchando…') + (n ? ' · ' + n : ''), clase: st.sonando ? 'ok' : '' };
    };
  }
  const mmss = seg => { seg = Math.max(0, Math.round(seg)); return Math.floor(seg / 60) + ':' + String(seg % 60).padStart(2, '0'); };
  const rangoTxt = (d, hh) => d && hh ? (d === hh ? 'c. ' + d : 'c. ' + d + '–' + hh) : '';

  /** Qué se ha escuchado, en una línea: «B · Intermedio · c. 31–34 (pasaje)» */
  function queTxt(t, obra, secciones) {
    const sec = t.seccionId && (secciones || []).find(x => x.id === t.seccionId);
    const pas = t.pasajeId && obra && (obra.pasajes || []).find(p => p.id === t.pasajeId);
    if (t.modo === 'concierto') return '🎭 Pasada completa';
    if (pas) return '⚡ Pasaje ' + modelo.textoPasaje(pas);
    return [sec ? (sec.letra ? sec.letra + ' · ' : '') + sec.nombre : null, rangoTxt(t.desde, t.hasta)].filter(Boolean).join(' · ') || 'La obra';
  }

  /** Guarda una toma (y su grabación, si la hay) */
  async function guardar(toma, blob, etiqueta) {
    if (blob && blob.size > 1000) {
      const g = await DB.put('grabaciones', {
        obraId: toma.obraId, seccionId: toma.seccionId, fecha: toma.inicio, duracion: Math.round(toma.durTotal || toma.dur),
        nombre: (toma.modo === 'concierto' ? 'Pasada completa' : 'Escucha') + (etiqueta ? ' · ' + etiqueta : ''), blob, tomaId: null
      });
      toma.grabacionId = g.id;
    }
    const st = modelo.sesion.estado;
    if (st) toma.sesionInicio = st.inicio;
    await DB.put('tomas', toma);
    if (toma.grabacionId) { const g = await DB.get('grabaciones', toma.grabacionId); if (g) { g.tomaId = toma.id; await DB.put('grabaciones', g); } }
    if (toma.pasajeId && toma.obraId) await modelo.marcarPasajes(toma.obraId, [toma.pasajeId], { trabajado: Date.now() });
    return toma;
  }

  /* ============================ Línea de tiempo ============================ */
  function lineaTiempo(toma, alPulsar) {
    const W = 600, H = 70, dur = Math.max(1, toma.durTotal || toma.dur || toma.seg.length);
    const x = t => 6 + (W - 12) * Math.min(1, t / dur);
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'esc-linea', role: 'img', 'aria-label': 'Línea de tiempo de la escucha' });
    svg.appendChild(s('rect', { x: 6, y: 26, width: W - 12, height: 22, rx: 6, fill: 'var(--superficie-2)' }));
    toma.seg.forEach((b, i) => {
      const v = b[0] / 20;
      if (v <= 0.05) return;
      const afin = b[2] >= 3 ? b[1] / b[2] : null;
      svg.appendChild(s('rect', { x: x(i), y: 26 + 11 * (1 - v), width: Math.max(1.2, x(i + 1) - x(i) - 0.4), height: 22 * v, fill: afin == null || afin > 0.7 ? 'var(--primario)' : afin > 0.45 ? '#F5B400' : '#FF8A3D', opacity: 0.85 }));
    });
    toma.dudas.forEach(([t, d]) => svg.appendChild(s('rect', { x: x(t), y: 50, width: Math.max(3, x(t + d) - x(t)), height: 6, rx: 3, fill: '#F5B400' }, s('title', {}, `Duda de ${d.toFixed(1)} s en ${mmss(t)}`))));
    toma.paradas.forEach(([t, d]) => svg.appendChild(s('rect', { x: x(t), y: 50, width: Math.max(4, x(t + d) - x(t)), height: 8, rx: 3, fill: '#FF5A5F' }, s('title', {}, `Parada de ${d.toFixed(1)} s en ${mmss(t)}`))));
    toma.marcas.forEach(t => {
      svg.appendChild(s('path', { d: `M${x(t)} 24 V4 l12 5 -12 5`, fill: '#3D7BFF', stroke: '#3D7BFF', 'stroke-width': 2, 'stroke-linejoin': 'round' }, s('title', {}, 'Marca en ' + mmss(t))));
    });
    svg.appendChild(s('text', { x: 6, y: H - 1, 'font-size': 11, fill: 'var(--tinta-3)' }, '0:00'));
    svg.appendChild(s('text', { x: W - 6, y: H - 1, 'font-size': 11, fill: 'var(--tinta-3)', 'text-anchor': 'end' }, mmss(dur)));
    if (alPulsar) {
      svg.style.cursor = 'pointer';
      svg.addEventListener('click', ev => {
        const bb = svg.getBoundingClientRect();
        const t = ((ev.clientX - bb.left) / bb.width * W - 6) / (W - 12) * dur;
        alPulsar(u.clamp(t, 0, dur));
      });
    }
    return svg;
  }

  /* ============================ Informe ============================ */
  function filaMetrica(nombre, v, detalle, ayuda) {
    return h('div.esc-metrica',
      h('div.fila', h('b.crece', nombre), h('span.num', v == null ? '—' : v + ' %')),
      h('div.barra', h('i', { style: { width: (v || 0) + '%', background: E().color(v) } })),
      h('small.tenue', v == null ? ayuda : detalle));
  }

  async function informe(toma, opc = {}) {
    const obra = toma.obraId ? await DB.get('obras', toma.obraId) : null;
    const secciones = toma.obraId ? await DB.byIndex('secciones', 'obraId', toma.obraId) : [];
    const g = toma.grabacionId ? await DB.get('grabaciones', toma.grabacionId) : null;
    const m = toma.metricas || {};
    const v = toma.puntuacion;
    let audio = null, url = null;
    const reproducir = t => {
      if (!g) return;
      if (!audio) { url = URL.createObjectURL(g.blob); audio = new Audio(url); }
      audio.currentTime = Math.max(0, t - 2); audio.play().catch(() => {});
    };
    const nombreMedida = toma.medida === 'fluidez' ? 'Fluidez' : 'Confianza';
    const cabeza = sencillo()
      ? h('div.esc-nota', h('div.esc-estrellas', '★'.repeat(E().estrellas(v)), h('span', '★'.repeat(5 - E().estrellas(v)))),
          h('b', v == null ? 'Toca un poco más para que pueda escucharte' : v >= 80 ? '¡Genial!' : v >= 60 ? '¡Muy bien!' : v >= 40 ? '¡Bien! Sigue así' : 'Vamos a repetirlo con calma'))
      : h('div.esc-nota', { style: { '--c': E().color(v) } },
          h('div.esc-circulo', v == null ? '—' : v, h('small', v == null ? '' : '%')),
          h('div', h('b', nombreMedida + (v == null ? '' : ': ' + E().texto(v).toLowerCase())),
            h('div.mini.tenue', queTxt(toma, obra, secciones)),
            h('div.mini.tenue', `Has tocado ${mmss(toma.tocando)} de ${mmss(toma.dur)}`)));
    const paradasTxt = (toma.paradas.length ? toma.paradas.length + (toma.paradas.length === 1 ? ' parada' : ' paradas') : 'Sin paradas') +
      (toma.dudas.length ? ' · ' + toma.dudas.length + (toma.dudas.length === 1 ? ' duda' : ' dudas') : '');
    const notas = h('textarea', { placeholder: 'Qué ha pasado, qué repetir…', value: toma.notas || '' });
    const marcas = toma.marcas.length || toma.paradas.length ? h('ul.esc-momentos',
      toma.marcas.map(t => ['⚑', 'Marca', t]).concat(toma.paradas.map(([t, d]) => ['■', 'Parada de ' + d.toFixed(1) + ' s', t])).sort((a, b) => a[2] - b[2]).map(([ic, txt, t]) =>
        h('li', h('span.esc-ic' + (ic === '■' ? '.parada' : ''), ic), h('span.crece', txt + ' en ' + mmss(t)),
          g ? h('button.btn-icono', { type: 'button', 'aria-label': 'Escuchar desde aquí', title: 'Escuchar desde 2 s antes', onclick: () => reproducir(t) }, icono('play')) : null))) : null;
    // 3.1: primero lo esencial (la nota y tres líneas); la línea de tiempo, los momentos y las notas, plegados
    const detalle = h('details.esc-detalle',
      h('summary', 'Ver el detalle' + (g ? ' y la grabación' : '')),
      lineaTiempo(toma, g ? reproducir : null),
      h('div.leyenda.esc-ley', h('span', h('i', { style: { background: 'var(--primario)' } }), 'Sonando'), h('span', h('i', { style: { background: '#FF5A5F' } }), 'Parada'),
        h('span', h('i', { style: { background: '#F5B400' } }), 'Duda'), h('span', h('i', { style: { background: '#3D7BFF' } }), 'Marca')),
      g ? h('p.mini.tenue', { style: { margin: '4px 0 0' } }, 'Toca la línea de tiempo para escuchar la grabación desde ese momento.') : null,
      marcas,
      u.campo('Notas', notas));
    const cuerpo = h('div.esc-informe',
      cabeza,
      sencillo() ? h('p', h('b', paradasTxt)) : h('div.esc-metricas',
        filaMetrica('Continuidad', m.continuidad, paradasTxt, 'Toca un poco más para medirla.'),
        toma.modo === 'lectura' ? null : filaMetrica('Afinación', m.afinacion, 'Notas afinadas (±' + E().TOL_AFIN + ' cents)', 'Pocas notas claras: acércate al micrófono.'),
        filaMetrica('Pulso', m.pulso, 'Regularidad entre las notas', 'Pocas notas para medir el pulso.')),
      detalle);
    const r = await u.modal(opc.titulo || (toma.modo === 'concierto' ? 'Pasada completa' : 'Lo que he escuchado'), cuerpo, [
      { texto: 'Borrar', clase: 'peligro', accion: async () => (await u.confirmar('¿Borrar esta escucha' + (g ? ' y su grabación' : '') + '?', 'Borrar', 'peligro')) ? 'borrar' : false },
      { texto: 'Hecho', clase: 'primario', accion: () => 'ok' }
    ]);
    if (audio) { audio.pause(); URL.revokeObjectURL(url); }
    if (r === 'borrar') {
      await DB.del('tomas', toma.id);
      if (toma.grabacionId) await DB.del('grabaciones', toma.grabacionId);
      u.toast('Escucha borrada');
      return 'borrada';
    }
    if (notas.value !== (toma.notas || '')) { toma.notas = notas.value; await DB.put('tomas', toma); }
    return 'ok';
  }

  /* ============================ Panel en «En el atril» ============================ */
  /**
   * Panel de la pestaña «Escuchar» del atril.
   * o: { obra, sec, pasajes, pasajeActivo(), alEmpezar(), alTerminar() }
   */
  function panelAtril(o) {
    const { obra, sec } = o;
    const lectura = modelo.faseDe(sec) === 'lectura';
    let objetivo = null;   // {tipo:'seccion'|'compases'|'pasaje', desde, hasta, pasaje}
    let grabar = false, motor = null, offMotor = null, tReloj = 0;
    const caja = h('div.esc-panel');
    DB.kvGet('escucharGrabar', false).then(v => { grabar = !!v; if (!motor) pintar(); });

    function objetivoInicial() {
      const act = o.pasajeActivo && o.pasajeActivo();
      const p = act && o.pasajes.find(x => x.id === act);
      if (p) return { tipo: 'pasaje', pasaje: p, desde: p.desde, hasta: p.hasta };
      return { tipo: 'seccion', desde: sec.desde || null, hasta: sec.hasta || null };
    }
    async function elegirCompases() {
      const d = h('input', { type: 'number', name: 'desde', min: sec.desde || 1, max: sec.hasta || 5000, value: (objetivo && objetivo.tipo === 'compases' ? objetivo.desde : (lectura && sec.leidoHasta >= sec.desde ? sec.leidoHasta + 1 : sec.desde)) || '' });
      const hh = h('input', { type: 'number', name: 'hasta', min: sec.desde || 1, max: sec.hasta || 5000, value: (objetivo && objetivo.tipo === 'compases' ? objetivo.hasta : '') || '' });
      const r = await u.modal('¿Qué compases vas a tocar?', h('div', h('div.rejilla-2', u.campo('Desde el compás', d), u.campo('Hasta el compás', hh)),
        h('p.mini.tenue', { style: { margin: 0 } }, lectura ? 'En lectura, por ejemplo lo que vas a leer hoy. Si no sabes hasta dónde llegarás, deja «hasta» vacío.' : 'Unos compases concretos dentro de esta sección.')), [
        { texto: 'Cancelar', accion: () => null },
        { texto: 'Elegir', clase: 'primario', accion: () => {
          const a = Number(d.value), b = Number(hh.value) || null;
          if (!(a >= 1)) { u.toast('Indica el compás de inicio'); return false; }
          return { tipo: 'compases', desde: a, hasta: b && b >= a ? b : null };
        } }
      ]);
      if (r) { objetivo = r; pintar(); }
    }

    const textoObjetivo = () => objetivo.tipo === 'pasaje' ? '⚡ ' + modelo.textoPasaje(objetivo.pasaje)
      : objetivo.tipo === 'compases' ? 'c. ' + objetivo.desde + (objetivo.hasta ? '–' + objetivo.hasta : ' en adelante')
      : 'Esta sección' + (modelo.rangoTexto(sec) ? ' (' + modelo.rangoTexto(sec) + ')' : '');
    async function cambiarObjetivo() {
      const r = await u.modal('¿Qué vas a tocar?', cerrar => h('div.esc-elegir',
        h('button.btn.bloque', { type: 'button', onclick: () => cerrar({ tipo: 'seccion', desde: sec.desde || null, hasta: sec.hasta || null }) },
          'Esta sección' + (modelo.rangoTexto(sec) ? ' · ' + modelo.rangoTexto(sec) : '')),
        ...o.pasajes.map(p => h('button.btn.bloque.pas', { type: 'button', onclick: () => cerrar({ tipo: 'pasaje', pasaje: p, desde: p.desde, hasta: p.hasta }) }, '⚡ ' + modelo.textoPasaje(p))),
        h('button.btn.bloque', { type: 'button', onclick: () => cerrar('compases') }, 'Unos compases…')), [
        { texto: 'Cancelar', accion: () => null }
      ]);
      if (r === 'compases') return elegirCompases();
      if (r) objetivo = r;
      pintar();
    }

    function pintar() {
      if (!objetivo) objetivo = objetivoInicial();
      if (motor) return;
      caja.replaceChildren(
        h('div.esc-inicio',
          h('div.esc-que-linea', h('span.mini.tenue', lectura ? 'Escucharé tu lectura de:' : 'Escucharé:'), h('b', textoObjetivo()),
            h('button.enlace.mini', { type: 'button', onclick: cambiarObjetivo }, 'Cambiar')),
          h('button.btn.primario.esc-boton', { type: 'button', onclick: empezar }, icono('oido'), 'Escúchame'),
          h('p.mini.tenue', { style: { margin: 0, textAlign: 'center' } }, lectura ? 'Mido la fluidez: si lees sin pararte y con pulso.' : 'Mido paradas, afinación y pulso. Al terminar de tocar, para solo.')));
    }

    async function empezar() {
      await o.alEmpezar();   // el atril para el metrónomo y apaga el afinador
      grabar = !!(await DB.kvGet('escucharGrabar', false));
      motor = E().crearMotor({
        obraId: obra && obra.id, seccionId: sec.id, pasajeId: objetivo.tipo === 'pasaje' ? objetivo.pasaje.id : null,
        desde: objetivo.desde, hasta: objetivo.hasta, modo: lectura ? 'lectura' : 'normal'
      });
      caja.replaceChildren(h('div.esc-estado', h('b', 'Preparando el micrófono…')));
      try { await motor.empezar({ grabar }); }
      catch (e) { u.toast(e.message, 4000); motor = null; pintar(); return; }
      if (objetivo.tipo === 'pasaje') await modelo.sesion.pasaje(objetivo.pasaje.id);
      const reloj = h('b.num.esc-reloj', '0:00');
      const nivel = h('i');
      const estado = h('b.esc-estado-txt', 'Toca cuando quieras: te estoy escuchando');
      const btnMarca = h('button.btn.pequeno', { type: 'button', title: 'Marca este momento', onclick: () => { const t = motor.marcar(); u.toast('⚑ Marcado en ' + mmss(t), 1200); } }, '⚑ Marcar');
      const bloque = h('div.esc-estado',
        h('div.fila', { style: { gap: '10px', width: '100%' } }, h('span.esc-punto' + (grabar ? '.rec' : '')), reloj, h('div.esc-nivel.medio', nivel)),
        estado,
        h('div.fila', { style: { gap: '10px', justifyContent: 'center' } }, btnMarca,
          h('button.btn.esc-parar', { type: 'button', onclick: () => terminar(true) }, icono('stop'), 'Parar')));
      caja.replaceChildren(bloque);
      const vigia = vigiaMic();
      let silencio = 0;
      offMotor = motor.on(st => {
        nivel.style.width = Math.round(st.nivel * 100) + '%';
        nivel.classList.toggle('on', st.sonando);
        const v = vigia(st);
        estado.textContent = v.texto;
        bloque.classList.toggle('aviso', v.clase === 'aviso');
        bloque.classList.toggle('ok', v.clase === 'ok');
        // al terminar de tocar: tras 7 s de silencio, para solo y enseña el informe
        silencio = st.sonando ? 0 : silencio + 0.25;
        if (motor && motor.toma.tocando > 3 && silencio >= 7) { u.toast('Has dejado de tocar: aquí tienes el informe', 2000); terminar(true); }
        else if (motor && motor.toma.tocando > 3 && silencio >= 3) estado.textContent = '¿Has terminado? Paro en unos segundos';
      });
      tReloj = setInterval(() => { reloj.textContent = mmss(motor.segundos()); }, 500);
      u.pantallaEncendida(true, 'escuchar');
    }

    async function terminar(verInforme) {
      if (!motor) return;
      const m = motor; motor = null;
      clearInterval(tReloj); if (offMotor) offMotor();
      u.pantallaEncendida(false, 'escuchar');
      caja.replaceChildren(h('div.atril-metro.esc-fila', h('span.tenue', 'Preparando el informe…')));
      const { toma, blob } = await m.parar();
      if (toma.dur < 2 && toma.tocando < 1) { u.toast('No he oído nada: acércate al micrófono'); pintar(); return; }
      const et = objetivo.tipo === 'pasaje' ? 'c. ' + objetivo.desde + '–' + objetivo.hasta : rangoTxt(objetivo.desde, objetivo.hasta);
      await guardar(toma, blob, et);
      if (o.alTerminar) o.alTerminar(toma);
      if (verInforme) await informe(toma);
      else u.toast('Escucha guardada' + (toma.puntuacion != null ? ': ' + toma.puntuacion + ' %' : ''));
      pintar();
    }

    pintar();
    return { nodo: caja, activo: () => !!motor, parar: () => terminar(false), alternar: () => (motor ? terminar(true) : empezar()) };
  }

  /* ============================ Evolución (fase 2) ============================ */
  function grafico(tomas, alto = 110) {
    const l = tomas.filter(t => t.puntuacion != null).sort((a, b) => a.inicio - b.inicio).slice(-30);
    const W = 600, H = alto, ml = 30, mb = 18, mt = 8;
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'esc-evol', role: 'img', 'aria-label': 'Evolución de las escuchas' });
    const y = v => mt + (H - mt - mb) * (1 - v / 100);
    [0, 50, 100].forEach(v => {
      svg.appendChild(s('line', { x1: ml, x2: W, y1: y(v), y2: y(v), stroke: 'var(--borde)', 'stroke-width': 1 }));
      svg.appendChild(s('text', { x: ml - 6, y: y(v) + 4, 'text-anchor': 'end', 'font-size': 11, fill: 'var(--tinta-3)' }, String(v)));
    });
    if (!l.length) return svg;
    const x = i => l.length === 1 ? (ml + W) / 2 : ml + 8 + (W - ml - 16) * i / (l.length - 1);
    svg.appendChild(s('polyline', { points: l.map((t, i) => x(i) + ',' + y(t.puntuacion)).join(' '), fill: 'none', stroke: 'var(--primario)', 'stroke-width': 2.5, 'stroke-linejoin': 'round', opacity: 0.55 }));
    l.forEach((t, i) => svg.appendChild(s('circle', { cx: x(i), cy: y(t.puntuacion), r: 5, fill: E().color(t.puntuacion) },
      s('title', {}, `${u.fechaCorta(t.inicio)}: ${t.puntuacion} %${t.modo === 'concierto' ? ' (pasada completa)' : ''}`))));
    svg.appendChild(s('text', { x: ml + 4, y: H - 3, 'font-size': 11, fill: 'var(--tinta-3)' }, u.fechaCorta(l[0].inicio)));
    if (l.length > 1) svg.appendChild(s('text', { x: W - 4, y: H - 3, 'font-size': 11, fill: 'var(--tinta-3)', 'text-anchor': 'end' }, u.fechaCorta(l[l.length - 1].inicio)));
    return svg;
  }

  function filaToma(t, obra, secciones, alCambiar) {
    const v = t.puntuacion;
    return h('li', h('button.item.esc-item', { type: 'button', onclick: async () => { await informe(t); alCambiar && alCambiar(); } },
      h('span.esc-mini', { style: { background: E().color(v) } }, sencillo() ? '★' + E().estrellas(v) : v == null ? '—' : v),
      h('div.crece', h('div', h('b', queTxt(t, obra, secciones))),
        h('div.mini.tenue', [u.fechaCorta(t.inicio) + ' ' + u.hora(t.inicio), mmss(t.dur), t.paradas.length ? t.paradas.length + (t.paradas.length === 1 ? ' parada' : ' paradas') : 'sin paradas',
          t.grabacionId ? '🎙 grabada' : null, t.modo === 'lectura' ? 'fluidez' : null].filter(Boolean).join(' · '))),
      icono('adelante')));
  }

  /** Tarjeta «Escuchar» de la ficha de una sección */
  function tarjetaSeccion(sec, obra, tomas) {
    const mias = tomas.filter(t => t.seccionId === sec.id).sort((a, b) => b.inicio - a.inicio);
    const c = E().deSeccion(sec, tomas);
    const pas = modelo.pasajesEnSeccion(obra, sec);
    return h('section.tarjeta.tarjeta-escuchar',
      h('div.tarjeta-cab', h('span.tarjeta-icono', { style: { background: '#16B4C8' } }, icono('oido')), h('h2.crece', 'Escuchar'),
        c ? h('span.esc-mini.grande', { style: { background: E().color(c.valor) } }, sencillo() ? '★' + E().estrellas(c.valor) : c.valor + ' %') : null),
      c ? h('p.mini.tenue', { style: { marginTop: 0 } }, (c.medida === 'fluidez' ? 'Fluidez de lectura' : 'Confianza') + ' según tus últimas escuchas: ' + E().texto(c.valor).toLowerCase() + '.')
        : h('p.mini.tenue', { style: { marginTop: 0 } }, 'En «En el atril», pestaña Escuchar, Atril escucha cómo tocas esta sección y te da su ' + (modelo.faseDe(sec) === 'lectura' ? 'fluidez de lectura' : 'confianza') + '.'),
      pas.length ? h('div.fila.envuelve', { style: { gap: '6px', marginBottom: '8px' } }, pas.map(p => {
        const cp = E().dePasaje(p, tomas);
        return h('span.chip', { style: cp ? { background: `color-mix(in srgb, ${E().color(cp.valor)} 18%, transparent)` } : {} }, '⚡ ' + modelo.textoPasaje(p) + (cp ? ' · ' + (sencillo() ? '★' + E().estrellas(cp.valor) : cp.valor + ' %') : ' · sin escuchar'));
      })) : null,
      mias.length > 1 ? grafico(mias) : null,
      mias.length ? h('ul.lista', mias.slice(0, 5).map(t => filaToma(t, obra, [sec], () => A.app.refrescar()))) : null,
      h('a.btn' + (mias.length ? '' : '.primario'), { href: '#/atril/' + sec.id + '/escuchar', style: { marginTop: '8px' } }, icono('oido'), 'Escuchar en el atril'));
  }

  /** Tarjeta «Escuchar y modo concierto» de la ficha de una obra */
  function tarjetaObra(obra, secciones, tomas) {
    const pasadas = tomas.filter(t => t.modo === 'concierto').sort((a, b) => b.inicio - a.inicio);
    const limpias = pasadas.filter(t => !t.paradas.length && t.tocando > 20).length;
    const resto = tomas.filter(t => t.modo !== 'concierto').sort((a, b) => b.inicio - a.inicio);
    let verTodas = false;
    const lista = h('ul.lista');
    const pintarLista = () => lista.replaceChildren(...resto.slice(0, verTodas ? 50 : 4).map(t => filaToma(t, obra, secciones, () => A.app.refrescar())));
    pintarLista();
    return h('section.tarjeta.tarjeta-escuchar',
      h('div.tarjeta-cab', h('span.tarjeta-icono', { style: { background: '#16B4C8' } }, icono('oido')), h('h2.crece', 'Escuchar y modo concierto')),
      h('div.esc-concierto-cab',
        h('div.crece', h('b', '🎭 Modo concierto'),
          h('div.mini.tenue', pasadas.length
            ? `${pasadas.length} ${pasadas.length === 1 ? 'pasada completa' : 'pasadas completas'}${limpias ? ', ' + limpias + (limpias === 1 ? ' limpia (sin paradas)' : ' limpias (sin paradas)') : ''}. La última: ${pasadas[0].puntuacion == null ? '—' : pasadas[0].puntuacion + ' %'}.`
            : 'Toca la obra entera, de principio a fin y sin parar, como en el concierto.')),
        h('button.btn.primario', { onclick: () => concierto(obra) }, 'Empezar')),
      pasadas.length ? grafico(pasadas, 90) : null,
      pasadas.length ? h('ul.lista', pasadas.slice(0, 3).map(t => filaToma(t, obra, secciones, () => A.app.refrescar()))) : null,
      h('div.fila', { style: { marginTop: '10px' } }, h('b.crece', 'Escuchas'),
        h('button.btn.pequeno', { onclick: () => escena({ obra, secciones, modo: 'normal' }) }, icono('oido'), 'Escuchar unos compases')),
      resto.length ? lista : h('p.mini.tenue', { style: { margin: '4px 0 0' } }, secciones.length ? 'Las escuchas de cada sección se hacen en «En el atril». Aquí salen todas, y puedes escuchar unos compases de la obra.' : 'Escucha unos compases: Atril mide tus paradas, la afinación y el pulso.'),
      resto.length > 4 ? h('button.enlace.mini', { onclick: e => { verTodas = !verTodas; pintarLista(); e.currentTarget.textContent = verTodas ? 'Ver menos' : 'Ver todas (' + resto.length + ')'; } }, 'Ver todas (' + resto.length + ')') : null);
  }

  /* ============================ Escena a pantalla completa (fase 3) ============================ */
  /**
   * Escucha a pantalla completa. modo 'concierto': la obra entera sin parar, con cuenta atrás,
   * grabación y aplausos; modo 'normal': unos compases de una obra (también sin secciones).
   */
  async function escena(o) {
    const { obra } = o;
    const secciones = o.secciones || await DB.byIndex('secciones', 'obraId', obra.id);
    const concierto = o.modo === 'concierto';
    let desde = null, hasta = null, modo = concierto ? 'concierto' : 'normal';
    if (!concierto) {
      const lect = modelo.estadoObra(obra, secciones) === 'lectura';
      const d = h('input', { type: 'number', min: 1, max: obra.compases || 5000, placeholder: '1' });
      const hh = h('input', { type: 'number', min: 1, max: obra.compases || 5000, placeholder: obra.compases || '' });
      const chkLect = h('input', { type: 'checkbox', checked: lect });
      const r = await u.modal('¿Qué vas a tocar?', h('div', h('div.rejilla-2', u.campo('Desde el compás', d), u.campo('Hasta el compás', hh)),
        h('label.interruptor', h('span', 'Estoy leyendo (medir la fluidez)'), chkLect),
        h('p.mini.tenue', { style: { margin: '6px 0 0' } }, 'Puedes dejarlo vacío. Pulsa empezar, toca y para cuando quieras.')), [
        { texto: 'Cancelar', accion: () => null },
        { texto: 'Empezar', clase: 'primario', accion: () => ({ d: Number(d.value) || null, h: Number(hh.value) || null, l: chkLect.checked }) }
      ]);
      if (!r) return;
      desde = r.d; hasta = r.h && r.d && r.h >= r.d ? r.h : null; modo = r.l ? 'lectura' : 'normal';
    }
    let grabar = concierto ? await DB.kvGet('conciertoGrabar', true) : await DB.kvGet('escucharGrabar', false);
    let aplausos = await DB.kvGet('conciertoAplausos', true);
    if (A.audio.Metronomo.activo) await A.audio.Metronomo.parar();
    if (!modelo.sesion.estado) { await modelo.sesion.iniciar(obra.id, null); }
    else if (modelo.sesion.estado.obraId !== obra.id) {
      if (!(await u.confirmar('Tienes una sesión de otra obra en marcha. ¿Seguir aquí de todos modos? Los minutos irán a esa sesión.', 'Seguir'))) return;
    }
    const capa = h('div.esc-escena' + (concierto ? '.concierto' : ''), { style: { '--c': obra.color || 'var(--primario)' } });
    document.body.appendChild(capa);
    u.pantallaEncendida(true, 'escena');
    let motor = null, tReloj = 0, off = null, cerrada = false;
    const cerrar = () => { if (cerrada) return; cerrada = true; clearInterval(tReloj); if (off) off(); if (motor) motor.cancelar(); u.pantallaEncendida(false, 'escena'); capa.remove(); document.removeEventListener('keydown', teclas); };
    const teclas = ev => { if (ev.key === 'Escape' && !motor) cerrar(); };
    document.addEventListener('keydown', teclas);

    const titulo = h('div.esc-escena-tit', h('small', concierto ? 'MODO CONCIERTO' : 'ESCUCHAR'), h('b', obra.titulo), obra.compositor ? h('span', obra.compositor) : null,
      !concierto && (desde || hasta) ? h('span', 'c. ' + (desde || 1) + '–' + (hasta || '…')) : null);
    function preparar() {
      const chk = (txt, v, f) => { const c = h('input', { type: 'checkbox', checked: v }); c.addEventListener('change', () => f(c.checked)); return h('label.interruptor', h('span', txt), c); };
      capa.replaceChildren(h('button.btn-icono.esc-cerrar', { 'aria-label': 'Cerrar', onclick: cerrar }, icono('x')),
        titulo,
        h('div.esc-escena-cuerpo',
          concierto ? h('p', 'Como en el concierto: de principio a fin, ', h('b', 'pase lo que pase, no pares'), '. Si te equivocas, sigue. Al terminar verás dónde ha habido paradas y dudas.') : h('p', 'Toca cuando quieras. Al terminar de tocar, paro solo.'),
          h('div.esc-opciones', chk('Grabar para escucharme después', grabar, v => { grabar = v; DB.kvSet(concierto ? 'conciertoGrabar' : 'escucharGrabar', v); }),
            concierto ? chk('Aplausos al final', aplausos, v => { aplausos = v; DB.kvSet('conciertoAplausos', v); }) : null),
          h('button.btn.blanco.sen-grande', { onclick: concierto ? cuentaAtras : empezar }, icono(concierto ? 'play' : 'oido'), concierto ? 'Salir al escenario' : 'Escúchame')));
    }
    async function cuentaAtras() {
      const num = h('div.esc-cuenta', '5');
      capa.replaceChildren(titulo, h('div.esc-escena-cuerpo', h('p', 'Colócate, respira… y empieza cuando quieras después del 1.'), num));
      for (let i = 5; i >= 1; i--) { if (cerrada) return; num.textContent = i; num.classList.remove('late'); void num.offsetWidth; num.classList.add('late'); await new Promise(r => setTimeout(r, 1000)); }
      empezar();
    }
    async function empezar() {
      motor = E().crearMotor({ obraId: obra.id, seccionId: null, desde, hasta, modo });
      try { await motor.empezar({ grabar }); } catch (e) { u.toast(e.message); motor = null; preparar(); return; }
      const reloj = h('div.esc-escena-reloj', '0:00');
      const nivel = h('i');
      const estado = h('p.esc-escena-estado', concierto ? '¡A tocar!' : 'Toca cuando quieras: te estoy escuchando');
      capa.replaceChildren(titulo, h('div.esc-escena-cuerpo',
        h('span.esc-punto.grande' + (grabar ? '.rec' : '')), reloj, h('div.esc-nivel.grande', nivel), estado,
        h('div.fila', { style: { justifyContent: 'center', gap: '12px', marginTop: '18px' } },
          h('button.btn.translucido', { onclick: () => { const t = motor.marcar(); u.toast('⚑ Marcado en ' + mmss(t), 1200); } }, '⚑ Marcar'),
          h('button.btn.blanco', { onclick: () => terminar() }, icono('stop'), concierto ? 'He terminado' : 'Parar'))));
      let silencioLargo = 0;
      const vigia = vigiaMic();
      off = motor.on(st => {
        nivel.style.width = Math.round(st.nivel * 100) + '%';
        nivel.classList.toggle('on', st.sonando);
        const v = vigia(st);
        if (!concierto) {
          estado.textContent = v.texto;
          silencioLargo = st.sonando ? 0 : silencioLargo + 0.25;
          if (motor && motor.toma.tocando > 3 && silencioLargo >= 7) { terminar(); return; }
        } else if (v.clase === 'aviso') { estado.textContent = v.texto; return; }
        // en el concierto: tras 8 s de silencio con la obra ya tocada, se da por terminada
        if (concierto) {
          silencioLargo = st.sonando ? 0 : silencioLargo + 0.25;
          if (motor && motor.toma.tocando > 20 && silencioLargo >= 8) terminar();
          else if (silencioLargo >= 3 && motor.toma.tocando > 5) estado.textContent = 'Si has terminado, espera un momento o pulsa «He terminado»';
          else estado.textContent = '¡A tocar!';
        }
      });
      tReloj = setInterval(() => { reloj.textContent = mmss(motor.segundos()); }, 500);
    }
    async function terminar() {
      if (!motor) return;
      const m = motor; motor = null;
      clearInterval(tReloj); if (off) off();
      const { toma, blob } = await m.parar();
      if (concierto && aplausos && toma.tocando > 5) aplaudir();
      capa.replaceChildren(titulo, h('div.esc-escena-cuerpo', h('p', concierto ? (toma.paradas.length ? '¡Bravo! Has llegado al final.' : '¡Bravo! Una pasada limpia, sin paradas. 👏') : 'Hecho.')));
      if (toma.tocando < 1) { u.toast('No he oído nada: acércate al micrófono'); cerrar(); return; }
      await guardar(toma, blob, concierto ? obra.titulo : rangoTxt(desde, hasta));
      await new Promise(r => setTimeout(r, concierto && aplausos ? 2200 : 400));
      cerrar();
      await informe(toma, { titulo: concierto ? (toma.paradas.length ? 'Pasada completa' : 'Pasada limpia 👏') : undefined });
      A.app.refrescar();
    }
    preparar();
  }
  const concierto = obra => escena({ obra, modo: 'concierto' });

  /** Aplausos sintetizados (ruido filtrado a golpes), unos 4 segundos */
  function aplaudir() {
    try {
      const c = A.audio.contexto(), sr = c.sampleRate, dur = 4.2;
      const b = c.createBuffer(1, sr * dur, sr), d = b.getChannelData(0);
      for (let k = 0; k < 900; k++) {
        const t0 = Math.random() * (dur - 0.3) * Math.pow(Math.random(), 0.35);
        const amp = 0.25 + Math.random() * 0.5, len = 0.015 + Math.random() * 0.02;
        const i0 = Math.floor(t0 * sr), n = Math.floor(len * sr);
        for (let i = 0; i < n && i0 + i < d.length; i++) d[i0 + i] += (Math.random() * 2 - 1) * amp * Math.exp(-i / (n / 4));
      }
      for (let i = 0; i < d.length; i++) d[i] *= Math.min(1, i / (sr * 0.3)) * Math.min(1, (d.length - i) / (sr * 1.6)) * 0.35;
      const src = c.createBufferSource(); src.buffer = b;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.6;
      src.connect(f); f.connect(c.destination); src.start();
    } catch (e) { /* sin sonido */ }
  }

  A.escucharUI = { cargar, poner, activo: () => activo, panelAtril, informe, lineaTiempo, grafico, tarjetaSeccion, tarjetaObra, escena, concierto, queTxt, guardar };
})(window.Atril);
