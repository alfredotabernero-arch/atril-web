/* Atril — nota pedal, grabadora y contador de repeticiones */
(function (A) {
  'use strict';
  const { u, DB, icono, audio, pitch, modelo } = A;
  const { h } = u;

  /* ============================ NOTA PEDAL ============================ */
  const pedal = new audio.Pedal();

  A.herr.pedal = async function ({ main }) {
    const cfg = Object.assign({ nota: 9, octava: 3, timbre: 'organo', quinta: false, octavaBaja: false, volumen: 0.5 }, await DB.kvGet('pedalCfg', {}));
    let la = await A.la.get();
    const guardar = () => DB.kvSet('pedalCfg', cfg);

    const frecs = () => {
      const m = (cfg.octava + 1) * 12 + cfg.nota;
      const l = [pitch.frecMidi(m, la)];
      if (cfg.quinta) l.push(pitch.frecMidi(m + 7, la));
      if (cfg.octavaBaja) l.push(pitch.frecMidi(m - 12, la));
      return l;
    };
    const etiqueta = h('div.afin-nota');
    const sub = h('div.afin-frec');
    const play = h('button.metro-play', { 'aria-label': 'Tocar' });
    const pintar = () => {
      const m = (cfg.octava + 1) * 12 + cfg.nota;
      etiqueta.replaceChildren(pitch.soloNombre(m), h('sub', cfg.octava));
      sub.textContent = frecs()[0].toFixed(2) + ' Hz · La = ' + la + ' Hz' + (cfg.quinta ? ' · con quinta' : '');
      play.replaceChildren(icono(pedal.sonando() ? 'stop' : 'play'));
      u.$$('button', teclado).forEach((b, i) => b.classList.toggle('on', i === cfg.nota));
    };
    const reiniciar = () => { if (pedal.sonando()) pedal.tocar(frecs(), cfg.timbre, cfg.volumen); pintar(); guardar(); };
    play.addEventListener('click', () => { if (pedal.sonando()) pedal.parar(); else pedal.tocar(frecs(), cfg.timbre, cfg.volumen); pintar(); });

    const teclado = h('div.teclado-pedal', pitch.NOMBRES.map((n, i) => h('button', { type: 'button', onclick: () => { cfg.nota = i; reiniciar(); } }, n)));
    const octava = h('div.segmentado', [1, 2, 3, 4, 5].map(o => h('button' + (o === cfg.octava ? '.on' : ''), {
      type: 'button', onclick: e => { cfg.octava = o; u.$$('button', octava).forEach(b => b.classList.remove('on')); e.currentTarget.classList.add('on'); reiniciar(); }
    }, 'Octava ' + o)));
    const timbre = h('select', { value: cfg.timbre },
      h('option', { value: 'seno' }, 'Puro (seno)'), h('option', { value: 'organo' }, 'Órgano'), h('option', { value: 'cuerda' }, 'Cuerda'));
    timbre.addEventListener('change', () => { cfg.timbre = timbre.value; reiniciar(); });
    const vol = h('input', { type: 'range', min: 0.05, max: 1, step: 0.05, value: cfg.volumen });
    vol.addEventListener('input', () => { cfg.volumen = Number(vol.value); pedal.volumen(cfg.volumen); guardar(); });

    main.appendChild(h('section.tarjeta.afinador', etiqueta, sub, play,
      h('p.mini.tenue', 'Una nota tenida para afinar intervalos, escalas y dobles cuerdas contra ella.')));
    main.appendChild(h('section.tarjeta', h('h2', 'Nota'), teclado, h('div', { style: { marginTop: '10px' } }, octava)));
    main.appendChild(h('section.tarjeta', h('h2', 'Sonido'),
      h('div.rejilla-2', u.campo('Timbre', timbre), u.campo('Volumen', vol)),
      A.herr.interruptor('Añadir la quinta', cfg.quinta, v => { cfg.quinta = v; reiniciar(); }),
      A.herr.interruptor('Añadir la octava grave', cfg.octavaBaja, v => { cfg.octavaBaja = v; reiniciar(); })));
    pintar();
    return () => pedal.parar();
  };

  /* ============================ GRABADORA ============================ */
  function tipoGrabacion() {
    const ops = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    return ops.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
  }

  A.herr.grabadora = async function ({ main }) {
    if (!window.MediaRecorder) {
      main.appendChild(h('div.tarjeta.vacio', 'Este navegador no permite grabar audio.'));
      return;
    }
    const e = modelo.sesion.estado;
    const sel = await A.dialogos.selectorObra(e && e.obraId, e && e.seccionId, true);
    const reloj = h('div.contador-num', { style: { fontSize: '3.4rem' } }, '00:00');
    const canvas = h('canvas.grab-onda', { width: 600, height: 70 });
    const btn = h('button.metro-play', { 'aria-label': 'Grabar', style: { background: 'var(--mal)' } }, icono('grabar'));
    const resultado = h('div');
    let rec = null, stream = null, trozos = [], t0 = 0, timer = 0, raf = 0, analizador = null, src = null;

    async function empezar() {
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }); }
      catch (err) { u.toast('No se pudo usar el micrófono'); return; }
      trozos = [];
      const tipo = tipoGrabacion();
      rec = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined);
      rec.ondataavailable = ev => ev.data.size && trozos.push(ev.data);
      rec.onstop = terminado;
      rec.start(1000);
      t0 = Date.now();
      timer = setInterval(() => (reloj.textContent = u.reloj((Date.now() - t0) / 1000)), 250);
      btn.replaceChildren(icono('stop'));
      resultado.innerHTML = '';
      // onda en vivo
      const c = audio.contexto();
      src = c.createMediaStreamSource(stream);
      analizador = c.createAnalyser(); analizador.fftSize = 2048;
      src.connect(analizador);
      dibujar();
    }
    function parar() { if (rec && rec.state !== 'inactive') rec.stop(); }
    function liberar() {
      clearInterval(timer); cancelAnimationFrame(raf);
      if (src) src.disconnect();
      if (stream) stream.getTracks().forEach(t => t.stop());
      stream = null; src = null;
    }
    function dibujar() {
      raf = requestAnimationFrame(dibujar);
      const d = new Float32Array(analizador.fftSize);
      analizador.getFloatTimeDomainData(d);
      const g = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
      g.clearRect(0, 0, W, H);
      g.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--acento');
      g.lineWidth = 2; g.beginPath();
      for (let x = 0; x < W; x++) {
        const v = d[Math.floor(x / W * d.length)];
        const y = H / 2 + v * H * 0.9;
        x ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
    }
    async function terminado() {
      const dur = (Date.now() - t0) / 1000;
      liberar();
      btn.replaceChildren(icono('grabar'));
      const blob = new Blob(trozos, { type: (rec && rec.mimeType) || 'audio/webm' });
      const url = URL.createObjectURL(blob);
      const v = sel.valor();
      const nombre = h('input', { type: 'text', value: 'Toma ' + u.fechaCorta(Date.now()) + ' ' + u.hora(Date.now()) });
      resultado.replaceChildren(h('section.tarjeta',
        h('h2', 'Escucha la toma'),
        h('audio', { controls: true, src: url, style: { width: '100%' } }),
        u.campo('Nombre', nombre),
        h('div.fila', { style: { justifyContent: 'flex-end' } },
          h('button.btn', { onclick: () => { resultado.innerHTML = ''; URL.revokeObjectURL(url); } }, 'Descartar'),
          h('button.btn.primario', {
            onclick: async () => {
              await DB.put('grabaciones', { obraId: v.obraId, seccionId: v.seccionId, fecha: Date.now(), duracion: dur, nombre: nombre.value || 'Grabación', blob });
              u.toast('Grabación guardada');
              resultado.innerHTML = ''; pintarLista();
            }
          }, 'Guardar'))));
    }
    btn.addEventListener('click', () => (stream ? parar() : empezar()));

    const lista = h('div');
    async function pintarLista() {
      const [gs, obras] = await Promise.all([DB.all('grabaciones'), DB.all('obras')]);
      gs.sort((a, b) => b.fecha - a.fecha);
      lista.innerHTML = '';
      if (!gs.length) return;
      const nombres = Object.fromEntries(obras.map(o => [o.id, o.titulo]));
      lista.appendChild(h('div.seccion-titulo', h('h2', 'Últimas grabaciones')));
      lista.appendChild(h('section.tarjeta', h('ul.lista', gs.slice(0, 15).map(g => {
        const li = A.grabaciones.filaGrabacion(g, []);
        if (g.obraId && nombres[g.obraId]) li.querySelector('.mini').textContent += ' · ' + nombres[g.obraId];
        return li;
      }))));
    }

    main.appendChild(h('section.tarjeta.afinador', reloj, canvas, btn,
      h('p.mini.tenue', 'Grábate y escúchate con oídos de público. Las tomas se guardan en la obra para comparar tu evolución.')));
    main.appendChild(h('section.tarjeta', h('h2', 'Asociar a'), sel.nodo));
    main.appendChild(resultado);
    main.appendChild(lista);
    pintarLista();
    return () => { parar(); liberar(); };
  };

  /* ====================== CONTADOR DE REPETICIONES ====================== */
  A.herr.contador = async function ({ main }) {
    const st = Object.assign({ objetivo: 5, racha: 0, intentos: 0, limpias: 0, mejor: 0 }, await DB.kvGet('contador', {}));
    const guardar = () => DB.kvSet('contador', st);
    const num = h('div.contador-num');
    const puntos = h('div.contador-puntos');
    const datos = h('p.tenue.mini', { style: { textAlign: 'center' } });
    const pintar = () => {
      num.textContent = st.racha + ' / ' + st.objetivo;
      puntos.innerHTML = '';
      for (let i = 0; i < st.objetivo; i++) puntos.appendChild(h('i' + (i < st.racha ? '.on' : '')));
      datos.textContent = `${st.intentos} intentos · ${st.limpias} limpios` + (st.intentos ? ` (${Math.round(st.limpias / st.intentos * 100)} %)` : '') + ` · mejor racha: ${st.mejor}`;
    };
    const bien = () => {
      st.intentos++; st.limpias++; st.racha++;
      st.mejor = Math.max(st.mejor, st.racha);
      if (navigator.vibrate) navigator.vibrate(30);
      if (st.racha >= st.objetivo) {
        u.toast(`¡${st.objetivo} seguidas sin fallo! Prueba a subir un poco el tempo.`, 4000);
        st.racha = 0;
      }
      guardar(); pintar();
    };
    const mal = () => {
      st.intentos++; st.racha = 0;
      if (navigator.vibrate) navigator.vibrate([20, 40, 20]);
      guardar(); pintar();
    };
    const objetivo = h('div.segmentado', [3, 5, 7, 10].map(n => h('button' + (n === st.objetivo ? '.on' : ''), {
      type: 'button', onclick: e => { st.objetivo = n; st.racha = Math.min(st.racha, n - 1); u.$$('button', objetivo).forEach(b => b.classList.remove('on')); e.currentTarget.classList.add('on'); guardar(); pintar(); }
    }, n + ' seguidas')));

    main.appendChild(h('section.tarjeta',
      num, puntos, datos,
      h('div.rejilla-2', { style: { marginTop: '12px' } },
        h('button.btn.grande', { style: { color: 'var(--mal)' }, onclick: mal }, icono('x'), 'Fallo'),
        h('button.btn.grande', { style: { background: 'var(--bien)', borderColor: 'var(--bien)', color: '#fff' }, onclick: bien }, icono('check'), 'Limpia'))));
    main.appendChild(h('section.tarjeta',
      h('h2', 'Objetivo'), objetivo,
      h('p.mini.tenue', 'Repite el pasaje hasta conseguir el número de repeticiones seguidas sin fallo. Un fallo pone la racha a cero.'),
      h('button.btn', { onclick: () => { Object.assign(st, { racha: 0, intentos: 0, limpias: 0, mejor: 0 }); guardar(); pintar(); } }, 'Reiniciar contador')));
    pintar();
  };
})(window.Atril);
