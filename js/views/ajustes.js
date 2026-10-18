/* Atril — ajustes: plan semanal, tema, copias de seguridad */
(function (A) {
  'use strict';
  const { u, DB, modelo } = A;
  const { h } = u;
  const DIAS_L = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

  A.vistas.ajustes = {
    titulo: 'Ajustes',
    async render({ main }) {
      // en el modo sencillo, Ajustes solo deja salir de él
      if (A.sencillo && A.sencillo.activo) {
        main.appendChild(A.sencillo.tarjetaAjustes());
        main.appendChild(h('p.mini.tenue', { style: { textAlign: 'center' } }, 'Atril ' + A.VERSION));
        return;
      }
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
        A.herr.interruptor('Mostrar ayudas', A.ayuda.activas(), v => A.ayuda.poner(v)),
        h('p.mini.tenue', { style: { margin: '2px 0 8px' } }, A.nativo.es ? 'Mantén pulsado un botón y te explica qué hace (sin ejecutarlo).' : 'Deja el ratón quieto sobre un botón y te explica qué hace. En el móvil, mantenlo pulsado.'),
        h('p.mini.tenue', { style: { margin: '10px 0 0' } }, 'El ' + A.pitch.nombreLa() + ' de referencia (430–445 Hz) se cambia en Herramientas › Afinador.')));

      // ---------- modo sencillo
      main.appendChild(A.sencillo.tarjetaAjustes());

      // ---------- nombres de las notas
      const notacion = A.pitch.notacion();
      const segNotas = h('div.segmentado', [['latina', 'Do, Re, Mi…'], ['anglosajona', 'C, D, E…']].map(([v, t]) =>
        h('button' + (notacion === v ? '.on' : ''), { type: 'button', onclick: async () => { await DB.kvSet('notacion', v); A.pitch.ponerNotacion(v); A.app.refrescar(); } }, t)));
      main.appendChild(h('section.tarjeta', h('div.tarjeta-cab', h('span.tarjeta-icono', { style: { background: '#3D7BFF' } }, A.icono('nota')), h('h2', 'Nombres de las notas')),
        segNotas,
        h('p.mini.tenue', { style: { margin: '8px 0 0' } }, 'Tradicional (Do, Re, Mi, Fa, Sol, La, Si) o anglosajona (C, D, E, F, G, A, B). Se usa en el afinador, en el de «En el atril» y en la nota pedal.')));

      // ---------- pantalla encendida
      const pant = A.pantalla;
      main.appendChild(h('section.tarjeta', h('div.tarjeta-cab', h('span.tarjeta-icono', { style: { background: '#FFB020' } }, A.icono('sol')), h('h2', 'Pantalla')),
        A.herr.interruptor('Mantener la pantalla encendida', pant.siempre, v => pant.poner('siempre', v)),
        h('p.mini.tenue', { style: { margin: '2px 0 10px' } }, 'Mientras Atril esté abierto, el móvil no se apaga solo (afinador, partitura, metrónomo…). Al salir de Atril, todo vuelve a ser como siempre.'),
        A.herr.interruptor('En Relajación, dejar que se apague', pant.relaxApagar, v => pant.poner('relax', v)),
        h('p.mini.tenue', { style: { margin: '2px 0 0' } }, A.nativo && A.nativo.Fondo
          ? 'Mientras suena la relajación, la pantalla se apaga a su tiempo normal y el sonido sigue. Una notificación permite pararlo.'
          : 'Mientras suena la relajación, la pantalla se apaga a su tiempo normal. En iPhone y iPad, al bloquearse puede cortarse el sonido: si pasa, desactiva esta opción.')));

      // ---------- voz de la respiración guiada
      await A.voz.cargar();
      const vcfg = A.voz.config();
      const listaVoz = h('div.voz-lista');
      let grabando = null;   // { id, rec, stream, t }
      async function pintarVoz() {
        const hay = new Set((await A.voz.grabaciones()).map(g => g.id));
        listaVoz.innerHTML = '';
        A.voz.PALABRAS.forEach(p => {
          const enCurso = grabando && grabando.id === p.id;
          const btnRec = h('button.btn-icono' + (enCurso ? '.grabando' : ''), {
            'aria-label': enCurso ? 'Parar' : 'Grabar «' + p.texto + '»', title: enCurso ? 'Parar' : 'Grabar',
            onclick: () => (enCurso ? pararGrab() : grabar(p.id))
          }, A.icono(enCurso ? 'stop' : 'grabar'));
          const btnOir = h('button.btn-icono', { 'aria-label': 'Escuchar «' + p.texto + '»', title: 'Escuchar', onclick: async () => { A.voz.desbloquear(); await A.voz.decir(p.id); } }, A.icono('play'));
          const btnBorrar = hay.has(p.id) ? h('button.btn-icono', {
            'aria-label': 'Borrar la grabación de «' + p.texto + '»', title: 'Volver a la voz del aparato',
            onclick: async () => { await A.voz.borrarGrabacion(p.id); pintarVoz(); }
          }, A.icono('borrar')) : null;
          listaVoz.appendChild(h('div.voz-fila',
            h('div.crece', h('b', p.texto), h('div.mini.tenue', enCurso ? 'Grabando… di la palabra y pulsa parar' : hay.has(p.id) ? 'Tu voz' : 'Voz del aparato')),
            btnOir, btnRec, btnBorrar));
        });
      }
      async function grabar(id) {
        if (grabando) await pararGrab();
        if (!window.MediaRecorder) { u.toast('Este aparato no permite grabar'); return; }
        let stream;
        try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
        catch (e) { u.toast('No se pudo usar el micrófono'); return; }
        const tipos = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
        const tipo = tipos.find(t => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
        const rec = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined);
        const trozos = [];
        rec.ondataavailable = ev => ev.data.size && trozos.push(ev.data);
        const fin = new Promise(res => (rec.onstop = res));
        grabando = { id, rec, stream, fin, trozos, t: setTimeout(() => pararGrab(), 4000) };
        rec.start();
        pintarVoz();
      }
      async function pararGrab() {
        const g = grabando; if (!g) return;
        grabando = null; clearTimeout(g.t);
        if (g.rec.state !== 'inactive') g.rec.stop();
        await g.fin;
        g.stream.getTracks().forEach(t => t.stop());
        try {
          const wav = await A.voz.recortar(new Blob(g.trozos, { type: g.rec.mimeType || 'audio/webm' }));
          await A.voz.guardarGrabacion(g.id, wav);
          await A.voz.decir(g.id);
        } catch (e) { u.toast('No se ha oído nada: prueba otra vez, más cerca del micrófono'); }
        pintarVoz();
      }
      const segVel = h('div.segmentado', [[0.7, 'Muy despacio'], [0.8, 'Despacio'], [0.95, 'Normal']].map(([v, t]) =>
        h('button' + (vcfg.velocidad === v ? '.on' : ''), { type: 'button', onclick: async e => {
          await A.voz.guardar({ velocidad: v });
          u.$$('button', segVel).forEach(b => b.classList.remove('on')); e.currentTarget.classList.add('on');
          A.voz.desbloquear(); A.voz.decir('inspira');
        } }, t)));
      main.appendChild(h('section.tarjeta', h('div.tarjeta-cab', h('span.tarjeta-icono', { style: { background: '#FF4F8B' } }, A.icono('respirar')), h('h2', 'Voz de la respiración')),
        h('p.mini.tenue', { style: { marginTop: 0 } }, 'En Relajación › Respiración guiada, una voz dice «Inspira», «Mantén» y «Espira» y, si quieres, cuenta. De entrada es la voz del aparato; puedes grabar la tuya, o la de quien quieras, palabra por palabra. Lo que no grabes lo dice la voz del aparato.'),
        h('div.mini', { style: { fontWeight: 800, margin: '6px 0' } }, 'Velocidad de la voz del aparato'), segVel,
        A.herr.interruptor('Usar las grabaciones', vcfg.propias, v => A.voz.guardar({ propias: v })),
        listaVoz,
        h('p.mini.tenue', { style: { margin: '8px 0 0' } }, 'Pulsa ● y di la palabra con calma; pulsa ■ al terminar (se para sola a los 4 segundos). Atril quita el silencio del principio y del final para que suene justo a tiempo. Las grabaciones van en la copia de seguridad.')));
      pintarVoz();

      // ---------- «En el atril»
      const micPref = await DB.kvGet('atrilMicAlCambiar', 'preguntar');
      const cronoAuto = await DB.kvGet('atrilCronoAuto', false);
      const segMic = h('div.segmentado', [['preguntar', 'Preguntar'], ['mantener', 'Mantener'], ['apagar', 'Apagar']].map(([v, t]) =>
        h('button' + (micPref === v ? '.on' : ''), { type: 'button', onclick: async () => { await DB.kvSet('atrilMicAlCambiar', v); A.app.refrescar(); } }, t)));
      main.appendChild(h('section.tarjeta', h('div.tarjeta-cab', h('span.tarjeta-icono', { style: { background: '#6C4CF5' } }, A.icono('afinador')), h('h2', 'En el atril')),
        h('p.mini', { style: { marginTop: 0 } }, 'Si tienes el afinador escuchando y pasas a otra sección, el micrófono:'),
        segMic,
        h('p.mini.tenue', { style: { margin: '8px 0 12px' } }, '«Preguntar» te lo consulta la primera vez. Al salir de «En el atril» el micrófono se apaga siempre.'),
        A.herr.interruptor('Poner en marcha el cronómetro al entrar', cronoAuto, v => DB.kvSet('atrilCronoAuto', !!v)),
        h('p.mini.tenue', { style: { margin: '2px 0 0' } }, 'Desactivado (lo normal), el cronómetro de estudio empieza cuando pulsas ▶ arriba a la derecha. Si ya lo tenías en marcha, sigue contando al cambiar de sección.')));

      // ---------- fotos de la partitura (3.1.1): quien no las use, las quita
      main.appendChild(h('section.tarjeta', h('div.tarjeta-cab', h('span.tarjeta-icono', { style: { background: '#3D7BFF' } }, A.icono('camara')), h('h2', 'Fotos de la partitura')),
        A.herr.interruptor('Usar fotos de la partitura', A.fotos.activas(), async v => { await A.fotos.poner(v); A.app.refrescar(); }),
        h('p.mini.tenue', { style: { margin: '2px 0 0' } }, 'Sirven para marcar digitaciones, arcos y puntos clave. Si no las usas, desactívalo: desaparecen de «En el atril» (el panel ocupa toda la pantalla), de la ficha de la sección y de las tarjetas. Las fotos que ya tengas no se borran y vuelven a verse si lo activas.')));

      // ---------- «Escuchar» (3.1): activarlo o no, y grabar a la vez
      const escGrabar = await DB.kvGet('escucharGrabar', false);
      main.appendChild(h('section.tarjeta', h('div.tarjeta-cab', h('span.tarjeta-icono', { style: { background: '#16B4C8' } }, A.icono('oido')), h('h2', 'Escuchar')),
        A.herr.interruptor('Usar «Escuchar»', A.escucharUI.activo(), async v => { await A.escucharUI.poner(v); A.app.refrescar(); }),
        h('p.mini.tenue', { style: { margin: '2px 0 10px' } }, 'Atril escucha cómo tocas y te dice si paras, dudas, afinas y mantienes el pulso. Si lo desactivas, desaparece de «En el atril», de las obras, las secciones y el progreso; las escuchas que ya tengas se guardan y vuelven a verse si lo activas.'),
        A.escucharUI.activo() ? A.herr.interruptor('Grabar a la vez lo que toco', escGrabar, v => DB.kvSet('escucharGrabar', !!v)) : null,
        A.escucharUI.activo() ? h('p.mini.tenue', { style: { margin: '2px 0 0' } }, 'Guarda también el audio de cada escucha, para oírte después desde el informe. Ocupa espacio en el aparato.') : null));

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
      return () => { if (grabando) pararGrab(); };
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
    // pasajes difíciles marcados por compases (sin necesidad de secciones)
    await modelo.guardarPasaje(obras[0].id, { desde: 31, hasta: 34, nota: 'Cambio de posición' });
    await modelo.guardarPasaje(obras[0].id, { desde: 57, hasta: 60, nota: 'Semicorcheas con púa alternada' });
    const pr = await modelo.guardarPasaje(obras[1].id, { desde: 29, hasta: 31, nota: 'Armónicos' });
    await modelo.marcarPasajes(obras[1].id, [pr.id], { trabajado: u.sumarDias(hoy, -9).getTime(), resuelto: u.sumarDias(hoy, -5).getTime() });
    // lectura del estudio en los últimos días y una tarea ya hecha esta semana
    const o3 = await DB.get('obras', obras[2].id);
    o3.lecturaLog = { [dia(-4)]: { a: 0, b: 4 }, [dia(-2)]: { a: 4, b: 7 }, [dia(-1)]: { a: 7, b: 10 } };
    await DB.put('obras', o3);
    const sB = await DB.get('secciones', obras[0].secs[1]);
    sB.tareas.push({ id: u.uid(), texto: 'Respiración antes del c. 40', hecha: true, creada: u.sumarDias(hoy, -8).getTime(), hechaEn: u.sumarDias(hoy, -1).getTime() });
    await DB.put('secciones', sB);
    // escuchas de ejemplo (Atril 3.0): la confianza de A sube, B y su pasaje van flojos, y dos pasadas completas
    {
      const ahora = Date.now(), D = 86400000;
      const pasajes = (await DB.get('obras', obras[0].id)).pasajes || [];
      const toma = (secId, desde, hasta, dias, p, extra) => DB.put('tomas', Object.assign({
        obraId: obras[0].id, seccionId: secId, pasajeId: null, desde, hasta, modo: 'normal', inicio: ahora - dias * D - 3 * 3600000, fin: ahora - dias * D - 3 * 3600000 + 95000,
        dur: 95, durTotal: 98, tocando: 84, paradas: p < 60 ? [[41.5, 2.6]] : [], dudas: p < 75 ? [[63.2, 1.1]] : [], marcas: p < 50 ? [38.4] : [],
        seg: Array.from({ length: 98 }, (_, i) => [(i > 40 && i < 44) || i > 95 ? 0 : 18, 8, 9, 3]),
        metricas: { continuidad: Math.min(100, p + 6), afinacion: Math.min(100, p + 12), pulso: Math.max(0, p - 8) }, puntuacion: p, medida: 'confianza', grabacionId: null, notas: ''
      }, extra || {}));
      for (const [d, p] of [[13, 52], [9, 61], [5, 70], [2, 78]]) await toma(obras[0].secs[0], 1, 16, d, p);
      for (const [d, p] of [[11, 34], [6, 41], [1, 48]]) await toma(obras[0].secs[1], 17, 48, d, p);
      if (pasajes[0]) await toma(obras[0].secs[1], pasajes[0].desde, pasajes[0].hasta, 3, 39, { pasajeId: pasajes[0].id, dur: 40, durTotal: 42, tocando: 33 });
      await toma(obras[0].secs[2], 49, 62, 1, 57, { modo: 'lectura', medida: 'fluidez' });
      for (const [d, p] of [[8, 58], [3, 67]]) await toma(null, null, null, d, p, { modo: 'concierto', dur: 205, durTotal: 212, tocando: 190 });
    }
    // una clase a la semana
    for (let w = 5; w >= 1; w--) {
      const ini = u.sumarDias(hoy, -7 * w + 2); ini.setHours(18, 0, 0, 0);
      if (ini > hoy) continue;
      await DB.put('sesiones', { obraId: obras[0].id, seccionId: null, inicio: ini.getTime(), fin: ini.getTime() + 45 * 60000, minutos: 45, notas: 'Clase: repasar el Intermedio a 104', valoracion: 4, tipo: 'clase', manual: true });
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
