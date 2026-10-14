/* Atril — «Escuchar»: el micrófono escucha lo que tocas (todo en el aparato, sin conexión) y hace un informe */
(function (A) {
  'use strict';
  const { u, DB, modelo } = A;

  /*
   * Cómo escucha
   * ------------
   * Cada 50 ms mira el sonido del micrófono:
   *  - el nivel (¿está sonando o hay silencio?), con un umbral que se adapta al ruido de la habitación;
   *  - los ataques de las notas (subidas bruscas de nivel), para ver si el pulso es regular;
   *  - la altura (YIN, como el afinador), para ver si las notas están afinadas.
   * No guarda el sonido (salvo que se pida grabar): solo un resumen por segundo, así que
   * aunque toques media hora seguida ocupa muy poco.
   *
   * Un silencio de 2 s o más entre dos trozos tocados es una PARADA; uno de 0,8 a 2 s, una DUDA.
   */
  const PASO = 50;            // ms entre análisis
  const PARADA = 2.0;         // s de silencio que cuentan como parada
  const DUDA = 0.8;           // s de silencio que cuentan como duda
  const TOL_AFIN = 20;        // cents de tolerancia para dar una nota por afinada

  function nuevaToma(o) {
    return {
      obraId: o.obraId || null, seccionId: o.seccionId || null, pasajeId: o.pasajeId || null,
      desde: o.desde || null, hasta: o.hasta || null, modo: o.modo || 'normal',   // normal · lectura · concierto
      inicio: Date.now(), fin: null, dur: 0, tocando: 0,
      paradas: [], dudas: [], marcas: [], seg: [],      // seg: un resumen por segundo [sonido 0-10, notas afinadas, notas medidas, ataques]
      grabacionId: null, notas: ''
    };
  }

  /**
   * Motor de escucha. motor.empezar({grabar}) → promesa; motor.marcar(); motor.parar() → toma con métricas.
   * motor.on(f) recibe {t, nivel, sonando, paradas, dudas} unas 4 veces por segundo para pintar en vivo.
   */
  function crearMotor(datos) {
    const toma = nuevaToma(datos);
    let stream = null, fuente = null, an = null, buf = null, timer = 0, rec = null, trozos = [], tipoRec = '';
    let t0 = 0, n = 0;
    let suelo = null, nivelLento = 0;               // ruido de fondo y nivel suavizado
    let sonando = false, ultimoSonido = -1, silencioDesde = 0, empezado = false;
    const recientes = [];                           // niveles de los últimos pasos (para los ataques)
    let ultimoAtaque = -1;
    const ataques = [];
    let binActual = null;
    const oyentes = new Set();
    let la = 442;

    function nuevoBin() { binActual = [0, 0, 0, 0]; toma.seg.push(binActual); }

    function paso() {
      if (!an) return;
      const t = (performance.now() - t0) / 1000;
      if (Math.floor(t) >= toma.seg.length) nuevoBin();
      an.getFloatTimeDomainData(buf);
      let s2 = 0;
      for (let i = 0; i < buf.length; i++) s2 += buf[i] * buf[i];
      const rms = Math.sqrt(s2 / buf.length);
      // ruido de fondo: el mínimo reciente, que sube muy despacio
      if (suelo === null) suelo = rms;
      suelo = rms < suelo ? rms : suelo * 1.0015 + 1e-7;
      const umbral = Math.max(suelo * 3.2, 0.006);
      nivelLento = nivelLento * 0.7 + rms * 0.3;
      const ahoraSuena = nivelLento > umbral;
      n++;
      if (ahoraSuena) {
        binActual[0]++;
        toma.tocando += PASO / 1000;
        if (!sonando && empezado) {
          // vuelve a sonar tras un silencio: ¿parada, duda o respiración?
          const sil = t - silencioDesde;
          if (sil >= PARADA) toma.paradas.push([Math.round(silencioDesde * 10) / 10, Math.round(sil * 10) / 10]);
          else if (sil >= DUDA) toma.dudas.push([Math.round(silencioDesde * 10) / 10, Math.round(sil * 10) / 10]);
        }
        sonando = true; empezado = true; ultimoSonido = t;
        // ataque: subida brusca de nivel
        const prev = recientes.length ? recientes.reduce((a, x) => a + x, 0) / recientes.length : 0;
        if (rms > prev * 1.7 && rms > umbral * 1.4 && t - ultimoAtaque > 0.09) { ataques.push(t); ultimoAtaque = t; binActual[3]++; }
        // altura, en uno de cada dos pasos (es lo que más cuesta)
        if (n % 2 === 0 && t - ultimoAtaque > 0.06) {
          const r = A.pitch.yin(A.pitch.diezmar(buf), A.audio.contexto().sampleRate / 2, 38, 1400);
          if (r && r.claridad > 0.88) {
            const m = Math.round(A.pitch.midiDeFrec(r.f, la));
            const cents = 1200 * Math.log2(r.f / A.pitch.frecMidi(m, la));
            binActual[2]++;
            if (Math.abs(cents) <= TOL_AFIN) binActual[1]++;
          }
        }
      } else if (sonando) {
        sonando = false; silencioDesde = t;
      }
      recientes.push(rms); if (recientes.length > 3) recientes.shift();
      if (n % 5 === 0) {
        const st = { t, nivel: Math.min(1, nivelLento / (umbral * 6)), sonando: ahoraSuena, paradas: toma.paradas.length, dudas: toma.dudas.length, marcas: toma.marcas.length };
        oyentes.forEach(f => { try { f(st); } catch (e) { console.error(e); } });
      }
    }

    return {
      toma,
      on(f) { oyentes.add(f); return () => oyentes.delete(f); },
      segundos: () => (t0 ? (performance.now() - t0) / 1000 : 0),
      async empezar(o = {}) {
        la = await A.la.get();
        try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }); }
        catch (e) { throw new Error('No se pudo usar el micrófono: revisa los permisos'); }
        const c = A.audio.contexto();
        if (c.state === 'suspended') try { await c.resume(); } catch (e) {}
        fuente = c.createMediaStreamSource(stream);
        an = c.createAnalyser(); an.fftSize = 2048;
        fuente.connect(an);
        buf = new Float32Array(an.fftSize);
        if (o.grabar && window.MediaRecorder) {
          const tipos = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
          tipoRec = tipos.find(t => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
          try {
            rec = new MediaRecorder(stream, Object.assign(tipoRec ? { mimeType: tipoRec } : {}, { audioBitsPerSecond: 48000 }));
            rec.ondataavailable = ev => ev.data && ev.data.size && trozos.push(ev.data);
            rec.start(5000);
          } catch (e) { rec = null; }
        }
        t0 = performance.now();
        nuevoBin();
        timer = setInterval(paso, PASO);
      },
      /** Marca el momento actual (⚑ «aquí ha pasado algo») */
      marcar() {
        const t = Math.round(this.segundos() * 10) / 10;
        toma.marcas.push(t);
        return t;
      },
      async parar() {
        clearInterval(timer); timer = 0;
        const total = this.segundos();
        let blob = null;
        if (rec && rec.state !== 'inactive') {
          const fin = new Promise(res => (rec.onstop = res));
          rec.stop(); await fin;
          blob = new Blob(trozos, { type: rec.mimeType || tipoRec || 'audio/webm' });
        }
        try { fuente.disconnect(); } catch (e) {}
        if (stream) stream.getTracks().forEach(t => t.stop());
        an = null;
        toma.fin = Date.now();
        // el silencio del final no cuenta: se recorta la duración hasta el último sonido (más 1 s)
        toma.dur = Math.round(Math.min(total, ultimoSonido >= 0 ? ultimoSonido + 1 : total) * 10) / 10;
        toma.durTotal = Math.round(total * 10) / 10;
        toma.tocando = Math.round(toma.tocando * 10) / 10;
        toma.metricas = metricas(toma, ataques);
        Object.assign(toma, puntuar(toma));
        return { toma, blob };
      },
      cancelar() {
        clearInterval(timer);
        try { if (rec && rec.state !== 'inactive') rec.stop(); } catch (e) {}
        try { fuente.disconnect(); } catch (e) {}
        if (stream) stream.getTracks().forEach(t => t.stop());
        an = null;
      }
    };
  }

  /** Métricas de una toma: continuidad, afinación y pulso (0–100; null si no hay datos suficientes) */
  function metricas(toma, ataques) {
    // paradas por minuto (las dudas cuentan un cuarto); en tomas cortas se cuenta como si fuera un minuto
    const min = Math.max(1, toma.dur / 60);
    const porMin = (toma.paradas.length + 0.25 * toma.dudas.length) / min;
    const continuidad = toma.tocando < 3 ? null : Math.round(100 * Math.exp(-0.35 * porMin));
    let medidas = 0, afinadas = 0;
    toma.seg.forEach(b => { medidas += b[2]; afinadas += b[1]; });
    const afinacion = medidas >= 20 ? Math.round(afinadas / medidas * 100) : null;
    // pulso: los intervalos entre ataques se comparan con el más habitual (y sus mitades, dobles…)
    let pulso = null;
    if (ataques && ataques.length >= 12) {
      const iois = [];
      const cortes = toma.paradas.concat(toma.dudas).map(p => [p[0], p[0] + p[1]]);
      for (let i = 1; i < ataques.length; i++) {
        const d = ataques[i] - ataques[i - 1];
        if (d < 0.09 || d > 2) continue;
        if (cortes.some(([a, b]) => ataques[i - 1] <= b && ataques[i] >= a)) continue;
        iois.push(d);
      }
      if (iois.length >= 10) {
        const ord = iois.slice().sort((a, b) => a - b);
        const med = ord[ord.length >> 1];
        const RAZ = [0.5, 1, 1.5, 2, 3];
        const dev = iois.map(d => Math.min(...RAZ.map(r => Math.abs(Math.log2(d / med / r)))));
        const media = dev.reduce((a, x) => a + x, 0) / dev.length;
        pulso = Math.round(100 * u.clamp(1 - media / 0.22, 0, 1));
      }
    }
    return { continuidad, afinacion, pulso };
  }

  /** Puntuación: en lectura, «fluidez»; en el resto, «confianza» */
  function puntuar(toma) {
    const m = toma.metricas || {};
    const pesos = toma.modo === 'lectura' ? { continuidad: 0.65, pulso: 0.35, afinacion: 0 } : { continuidad: 0.5, afinacion: 0.25, pulso: 0.25 };
    let suma = 0, peso = 0;
    Object.entries(pesos).forEach(([k, w]) => { if (w && m[k] != null) { suma += m[k] * w; peso += w; } });
    return { puntuacion: peso ? Math.round(suma / peso) : null, medida: toma.modo === 'lectura' ? 'fluidez' : 'confianza' };
  }

  /* ----------------------------- consultas (fase 2) ----------------------------- */
  /** Media ponderada de las últimas escuchas (la más reciente pesa más) */
  function mediaReciente(tomas) {
    const l = tomas.filter(t => t.puntuacion != null).sort((a, b) => b.inicio - a.inicio).slice(0, 3);
    if (!l.length) return null;
    const w = [3, 2, 1];
    let s = 0, p = 0;
    l.forEach((t, i) => { s += t.puntuacion * w[i]; p += w[i]; });
    return Math.round(s / p);
  }
  /** Confianza (o fluidez, en lectura) de una sección según sus escuchas */
  function deSeccion(sec, tomas) {
    const lectura = modelo.faseDe(sec) === 'lectura';
    const mias = tomas.filter(t => t.seccionId === sec.id && t.modo !== 'concierto' && (t.modo === 'lectura') === lectura);
    const v = mediaReciente(mias);
    return v == null ? null : { valor: v, medida: lectura ? 'fluidez' : 'confianza', n: mias.length, ultima: Math.max(...mias.map(t => t.inicio)) };
  }
  function dePasaje(p, tomas) {
    const mias = tomas.filter(t => t.pasajeId === p.id);
    const v = mediaReciente(mias);
    return v == null ? null : { valor: v, medida: 'confianza', n: mias.length };
  }
  /** Color de una puntuación (rojo → verde) */
  function color(v) {
    if (v == null) return 'var(--tinta-3)';
    return v < 40 ? '#FF5A5F' : v < 60 ? '#FF8A3D' : v < 80 ? '#F5B400' : '#22C27A';
  }
  function texto(v) {
    if (v == null) return '—';
    return v < 40 ? 'Insegura' : v < 60 ? 'Con dudas' : v < 80 ? 'Bastante segura' : 'Muy segura';
  }
  /** Estrellas para el modo sencillo */
  const estrellas = v => (v == null ? 0 : Math.max(1, Math.round(v / 20)));

  const deObra = obraId => DB.byIndex('tomas', 'obraId', obraId);

  A.escuchar = { crearMotor, metricas, puntuar, deSeccion, dePasaje, mediaReciente, color, texto, estrellas, deObra, PARADA, DUDA, TOL_AFIN };
})(window.Atril);
