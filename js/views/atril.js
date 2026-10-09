/* Atril — vista «En el atril»: la pantalla de trabajo mientras estudias una sección */
(function (A) {
  'use strict';
  const { u, DB, modelo, icono, audio } = A;
  const { h } = u;
  const M = audio.Metronomo;

  A.vistas.atril = {
    pestana: 'obras',
    pantallaCompleta: true,
    async render({ main, params }) {
      const sec = await DB.get('secciones', params[0]);
      if (!sec) { main.appendChild(h('div.vacio', 'Esta sección ya no existe.', h('p', h('a.btn', { href: '#/obras' }, 'Volver')))); return; }
      const obra = await DB.get('obras', sec.obraId);
      const hermanas = (await DB.byIndex('secciones', 'obraId', sec.obraId)).sort((a, b) => (a.orden || 0) - (b.orden || 0));
      const idx = hermanas.findIndex(x => x.id === sec.id);
      const ant = hermanas[idx - 1], sig = hermanas[idx + 1];
      const color = (obra && obra.color) || 'var(--primario)';

      // ---------- cronómetro: arranca solo al entrar
      const e = modelo.sesion.estado;
      if (!e) { await modelo.sesion.iniciar(sec.obraId, sec.id); u.toast('Cronómetro de estudio en marcha ⏱'); }
      else if (e.seccionId !== sec.id) await modelo.sesion.cambiar(sec.obraId, sec.id);
      u.pantallaEncendida(true, 'atril');

      const reloj = h('span.atril-reloj.num');
      const btnPausa = h('button.btn-icono', { 'aria-label': 'Pausar', onclick: () => modelo.sesion.estado && (modelo.sesion.estado.pausadaEn ? modelo.sesion.reanudar() : modelo.sesion.pausar()) });
      const pintarSesion = () => {
        const st = modelo.sesion.estado;
        reloj.textContent = st ? u.reloj(modelo.sesion.segundos()) : '—';
        reloj.classList.toggle('pausado', !!(st && st.pausadaEn));
        btnPausa.replaceChildren(icono(st && st.pausadaEn ? 'play' : 'pausa'));
      };
      const tReloj = setInterval(pintarSesion, 500);
      const offSesion = modelo.sesion.on(pintarSesion);

      // ---------- cabecera
      main.appendChild(h('header.atril-cab', { style: { '--c': color } },
        h('a.btn-icono', { href: '#/seccion/' + sec.id, 'aria-label': 'Salir del atril' }, icono('x')),
        h('div.crece.atril-que',
          h('b', (sec.letra ? sec.letra + ' · ' : '') + sec.nombre),
          h('span', [obra && obra.titulo, modelo.rangoTexto(sec)].filter(Boolean).join(' · '))),
        h('div.atril-crono', reloj, btnPausa,
          h('button.btn.primario.pequeno', { onclick: () => A.dialogos.terminar() }, 'Terminar'))));

      // ---------- partitura
      const partitura = h('div.atril-partitura');
      const tiras = h('div.atril-miniaturas');
      let lzActual = null;
      async function pintarPartitura(sel = 0) {
        const fotos = await A.fotos.deSeccion(sec.id);
        partitura.innerHTML = '';
        if (!fotos.length) {
          partitura.appendChild(h('div.atril-sin-foto',
            h('div.vacio-icono', icono('camara')),
            h('p', 'Haz una foto del pasaje para tenerlo aquí delante mientras estudias.'),
            h('button.btn.primario', { onclick: async () => { if (await A.fotos.anadir(sec)) pintarPartitura(); } }, icono('camara'), 'Añadir foto')));
          return;
        }
        sel = u.clamp(sel, 0, fotos.length - 1);
        const area = h('div.atril-zoom');
        partitura.appendChild(area);
        if (lzActual) lzActual.soltar();
        lzActual = A.anot.lienzo(area, fotos[sel]);
        A.fotos.zoom(area, lzActual.lienzo);
        tiras.innerHTML = '';
        if (fotos.length > 1) fotos.forEach((f, i) => tiras.appendChild(h('button' + (i === sel ? '.on' : ''), { onclick: () => pintarPartitura(i), 'aria-label': 'Foto ' + (i + 1) }, i + 1)));
        partitura.append(
          h('div.atril-foto-acciones', tiras,
            h('span.crece'),
            h('button.btn-icono.flotante', { 'aria-label': 'Anotar', title: 'Anotar la partitura', onclick: async () => { if (await A.anot.editor(fotos[sel])) pintarPartitura(sel); } }, icono('lapiz')),
            h('button.btn-icono.flotante', { 'aria-label': 'Añadir foto', title: 'Añadir foto', onclick: async () => { if (await A.fotos.anadir(sec)) pintarPartitura(fotos.length); } }, icono('camara')),
            h('button.btn-icono.flotante', { 'aria-label': 'Pantalla completa', title: 'Pantalla completa', onclick: () => A.fotos.visor(fotos, sel, () => pintarPartitura(sel)) }, icono('imagen'))),
          h('span.atril-pista', 'Pellizca o usa la rueda para ampliar · doble toque para acercar'));
      }

      // ---------- panel: tareas, observaciones, dominio
      let verObs = !!sec.notas && !(sec.tareas || []).some(t => !t.hecha);
      const pestanas = h('div.segmentado');
      const contPanel = h('div.atril-panel-cuerpo');
      const pintarPanel = () => {
        pestanas.innerHTML = '';
        const pend = modelo.pendientes(sec).length;
        pestanas.append(
          h('button' + (!verObs ? '.on' : ''), { onclick: () => { verObs = false; pintarPanel(); } }, 'Tareas' + (pend ? ` · ${pend}` : '')),
          h('button' + (verObs ? '.on' : ''), { onclick: () => { verObs = true; pintarPanel(); } }, 'Observaciones'));
        contPanel.innerHTML = '';
        if (!verObs) contPanel.appendChild(A.seccionUI.tareasUI(sec, { alCambiar: () => { const p = modelo.pendientes(sec).length; pestanas.firstChild.textContent = 'Tareas' + (p ? ` · ${p}` : ''); }, placeholder: 'Apunta algo que trabajar…' }));
        else {
          const obs = h('textarea.observaciones', { value: sec.notas || '', placeholder: 'Observaciones de esta sección…' });
          let t = null;
          obs.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { sec.notas = obs.value; DB.put('secciones', sec); }, 500); });
          obs.addEventListener('blur', () => { clearTimeout(t); sec.notas = obs.value; DB.put('secciones', sec); });
          contPanel.appendChild(obs);
        }
      };
      pintarPanel();
      const etSec = x => (x.letra ? x.letra + ' · ' : '') + x.nombre;
      const navSec = (ant || sig) ? h('div.atril-navsec',
        ant ? h('a', { href: '#/atril/' + ant.id, title: 'Sección anterior' }, icono('atras'), h('span', etSec(ant))) : h('span'),
        sig ? h('a', { href: '#/atril/' + sig.id, title: 'Sección siguiente' }, h('span', etSec(sig)), icono('adelante')) : h('span')) : null;
      const panel = h('aside.atril-panel',
        navSec, pestanas, contPanel,
        h('div.atril-dominio',
          h('span.mini.tenue', 'Fase'), A.seccionUI.faseUI(sec, null, { compacto: true }),
          h('span.mini.tenue', { style: { display: 'block', marginTop: '12px' } }, '¿Cómo la llevas?'), A.seccionUI.estrellasUI(sec)));

      main.appendChild(h('div.atril-cuerpo', partitura, panel));
      pintarPartitura();

      // ---------- metrónomo compacto
      const guardado = await DB.kvGet('metroCfg', null);
      const cfg = Object.assign({ bpm: 80, num: 4, den: 4, acentos: [3, 2, 2, 2], subdiv: 1, sonido: 'clic', volumen: 0.8, entrenador: { activo: false }, silencio: { activo: false }, limiteMin: 0 }, guardado || {});
      cfg.entrenador = Object.assign({}, cfg.entrenador, { activo: false });
      if (!M.activo) cfg.bpm = sec.tempoActual || (sec.tempoObjetivo ? Math.round(sec.tempoObjetivo * 0.7) : cfg.bpm);
      const bpmEl = h('button.atril-bpm.num', { 'aria-label': 'Cambiar tempo' });
      const nombreEl = h('span.atril-bpm-nombre');
      const puntos = h('div.atril-pulsos');
      const play = h('button.atril-play', { 'aria-label': 'Metrónomo' });
      const pintarBpm = b => { bpmEl.textContent = Math.round(b); nombreEl.textContent = sec.tempoObjetivo ? `objetivo ${sec.tempoObjetivo}` : modelo.nombreTempo(b); };
      const pintarPuntos = () => { puntos.innerHTML = ''; for (let i = 0; i < cfg.num; i++) puntos.appendChild(h('i' + (cfg.acentos[i] === 3 ? '.fuerte' : ''))); };
      const pintarPlay = () => play.replaceChildren(icono(M.activo ? 'stop' : 'play'));
      const guardarCfg = () => { DB.kvSet('metroCfg', Object.assign({}, guardado || {}, cfg)); if (M.activo) M.actualizar(cfg); };
      const setBpm = b => { cfg.bpm = u.clamp(Math.round(b), 20, 300); pintarBpm(cfg.bpm); guardarCfg(); };
      // destello: la pantalla parpadea en cada pulso (el mismo ajuste que en Herramientas › Metrónomo)
      const flash = h('div.metro-flash');
      document.body.appendChild(flash);
      const destellar = nivel => {
        flash.style.transition = 'none'; flash.style.opacity = nivel === 3 ? 0.32 : 0.16;
        requestAnimationFrame(() => { flash.style.transition = 'opacity .15s'; flash.style.opacity = 0; });
      };
      play.addEventListener('click', () => (M.activo ? M.parar() : M.iniciar(cfg)));
      bpmEl.addEventListener('click', async () => {
        const inp = h('input', { type: 'number', min: 20, max: 300, value: cfg.bpm, style: { fontSize: '2rem', textAlign: 'center' } });
        const r = await u.modal('Tempo', u.campo('Pulsos por minuto', inp), [{ texto: 'Cancelar', accion: () => null }, { texto: 'Aceptar', clase: 'primario', accion: () => Number(inp.value) }]);
        if (r) setBpm(r);
      });
      const offs = [
        M.on('tick', d => {
          const ps = puntos.children;
          for (let i = 0; i < ps.length; i++) ps[i].classList.toggle('on', i === d.pulso);
          if (cfg.destello && !d.sub && !d.mudo && cfg.acentos[d.pulso] > 0) destellar(cfg.acentos[d.pulso]);
        }),
        M.on('tempo', b => pintarBpm(b)),
        M.on('estado', () => { pintarPlay(); if (!M.activo) Array.from(puntos.children).forEach(p => p.classList.remove('on')); })
      ];
      pintarBpm(M.activo && M.bpmActual ? M.bpmActual : cfg.bpm); pintarPuntos(); pintarPlay();

      const filaMetro = h('div.atril-metro',
        h('button.btn-icono.redondo', { 'aria-label': 'Más lento', onclick: () => setBpm(cfg.bpm - 2) }, icono('menos')),
        h('div.atril-bpm-caja', bpmEl, nombreEl, puntos),
        h('button.btn-icono.redondo', { 'aria-label': 'Más rápido', onclick: () => setBpm(cfg.bpm + 2) }, icono('mas')),
        play,
        h('button.btn.pequeno.atril-guardar', {
          onclick: async () => {
            const b = M.activo && M.bpmActual ? Math.round(M.bpmActual) : cfg.bpm;
            await modelo.registrarTempo(sec.id, b); sec.tempoActual = b;
            u.toast(`Tempo de «${sec.nombre}»: ${b} BPM ✓`);
          }
        }, '✓ Tempo logrado'));

      // ---------- afinador compacto (cromático, con el La guardado en el afinador)
      const la = await A.la.get();
      const notaEl = h('div.atril-afin-nota', '—');
      const centsEl = h('div.atril-afin-cents', 'Toca una nota');
      const indAfin = h('i.atril-afin-ind');
      const escalaAfin = h('div.atril-afin-escala', h('b'), indAfin);
      const btnMic = h('button.atril-play', { 'aria-label': 'Activar micrófono' }, icono('mic'));
      const filaAfin = h('div.atril-metro.atril-afin',
        h('div.atril-afin-lectura', notaEl, escalaAfin, centsEl),
        btnMic,
        h('span.atril-afin-la', 'La ' + (la % 1 ? la.toFixed(1) : la) + ' Hz'));
      let stream = null, fuente = null, analizador = null, raf = 0, buf = null, ultima = 0, alterno = false;
      const hist = [];
      async function encenderAfinador() {
        if (M.activo) await M.parar();   // el clic del metrónomo confundiría al afinador
        try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }); }
        catch (e) { u.toast('No se pudo usar el micrófono: revisa los permisos'); return; }
        const c = audio.contexto();
        fuente = c.createMediaStreamSource(stream);
        analizador = c.createAnalyser(); analizador.fftSize = 4096;
        fuente.connect(analizador);
        buf = new Float32Array(analizador.fftSize);
        btnMic.replaceChildren(icono('stop')); btnMic.setAttribute('aria-label', 'Apagar micrófono');
        centsEl.textContent = 'Escuchando…';
        bucle();
      }
      function apagarAfinador() {
        cancelAnimationFrame(raf); raf = 0;
        if (fuente) fuente.disconnect();
        if (stream) stream.getTracks().forEach(t => t.stop());
        stream = fuente = analizador = null;
        btnMic.replaceChildren(icono('mic')); btnMic.setAttribute('aria-label', 'Activar micrófono');
        indAfin.className = 'atril-afin-ind'; notaEl.textContent = '—'; centsEl.textContent = 'Toca una nota';
      }
      btnMic.addEventListener('click', () => (stream ? apagarAfinador() : encenderAfinador()));
      function bucle() {
        raf = requestAnimationFrame(bucle);
        alterno = !alterno;
        if (alterno || !analizador) return;
        analizador.getFloatTimeDomainData(buf);
        const r = A.pitch.yin(A.pitch.diezmar(buf), audio.contexto().sampleRate / 2, 38, 1400);
        const ahora = performance.now();
        if (r && r.claridad > 0.85) {
          hist.push(r.f); if (hist.length > 5) hist.shift();
          ultima = ahora;
          mostrarNota(hist.slice().sort((a, b) => a - b)[hist.length >> 1]);
        } else if (ahora - ultima > 900) { hist.length = 0; indAfin.className = 'atril-afin-ind'; }
      }
      function mostrarNota(f) {
        const m = Math.round(A.pitch.midiDeFrec(f, la));
        const cents = 1200 * Math.log2(f / A.pitch.frecMidi(m, la));
        const n = A.pitch.nombreMidi(m), oct = n.match(/-?\d+$/)[0];
        notaEl.replaceChildren(n.slice(0, -oct.length), h('sub', oct));
        const ac = Math.abs(cents);
        centsEl.textContent = ac < 3 ? '✓ Afinado' : (cents > 0 ? '+' : '−') + ac.toFixed(0) + ' cents · ' + (cents > 0 ? 'baja' : 'sube');
        indAfin.style.left = u.clamp(50 + cents, 0, 100) + '%';
        indAfin.className = 'atril-afin-ind activo ' + (ac < 3 ? 'ok' : ac < 12 ? 'cerca' : 'lejos');
      }

      // ---------- barra de abajo: elegir metrónomo o afinador
      let herr = await DB.kvGet('atrilHerramienta', 'metronomo');
      const btnDestello = h('button.chip-herr', { type: 'button', title: 'La pantalla parpadea en cada pulso', onclick: () => { cfg.destello = !cfg.destello; guardarCfg(); pintarHerr(); } }, icono('rayo'), 'Destello');
      const selHerr = h('div.atril-herr-sel');
      const pintarHerr = () => {
        selHerr.replaceChildren(...[['metronomo', 'Metrónomo', 'metronomo'], ['afinador', 'Afinador', 'afinador']].map(([id, txt, ic]) =>
          h('button' + (herr === id ? '.on' : ''), { type: 'button', onclick: () => cambiarHerr(id) }, icono(ic), txt)));
        btnDestello.classList.toggle('on', !!cfg.destello);
        btnDestello.style.display = herr === 'metronomo' ? '' : 'none';
        filaMetro.style.display = herr === 'metronomo' ? '' : 'none';
        filaAfin.style.display = herr === 'afinador' ? '' : 'none';
      };
      const cambiarHerr = id => {
        if (id === herr) return;
        herr = id; DB.kvSet('atrilHerramienta', id);
        if (id !== 'afinador') apagarAfinador();
        pintarHerr();
      };
      pintarHerr();
      main.appendChild(h('footer.atril-pie', { style: { '--c': color } },
        h('div.atril-herr-barra', selHerr, h('span.crece'), btnDestello),
        filaMetro, filaAfin));

      // ---------- teclado (PC)
      const teclas = ev => {
        if (/input|select|textarea/i.test(ev.target.tagName) || document.querySelector('.modal-fondo, .visor')) return;
        if (ev.code === 'Space') { ev.preventDefault(); (herr === 'afinador' ? btnMic : play).click(); }
        else if (ev.key === 'ArrowUp') { ev.preventDefault(); setBpm(cfg.bpm + (ev.shiftKey ? 5 : 1)); }
        else if (ev.key === 'ArrowDown') { ev.preventDefault(); setBpm(cfg.bpm - (ev.shiftKey ? 5 : 1)); }
        else if (ev.key === 'ArrowRight' && sig) location.hash = '#/atril/' + sig.id;
        else if (ev.key === 'ArrowLeft' && ant) location.hash = '#/atril/' + ant.id;
      };
      document.addEventListener('keydown', teclas);
      pintarSesion();

      return () => {
        if (lzActual) lzActual.soltar();
        clearInterval(tReloj); offSesion(); offs.forEach(f => f());
        document.removeEventListener('keydown', teclas);
        u.pantallaEncendida(false, 'atril');
        apagarAfinador(); flash.remove();
      };
    }
  };
})(window.Atril);
