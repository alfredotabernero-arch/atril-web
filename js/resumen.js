/* Atril — resumen semanal en PDF para el profesor */
(function (A) {
  'use strict';
  const { u, DB, modelo } = A;
  const { h } = u;

  const MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DIAS_C = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const rangoSemana = ini => {
    const fin = u.sumarDias(ini, 6);
    return ini.getMonth() === fin.getMonth()
      ? `del ${ini.getDate()} al ${fin.getDate()} de ${MESES_L[fin.getMonth()]} de ${fin.getFullYear()}`
      : `del ${ini.getDate()} de ${MESES_L[ini.getMonth()]} al ${fin.getDate()} de ${MESES_L[fin.getMonth()]} de ${fin.getFullYear()}`;
  };
  const min = m => u.minutos(Math.round(m || 0));
  const secTxt = s => (s.letra ? s.letra + ' · ' : '') + s.nombre;

  /** Reúne todo lo de una semana (lunes ini) */
  async function datos(ini) {
    const fin = u.sumarDias(ini, 7);
    const t0 = ini.getTime(), t1 = fin.getTime();
    const [obras, secciones, sesiones, tempos, plan] = await Promise.all([DB.all('obras'), DB.all('secciones'), DB.all('sesiones'), DB.all('tempos'), modelo.plan()]);
    const semana = sesiones.filter(x => x.inicio >= t0 && x.inicio < t1).sort((a, b) => a.inicio - b.inicio);
    const porTipo = {};
    semana.forEach(x => { const t = modelo.tipoDe(x); porTipo[t] = (porTipo[t] || 0) + (x.minutos || 0); });
    const porDia = modelo.minutosPorDia(semana);
    const dias = [];
    let previsto = 0;
    for (let d = 0; d < 7; d++) {
      const f = u.sumarDias(ini, d);
      previsto += modelo.previstoDia(plan, f);
      dias.push({ f, min: porDia[u.claveDia(f)] || 0 });
    }
    const secById = Object.fromEntries(secciones.map(s => [s.id, s]));
    const lista = [];
    obras.forEach(o => {
      const secs = secciones.filter(s => s.obraId === o.id).sort((a, b) => (a.orden || 0) - (b.orden || 0));
      const ses = semana.filter(x => x.obraId === o.id);
      const minSec = {};
      ses.forEach(x => {
        if (x.reparto) x.reparto.forEach(r => { minSec[r.seccionId] = (minSec[r.seccionId] || 0) + r.minutos; });
        else if (x.seccionId) minSec[x.seccionId] = (minSec[x.seccionId] || 0) + (x.minutos || 0);
      });
      const tareas = [];
      secs.forEach(s => (s.tareas || []).forEach(t => { if (t.hecha && t.hechaEn >= t0 && t.hechaEn < t1) tareas.push({ s, t }); }));
      const tempSem = {};
      tempos.filter(t => secById[t.seccionId] && secById[t.seccionId].obraId === o.id && t.fecha >= t0 && t.fecha < t1)
        .forEach(t => { tempSem[t.seccionId] = Math.max(tempSem[t.seccionId] || 0, t.bpm); });
      const leidosSem = modelo.lecturaEntre(o, ini, fin);
      const pasTrab = (o.pasajes || []).filter(p => (p.trabajado >= t0 && p.trabajado < t1) || (p.resuelto >= t0 && p.resuelto < t1));
      const minutos = ses.reduce((a, x) => a + (x.minutos || 0), 0);
      if (!minutos && !tareas.length && !leidosSem && !pasTrab.length && !Object.keys(tempSem).length) return;
      const porTipoO = {};
      ses.forEach(x => { const t = modelo.tipoDe(x); porTipoO[t] = (porTipoO[t] || 0) + (x.minutos || 0); });
      const trabajadas = secs.filter(s => minSec[s.id] || tempSem[s.id] || tareas.some(x => x.s === s));
      lista.push({
        o, secs, minutos, porTipo: porTipoO, sesiones: ses, minSec, trabajadas, tareas, tempSem, leidosSem,
        lectura: modelo.lecturaObra(secs, o), progreso: modelo.progresoObra(o, secs), fase: modelo.estado(modelo.estadoObra(o, secs)),
        pasajes: pasTrab, pendientesPas: modelo.pasajesDe(o).length
      });
    });
    lista.sort((a, b) => b.minutos - a.minutos);
    const general = semana.filter(x => !x.obraId);
    const todasMin = modelo.minutosPorDia(sesiones);
    // racha al final de la semana (o hoy, si la semana es la actual)
    let racha = 0, d = new Date(Math.min(Date.now(), t1 - 1));
    if (!todasMin[u.claveDia(d)]) d = u.sumarDias(d, -1);
    while (todasMin[u.claveDia(d)] > 0) { racha++; d = u.sumarDias(d, -1); }
    return { ini, fin, semana, porTipo, dias, previsto, lista, general, racha };
  }

  /* ----------------------------- maquetación ----------------------------- */
  const C = { tinta: '#1E1B3A', tenue: '#6B6688', suave: '#F4F1FF', borde: '#E3DFF2', morado: '#5B3FD6', oro: '#F5B400', verde: '#1E9E63', naranja: '#E2701F', otros: '#16B4C8' };

  function crearPDF(d, opc) {
    const { Documento, partir } = A.pdf;
    const doc = Documento();
    const M = 42, W = doc.ancho - 2 * M, ABAJO = doc.alto - 50;
    let y = 0;
    const sitio = alto => { if (y + alto > ABAJO) { doc.pagina(); y = 50; return true; } return false; };

    // ---------- cabecera
    doc.rect(0, 0, doc.ancho, 118, { relleno: C.morado });
    doc.texto(M, 44, 'Resumen semanal de estudio', { tam: 22, negrita: true, color: '#FFFFFF' });
    doc.texto(M, 68, 'Semana ' + rangoSemana(d.ini), { tam: 12, color: '#E4DDFF' });
    if (opc.nombre) doc.texto(M, 96, opc.nombre, { tam: 15, negrita: true, color: '#FFFFFF' });
    if (opc.profesor) doc.texto(doc.ancho - M, 96, 'Para: ' + opc.profesor, { tam: 11, color: '#E4DDFF', alinear: 'derecha' });
    y = 140;

    // ---------- cifras de la semana
    const est = d.porTipo.estudio || 0;
    const otros = Object.entries(d.porTipo).filter(([t]) => t !== 'estudio');
    const diasMusica = d.dias.filter(x => x.min > 0).length;
    const cajas = [
      [min(est), 'de estudio personal' + (d.previsto ? ' (previsto ' + min(d.previsto) + ')' : '')],
      [otros.length ? min(otros.reduce((a, x) => a + x[1], 0)) : '—', otros.length ? otros.map(([t, m]) => modelo.tipo(t).nombre.toLowerCase() + ' ' + min(m)).join(', ') : 'clases, ensayos y conciertos'],
      [diasMusica + ' de 7', 'días con música'],
      [d.racha + (d.racha === 1 ? ' día' : ' días'), 'de racha']
    ];
    const cw = (W - 3 * 10) / 4;
    cajas.forEach(([v, et], i) => {
      const x = M + i * (cw + 10);
      doc.rect(x, y, cw, 58, { relleno: C.suave, radio: 8 });
      doc.texto(x + 10, y + 24, v, { tam: 16, negrita: true, color: C.morado });
      partir(et, cw - 20, 8).slice(0, 2).forEach((l, k) => doc.texto(x + 10, y + 38 + k * 10, l, { tam: 8, color: C.tenue }));
    });
    y += 74;

    // ---------- los siete días, con estrella si hubo música
    const dw = W / 7;
    d.dias.forEach((x, i) => {
      const cx = M + i * dw + dw / 2;
      doc.texto(cx, y + 10, DIAS_C[i] + ' ' + x.f.getDate(), { tam: 8.5, negrita: true, color: C.tenue, alinear: 'centro' });
      if (x.min > 0) doc.estrella(cx, y + 28, 10, { relleno: C.oro });
      else doc.estrella(cx, y + 28, 10, { borde: '#CFCAE3', grosor: 1 });
      doc.texto(cx, y + 52, x.min > 0 ? min(x.min) : '—', { tam: 8.5, color: x.min ? C.tinta : '#B5B0CC', alinear: 'centro' });
    });
    y += 66;
    doc.linea(M, y, M + W, y, { color: C.borde });
    y += 22;

    if (!d.lista.length && !d.general.length) {
      doc.texto(M, y, 'Esta semana no hay sesiones registradas.', { tam: 12, color: C.tenue });
      y += 20;
    }

    // ---------- obra a obra
    const estrellas = (x, yy, n, r = 4.2) => { for (let i = 0; i < 5; i++) doc.estrella(x + r + i * (r * 2.3), yy, r, i < n ? { relleno: C.oro } : { borde: '#CFCAE3', grosor: 0.7 }); return 5 * r * 2.3; };
    d.lista.forEach(ob => {
      sitio(80);
      const col = ob.o.color || C.morado;
      doc.rect(M, y - 2, 5, 34, { relleno: col, radio: 2 });
      doc.texto(M + 14, y + 12, ob.o.titulo, { tam: 14, negrita: true });
      doc.texto(M + W, y + 12, min(ob.minutos), { tam: 14, negrita: true, color: C.morado, alinear: 'derecha' });
      const sub = [ob.o.compositor, ob.fase.nombre + ' · ' + Math.round(ob.progreso * 100) + ' % de la obra',
        Object.keys(ob.porTipo).length > 1 || (Object.keys(ob.porTipo)[0] && Object.keys(ob.porTipo)[0] !== 'estudio')
          ? Object.entries(ob.porTipo).map(([t, m]) => modelo.tipo(t).nombre.toLowerCase() + ' ' + min(m)).join(', ') : null].filter(Boolean).join('  ·  ');
      doc.texto(M + 14, y + 27, sub, { tam: 9, color: C.tenue });
      y += 46;
      const fila = (etq, txt, colorTxt) => {
        const lineas = partir(txt, W - 120, 9.5);
        sitio(lineas.length * 13 + 4);
        doc.texto(M + 14, y, etq, { tam: 8.5, negrita: true, color: C.tenue });
        lineas.forEach((l, k) => doc.texto(M + 120, y + k * 13, l, { tam: 9.5, color: colorTxt || C.tinta }));
        y += lineas.length * 13 + 5;
      };
      // lectura
      if (ob.leidosSem > 0 || ob.fase.id === 'lectura') {
        fila('Lectura', (ob.leidosSem > 0 ? ob.leidosSem + (ob.leidosSem === 1 ? ' compás leído' : ' compases leídos') + ' esta semana' : 'Sin avance de lectura esta semana') +
          (ob.lectura.total ? ` · llevo ${ob.lectura.leidos} de ${ob.lectura.total} (${Math.round(ob.lectura.leidos / ob.lectura.total * 100)} %)` : ''));
      }
      // secciones trabajadas: minutos, estrellas y tempo
      if (ob.trabajadas.length) {
        sitio(18);
        doc.texto(M + 14, y, 'Secciones', { tam: 8.5, negrita: true, color: C.tenue });
        ob.trabajadas.forEach((s, k) => {
          if (k) sitio(15);
          const xx = M + 120;
          doc.texto(xx, y, secTxt(s), { tam: 9.5, negrita: true });
          doc.texto(xx + 150, y, modelo.rangoTexto(s), { tam: 9, color: C.tenue });
          doc.texto(xx + 205, y, ob.minSec[s.id] ? min(ob.minSec[s.id]) : '', { tam: 9 });
          const fase = modelo.faseDe(s);
          if (fase !== 'pendiente' && fase !== 'lectura') estrellas(xx + 255, y - 3.2, s.dominio || 0);
          else doc.texto(xx + 255, y, modelo.estado(fase).nombre, { tam: 8.5, color: C.tenue });
          const tp = ob.tempSem[s.id];
          if (tp || s.tempoObjetivo) doc.texto(M + W, y, 'tempo ' + (tp || s.tempoActual || '—') + (s.tempoObjetivo ? ' / ' + s.tempoObjetivo : '') + ' BPM', { tam: 9, color: tp ? C.verde : C.tenue, alinear: 'derecha' });
          y += 15;
        });
        y += 2;
      }
      if (ob.tareas.length) fila('Tareas hechas', ob.tareas.map(x => '• ' + x.t.texto + (ob.trabajadas.length > 1 || ob.secs.length > 1 ? ' (' + secTxt(x.s) + ')' : '')).join('   '), C.verde);
      if (ob.pasajes.length || ob.pendientesPas) {
        const txt = ob.pasajes.map(p => modelo.textoPasaje(p) + (p.resuelto && p.resuelto >= d.ini.getTime() && p.resuelto < d.fin.getTime() ? ' (¡resuelto!)' : ' (trabajado)') + (p.nota ? ': ' + p.nota : '')).join('; ');
        fila('Pasajes difíciles', (txt || 'Ninguno trabajado esta semana') + (ob.pendientesPas ? ` · quedan ${ob.pendientesPas} por resolver` : ''), C.naranja);
      }
      const val = ob.sesiones.filter(x => x.valoracion);
      if (val.length) { sitio(16); doc.texto(M + 14, y, 'Cómo fue', { tam: 8.5, negrita: true, color: C.tenue }); estrellas(M + 120, y - 3.2, Math.round(val.reduce((a, x) => a + x.valoracion, 0) / val.length)); y += 16; }
      const notas = ob.sesiones.filter(x => x.notas);
      if (notas.length) fila('Mis notas', notas.map(x => DIAS_C[(new Date(x.inicio).getDay() + 6) % 7] + ': ' + x.notas.replace(/\s+/g, ' ')).join('  ·  '));
      y += 6;
      doc.linea(M, y, M + W, y, { color: C.borde });
      y += 20;
    });
    if (d.general.length) {
      sitio(40);
      doc.texto(M + 14, y + 4, 'Técnica y estudio general', { tam: 12, negrita: true });
      doc.texto(M + W, y + 4, min(d.general.reduce((a, x) => a + (x.minutos || 0), 0)), { tam: 12, negrita: true, color: C.morado, alinear: 'derecha' });
      y += 20;
      const notas = d.general.filter(x => x.notas).map(x => x.notas.replace(/\s+/g, ' ')).join('  ·  ');
      if (notas) partir(notas, W - 14, 9.5).forEach(l => { sitio(13); doc.texto(M + 14, y, l, { tam: 9.5 }); y += 13; });
      y += 10;
    }
    if (opc.mensaje) {
      const lineas = partir(opc.mensaje, W - 28, 10.5);
      sitio(lineas.length * 14 + 40);
      doc.rect(M, y, W, lineas.length * 14 + 34, { relleno: '#FFF6E0', radio: 8 });
      doc.texto(M + 14, y + 18, 'Mensaje para el profesor', { tam: 9, negrita: true, color: C.naranja });
      lineas.forEach((l, k) => doc.texto(M + 14, y + 34 + k * 14, l, { tam: 10.5 }));
      y += lineas.length * 14 + 44;
    }
    // pie en todas las páginas
    const total = doc.numPaginas, hoy = new Date();
    for (let i = 0; i < total; i++) doc.enPagina(i, () => {
      doc.texto(M, doc.alto - 24, `Atril ${A.VERSION} · hecho el ${hoy.getDate()} de ${MESES_L[hoy.getMonth()]} de ${hoy.getFullYear()}`, { tam: 8, color: '#9A95B5' });
      if (total > 1) doc.texto(doc.ancho - M, doc.alto - 24, `Página ${i + 1} de ${total}`, { tam: 8, color: '#9A95B5', alinear: 'derecha' });
    });
    return doc.blob();
  }

  /** Diálogo: elegir la semana, el nombre y un mensaje; luego se comparte el PDF */
  async function dialogo() {
    const cfg = await DB.kvGet('resumenProfesor', {}) || {};
    const lunes = u.inicioSemana(new Date());
    const sel = h('select', { name: 'semana' }, Array.from({ length: 8 }, (_, i) => {
      const ini = u.sumarDias(lunes, -7 * i);
      return h('option', { value: i }, (i === 0 ? 'Esta semana · ' : i === 1 ? 'La semana pasada · ' : '') + u.fechaCorta(ini) + ' – ' + u.fechaCorta(u.sumarDias(ini, 6)));
    }));
    // los primeros días de la semana se propone la anterior
    sel.value = new Date().getDay() >= 1 && new Date().getDay() <= 2 ? '1' : '0';
    const cuerpo = h('div',
      u.campo('Semana', sel),
      h('div.rejilla-2',
        u.campo('Tu nombre', h('input', { type: 'text', name: 'nombre', value: cfg.nombre || '', placeholder: 'Opcional' })),
        u.campo('Profesor o profesora', h('input', { type: 'text', name: 'profesor', value: cfg.profesor || '', placeholder: 'Opcional' }))),
      u.campo('Mensaje (dudas, avisos…)', h('textarea', { name: 'mensaje', placeholder: 'Opcional' })),
      h('p.mini.tenue', { style: { margin: 0 } }, 'Se abre el menú Compartir para enviarlo por correo, WhatsApp, Drive…; en el PC se descarga.'));
    const r = await u.modal('Resumen para el profesor', cuerpo, [
      { texto: 'Cancelar', accion: () => null },
      { texto: 'Crear PDF', clase: 'primario', accion: () => u.leerForm(cuerpo) }
    ]);
    if (!r) return false;
    await DB.kvSet('resumenProfesor', { nombre: r.nombre, profesor: r.profesor });
    const ini = u.sumarDias(lunes, -7 * Number(r.semana || 0));
    const d = await datos(ini);
    const blob = crearPDF(d, r);
    const nombre = 'Atril - resumen ' + u.claveDia(ini) + (r.nombre ? ' - ' + r.nombre.replace(/[\\/:*?"<>|]/g, '') : '') + '.pdf';
    return u.descargar(nombre, blob, 'application/pdf');
  }

  A.resumen = { datos, crearPDF, dialogo };
})(window.Atril);
