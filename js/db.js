/* Atril — almacenamiento local (IndexedDB) */
(function (A) {
  'use strict';

  const NOMBRE = 'atril';
  const VERSION = 3;
  const STORES = {
    obras: [],
    secciones: ['obraId'],
    sesiones: ['obraId', 'inicio'],
    tempos: ['seccionId'],
    grabaciones: ['obraId'],
    fotos: ['seccionId', 'obraId'],
    pistas: [],
    kv: []
  };

  const BINARIOS = ['fotos', 'grabaciones', 'pistas'];
  let dbp = null;
  function abrir() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(NOMBRE, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const [nombre, indices] of Object.entries(STORES)) {
          if (db.objectStoreNames.contains(nombre)) continue;
          const st = db.createObjectStore(nombre, { keyPath: 'id' });
          indices.forEach(i => st.createIndex(i, i));
        }
        // v2: la grabación puede ir asociada a una sección
        const tg = req.transaction.objectStore('grabaciones');
        if (!tg.indexNames.contains('seccionId')) tg.createIndex('seccionId', 'seccionId');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }

  function prom(req) {
    return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
  }
  const enCurso = new Set();
  async function tx(store, modo, fn) {
    const db = await abrir();
    const t = db.transaction(store, modo);
    const fin = new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
    if (modo === 'readwrite') { enCurso.add(fin); fin.then(() => enCurso.delete(fin), () => enCurso.delete(fin)); }
    const r = await fn(t.objectStore(store));
    await fin;
    return r;
  }

  const listeners = new Set();
  function avisar(store) { listeners.forEach(f => { try { f(store); } catch (e) { console.error(e); } }); }

  const DB = {
    /** Espera a que terminen todas las escrituras pendientes */
    esperar: () => Promise.allSettled([...enCurso]),
    all: store => tx(store, 'readonly', s => prom(s.getAll())),
    get: (store, id) => tx(store, 'readonly', s => prom(s.get(id))),
    byIndex: (store, indice, valor) => tx(store, 'readonly', s => prom(s.index(indice).getAll(valor))),
    async put(store, obj) {
      if (!obj.id) obj.id = A.u.uid();
      await tx(store, 'readwrite', s => prom(s.put(obj)));
      avisar(store);
      return obj;
    },
    async del(store, id) {
      await tx(store, 'readwrite', s => prom(s.delete(id)));
      avisar(store);
    },
    async kvGet(clave, def) {
      const r = await DB.get('kv', clave);
      return r ? r.valor : def;
    },
    async kvSet(clave, valor) {
      await tx('kv', 'readwrite', s => prom(s.put({ id: clave, valor })));
      avisar('kv');
    },
    alCambiar(f) { listeners.add(f); return () => listeners.delete(f); },

    /** Borra una obra con todo lo que cuelga de ella */
    async borrarObra(id) {
      const secs = await DB.byIndex('secciones', 'obraId', id);
      for (const s of secs) {
        const ts = await DB.byIndex('tempos', 'seccionId', s.id);
        for (const t of ts) await DB.del('tempos', t.id);
        await DB.del('secciones', s.id);
      }
      for (const g of await DB.byIndex('grabaciones', 'obraId', id)) await DB.del('grabaciones', g.id);
      for (const f of await DB.byIndex('fotos', 'obraId', id)) await DB.del('fotos', f.id);
      for (const se of await DB.byIndex('sesiones', 'obraId', id)) {
        se.obraId = null; se.seccionId = null; await DB.put('sesiones', se);
      }
      await DB.del('obras', id);
    },

    /** Borra una sección con sus tempos y fotos (las sesiones se conservan) */
    async borrarSeccion(id) {
      for (const t of await DB.byIndex('tempos', 'seccionId', id)) await DB.del('tempos', t.id);
      for (const f of await DB.byIndex('fotos', 'seccionId', id)) await DB.del('fotos', f.id);
      await DB.del('secciones', id);
    },

    /**
     * Copia de seguridad completa en .zip: datos.json + fotos/ + grabaciones/
     */
    async exportarZip() {
      const out = { app: 'Atril', version: 2, fecha: new Date().toISOString(), datos: {} };
      const archivos = [];
      for (const st of Object.keys(STORES)) {
        const filas = await DB.all(st);
        if (BINARIOS.includes(st)) {
          out.datos[st] = filas.map(f => {
            const { blob, ...meta } = f;
            const ext = st === 'fotos' ? '.jpg' : '.' + ((blob && blob.type.split('/')[1]) || 'bin').replace('mpeg', 'mp3').replace(/;.*/, '');
            meta.archivo = st + '/' + f.id + ext;
            meta.tipo = blob ? blob.type : '';
            if (blob) archivos.push({ nombre: meta.archivo, datos: blob });
            return meta;
          });
        } else out.datos[st] = filas;
      }
      out.datos.kv = out.datos.kv.filter(k => k.id !== 'sesionActiva');
      archivos.unshift({ nombre: 'datos.json', datos: new Blob([JSON.stringify(out)], { type: 'application/json' }) });
      return A.zip.crear(archivos);
    },

    /** Importa una copia: objeto JSON (copias antiguas) o ArrayBuffer de un .zip */
    async importar(entrada, reemplazar) {
      let json = entrada, binarios = {};
      if (entrada instanceof ArrayBuffer) {
        binarios = await A.zip.leer(entrada);
        if (!binarios['datos.json']) throw new Error('El .zip no contiene datos.json');
        json = JSON.parse(new TextDecoder().decode(binarios['datos.json']));
      }
      if (!json || json.app !== 'Atril' || !json.datos) throw new Error('El fichero no es una copia de Atril');
      for (const st of Object.keys(STORES)) {
        let filas = json.datos[st] || [];
        const esBinario = BINARIOS.includes(st);
        if (esBinario) {
          filas = filas.filter(f => f.archivo && binarios[f.archivo]).map(f => {
            const { archivo, tipo, ...resto } = f;
            resto.blob = new Blob([binarios[archivo]], { type: tipo || (st === 'fotos' ? 'image/jpeg' : 'audio/webm') });
            return resto;
          });
          if (!filas.length && !reemplazar) continue;
          if (!filas.length && !(entrada instanceof ArrayBuffer)) continue; // una copia .json antigua no toca fotos ni audios
        }
        await tx(st, 'readwrite', async s => {
          if (reemplazar) await prom(s.clear());
          for (const f of filas) s.put(f);
        });
      }
      avisar('*');
    },

    /** Borra todo, incluidas fotos y grabaciones */
    async borrarTodo() {
      for (const st of Object.keys(STORES)) await tx(st, 'readwrite', s => prom(s.clear()));
      avisar('*');
    }
  };

  A.DB = DB;
})(window.Atril);
