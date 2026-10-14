/* Atril — reglas del dominio: estados, progreso, plan de estudio y sesión en curso */
(function (A) {
  'use strict';
  const { DB, u } = A;

  /*
   * Fases de estudio. Cada fase ocupa un tramo del progreso:
   *   Leyendo 0–20 % (según los compases leídos) · Montando 20–50 % · Puliendo 50–80 % · Lista 100 %.
   * Dentro de Montando y Puliendo se avanza con el dominio (estrellas) y el tempo conseguido.
   */
  const ESTADOS = [
    { id: 'pendiente', nombre: 'Sin empezar', corto: 'Sin empezar', desde: 0, hasta: 0, color: '#A9A4C8' },
    { id: 'lectura', nombre: 'Leyendo', corto: 'Leyendo', desde: 0, hasta: 0.2, color: '#3D7BFF' },
    { id: 'montaje', nombre: 'Montando', corto: 'Montando', desde: 0.2, hasta: 0.5, color: '#FF8A3D' },
    { id: 'pulido', nombre: 'Puliendo', corto: 'Puliendo', desde: 0.5, hasta: 0.8, color: '#B455F5' },
    { id: 'lista', nombre: 'Lista', corto: 'Lista', desde: 1, hasta: 1, color: '#22C27A' },
    { id: 'archivada', nombre: 'Archivada', corto: 'Archivada', desde: 1, hasta: 1, color: '#7F7AA8' }
  ];
  const FASES = ESTADOS.filter(e => e.id !== 'archivada');
  const estado = id => ESTADOS.find(e => e.id === id) || ESTADOS[0];
  const indiceFase = id => Math.max(0, FASES.findIndex(f => f.id === id));
  const faseDe = s => (s && FASES.some(f => f.id === s.fase)) ? s.fase : 'pendiente';

  const DOMINIO = ['Sin valorar', 'Muy inseguro', 'Con dificultad', 'Aceptable', 'Seguro', 'Dominado'];

  const COLORES = ['#7C5CFF', '#FF4F8B', '#FF8A3D', '#F5B400', '#22C27A', '#16B4C8', '#3D7BFF', '#B455F5'];

  /** Compases de una sección (por rango o, en datos antiguos, por cantidad) */
  function compasesSeccion(s) {
    if (s.desde > 0 && s.hasta >= s.desde) return s.hasta - s.desde + 1;
    return s.compases || 0;
  }
  /** "c. 1–34" */
  function rangoTexto(s) {
    if (s.desde > 0 && s.hasta > 0) return s.desde === s.hasta ? 'c. ' + s.desde : 'c. ' + s.desde + '–' + s.hasta;
    if (s.compases) return s.compases + ' c.';
    return '';
  }
  const pendientes = s => (s.tareas || []).filter(t => !t.hecha);
  const tieneRango = s => s.desde > 0 && s.hasta >= s.desde;

  /** Parte leída de una sección, 0..1 (completa si ya pasó de «Leyendo») */
  function fraccionLeida(s) {
    const f = faseDe(s);
    if (f === 'pendiente') return 0;
    if (f !== 'lectura') return 1;
    if (tieneRango(s)) {
      const n = compasesSeccion(s);
      return u.clamp(((s.leidoHasta || 0) - s.desde + 1) / n, 0, 1);
    }
    return u.clamp((s.leidoPct || 0) / 100, 0, 1);
  }
  /** Compases leídos de una sección */
  const compasesLeidos = s => Math.round(compasesSeccion(s) * fraccionLeida(s));

  /** Lo bien que va una sección dentro de su fase, 0..1: dominio y tempo a partes iguales */
  function maestria(s) {
    const dom = (s.dominio || 0) / 5;
    if (s.tempoObjetivo > 0 && s.tempoActual > 0) return 0.5 * dom + 0.5 * Math.min(1, s.tempoActual / s.tempoObjetivo);
    return dom;
  }

  /** Progreso de una sección, 0..1 */
  function progresoSeccion(s) {
    const f = estado(faseDe(s));
    if (f.id === 'lectura') return f.hasta * fraccionLeida(s);
    if (f.id === 'montaje' || f.id === 'pulido') return f.desde + (f.hasta - f.desde) * maestria(s);
    return f.desde;
  }

  /**
   * Compases de la obra que todavía no están en ninguna sección (si se conoce el total de la obra).
   * Cuentan como «sin empezar»: así el progreso no engaña cuando las secciones se van creando poco a poco.
   */
  function compasesSinSeccion(obra, secciones) {
    const total = Number(obra && obra.compases) || 0;
    if (!total) return 0;
    const cubierto = new Uint8Array(total + 1);
    (secciones || []).forEach(s => { if (tieneRango(s)) for (let c = Math.max(1, s.desde); c <= Math.min(total, s.hasta); c++) cubierto[c] = 1; });
    let n = 0;
    for (let c = 1; c <= total; c++) if (!cubierto[c]) n++;
    return n;
  }

  /** Fase de la obra: la manual si no hay secciones; si las hay, la de la sección más atrasada */
  function estadoObra(obra, secciones) {
    if (obra.estado === 'archivada') return 'archivada';
    if (!secciones || !secciones.length) return estado(obra.estado).id;
    const idx = secciones.map(s => indiceFase(faseDe(s)));
    if (compasesSinSeccion(obra, secciones)) idx.push(0);   // quedan compases sin sección: aún no está toda empezada
    let min = Math.min(...idx);
    if (min === 0 && Math.max(...idx) > 0) min = 1; // si alguna está empezada, la obra está «Leyendo»
    return FASES[min].id;
  }

  /** Progreso de una obra, 0..1 (ponderado por compases si los hay) */
  function progresoObra(obra, secciones) {
    if (!secciones || !secciones.length) return estado(obra.estado).desde;
    let tot = compasesSinSeccion(obra, secciones), acc = 0;
    secciones.forEach(s => {
      const w = compasesSeccion(s) || 1;
      tot += w; acc += w * progresoSeccion(s);
    });
    return tot ? acc / tot : 0;
  }

  /** Lectura de la obra: compases leídos y totales (con los compases aún sin sección, si se conoce el total) */
  function lecturaObra(secciones, obra) {
    let leidos = 0, total = compasesSinSeccion(obra, secciones);
    (secciones || []).forEach(s => { const n = compasesSeccion(s); total += n; leidos += compasesLeidos(s); });
    return { leidos, total };
  }

  /** Asigna fase a las secciones de versiones anteriores (que no la tenían) */
  async function migrar() {
    const secs = await DB.all('secciones');
    const sinFase = secs.filter(s => !s.fase);
    if (!sinFase.length) return;
    const obras = Object.fromEntries((await DB.all('obras')).map(o => [o.id, o]));
    for (const s of sinFase) {
      const e = obras[s.obraId] ? obras[s.obraId].estado : 'lectura';
      s.fase = e === 'archivada' ? 'lista' : (FASES.some(f => f.id === e) ? e : 'lectura');
      await DB.put('secciones', s);
    }
  }

  /** ¿Va la obra por detrás de lo esperado para su fecha objetivo? */
  function ritmoObra(obra, progreso, est) {
    est = est || obra.estado;
    if (!obra.fechaObjetivo || est === 'archivada' || est === 'lista') return null;
    const ini = new Date(obra.fechaInicio || obra.creada);
    const fin = new Date(obra.fechaObjetivo + 'T23:59:59');
    const hoy = new Date();
    const total = Math.max(1, u.diasEntre(ini, fin));
    const pasados = u.clamp(u.diasEntre(ini, hoy), 0, total);
    const esperado = pasados / total;
    const quedan = u.diasEntre(hoy, fin);
    let nivel = 'bien';
    if (quedan < 0 && progreso < 1) nivel = 'vencida';
    else if (progreso < esperado - 0.2) nivel = 'retrasada';
    else if (progreso < esperado - 0.08) nivel = 'justa';
    return { esperado, quedan, nivel };
  }

  /* ---------------- Plan de estudio ---------------- */
  const PLAN_DEF = { dias: [45, 45, 45, 45, 45, 30, 0], obras: {} }; // lunes..domingo

  async function plan() {
    const p = await DB.kvGet('plan', null);
    return Object.assign({}, PLAN_DEF, p || {}, { obras: (p && p.obras) || {} });
  }
  /** Minutos previstos para una fecha (índice lunes=0) */
  function previstoDia(p, fecha) {
    const wd = (new Date(fecha).getDay() + 6) % 7;
    return p.dias[wd] || 0;
  }

  /** Suma minutos de sesiones agrupados por día (clave AAAA-MM-DD) */
  function minutosPorDia(sesiones) {
    const m = {};
    sesiones.forEach(s => {
      const k = u.claveDia(s.inicio);
      m[k] = (m[k] || 0) + (s.minutos || 0);
    });
    return m;
  }

  /** Racha de días consecutivos con estudio (hoy cuenta si ya se estudió) */
  function racha(porDia) {
    let n = 0, d = new Date();
    if (!porDia[u.claveDia(d)]) d = u.sumarDias(d, -1);
    while (porDia[u.claveDia(d)] > 0) { n++; d = u.sumarDias(d, -1); }
    return n;
  }

  /* ---------------- Sesión de estudio en curso ---------------- */

  /* ======================= Tipos de sesión ======================= */
  const TIPOS = [
    { id: 'estudio', nombre: 'Estudio', icono: '🎵' },
    { id: 'clase', nombre: 'Clase', icono: '🎓' },
    { id: 'ensayo', nombre: 'Ensayo', icono: '👥' },
    { id: 'concierto', nombre: 'Concierto', icono: '🎭' }
  ];
  const tipoDe = x => (x && TIPOS.some(t => t.id === x.tipo)) ? x.tipo : 'estudio';
  const tipo = id => TIPOS.find(t => t.id === id) || TIPOS[0];

  /* ======================= Pasajes difíciles ======================= */
  /*
   * Van dentro de la obra, por compases y sin depender de las secciones:
   * obra.pasajes = [{ id, desde, hasta, nota, creado, resuelto: null|fecha, trabajado: null|fecha }]
   * Así siguen marcados aunque se creen, dividan o unan secciones.
   */
  const pasajesDe = (obra, todos) => ((obra && obra.pasajes) || []).filter(p => todos || !p.resuelto).slice().sort((a, b) => a.desde - b.desde || a.hasta - b.hasta);
  const textoPasaje = p => p.desde === p.hasta ? 'c. ' + p.desde : 'c. ' + p.desde + '–' + p.hasta;
  /** Pasajes que caen (aunque sea en parte) dentro de una sección */
  function pasajesEnSeccion(obra, s, todos) {
    if (!tieneRango(s)) return [];
    return pasajesDe(obra, todos).filter(p => p.desde <= s.hasta && p.hasta >= s.desde);
  }
  /** Sección donde se estudia un pasaje: la que contiene más compases suyos */
  function seccionDePasaje(secciones, p) {
    let mejor = null, max = 0;
    (secciones || []).forEach(s => {
      if (!tieneRango(s)) return;
      const n = Math.min(s.hasta, p.hasta) - Math.max(s.desde, p.desde) + 1;
      if (n > max) { max = n; mejor = s; }
    });
    return mejor;
  }
  async function guardarPasaje(obraId, datos) {
    const obra = await DB.get('obras', obraId);
    if (!obra) return null;
    obra.pasajes = obra.pasajes || [];
    let p = datos.id && obra.pasajes.find(x => x.id === datos.id);
    if (!p) { p = { id: u.uid(), creado: Date.now(), resuelto: null, trabajado: null }; obra.pasajes.push(p); }
    Object.assign(p, datos, { id: p.id });
    if (p.hasta < p.desde) [p.desde, p.hasta] = [p.hasta, p.desde];
    await DB.put('obras', obra);
    return p;
  }
  async function borrarPasaje(obraId, id) {
    const obra = await DB.get('obras', obraId);
    if (!obra || !obra.pasajes) return;
    obra.pasajes = obra.pasajes.filter(p => p.id !== id);
    await DB.put('obras', obra);
  }
  async function marcarPasajes(obraId, ids, cambios) {
    if (!obraId || !ids || !ids.length) return;
    const obra = await DB.get('obras', obraId);
    if (!obra || !obra.pasajes) return;
    let algo = false;
    obra.pasajes.forEach(p => { if (ids.includes(p.id)) { Object.assign(p, cambios); algo = true; } });
    if (algo) await DB.put('obras', obra);
  }

  /*
   * Registro de lectura de la obra por días (para el resumen semanal):
   * obra.lecturaLog = { 'AAAA-MM-DD': { a: compases leídos al empezar el día, b: al terminar } }
   */
  async function anotarLectura(obraId, delta) {
    const obra = await DB.get('obras', obraId);
    if (!obra) return;
    const secs = await DB.byIndex('secciones', 'obraId', obraId);
    const ahora = lecturaObra(secs, obra).leidos;
    const k = u.claveDia(new Date());
    obra.lecturaLog = obra.lecturaLog || {};
    // delta: compases que ha cambiado esta anotación (para saber cuántos había leídos al empezar el día)
    const e = obra.lecturaLog[k] || { a: Math.max(0, ahora - (delta || 0)), b: ahora };
    e.b = ahora;
    obra.lecturaLog[k] = e;
    await DB.put('obras', obra);
  }
  /** Compases leídos en un intervalo de días [ini, fin) */
  function lecturaEntre(obra, ini, fin) {
    const a = u.claveDia(ini), b = u.claveDia(fin);
    let n = 0;
    Object.entries((obra && obra.lecturaLog) || {}).forEach(([k, e]) => { if (k >= a && k < b) n += Math.max(0, (e.b || 0) - (e.a || 0)); });
    return n;
  }

  const sesion = {
    estado: null, // {obraId, seccionId, inicio, pausadaEn, pausas, tramos: {seccionId: seg}, tramoDesde, pasajeId, pasajes: [ids]}
    _ev: new Set(),
    on(f) { this._ev.add(f); return () => this._ev.delete(f); },
    _emit() { this._ev.forEach(f => f(this.estado)); },
    async cargar() { this.estado = await DB.kvGet('sesionActiva', null); this._emit(); },
    async _guardar() { await DB.kvSet('sesionActiva', this.estado); this._emit(); },

    segundos() {
      const e = this.estado;
      if (!e) return 0;
      const fin = e.pausadaEn || Date.now();
      return (fin - e.inicio - (e.pausas || 0)) / 1000;
    },
    /** Suma al tramo de la sección actual el tiempo desde la última anotación */
    _acumular(ahora = Date.now()) {
      const e = this.estado;
      if (!e) return;
      e.tramos = e.tramos || {};
      if (e.tramoDesde && !e.pausadaEn) {
        const k = e.seccionId || '';
        e.tramos[k] = (e.tramos[k] || 0) + Math.max(0, (ahora - e.tramoDesde) / 1000);
      }
      e.tramoDesde = e.pausadaEn ? null : ahora;
    },
    /**
     * Tiempo de la sesión repartido por secciones: [{seccionId, seg}], de más a menos.
     * Solo cuentan las secciones con al menos 20 segundos.
     */
    reparto() {
      const e = this.estado;
      if (!e) return [];
      const t = Object.assign({}, e.tramos || {});
      if (e.tramoDesde && !e.pausadaEn) { const k = e.seccionId || ''; t[k] = (t[k] || 0) + (Date.now() - e.tramoDesde) / 1000; }
      if (!e.tramos && !e.tramoDesde) t[e.seccionId || ''] = this.segundos();   // sesiones de versiones anteriores
      return Object.entries(t).filter(([, seg]) => seg >= 20).map(([seccionId, seg]) => ({ seccionId: seccionId || null, seg })).sort((a, b) => b.seg - a.seg);
    },
    async iniciar(obraId, seccionId) {
      if (this.estado) return;
      const ahora = Date.now();
      this.estado = { obraId: obraId || null, seccionId: seccionId || null, inicio: ahora, pausadaEn: null, pausas: 0, tramos: {}, tramoDesde: ahora };
      await this._guardar();
    },
    async cambiar(obraId, seccionId) {
      if (!this.estado) return;
      this._acumular();
      if (this.estado.obraId !== (obraId || null)) { this.estado.pasajes = []; this.estado.pasajeId = null; }
      this.estado.obraId = obraId || null; this.estado.seccionId = seccionId || null;
      if (this.estado.pasajeId && this.estado.seccionId !== seccionId) this.estado.pasajeId = null;
      await this._guardar();
    },
    /** Indica el pasaje difícil que se está estudiando (queda anotado como trabajado al terminar) */
    async pasaje(id) {
      if (!this.estado) return;
      this.estado.pasajeId = id || null;
      this.estado.pasajes = this.estado.pasajes || [];
      if (id && !this.estado.pasajes.includes(id)) this.estado.pasajes.push(id);
      await this._guardar();
    },
    async pausar() {
      if (!this.estado || this.estado.pausadaEn) return;
      const ahora = Date.now();
      this._acumular(ahora);
      this.estado.pausadaEn = ahora; this.estado.tramoDesde = null;
      await this._guardar();
    },
    async reanudar() {
      if (!this.estado || !this.estado.pausadaEn) return;
      this.estado.pausas += Date.now() - this.estado.pausadaEn;
      this.estado.pausadaEn = null;
      this.estado.tramoDesde = Date.now();
      await this._guardar();
    },
    async descartar() { this.estado = null; await DB.kvSet('sesionActiva', null); this._emit(); },
    /** Cierra la sesión guardando los datos del diálogo de cierre */
    async terminar(datos) {
      const e = this.estado;
      if (!e) return null;
      const s = {
        obraId: datos.obraId !== undefined ? datos.obraId : e.obraId,
        seccionId: datos.seccionId !== undefined ? datos.seccionId : e.seccionId,
        inicio: e.inicio,
        fin: e.pausadaEn || Date.now(),
        minutos: datos.minutos,
        notas: datos.notas || '',
        valoracion: datos.valoracion || 0,
        bpm: datos.bpm || null,
        tipo: TIPOS.some(t => t.id === datos.tipo) ? datos.tipo : 'estudio'
      };
      const pas = (e.pasajes || []).slice();
      if (pas.length && s.obraId === e.obraId) s.pasajes = pas;
      // varias secciones en la misma sesión: cada una con sus minutos; la principal es la de más tiempo
      const rep = (datos.reparto || []).filter(r => r.seccionId && r.minutos > 0);
      if (rep.length > 1) {
        s.reparto = rep.map(r => ({ seccionId: r.seccionId, minutos: r.minutos }));
        s.seccionId = rep.slice().sort((a, b) => b.minutos - a.minutos)[0].seccionId;
        s.minutos = rep.reduce((a, r) => a + r.minutos, 0) + (datos.minutosGeneral || 0);
      }
      await DB.put('sesiones', s);
      await registrarTempo(datos.bpmSeccionId || s.seccionId, s.bpm);
      if (s.pasajes) await marcarPasajes(s.obraId, s.pasajes, { trabajado: s.fin });
      await this.descartar();
      return s;
    }
  };

  /** Guarda un tempo alcanzado en una sección (y su historial) */
  async function registrarTempo(seccionId, bpm) {
    if (!seccionId || !(bpm > 0)) return;
    const sec = await DB.get('secciones', seccionId);
    if (!sec) return;
    sec.tempoActual = bpm;
    sec.trabajada = Date.now();
    await DB.put('secciones', sec);
    await DB.put('tempos', { seccionId, bpm, fecha: Date.now() });
  }

  /** Datos completos de la cartera (obras + secciones + minutos) */
  async function cartera() {
    const [obras, secciones, sesiones] = await Promise.all([DB.all('obras'), DB.all('secciones'), DB.all('sesiones')]);
    const porObra = {};
    secciones.forEach(s => (porObra[s.obraId] = porObra[s.obraId] || []).push(s));
    Object.values(porObra).forEach(l => l.sort((a, b) => (a.orden || 0) - (b.orden || 0)));
    const minObra = {};
    sesiones.forEach(s => { if (s.obraId) minObra[s.obraId] = (minObra[s.obraId] || 0) + (s.minutos || 0); });
    return obras.map(o => {
      const secs = porObra[o.id] || [];
      const progreso = progresoObra(o, secs);
      const est = estadoObra(o, secs);
      return { obra: o, secciones: secs, progreso, estado: est, minutos: minObra[o.id] || 0, ritmo: ritmoObra(o, progreso, est) };
    }).sort((a, b) => {
      const arch = (a.obra.estado === 'archivada') - (b.obra.estado === 'archivada');
      if (arch) return arch;
      const fa = a.obra.fechaObjetivo || '9999', fb = b.obra.fechaObjetivo || '9999';
      return fa.localeCompare(fb) || a.obra.titulo.localeCompare(b.obra.titulo);
    });
  }

  /**
   * Qué estudiar hoy: puntúa cada sección de las obras activas.
   * Pesan el dominio bajo, que esté marcada como difícil, las tareas pendientes,
   * lo lejos que está del tempo objetivo, los días sin tocarla y la urgencia de la obra.
   */
  /** Última vez que se trabajó cada sección: sesiones (también repartidas) y cambios hechos a mano */
  function ultimasVeces(cart, sesiones) {
    const ultima = {};
    const anotar = (id, t) => { if (id && t && (!ultima[id] || t > ultima[id])) ultima[id] = t; };
    sesiones.forEach(x => {
      anotar(x.seccionId, x.inicio);
      (x.reparto || []).forEach(r => anotar(r.seccionId, x.inicio));
    });
    cart.forEach(c => c.secciones.forEach(s => anotar(s.id, s.trabajada)));
    return ultima;
  }

  /** Secciones trabajadas hoy (para «Hoy ya has trabajado…») */
  function trabajadasHoy(cart, sesiones) {
    const ultima = ultimasVeces(cart, sesiones), hoy = new Date(), out = [];
    cart.forEach(c => c.secciones.forEach(s => { if (ultima[s.id] && u.diasEntre(ultima[s.id], hoy) === 0) out.push({ c, s }); }));
    return out;
  }

  /*
   * «Para mañana»: lo que el músico deja preparado (la víspera o cuando quiera) para un día concreto.
   * Se guarda por día: { 'AAAA-MM-DD': [{ obraId, seccionId|null }] }. Lo de días pasados se borra solo.
   * En «Hoy te toca» va siempre primero; las sugerencias automáticas completan después.
   */
  const paraDia = {
    async _todo() {
      const t = await DB.kvGet('paraDia', {}) || {};
      const hoy = u.claveDia(new Date());
      let cambio = false;
      Object.keys(t).forEach(k => { if (k < hoy) { delete t[k]; cambio = true; } });
      if (cambio) await DB.kvSet('paraDia', t);
      return t;
    },
    async de(fecha) { return (await this._todo())[u.claveDia(fecha)] || []; },
    async poner(fecha, items) {
      const t = await this._todo(), k = u.claveDia(fecha);
      if (items && items.length) t[k] = items; else delete t[k];
      await DB.kvSet('paraDia', t);
    },
    /** Añade o quita una obra/sección del día. Devuelve true si queda añadida. */
    async alternar(fecha, obraId, seccionId) {
      const l = await this.de(fecha);
      const i = l.findIndex(x => x.obraId === obraId && (x.seccionId || null) === (seccionId || null));
      if (i >= 0) l.splice(i, 1); else l.push({ obraId, seccionId: seccionId || null });
      await this.poner(fecha, l);
      return i < 0;
    },
    async tiene(fecha, obraId, seccionId) {
      return (await this.de(fecha)).some(x => x.obraId === obraId && (x.seccionId || null) === (seccionId || null));
    },
    manana() { const d = new Date(); d.setDate(d.getDate() + 1); return d; }
  };

  /**
   * «Hoy te toca» completo: primero lo preparado para hoy (en su orden), luego las sugerencias
   * automáticas hasta completar. Cada elemento: { c, s|null, preparado, hecho, motivos }.
   */
  async function hoyTeToca(cart, sesiones, nAuto = 3) {
    const hoy = new Date();
    const prep = await paraDia.de(hoy);
    const ultima = ultimasVeces(cart, sesiones);
    const obrasHoy = new Set(sesiones.filter(x => x.obraId && u.diasEntre(x.inicio, hoy) === 0).map(x => x.obraId));
    const lista = [];
    prep.forEach(p => {
      const c = cart.find(x => x.obra.id === p.obraId);
      if (!c) return;
      const s = p.seccionId ? c.secciones.find(x => x.id === p.seccionId) : null;
      if (p.seccionId && !s) return;
      const hecho = s ? !!(ultima[s.id] && u.diasEntre(ultima[s.id], hoy) === 0) : obrasHoy.has(c.obra.id);
      lista.push({ c, s, preparado: true, hecho, motivos: [{ t: hecho ? '✓ Hecho hoy' : 'Lo preparaste', c: hecho ? 'bien' : 'acento' }] });
    });
    const yaEn = new Set(lista.filter(x => x.s).map(x => x.s.id));
    const obrasEnteras = new Set(lista.filter(x => !x.s).map(x => x.c.obra.id));
    const n = lista.length ? Math.max(1, nAuto - 1) : nAuto;
    const auto = sugerencias(cart, sesiones, n + yaEn.size + 5)
      .filter(x => !obrasEnteras.has(x.c.obra.id) && (x.pasaje || !yaEn.has(x.s.id))).slice(0, n)
      .map(x => Object.assign({}, x, { preparado: false, hecho: false }));
    return { preparados: lista, auto };
  }

  function sugerencias(cart, sesiones, n = 3) {
    const ultima = ultimasVeces(cart, sesiones);
    const hoy = new Date();
    const lista = [];
    cart.filter(c => c.estado !== 'archivada' && c.estado !== 'lista').forEach(c => {
      const urg = c.ritmo ? { bien: 0, justa: 2, retrasada: 4, vencida: 3 }[c.ritmo.nivel] : 0;
      const algunaEmpezada = c.secciones.some(s => faseDe(s) !== 'pendiente');
      c.secciones.forEach(s => {
        const fase = faseDe(s);
        if (fase === 'lista') return;
        // si la obra ya está en marcha, lo que no se ha empezado espera su turno
        if (fase === 'pendiente' && algunaEmpezada) return;
        const motivos = [];
        let p = (5 - (s.dominio || 0)) * 1.6;
        if (fase === 'lectura') { const fl = fraccionLeida(s); p += 3 * (1 - fl); motivos.push({ t: 'Leído ' + Math.round(fl * 100) + ' %', c: 'info' }); }
        if (fase === 'pendiente') motivos.push({ t: 'Sin empezar', c: 'info' });
        if (s.dificil) { p += 3; motivos.push({ t: 'Difícil', c: 'aviso' }); }
        const pend = pendientes(s).length;
        if (pend) { p += Math.min(4, pend * 1.2); motivos.push({ t: pend + (pend === 1 ? ' tarea' : ' tareas'), c: 'acento' }); }
        if (s.tempoObjetivo > 0 && fase !== 'lectura' && fase !== 'pendiente') {
          const r = (s.tempoActual || 0) / s.tempoObjetivo;
          if (r < 1) { p += (1 - r) * 5; motivos.push({ t: Math.round(r * 100) + ' % del tempo', c: 'info' }); }
        }
        const dias = ultima[s.id] ? u.diasEntre(ultima[s.id], hoy) : null;
        if (dias === null) { p += 3; if (fase !== 'pendiente') motivos.push({ t: 'Sin sesiones aún', c: 'info' }); }
        else if (dias >= 3) { p += Math.min(5, dias * 0.5); motivos.push({ t: 'Hace ' + dias + ' días', c: 'info' }); }
        else if (dias === 1) motivos.push({ t: 'Ayer', c: 'info' });
        else if (dias === 0) motivos.push({ t: 'Ya trabajada hoy', c: 'info' });
        if (urg) { p += urg; motivos.push({ t: c.ritmo.nivel === 'justa' ? 'Obra justa de tiempo' : 'Obra retrasada', c: 'mal' }); }
        if (maestria(s) >= 1 && !pend) p -= 6;
        lista.push({ c, s, puntos: p, motivos, hoy: dias === 0 });
      });
      // pasajes difíciles sin resolver: se proponen por sí mismos, aunque no haya secciones
      pasajesDe(c.obra).forEach(pa => {
        const sec = seccionDePasaje(c.secciones, pa);
        const motivos = [];
        let p = 6.5;
        const dias = pa.trabajado ? u.diasEntre(pa.trabajado, hoy) : null;
        if (dias === null) { p += 3; motivos.push({ t: 'Sin trabajarlo aún', c: 'info' }); }
        else if (dias >= 2) { p += Math.min(5, dias * 0.6); motivos.push({ t: 'Hace ' + dias + ' días', c: 'info' }); }
        else if (dias === 1) motivos.push({ t: 'Ayer', c: 'info' });
        if (pa.nota) motivos.push({ t: pa.nota.length > 28 ? pa.nota.slice(0, 26) + '…' : pa.nota, c: 'info' });
        if (urg) p += urg;
        lista.push({ c, s: sec, pasaje: pa, puntos: p, motivos, hoy: dias === 0 });
      });
    });
    // como mucho un pasaje difícil por obra cada día (el más necesitado)
    const conPasaje = new Set();
    const orden = lista.sort((a, b) => b.puntos - a.puntos).filter(x => x.puntos > 0).filter(x => {
      if (!x.pasaje) return true;
      if (conPasaje.has(x.c.obra.id)) return false;
      conPasaje.add(x.c.obra.id); return true;
    });
    // lo trabajado hoy no se vuelve a proponer, salvo que no quede nada más
    const pendientesHoy = orden.filter(x => !x.hoy);
    return (pendientesHoy.length ? pendientesHoy : orden).slice(0, n);
  }

  function nombreTempo(bpm) {
    const t = [[40, 'Grave'], [50, 'Largo'], [60, 'Lento'], [66, 'Adagio'], [76, 'Andante'], [108, 'Moderato'],
      [120, 'Allegretto'], [156, 'Allegro'], [176, 'Vivace'], [200, 'Presto'], [999, 'Prestissimo']];
    for (const [lim, n] of t) if (bpm < lim) return n;
    return 'Prestissimo';
  }

  A.modelo = {
    ESTADOS, FASES, estado, indiceFase, faseDe, estadoObra, DOMINIO, COLORES, compasesSeccion, rangoTexto, tieneRango, pendientes, sugerencias,
    fraccionLeida, compasesLeidos, lecturaObra, compasesSinSeccion, maestria, progresoSeccion, progresoObra, ritmoObra, migrar,
    plan, previstoDia, minutosPorDia, racha, sesion, registrarTempo, cartera, nombreTempo, trabajadasHoy, paraDia, hoyTeToca,
    TIPOS, tipo, tipoDe, pasajesDe, textoPasaje, pasajesEnSeccion, seccionDePasaje, guardarPasaje, borrarPasaje, marcarPasajes, anotarLectura, lecturaEntre
  };
})(window.Atril);
