/* Atril — ficha de sección: fotos de la partitura, tareas, observaciones, dominio y tempo */
(function (A) {
  'use strict';
  const { u, DB, modelo, icono } = A;
  const { h } = u;

  /* ---------------- lista de tareas (también se usa en «En el atril») ---------------- */
  function tareasUI(sec, opciones = {}) {
    const caja = h('div.tareas');
    let verHechas = false;
    const guardar = async () => { sec.trabajada = Date.now(); await DB.put('secciones', sec); opciones.alCambiar && opciones.alCambiar(); pintar(); };
    const entrada = h('input', { type: 'text', placeholder: opciones.placeholder || 'Nueva tarea: p. ej. «Digitación c. 12»', 'aria-label': 'Nueva tarea' });
    const anadir = async () => {
      const t = entrada.value.trim();
      if (!t) return;
      sec.tareas = sec.tareas || [];
      sec.tareas.push({ id: u.uid(), texto: t, hecha: false, creada: Date.now() });
      entrada.value = '';
      await guardar();
      entrada.focus();
    };
    entrada.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); anadir(); } });

    function fila(t) {
      const c = h('input', { type: 'checkbox', checked: t.hecha, 'aria-label': 'Hecha' });
      c.addEventListener('change', async () => {
        t.hecha = c.checked; t.hechaEn = c.checked ? Date.now() : null;
        if (c.checked && navigator.vibrate) navigator.vibrate(25);
        if (c.checked) u.toast('¡Una menos! 🎉');
        await guardar();
      });
      return h('li.tarea' + (t.hecha ? '.hecha' : ''),
        h('label.tarea-check', c, h('span', t.texto)),
        opciones.sinBorrar ? null : h('button.btn-icono.mini-btn', {
          'aria-label': 'Borrar tarea', onclick: async () => { sec.tareas = sec.tareas.filter(x => x !== t); await guardar(); }
        }, icono('x')));
    }
    function pintar() {
      caja.innerHTML = '';
      const todas = sec.tareas || [];
      const pend = todas.filter(t => !t.hecha), hechas = todas.filter(t => t.hecha);
      if (!opciones.sinAnadir) caja.appendChild(h('div.tarea-nueva', entrada, h('button.btn.primario.pequeno', { onclick: anadir, 'aria-label': 'Añadir tarea' }, icono('mas'))));
      if (!pend.length) caja.appendChild(h('p.mini.tenue', { style: { margin: '10px 2px 0' } }, todas.length ? '¡Todo hecho en esta sección! 🎉' : 'Apunta aquí lo que tienes que trabajar: digitaciones, cambios de posición, trémolos, dinámicas…'));
      caja.appendChild(h('ul.lista-tareas', pend.map(fila)));
      if (hechas.length && !opciones.soloPendientes) {
        caja.appendChild(h('button.enlace', { onclick: () => { verHechas = !verHechas; pintar(); } }, (verHechas ? 'Ocultar' : 'Ver') + ` hechas (${hechas.length})`));
        if (verHechas) caja.appendChild(h('ul.lista-tareas', hechas.map(fila)));
      }
    }
    pintar();
    return caja;
  }

  /** Estrellas de dominio editables */
  function estrellasUI(sec, alCambiar) {
    const caja = h('div.estrellas-grandes');
    const et = h('span.mini.tenue');
    const pintar = () => {
      Array.from(caja.querySelectorAll('button')).forEach((b, i) => b.classList.toggle('on', i < (sec.dominio || 0)));
      et.textContent = modelo.DOMINIO[sec.dominio || 0];
    };
    for (let i = 1; i <= 5; i++) {
      caja.appendChild(h('button', {
        type: 'button', 'aria-label': 'Dominio ' + i,
        onclick: async () => { sec.dominio = sec.dominio === i ? i - 1 : i; sec.trabajada = Date.now(); await DB.put('secciones', sec); pintar(); alCambiar && alCambiar(); }
      }, '★'));
    }
    caja.appendChild(et);
    pintar();
    return caja;
  }

  /**
   * Fase de estudio de la sección y, en «Leyendo», hasta qué compás se ha leído.
   * opciones.compacto: versión reducida para «En el atril».
   */
  function faseUI(sec, alCambiar, opciones = {}) {
    const caja = h('div.fase-ui' + (opciones.compacto ? '.compacto' : ''));
    const guardar = async () => { sec.trabajada = Date.now(); await DB.put('secciones', sec); alCambiar && alCambiar(); pintar(); };
    const n = modelo.compasesSeccion(sec);
    const conRango = modelo.tieneRango(sec);

    async function ponerFase(id) {
      const antes = modelo.faseDe(sec);
      if (id === antes) return;
      sec.fase = id;
      if (id === 'lectura' && conRango && !(sec.leidoHasta >= sec.desde - 1)) sec.leidoHasta = sec.desde - 1;
      if (id === 'lectura' && modelo.indiceFase(antes) > 1 && conRango) sec.leidoHasta = sec.hasta; // volver atrás no borra lo leído
      await guardar();
      if (id === 'lista') u.toast('¡Sección lista! 🎉');
    }
    function controlLectura() {
      const frac = modelo.fraccionLeida(sec);
      const leidosTxt = h('div.lectura-txt');
      const pintarTxt = () => {
        const f = modelo.fraccionLeida(sec);
        leidosTxt.replaceChildren(conRango
          ? h('span', 'Leídos ', h('b', modelo.compasesLeidos(sec) + ' de ' + n), ' compases · ', h('b', Math.round(f * 100) + ' %'))
          : h('span', 'Leído ', h('b', Math.round(f * 100) + ' %')));
        barra.firstChild.style.width = Math.round(f * 100) + '%';
      };
      const barra = h('div.barra.lectura-barra', h('i', { style: { width: Math.round(frac * 100) + '%' } }));
      // registro diario de lo leído en la obra (para el resumen semanal del profesor)
      let leidosAntes = modelo.compasesLeidos(sec);
      const apuntarLectura = async () => {
        const ahora = modelo.compasesLeidos(sec);
        if (ahora === leidosAntes) return;
        await modelo.anotarLectura(sec.obraId, ahora - leidosAntes);
        leidosAntes = ahora;
      };
      let ctrl;
      if (conRango) {
        const valor = () => u.clamp(sec.leidoHasta || sec.desde - 1, sec.desde - 1, sec.hasta);
        const num = h('input.num', { type: 'number', min: sec.desde - 1, max: sec.hasta, value: valor(), 'aria-label': 'Leído hasta el compás' });
        const rango = h('input', { type: 'range', min: sec.desde - 1, max: sec.hasta, step: 1, value: valor(), 'aria-label': 'Leído hasta el compás' });
        const fijar = async (v, desde) => {
          sec.leidoHasta = u.clamp(Math.round(v), sec.desde - 1, sec.hasta);
          if (desde !== num) num.value = sec.leidoHasta;
          if (desde !== rango) rango.value = sec.leidoHasta;
          pintarTxt();
          clearTimeout(fijar.t);
          fijar.t = setTimeout(async () => { sec.trabajada = Date.now(); await DB.put('secciones', sec); await apuntarLectura(); alCambiar && alCambiar(); }, 300);
          if (sec.leidoHasta >= sec.hasta && !fijar.avisado) { fijar.avisado = true; u.toast('Sección leída entera: pásala a «Montando» cuando quieras'); }
        };
        num.addEventListener('change', () => fijar(Number(num.value), num));
        rango.addEventListener('input', () => fijar(Number(rango.value), rango));
        ctrl = h('div',
          h('div.fila', { style: { gap: '6px' } },
            h('span.mini.tenue', { style: { fontWeight: 800, whiteSpace: 'nowrap' } }, 'Hasta el c.'),
            h('button.btn.pequeno', { type: 'button', onclick: () => fijar(valor() - 1) }, '−'),
            num,
            h('button.btn.pequeno', { type: 'button', onclick: () => fijar(valor() + 1) }, '+'),
            h('button.btn.pequeno', { type: 'button', onclick: () => fijar(valor() + 4), title: 'Cuatro compases más' }, '+4')),
          rango);
      } else {
        const rango = h('input', { type: 'range', min: 0, max: 100, step: 5, value: sec.leidoPct || 0, 'aria-label': 'Porcentaje leído' });
        rango.addEventListener('input', () => {
          sec.leidoPct = Number(rango.value); pintarTxt();
          clearTimeout(rango.t); rango.t = setTimeout(async () => { sec.trabajada = Date.now(); await DB.put('secciones', sec); await apuntarLectura(); alCambiar && alCambiar(); }, 300);
        });
        ctrl = h('div', rango, h('p.mini.tenue', { style: { margin: '2px 0 0' } }, 'Pon los compases de la sección (desde–hasta) para contar la lectura compás a compás.'));
      }
      const caja = h('div.lectura', leidosTxt, barra, ctrl,
        h('button.btn.primario.bloque', { type: 'button', style: { marginTop: '10px' }, onclick: () => ponerFase('montaje') }, icono('check'), 'Sección leída: pasar a «Montando»'));
      pintarTxt();
      return caja;
    }

    function pintar() {
      caja.innerHTML = '';
      const actual = modelo.faseDe(sec);
      const iAct = modelo.indiceFase(actual);
      caja.appendChild(h('div.fases', modelo.FASES.map((f, i) => h('button.fase' + (f.id === actual ? '.on' : '') + (i < iAct ? '.hecha' : ''), {
        type: 'button', style: { '--f': f.color }, 'aria-pressed': f.id === actual ? 'true' : 'false', onclick: () => ponerFase(f.id)
      }, h('span.fase-punto', i < iAct ? '✓' : i + 1), h('span.fase-nombre', f.corto)))));
      if (actual === 'lectura') caja.appendChild(controlLectura());
      else if (actual === 'pendiente' && !opciones.compacto) caja.appendChild(h('p.mini.tenue', { style: { margin: '10px 0 0' } }, 'Pulsa «Leyendo» cuando empieces con esta sección.'));
      else if ((actual === 'montaje' || actual === 'pulido') && modelo.maestria(sec) >= 1) {
        const sig = actual === 'montaje' ? 'pulido' : 'lista';
        caja.appendChild(h('div.fase-sugerencia', h('span', actual === 'montaje' ? '¡Ya la tienes montada a tempo! ¿Pasamos a pulirla?' : '¡Dominada y a tempo! ¿La das por lista?'),
          h('button.btn.pequeno.primario', { type: 'button', onclick: () => ponerFase(sig) }, modelo.estado(sig).nombre)));
      }
      if (!opciones.compacto) {
        const f = modelo.estado(actual);
        const txt = {
          pendiente: 'Aún no cuenta para el progreso.',
          lectura: 'La lectura cuenta hasta un 20 % de la sección, según los compases leídos.',
          montaje: 'Del 20 al 50 %: avanza con tus estrellas de dominio y el tempo conseguido.',
          pulido: 'Del 50 al 80 %: avanza con tus estrellas de dominio y el tempo conseguido.',
          lista: 'Sección terminada: cuenta el 100 %.'
        }[f.id];
        caja.appendChild(h('p.mini.tenue.fase-ayuda', txt));
      }
    }
    pintar();
    return caja;
  }

  /** Galería de fotos de la sección */
  function galeriaUI(sec, alCambiar) {
    const caja = h('div.galeria');
    const pintar = async () => {
      const fotos = await A.fotos.deSeccion(sec.id);
      caja.innerHTML = '';
      fotos.forEach((f, i) => caja.appendChild(h('button.galeria-foto', { onclick: () => A.fotos.visor(fotos, i, () => { pintar(); alCambiar && alCambiar(); }), 'aria-label': 'Ver foto ' + (i + 1) },
        h('img', { src: A.fotos.url(f), alt: '' }), (f.trazos && f.trazos.length) ? A.anot.capa(f, 'cubrir') : null,
        (f.trazos && f.trazos.length) ? h('span.galeria-marca', icono('lapiz')) : null)));
      caja.appendChild(h('button.galeria-nueva', {
        onclick: async () => { if (await A.fotos.anadir(sec)) { pintar(); alCambiar && alCambiar(); } }
      }, icono('camara'), h('span', fotos.length ? 'Otra foto' : 'Añadir foto')));
    };
    pintar();
    return caja;
  }

  A.seccionUI = { tareasUI, estrellasUI, galeriaUI, faseUI };

  /* ================================ Vista ================================ */
  A.vistas.seccion = {
    pestana: 'obras',
    atras: () => '#/obras',
    titulo: '',
    async render({ main, titulo, acciones, params, cab }) {
      const sec = await DB.get('secciones', params[0]);
      if (!sec) { main.appendChild(h('div.vacio', 'Esta sección ya no existe.')); return; }
      const obra = await DB.get('obras', sec.obraId);
      const hermanas = (await DB.byIndex('secciones', 'obraId', sec.obraId)).sort((a, b) => (a.orden || 0) - (b.orden || 0));
      const idx = hermanas.findIndex(x => x.id === sec.id);
      titulo.textContent = sec.nombre;
      const atras = u.$('.cabecera .atras');
      if (atras) atras.href = '#/obra/' + sec.obraId;
      const color = (obra && obra.color) || 'var(--primario)';

      acciones.append(
        await A.dialogos.botonManana(sec.obraId, sec.id),
        h('button.btn-icono.no-sencillo', { 'aria-label': 'Editar', title: 'Editar', onclick: async () => { if (await A.dialogos.seccion(sec.obraId, sec)) A.app.refrescar(); } }, icono('editar')),
        h('button.btn-icono.no-sencillo', {
          'aria-label': 'Borrar', title: 'Borrar', onclick: async () => {
            if (!await u.confirmar(`¿Borrar la sección «${sec.nombre}» con sus fotos y tareas?`, 'Borrar', 'peligro')) return;
            await DB.borrarSeccion(sec.id); u.toast('Sección borrada'); location.hash = '#/obra/' + sec.obraId;
          }
        }, icono('borrar')));

      // --------- cabecera de color
      const prog = modelo.progresoSeccion(sec);
      const pctEl = h('div.hero-pct.no-sencillo', Math.round(prog * 100), h('small', '%'));
      const barraEl = h('i', { style: { width: Math.round(prog * 100) + '%' } });
      const chipFase = h('span.chip.blanco');
      const refrescarProg = () => {
        const p = modelo.progresoSeccion(sec);
        pctEl.firstChild.textContent = Math.round(p * 100);
        barraEl.style.width = Math.round(p * 100) + '%';
        chipFase.textContent = modelo.estado(modelo.faseDe(sec)).nombre;
      };
      refrescarProg();
      main.appendChild(h('section.hero', { style: { '--c': color } },
        h('div.fila', { style: { alignItems: 'flex-start' } },
          h('div.hero-letra', sec.letra || (idx + 1)),
          h('div.crece',
            h('a.hero-sub', { href: '#/obra/' + sec.obraId }, obra ? obra.titulo : ''),
            h('div.hero-titulo', sec.nombre),
            h('div.hero-sub', [modelo.rangoTexto(sec), sec.dificil ? '⚡ Sección difícil' : null].filter(Boolean).join(' · '))),
          pctEl),
        h('div.barra.blanca.gruesa.no-sencillo', barraEl),
        h('div.fila.no-sencillo', { style: { marginTop: '10px' } }, chipFase),
        h('div.fila', { style: { marginTop: '14px' } },
          h('a.btn.blanco.grande.crece', { href: '#/atril/' + sec.id }, icono('atril'), 'Estudiar en el atril'),
          h('a.btn.translucido.grande', { href: '#/herramientas/metronomo/' + sec.id, 'aria-label': 'Metrónomo' }, icono('metronomo')))));

      // --------- fase de estudio
      main.appendChild(h('section.tarjeta.no-sencillo',
        h('div.tarjeta-cab', h('span.tarjeta-icono', { style: { background: '#7C5CFF' } }, icono('estadisticas')), h('h2', 'Fase de estudio')),
        faseUI(sec, refrescarProg)));

      // --------- partitura
      main.appendChild(h('section.tarjeta',
        h('div.tarjeta-cab', h('span.tarjeta-icono', { style: { background: '#3D7BFF' } }, icono('imagen')), h('h2', 'Partitura')),
        galeriaUI(sec)));

      // --------- tareas
      main.appendChild(h('section.tarjeta',
        h('div.tarjeta-cab', h('span.tarjeta-icono', { style: { background: '#22C27A' } }, icono('tareas')), h('h2', 'Qué trabajar')),
        tareasUI(sec)));

      // --------- pasajes difíciles que caen en esta sección (están marcados en la obra)
      if (obra && modelo.tieneRango(sec)) {
        const pas = modelo.pasajesEnSeccion(obra, sec);
        main.appendChild(h('section.tarjeta.tarjeta-pasajes',
          h('div.tarjeta-cab', h('span.tarjeta-icono', { style: { background: '#FF8A3D' } }, '⚡'), h('h2.crece', 'Pasajes difíciles'),
            h('button.btn.pequeno', { onclick: async () => { if (await A.dialogos.pasaje(obra, null, { desde: sec.desde, hasta: Math.min(sec.hasta, sec.desde + 3) })) A.app.refrescar(); } }, icono('mas'), 'Pasaje')),
          pas.length ? h('ul.lista', pas.map(p => h('li', h('div.item.pasaje',
            h('div.crece', h('span.pasaje-rango', '⚡ ' + modelo.textoPasaje(p)), p.nota ? h('span.pasaje-nota', p.nota) : null),
            h('a.btn-icono', { href: '#/atril/' + sec.id + '/p:' + p.id, 'aria-label': 'Estudiar el pasaje', title: 'Estudiar en el atril' }, icono('play'))))))
            : h('p.mini.tenue', { style: { margin: 0 } }, 'Ninguno en ' + modelo.rangoTexto(sec) + '. Se marcan en la obra por compases y siguen marcados aunque dividas o unas secciones.')));
      }

      // --------- escuchar (3.0): confianza o fluidez de la sección y su evolución
      if (obra) main.appendChild(A.escucharUI.tarjetaSeccion(sec, obra, await A.escuchar.deObra(sec.obraId)));

      // --------- observaciones
      const estadoGuardado = h('span.mini.tenue');
      const obs = h('textarea.observaciones', { value: sec.notas || '', placeholder: 'Observaciones: indicaciones del director, respiraciones, matices, por dónde atacar el pasaje…' });
      let t = null;
      obs.addEventListener('input', () => {
        estadoGuardado.textContent = '…';
        clearTimeout(t);
        t = setTimeout(async () => { sec.notas = obs.value; sec.trabajada = Date.now(); await DB.put('secciones', sec); estadoGuardado.textContent = 'Guardado ✓'; }, 600);
      });
      main.appendChild(h('section.tarjeta',
        h('div.tarjeta-cab', h('span.tarjeta-icono', { style: { background: '#F5B400' } }, icono('nota2')), h('h2.crece', 'Observaciones'), estadoGuardado),
        obs));

      // --------- dominio y tempo
      const tempoAct = h('b.num');
      const tempoBarra = h('i');
      const pintarTempo = () => {
        tempoAct.textContent = sec.tempoActual ? sec.tempoActual + ' BPM' : '—';
        const r = sec.tempoObjetivo ? Math.min(1, (sec.tempoActual || 0) / sec.tempoObjetivo) : 0;
        tempoBarra.style.width = Math.round(r * 100) + '%';
        refrescarProg();
      };
      const cambiarTempo = async d => {
        const b = u.clamp((sec.tempoActual || sec.tempoObjetivo || 80) + d, 20, 400);
        await modelo.registrarTempo(sec.id, b);
        sec.tempoActual = b; sec.trabajada = Date.now(); pintarTempo();
      };
      const dificil = h('input', { type: 'checkbox', checked: !!sec.dificil });
      dificil.addEventListener('change', async () => { sec.dificil = dificil.checked; await DB.put('secciones', sec); });
      main.appendChild(h('section.tarjeta.no-sencillo',
        h('div.tarjeta-cab', h('span.tarjeta-icono', { style: { background: '#FF4F8B' } }, icono('estrella')), h('h2', 'Dominio y tempo')),
        estrellasUI(sec, refrescarProg),
        h('div.fila', { style: { marginTop: '14px' } },
          h('div.crece', h('div.mini.tenue', 'Tempo actual'), tempoAct),
          sec.tempoObjetivo ? h('div', { style: { textAlign: 'right' } }, h('div.mini.tenue', 'Objetivo'), h('b.num', sec.tempoObjetivo + ' BPM')) : null),
        sec.tempoObjetivo ? h('div.barra', { style: { margin: '8px 0 10px' } }, tempoBarra) : null,
        h('div.fila', { style: { gap: '6px' } },
          h('button.btn.pequeno', { onclick: () => cambiarTempo(-2) }, '−2'),
          h('button.btn.pequeno', { onclick: () => cambiarTempo(2) }, '+2'),
          h('button.btn.pequeno', { onclick: () => cambiarTempo(5) }, '+5'),
          h('span.crece'),
          h('a.btn.pequeno', { href: '#/herramientas/metronomo/' + sec.id }, icono('metronomo'), 'Metrónomo')),
        h('label.interruptor', { style: { marginTop: '8px' } }, h('span', 'Sección difícil entera (más prioridad)'), dificil)));
      pintarTempo();

      // --------- grabaciones e historial de la sección
      const [grabs, sesiones] = await Promise.all([DB.byIndex('grabaciones', 'obraId', sec.obraId).then(l => l.filter(g => g.seccionId === sec.id)).catch(() => []), DB.byIndex('sesiones', 'obraId', sec.obraId)]);
      if (grabs.length) {
        grabs.sort((a, b) => b.fecha - a.fecha);
        main.appendChild(h('div.seccion-titulo', h('h2', 'Grabaciones')));
        main.appendChild(h('section.tarjeta', h('ul.lista', grabs.map(g => A.grabaciones.filaGrabacion(g, [sec])))));
      }
      // las sesiones repartidas entre varias secciones cuentan aquí solo sus minutos de esta sección
      const mias = sesiones.map(x => {
        if (x.reparto) { const r = x.reparto.find(y => y.seccionId === sec.id); return r ? Object.assign({}, x, { minutosAqui: r.minutos }) : null; }
        return x.seccionId === sec.id ? x : null;
      }).filter(Boolean).sort((a, b) => b.inicio - a.inicio);
      if (mias.length) {
        main.appendChild(h('div.seccion-titulo.no-sencillo', h('h2', 'Historial'), h('span.mini.tenue', u.minutos(mias.reduce((a, x) => a + (x.minutosAqui != null ? x.minutosAqui : x.minutos), 0)) + ' en total')));
        main.appendChild(h('div.no-sencillo', A.obrasUI.historial(mias, [sec], obra)));
      }

      // --------- organizar: dividir o unir
      const sigH = hermanas[idx + 1];
      main.appendChild(h('div.seccion-titulo.no-sencillo', h('h2', 'Organizar la sección')));
      main.appendChild(h('section.tarjeta.no-sencillo',
        h('p.mini.tenue', { style: { marginTop: 0 } }, modelo.faseDe(sec) === 'lectura' && sec.nombre === 'Obra completa'
          ? 'Cuando hayas leído la obra y sepas dónde están las dificultades, divídela en secciones con sentido musical: las letras del director, las frases y, aparte, los pasajes difíciles.'
          : 'Si dentro de esta sección hay un trozo mucho más difícil, divídela; si dos secciones se trabajan igual, únelas.'),
        h('div.fila.envuelve', { style: { gap: '8px' } },
          h('button.btn', { onclick: async () => { const n = await A.dialogos.dividir(sec); if (n) A.app.refrescar(); } }, icono('dividir'), 'Dividir en dos'),
          sigH ? h('button.btn', { onclick: async () => { if (await A.dialogos.unir(sec)) A.app.refrescar(); } }, icono('unir'), 'Unir con «' + sigH.nombre + '»') : null)));

      // --------- navegación entre secciones
      const ant = hermanas[idx - 1], sig = hermanas[idx + 1];
      if (ant || sig) {
        main.appendChild(h('div.nav-secciones',
          ant ? h('a.btn', { href: '#/seccion/' + ant.id }, icono('atras'), h('span', ant.letra || ant.nombre)) : h('span'),
          sig ? h('a.btn', { href: '#/seccion/' + sig.id }, h('span', sig.letra || sig.nombre), icono('adelante')) : h('span')));
      }
      return () => { if (t) { clearTimeout(t); if (obs.value !== (sec.notas || '')) { sec.notas = obs.value; DB.put('secciones', sec); } } };
    }
  };
})(window.Atril);
