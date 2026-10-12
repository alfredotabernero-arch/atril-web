/* Atril — voz de la respiración guiada: «Inspira», «Mantén», «Espira» y la cuenta.
 * Usa las grabaciones propias (Ajustes › Voz de la respiración) y, para lo que no esté grabado,
 * la voz del aparato: en Android, el plugin nativo «Voz»; en el PC, el iPhone y el navegador, speechSynthesis.
 * Mientras habla, la música y los sonidos de Relajación bajan un poco. */
(function (A) {
  'use strict';
  const { DB } = A;

  const PALABRAS = [
    { id: 'inspira', texto: 'Inspira' }, { id: 'manten', texto: 'Mantén' }, { id: 'espira', texto: 'Espira' },
    { id: 'n2', texto: 'Dos' }, { id: 'n3', texto: 'Tres' }, { id: 'n4', texto: 'Cuatro' }, { id: 'n5', texto: 'Cinco' },
    { id: 'n6', texto: 'Seis' }, { id: 'n7', texto: 'Siete' }, { id: 'n8', texto: 'Ocho' }
  ];
  const NUMEROS = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez'];
  const DEF = { voz: true, contar: false, propias: true, velocidad: 0.8 };

  let cfg = Object.assign({}, DEF);
  let cargada = false;
  const buffers = {};       // id → AudioBuffer de la grabación propia
  let sonando = null;       // fuente de la grabación que suena
  let vozNav = null;

  async function cargar() {
    if (cargada) return cfg;
    cfg = Object.assign({}, DEF, await DB.kvGet('vozResp', {}));
    cargada = true;
    return cfg;
  }
  async function guardar(cambios) { await cargar(); Object.assign(cfg, cambios); await DB.kvSet('vozResp', cfg); return cfg; }

  /* ---------- grabaciones propias ---------- */
  async function grabaciones() { return DB.all('voces'); }
  async function buffer(id) {
    if (buffers[id] !== undefined) return buffers[id];
    const g = await DB.get('voces', id);
    if (!g || !g.blob) { buffers[id] = null; return null; }
    try { buffers[id] = await A.audio.contexto().decodeAudioData(await g.blob.arrayBuffer()); }
    catch (e) { buffers[id] = null; }
    return buffers[id];
  }
  async function guardarGrabacion(id, blob) {
    delete buffers[id];
    await DB.put('voces', { id, blob, tipo: blob.type, fecha: Date.now() });
  }
  async function borrarGrabacion(id) { delete buffers[id]; await DB.del('voces', id); }
  DB.alCambiar(st => { if (st === 'voces' || st === '*') Object.keys(buffers).forEach(k => delete buffers[k]); });

  function tocarBuffer(b) {
    return new Promise(res => {
      const ctx = A.audio.contexto();
      const s = ctx.createBufferSource(); s.buffer = b;
      const g = ctx.createGain(); g.gain.value = 1;
      s.connect(g); g.connect(ctx.destination);
      s.onended = () => { if (sonando === s) sonando = null; res(); };
      if (sonando) try { sonando.stop(); } catch (e) {}
      sonando = s; s.start();
    });
  }

  /* ---------- voz del aparato ---------- */
  function elegirVozNavegador() {
    if (!window.speechSynthesis) return null;
    const vs = speechSynthesis.getVoices().filter(v => /^es/i.test(v.lang));
    if (!vs.length) return null;
    const puntos = v => (/es[-_]ES/i.test(v.lang) ? 4 : 0) + (v.localService ? 2 : 0) + (/natural|neural|helena|laura|elvira|m[oó]nica|paulina/i.test(v.name) ? 1 : 0);
    return vs.sort((a, b) => puntos(b) - puntos(a))[0];
  }
  if (window.speechSynthesis) {
    vozNav = elegirVozNavegador();
    speechSynthesis.addEventListener && speechSynthesis.addEventListener('voiceschanged', () => (vozNav = elegirVozNavegador()));
  }
  function disponibleAparato() { return !!((A.nativo && A.nativo.Voz) || (window.speechSynthesis && window.SpeechSynthesisUtterance)); }

  function decirAparato(texto) {
    const V = A.nativo && A.nativo.Voz;
    if (V) return V.decir({ texto, velocidad: cfg.velocidad, tono: 0.92 }).catch(() => {});
    if (!window.speechSynthesis) return Promise.resolve();
    return new Promise(res => {
      speechSynthesis.cancel();
      const ut = new SpeechSynthesisUtterance(texto);
      ut.lang = 'es-ES';
      if (vozNav) ut.voice = vozNav;
      ut.rate = Math.max(0.5, cfg.velocidad + 0.05); ut.pitch = 0.9; ut.volume = 1;
      let hecho = false; const fin = () => { if (!hecho) { hecho = true; res(); } };
      ut.onend = fin; ut.onerror = fin;
      setTimeout(fin, 4000);
      speechSynthesis.speak(ut);
    });
  }

  /* ---------- decir una palabra ---------- */
  let hablando = 0;
  async function decir(id) {
    await cargar();
    const p = PALABRAS.find(x => x.id === id);
    const texto = p ? p.texto : (id.startsWith('n') ? NUMEROS[Number(id.slice(1))] || '' : id);
    if (!texto) return;
    hablando++;
    if (A.relax && A.relax.atenuar) A.relax.atenuar(true);
    try {
      const b = cfg.propias ? await buffer(id) : null;
      if (b) await tocarBuffer(b);
      else await decirAparato(texto);
    } finally {
      hablando--;
      if (!hablando && A.relax && A.relax.atenuar) A.relax.atenuar(false);
    }
  }
  function callar() {
    if (sonando) { try { sonando.stop(); } catch (e) {} sonando = null; }
    if (A.nativo && A.nativo.Voz) A.nativo.Voz.callar().catch(() => {});
    else if (window.speechSynthesis) speechSynthesis.cancel();
    hablando = 0;
    if (A.relax && A.relax.atenuar) A.relax.atenuar(false);
  }
  /** iPhone/iPad: la voz del navegador solo arranca si la primera frase sale de un toque del usuario */
  function desbloquear() {
    if (A.nativo && A.nativo.Voz) return;
    try { if (window.speechSynthesis && window.SpeechSynthesisUtterance) { const u0 = new SpeechSynthesisUtterance(' '); u0.volume = 0; speechSynthesis.speak(u0); } } catch (e) {}
    try { A.audio.contexto(); } catch (e) {}
  }

  /** Recorta el silencio del principio y del final de una grabación y la guarda como WAV (suena justo a tiempo) */
  async function recortar(blob) {
    const ctx = A.audio.contexto();
    const b = await ctx.decodeAudioData(await blob.arrayBuffer());
    const d = b.getChannelData(0), sr = b.sampleRate;
    let pico = 0; for (let i = 0; i < d.length; i++) pico = Math.max(pico, Math.abs(d[i]));
    const umbral = Math.max(0.02, pico * 0.08);
    let ini = 0, fin = d.length - 1;
    while (ini < d.length && Math.abs(d[ini]) < umbral) ini++;
    while (fin > ini && Math.abs(d[fin]) < umbral) fin--;
    ini = Math.max(0, ini - Math.round(sr * 0.04)); fin = Math.min(d.length, fin + Math.round(sr * 0.18));
    if (fin - ini < sr * 0.1) throw new Error('No se oye nada');
    const n = fin - ini, gan = pico > 0 ? Math.min(4, 0.85 / pico) : 1;   // normaliza el volumen
    const buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    const txt = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
    txt(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); txt(8, 'WAVE'); txt(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true);
    v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); txt(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) {
      // fundido de 15 ms en los extremos para que no haya chasquidos
      const f = Math.min(1, i / (sr * 0.015), (n - i) / (sr * 0.015));
      v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, d[ini + i] * gan * f)) * 0x7fff, true);
    }
    return new Blob([buf], { type: 'audio/wav' });
  }

  /** Clave de la palabra para una fase («Inspira» → inspira) o un número (3 → n3) */
  const clave = x => (typeof x === 'number' ? 'n' + x : ({ Inspira: 'inspira', 'Mantén': 'manten', Espira: 'espira' })[x] || x);

  A.voz = { desbloquear, recortar, PALABRAS, cargar, guardar, config: () => cfg, decir, callar, clave, grabaciones, guardarGrabacion, borrarGrabacion, tocarBuffer, buffer, disponibleAparato };
})(window.Atril);
