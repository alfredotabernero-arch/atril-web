/* Atril — lector/escritor ZIP mínimo (sin dependencias) para las copias de seguridad */
(function (A) {
  'use strict';

  const TABLA = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(b) {
    let c = 0xffffffff;
    for (let i = 0; i < b.length; i++) c = TABLA[(c ^ b[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  /** archivos: [{nombre, datos: Blob|Uint8Array}] → Blob .zip (sin comprimir: fotos y audio ya lo están) */
  async function crear(archivos) {
    const enc = new TextEncoder();
    const partes = [], central = [];
    let offset = 0;
    const ahora = new Date();
    const hora = (ahora.getHours() << 11) | (ahora.getMinutes() << 5) | (ahora.getSeconds() >> 1);
    const fecha = ((ahora.getFullYear() - 1980) << 9) | ((ahora.getMonth() + 1) << 5) | ahora.getDate();
    for (const a of archivos) {
      const datos = a.datos instanceof Uint8Array ? a.datos : new Uint8Array(await a.datos.arrayBuffer());
      const nombre = enc.encode(a.nombre);
      const crc = crc32(datos);
      const loc = new DataView(new ArrayBuffer(30));
      loc.setUint32(0, 0x04034b50, true); loc.setUint16(4, 20, true); loc.setUint16(6, 0x0800, true); // UTF-8
      loc.setUint16(8, 0, true); loc.setUint16(10, hora, true); loc.setUint16(12, fecha, true);
      loc.setUint32(14, crc, true); loc.setUint32(18, datos.length, true); loc.setUint32(22, datos.length, true);
      loc.setUint16(26, nombre.length, true); loc.setUint16(28, 0, true);
      partes.push(loc.buffer, nombre, datos);
      const cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true);
      cen.setUint16(10, 0, true); cen.setUint16(12, hora, true); cen.setUint16(14, fecha, true);
      cen.setUint32(16, crc, true); cen.setUint32(20, datos.length, true); cen.setUint32(24, datos.length, true);
      cen.setUint16(28, nombre.length, true); cen.setUint32(42, offset, true);
      central.push(cen.buffer, nombre);
      offset += 30 + nombre.length + datos.length;
    }
    const tamCentral = central.reduce((n, p) => n + (p.byteLength !== undefined ? p.byteLength : p.length), 0);
    const fin = new DataView(new ArrayBuffer(22));
    fin.setUint32(0, 0x06054b50, true);
    fin.setUint16(8, archivos.length, true); fin.setUint16(10, archivos.length, true);
    fin.setUint32(12, tamCentral, true); fin.setUint32(16, offset, true);
    return new Blob([...partes, ...central, fin.buffer], { type: 'application/zip' });
  }

  /** ArrayBuffer .zip → {nombre: Uint8Array}. Admite archivos guardados o comprimidos (deflate). */
  async function leer(buf) {
    const v = new DataView(buf), u8 = new Uint8Array(buf), dec = new TextDecoder();
    let e = buf.byteLength - 22;
    while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('No es un fichero .zip válido');
    const n = v.getUint16(e + 10, true);
    let p = v.getUint32(e + 16, true);
    const out = {};
    for (let i = 0; i < n; i++) {
      if (v.getUint32(p, true) !== 0x02014b50) throw new Error('Zip dañado');
      const metodo = v.getUint16(p + 10, true);
      const tamComp = v.getUint32(p + 20, true);
      const lNom = v.getUint16(p + 28, true), lExtra = v.getUint16(p + 30, true), lCom = v.getUint16(p + 32, true);
      const offLocal = v.getUint32(p + 42, true);
      const nombre = dec.decode(u8.subarray(p + 46, p + 46 + lNom));
      const ini = offLocal + 30 + v.getUint16(offLocal + 26, true) + v.getUint16(offLocal + 28, true);
      const crudo = u8.slice(ini, ini + tamComp);
      if (!nombre.endsWith('/')) {
        if (metodo === 0) out[nombre] = crudo;
        else if (metodo === 8) out[nombre] = new Uint8Array(await new Response(new Blob([crudo]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
        else throw new Error('Compresión no soportada en ' + nombre);
      }
      p += 46 + lNom + lExtra + lCom;
    }
    return out;
  }

  A.zip = { crear, leer, crc32 };
})(window.Atril);
