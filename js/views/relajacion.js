/* Atril — herramienta de Relajación: sonidos, música tranquila, temporizador y respiración guiada */
(function (A) {
  'use strict';
  const { u, DB, icono } = A;
  const { h } = u;

  const TIEMPOS = [0, 5, 10, 15, 20, 30, 45, 60];
  const RESPIRACIONES = {
    calma: { nombre: 'Calma (4·6)', desc: 'Espirar más largo que inspirar baja las pulsaciones. Ideal antes de salir a tocar.', fases: [['Inspira', 4], ['Espira', 6]] },
    caja: { nombre: 'Cuadrada (4·4·4·4)', desc: 'Respiración en caja: centra la atención y templa los nervios.', fases: [['Inspira', 4], ['Mantén', 4], ['Espira', 4], ['Mantén', 4]] },
    r478: { nombre: '4·7·8', desc: 'Para relajarte a fondo o antes de dormir.', fases: [['Inspira', 4], ['Mantén', 7], ['Espira', 8]] }
  };

  A.herr.relax = async function ({ main }) {
    const R = A.relax;
    const sel = Object.assign({ ambientes: { lluvia: 0.7 }, musica: null, tiempo: 20, vol: 0.8, volMusica: 0.7 }, await DB.kvGet('relaxSel', {}));
    const guardarSel = () => {
      if (R.sonando()) {
        sel.ambientes = {};
        R.ambientesActivos().forEach(id => (sel.ambientes[id] = R.volumen(id)));
        sel.musica = R.musicaActiva();
      }
      DB.kvSet('relaxSel', sel);
    };
    R.volMusica(sel.volMusica);

    /* ---------------- cabecera ---------------- */
    const estadoTxt = h('div.hero-titulo');
    const relojTxt = h('div.relax-reloj.num');
    const btnPlay = h('button.relax-play', { 'aria-label': 'Reproducir' });
    const volGen = h('input.blanco', { type: 'range', min: 0, max: 1, step: 0.02, value: sel.vol, 'aria-label': 'Volumen general' });
    volGen.addEventListener('input', () => { sel.vol = Number(volGen.value); R.volGeneral(sel.vol); DB.kvSet('relaxSel', sel); });

    async function reanudar() {
      const ids = Object.keys(sel.ambientes || {});
      if (!ids.length && !sel.musica) sel.ambientes = { lluvia: 0.7 };
      R.volGeneral(sel.vol);
      Object.entries(sel.ambientes).forEach(([id, v]) => R.activarAmbiente(id, v));
      if (sel.musica) {
        if (sel.musica.startsWith('pista:')) {
          const p = await DB.get('pistas', sel.musica.slice(6));
          if (p) R.tocarPista(p);
        } else R.tocarPieza(sel.musica);
      }
      if (sel.tiempo) R.temporizador(sel.tiempo);
    }
    btnPlay.addEventListener('click', () => {
      if (R.sonando()) { guardarSel(); R.pararTodo(); }
      else reanudar();
    });

    main.appendChild(h('section.hero.relax-hero',
      h('div.fila', { style: { alignItems: 'center' } },
        h('div.crece', h('div.hero-sub', 'Relajación'), estadoTxt, relojTxt),
        btnPlay),
      h('div.fila', { style: { marginTop: '14px', gap: '8px' } }, h('span', { style: { opacity: 0.85 } }, '🔈'), volGen, h('span', { style: { opacity: 0.85 } }, '🔊'))));

    /* ---------------- temporizador ---------------- */
    const segTiempo = h('div.segmentado', TIEMPOS.map(m => h('button' + (m === sel.tiempo ? '.on' : ''), {
      type: 'button', onclick: e => {
        sel.tiempo = m; DB.kvSet('relaxSel', sel);
        u.$$('button', segTiempo).forEach(b => b.classList.remove('on')); e.currentTarget.classList.add('on');
        if (R.sonando()) R.temporizador(m);
        pintarEstado();
      }
    }, m ? m + ' min' : '∞')));
    main.appendChild(h('section.tarjeta',
      h('div.tarjeta-cab', h('span.tarjeta-icono', { style: { background: '#3B2F86' } }, icono('reloj')), h('h2', 'Temporizador')),
      segTiempo,
      h('p.mini.tenue', { style: { margin: '10px 0 0' } }, 'Al acabar, el sonido se apaga poco a poco durante los últimos 30 segundos.')));

    /* ---------------- naturaleza ---------------- */
    const rejAmb = h('div.relax-rejilla');
    function pintarAmbientes() {
      rejAmb.innerHTML = '';
      Object.entries(R.AMBIENTES).forEach(([id, a]) => {
        const on = R.ambientesActivos().includes(id);
        const vol = h('input', { type: 'range', min: 0.05, max: 1, step: 0.05, value: on ? R.volumen(id) : (sel.ambientes[id] || 0.7), 'aria-label': 'Volumen de ' + a.nombre });
        vol.addEventListener('click', e => e.stopPropagation());
        vol.addEventListener('pointerdown', e => e.stopPropagation());
        vol.addEventListener('input', () => { R.volAmbiente(id, Number(vol.value)); sel.ambientes[id] = Number(vol.value); DB.kvSet('relaxSel', sel); });
        rejAmb.appendChild(h('div.relax-tile' + (on ? '.on' : ''), {
          role: 'button', tabindex: 0, style: { '--c': a.color }, 'aria-pressed': on ? 'true' : 'false',
          onclick: () => {
            if (on) R.desactivarAmbiente(id); else { R.activarAmbiente(id, sel.ambientes[id] || 0.7); if (sel.tiempo && R.restante() === null) R.temporizador(sel.tiempo); }
            guardarSel();
          }
        }, h('span.relax-emoji', a.emoji), h('span.relax-nombre', a.nombre), on ? vol : null));
      });
    }
    main.appendChild(h('section.tarjeta',
      h('div.tarjeta-cab', h('span.tarjeta-icono', { style: { background: '#22C27A' } }, icono('hoja')), h('h2', 'Sonidos de la naturaleza')),
      h('p.mini.tenue', { style: { margin: '-6px 0 12px' } }, 'Toca para encender o apagar. Puedes mezclar varios y ajustar cada volumen.'),
      rejAmb));

    /* ---------------- música ---------------- */
    const rejMus = h('div.relax-lista');
    const listaPistas = h('div.relax-lista');
    const volMus = h('input', { type: 'range', min: 0.05, max: 1, step: 0.05, value: sel.volMusica, 'aria-label': 'Volumen de la música' });
    volMus.addEventListener('input', () => { sel.volMusica = Number(volMus.value); R.volMusica(sel.volMusica); DB.kvSet('relaxSel', sel); });
    function filaMusica(id, emoji, nombre, desc, color, alTocar, extra) {
      const on = R.musicaActiva() === id;
      return h('div.relax-musica' + (on ? '.on' : ''), {
        role: 'button', tabindex: 0, style: { '--c': color },
        onclick: () => { if (on) R.pararMusica(); else { alTocar(); if (sel.tiempo && R.restante() === null) R.temporizador(sel.tiempo); } setTimeout(guardarSel, 50); }
      },
        h('span.relax-musica-icono', emoji),
        h('div.crece', h('div.relax-nombre', nombre), desc ? h('div.mini.tenue', desc) : null),
        extra,
        h('span.relax-musica-play', icono(on ? 'pausa' : 'play')));
    }
    async function pintarMusica() {
      rejMus.innerHTML = '';
      Object.entries(R.PIEZAS).forEach(([id, p]) => rejMus.appendChild(filaMusica(id, p.emoji, p.nombre, p.desc, p.color, () => R.tocarPieza(id))));
      const pistas = await R.pistas.lista();
      listaPistas.innerHTML = '';
      pistas.forEach(p => listaPistas.appendChild(filaMusica('pista:' + p.id, '🎵', p.nombre, p.duracion ? u.reloj(p.duracion) : '', '#7C5CFF', () => R.tocarPista(p),
        h('button.btn-icono.mini-btn', {
          'aria-label': 'Borrar pista', onclick: async e => {
            e.stopPropagation();
            if (!await u.confirmar(`¿Quitar «${p.nombre}» de tus pistas?`, 'Quitar', 'peligro')) return;
            if (R.musicaActiva() === 'pista:' + p.id) R.pararMusica();
            await R.pistas.borrar(p.id); pintarMusica();
          }
        }, icono('borrar')))));
      if (!pistas.length) listaPistas.appendChild(h('p.mini.tenue', { style: { margin: '0 2px' } }, 'Añade tus grabaciones favoritas (mp3, m4a, ogg…): un adagio, un nocturno, música minimalista… Se guardan en este dispositivo.'));
    }
    const fichero = h('input', { type: 'file', accept: 'audio/*', multiple: true, style: { display: 'none' } });
    fichero.addEventListener('change', async () => {
      const fs = Array.from(fichero.files); fichero.value = '';
      for (const f of fs) await R.pistas.anadir(f);
      if (fs.length) { u.toast(fs.length === 1 ? 'Pista añadida' : fs.length + ' pistas añadidas'); pintarMusica(); }
    });
    main.appendChild(h('section.tarjeta',
      h('div.tarjeta-cab', h('span.tarjeta-icono', { style: { background: '#7C5CFF' } }, icono('obras')), h('h2', 'Música relajante')),
      h('p.mini.tenue', { style: { margin: '-6px 0 12px' } }, 'Se compone en directo, así que nunca suena igual. Suena una a la vez, junto a los sonidos que elijas.'),
      rejMus,
      h('div.fila', { style: { margin: '12px 0 4px' } }, h('span.mini.tenue', { style: { fontWeight: 800 } }, 'Volumen de la música'), volMus),
      h('div.seccion-titulo', { style: { margin: '16px 2px 8px' } }, h('h3', 'Tus pistas'),
        h('button.btn.pequeno', { onclick: () => fichero.click() }, icono('mas'), 'Añadir')),
      listaPistas, fichero));

    /* ---------------- respiración guiada ---------------- */
    let resp = await DB.kvGet('respiracion', 'calma');
    if (!RESPIRACIONES[resp]) resp = 'calma';
    const circulo = h('div.resp-circulo', h('span.resp-fase', 'Listo'), h('span.resp-cuenta.num'));
    const descResp = h('p.mini.tenue', { style: { margin: '10px 0 0', textAlign: 'center' } });
    const btnResp = h('button.btn.primario', icono('play'), 'Empezar');
    let respActiva = false, tResp = null, tCuenta = null, ciclos = 0;
    const segResp = h('div.segmentado', Object.entries(RESPIRACIONES).map(([id, r]) => h('button' + (id === resp ? '.on' : ''), {
      type: 'button', onclick: e => {
        resp = id; DB.kvSet('respiracion', id);
        u.$$('button', segResp).forEach(b => b.classList.remove('on')); e.currentTarget.classList.add('on');
        descResp.textContent = RESPIRACIONES[id].desc;
        if (respActiva) { pararResp(); empezarResp(); }
      }
    }, r.nombre)));
    descResp.textContent = RESPIRACIONES[resp].desc;
    function fase(i) {
      if (!respActiva) return;
      const fs = RESPIRACIONES[resp].fases, [nombre, seg] = fs[i % fs.length];
      if (i > 0 && i % fs.length === 0) ciclos++;
      circulo.querySelector('.resp-fase').textContent = nombre;
      circulo.style.transitionDuration = seg + 's';
      circulo.className = 'resp-circulo ' + (nombre === 'Inspira' ? 'grande' : nombre === 'Espira' ? 'pequeno' : circulo.classList.contains('grande') ? 'grande' : 'pequeno');
      let quedan = seg;
      const cuenta = circulo.querySelector('.resp-cuenta');
      cuenta.textContent = quedan;
      clearInterval(tCuenta);
      tCuenta = setInterval(() => { quedan--; if (quedan > 0) cuenta.textContent = quedan; }, 1000);
      if (navigator.vibrate) navigator.vibrate(15);
      tResp = setTimeout(() => fase(i + 1), seg * 1000);
    }
    function empezarResp() {
      respActiva = true; ciclos = 0;
      btnResp.replaceChildren(icono('stop'), 'Parar');
      fase(0);
    }
    function pararResp() {
      respActiva = false;
      clearTimeout(tResp); clearInterval(tCuenta);
      circulo.className = 'resp-circulo';
      circulo.style.transitionDuration = '1s';
      circulo.querySelector('.resp-fase').textContent = ciclos ? '¡Bien hecho!' : 'Listo';
      circulo.querySelector('.resp-cuenta').textContent = ciclos ? ciclos + (ciclos === 1 ? ' ciclo' : ' ciclos') : '';
      btnResp.replaceChildren(icono('play'), 'Empezar');
    }
    btnResp.addEventListener('click', () => (respActiva ? pararResp() : empezarResp()));
    main.appendChild(h('section.tarjeta',
      h('div.tarjeta-cab', h('span.tarjeta-icono', { style: { background: '#FF4F8B' } }, icono('respirar')), h('h2', 'Respiración guiada')),
      segResp,
      h('div.resp-caja', circulo),
      descResp,
      h('div.fila', { style: { justifyContent: 'center', marginTop: '12px' } }, btnResp)));

    /* ---------------- estado ---------------- */
    function pintarEstado() {
      const amb = R.ambientesActivos().map(id => R.AMBIENTES[id].nombre);
      const m = R.musicaActiva();
      let mus = null;
      if (m) mus = m.startsWith('pista:') ? 'tu pista' : R.PIEZAS[m].nombre;
      const partes = [...amb, mus].filter(Boolean);
      estadoTxt.textContent = partes.length ? partes.join(' · ') : 'Elige un sonido o pulsa ▶';
      btnPlay.replaceChildren(icono(R.sonando() ? 'pausa' : 'play'));
      btnPlay.setAttribute('aria-label', R.sonando() ? 'Parar' : 'Reproducir');
      const r = R.restante();
      relojTxt.textContent = R.sonando() ? (r !== null ? 'Quedan ' + u.reloj(r) : 'Sin límite de tiempo') : (sel.tiempo ? 'Temporizador: ' + sel.tiempo + ' min' : 'Sin temporizador');
    }
    const repintar = () => { pintarEstado(); pintarAmbientes(); pintarMusica(); };
    const off = R.on(repintar);
    // relámpagos de la tormenta: un destello blanco antes de cada trueno cercano
    const destello = h('div.relax-destello', { 'aria-hidden': 'true' });
    document.body.appendChild(destello);
    const offRayo = R.onRelampago(f => {
      if (document.hidden) return;
      destello.style.setProperty('--fuerza', (0.35 + 0.5 * f).toFixed(2));
      destello.classList.remove('on'); void destello.offsetWidth; destello.classList.add('on');
    });
    const t = setInterval(pintarEstado, 1000);
    repintar();

    return () => { off(); offRayo(); destello.remove(); clearInterval(t); pararResp(); guardarSel(); };
  };
})(window.Atril);
