/* Atril — contenedor de herramientas y metrónomo */
(function (A) {
  'use strict';
  const { u, DB, modelo, icono, audio } = A;
  const { h } = u;
  const M = audio.Metronomo;

  A.herr = A.herr || {};

  const HERRAMIENTAS = [
    { id: 'metronomo', nombre: 'Metrónomo' },
    { id: 'afinador', nombre: 'Afinador' },
    { id: 'pedal', nombre: 'Nota pedal' },
    { id: 'grabadora', nombre: 'Grabadora' },
    { id: 'contador', nombre: 'Repeticiones' },
    { id: 'relax', nombre: 'Relajación' }
  ];

  A.vistas.herramientas = {
    titulo: 'Herramientas',
    async render(ctx) {
      // en el modo sencillo, solo metrónomo y afinador
      const lista = A.sencillo && A.sencillo.activo ? HERRAMIENTAS.filter(x => x.id === 'metronomo' || x.id === 'afinador') : HERRAMIENTAS;
      const id = ctx.params[0] || (await DB.kvGet('ultimaHerramienta', 'metronomo'));
      const herr = lista.find(x => x.id === id) || lista[0];
      if (lista === HERRAMIENTAS) DB.kvSet('ultimaHerramienta', herr.id);
      ctx.titulo.textContent = herr.nombre;
      ctx.main.appendChild(h('div.segmentado' + (lista.length < 3 ? '.sen-herr' : ''), { style: { marginBottom: '14px' } }, lista.map(x =>
        h('button' + (x.id === herr.id ? '.on' : ''), { onclick: () => (location.hash = '#/herramientas/' + x.id) }, x.nombre))));
      const cont = h('div');
      ctx.main.appendChild(cont);
      return A.herr[herr.id](Object.assign({}, ctx, { main: cont, params: ctx.params.slice(1) }));
    }
  };

  /* ============================ METRÓNOMO ============================ */
  const CFG_DEF = {
    bpm: 90, num: 4, den: 4, acentos: [3, 2, 2, 2], subdiv: 1, sonido: 'clic', volumen: 0.8, destello: false,
    entrenador: { activo: false, desde: 60, hasta: 100, paso: 2, cadaCompases: 4 },
    silencio: { activo: false, tocar: 2, callar: 2 },
    limiteMin: 0, autoSesion: true
  };
  const PRESETS = [
    { t: '2/4', num: 2, den: 4, ac: [3, 2] },
    { t: '3/4', num: 3, den: 4, ac: [3, 2, 2] },
    { t: '4/4', num: 4, den: 4, ac: [3, 2, 2, 2] },
    { t: '5/8', num: 5, den: 8, ac: [3, 1, 1, 2, 1] },
    { t: '6/8', num: 6, den: 8, ac: [3, 1, 1, 2, 1, 1] },
    { t: '7/8', num: 7, den: 8, ac: [3, 1, 2, 1, 2, 1, 1] },
    { t: '9/8', num: 9, den: 8, ac: [3, 1, 1, 2, 1, 1, 2, 1, 1] },
    { t: '12/8', num: 12, den: 8, ac: [3, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1] }
  ];
  const SUBDIV = [
    { n: 1, t: '♩', d: 'Negras' }, { n: 2, t: '♫', d: 'Corcheas' }, { n: 3, t: '3', d: 'Tresillos' }, { n: 4, t: '♬♬', d: 'Semicorcheas' }
  ];

  A.herr.metronomo = async function ({ main, params }) {
    const guardado = await DB.kvGet('metroCfg', null);
    const cfg = Object.assign({}, CFG_DEF, guardado || {});
    cfg.entrenador = Object.assign({}, CFG_DEF.entrenador, cfg.entrenador);
    cfg.silencio = Object.assign({}, CFG_DEF.silencio, cfg.silencio);
    if (cfg.acentos.length !== cfg.num) cfg.acentos = ajustarAcentos(cfg.acentos, cfg.num);

    // ---------- contexto: sección u obra
    let seccion = null, obra = null;
    const p = params[0] || '';
    if (p.startsWith('obra:')) obra = await DB.get('obras', p.slice(5));
    else if (p) { seccion = await DB.get('secciones', p); if (seccion) obra = await DB.get('obras', seccion.obraId); }
    if (!M.activo) {
      const actual = seccion && seccion.tempoActual, objetivo = (seccion && seccion.tempoObjetivo) || (obra && obra.tempoObjetivo);
      if (actual) cfg.bpm = actual;
      else if (objetivo) cfg.bpm = Math.round(objetivo * 0.7);
      if (actual && objetivo && actual < objetivo) {
        cfg.entrenador.desde = actual; cfg.entrenador.hasta = objetivo;
      }
    }

    let tapTimes = [];
    const guardar = () => { DB.kvSet('metroCfg', cfg); if (M.activo) M.actualizar(cfg); };

    // ---------- elementos
    const pulsos = h('div.metro-pulsos');
    const bpmEl = h('div.metro-bpm', { title: 'Escribir tempo', role: 'button', tabindex: 0 });
    const nombreEl = h('div.metro-nombre');
    const slider = h('input', { type: 'range', min: 20, max: 300, step: 1, 'aria-label': 'Tempo' });
    const playBtn = h('button.metro-play', { 'aria-label': 'Arrancar' });
    const estadoEl = h('div.mini.tenue.num', { style: { minHeight: '1.4em' } });
    const flash = h('div.metro-flash');
    document.body.appendChild(flash);

    function pintarPulsos() {
      pulsos.innerHTML = '';
      for (let i = 0; i < cfg.num; i++) {
        const b = h('button.metro-pulso', { type: 'button', 'data-n': cfg.acentos[i], 'aria-label': 'Pulso ' + (i + 1) + ', toca para cambiar el acento', title: 'Toca para cambiar el acento' },
          h('i'), h('i'), h('i'));
        b.addEventListener('click', () => {
          cfg.acentos[i] = (cfg.acentos[i] + 3) % 4; // 3→2→1→0→3
          b.dataset.n = cfg.acentos[i];
          guardar();
        });
        pulsos.appendChild(b);
      }
    }
    function pintarBpm(b) {
      bpmEl.textContent = b;
      nombreEl.textContent = modelo.nombreTempo(b);
      slider.value = b;
    }
    function setBpm(b) {
      cfg.bpm = u.clamp(Math.round(b), 20, 300);
      pintarBpm(cfg.bpm);
      if (cfg.entrenador.activo && M.activo) { /* el entrenador manda mientras suena */ }
      guardar();
    }
    function pintarPlay() {
      playBtn.innerHTML = '';
      playBtn.appendChild(icono(M.activo ? 'stop' : 'play'));
      playBtn.setAttribute('aria-label', M.activo ? 'Parar' : 'Arrancar');
      if (!M.activo) { estadoEl.textContent = ''; u.$$('.metro-pulso', pulsos).forEach(x => x.classList.remove('on', 'fuerte')); }
    }

    playBtn.addEventListener('click', async () => {
      if (M.activo) { await M.parar(); return; }
      if (cfg.autoSesion && !modelo.sesion.estado) {
        await modelo.sesion.iniciar(obra ? obra.id : null, seccion ? seccion.id : null);
        u.toast('Cronómetro de estudio en marcha');
      }
      await M.iniciar(cfg);
    });
    slider.addEventListener('input', () => setBpm(Number(slider.value)));
    bpmEl.addEventListener('click', async () => {
      const inp = h('input', { type: 'number', min: 20, max: 300, value: cfg.bpm, style: { fontSize: '2rem', textAlign: 'center' } });
      const r = await u.modal('Tempo', u.campo('Pulsos por minuto', inp), [
        { texto: 'Cancelar', accion: () => null }, { texto: 'Aceptar', clase: 'primario', accion: () => Number(inp.value) }]);
      if (r) setBpm(r);
    });
    const ajuste = d => h('button.btn', { type: 'button', onclick: () => setBpm(cfg.bpm + d) }, (d > 0 ? '+' : '−') + Math.abs(d));
    const tap = h('button.btn', {
      type: 'button', onclick: () => {
        const t = performance.now();
        tapTimes = tapTimes.filter(x => t - x < 2500);
        tapTimes.push(t);
        if (tapTimes.length >= 2) {
          const ints = tapTimes.slice(1).map((x, i) => x - tapTimes[i]);
          const media = ints.reduce((a, b) => a + b, 0) / ints.length;
          setBpm(60000 / media);
        }
      }
    }, 'Marcar (tap)');

    // ---------- eventos del motor
    const offs = [];
    offs.push(M.on('tick', d => {
      if (d.sub !== 0) return;
      const bs = pulsos.children;
      for (let i = 0; i < bs.length; i++) bs[i].classList.remove('on', 'fuerte');
      const b = bs[d.pulso];
      if (b) { b.classList.add('on'); if (cfg.acentos[d.pulso] === 3) b.classList.add('fuerte'); }
      estadoEl.textContent = `Compás ${d.compas + 1}` + (d.mudo ? ' · en silencio: ¡mantén el pulso!' : '');
      if (cfg.destello && cfg.acentos[d.pulso] > 0) {
        flash.style.transition = 'none'; flash.style.opacity = cfg.acentos[d.pulso] === 3 ? .35 : .18;
        requestAnimationFrame(() => { flash.style.transition = 'opacity .15s'; flash.style.opacity = 0; });
      }
    }));
    offs.push(M.on('tempo', b => pintarBpm(b)));
    offs.push(M.on('estado', () => { pintarPlay(); if (!M.activo) pintarBpm(cfg.bpm); }));

    // ---------- tarjeta principal
    if (seccion || obra) {
      const objetivo = (seccion && seccion.tempoObjetivo) || (obra && obra.tempoObjetivo);
      const actual = seccion && seccion.tempoActual;
      main.appendChild(h('div.tarjeta', { style: { borderLeft: '6px solid ' + ((obra && obra.color) || 'var(--acento)') } },
        h('div.fila',
          h('div.crece',
            h('div.mini.tenue', obra ? obra.titulo : ''),
            h('b', seccion ? seccion.nombre : 'Obra completa'),
            h('div.mini.tenue.num', [actual ? 'Actual: ' + actual + ' BPM' : null, objetivo ? 'Objetivo: ' + objetivo + ' BPM' : null].filter(Boolean).join(' · '))),
          seccion ? h('button.btn', {
            onclick: async () => {
              const b = M.activo && M.bpmActual ? M.bpmActual : cfg.bpm;
              await modelo.registrarTempo(seccion.id, b);
              seccion.tempoActual = b;
              u.toast(`Tempo actual de «${seccion.nombre}»: ${b} BPM`);
            }
          }, 'Guardar tempo') : null)));
    }

    pintarPulsos(); pintarBpm(M.activo && M.bpmActual ? M.bpmActual : cfg.bpm); pintarPlay();

    const compas = h('div.compas-sel',
      h('div.frac',
        h('span', { role: 'button', title: 'Pulsos por compás', onclick: () => cambiarNum(1), oncontextmenu: e => { e.preventDefault(); cambiarNum(-1); } }, ''),
        h('hr'),
        h('span', { role: 'button', title: 'Figura del pulso', onclick: () => { cfg.den = cfg.den === 4 ? 8 : cfg.den === 8 ? 2 : 4; pintarCompas(); guardar(); } }, '')));
    function pintarCompas() {
      const s = compas.querySelectorAll('.frac span');
      s[0].textContent = cfg.num; s[1].textContent = cfg.den;
      u.$$('button', presets).forEach(b => b.classList.toggle('on', b.textContent === cfg.num + '/' + cfg.den));
    }
    function cambiarNum(d) {
      cfg.num = u.clamp(cfg.num + d, 1, 16);
      cfg.acentos = ajustarAcentos(cfg.acentos, cfg.num);
      pintarPulsos(); pintarCompas(); guardar();
    }
    const presets = h('div.segmentado', PRESETS.map(pr => h('button', {
      type: 'button', onclick: () => { cfg.num = pr.num; cfg.den = pr.den; cfg.acentos = pr.ac.slice(); pintarPulsos(); pintarCompas(); guardar(); }
    }, pr.t)));

    main.appendChild(h('section.tarjeta.metro',
      pulsos,
      bpmEl, nombreEl,
      h('div.metro-ajuste', ajuste(-5), ajuste(-1), slider, ajuste(1), ajuste(5)),
      playBtn, estadoEl,
      h('div.fila', { style: { justifyContent: 'center', marginTop: '6px' } }, tap)));

    // subdivisión
    const subSeg = h('div.segmentado', SUBDIV.map(s => h('button' + (cfg.subdiv === s.n ? '.on' : ''), {
      type: 'button', title: s.d, onclick: e => {
        cfg.subdiv = s.n; u.$$('button', subSeg).forEach(b => b.classList.remove('on')); e.currentTarget.classList.add('on'); guardar();
      }
    }, h('span', { style: { fontSize: '1.15rem' } }, s.t), ' ', h('span.mini', s.d))));

    main.appendChild(h('section.tarjeta.metro-opciones',
      h('h2', 'Compás y subdivisión'),
      h('div.fila', { style: { gap: '14px', marginBottom: '12px' } },
        h('div.fila', { style: { gap: '2px' } }, h('button.btn-icono', { onclick: () => cambiarNum(-1), 'aria-label': 'Menos pulsos' }, icono('menos')), compas,
          h('button.btn-icono', { onclick: () => cambiarNum(1), 'aria-label': 'Más pulsos' }, icono('mas'))),
        h('div.crece', presets)),
      subSeg,
      h('p.mini.tenue', { style: { margin: '10px 0 0' } }, 'Toca cada pulso para cambiar su acento: fuerte, normal, suave o silencio.')));
    pintarCompas();

    // sonido
    const selSonido = h('select', { value: cfg.sonido }, Object.entries(audio.SONIDOS).map(([k, v]) => h('option', { value: k }, v.nombre)));
    selSonido.addEventListener('change', () => { cfg.sonido = selSonido.value; guardar(); probarSonido(); });
    const vol = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: cfg.volumen });
    vol.addEventListener('input', () => { cfg.volumen = Number(vol.value); guardar(); });
    function probarSonido() {
      if (M.activo) return;
      const c = audio.contexto(), s = c.createBufferSource(), g = c.createGain();
      s.buffer = audio.buffer(cfg.sonido, 3); g.gain.value = cfg.volumen; s.connect(g); g.connect(c.destination); s.start();
    }
    main.appendChild(h('section.tarjeta',
      h('h2', 'Sonido'),
      h('div.rejilla-2', u.campo('Timbre', selSonido), u.campo('Volumen', vol)),
      interruptor('Destello en pantalla en cada pulso', cfg.destello, v => { cfg.destello = v; guardar(); }),
      interruptor('Cronometrar el estudio al arrancar', cfg.autoSesion, v => { cfg.autoSesion = v; guardar(); })));

    // entrenador de velocidad
    const e = cfg.entrenador;
    const numero = (obj, k, min, max) => {
      const i = h('input', { type: 'number', min, max, value: obj[k] });
      i.addEventListener('change', () => { obj[k] = u.clamp(Number(i.value) || min, min, max); i.value = obj[k]; guardar(); });
      return i;
    };
    const resumenEnt = h('p.mini.tenue', { style: { margin: '4px 0 0' } });
    const pintarResumen = () => {
      const pasos = Math.ceil(Math.abs(e.hasta - e.desde) / Math.max(1, e.paso));
      let seg = 0, b = e.desde;
      for (let i = 0; i < pasos; i++) { seg += e.cadaCompases * cfg.num * 60 / b; b += Math.sign(e.hasta - e.desde) * e.paso; }
      resumenEnt.textContent = pasos ? `Llegará de ${e.desde} a ${e.hasta} BPM en unos ${Math.max(1, Math.round(seg / 60))} min.` : '';
    };
    const cajaEnt = h('div', { style: { display: e.activo ? '' : 'none' } },
      h('div.rejilla-2',
        u.campo('Desde (BPM)', numero(e, 'desde', 20, 300)),
        u.campo('Hasta (BPM)', numero(e, 'hasta', 20, 300)),
        u.campo('Subir cada… (compases)', numero(e, 'cadaCompases', 1, 64)),
        u.campo('Cuánto (BPM)', numero(e, 'paso', 1, 20))),
      resumenEnt);
    cajaEnt.addEventListener('change', pintarResumen);
    pintarResumen();

    const s = cfg.silencio;
    const cajaSil = h('div.rejilla-2', { style: { display: s.activo ? '' : 'none' } },
      u.campo('Compases sonando', numero(s, 'tocar', 1, 32)),
      u.campo('Compases en silencio', numero(s, 'callar', 1, 32)));
    const limite = h('select', { value: String(cfg.limiteMin) }, [0, 5, 10, 15, 20, 30, 45, 60].map(m => h('option', { value: String(m) }, m ? m + ' minutos' : 'Sin límite')));
    limite.addEventListener('change', () => { cfg.limiteMin = Number(limite.value); guardar(); });

    main.appendChild(h('section.tarjeta',
      h('h2', 'Práctica'),
      interruptor('Entrenador de velocidad (sube el tempo solo)', e.activo, v => { e.activo = v; cajaEnt.style.display = v ? '' : 'none'; guardar(); }),
      cajaEnt,
      interruptor('Compases en silencio (para interiorizar el pulso)', s.activo, v => { s.activo = v; cajaSil.style.display = v ? '' : 'none'; guardar(); }),
      cajaSil,
      u.campo('Parar automáticamente tras', limite)));

    if (!M.nativo && !audio.pluginNativo()) {
      main.appendChild(h('p.mini.tenue', { style: { padding: '0 4px' } },
        'En el PC el metrónomo funciona en el navegador. En el móvil (app Android) usa un servicio nativo que sigue sonando con la pantalla apagada.'));
    }

    // atajos de teclado (PC)
    const teclas = ev => {
      if (/input|select|textarea/i.test(ev.target.tagName)) return;
      if (ev.code === 'Space') { ev.preventDefault(); playBtn.click(); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); setBpm(cfg.bpm + (ev.shiftKey ? 5 : 1)); }
      else if (ev.key === 'ArrowDown') { ev.preventDefault(); setBpm(cfg.bpm - (ev.shiftKey ? 5 : 1)); }
      else if (ev.key === 't' || ev.key === 'T') tap.click();
    };
    document.addEventListener('keydown', teclas);

    return () => { offs.forEach(f => f()); flash.remove(); document.removeEventListener('keydown', teclas); };
  };

  function ajustarAcentos(ac, n) {
    const r = [];
    for (let i = 0; i < n; i++) r.push(ac[i] !== undefined ? ac[i] : (i === 0 ? 3 : 2));
    return r;
  }

  function interruptor(texto, valor, alCambiar) {
    const c = h('input', { type: 'checkbox', checked: !!valor });
    c.addEventListener('change', () => alCambiar(c.checked));
    return h('label.interruptor', h('span', texto), c);
  }
  A.herr.interruptor = interruptor;
})(window.Atril);
