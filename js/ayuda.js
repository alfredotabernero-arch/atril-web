/* Atril — ayudas en bocadillo: qué hace cada botón.
 * Se activan en Ajustes › Apariencia › «Mostrar ayudas». En el PC salen al dejar el ratón quieto sobre el botón;
 * en el móvil y la tablet, al mantenerlo pulsado (sin ejecutar el botón). */
(function (A) {
  'use strict';
  const { DB, u } = A;
  const { h } = u;

  /* Textos: una o dos frases. La clave es el texto del botón, su etiqueta (aria-label) o su data-ayuda. */
  const AYUDAS = {
    'Estudiar la obra': 'Pone en marcha el cronómetro para esta obra y te deja en esta pantalla; los minutos van a la obra. Para tener partitura, metrónomo y afinador a mano, entra en una sección y pulsa «Estudiar en el atril».',
    'Estudiar en el atril': 'Abre «En el atril» con la partitura, el metrónomo, el afinador y las tareas de esta sección. El cronómetro arranca solo y los minutos van a esta sección.',
    'Terminar sesión': 'Para el cronómetro y guarda la sesión: revisas los minutos, apuntas lo trabajado y lo valoras. Para cambiar de obra, termina aquí y empieza en la otra.',
    'Terminar': 'Para el cronómetro y guarda la sesión: revisas los minutos, apuntas lo trabajado y lo valoras.',
    'Pausar': 'Detiene el cronómetro un momento (una llamada, un descanso). Vuelve a pulsar para seguir.',
    'Empezar a estudiar': 'Elige la obra y la sección (o «Técnica / estudio general») y pon en marcha el cronómetro.',
    'Empezar a leer la obra entera': 'Crea una sola sección con toda la obra, en «Leyendo». Cada día apuntas hasta qué compás llegaste; cuando la conozcas, la divides en secciones.',
    varias: 'Crea varias secciones de golpe escribiendo sus compases (1-16, 17-40…). Úsalo si ya conoces la obra. Si ya tienes «Obra completa», usa «Dividir en dos» dentro de ella.',
    anadirSeccion: 'Crea una sección a mano: nombre, letra de ensayo y compases.',
    pasaje: 'Marca unos compases que se te resisten (p. ej. c. 40–44), con una nota si quieres. No hace falta tener secciones; Atril te los propondrá en «Hoy te toca».',
    modoSencillo: 'Deja Atril con lo esencial y botones grandes, para niños y niñas. Se puede proteger con un PIN de 4 cifras.',
    'Dividir en dos': 'Parte la sección por el compás que elijas. Las dos partes conservan la fase, las estrellas y el tempo; las fotos, tareas e historial se quedan en la primera.',
    'Unir con': 'Junta esta sección con la siguiente en una sola, con sus fotos, tareas, notas e historial.',
    'Sección leída: pasar a «Montando»': 'Da la lectura por terminada y pasa la sección a «Montando». Si después la divides, todos los trozos quedan en «Montando».',
    'Leído hasta el compás': 'Apunta hasta qué compás has leído hoy. La lectura cuenta hasta un 20 % del progreso.',
    'Añadir a «Para mañana»': 'Lo apunta para mañana: saldrá el primero en «Hoy te toca», en el orden en que lo prepares.',
    'Quitar de «Para mañana»': 'Lo quita de lo preparado para mañana.',
    'Preparar': 'Elige lo que estudiarás mañana y en qué orden. Mañana saldrá lo primero en «Hoy te toca».',
    'Cambiar': 'Cambia lo que has preparado para mañana o su orden.',
    'Añadir sesión pasada': 'Apunta una sesión que no cronometraste: fecha, minutos y obra.',
    'Añadir obra': 'Crea una obra, un estudio o tus escalas: título, compositor, color, fecha de la clase o el concierto y tempo objetivo.',
    'Añadir foto': 'Fotografía la parte de la partitura de esta sección para verla en el atril.',
    'Añadir tarea': 'Apunta algo concreto que trabajar («Digitación c. 24»). Las tareas pendientes suben la sección en «Hoy te toca».',
    'Nueva tarea': 'Apunta algo concreto que trabajar («Digitación c. 24»). Las tareas pendientes suben la sección en «Hoy te toca».',
    'Fase de la obra': 'Sin empezar, Leyendo, Montando, Puliendo o Lista. Si la obra tiene secciones, se calcula sola con las de sus secciones.',
    'Cambiar tempo': 'Apunta el tempo al que ya te sale. Atril guarda la evolución y lo compara con el tempo objetivo.',
    'Metrónomo': 'Abre el metrónomo con el tempo de esta obra o sección.',
    'Activar micrófono': 'El afinador escucha por el micrófono. Al salir de la pantalla se apaga siempre.',
    cambiarAfinacion: 'Sube o baja cada cuerda por semitonos (por ejemplo, la sexta de la bandurria en Sol o en Sol♯). «Restablecer» vuelve a la afinación habitual.',
    'Pantalla completa': 'Muestra solo la partitura, a toda la pantalla.',
    'Anotar': 'Dibuja sobre la foto de la partitura: digitaciones, arcos, respiraciones…',
    'Exportar copia': 'Guarda en un .zip todos tus datos, fotos, grabaciones y voces. Sirve también para pasarlos del PC al móvil.',
    'Importar copia': 'Carga una copia .zip. «Añadir» la suma a lo que tienes; «Sustituir» borra lo actual y deja solo la copia.',
    'Editar': 'Cambia los datos de esta obra o sección.',
    'Borrar': 'Borra esto. Atril siempre pregunta antes.',
    'Reproducir': 'Enciende o apaga los sonidos y la música elegidos.',
    'Salir de Atril': 'Cierra la aplicación. Todo queda guardado.',
    'Ajustes': 'Plan de estudio, apariencia, nombres de las notas, pantalla, voz de la respiración y copias de seguridad.'
  };
  const PREFIJOS = ['Unir con'];

  let activas = false;
  async function iniciar() {
    let v = await DB.kvGet('ayudas', null);
    if (v === null) {
      // de serie, encendidas solo en una instalación nueva (sin obras ni sesiones)
      const [obras, ses] = await Promise.all([DB.all('obras'), DB.all('sesiones')]);
      v = !obras.length && !ses.length;
      await DB.kvSet('ayudas', v);
    }
    activas = !!v;
  }
  function poner(v) { activas = !!v; DB.kvSet('ayudas', activas); if (!v) ocultar(); }

  function textoDe(el) {
    const k = el.dataset.ayuda || el.getAttribute('aria-label') || (el.textContent || '').replace(/^[+＋]\s*/, '').trim();
    if (!k) return null;
    if (AYUDAS[k]) return { titulo: el.getAttribute('aria-label') || (el.textContent || '').trim() || k, texto: AYUDAS[k] };
    const p = PREFIJOS.find(x => k.startsWith(x));
    return p ? { titulo: k, texto: AYUDAS[p] } : null;
  }
  const objetivo = t => (t && t.closest ? t.closest('[data-ayuda], button, a, [role=button], select') : null);

  /* ---------- bocadillo ---------- */
  let globo = null, tOcultar = 0;
  function mostrar(el, info) {
    ocultar();
    globo = h('div.ayuda-globo', { role: 'tooltip' }, h('b', info.titulo), h('span', info.texto));
    document.body.appendChild(globo);
    const r = el.getBoundingClientRect(), g = globo.getBoundingClientRect();
    const margen = 10;
    let x = r.left + r.width / 2 - g.width / 2;
    x = Math.max(margen, Math.min(window.innerWidth - g.width - margen, x));
    let y = r.top - g.height - 12, abajo = false;
    if (y < margen) { y = r.bottom + 12; abajo = true; }
    globo.style.left = x + 'px'; globo.style.top = y + 'px';
    globo.style.setProperty('--flecha', Math.max(14, Math.min(g.width - 14, r.left + r.width / 2 - x)) + 'px');
    globo.classList.toggle('abajo', abajo);
    requestAnimationFrame(() => globo && globo.classList.add('on'));
    clearTimeout(tOcultar);
    tOcultar = setTimeout(ocultar, Math.max(5000, info.texto.length * 70));
  }
  function ocultar() {
    clearTimeout(tOcultar);
    if (globo) { const g = globo; globo = null; g.classList.remove('on'); setTimeout(() => g.remove(), 180); }
  }

  /* ---------- ratón: dejar el cursor quieto encima ---------- */
  let tHover = 0, actual = null;
  document.addEventListener('pointerover', e => {
    if (!activas || e.pointerType !== 'mouse') return;
    const el = objetivo(e.target);
    if (el === actual) return;
    actual = el; clearTimeout(tHover); ocultar();
    if (!el) return;
    const info = textoDe(el);
    if (!info) return;
    // que no salga a la vez el «title» del navegador
    if (el.title) { el.dataset.tituloOrig = el.title; el.removeAttribute('title'); }
    tHover = setTimeout(() => { if (actual === el && document.body.contains(el)) mostrar(el, info); }, 650);
  }, true);
  document.addEventListener('pointerout', e => {
    if (e.pointerType !== 'mouse') return;
    const el = objetivo(e.target);
    if (el && el.contains(e.relatedTarget)) return;
    if (el && el.dataset.tituloOrig) { el.title = el.dataset.tituloOrig; delete el.dataset.tituloOrig; }
    clearTimeout(tHover); actual = null; ocultar();
  }, true);

  /* ---------- dedo: mantener pulsado (no ejecuta el botón) ---------- */
  let tLargo = 0, inicio = null, tragarClic = false;
  document.addEventListener('pointerdown', e => {
    tragarClic = false;
    if (e.pointerType === 'mouse') { clearTimeout(tHover); ocultar(); return; }
    ocultar();
    if (!activas) return;
    const el = objetivo(e.target);
    const info = el && textoDe(el);
    if (!info) return;
    inicio = { x: e.clientX, y: e.clientY };
    clearTimeout(tLargo);
    tLargo = setTimeout(() => { tragarClic = true; mostrar(el, info); if (navigator.vibrate) navigator.vibrate(10); }, 550);
  }, true);
  const cancelar = () => { clearTimeout(tLargo); inicio = null; };
  document.addEventListener('pointermove', e => { if (inicio && Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y) > 10) cancelar(); }, true);
  document.addEventListener('pointerup', cancelar, true);
  document.addEventListener('pointercancel', cancelar, true);
  document.addEventListener('scroll', () => { cancelar(); ocultar(); }, true);
  document.addEventListener('click', e => {
    if (!tragarClic) return;
    tragarClic = false; e.preventDefault(); e.stopPropagation();
  }, true);
  document.addEventListener('contextmenu', e => { if (tragarClic || (activas && inicio)) e.preventDefault(); }, true);
  window.addEventListener('hashchange', ocultar);

  A.ayuda = { iniciar, poner, activas: () => activas, AYUDAS };
})(window.Atril);
