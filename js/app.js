/* Atril — arranque, navegación, barra de sesión y diálogos compartidos */
(function (A) {
  'use strict';
  const { u, DB, modelo, icono } = A;
  const { h } = u;

  A.vistas = A.vistas || {};

  /* ======================= Diálogos compartidos ======================= */

  /** Desplegables enlazados obra → sección. Devuelve {nodo, valor()} */
  async function selectorObra(obraId, seccionId, permitirSinObra = true) {
    const cart = (await modelo.cartera()).filter(c => c.obra.estado !== 'archivada' || c.obra.id === obraId);
    const selObra = h('select', { name: 'obraId' },
      permitirSinObra ? h('option', { value: '' }, 'Técnica / estudio general') : null,
      cart.map(c => h('option', { value: c.obra.id }, c.obra.titulo + (c.obra.compositor ? ' — ' + c.obra.compositor : ''))));
    const selSec = h('select', { name: 'seccionId' });
    const rellenar = () => {
      const c = cart.find(x => x.obra.id === selObra.value);
      selSec.innerHTML = '';
      selSec.appendChild(h('option', { value: '' }, 'Obra completa'));
      (c ? c.secciones : []).forEach(s => selSec.appendChild(h('option', { value: s.id }, s.nombre)));
      campoSec.style.display = c && c.secciones.length ? '' : 'none';
    };
    const campoSec = u.campo('Sección o pasaje', selSec);
    selObra.value = obraId || '';
    selObra.addEventListener('change', rellenar);
    rellenar();
    if (seccionId) selSec.value = seccionId;
    return {
      nodo: h('div', u.campo('Obra', selObra), campoSec),
      valor: () => ({ obraId: selObra.value || null, seccionId: selSec.value || null }),
      cartera: cart
    };
  }

  async function dialogoIniciar(obraId, seccionId) {
    if (modelo.sesion.estado) { u.toast('Ya hay una sesión en marcha'); return; }
    const sel = await selectorObra(obraId, seccionId);
    const r = await u.modal('Empezar a estudiar', h('div', sel.nodo,
      h('p.mini.tenue', 'El cronómetro sigue contando aunque cambies de pantalla o cierres la app.')), [
      { texto: 'Cancelar', accion: () => null },
      { texto: 'Empezar', clase: 'primario', accion: () => sel.valor() }
    ]);
    if (!r) return;
    await modelo.sesion.iniciar(r.obraId, r.seccionId);
    u.toast('¡A estudiar!');
  }

  async function dialogoTerminar() {
    const e = modelo.sesion.estado;
    if (!e) return;
    const minReal = Math.max(1, Math.round(modelo.sesion.segundos() / 60));
    const sel = await selectorObra(e.obraId, e.seccionId);
    const sec = e.seccionId ? await DB.get('secciones', e.seccionId) : null;
    let valoracion = 0;
    const estrellas = h('div.dominio');
    const pintar = () => Array.from(estrellas.children).forEach((b, i) => b.classList.toggle('on', i < valoracion));
    for (let i = 1; i <= 5; i++) {
      estrellas.appendChild(h('button', { type: 'button', 'aria-label': i + ' de 5', onclick: () => { valoracion = valoracion === i ? 0 : i; pintar(); } }, '★'));
    }
    const ultimoBpm = A.audio.Metronomo.bpmActual;
    const cuerpo = h('div',
      h('p.tenue', 'Has estudiado ', h('b', u.minutos(minReal)), '.'),
      u.campo('Minutos de estudio', h('input', { type: 'number', name: 'minutos', min: 1, max: 600, value: minReal })),
      sel.nodo,
      u.campo('Tempo alcanzado (BPM)', h('input', {
        type: 'number', name: 'bpm', min: 20, max: 400, placeholder: sec && sec.tempoActual ? 'Último: ' + sec.tempoActual : 'Opcional',
        value: ultimoBpm && e.seccionId ? ultimoBpm : undefined
      }), 'Se guarda como tempo actual de la sección.'),
      h('div.campo', h('span.campo-et', '¿Qué tal ha ido?'), estrellas),
      u.campo('Notas', h('textarea', { name: 'notas', placeholder: 'Qué has trabajado, qué falta…' }))
    );
    const r = await u.modal('Terminar sesión', cuerpo, [
      { texto: 'Descartar', clase: 'peligro', accion: async () => (await u.confirmar('¿Descartar esta sesión sin guardarla?', 'Descartar', 'peligro')) ? 'descartar' : false },
      { texto: 'Seguir', accion: () => null },
      { texto: 'Guardar', clase: 'primario', accion: () => Object.assign(u.leerForm(cuerpo), sel.valor(), { valoracion }) }
    ]);
    if (r === 'descartar') { await modelo.sesion.descartar(); u.toast('Sesión descartada'); return; }
    if (!r) return;
    if (!(r.minutos > 0)) r.minutos = minReal;
    await modelo.sesion.terminar(r);
    u.toast('Sesión guardada: ' + u.minutos(r.minutos));
  }

  /** Añadir una sesión pasada a mano */
  async function dialogoSesionManual(obraId) {
    const sel = await selectorObra(obraId, null);
    const hoy = u.claveDia(new Date());
    const cuerpo = h('div',
      h('div.rejilla-2',
        u.campo('Fecha', h('input', { type: 'date', name: 'fecha', value: hoy, max: hoy })),
        u.campo('Minutos', h('input', { type: 'number', name: 'minutos', min: 1, max: 600, value: 30 }))),
      sel.nodo,
      u.campo('Notas', h('textarea', { name: 'notas' })));
    const r = await u.modal('Añadir sesión', cuerpo, [
      { texto: 'Cancelar', accion: () => null },
      { texto: 'Guardar', clase: 'primario', accion: () => Object.assign(u.leerForm(cuerpo), sel.valor()) }
    ]);
    if (!r || !(r.minutos > 0)) return;
    const inicio = new Date(r.fecha + 'T18:00:00').getTime();
    await DB.put('sesiones', { obraId: r.obraId, seccionId: r.seccionId, inicio, fin: inicio + r.minutos * 60000, minutos: r.minutos, notas: r.notas, valoracion: 0, manual: true });
    u.toast('Sesión añadida');
  }

  async function dialogoObra(obra) {
    const nueva = !obra;
    obra = obra || { estado: 'lectura', color: modelo.COLORES[Math.floor(Math.random() * modelo.COLORES.length)] };
    let color = obra.color;
    const colores = h('div.fila.envuelve', modelo.COLORES.map(c => {
      const b = h('button', {
        type: 'button', 'aria-label': 'Color',
        style: { width: '32px', height: '32px', borderRadius: '50%', border: '3px solid ' + (c === color ? 'var(--tinta)' : 'transparent'), background: c, cursor: 'pointer' },
        onclick: () => { color = c; Array.from(colores.children).forEach(x => (x.style.borderColor = 'transparent')); b.style.borderColor = 'var(--tinta)'; }
      });
      return b;
    }));
    const cuerpo = h('div',
      u.campo('Título', h('input', { type: 'text', name: 'titulo', value: obra.titulo || '', placeholder: 'p. ej. Danza del Molinero', required: true })),
      u.campo('Compositor / arreglista', h('input', { type: 'text', name: 'compositor', value: obra.compositor || '' })),
      h('div.rejilla-2',
        u.campo('Fase', h('select', { name: 'estado', value: obra.estado }, modelo.ESTADOS.map(e => h('option', { value: e.id }, e.nombre))), 'Si la divides en secciones, se calcula sola'),
        u.campo('Instrumento / papel', h('input', { type: 'text', name: 'instrumento', value: obra.instrumento || '', placeholder: 'Bandurria 1ª' }))),
      h('div.rejilla-2',
        u.campo('Empecé el', h('input', { type: 'date', name: 'fechaInicio', value: obra.fechaInicio || u.claveDia(obra.creada || Date.now()) })),
        u.campo('Fecha objetivo', h('input', { type: 'date', name: 'fechaObjetivo', value: obra.fechaObjetivo || '' }), 'Concierto, examen…')),
      h('div.rejilla-2',
        u.campo('Tempo objetivo (BPM)', h('input', { type: 'number', name: 'tempoObjetivo', min: 20, max: 400, value: obra.tempoObjetivo || '' })),
        u.campo('Minutos/semana previstos', h('input', { type: 'number', name: 'minSemana', min: 0, max: 3000, value: obra.minSemana || '' }))),
      h('div.campo', h('span.campo-et', 'Color'), colores),
      u.campo('Notas', h('textarea', { name: 'notas', value: obra.notas || '' })));
    const r = await u.modal(nueva ? 'Nueva obra' : 'Editar obra', cuerpo, [
      { texto: 'Cancelar', accion: () => null },
      {
        texto: nueva ? 'Crear' : 'Guardar', clase: 'primario', accion: () => {
          const v = u.leerForm(cuerpo);
          if (!v.titulo) { u.toast('Ponle un título'); return false; }
          return v;
        }
      }
    ]);
    if (!r) return null;
    Object.assign(obra, r, { color });
    if (nueva) obra.creada = Date.now();
    await DB.put('obras', obra);
    return obra;
  }

  /** Crear o editar una sección (rango de compases, letra de ensayo, tempos) */
  async function dialogoSeccion(obraId, sec) {
    const nueva = !sec;
    const hermanas = (await DB.byIndex('secciones', 'obraId', obraId)).sort((a, b) => (a.orden || 0) - (b.orden || 0));
    const obra = await DB.get('obras', obraId);
    if (nueva) {
      const ult = hermanas.reduce((m, x) => Math.max(m, x.hasta || 0), 0);
      sec = { obraId, dominio: 0, fase: 'pendiente', orden: hermanas.length, tareas: [], notas: '', desde: ult ? ult + 1 : 1 };
    }
    const nAuto = 'Sección ' + (nueva ? hermanas.length + 1 : (hermanas.findIndex(x => x.id === sec.id) + 1));
    const cuerpo = h('div',
      h('div.rejilla-2',
        u.campo('Nombre', h('input', { type: 'text', name: 'nombre', value: sec.nombre || '', placeholder: nAuto })),
        u.campo('Letra de ensayo', h('input', { type: 'text', name: 'letra', value: sec.letra || '', maxlength: 3, placeholder: 'A, B, C…' }))),
      u.campo('Fase', h('select', { name: 'fase', value: modelo.faseDe(sec) }, modelo.FASES.map(f => h('option', { value: f.id }, f.nombre)))),
      h('div.rejilla-2',
        u.campo('Desde el compás', h('input', { type: 'number', name: 'desde', min: 1, value: sec.desde || '' })),
        u.campo('Hasta el compás', h('input', { type: 'number', name: 'hasta', min: 1, value: sec.hasta || '' }))),
      h('div.rejilla-2',
        u.campo('Tempo objetivo', h('input', { type: 'number', name: 'tempoObjetivo', min: 20, max: 400, value: sec.tempoObjetivo || (obra && obra.tempoObjetivo) || '' })),
        u.campo('Tempo actual', h('input', { type: 'number', name: 'tempoActual', min: 20, max: 400, value: sec.tempoActual || '' }))),
      h('label.interruptor', h('span', 'Pasaje difícil (darle prioridad)'), h('input', { type: 'checkbox', name: 'dificil', checked: !!sec.dificil })));
    const r = await u.modal(nueva ? 'Nueva sección' : 'Editar sección', cuerpo, [
      { texto: 'Cancelar', accion: () => null },
      {
        texto: nueva ? 'Añadir' : 'Guardar', clase: 'primario', accion: () => {
          const v = u.leerForm(cuerpo);
          if (v.desde && v.hasta && v.hasta < v.desde) { u.toast('El compás final no puede ser menor que el inicial'); return false; }
          if (!v.nombre) v.nombre = nAuto;
          return v;
        }
      }
    ]);
    if (!r) return null;
    const tempoAntes = sec.tempoActual;
    Object.assign(sec, r);
    if (sec.desde && sec.hasta) sec.compases = sec.hasta - sec.desde + 1;
    if (sec.fase === 'lectura' && sec.desde && !(sec.leidoHasta >= sec.desde - 1)) sec.leidoHasta = sec.desde - 1;
    await DB.put('secciones', sec);
    if (r.tempoActual && r.tempoActual !== tempoAntes) await DB.put('tempos', { seccionId: sec.id, bpm: r.tempoActual, fecha: Date.now() });
    return sec;
  }

  /** Crear varias secciones de golpe a partir de rangos: "1-34, 35-60, 61-92" */
  async function dialogoVariasSecciones(obraId) {
    const hermanas = await DB.byIndex('secciones', 'obraId', obraId);
    const ult = hermanas.reduce((m, x) => Math.max(m, x.hasta || 0), 0);
    const rangos = h('textarea', { name: 'rangos', placeholder: '1-34\n35-60\n61-92', style: { minHeight: '110px' } });
    const total = h('input', { type: 'number', min: 1, placeholder: 'p. ej. 120' });
    const cada = h('input', { type: 'number', min: 1, placeholder: 'p. ej. 16' });
    const generar = () => {
      const t = Number(total.value), c = Number(cada.value);
      if (!(t > 0 && c > 0)) return;
      const l = [];
      for (let d = ult + 1; d <= t; d += c) l.push(d + '-' + Math.min(t, d + c - 1));
      rangos.value = l.join('\n');
    };
    total.addEventListener('input', generar); cada.addEventListener('input', generar);
    const cuerpo = h('div',
      u.campo('Rangos de compases', rangos, 'Uno por línea o separados por comas. Puedes poner la letra delante: «A 1-16».'),
      h('p.mini.tenue', { style: { margin: '0 0 6px' } }, 'O genéralos automáticamente:'),
      h('div.rejilla-2', u.campo('Compases de la obra', total), u.campo('Cada cuántos compases', cada)));
    const r = await u.modal('Varias secciones', cuerpo, [
      { texto: 'Cancelar', accion: () => null },
      { texto: 'Crear', clase: 'primario', accion: () => rangos.value }
    ]);
    if (!r) return 0;
    const obra = await DB.get('obras', obraId);
    let n = hermanas.length, creadas = 0;
    for (const trozo of r.split(/[\n,;]+/)) {
      const m = trozo.trim().match(/^([A-Za-zÑñ]{1,3})?\s*(\d+)\s*[-–a]+\s*(\d+)$/);
      if (!m) continue;
      const desde = Number(m[2]), hasta = Number(m[3]);
      if (hasta < desde) continue;
      n++;
      await DB.put('secciones', {
        obraId, nombre: m[1] ? 'Sección ' + m[1].toUpperCase() : 'Sección ' + n, letra: m[1] ? m[1].toUpperCase() : '',
        desde, hasta, compases: hasta - desde + 1, dominio: 0, fase: 'pendiente', orden: n - 1, tareas: [], notas: '',
        tempoObjetivo: (obra && obra.tempoObjetivo) || null
      });
      creadas++;
    }
    u.toast(creadas ? `${creadas} secciones creadas` : 'No he entendido ningún rango');
    return creadas;
  }

  A.dialogos = { selectorObra, iniciar: dialogoIniciar, terminar: dialogoTerminar, sesionManual: dialogoSesionManual, obra: dialogoObra, seccion: dialogoSeccion, variasSecciones: dialogoVariasSecciones };

  /* ======================= Navegación ======================= */
  const PESTANAS = [
    { id: 'hoy', nombre: 'Hoy', icono: 'hoy' },
    { id: 'obras', nombre: 'Obras', icono: 'obras' },
    { id: 'herramientas', nombre: 'Herramientas', icono: 'herramientas' },
    { id: 'estadisticas', nombre: 'Progreso', icono: 'estadisticas' },
    { id: 'ajustes', nombre: 'Ajustes', icono: 'ajustes' }
  ];

  let limpiar = null;
  let generacion = 0;
  const historial = [];      // pantallas visitadas (hash), la última es la actual
  const claveRuta = () => location.hash && location.hash !== '#' && location.hash !== '#/' ? location.hash : '#/hoy';

  function ruta() {
    const partes = (location.hash.replace(/^#\/?/, '') || 'hoy').split('/');
    return { vista: partes[0], params: partes.slice(1).map(decodeURIComponent) };
  }

  async function pintar() {
    const gen = ++generacion;
    const actual = claveRuta();
    if (historial[historial.length - 1] !== actual) historial.push(actual);
    if (historial.length > 60) historial.splice(0, historial.length - 60);
    const { vista, params } = ruta();
    const v = A.vistas[vista] || A.vistas.hoy;
    if (limpiar) { try { limpiar(); } catch (e) { console.error(e); } limpiar = null; }
    const pestana = v.pestana || vista;
    u.$$('nav.pestanas a').forEach(a => a.classList.toggle('activa', a.dataset.id === pestana));

    const titulo = h('h1');
    const acciones = h('div.fila', { style: { gap: '2px' } });
    const cab = h('header.cabecera', v.atras ? h('a.btn-icono.atras', { href: v.atras(params), 'aria-label': 'Atrás' }, icono('atras')) : null, titulo, acciones);
    const main = h('main');
    const raiz = u.$('#app');
    raiz.innerHTML = '';
    document.body.classList.toggle('modo-atril', !!v.pantallaCompleta);
    document.body.dataset.vista = vista;
    if (v.pantallaCompleta) raiz.append(main); else raiz.append(cab, main);
    titulo.textContent = typeof v.titulo === 'function' ? '' : v.titulo;
    try {
      const r = await v.render({ main, titulo, acciones, params, vigente: () => gen === generacion });
      if (gen !== generacion) { if (typeof r === 'function') r(); return; }
      limpiar = typeof r === 'function' ? r : null;
    } catch (e) {
      console.error(e);
      main.appendChild(h('div.tarjeta', h('b', 'Algo ha fallado'), h('p.mini.tenue', String(e && e.message || e))));
    }
    window.scrollTo(0, 0);
  }

  /** Vuelve a pintar la vista actual (tras cambios en los datos) */
  function refrescar() {
    const y = window.scrollY;
    return pintar().then(() => window.scrollTo(0, y));
  }

  function montarNav() {
    const nav = h('nav.pestanas', h('div.dentro', PESTANAS.map(p =>
      h('a', { href: '#/' + p.id, 'data-id': p.id }, icono(p.icono), h('span', p.nombre)))));
    document.body.appendChild(nav);
  }

  /* ======================= Barra de sesión ======================= */
  let nombresCache = {};
  async function etiquetaSesion(e) {
    if (!e) return '';
    const k = e.obraId + '|' + e.seccionId;
    if (nombresCache[k]) return nombresCache[k];
    let t = 'Técnica / estudio general';
    if (e.obraId) {
      const o = await DB.get('obras', e.obraId);
      t = o ? o.titulo : 'Obra';
      if (e.seccionId) { const s = await DB.get('secciones', e.seccionId); if (s) t += ' · ' + s.nombre; }
    }
    return (nombresCache[k] = t);
  }

  function montarBarraSesion() {
    const que = h('div.que');
    const reloj = h('div.reloj');
    const btnPausa = h('button.btn-icono', { 'aria-label': 'Pausar', onclick: () => modelo.sesion.estado.pausadaEn ? modelo.sesion.reanudar() : modelo.sesion.pausar() });
    const barra = h('div#barra-sesion', h('span.punto'), h('div.info', que, reloj), btnPausa,
      h('button.btn.primario', { onclick: () => dialogoTerminar() }, 'Terminar'));
    document.body.appendChild(barra);
    const tick = () => { if (modelo.sesion.estado) reloj.textContent = u.reloj(modelo.sesion.segundos()); };
    setInterval(tick, 500);
    modelo.sesion.on(async e => {
      document.body.classList.toggle('con-sesion', !!e);
      if (!e) return;
      barra.classList.toggle('pausada', !!e.pausadaEn);
      btnPausa.innerHTML = '';
      btnPausa.appendChild(icono(e.pausadaEn ? 'play' : 'pausa'));
      btnPausa.setAttribute('aria-label', e.pausadaEn ? 'Reanudar' : 'Pausar');
      que.textContent = (e.pausadaEn ? 'En pausa · ' : '') + await etiquetaSesion(e);
      tick();
    });
    DB.alCambiar(st => { if (st === 'obras' || st === 'secciones' || st === '*') nombresCache = {}; });
  }

  /* ======================= Tema ======================= */
  async function aplicarTema() {
    const t = await DB.kvGet('tema', 'auto');
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  }

  /* ======================= Bienvenida ======================= */
  const T0 = performance.now();
  function cerrarBienvenida(inicio = T0) {
    const bv = document.getElementById('bienvenida');
    if (!bv || bv.classList.contains('oculta')) return;
    const v = document.getElementById('bv-version');
    if (v) v.textContent = 'versión ' + A.VERSION;
    let hecho = false;
    const salir = () => {
      if (hecho) return; hecho = true;
      try { sessionStorage.setItem('atrilBienvenida', '1'); } catch (e) {}
      bv.classList.add('sale');
      setTimeout(() => bv.classList.add('oculta'), 600);
    };
    bv.addEventListener('click', salir);
    setTimeout(salir, Math.max(300, 6000 - (performance.now() - inicio)));
  }
  A.bienvenida = {
    activa() { try { return !localStorage.getItem('atrilSinBienvenida'); } catch (e) { return true; } },
    poner(si) { try { si ? localStorage.removeItem('atrilSinBienvenida') : localStorage.setItem('atrilSinBienvenida', '1'); } catch (e) {} },
    ver() {
      try { sessionStorage.removeItem('atrilBienvenida'); } catch (e) {}
      const bv = document.getElementById('bienvenida');
      if (!bv) return;
      // reinicia las animaciones
      const nuevo = bv.cloneNode(true);
      nuevo.className = '';
      bv.replaceWith(nuevo);
      cerrarBienvenida(performance.now());
    }
  };

  /* ======================= Botón atrás y salida ======================= */

  /** Cierra la capa que esté encima (bienvenida, diálogo, editor, visor). true si cerró algo. */
  function cerrarCapa() {
    const bv = document.getElementById('bienvenida');
    if (bv && !bv.classList.contains('oculta') && !bv.classList.contains('sale')) { bv.click(); return true; }
    const modales = u.$$('.modal-fondo.show');
    if (modales.length) { modales[modales.length - 1].click(); return true; }
    const editor = u.$('.anot-editor .anot-barra .btn-icono');
    if (editor) { editor.click(); return true; }
    const visor = u.$('.visor .visor-barra .btn-icono[aria-label="Cerrar"]');
    if (visor) { visor.click(); return true; }
    return false;
  }

  /** Pantalla «madre» de la actual, para cuando no hay historial */
  async function pantallaMadre() {
    const { vista, params } = ruta();
    if (vista === 'hoy') return null;
    if (vista === 'obra') return '#/obras';
    if (vista === 'atril') return '#/seccion/' + params[0];
    if (vista === 'seccion') {
      const s = await DB.get('secciones', params[0]);
      return s ? '#/obra/' + s.obraId : '#/obras';
    }
    if (vista === 'herramientas' && params[1]) {
      return params[1].startsWith('obra:') ? '#/obra/' + params[1].slice(5) : '#/seccion/' + params[1];
    }
    if (vista === 'obras' && params[0] === 'archivadas') return '#/obras';
    return '#/hoy';
  }

  let atrasOcupado = false;
  async function atras() {
    if (atrasOcupado) return;
    atrasOcupado = true;
    try {
      if (cerrarCapa()) return;
      if (ruta().vista === 'hoy') { pedirSalida(); return; }
      historial.pop();                                   // la pantalla actual
      let destino = historial[historial.length - 1];
      if (!destino) destino = await pantallaMadre();
      if (!destino) { pedirSalida(); return; }
      historial.pop();                                   // pintar() la volverá a apuntar
      if (destino === claveRuta()) pintar(); else location.hash = destino;
    } finally { atrasOcupado = false; }
  }

  let preguntaAbierta = false;
  async function pedirSalida() {
    if (!(A.nativo && A.nativo.puedeSalir) || preguntaAbierta) return;
    preguntaAbierta = true;
    const si = await u.modal('¿Salir de Atril?', h('p.tenue', { style: { margin: 0 } },
      modelo.sesion.estado ? 'Tu sesión de estudio en curso se guarda y sigue contando: la encontrarás al volver.' : 'Tus datos quedan guardados en el dispositivo.'), [
      { texto: 'Cancelar', accion: () => null },
      { texto: 'Salir', clase: 'primario', accion: () => true }
    ]);
    preguntaAbierta = false;
    if (si) salirDeAtril();
  }

  /** Para el sonido, guarda lo pendiente y cierra la app */
  async function salirDeAtril() {
    try {
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      if (limpiar) { try { limpiar(); } catch (e) { console.error(e); } limpiar = null; }
      try { await A.audio.Metronomo.parar(); } catch (e) {}
      try { if (A.nativo.Metronomo) await A.nativo.Metronomo.parar(); } catch (e) {}   // por si el servicio sigue vivo
      try { if (A.relax) A.relax.pararTodo(0.05); } catch (e) {}
      u.pantallaEncendida(false);
      await new Promise(r => setTimeout(r, 700));   // deja terminar los guardados con retardo (notas, lectura…)
      await DB.esperar();
    } catch (e) { console.error(e); }
    if (A.nativo.App) A.nativo.App.exitApp();
  }

  /* ======================= Arranque ======================= */
  async function arrancar() {
    cerrarBienvenida();
    await aplicarTema();
    montarNav();
    montarBarraSesion();
    await modelo.migrar();
    // mientras corre el temporizador de estudio, la pantalla no se apaga
    modelo.sesion.on(e => u.pantallaEncendida(!!(e && !e.pausadaEn), 'sesion'));
    await modelo.sesion.cargar();
    window.addEventListener('hashchange', pintar);
    // al volver a la app, refrescar datos que dependen de la hora
    document.addEventListener('visibilitychange', () => { if (!document.hidden && ruta().vista === 'hoy') refrescar(); });
    await pintar();
    avisoInstalarIOS();
    if (A.nativo && A.nativo.App) A.nativo.App.addListener('backButton', () => atras());
    if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !(A.nativo && A.nativo.es)) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
      // Web instalada (iPhone, etc.): pedir que el navegador no borre los datos por falta de espacio
      try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
    }
  }

  /* iPhone / iPad en Safari sin instalar: explicar cómo añadirla a la pantalla de inicio */
  function avisoInstalarIOS() {
    const esIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const instalada = navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
    if (!esIOS || instalada || !location.protocol.startsWith('http')) return;
    try { if (sessionStorage.getItem('atrilAvisoIOS')) return; } catch (e) {}
    const caja = u.h('div.aviso-ios',
      u.h('b', 'Instala Atril en tu iPhone'),
      u.h('span', 'Toca el botón Compartir ', u.h('span.ios-share', '⬆︎'), ' de Safari y elige «Añadir a pantalla de inicio». Ábrela siempre desde ese icono: así funciona sin conexión y tus datos quedan guardados en ella.'),
      u.h('button.btn-icono', { 'aria-label': 'Cerrar', onclick: () => { caja.remove(); try { sessionStorage.setItem('atrilAvisoIOS', '1'); } catch (e) {} } }, '✕'));
    document.body.appendChild(caja);
  }

  A.app = { pintar, refrescar, aplicarTema, ruta, atras, pedirSalida };
  document.addEventListener('DOMContentLoaded', arrancar);
})(window.Atril);
