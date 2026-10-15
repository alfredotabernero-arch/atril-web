/* Atril — vista «En el atril»: la pantalla de trabajo mientras estudias una sección */
(function (A) {
  'use strict';
  const { u, DB, modelo, icono, audio } = A;
  const { h } = u;
  const M = audio.Metronomo;

  /*
   * Micrófono del afinador de «En el atril». Vive fuera de la vista para poder seguir
   * escuchando al pasar de una sección a otra (si el músico lo quiere: ver «atrilMicAlCambiar»).
   */
  let mic = null;   // { stream, fuente, analizador }
  function soltarMic() {
    if (!mic) return;
    try { mic.fuente.disconnect(); } catch (e) {}
    mic.stream.getTracks().forEach(t => t.stop());
    mic = null;
  }

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

      // ---------- cronómetro: si ya había una sesión, sigue en esta sección; si no, se pone en marcha con ▶
      // (arranca solo al entrar si así se elige en Ajustes › En el atril, y siempre en el modo sencillo de los niños)
      const e = modelo.sesion.estado;
      if (!e && ((A.sencillo && A.sencillo.activo) || await DB.kvGet('atrilCronoAuto', false))) { await modelo.sesion.iniciar(sec.obraId, sec.id); u.toast('Cronómetro de estudio en marcha ⏱'); }
      else if (e && e.seccionId !== sec.id) await modelo.sesion.cambiar(sec.obraId, sec.id);
      let pasajeEspera = null;   // pasaje elegido antes de poner en marcha el cronómetro
      const arrancar = async () => {
        if (modelo.sesion.estado) return;
        await modelo.sesion.iniciar(sec.obraId, sec.id);
        if (pasajeEspera) await modelo.sesion.pasaje(pasajeEspera);
        u.toast('Cronómetro de estudio en marcha ⏱');
      };
      u.pantallaEncendida(true, 'atril');
      // pasaje difícil: «#/atril/<sección>/p:<id>» lo deja elegido; los de la sección se pueden elegir aquí
      const pasajesSec = modelo.pasajesEnSeccion(obra, sec);
      const pedido = (params[1] || '').startsWith('p:') ? params[1].slice(2) : null;
      if (pedido && pasajesSec.some(p => p.id === pedido)) { if (modelo.sesion.estado) await modelo.sesion.pasaje(pedido); else pasajeEspera = pedido; }
      else if (modelo.sesion.estado && modelo.sesion.estado.pasajeId && !pasajesSec.some(p => p.id === modelo.sesion.estado.pasajeId)) await modelo.sesion.pasaje(null);

      const reloj = h('span.atril-reloj.num');
      const btnPausa = h('button.btn-icono', { 'aria-label': 'Pausar', onclick: () => {
        const st = modelo.sesion.estado;
        if (!st) return arrancar();
        return st.pausadaEn ? modelo.sesion.reanudar() : modelo.sesion.pausar();
      } });
      const btnTerminar = h('button.btn.primario.pequeno', { onclick: () => A.dialogos.terminar() }, 'Terminar');
      const pintarSesion = () => {
        const st = modelo.sesion.estado;
        reloj.textContent = st ? u.reloj(modelo.sesion.segundos()) : u.reloj(0);
        reloj.classList.toggle('pausado', !st || !!st.pausadaEn);
        btnPausa.replaceChildren(icono(!st || st.pausadaEn ? 'play' : 'pausa'));
        const etq = !st ? 'Poner en marcha el cronómetro' : st.pausadaEn ? 'Seguir' : 'Pausar';
        btnPausa.setAttribute('aria-label', etq); btnPausa.title = etq;
        btnTerminar.style.display = st ? '' : 'none';
      };
      const tReloj = setInterval(pintarSesion, 500);
      const offSesion = modelo.sesion.on(pintarSesion);

      // ---------- cabecera
      main.appendChild(h('header.atril-cab', { style: { '--c': color } },
        h('a.btn-icono', { href: '#/seccion/' + sec.id, 'aria-label': 'Salir del atril' }, icono('x')),
        h('div.crece.atril-que',
          h('b', (sec.letra ? sec.letra + ' · ' : '') + sec.nombre),
          h('span', [obra && obra.titulo, modelo.rangoTexto(sec)].filter(Boolean).join(' · '))),
        h('div.atril-crono', reloj, btnPausa, btnTerminar)));

      // ---------- pasajes difíciles de esta sección
      if (pasajesSec.length) {
        const caja = h('div.atril-pasajes');
        const pintarPasajes = () => {
          const act = modelo.sesion.estado ? modelo.sesion.estado.pasajeId : pasajeEspera;
          caja.replaceChildren(h('span.atril-pasajes-et', '⚡'), ...pasajesSec.map(p => h('button.chip' + (p.id === act ? '.on' : ''), {
            title: p.nota || 'Pasaje difícil', 'aria-pressed': String(p.id === act),
            onclick: async () => {
              if (modelo.sesion.estado) await modelo.sesion.pasaje(p.id === act ? null : p.id);
              else pasajeEspera = p.id === act ? null : p.id;
              pintarPasajes();
            }
          }, modelo.textoPasaje(p) + (p.id === act && p.nota ? ' · ' + p.nota : ''))));
          const elegido = pasajesSec.find(p => p.id === act);
          if (elegido) caja.appendChild(h('button.enlace.mini', { onclick: async () => {
            if (!(await u.confirmar('¿Das por resuelto el pasaje ' + modelo.textoPasaje(elegido) + '? Queda en el historial de la obra.', 'Resuelto'))) return;
            await modelo.marcarPasajes(sec.obraId, [elegido.id], { resuelto: Date.now(), trabajado: Date.now() });
            await modelo.sesion.pasaje(null);
            pasajesSec.splice(pasajesSec.indexOf(elegido), 1);
            u.toast('Pasaje resuelto 🎉');
            if (pasajesSec.length) pintarPasajes(); else caja.remove();
          } }, 'Resuelto'));
        };
        pintarPasajes();
        main.appendChild(caja);
      }

      // ---------- partitura
      const partitura = h('div.atril-partitura');
      const tiras = h('div.atril-miniaturas');
      let lzActual = null;
      async function pintarPartitura(sel = 0) {
        const fotos = await A.fotos.deSeccion(sec.id);
        partitura.innerHTML = '';
        // sin fotos: solo una barra fina para añadirla si se quiere; el resto de la pantalla, para el panel
        partitura.classList.toggle('vacia', !fotos.length);
        if (!fotos.length) {
          partitura.appendChild(h('button.atril-sin-foto', {
            title: 'Opcional: una foto de esta parte de la partitura para anotar digitaciones, arcos y puntos clave',
            onclick: async () => { if (await A.fotos.anadir(sec)) pintarPartitura(); }
          }, icono('camara'), h('span', 'Añadir foto de la partitura'), h('small', 'opcional')));
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
          obs.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { sec.notas = obs.value; sec.trabajada = Date.now(); DB.put('secciones', sec); }, 500); });
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
            await modelo.registrarTempo(sec.id, b); sec.tempoActual = b; sec.trabajada = Date.now();
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
        h('span.atril-afin-la', A.pitch.nombreLa() + ' ' + (la % 1 ? la.toFixed(1) : la) + ' Hz'));
      let raf = 0, buf = null, ultima = 0, alterno = false;
      const hist = [];
      function escuchar() {
        buf = new Float32Array(mic.analizador.fftSize);
        btnMic.replaceChildren(icono('stop')); btnMic.setAttribute('aria-label', 'Apagar micrófono');
        centsEl.textContent = 'Escuchando…';
        cancelAnimationFrame(raf); bucle();
      }
      async function encenderAfinador() {
        if (M.activo) await M.parar();   // el clic del metrónomo confundiría al afinador
        let stream;
        try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }); }
        catch (e) { u.toast('No se pudo usar el micrófono: revisa los permisos'); return; }
        const c = audio.contexto();
        const fuente = c.createMediaStreamSource(stream);
        const analizador = c.createAnalyser(); analizador.fftSize = 4096;
        fuente.connect(analizador);
        mic = { stream, fuente, analizador };
        escuchar();
      }
      function apagarAfinador() {
        cancelAnimationFrame(raf); raf = 0;
        soltarMic();
        btnMic.replaceChildren(icono('mic')); btnMic.setAttribute('aria-label', 'Activar micrófono');
        indAfin.className = 'atril-afin-ind'; notaEl.textContent = '—'; centsEl.textContent = 'Toca una nota';
      }
      btnMic.addEventListener('click', () => (mic ? apagarAfinador() : encenderAfinador()));
      function bucle() {
        raf = requestAnimationFrame(bucle);
        alterno = !alterno;
        if (alterno || !mic) return;
        mic.analizador.getFloatTimeDomainData(buf);
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

      // ---------- escuchar (Atril 3.0): el micrófono escucha cómo tocas y hace un informe
      const panelEsc = A.escucharUI.panelAtril({
        obra, sec, pasajes: pasajesSec,
        pasajeActivo: () => modelo.sesion.estado && modelo.sesion.estado.pasajeId,
        alEmpezar: async () => {
          if (M.activo) { await M.parar(); u.toast('El metrónomo se para mientras escucho: sus clics se confundirían con tus notas', 2600); }
          apagarAfinador();
        }
      });
      const filaEsc = h('div.atril-esc', panelEsc.nodo);

      // ---------- barra de abajo: elegir metrónomo, afinador o escuchar
      let herr = params[1] === 'escuchar' ? 'escuchar' : await DB.kvGet('atrilHerramienta', 'metronomo');
      const btnDestello = h('button.chip-herr', { type: 'button', title: 'La pantalla parpadea en cada pulso', onclick: () => { cfg.destello = !cfg.destello; guardarCfg(); pintarHerr(); } }, icono('rayo'), 'Destello');
      const selHerr = h('div.atril-herr-sel');
      const pintarHerr = () => {
        selHerr.replaceChildren(...[['metronomo', 'Metrónomo', 'metronomo'], ['afinador', 'Afinador', 'afinador'], ['escuchar', 'Escuchar', 'oido']].map(([id, txt, ic]) =>
          h('button' + (herr === id ? '.on' : ''), { type: 'button', onclick: () => cambiarHerr(id) }, icono(ic), txt)));
        btnDestello.classList.toggle('on', !!cfg.destello);
        btnDestello.style.display = herr === 'metronomo' ? '' : 'none';
        filaMetro.style.display = herr === 'metronomo' ? '' : 'none';
        filaAfin.style.display = herr === 'afinador' ? '' : 'none';
        filaEsc.style.display = herr === 'escuchar' ? '' : 'none';
      };
      const cambiarHerr = id => {
        if (id === herr) return;
        herr = id; DB.kvSet('atrilHerramienta', id);
        if (id !== 'afinador') apagarAfinador();
        if (id !== 'escuchar' && panelEsc.activo()) panelEsc.parar();
        pintarHerr();
      };
      pintarHerr();

      // ¿venimos de otra sección con el afinador escuchando? Seguir, o preguntar la primera vez
      if (mic) {
        const pref = await DB.kvGet('atrilMicAlCambiar', 'preguntar');
        if (herr !== 'afinador' || pref === 'apagar') soltarMic();
        else {
          escuchar();
          if (pref === 'preguntar') setTimeout(async () => {
            const r = await u.modal('Afinador encendido',
              h('p', { style: { margin: 0 } }, '¿Quieres que el afinador siga escuchando cuando pasas de una sección a otra?'), [
                { texto: 'No, apagarlo', accion: () => 'apagar' },
                { texto: 'Solo ahora', accion: () => 'ahora' },
                { texto: 'Siempre', clase: 'primario', accion: () => 'siempre' }]);
            if (r === 'apagar') { await DB.kvSet('atrilMicAlCambiar', 'apagar'); apagarAfinador(); u.toast('Se apagará al cambiar de sección. Puedes cambiarlo en Ajustes.'); }
            else if (r === 'siempre') { await DB.kvSet('atrilMicAlCambiar', 'mantener'); u.toast('El afinador seguirá encendido. Puedes cambiarlo en Ajustes.'); }
          }, 250);
        }
      }
      main.appendChild(h('footer.atril-pie', { style: { '--c': color } },
        h('div.atril-herr-barra', selHerr, h('span.crece'), btnDestello),
        filaMetro, filaAfin, filaEsc));

      // ---------- teclado (PC)
      const teclas = ev => {
        if (/input|select|textarea/i.test(ev.target.tagName) || document.querySelector('.modal-fondo, .visor')) return;
        if (ev.code === 'Space') { ev.preventDefault(); if (herr === 'escuchar') panelEsc.alternar(); else (herr === 'afinador' ? btnMic : play).click(); }
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
        cancelAnimationFrame(raf);
        // al pasar a otra sección del atril, el micrófono se queda abierto y la nueva vista decide; si no, se apaga
        if (!(mic && herr === 'afinador' && /^#\/atril\//.test(location.hash))) soltarMic();
        flash.remove();
        if (panelEsc.activo()) panelEsc.parar();   // al salir escuchando, la escucha se guarda
      };
    }
  };
})(window.Atril);
