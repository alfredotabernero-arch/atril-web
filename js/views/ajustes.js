/* Atril — ajustes: plan semanal, tema, copias de seguridad */
(function (A) {
  'use strict';
  const { u, DB, modelo } = A;
  const { h } = u;
  const DIAS_L = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

  A.vistas.ajustes = {
    titulo: 'Ajustes',
    async render({ main }) {
      const plan = await modelo.plan();

      // ---------- plan semanal
      const total = h('b');
      const pintarTotal = () => (total.textContent = u.minutos(plan.dias.reduce((a, b) => a + (b || 0), 0)) + ' a la semana');
      const filas = DIAS_L.map((d, i) => {
        const inp = h('input', { type: 'number', min: 0, max: 600, step: 5, value: plan.dias[i], style: { width: '96px' } });
        inp.addEventListener('change', async () => {
          plan.dias[i] = u.clamp(Number(inp.value) || 0, 0, 600); inp.value = plan.dias[i];
          await DB.kvSet('plan', plan); pintarTotal();
        });
        return h('div.fila', { style: { padding: '4px 0' } }, h('span.crece', d), inp, h('span.mini.tenue', { style: { width: '28px' } }, 'min'));
      });
      pintarTotal();
      const rapido = h('div.segmentado', { style: { marginTop: '10px' } }, [20, 30, 45, 60, 90].map(m => h('button', {
        type: 'button', onclick: async () => {
          plan.dias = plan.dias.map((v, i) => (i < 5 ? m : v));
          await DB.kvSet('plan', plan); A.app.refrescar();
        }
      }, m + ' min L–V')));
      main.appendChild(h('section.tarjeta',
        h('div.tarjeta-cab', h('span.tarjeta-icono', { style: { background: '#7C5CFF' } }, A.icono('hoy')), h('h2', 'Plan de estudio')),
        h('p.mini.tenue', { style: { marginTop: 0 } }, 'Minutos que quieres estudiar cada día. Se comparan con tu tiempo real en «Hoy» y en «Progreso». Cada obra puede tener además sus minutos semanales.'),
        filas, h('div', { style: { marginTop: '8px' } }, total), rapido));

      // ---------- apariencia
      const tema = await DB.kvGet('tema', 'auto');
      const segTema = h('div.segmentado', [['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']].map(([v, t]) =>
        h('button' + (tema === v ? '.on' : ''), { type: 'button', onclick: async () => { await DB.kvSet('tema', v); await A.app.aplicarTema(); A.app.refrescar(); } }, t)));
      main.appendChild(h('section.tarjeta', h('div.tarjeta-cab', h('span.tarjeta-icono', { style: { background: '#FF8A3D' } }, A.icono('imagen')), h('h2', 'Apariencia')), segTema,
        A.herr.interruptor('Pantalla de bienvenida al abrir', A.bienvenida.activa(), v => A.bienvenida.poner(v)),
        h('button.enlace', { onclick: () => A.bienvenida.ver() }, 'Ver la pantalla de bienvenida'),
        h('p.mini.tenue', { style: { margin: '10px 0 0' } }, 'El La de referencia (430–445 Hz) se cambia en Herramientas › Afinador.')));

      // ---------- copia de seguridad
      const fichero = h('input', { type: 'file', accept: '.zip,.json,application/zip,application/json', style: { display: 'none' } });
      fichero.addEventListener('change', async () => {
        const f = fichero.files[0]; fichero.value = '';
        if (!f) return;
        try {
          const buf = await f.arrayBuffer();
          const esZip = new Uint8Array(buf.slice(0, 2)).join() === '80,75'; // "PK"
          const entrada = esZip ? buf : JSON.parse(new TextDecoder().decode(buf));
          const modo = await u.modal('Importar copia', h('p', '¿Quieres sustituir tus datos actuales por los de la copia, o añadirlos a los que ya tienes?'), [
            { texto: 'Cancelar', accion: () => null },
            { texto: 'Añadir', accion: () => 'añadir' },
            { texto: 'Sustituir', clase: 'primario', accion: () => 'sustituir' }]);
          if (!modo) return;
          await DB.importar(entrada, modo === 'sustituir');
          await modelo.sesion.cargar();
          u.toast('Datos importados ✓');
          A.app.refrescar();
        } catch (e) { u.toast('No se pudo importar: ' + e.message, 4000); }
      });
      main.appendChild(h('section.tarjeta',
        h('div.tarjeta-cab', h('span.tarjeta-icono', { style: { background: '#16B4C8' } }, A.icono('descargar')), h('h2', 'Copia de seguridad')),
        h('p.mini.tenue', { style: { marginTop: 0 } }, 'Tus datos se guardan solo en este dispositivo. La copia es un .zip con todo: obras, secciones, tareas, fotos de la partitura y grabaciones. Sirve también para pasar tus datos del PC al móvil.'),
        h('div.fila.envuelve',
          h('button.btn.primario', { onclick: exportar }, A.icono('descargar'), 'Exportar copia'),
          h('button.btn', { onclick: () => fichero.click() }, A.icono('subir'), 'Importar copia')),
        fichero));

      // ---------- datos
      main.appendChild(h('section.tarjeta',
        h('div.tarjeta-cab', h('span.tarjeta-icono', { style: { background: '#FF4F8B' } }, A.icono('obras')), h('h2', 'Datos')),
        h('div.fila.envuelve',
          h('button.btn', {
            onclick: async () => {
              if (!await u.confirmar('Se añadirán tres obras de ejemplo con sesiones de las últimas semanas, para que puedas ver cómo funciona todo. Podrás borrarlas después.', 'Cargar ejemplo')) return;
              await cargarEjemplo(); u.toast('Ejemplo cargado'); location.hash = '#/hoy';
            }
          }, 'Cargar datos de ejemplo'),
          h('button.btn.peligro', {
            onclick: async () => {
              if (!await u.confirmar('¿Borrar TODOS los datos de Atril de este dispositivo? No se puede deshacer. Exporta antes una copia si la quieres conservar.', 'Borrar todo', 'peligro')) return;
              await DB.borrarTodo();
              await modelo.sesion.cargar();
              u.toast('Datos borrados'); location.hash = '#/hoy';
            }
          }, 'Borrar todo'))));

      // ---------- acerca de
      const nativo = !!A.audio.pluginNativo();
      main.appendChild(h('section.tarjeta',
        h('div.tarjeta-cab', h('span.tarjeta-icono', { style: { background: '#22C27A' } }, A.icono('atril')), h('h2', 'Acerca de Atril')),
        h('p', { style: { margin: '0 0 8px' } }, 'Tu cuaderno de estudio musical. Creado por ', h('b', 'Alfredo Tabernero Martínez'), '.'),
        h('p.mini.tenue', { style: { margin: 0 } },
          'Versión ' + A.VERSION + ' · ' + (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() ? 'app Android' : 'navegador') +
          ' · metrónomo ' + (nativo ? 'nativo (suena con la pantalla apagada)' : 'web')),
        h('p.mini.tenue', { style: { margin: '6px 0 0' } }, 'Atajos en el metrónomo: espacio arranca y para, flechas arriba y abajo cambian el tempo (con Mayúsculas, de 5 en 5), T marca el tempo.')));

      if (A.nativo && A.nativo.puedeSalir) {
        main.appendChild(h('button.btn.bloque.btn-salir-grande', { onclick: () => A.app.pedirSalida() }, A.icono('salir'), 'Salir de Atril'));
      }
    }
  };

  async function exportar() {
    u.toast('Preparando la copia…');
    const zip = await DB.exportarZip();
    if (!await u.descargar('atril-copia-' + u.claveDia(new Date()) + '.zip', zip)) return;
    u.toast('Copia exportada (' + (zip.size / 1048576).toFixed(1) + ' MB)');
  }

  /** Dibuja una partitura de mentira para las fotos de ejemplo */
  async function partituraFalsa(desde, hasta, semilla) {
    const W = 1400, H = 900, c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    let s = semilla;
    const azar = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    g.fillStyle = '#fbf8f1'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#222'; g.fillStyle = '#222'; g.lineWidth = 2;
    const sistemas = 4, porSistema = Math.max(1, Math.ceil((hasta - desde + 1) / sistemas));
    let compas = desde;
    for (let k = 0; k < sistemas && compas <= hasta; k++) {
      const y0 = 120 + k * 200;
      for (let l = 0; l < 5; l++) { g.beginPath(); g.moveTo(80, y0 + l * 16); g.lineTo(W - 60, y0 + l * 16); g.stroke(); }
      g.font = 'bold 22px serif'; g.fillText('𝄞', 84, y0 + 52);
      g.font = 'italic 18px serif'; g.fillText(String(compas), 80, y0 - 14);
      const n = Math.min(porSistema, hasta - compas + 1), ancho = (W - 220) / n;
      for (let m = 0; m < n; m++) {
        const x0 = 140 + m * ancho;
        g.beginPath(); g.moveTo(x0 + ancho, y0); g.lineTo(x0 + ancho, y0 + 64); g.stroke();
        for (let q = 0; q < 4; q++) {
          const x = x0 + 22 + q * (ancho - 30) / 4, y = y0 + Math.round(azar() * 10) * 8 - 8;
          g.beginPath(); g.ellipse(x, y, 9, 7, -0.4, 0, Math.PI * 2); g.fill();
          g.beginPath(); g.moveTo(x + 8, y); g.lineTo(x + 8, y - 48); g.stroke();
        }
      }
      compas += n;
    }
    return A.fotos.reducir(c);
  }

  async function cargarEjemplo() {
    const hoy = new Date();
    const dia = n => u.claveDia(u.sumarDias(hoy, n));
    const obras = [
      { titulo: 'La boda de Luis Alonso', compositor: 'G. Giménez (arr.)', instrumento: 'Bandurria 1ª', estado: 'montaje', color: '#FF4F8B', fechaInicio: dia(-40), fechaObjetivo: dia(24), tempoObjetivo: 132, minSemana: 120 },
      { titulo: 'Danza española nº 5', compositor: 'E. Granados (arr.)', instrumento: 'Bandurria 1ª', estado: 'pulido', color: '#7C5CFF', fechaInicio: dia(-60), fechaObjetivo: dia(24), tempoObjetivo: 96, minSemana: 60 },
      { titulo: 'Estudio en Re', compositor: 'F. Tárrega', instrumento: 'Bandurria', estado: 'lectura', color: '#22C27A', fechaInicio: dia(-6), tempoObjetivo: 110 }
    ];
    // [nombre, letra, desde, hasta, tObj, tAct, dominio, difícil, tareas, notas]
    // [nombre, letra, desde, hasta, tObj, tAct, dominio, difícil, tareas, notas, fase, leídoHasta]
    const secs = [
      [['Introducción', 'A', 1, 16, 132, 118, 4, false, ['Igualar el trémolo c. 9–12'], 'Entrada muy marcada, todos a una.', 'pulido'],
       ['Intermedio', 'B', 17, 48, 132, 100, 3, true, ['Digitación c. 24', 'Cambio de posición c. 31', 'Dinámica: crescendo hasta el 40'], 'El director pide que no corramos en el 33.', 'montaje'],
       ['Zapateado final', 'C', 49, 72, 140, 0, 0, true, ['Estudiar a 100 con metrónomo', 'Púa alternada en las semicorcheas'], '', 'lectura', 62]],
      [['Tema A', 'A', 1, 24, 96, 92, 5, false, [], 'Cantabile, sacar la melodía.', 'pulido'],
       ['Sección central', 'B', 25, 44, 96, 86, 4, false, ['Afinación de los armónicos c. 30'], '', 'pulido'],
       ['Reexposición y coda', 'C', 45, 72, 96, 90, 4, false, ['Ritardando final juntos'], '', 'pulido']],
      [['Primera parte', '', 1, 16, 110, 0, 0, false, ['Leer despacio con digitación'], '', 'lectura', 10],
       ['Segunda parte', '', 17, 32, 110, 0, 0, false, [], '', 'pendiente']]
    ];
    let semillaFoto = 3;
    for (let i = 0; i < obras.length; i++) {
      const o = await DB.put('obras', Object.assign({ creada: Date.now() }, obras[i]));
      obras[i].id = o.id; obras[i].secs = [];
      for (let j = 0; j < secs[i].length; j++) {
        const [nombre, letra, desde, hasta, tObj, tAct, dominio, dificil, tareas, notas, fase, leidoHasta] = secs[i][j];
        const s = await DB.put('secciones', {
          obraId: o.id, nombre, letra, desde, hasta, compases: hasta - desde + 1, tempoObjetivo: tObj, tempoActual: tAct || null, fase, leidoHasta: leidoHasta || null,
          dominio, dificil, orden: j, notas, tareas: tareas.map((t, k) => ({ id: u.uid(), texto: t, hecha: false, creada: Date.now() - k * 1000 }))
        });
        if (tAct) {
          for (let k = 5; k >= 0; k--) await DB.put('tempos', { seccionId: s.id, bpm: Math.round(tAct - k * (tAct * 0.05)), fecha: u.sumarDias(hoy, -k * 6).getTime() });
        }
        if (i < 2) {
          const f = await partituraFalsa(desde, hasta, semillaFoto++);
          await DB.put('fotos', { seccionId: s.id, obraId: o.id, blob: f.blob, ancho: f.ancho, alto: f.alto, fecha: Date.now(), orden: 0 });
        }
        obras[i].secs.push(s.id);
      }
    }
    // sesiones de las últimas 5 semanas
    let semilla = 7;
    const azar = () => { semilla = (semilla * 9301 + 49297) % 233280; return semilla / 233280; };
    for (let d = 35; d >= 1; d--) {
      if (azar() < 0.22) continue;
      const n = 1 + Math.floor(azar() * 2);
      for (let k = 0; k < n; k++) {
        const o = obras[Math.floor(azar() * (d < 6 ? 3 : 2))];
        const ini = u.sumarDias(hoy, -d); ini.setHours(17 + k, Math.floor(azar() * 50), 0, 0);
        const min = 15 + Math.round(azar() * 35);
        await DB.put('sesiones', {
          obraId: o.id, seccionId: o.secs[Math.floor(azar() * o.secs.length)], inicio: ini.getTime(), fin: ini.getTime() + min * 60000,
          minutos: min, notas: '', valoracion: Math.round(2 + azar() * 3)
        });
      }
    }
  }
})(window.Atril);
