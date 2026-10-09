/* Atril — motor de audio: sonidos del metrónomo, metrónomo web, nota pedal y tonos de referencia */
(function (A) {
  'use strict';

  // iPhone: para usar el micrófono (afinador, grabadora) la sesión de audio debe ser de grabación
  if (navigator.audioSession && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    const pedir = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = c => {
      if (c && c.audio) { try { navigator.audioSession.type = 'play-and-record'; } catch (e) {} }
      return pedir(c);
    };
  }

  let ctx = null;
  function contexto() {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      // iPhone: que el metrónomo suene aunque el interruptor de silencio esté puesto
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
      ctx = new C({ latencyHint: 'interactive' });
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /* ------------------------------------------------------------------
   * Síntesis de los golpes del metrónomo.
   * Niveles: 3 = fuerte (acento), 2 = normal, 1 = suave, 'sub' = subdivisión.
   * La misma receta está replicada en el plugin nativo de Android
   * (MotorMetronomo.java) para que suene igual en el PC y en el móvil.
   * ------------------------------------------------------------------ */
  const SONIDOS = {
    clic: { nombre: 'Clic', f: { 3: 1760, 2: 1100, 1: 1100, sub: 880 }, dur: 0.025, tipo: 'seno' },
    madera: { nombre: 'Madera', f: { 3: 1250, 2: 900, 1: 900, sub: 700 }, dur: 0.045, tipo: 'madera' },
    bip: { nombre: 'Bip', f: { 3: 2093, 2: 1568, 1: 1568, sub: 1175 }, dur: 0.05, tipo: 'cuadrada' },
    baqueta: { nombre: 'Baqueta', f: { 3: 3200, 2: 2600, 1: 2600, sub: 2200 }, dur: 0.02, tipo: 'ruido' }
  };
  const GANANCIA_NIVEL = { 3: 1.0, 2: 0.72, 1: 0.38, sub: 0.32 };

  function sintetizar(sonido, nivel, sr) {
    const s = SONIDOS[sonido] || SONIDOS.clic;
    const f = s.f[nivel], n = Math.floor(s.dur * sr), out = new Float32Array(n);
    const g = GANANCIA_NIVEL[nivel];
    let semilla = 12345;
    const ruido = () => { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; return semilla / 0x3fffffff - 1; };
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const env = Math.exp(-t / (s.dur / 5)) * Math.min(1, i / (sr * 0.0008));
      let v;
      switch (s.tipo) {
        case 'madera':
          v = 0.75 * Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(2 * Math.PI * f * 2.76 * t) * Math.exp(-t / 0.004);
          break;
        case 'cuadrada':
          v = 0.55 * Math.sign(Math.sin(2 * Math.PI * f * t)) * 0.6 + 0.4 * Math.sin(2 * Math.PI * f * t);
          break;
        case 'ruido':
          lp += 0.35 * (ruido() - lp);
          v = 0.6 * Math.sin(2 * Math.PI * f * t) + 0.9 * lp;
          break;
        default:
          v = Math.sin(2 * Math.PI * f * t);
      }
      out[i] = v * env * g * 0.9;
    }
    return out;
  }

  const cacheBuf = {};
  function buffer(sonido, nivel) {
    const c = contexto();
    const k = sonido + '|' + nivel + '|' + c.sampleRate;
    if (!cacheBuf[k]) {
      const datos = sintetizar(sonido, nivel, c.sampleRate);
      const b = c.createBuffer(1, datos.length, c.sampleRate);
      b.copyToChannel(datos, 0);
      cacheBuf[k] = b;
    }
    return cacheBuf[k];
  }

  /* ------------------------------------------------------------------
   * Reloj en un Worker: los temporizadores de un Worker no se ralentizan
   * tanto como los de la página cuando la pestaña queda en segundo plano.
   * ------------------------------------------------------------------ */
  function crearReloj(ms, fn) {
    try {
      const src = 'let t=null;onmessage=e=>{if(e.data==="start"){clearInterval(t);t=setInterval(()=>postMessage(0),' + ms + ');}else{clearInterval(t);t=null;}};';
      const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      w.onmessage = fn;
      return { start: () => w.postMessage('start'), stop: () => w.postMessage('stop') };
    } catch (e) {
      let t = null;
      return { start: () => { clearInterval(t); t = setInterval(fn, ms); }, stop: () => { clearInterval(t); t = null; } };
    }
  }

  /* ------------------------------------------------------------------
   * Metrónomo web (planificación por adelantado sobre el reloj de audio)
   * ------------------------------------------------------------------ */
  function MetronomoWeb() {
    this.cfg = null;
    this.activo = false;
    this.cola = [];
    this.ev = {};
    this.reloj = crearReloj(25, () => this._planificar());
    this._raf = this._raf.bind(this);
  }
  MetronomoWeb.prototype = {
    on(ev, fn) { this.ev[ev] = fn; },
    _emit(ev, d) { if (this.ev[ev]) this.ev[ev](d); },

    iniciar(cfg) {
      const c = contexto();
      this.cfg = JSON.parse(JSON.stringify(cfg));
      this.bpm = cfg.entrenador && cfg.entrenador.activo ? cfg.entrenador.desde : cfg.bpm;
      this.pulso = 0; this.sub = 0; this.compas = 0;
      this.siguiente = c.currentTime + 0.08;
      this.inicio = this.siguiente;
      this.cola = [];
      this.activo = true;
      this.master = c.createGain();
      this.master.gain.value = this.cfg.volumen;
      this.master.connect(c.destination);
      this._emit('tempo', this.bpm);
      this.reloj.start();
      this._planificar();
      requestAnimationFrame(this._raf);
    },
    actualizar(cfg) {
      if (!this.activo) return;
      const antes = this.cfg;
      this.cfg = JSON.parse(JSON.stringify(cfg));
      if (this.master) this.master.gain.value = this.cfg.volumen;
      const entrena = cfg.entrenador && cfg.entrenador.activo;
      if (!entrena && cfg.bpm !== antes.bpm) { this.bpm = cfg.bpm; this._emit('tempo', this.bpm); }
      if (entrena && (!antes.entrenador || !antes.entrenador.activo)) { this.bpm = cfg.entrenador.desde; this._emit('tempo', this.bpm); }
      if (this.pulso >= cfg.num) { this.pulso = 0; this.sub = 0; }
      if (this.sub >= cfg.subdiv) { this.sub = 0; }
    },
    parar() {
      if (!this.activo) return;
      this.activo = false;
      this.reloj.stop();
      const m = this.master;
      if (m) { try { m.gain.setTargetAtTime(0, contexto().currentTime, 0.01); setTimeout(() => m.disconnect(), 200); } catch (e) {} }
      this.cola = [];
      this._emit('fin');
    },
    _silenciado() {
      const s = this.cfg.silencio;
      if (!s || !s.activo) return false;
      const ciclo = s.tocar + s.callar;
      return ciclo > 0 && (this.compas % ciclo) >= s.tocar;
    },
    _planificar() {
      if (!this.activo) return;
      const c = contexto();
      while (this.siguiente < c.currentTime + 0.12) {
        this._nota(this.siguiente);
        this._avanzar();
        if (!this.activo) return;
      }
    },
    _nota(t) {
      const ac = this.cfg.acentos[this.pulso] ?? 2;
      let nivel = this.sub === 0 ? ac : (ac === 0 ? 0 : 'sub');
      const mudo = this._silenciado();
      if (nivel && !mudo) {
        const c = contexto();
        const src = c.createBufferSource();
        src.buffer = buffer(this.cfg.sonido, nivel);
        src.connect(this.master);
        src.start(t);
      }
      this.cola.push({ t, pulso: this.pulso, sub: this.sub, compas: this.compas, nivel, mudo });
    },
    _avanzar() {
      this.siguiente += 60 / this.bpm / this.cfg.subdiv;
      this.sub++;
      if (this.sub >= this.cfg.subdiv) {
        this.sub = 0;
        this.pulso++;
        if (this.pulso >= this.cfg.num) {
          this.pulso = 0;
          this.compas++;
          this._finCompas();
        }
      }
    },
    _finCompas() {
      const e = this.cfg.entrenador;
      if (e && e.activo && e.cadaCompases > 0 && this.compas % e.cadaCompases === 0) {
        const sube = e.hasta >= e.desde;
        let nb = this.bpm + (sube ? 1 : -1) * Math.abs(e.paso);
        nb = sube ? Math.min(e.hasta, nb) : Math.max(e.hasta, nb);
        if (nb !== this.bpm) { this.bpm = nb; this._emit('tempo', nb); }
      }
      const lim = this.cfg.limiteMin;
      if (lim > 0 && this.siguiente - this.inicio >= lim * 60) {
        const fin = this.siguiente;
        setTimeout(() => this.parar(), Math.max(0, (fin - contexto().currentTime) * 1000));
        this.reloj.stop();
        this.activo = 'terminando';
      }
    },
    _raf() {
      if (!this.activo) return;
      const ahora = contexto().currentTime;
      while (this.cola.length && this.cola[0].t <= ahora) {
        this._emit('tick', this.cola.shift());
      }
      requestAnimationFrame(this._raf);
    }
  };
  // 'terminando' cuenta como activo para el bucle visual, pero no planifica más
  const _plan = MetronomoWeb.prototype._planificar;
  MetronomoWeb.prototype._planificar = function () { if (this.activo === true) _plan.call(this); };

  /* ------------------------------------------------------------------
   * Fachada: usa el metrónomo nativo de Android si existe, si no el web.
   * ------------------------------------------------------------------ */
  function pluginNativo() {
    return (A.nativo && A.nativo.Metronomo) || null;
  }

  const Metronomo = {
    ev: {},
    activo: false,
    bpmActual: null,
    nativo: false,
    _web: null,
    _subs: [],
    on(ev, fn) { (this.ev[ev] = this.ev[ev] || new Set()).add(fn); return () => this.ev[ev].delete(fn); },
    _emit(ev, d) { (this.ev[ev] || []).forEach(f => { try { f(d); } catch (e) { console.error(e); } }); },

    async iniciar(cfg) {
      if (this.activo) await this.parar();
      const p = pluginNativo();
      this.activo = true;
      this.nativo = !!p;
      if (p) {
        this._subs.push(await p.addListener('tick', d => this._emit('tick', d)));
        this._subs.push(await p.addListener('tempo', d => { this.bpmActual = d.bpm; this._emit('tempo', d.bpm); }));
        this._subs.push(await p.addListener('fin', () => this._fin()));
        await p.iniciar({ cfg });
      } else {
        if (!this._web) {
          this._web = new MetronomoWeb();
          this._web.on('tick', d => this._emit('tick', d));
          this._web.on('tempo', b => { this.bpmActual = b; this._emit('tempo', b); });
          this._web.on('fin', () => this._fin());
        }
        this._web.iniciar(cfg);
        A.u.pantallaEncendida(true, 'metronomo');
      }
      this._emit('estado', true);
    },
    async actualizar(cfg) {
      if (!this.activo) return;
      const p = pluginNativo();
      if (p) await p.actualizar({ cfg }); else this._web.actualizar(cfg);
    },
    async parar() {
      if (!this.activo) return;
      const p = pluginNativo();
      if (p) await p.parar(); else this._web.parar();
      this._fin();
    },
    _fin() {
      if (!this.activo) return;
      this.activo = false;
      this._subs.forEach(s => s && s.remove && s.remove());
      this._subs = [];
      A.u.pantallaEncendida(false, 'metronomo');
      this._emit('estado', false);
    }
  };

  /* ------------------------------------------------------------------
   * Nota pedal (drone) y tonos de referencia
   * ------------------------------------------------------------------ */
  function onda(c, tipo) {
    if (tipo === 'organo') {
      const re = new Float32Array([0, 1, 0.5, 0.33, 0.25, 0.12, 0.1, 0.05]);
      return c.createPeriodicWave(re, new Float32Array(re.length));
    }
    if (tipo === 'cuerda') {
      const n = 16, re = new Float32Array(n);
      for (let i = 1; i < n; i++) re[i] = 1 / i * (i % 2 ? 1 : 0.6);
      return c.createPeriodicWave(re, new Float32Array(n));
    }
    return null;
  }

  function Pedal() { this.voces = []; this.salida = null; }
  Pedal.prototype = {
    sonando() { return this.voces.length > 0; },
    tocar(frecs, tipo, vol) {
      this.parar(true);
      const c = contexto();
      this.salida = c.createGain();
      this.salida.gain.setValueAtTime(0, c.currentTime);
      this.salida.gain.linearRampToValueAtTime(vol, c.currentTime + 0.15);
      this.salida.connect(c.destination);
      const w = onda(c, tipo);
      frecs.forEach((f, i) => {
        const o = c.createOscillator();
        if (w) o.setPeriodicWave(w); else o.type = 'sine';
        o.frequency.value = f;
        const g = c.createGain();
        g.gain.value = (i === 0 ? 1 : 0.6) / frecs.length;
        o.connect(g); g.connect(this.salida);
        o.start();
        this.voces.push(o);
      });
    },
    volumen(v) { if (this.salida) this.salida.gain.setTargetAtTime(v, contexto().currentTime, 0.05); },
    frecuencias(frecs) {
      this.voces.forEach((o, i) => { if (frecs[i]) o.frequency.setTargetAtTime(frecs[i], contexto().currentTime, 0.02); });
    },
    parar(rapido) {
      if (!this.voces.length) return;
      const c = contexto(), s = this.salida, vs = this.voces;
      s.gain.cancelScheduledValues(c.currentTime);
      s.gain.setTargetAtTime(0, c.currentTime, rapido ? 0.01 : 0.08);
      setTimeout(() => { vs.forEach(o => { try { o.stop(); } catch (e) {} }); s.disconnect(); }, rapido ? 80 : 500);
      this.voces = []; this.salida = null;
    }
  };

  /** Tono breve de referencia (p. ej. una cuerda del afinador) */
  function tono(f, seg = 1.8, tipo = 'cuerda') {
    const c = contexto();
    const o = c.createOscillator(), g = c.createGain();
    const w = onda(c, tipo);
    if (w) o.setPeriodicWave(w);
    o.frequency.value = f;
    g.gain.setValueAtTime(0, c.currentTime);
    g.gain.linearRampToValueAtTime(0.35, c.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + seg);
    o.connect(g); g.connect(c.destination);
    o.start(); o.stop(c.currentTime + seg + 0.05);
  }

  A.audio = { contexto, SONIDOS, sintetizar, buffer, Metronomo, Pedal, tono, pluginNativo };
})(window.Atril);
