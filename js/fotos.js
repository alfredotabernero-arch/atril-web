/* Atril — fotos de las secciones: cámara, reducción, visor con zoom */
(function (A) {
  'use strict';
  const { u, DB, icono } = A;
  const { h } = u;

  const LADO_MAX = 2000;     // px del lado largo al guardar
  const CALIDAD = 0.82;

  const esMovil = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) ||
    (window.matchMedia && matchMedia('(pointer: coarse)').matches);

  /* ---------------- URLs de objeto con caché ---------------- */
  const urls = new Map();
  function url(foto) {
    if (!urls.has(foto.id)) urls.set(foto.id, URL.createObjectURL(foto.blob));
    return urls.get(foto.id);
  }
  function soltar(id) { if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); } }

  /* ---------------- reducir a JPEG ---------------- */
  async function aLienzo(fuente, rotar = 0) {
    let bmp;
    if (fuente instanceof HTMLVideoElement || fuente instanceof HTMLCanvasElement) bmp = fuente;
    else {
      try { bmp = await createImageBitmap(fuente, { imageOrientation: 'from-image' }); }
      catch (e) {
        bmp = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(fuente); });
      }
    }
    const w0 = bmp.videoWidth || bmp.width, h0 = bmp.videoHeight || bmp.height;
    const k = Math.min(1, LADO_MAX / Math.max(w0, h0));
    const w = Math.round(w0 * k), hh = Math.round(h0 * k);
    const girado = rotar % 180 !== 0;
    const c = document.createElement('canvas');
    c.width = girado ? hh : w; c.height = girado ? w : hh;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.translate(c.width / 2, c.height / 2);
    g.rotate(rotar * Math.PI / 180);
    g.drawImage(bmp, -w / 2, -hh / 2, w, hh);
    return c;
  }
  async function reducir(fuente, rotar = 0) {
    const c = await aLienzo(fuente, rotar);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', CALIDAD));
    return { blob, ancho: c.width, alto: c.height };
  }

  /* ---------------- obtener una imagen ---------------- */
  function elegirArchivo(conCamara) {
    return new Promise(resolve => {
      const inp = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
      if (conCamara) inp.setAttribute('capture', 'environment');
      inp.addEventListener('change', () => { resolve(inp.files[0] || null); inp.remove(); });
      // si se cancela, algunos navegadores no avisan: se resuelve al volver el foco
      window.addEventListener('focus', () => setTimeout(() => { if (!inp.files.length) { resolve(null); inp.remove(); } }, 800), { once: true });
      document.body.appendChild(inp);
      inp.click();
    });
  }

  /** Cámara del PC (webcam) en un diálogo */
  function webcam() {
    return new Promise(async resolve => {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      } catch (e) { u.toast('No se pudo abrir la cámara'); resolve(null); return; }
      const video = h('video', { autoplay: true, playsinline: true, muted: true, style: { width: '100%', borderRadius: '16px', background: '#000' } });
      video.srcObject = stream;
      const parar = () => stream.getTracks().forEach(t => t.stop());
      const r = await u.modal('Hacer foto', h('div', video, h('p.mini.tenue', 'Encuadra el pasaje de la partitura y pulsa «Capturar».')), [
        { texto: 'Cancelar', accion: () => null },
        { texto: 'Capturar', clase: 'primario', accion: () => aLienzo(video) }
      ]);
      parar();
      resolve(r ? await new Promise(res => r.toBlob(res, 'image/jpeg', 0.92)) : null);
    });
  }

  /** Pregunta cámara o archivo y devuelve {blob, ancho, alto} ya reducido, o null */
  async function capturar() {
    const op = await u.modal('Añadir foto', h('p.tenue', { style: { margin: 0 } }, 'Fotografía la parte de la partitura que corresponde a esta sección.'), [
      { texto: 'Cancelar', accion: () => null },
      { texto: 'Elegir imagen', accion: () => 'archivo' },
      { texto: 'Hacer foto', clase: 'primario', accion: () => 'camara' }
    ]);
    if (!op) return null;
    let fuente;
    if (op === 'archivo') fuente = await elegirArchivo(false);
    else fuente = esMovil() ? await elegirArchivo(true) : await webcam();
    if (!fuente) return null;
    try { return await reducir(fuente); }
    catch (e) { u.toast('No se pudo leer la imagen'); return null; }
  }

  async function deSeccion(seccionId) {
    const l = await DB.byIndex('fotos', 'seccionId', seccionId);
    return l.sort((a, b) => (a.orden ?? a.fecha) - (b.orden ?? b.fecha));
  }

  async function anadir(seccion) {
    const r = await capturar();
    if (!r) return null;
    const n = (await deSeccion(seccion.id)).length;
    const f = await DB.put('fotos', { seccionId: seccion.id, obraId: seccion.obraId, blob: r.blob, ancho: r.ancho, alto: r.alto, fecha: Date.now(), orden: n });
    u.toast('Foto guardada');
    return f;
  }

  async function borrar(foto) {
    await DB.del('fotos', foto.id);
    soltar(foto.id);
  }

  async function rotar(foto) {
    const r = await reducir(foto.blob, 90);
    soltar(foto.id);
    if (foto.trazos && foto.trazos.length) foto.trazos = A.anot.rotar(foto.trazos, foto.ancho, foto.alto);
    Object.assign(foto, { blob: r.blob, ancho: r.ancho, alto: r.alto });
    await DB.put('fotos', foto);
    return foto;
  }

  /* ---------------- zoom y desplazamiento ---------------- */
  /**
   * Hace ampliable una imagen dentro de su contenedor:
   * pellizco con dos dedos, rueda del ratón, arrastrar y doble toque.
   */
  function zoom(caja, img) {
    let s = 1, x = 0, y = 0;
    const punteros = new Map();
    let ini = null;
    const aplicar = () => { img.style.transform = `translate(${x}px, ${y}px) scale(${s})`; };
    const limitar = () => {
      s = u.clamp(s, 1, 6);
      const r = caja.getBoundingClientRect();
      const mx = (r.width * (s - 1)) / 2, my = (r.height * (s - 1)) / 2;
      x = u.clamp(x, -mx, mx); y = u.clamp(y, -my, my);
      if (s === 1) { x = 0; y = 0; }
    };
    const zoomEn = (ns, cx, cy) => {
      const r = caja.getBoundingClientRect();
      const px = cx - r.left - r.width / 2, py = cy - r.top - r.height / 2;
      const k = ns / s;
      x = px - (px - x) * k; y = py - (py - y) * k; s = ns;
      limitar(); aplicar();
    };
    caja.style.touchAction = 'none';
    caja.addEventListener('pointerdown', e => {
      caja.setPointerCapture(e.pointerId);
      punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
      ini = null;
    });
    caja.addEventListener('pointermove', e => {
      if (!punteros.has(e.pointerId)) return;
      const ant = punteros.get(e.pointerId);
      punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (punteros.size === 2) {
        const [a, b] = [...punteros.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (!ini) ini = { d, s };
        zoomEn(ini.s * d / ini.d, (a.x + b.x) / 2, (a.y + b.y) / 2);
      } else if (punteros.size === 1 && s > 1) {
        x += e.clientX - ant.x; y += e.clientY - ant.y; limitar(); aplicar();
      }
    });
    const fin = e => { punteros.delete(e.pointerId); if (punteros.size < 2) ini = null; };
    caja.addEventListener('pointerup', fin);
    caja.addEventListener('pointercancel', fin);
    caja.addEventListener('wheel', e => { e.preventDefault(); zoomEn(s * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY); }, { passive: false });
    caja.addEventListener('dblclick', e => zoomEn(s > 1.2 ? 1 : 2.5, e.clientX, e.clientY));
    return { reset() { s = 1; x = 0; y = 0; aplicar(); } };
  }

  /* ---------------- visor a pantalla completa ---------------- */
  function visor(fotos, indice = 0, alCambiar) {
    let i = indice, lz = null, z = null;
    const area = h('div.visor-area');
    const cont = h('span.visor-cont');
    const cerrar = () => { if (lz) lz.soltar(); fondo.remove(); document.removeEventListener('keydown', teclas); };
    const pintar = () => {
      if (!fotos.length) { cerrar(); return; }
      i = u.clamp(i, 0, fotos.length - 1);
      if (lz) lz.soltar();
      area.innerHTML = '';
      lz = A.anot.lienzo(area, fotos[i]);
      z = zoom(area, lz.lienzo);
      cont.textContent = fotos.length > 1 ? (i + 1) + ' / ' + fotos.length : '';
      ant.style.visibility = i > 0 ? '' : 'hidden';
      sig.style.visibility = i < fotos.length - 1 ? '' : 'hidden';
    };
    const ant = h('button.visor-nav.izq', { 'aria-label': 'Anterior', onclick: () => { i--; pintar(); } }, icono('atras'));
    const sig = h('button.visor-nav.der', { 'aria-label': 'Siguiente', onclick: () => { i++; pintar(); } }, icono('atras'));
    const barra = h('div.visor-barra',
      h('button.btn-icono', { 'aria-label': 'Cerrar', onclick: cerrar }, icono('x')),
      cont, h('span.crece'),
      h('button.btn.primario.pequeno', { onclick: async () => { if (await A.anot.editor(fotos[i])) { pintar(); alCambiar && alCambiar(); } } }, icono('lapiz'), 'Anotar'),
      h('button.btn-icono', { 'aria-label': 'Girar', title: 'Girar 90°', onclick: async () => { await rotar(fotos[i]); pintar(); alCambiar && alCambiar(); } }, icono('girar')),
      h('button.btn-icono', {
        'aria-label': 'Borrar foto', onclick: async () => {
          if (!await u.confirmar('¿Borrar esta foto y sus anotaciones?', 'Borrar', 'peligro')) return;
          await borrar(fotos[i]); fotos.splice(i, 1); pintar(); alCambiar && alCambiar();
        }
      }, icono('borrar')));
    const fondo = h('div.visor', barra, area, ant, sig);
    const teclas = e => {
      if (document.querySelector('.anot-editor, .modal-fondo')) return;
      if (e.key === 'Escape') cerrar();
      else if (e.key === 'ArrowLeft' && i > 0) { i--; pintar(); }
      else if (e.key === 'ArrowRight' && i < fotos.length - 1) { i++; pintar(); }
    };
    document.addEventListener('keydown', teclas);
    document.body.appendChild(fondo);
    pintar();
  }

  A.fotos = { capturar, reducir, deSeccion, anadir, borrar, rotar, url, soltar, zoom, visor, esMovil };
})(window.Atril);
