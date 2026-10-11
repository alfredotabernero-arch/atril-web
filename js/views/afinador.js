/* Atril — afinador con La de referencia configurable (430–445 Hz) */
(function (A) {
  'use strict';
  const { u, DB, icono, audio, pitch } = A;
  const { h } = u;

  /** Lee y guarda el La de referencia, compartido con la nota pedal */
  A.la = {
    async get() { return Number(await DB.kvGet('la', 440)) || 440; },
    set(v) { return DB.kvSet('la', v); }
  };

  A.herr.afinador = async function ({ main }) {
    let la = await A.la.get();
    let instr = await DB.kvGet('afinInstrumento', 'cromatico');
    if (!pitch.INSTRUMENTOS[instr]) instr = 'cromatico';

    // ---------- La de referencia
    const laTxt = h('b');
    const laRange = h('input', { type: 'range', min: 430, max: 445, step: 0.5, value: la, 'aria-label': pitch.nombreLa() + ' de referencia' });
    const setLa = v => {
      la = u.clamp(Math.round(v * 2) / 2, 430, 445);
      laTxt.textContent = pitch.nombreLa() + ' = ' + (la % 1 ? la.toFixed(1) : la) + ' Hz';
      laRange.value = la;
      A.la.set(la);
      pintarCuerdas();
    };
    laRange.addEventListener('input', () => setLa(Number(laRange.value)));

    // ---------- pantalla del afinador
    const notaEl = h('div.afin-nota', '—');
    const frecEl = h('div.afin-frec', 'Activa el micrófono y toca una nota');
    const centsEl = h('div.afin-cents');
    const ind = h('div.afin-ind');
    const escala = h('div.afin-escala');
    for (let c = -50; c <= 50; c += 5) {
      const pos = 50 + c;
      escala.appendChild(h('i' + (c === 0 ? '.c' : c % 25 === 0 ? '.m' : ''), { style: { left: pos + '%' } }));
      if (c % 25 === 0) escala.appendChild(h('b', { style: { left: pos + '%' } }, (c > 0 ? '+' : '') + c));
    }
    const aguja = h('div.afin-aguja', escala, ind);
    const btnMic = h('button.btn.primario.grande', icono('mic'), 'Activar micrófono');

    const selInstr = h('select', { value: instr }, Object.entries(pitch.INSTRUMENTOS).map(([k, v]) => h('option', { value: k }, v.nombre)));
    const cuerdas = h('div.cuerdas');
    selInstr.addEventListener('change', () => { instr = selInstr.value; DB.kvSet('afinInstrumento', instr); pintarCuerdas(); });

    function pintarCuerdas() {
      cuerdas.innerHTML = '';
      const def = pitch.INSTRUMENTOS[instr];
      def.cuerdas.forEach((n, i) => {
        const m = pitch.midiDeNombre(n);
        const f = pitch.frecMidi(m, la);
        cuerdas.appendChild(h('button.cuerda', { type: 'button', 'data-midi': m, title: 'Escuchar ' + pitch.nombreTexto(n), onclick: () => audio.tono(f, 2.2) },
          pitch.soloNombre(m), h('small', `${i + 1}ª · ${f.toFixed(1)}`)));
      });
      if (!def.cuerdas.length) cuerdas.appendChild(h('p.mini.tenue', 'Detecta cualquier nota. Elige un instrumento para ver sus cuerdas y escuchar cada una.'));
    }

    main.appendChild(h('section.tarjeta.afinador',
      notaEl, frecEl, aguja, centsEl,
      h('div', { style: { marginTop: '14px' } }, btnMic)));
    main.appendChild(h('section.tarjeta',
      h('h2', 'Afinación de referencia'),
      h('div.afin-la',
        h('button.btn', { onclick: () => setLa(la - 0.5) }, '−'), laTxt, h('button.btn', { onclick: () => setLa(la + 0.5) }, '+')),
      laRange,
      h('div.segmentado', { style: { marginTop: '8px' } }, [430, 435, 440, 442, 443, 445].map(v =>
        h('button', { type: 'button', onclick: () => setLa(v) }, v))),
      h('p.mini.tenue', { style: { margin: '8px 0 0' } }, '440 Hz es el estándar; muchas orquestas afinan a 442. Este ' + pitch.nombreLa() + ' se usa también en la nota pedal.')));
    main.appendChild(h('section.tarjeta',
      h('h2', 'Instrumento'),
      selInstr, cuerdas));
    setLa(la);

    // ---------- captura y análisis
    let stream = null, src = null, analizador = null, raf = 0, buf = null;
    const historial = [];
    let ultimaDeteccion = 0;

    async function encender() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      } catch (e) {
        u.toast('No se pudo usar el micrófono: revisa los permisos');
        return;
      }
      const c = audio.contexto();
      src = c.createMediaStreamSource(stream);
      analizador = c.createAnalyser();
      analizador.fftSize = 4096;
      src.connect(analizador);
      buf = new Float32Array(analizador.fftSize);
      btnMic.replaceChildren(icono('stop'), 'Apagar micrófono');
      btnMic.classList.remove('primario');
      frecEl.textContent = 'Escuchando…';
      bucle();
    }
    function apagar() {
      cancelAnimationFrame(raf); raf = 0;
      if (src) src.disconnect();
      if (stream) stream.getTracks().forEach(t => t.stop());
      stream = src = analizador = null;
      btnMic.replaceChildren(icono('mic'), 'Activar micrófono');
      btnMic.classList.add('primario');
      ind.classList.remove('activo');
    }
    btnMic.addEventListener('click', () => (stream ? apagar() : encender()));

    let alterno = false;
    function bucle() {
      raf = requestAnimationFrame(bucle);
      alterno = !alterno;
      if (alterno || !analizador) return; // ~30 análisis por segundo
      analizador.getFloatTimeDomainData(buf);
      const sr = audio.contexto().sampleRate;
      const r = pitch.yin(pitch.diezmar(buf), sr / 2, 38, 1400);
      const ahora = performance.now();
      if (r && r.claridad > 0.85) {
        historial.push(r.f);
        if (historial.length > 5) historial.shift();
        const f = mediana(historial);
        ultimaDeteccion = ahora;
        mostrar(f);
      } else if (ahora - ultimaDeteccion > 900) {
        historial.length = 0;
        ind.classList.remove('activo');
        centsEl.textContent = '';
      }
    }

    function mostrar(f) {
      const def = pitch.INSTRUMENTOS[instr];
      let objetivo = Math.round(pitch.midiDeFrec(f, la));
      // con instrumento elegido, la referencia es la cuerda más cercana
      let cuerdaMidi = null;
      if (def.cuerdas.length) {
        const ms = def.cuerdas.map(pitch.midiDeNombre);
        const real = pitch.midiDeFrec(f, la);
        cuerdaMidi = ms.reduce((a, b) => Math.abs(b - real) < Math.abs(a - real) ? b : a);
        if (Math.abs(cuerdaMidi - real) <= 1.5) objetivo = cuerdaMidi; else cuerdaMidi = null;
      }
      const cents = 1200 * Math.log2(f / pitch.frecMidi(objetivo, la));
      const n = pitch.nombreMidi(objetivo);
      const oct = n.match(/-?\d+$/)[0];
      notaEl.replaceChildren(n.slice(0, -oct.length), h('sub', oct));
      frecEl.textContent = f.toFixed(1) + ' Hz · referencia ' + pitch.frecMidi(objetivo, la).toFixed(1) + ' Hz';
      const ac = Math.abs(cents);
      centsEl.textContent = ac < 3 ? '✓ Afinado' : (cents > 0 ? '+' : '−') + ac.toFixed(0) + ' cents · ' + (cents > 0 ? 'baja' : 'sube');
      centsEl.style.color = ac < 3 ? 'var(--bien)' : ac < 12 ? 'var(--aviso)' : 'var(--mal)';
      ind.style.left = u.clamp(50 + cents, 0, 100) + '%';
      ind.className = 'afin-ind activo ' + (ac < 3 ? 'ok' : ac < 12 ? 'cerca' : 'lejos');
      u.$$('.cuerda', cuerdas).forEach(b => {
        const es = Number(b.dataset.midi) === cuerdaMidi;
        b.classList.toggle('cerca', es && ac >= 3);
        b.classList.toggle('ok', es && ac < 3);
      });
    }

    return apagar;
  };

  function mediana(a) {
    const s = a.slice().sort((x, y) => x - y);
    return s[s.length >> 1];
  }
})(window.Atril);
