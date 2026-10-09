/* Atril — anotaciones sobre las fotos de la partitura (lápiz, resaltador, texto, borrador)
 *
 * Las anotaciones no modifican la foto: se guardan como trazos vectoriales en el
 * propio registro de la foto (foto.trazos), en coordenadas de píxel de la imagen.
 * Así se pueden deshacer, borrar o editar después sin perder calidad.
 */
(function (A) {
  'use strict';
  const { u, DB, icono } = A;
  const { h } = u;
  const NS = 'http://www.w3.org/2000/svg';

  const COLORES = [
    { c: '#E5243B', n: 'Rojo' }, { c: '#1E6BFF', n: 'Azul' }, { c: '#12A150', n: 'Verde' },
    { c: '#8A2BE2', n: 'Morado' }, { c: '#111111', n: 'Negro' }
  ];
  const RESALTADORES = [
    { c: '#FFE600', n: 'Amarillo' }, { c: '#00E5FF', n: 'Celeste' }, { c: '#FF6FD8', n: 'Rosa' }, { c: '#7CFF6B', n: 'Verde' }
  ];
  const GROSORES = [{ g: 0.0035, n: 'Fino' }, { g: 0.0065, n: 'Medio' }, { g: 0.011, n: 'Grueso' }];

  /* ---------------- dibujo SVG ---------------- */
  function camino(puntos) {
    if (!puntos.length) return '';
    if (puntos.length === 1) { const [x, y] = puntos[0]; return `M${x} ${y}L${x + 0.1} ${y + 0.1}`; }
    let d = `M${puntos[0][0]} ${puntos[0][1]}`;
    for (let i = 1; i < puntos.length - 1; i++) {
      const [x0, y0] = puntos[i], [x1, y1] = puntos[i + 1];
      d += `Q${x0} ${y0} ${(x0 + x1) / 2} ${(y0 + y1) / 2}`;
    }
    const [xn, yn] = puntos[puntos.length - 1];
    return d + `L${xn} ${yn}`;
  }
  function nodoTrazo(t) {
    if (t.tipo === 'texto') {
      const e = document.createElementNS(NS, 'text');
      e.setAttribute('x', t.x); e.setAttribute('y', t.y);
      e.setAttribute('fill', t.color);
      e.setAttribute('font-size', t.tam);
      e.setAttribute('font-weight', '800');
      e.setAttribute('font-family', 'Nunito, system-ui, sans-serif');
      e.setAttribute('paint-order', 'stroke');
      e.setAttribute('stroke', '#fff');
      e.setAttribute('stroke-width', t.tam * 0.12);
      e.setAttribute('dominant-baseline', 'middle');
      e.setAttribute('text-anchor', 'middle');
      e.textContent = t.texto;
      return e;
    }
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', camino(t.puntos));
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', t.color);
    p.setAttribute('stroke-width', t.grosor);
    p.setAttribute('stroke-linecap', t.tipo === 'resaltador' ? 'butt' : 'round');
    p.setAttribute('stroke-linejoin', 'round');
    if (t.tipo === 'resaltador') { p.setAttribute('stroke-opacity', '0.38'); p.style.mixBlendMode = 'multiply'; }
    return p;
  }
  /** Capa SVG con las anotaciones de una foto */
  function capa(foto, encaje) {
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', `0 0 ${foto.ancho} ${foto.alto}`);
    s.setAttribute('preserveAspectRatio', encaje === 'cubrir' ? 'xMidYMid slice' : 'none');
    s.setAttribute('class', 'anot-capa');
    (foto.trazos || []).forEach(t => s.appendChild(nodoTrazo(t)));
    return s;
  }

  /**
   * Lienzo: imagen + anotaciones encajadas en una caja, listas para ampliar.
   * Devuelve {lienzo, img, svg, ajustar()}; el zoom se aplica a «lienzo».
   */
  function lienzo(caja, foto) {
    const img = h('img', { src: A.fotos.url(foto), alt: 'Partitura', draggable: false });
    const svg = capa(foto);
    const lz = h('div.lienzo', img, svg);
    caja.appendChild(lz);
    const ajustar = () => {
      const r = caja.getBoundingClientRect();
      const pad = 16;
      const k = Math.min((r.width - pad) / foto.ancho, (r.height - pad) / foto.alto);
      if (!(k > 0)) return;
      lz.style.width = Math.round(foto.ancho * k) + 'px';
      lz.style.height = Math.round(foto.alto * k) + 'px';
    };
    ajustar();
    requestAnimationFrame(ajustar);
    const ro = window.ResizeObserver ? new ResizeObserver(ajustar) : null;
    if (ro) ro.observe(caja);
    return { lienzo: lz, img, svg, ajustar, soltar: () => ro && ro.disconnect() };
  }

  /** Gira 90° (sentido horario) las anotaciones, igual que la foto */
  function rotar(trazos, ancho, alto) {
    return (trazos || []).map(t => t.tipo === 'texto'
      ? Object.assign({}, t, { x: alto - t.y, y: t.x })
      : Object.assign({}, t, { puntos: t.puntos.map(([x, y]) => [alto - y, x]) }));
  }

  /* ---------------- editor ---------------- */
  /**
   * Editor a pantalla completa. Un dedo (o el ratón) dibuja; dos dedos amplían y desplazan.
   * En el PC: rueda para ampliar y herramienta «mano» (o espacio pulsado) para desplazar.
   * Resuelve true si se guardaron cambios.
   */
  function editor(foto) {
    return new Promise(async resolve => {
      const pref = Object.assign({ herr: 'lapiz', color: COLORES[0].c, resaltador: RESALTADORES[0].c, grosor: 1 }, await DB.kvGet('anotPref', {}));
      let trazos = JSON.parse(JSON.stringify(foto.trazos || []));
      const historial = [];
      const rehacer = [];
      let cambiado = false;

      const area = h('div.anot-area');
      const fondo = h('div.anot-editor');
      const barraSup = h('div.anot-barra');
      const barraInf = h('div.anot-herramientas');
      fondo.append(barraSup, area, barraInf);
      document.body.appendChild(fondo);
      const lz = lienzo(area, foto);
      const svg = lz.svg;
      const repintar = () => { svg.innerHTML = ''; trazos.forEach(t => svg.appendChild(nodoTrazo(t))); };
      const guardarPaso = () => { historial.push(JSON.stringify(trazos)); if (historial.length > 60) historial.shift(); rehacer.length = 0; cambiado = true; pintarBarra(); };

      // ---- vista (zoom/desplazamiento) propia del editor
      let s = 1, tx = 0, ty = 0;
      const aplicar = () => { lz.lienzo.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`; };
      const limitar = () => {
        s = u.clamp(s, 1, 6);
        const r = area.getBoundingClientRect();
        const mx = (r.width * (s - 1)) / 2 + 40, my = (r.height * (s - 1)) / 2 + 40;
        tx = u.clamp(tx, -mx, mx); ty = u.clamp(ty, -my, my);
        if (s === 1) { tx = 0; ty = 0; }
      };
      const zoomEn = (ns, cx, cy) => {
        const r = area.getBoundingClientRect();
        const px = cx - r.left - r.width / 2, py = cy - r.top - r.height / 2;
        const k = ns / s;
        tx = px - (px - tx) * k; ty = py - (py - ty) * k; s = ns;
        limitar(); aplicar();
      };
      /** Punto de pantalla → coordenadas de la imagen */
      const aImagen = (cx, cy) => {
        const r = svg.getBoundingClientRect();
        return [Math.round((cx - r.left) / r.width * foto.ancho * 10) / 10, Math.round((cy - r.top) / r.height * foto.alto * 10) / 10];
      };

      // ---- entrada
      const punteros = new Map();
      let actual = null, pinza = null, espacio = false, arrastre = null;
      const lado = Math.max(foto.ancho, foto.alto);
      const grosor = () => GROSORES[pref.grosor].g * lado * (pref.herr === 'resaltador' ? 3.2 : 1);

      function borrarEn(p) {
        const radio = lado * 0.015;
        const antes = trazos.length;
        trazos = trazos.filter(t => {
          if (t.tipo === 'texto') return Math.hypot(t.x - p[0], t.y - p[1]) > t.tam * 0.8;
          return !t.puntos.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < radio + t.grosor / 2);
        });
        if (trazos.length !== antes) repintar();
        return trazos.length !== antes;
      }

      area.style.touchAction = 'none';
      area.addEventListener('pointerdown', async e => {
        area.setPointerCapture(e.pointerId);
        punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (punteros.size === 2) {
          // pasar de dibujar a pellizcar: se descarta el trazo a medias
          if (actual) { actual.nodo.remove(); actual = null; }
          const [a, b] = [...punteros.values()];
          pinza = { d: Math.hypot(a.x - b.x, a.y - b.y), s, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
          return;
        }
        if (punteros.size > 2) return;
        if (pref.herr === 'mano' || espacio || e.button === 1 || e.button === 2) { arrastre = { x: e.clientX, y: e.clientY }; return; }
        const p = aImagen(e.clientX, e.clientY);
        if (pref.herr === 'texto') {
          punteros.delete(e.pointerId);
          const inp = h('input', { type: 'text', maxlength: 24, placeholder: 'p. ej. 1, 3, «p», «resp.»…', style: { fontSize: '1.4rem', textAlign: 'center' } });
          const txt = await u.modal('Texto en la partitura', h('div', inp, h('p.mini.tenue', 'Digitaciones, cuerdas, matices, respiraciones…')), [
            { texto: 'Cancelar', accion: () => null }, { texto: 'Poner', clase: 'primario', accion: () => inp.value.trim() }]);
          if (txt) {
            guardarPaso();
            trazos.push({ tipo: 'texto', texto: txt, x: p[0], y: p[1], tam: Math.round(lado * (0.022 + pref.grosor * 0.012)), color: pref.color });
            repintar();
          }
          return;
        }
        if (pref.herr === 'borrador') {
          historial.push(JSON.stringify(trazos));
          actual = { borrador: true, algo: borrarEn(p) };
          return;
        }
        const t = { tipo: pref.herr, color: pref.herr === 'resaltador' ? pref.resaltador : pref.color, grosor: Math.round(grosor() * 10) / 10, puntos: [p] };
        actual = { t, nodo: nodoTrazo(t) };
        svg.appendChild(actual.nodo);
      });
      area.addEventListener('pointermove', e => {
        if (!punteros.has(e.pointerId)) return;
        const ant = punteros.get(e.pointerId);
        punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (punteros.size === 2 && pinza) {
          const [a, b] = [...punteros.values()];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
          tx += cx - pinza.cx; ty += cy - pinza.cy; pinza.cx = cx; pinza.cy = cy;
          zoomEn(pinza.s * d / pinza.d, cx, cy);
          return;
        }
        if (arrastre) { tx += e.clientX - ant.x; ty += e.clientY - ant.y; limitar(); aplicar(); return; }
        if (!actual) return;
        const p = aImagen(e.clientX, e.clientY);
        if (actual.borrador) { if (borrarEn(p)) actual.algo = true; return; }
        const pts = actual.t.puntos, ult = pts[pts.length - 1];
        if (Math.hypot(p[0] - ult[0], p[1] - ult[1]) < lado * 0.002) return;
        // el resaltador va en línea recta si se mantiene la dirección (subrayado limpio)
        pts.push(p);
        actual.nodo.setAttribute('d', camino(pts));
      });
      const fin = e => {
        punteros.delete(e.pointerId);
        if (punteros.size < 2) pinza = null;
        if (arrastre && !punteros.size) arrastre = null;
        if (!actual || punteros.size) return;
        if (actual.borrador) {
          if (actual.algo) { rehacer.length = 0; cambiado = true; pintarBarra(); } else historial.pop();
        } else {
          const t = actual.t;
          if (t.tipo === 'resaltador' && t.puntos.length > 2) t.puntos = enderezar(t.puntos, lado);
          historial.push(JSON.stringify(trazos));
          trazos.push(t);
          rehacer.length = 0; cambiado = true;
          repintar(); pintarBarra();
        }
        actual = null;
      };
      area.addEventListener('pointerup', fin);
      area.addEventListener('pointercancel', fin);
      area.addEventListener('contextmenu', e => e.preventDefault());
      area.addEventListener('wheel', e => { e.preventDefault(); zoomEn(s * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY); }, { passive: false });

      // ---- barras
      const cerrar = async guardar => {
        if (guardar && cambiado) {
          foto.trazos = trazos;
          await DB.put('fotos', foto);
          u.toast('Anotaciones guardadas ✓');
        }
        lz.soltar();
        document.removeEventListener('keydown', teclas);
        document.removeEventListener('keyup', teclasArriba);
        fondo.remove();
        resolve(!!(guardar && cambiado));
      };
      const deshacer = () => { if (!historial.length) return; rehacer.push(JSON.stringify(trazos)); trazos = JSON.parse(historial.pop()); repintar(); cambiado = true; pintarBarra(); };
      const reHacer = () => { if (!rehacer.length) return; historial.push(JSON.stringify(trazos)); trazos = JSON.parse(rehacer.pop()); repintar(); cambiado = true; pintarBarra(); };

      function pintarBarra() {
        barraSup.innerHTML = '';
        barraSup.append(
          h('button.btn-icono', {
            'aria-label': 'Cerrar sin guardar', onclick: async () => {
              if (cambiado && !await u.confirmar('¿Salir sin guardar las anotaciones?', 'Salir', 'peligro')) return;
              cerrar(false);
            }
          }, icono('x')),
          h('b.crece', 'Anotar'),
          h('button.btn-icono', { 'aria-label': 'Deshacer', title: 'Deshacer (Ctrl+Z)', onclick: deshacer, disabled: !historial.length }, icono('deshacer')),
          h('button.btn-icono', { 'aria-label': 'Rehacer', title: 'Rehacer', onclick: reHacer, disabled: !rehacer.length }, icono('rehacer')),
          h('button.btn-icono', {
            'aria-label': 'Borrar todo', title: 'Borrar todas las anotaciones', disabled: !trazos.length,
            onclick: async () => { if (await u.confirmar('¿Borrar todas las anotaciones de esta foto?', 'Borrar', 'peligro')) { guardarPaso(); trazos = []; repintar(); pintarBarra(); } }
          }, icono('borrar')),
          h('button.btn.primario.pequeno', { onclick: () => cerrar(true) }, 'Guardar'));

        barraInf.innerHTML = '';
        const HERR = [['lapiz', 'Lápiz', 'lapiz'], ['resaltador', 'Resaltador', 'resaltador'], ['texto', 'Texto', 'texto'], ['borrador', 'Borrador', 'goma'], ['mano', 'Mover', 'mano']];
        const fila1 = h('div.anot-fila', HERR.map(([id, n, ic]) => h('button.anot-herr' + (pref.herr === id ? '.on' : ''), {
          'aria-label': n, title: n, onclick: () => { pref.herr = id; DB.kvSet('anotPref', pref); pintarBarra(); }
        }, icono(ic), h('span', n))));
        const paleta = pref.herr === 'resaltador' ? RESALTADORES : COLORES;
        const clave = pref.herr === 'resaltador' ? 'resaltador' : 'color';
        const mostrarColores = ['lapiz', 'resaltador', 'texto'].includes(pref.herr);
        const fila2 = mostrarColores ? h('div.anot-fila',
          paleta.map(c => h('button.anot-color' + (pref[clave] === c.c ? '.on' : ''), {
            'aria-label': c.n, title: c.n, style: { background: c.c }, onclick: () => { pref[clave] = c.c; DB.kvSet('anotPref', pref); pintarBarra(); }
          })),
          h('span.anot-sep'),
          GROSORES.map((g, i) => h('button.anot-grosor' + (pref.grosor === i ? '.on' : ''), {
            'aria-label': g.n, title: g.n, onclick: () => { pref.grosor = i; DB.kvSet('anotPref', pref); pintarBarra(); }
          }, h('i', { style: { width: (6 + i * 6) + 'px', height: (6 + i * 6) + 'px', background: pref[clave] } })))) :
          h('div.anot-fila.anot-pista', pref.herr === 'borrador' ? 'Pasa el dedo por encima de lo que quieras borrar.' : 'Arrastra para mover la partitura. Pellizca o usa la rueda para ampliar.');
        barraInf.append(fila1, fila2);
      }
      pintarBarra();

      const teclas = e => {
        if (document.querySelector('.modal-fondo')) return;
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? reHacer() : deshacer(); }
        else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); reHacer(); }
        else if (e.code === 'Space') { espacio = true; area.style.cursor = 'grab'; e.preventDefault(); }
        else if (e.key === 'Escape') barraSup.querySelector('.btn-icono').click();
      };
      const teclasArriba = e => { if (e.code === 'Space') { espacio = false; area.style.cursor = ''; } };
      document.addEventListener('keydown', teclas);
      document.addEventListener('keyup', teclasArriba);
    });
  }

  /** Si el resaltador se ha trazado casi recto, se convierte en una línea limpia */
  function enderezar(pts, lado) {
    const a = pts[0], b = pts[pts.length - 1];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < lado * 0.03) return pts;
    const desv = Math.max(...pts.map(p => Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / L));
    return desv < lado * 0.012 ? [a, b] : pts;
  }

  A.anot = { capa, lienzo, editor, rotar };
})(window.Atril);
