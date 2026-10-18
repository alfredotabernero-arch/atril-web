/* Atril — cartera de obras y ficha de obra */
(function (A) {
  'use strict';
  const { u, DB, modelo, icono } = A;
  const { h } = u;

  const pct = x => Math.round(x * 100) + ' %';
  // ancho de barra para CSS (sin espacio: «20 %» no es un ancho válido y la barra salía llena)
  const ancho = x => Math.round(Math.max(0, Math.min(1, x || 0)) * 1000) / 10 + '%';
  /** Colores del dominio 0..5 (rojo → verde) */
  const COLOR_DOMINIO = ['var(--dom-0)', '#FF5A5F', '#FF8A3D', '#F5B400', '#8BCF3F', '#22C27A'];
  A.COLOR_DOMINIO = COLOR_DOMINIO;

  function chipRitmo(r, claro) {
    if (!r) return null;
    const m = { bien: ['bien', 'En plazo'], justa: ['aviso', 'Justa de tiempo'], retrasada: ['mal', 'Retrasada'], vencida: ['mal', 'Fecha pasada'] }[r.nivel];
    return h('span.chip.' + (claro ? 'blanco' : m[0]), m[1]);
  }

  /* ------------------------------- Lista ------------------------------- */
  A.vistas.obras = {
    titulo: 'Mis obras',
    async render({ main, acciones, params }) {
      const filtro = params[0] || 'activas';
      acciones.appendChild(h('button.btn.primario.no-sencillo', {
        onclick: async () => { const o = await A.dialogos.obra(); if (o) location.hash = '#/obra/' + o.id; }
      }, icono('mas'), 'Nueva'));

      const cart = await modelo.cartera();
      const nAct = cart.filter(c => c.obra.estado !== 'archivada').length;
      const nArch = cart.length - nAct;
      main.appendChild(h('div.segmentado.no-sencillo', { style: { marginBottom: '16px' } },
        h('button' + (filtro === 'activas' ? '.on' : ''), { onclick: () => (location.hash = '#/obras/activas') }, `En cartera · ${nAct}`),
        h('button' + (filtro === 'archivadas' ? '.on' : ''), { onclick: () => (location.hash = '#/obras/archivadas') }, `Archivadas · ${nArch}`)));

      const lista = cart.filter(c => (c.obra.estado === 'archivada') === (filtro === 'archivadas'));
      if (!lista.length) {
        main.appendChild(h('div.vacio',
          h('div.vacio-icono', icono('obras')),
          h('h3', filtro === 'archivadas' ? 'No hay obras archivadas' : 'Aún no tienes obras'),
          filtro === 'archivadas' ? h('p', 'Cuando termines con una obra, archívala desde su ficha para guardar su historial.')
            : h('p', 'Crea una obra y divídela en secciones por compases para seguir el dominio y el tempo de cada parte.')));
        return;
      }
      const rejilla = h('div.rejilla-obras');
      lista.forEach(c => {
        const o = c.obra;
        const pend = c.secciones.reduce((n, s) => n + modelo.pendientes(s).length, 0);
        rejilla.appendChild(h('a.obra-card', { href: '#/obra/' + o.id, style: { '--c': o.color } },
          h('div.fila', { style: { alignItems: 'flex-start' } },
            h('div.crece',
              h('div.obra-card-titulo', o.titulo),
              h('div.obra-card-sub', [o.compositor, o.instrumento].filter(Boolean).join(' · ') || ' ')),
            h('div.obra-card-pct.no-sencillo', Math.round(c.progreso * 100), h('small', '%'))),
          h('div.barra.blanca.no-sencillo', h('i', { style: { width: ancho(c.progreso) } })),
          h('div.fila.envuelve', { style: { marginTop: '12px', gap: '6px' } },
            h('span.chip.blanco.no-sencillo', modelo.estado(c.estado).nombre),
            c.ritmo && c.ritmo.nivel !== 'bien' ? h('span.no-sencillo', chipRitmo(c.ritmo, true)) : null,
            o.fechaObjetivo ? h('span.chip.blanco', '📅 ' + u.fechaCorta(o.fechaObjetivo)) : null,
            c.secciones.length ? h('span.chip.blanco', c.secciones.length + (c.secciones.length === 1 ? ' sección' : ' secciones')) : null,
            pend ? h('span.chip.blanco', '✓ ' + pend + ' pendientes') : null,
            h('span.chip.blanco', '⏱ ' + u.minutos(c.minutos)))));
      });
      main.appendChild(rejilla);
    }
  };

  /* ------------------------------- Ficha ------------------------------- */
  A.vistas.obra = {
    pestana: 'obras',
    atras: () => '#/obras',
    titulo: '',
    async render({ main, titulo, acciones, params }) {
      const id = params[0];
      const obra = await DB.get('obras', id);
      if (!obra) { main.appendChild(h('div.vacio', 'Esta obra ya no existe.')); return; }
      titulo.textContent = obra.titulo;
      document.documentElement.style.setProperty('--obra', obra.color);

      acciones.append(
        await A.dialogos.botonManana(obra.id, null),
        h('button.btn-icono.no-sencillo', { 'aria-label': 'Editar', title: 'Editar', onclick: async () => { if (await A.dialogos.obra(obra)) A.app.refrescar(); } }, icono('editar')),
        h('button.btn-icono.no-sencillo', {
          'aria-label': 'Borrar', title: 'Borrar', onclick: async () => {
            if (!await u.confirmar(`¿Borrar «${obra.titulo}» con sus secciones, fotos y grabaciones? Las sesiones de estudio se conservan en tus estadísticas.`, 'Borrar', 'peligro')) return;
            await DB.borrarObra(id); u.toast('Obra borrada'); location.hash = '#/obras';
          }
        }, icono('borrar')));

      const [secciones, sesiones, grabaciones, fotos, tomas] = await Promise.all([
        DB.byIndex('secciones', 'obraId', id), DB.byIndex('sesiones', 'obraId', id), DB.byIndex('grabaciones', 'obraId', id), DB.byIndex('fotos', 'obraId', id), A.escuchar.deObra(id)]);
      secciones.sort((a, b) => (a.orden || 0) - (b.orden || 0));
      sesiones.sort((a, b) => b.inicio - a.inicio);
      const fotosSec = {};
      fotos.sort((a, b) => (a.orden ?? a.fecha) - (b.orden ?? b.fecha)).forEach(f => (fotosSec[f.seccionId] = fotosSec[f.seccionId] || []).push(f));
      const progreso = modelo.progresoObra(obra, secciones);
      const estadoEf = modelo.estadoObra(obra, secciones);
      const ritmo = modelo.ritmoObra(obra, progreso, estadoEf);
      const lectura = modelo.lecturaObra(secciones, obra);
      const sinSeccion = modelo.compasesSinSeccion(obra, secciones);
      const minTot = sesiones.reduce((a, s) => a + (s.minutos || 0), 0);
      const lunes = u.inicioSemana(new Date()).getTime();
      const minSem = sesiones.filter(s => s.inicio >= lunes).reduce((a, s) => a + (s.minutos || 0), 0);

      // --------- cabecera de color
      // con secciones, la fase la calculan ellas; solo se puede archivar a mano
      const opciones = secciones.length
        ? [[estadoEf === 'archivada' ? modelo.estadoObra(Object.assign({}, obra, { estado: '' }), secciones) : estadoEf, null], ['archivada', 'Archivada']]
        : modelo.ESTADOS.map(e => [e.id, e.nombre]);
      const selEstado = h('select.select-chip', { 'aria-label': 'Fase de la obra', title: secciones.length ? 'La fase se calcula con la de sus secciones' : 'Fase de la obra' },
        opciones.map(([v, n]) => h('option', { value: v }, n || modelo.estado(v).nombre)));
      selEstado.value = estadoEf;
      selEstado.addEventListener('change', async () => { obra.estado = selEstado.value; await DB.put('obras', obra); A.app.refrescar(); });
      const hayLectura = secciones.length && lectura.total > 0 && (sinSeccion > 0 || secciones.some(x => ['pendiente', 'lectura'].includes(modelo.faseDe(x))));
      main.appendChild(h('section.hero', { style: { '--c': obra.color } },
        h('div.fila', { style: { alignItems: 'center' } },
          h('div.hero-sub.crece', [obra.compositor, obra.instrumento].filter(Boolean).join(' · ') || 'Sin compositor'),
          h('span.no-sencillo', selEstado)),
        h('div.hero-pct.no-sencillo', { style: { marginTop: '6px' } }, Math.round(progreso * 100), h('small', '% completado')),
        h('div.barra.blanca.gruesa.no-sencillo', h('i', { style: { width: ancho(progreso) } })),
        hayLectura ? h('p.hero-ritmo.no-sencillo', h('span.chip.blanco', '📖 Lectura'), ` ${lectura.leidos} de ${lectura.total} compases leídos (${Math.round(lectura.leidos / lectura.total * 100)} %)`) : null,
        !secciones.length && estadoEf === 'lectura' ? h('p.hero-ritmo.no-sencillo', 'Añade secciones con sus compases para que la lectura cuente en el progreso.') : null,
        ritmo ? h('p.hero-ritmo.no-sencillo', chipRitmo(ritmo, true), ' ',
          ritmo.quedan >= 0 ? `Quedan ${ritmo.quedan} días (${u.fechaCorta(obra.fechaObjetivo)}). Lo esperable ahora sería un ${pct(ritmo.esperado)}.`
            : `La fecha objetivo (${u.fechaCorta(obra.fechaObjetivo)}) ya ha pasado.`) : null,
        h('div.hero-datos.no-sencillo',
          h('div', h('b', u.minutos(minTot)), h('span', 'en total')),
          h('div', h('b', u.minutos(minSem)), h('span', obra.minSemana ? 'de ' + u.minutos(obra.minSemana) + ' esta sem.' : 'esta semana')),
          h('div', h('b', sesiones.length), h('span', 'sesiones'))),
        h('div.fila', { style: { marginTop: '16px' } },
          h('button.btn.blanco.crece', { onclick: () => modelo.sesion.estado ? A.dialogos.terminar() : A.dialogos.iniciar(id) },
            icono(modelo.sesion.estado ? 'stop' : 'play'), modelo.sesion.estado ? 'Terminar sesión' : 'Estudiar la obra'),
          h('a.btn.translucido', { href: '#/herramientas/metronomo/obra:' + id }, icono('metronomo'))),
        obra.notas ? h('p.hero-notas', obra.notas) : null));

      // --------- mapa de la obra
      const pasajes = modelo.pasajesDe(obra);
      if (secciones.some(s => s.desde && s.hasta) || (pasajes.length && obra.compases)) main.appendChild(h('div.no-sencillo', mapaObra(secciones, obra, tomas)));

      // --------- pasajes difíciles (por compases, sin necesidad de secciones)
      main.appendChild(tarjetaPasajes(obra, secciones, tomas));

      // --------- secciones
      main.appendChild(h('div.seccion-titulo', h('h2', 'Secciones'),
        h('div.fila.no-sencillo', { style: { gap: '6px' } },
          h('button.btn.pequeno', { 'data-ayuda': 'varias', onclick: async () => { if (await A.dialogos.variasSecciones(id)) A.app.refrescar(); } }, 'Varias'),
          h('button.btn.primario.pequeno', { 'data-ayuda': 'anadirSeccion', onclick: async () => { const s = await A.dialogos.seccion(id); if (s) A.app.refrescar(); } }, icono('mas'), 'Añadir'))));
      if (!secciones.length) {
        main.appendChild(h('div.tarjeta.vacio.compacto.no-sencillo',
          h('p', { style: { margin: '0 0 6px' } }, h('b', 'Lo recomendable: léela entera primero.'), ' Atril crea una sola sección con toda la obra; cada día apuntas «Hasta el c.» donde llegaste y, cuando la conozcas, la divides en secciones con sentido musical.'),
          h('button.btn.primario', { style: { marginBottom: '8px' }, onclick: async () => { if (await A.dialogos.obraCompleta(obra)) A.app.refrescar(); } }, icono('libro'), 'Empezar a leer la obra entera'),
          h('p.mini.tenue', { style: { margin: '6px 0 8px' } }, 'Si ya la conoces, puedes crear directamente sus secciones (por letras de ensayo o frases).'),
          h('button.btn', { onclick: async () => { if (await A.dialogos.variasSecciones(id)) A.app.refrescar(); } }, 'Crear secciones por compases')));
      } else {
        const lista = h('div.lista-secciones');
        secciones.forEach((s, i) => lista.appendChild(tarjetaSeccion(s, i, secciones, obra, fotosSec[s.id] || [], tomas)));
        main.appendChild(lista);
        if (sinSeccion) main.appendChild(h('p.mini.tenue.no-sencillo', { style: { margin: '-4px 6px 12px' } },
          `Quedan ${sinSeccion} compases de la obra sin sección: cuentan como «Sin empezar» en el progreso.`));
      }

      // --------- escuchar y modo concierto (3.0)
      if (A.escucharUI.activo()) main.appendChild(A.escucharUI.tarjetaObra(obra, secciones, tomas));

      // --------- grabaciones
      if (grabaciones.length) {
        grabaciones.sort((a, b) => b.fecha - a.fecha);
        main.appendChild(h('div.seccion-titulo', h('h2', 'Grabaciones')));
        main.appendChild(h('section.tarjeta', h('ul.lista', grabaciones.map(g => filaGrabacion(g, secciones)))));
      }

      // --------- historial
      main.appendChild(h('div.seccion-titulo.no-sencillo', h('h2', 'Historial'),
        h('button.btn.pequeno', { onclick: async () => { await A.dialogos.sesionManual(id); A.app.refrescar(); } }, icono('mas'), 'Sesión')));
      main.appendChild(h('div.no-sencillo', historial(sesiones, secciones, obra)));

      const off = modelo.sesion.on(() => A.app.refrescar());
      return () => { off(); document.documentElement.style.removeProperty('--obra'); };
    }
  };

  /** Pasajes difíciles de la obra: marcados por compases; los resueltos quedan en el historial */
  function tarjetaPasajes(obra, secciones, tomas) {
    const activos = modelo.pasajesDe(obra);
    const resueltos = modelo.pasajesDe(obra, true).filter(p => p.resuelto).sort((a, b) => b.resuelto - a.resuelto);
    const enCurso = modelo.sesion.estado && modelo.sesion.estado.pasajeId;
    const confTxt = p => {
      const c = tomas && A.escucharUI.activo() && A.escuchar.dePasaje(p, tomas);
      return c ? h('span.esc-mini.peq', { style: { background: A.escuchar.color(c.valor) }, title: 'Confianza según tus escuchas' }, A.sencillo && A.sencillo.activo ? '★' + A.escuchar.estrellas(c.valor) : c.valor + ' %') : null;
    };
    const fila = p => {
      const sec = modelo.seccionDePasaje(secciones, p);
      const meta = [sec ? 'en ' + (sec.letra ? sec.letra + ' · ' : '') + sec.nombre : null,
        p.resuelto ? 'resuelto el ' + u.fechaCorta(p.resuelto) : p.trabajado ? 'trabajado ' + cuando(p.trabajado) : 'sin trabajar aún'].filter(Boolean).join(' · ');
      return h('li', h('div.item.pasaje' + (p.resuelto ? '.resuelto' : '') + (p.id === enCurso ? '.activo' : ''),
        h('div.crece', h('div', h('span.pasaje-rango', '⚡ ' + modelo.textoPasaje(p)), p.nota ? h('span.pasaje-nota', p.nota) : null), h('div.mini.tenue', { style: { marginTop: '4px' } }, meta, confTxt(p))),
        p.resuelto ? h('button.btn.pequeno', { onclick: async () => { await modelo.marcarPasajes(obra.id, [p.id], { resuelto: null }); A.app.refrescar(); } }, 'Reabrir')
          : h('button.btn-icono', { 'aria-label': 'Estudiar el pasaje', title: 'Estudiar', onclick: () => A.dialogos.estudiarPasaje(obra, p, secciones) }, icono('play')),
        h('button.btn-icono', { 'aria-label': 'Más opciones del pasaje', title: 'Editar', onclick: () => opciones(p) }, icono('editar'))));
    };
    async function opciones(p) {
      const r = await u.modal(modelo.textoPasaje(p) + (p.nota ? ' · ' + p.nota : ''), h('p.tenue', { style: { margin: 0 } }, 'Pasaje difícil de «' + obra.titulo + '».'), [
        { texto: 'Borrar', clase: 'peligro', accion: async () => (await u.confirmar('¿Borrar este pasaje? Si ya lo dominas, mejor márcalo como resuelto: así queda en el historial.', 'Borrar', 'peligro')) ? 'borrar' : false },
        { texto: 'Editar', accion: () => 'editar' },
        p.resuelto ? { texto: 'Reabrir', clase: 'primario', accion: () => 'reabrir' } : { texto: 'Resuelto ✓', clase: 'primario', accion: () => 'resuelto' }
      ]);
      if (r === 'borrar') await modelo.borrarPasaje(obra.id, p.id);
      else if (r === 'editar') { if (!(await A.dialogos.pasaje(obra, p))) return; }
      else if (r === 'resuelto') { await modelo.marcarPasajes(obra.id, [p.id], { resuelto: Date.now() }); u.toast('Pasaje resuelto 🎉'); }
      else if (r === 'reabrir') await modelo.marcarPasajes(obra.id, [p.id], { resuelto: null });
      else return;
      A.app.refrescar();
    }
    let verResueltos = false;
    const listaRes = h('ul.lista');
    const btnRes = resueltos.length ? h('button.enlace.mini', { onclick: () => { verResueltos = !verResueltos; listaRes.replaceChildren(...(verResueltos ? resueltos.map(fila) : [])); btnRes.textContent = verResueltos ? 'Ocultar resueltos' : 'Ver resueltos (' + resueltos.length + ')'; } }, 'Ver resueltos (' + resueltos.length + ')') : null;
    return h('section.tarjeta.tarjeta-pasajes',
      h('div.tarjeta-cab', h('span.tarjeta-icono', { style: { background: '#FF8A3D' } }, '⚡'), h('h2.crece', 'Pasajes difíciles'),
        h('button.btn.pequeno', { 'data-ayuda': 'pasaje', onclick: async () => { if (await A.dialogos.pasaje(obra)) A.app.refrescar(); } }, icono('mas'), 'Pasaje')),
      activos.length ? h('ul.lista', activos.map(fila))
        : h('p.mini.tenue', { style: { margin: '0 0 4px' } }, resueltos.length ? 'Ningún pasaje pendiente. ¡Bien!' : 'Marca los compases que se te resisten (p. ej. c. 40–44). No hace falta tener secciones: Atril te los propondrá en «Hoy te toca».'),
      btnRes, listaRes);
  }
  function cuando(t) {
    const d = u.diasEntre(t, new Date());
    return d === 0 ? 'hoy' : d === 1 ? 'ayer' : 'hace ' + d + ' días';
  }

  /** Barra con todos los compases de la obra, coloreada por la fase de cada sección */
  let mapaPorConfianza = false;
  function mapaObra(secciones, obra, tomas) {
    const conRango = secciones.filter(s => s.desde && s.hasta).sort((a, b) => a.desde - b.desde);
    const pasajes = modelo.pasajesDe(obra);
    const total = Math.max(Number(obra && obra.compases) || 0, ...conRango.map(s => s.hasta), ...pasajes.map(p => p.hasta));
    const barra = h('div.mapa-obra');
    const reglas = h('div.mapa-reglas');
    let cursor = 1;
    const tramo = (desde, hasta, s) => {
      const w = (hasta - desde + 1) / total * 100;
      if (!s) { barra.appendChild(h('div.mapa-hueco', { style: { width: w + '%' }, title: `c. ${desde}–${hasta}: sin sección` })); return; }
      const et = s.letra || String(secciones.indexOf(s) + 1);
      const f = modelo.estado(modelo.faseDe(s));
      const conf = mapaPorConfianza ? A.escuchar.deSeccion(s, tomas || []) : null;
      // en «Leyendo», la parte leída va en color y el resto más claro
      const fondo = mapaPorConfianza ? (conf ? A.escuchar.color(conf.valor) : 'repeating-linear-gradient(45deg, var(--tinta-3) 0 5px, color-mix(in srgb, var(--tinta-3) 60%, var(--superficie)) 5px 10px)')
        : f.id === 'lectura'
        ? `linear-gradient(90deg, ${f.color} ${modelo.fraccionLeida(s) * 100}%, color-mix(in srgb, ${f.color} 35%, var(--superficie)) ${modelo.fraccionLeida(s) * 100}%)`
        : f.color;
      barra.appendChild(h('a.mapa-tramo', {
        href: '#/seccion/' + s.id, style: { width: w + '%', background: fondo },
        title: `${s.nombre} · ${modelo.rangoTexto(s)} · ` + (mapaPorConfianza ? (conf ? (conf.medida === 'fluidez' ? 'fluidez ' : 'confianza ') + conf.valor + ' %' : 'sin escuchar') : f.nombre + (f.id === 'lectura' ? ` (${modelo.compasesLeidos(s)} c. leídos)` : ''))
      }, w > 4 ? et : ''));
    };
    conRango.forEach(s => {
      if (s.desde > cursor) tramo(cursor, s.desde - 1, null);
      tramo(Math.max(s.desde, cursor), s.hasta, s);
      cursor = Math.max(cursor, s.hasta + 1);
    });
    if (cursor <= total) tramo(cursor, total, null);
    // la regla marca el principio y el final; y, en lo que se está leyendo, hasta qué compás se ha leído
    [1, total].forEach((c, k) => reglas.appendChild(h('span', { style: { left: (k === 0 ? 0 : 100) + '%' } }, c)));
    const marcas = h('div.mapa-marcas');
    conRango.filter(s => modelo.faseDe(s) === 'lectura' && (s.leidoHasta || 0) >= s.desde && s.leidoHasta < s.hasta).forEach(s => {
      const pos = s.leidoHasta / total * 100;
      marcas.appendChild(h('span' + (pos > 80 ? '.dcha' : pos < 20 ? '.izda' : ''), { style: { left: pos + '%', '--c': modelo.estado('lectura').color }, title: 'Leído hasta el compás ' + s.leidoHasta },
        h('i'), 'leído hasta c. ' + s.leidoHasta));
    });
    // pasajes difíciles: una marca bajo la barra en sus compases
    const capaPas = pasajes.length ? h('div.mapa-pasajes', pasajes.map(p => h('span', {
      style: { left: ((p.desde - 1) / total * 100) + '%', width: Math.max(1.2, (p.hasta - p.desde + 1) / total * 100) + '%' },
      title: 'Pasaje difícil ' + modelo.textoPasaje(p) + (p.nota ? ': ' + p.nota : '')
    }))) : null;
    const hayTomas = A.escucharUI.activo() && tomas && tomas.some(t => t.seccionId);
    if (!hayTomas) mapaPorConfianza = false;
    const selMapa = hayTomas ? h('div.segmentado.mini-seg', [[false, 'Fases'], [true, 'Confianza']].map(([v, t]) =>
      h('button' + (mapaPorConfianza === v ? '.on' : ''), { type: 'button', onclick: () => { mapaPorConfianza = v; const nuevo = mapaObra(secciones, obra, tomas); tarjeta.replaceWith(nuevo); } }, t))) : null;
    const leyenda = mapaPorConfianza
      ? h('div.leyenda', [[30, 'Insegura'], [50, 'Con dudas'], [70, 'Bastante segura'], [90, 'Muy segura']].map(([v, t]) => h('span', h('i', { style: { background: A.escuchar.color(v) } }), t)),
          h('span', h('i', { style: { background: 'var(--tinta-3)' } }), 'Sin escuchar'))
      : h('div.leyenda', modelo.FASES.map(f => h('span', h('i', { style: { background: f.color } }), f.nombre)),
        pasajes.length ? h('span', h('i.pas'), 'Pasaje difícil') : null);
    const tarjeta = h('section.tarjeta',
      h('div.fila', h('h2.crece', 'Mapa de la obra'), selMapa || h('span.mini.tenue', total + ' compases')),
      barra, capaPas, !mapaPorConfianza && marcas.childNodes.length ? marcas : null, reglas, leyenda);
    return tarjeta;
  }

  function tarjetaSeccion(s, i, todas, obra, fotos, tomas) {
    const prog = modelo.progresoSeccion(s);
    const pend = modelo.pendientes(s).length;
    const dom = s.dominio || 0;
    const fase = modelo.estado(modelo.faseDe(s));
    const npas = modelo.pasajesEnSeccion(obra, s).length;
    const conf = tomas && tomas.length && A.escucharUI.activo() ? A.escuchar.deSeccion(s, tomas) : null;
    const tempo = s.tempoObjetivo ? `♩ ${s.tempoActual || '—'}/${s.tempoObjetivo}` : (s.tempoActual ? `♩ ${s.tempoActual}` : '');
    const mover = async (e, d) => {
      e.preventDefault(); e.stopPropagation();
      const j = i + d;
      if (j < 0 || j >= todas.length) return;
      todas.forEach((x, n) => (x.orden = n));
      [todas[i].orden, todas[j].orden] = [todas[j].orden, todas[i].orden];
      await DB.put('secciones', todas[i]); await DB.put('secciones', todas[j]);
      A.app.refrescar();
    };
    const miniatura = fotos.length && A.fotos.activas()
      ? h('div.sec-foto', h('img', { src: A.fotos.url(fotos[0]), alt: '', loading: 'lazy' }), (fotos[0].trazos && fotos[0].trazos.length) ? A.anot.capa(fotos[0], 'cubrir') : null, fotos.length > 1 ? h('span', '+' + (fotos.length - 1)) : null)
      : null;
    return h('a.sec-card', { href: '#/seccion/' + s.id },
      h('div.sec-insignia', { style: { background: fase.color, color: '#fff' } }, s.letra || (i + 1)),
      h('div.crece',
        h('div.sec-nombre', s.dificil ? h('span', { title: 'Pasaje difícil' }, '⚡ ') : null, s.nombre),
        h('div.sec-meta', [modelo.rangoTexto(s), tempo].filter(Boolean).join(' · ')),
        h('div.barra.no-sencillo', { style: { marginTop: '8px', height: '6px' } }, h('i', { style: { width: ancho(prog), background: fase.color } })),
        h('div.fila.envuelve', { style: { gap: '5px', marginTop: '8px' } },
          h('span.chip.no-sencillo', { style: { background: `color-mix(in srgb, ${fase.color} 16%, transparent)`, color: fase.color } },
            fase.id === 'lectura' ? (modelo.fraccionLeida(s) >= 1 ? 'Leída entera · pásala a Montando' : `Leyendo · ${Math.round(modelo.fraccionLeida(s) * 100)} %`) : fase.id === 'pendiente' || fase.id === 'lista' ? fase.nombre : `${fase.nombre} · ${pct(prog)}`),
          fase.id !== 'pendiente' && fase.id !== 'lectura' ? h('span.estrellas.no-sencillo', '★'.repeat(dom), h('span', '★'.repeat(5 - dom))) : null,
          pend ? h('span.chip.acento', '✓ ' + pend) : null,
          conf ? h('span.chip', { style: { background: `color-mix(in srgb, ${A.escuchar.color(conf.valor)} 20%, transparent)` }, title: (conf.medida === 'fluidez' ? 'Fluidez' : 'Confianza') + ' según tus escuchas' }, '👂 ' + (A.sencillo && A.sencillo.activo ? '★' + A.escuchar.estrellas(conf.valor) : conf.valor + ' %')) : null,
          npas ? h('span.chip.aviso', { title: npas === 1 ? '1 pasaje difícil' : npas + ' pasajes difíciles' }, '⚡ ' + npas) : null,
          s.notas ? h('span.chip', icono('nota2'), 'Notas') : null)),
      miniatura,
      h('div.sec-orden.no-sencillo',
        h('button.btn-icono.mini-btn', { 'aria-label': 'Subir', onclick: e => mover(e, -1), disabled: i === 0 }, '↑'),
        h('button.btn-icono.mini-btn', { 'aria-label': 'Bajar', onclick: e => mover(e, 1), disabled: i === todas.length - 1 }, '↓')));
  }

  function historial(sesiones, secciones, obra) {
    if (!sesiones.length) return h('p.tenue.mini', { style: { padding: '0 4px' } }, 'Todavía no hay sesiones de estudio.');
    const nombreSec = Object.fromEntries(secciones.map(s => [s.id, s.nombre]));
    return h('section.tarjeta', h('ul.lista', sesiones.slice(0, 30).map(s => h('li', h('div.item',
      h('div.fecha-caja', h('b', new Date(s.inicio).getDate()), h('span', u.MESES[new Date(s.inicio).getMonth()])),
      h('div.crece',
        h('div', h('b', u.minutos(s.minutosAqui != null ? s.minutosAqui : s.minutos)),
          s.reparto && s.minutosAqui == null ? h('span.tenue', ' · ' + s.reparto.map(r => (nombreSec[r.seccionId] || 'sección') + ' ' + r.minutos + ' min').join(', '))
            : s.seccionId && nombreSec[s.seccionId] ? h('span.tenue', ' · ' + nombreSec[s.seccionId]) : null,
          s.reparto && s.minutosAqui != null ? h('span.tenue', ` · de una sesión de ${u.minutos(s.minutos)}`) : null,
          s.bpm ? h('span.tenue', ` · ♩ ${s.bpm}`) : null, s.valoracion ? h('span.estrellas', ' ' + '★'.repeat(s.valoracion)) : null,
          modelo.tipoDe(s) !== 'estudio' ? h('span.chip.tipo-' + s.tipo, { style: { marginLeft: '6px' } }, modelo.tipo(s.tipo).icono + ' ' + modelo.tipo(s.tipo).nombre) : null,
          (s.pasajes || []).length && obra ? h('span.tenue', ' · ⚡ ' + s.pasajes.map(id => ((obra.pasajes || []).find(p => p.id === id))).filter(Boolean).map(modelo.textoPasaje).join(', ')) : null),
        s.notas ? h('div.mini.tenue', { style: { whiteSpace: 'pre-wrap' } }, s.notas) : h('div.mini.tenue', u.hora(s.inicio))),
      h('button.btn-icono', {
        'aria-label': 'Borrar sesión', onclick: async () => {
          if (await u.confirmar('¿Borrar esta sesión?', 'Borrar', 'peligro')) { await DB.del('sesiones', s.id); A.app.refrescar(); }
        }
      }, icono('borrar')))))));
  }

  function filaGrabacion(g, secciones) {
    const sec = secciones.find(s => s.id === g.seccionId);
    let audio = null;
    const btn = h('button.btn-icono.redondo', {
      'aria-label': 'Escuchar', onclick: () => {
        if (!audio) {
          audio = new Audio(URL.createObjectURL(g.blob));
          audio.onended = () => btn.replaceChildren(icono('play'));
        }
        if (audio.paused) { audio.play(); btn.replaceChildren(icono('pausa')); }
        else { audio.pause(); btn.replaceChildren(icono('play')); }
      }
    }, icono('play'));
    return h('li', h('div.item',
      btn,
      h('div.crece', h('div.titulo', g.nombre || 'Grabación'), h('div.mini.tenue', `${u.fechaCorta(g.fecha)} · ${u.reloj(g.duracion || 0)}` + (sec ? ' · ' + sec.nombre : ''))),
      h('button.btn-icono', { 'aria-label': 'Descargar', onclick: () => u.descargar((g.nombre || 'grabacion') + extension(g.blob), g.blob) }, icono('descargar')),
      h('button.btn-icono', {
        'aria-label': 'Borrar', onclick: async () => {
          if (await u.confirmar('¿Borrar esta grabación?', 'Borrar', 'peligro')) { await DB.del('grabaciones', g.id); A.app.refrescar(); }
        }
      }, icono('borrar'))));
  }
  function extension(blob) {
    const t = (blob && blob.type) || '';
    return t.includes('mp4') ? '.m4a' : t.includes('ogg') ? '.ogg' : '.webm';
  }
  A.grabaciones = { filaGrabacion };
  A.obrasUI = { historial, chipRitmo };
})(window.Atril);
