/* Atril — motor de relajación: sonidos de la naturaleza y música tranquila, todo sintetizado
 *
 * No hay ficheros de audio: cada ambiente se genera con ruido filtrado y modulado
 * (lluvia, olas, río…) y la música se compone en tiempo real con reglas sencillas,
 * así que nunca se repite igual y la app no pesa nada. Además se pueden añadir pistas
 * propias (mp3, m4a, ogg…), que se guardan en el dispositivo.
 */
(function (A) {
  'use strict';
  const { u, DB, audio } = A;

  let ctx = null, master = null, bus = null, reverb = null, musicaBus = null;
  function iniciarGrafo() {
    if (master) return;
    ctx = audio.contexto();
    master = ctx.createGain(); master.gain.value = 0.8;
    // compresor suave para que al sumar varios ambientes no sature
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 3; comp.attack.value = 0.02; comp.release.value = 0.3;
    master.connect(comp); comp.connect(ctx.destination);
    bus = ctx.createGain(); bus.connect(master);
    reverb = ctx.createConvolver(); reverb.buffer = respuestaSala(3.2);
    const envio = ctx.createGain(); envio.gain.value = 0.55;
    reverb.connect(envio); envio.connect(master);
    musicaBus = ctx.createGain(); musicaBus.gain.value = 0.7;
    musicaBus.connect(master); musicaBus.connect(reverb);
  }

  /* ---------------- utilidades de síntesis ---------------- */
  let semilla = 1;
  const rnd = () => { semilla = (semilla * 16807) % 2147483647; return (semilla - 1) / 2147483646; };
  const azar = (a, b) => a + Math.random() * (b - a);

  function respuestaSala(seg) {
    const n = Math.floor(ctx.sampleRate * seg), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6) * (i < 400 ? i / 400 : 1);
    }
    return b;
  }

  const cacheRuido = {};
  /** Ruido estéreo en bucle: blanco, rosa o marrón */
  function ruido(tipo, seg = 8) {
    const k = tipo + seg;
    if (cacheRuido[k]) return cacheRuido[k];
    const n = Math.floor(ctx.sampleRate * seg), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.random() * 2 - 1;
        if (tipo === 'rosa') {
          b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
          b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
          d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
        } else if (tipo === 'marron') {
          last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5;
        } else d[i] = w * 0.5;
      }
      // fundido de las juntas del bucle
      const f = Math.min(2000, n >> 4);
      for (let i = 0; i < f; i++) { const g = i / f; d[n - f + i] = d[n - f + i] * (1 - g) + d[i] * g; }
    }
    return (cacheRuido[k] = b);
  }

  /** Crea un buffer estéreo rellenándolo con una función (i, canal, sr) → muestra */
  function generar(seg, fn) {
    const sr = ctx.sampleRate, n = Math.floor(sr * seg), b = ctx.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) fn(b.getChannelData(c), c, sr, n);
    return b;
  }
  function bucle(buffer, destino, ganancia = 1) {
    const s = ctx.createBufferSource(); s.buffer = buffer; s.loop = true;
    const g = ctx.createGain(); g.gain.value = ganancia;
    s.connect(g); g.connect(destino);
    s.start(ctx.currentTime + Math.random() * 0.05, Math.random() * buffer.duration);
    return { fuente: s, ganancia: g, parar: () => { try { s.stop(); } catch (e) {} } };
  }
  function filtro(tipo, f, q = 0.7) { const x = ctx.createBiquadFilter(); x.type = tipo; x.frequency.value = f; x.Q.value = q; return x; }
  function cadena(...nodos) { for (let i = 0; i < nodos.length - 1; i++) nodos[i].connect(nodos[i + 1]); return nodos[nodos.length - 1]; }

  /* ---------------- truenos ----------------
   * Cada trueno se genera nuevo: un estallido seco (si está cerca) y un retumbo que rueda
   * en varios golpes y se apaga. El retumbo lleva graves, pero también medios (200–800 Hz)
   * para que se oiga en el altavoz del móvil, que apenas reproduce los graves. */
  function trueno(d, sal, vivos) {
    const sr = ctx.sampleRate;
    const dur = 5.5 + d * 3 + Math.random() * 2;
    const golpes = [];
    const k = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < k; i++) golpes.push({ t: (i === 0 ? 0 : azar(0.2, dur * 0.55)) + (d * 0.3), a: azar(0.45, 1) * (i === 0 ? 1 : 0.85), sube: azar(0.04, 0.25), cae: azar(0.6, 1.8) });
    const buf = generar(dur, (data, c, sr2, n) => {
      let marron = 0, lento = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr2;
        const w = Math.random() * 2 - 1;
        marron = (marron + 0.035 * w) / 1.035;          // grave
        lento += 0.18 * (w - lento);                      // cuerpo medio
        let env = 0;
        for (const g of golpes) {
          if (t < g.t) continue;
          const x = t - g.t;
          env += g.a * (x < g.sube ? x / g.sube : Math.exp(-(x - g.sube) / g.cae));
        }
        // final que se va apagando
        env *= Math.min(1, (dur - t) / 1.2);
        data[i] = (marron * 5 + lento * 0.55) * env;
      }
      // estallido seco cuando el rayo cae cerca
      if (d < 0.45) {
        const fuerza = 1 - d / 0.45;
        const nCrack = 2 + Math.floor(Math.random() * 3);
        for (let r = 0; r < nCrack; r++) {
          const ini = Math.floor(sr2 * (r === 0 ? 0 : azar(0.02, 0.35))), largo = Math.floor(sr2 * azar(0.08, 0.35));
          const a = (r === 0 ? 0.9 : azar(0.3, 0.7)) * fuerza;
          for (let i = 0; i < largo && ini + i < n; i++) data[ini + i] += (Math.random() * 2 - 1) * a * Math.exp(-i / (largo / 5));
        }
      }
      // normaliza: el más fuerte llega a 0,9 y los demás, en proporción a la distancia (se ajusta con la ganancia)
      let pico = 0;
      for (let i = 0; i < n; i++) { const v = Math.abs(data[i]); if (v > pico) pico = v; }
      if (pico > 0) { const f = 0.9 / pico; for (let i = 0; i < n; i++) data[i] *= f; }
    });
    const s = ctx.createBufferSource(); s.buffer = buf;
    // cuanto más lejos, más apagado (menos agudos) y más bajo
    const lp = filtro('lowpass', 900 + (1 - d) * 3500, 0.5);
    lp.frequency.setValueAtTime(900 + (1 - d) * 3500, ctx.currentTime);
    lp.frequency.exponentialRampToValueAtTime(260 + (1 - d) * 300, ctx.currentTime + 1.2);
    const cuerpo = ctx.createBiquadFilter(); cuerpo.type = 'peaking'; cuerpo.frequency.value = 320; cuerpo.Q.value = 0.8; cuerpo.gain.value = 7;
    const g = ctx.createGain(); g.gain.value = 0.6 + (1 - d) * 1.1;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) pan.pan.value = azar(-0.6, 0.6);
    s.connect(lp); lp.connect(cuerpo); cuerpo.connect(g);
    if (pan) { g.connect(pan); pan.connect(sal); } else g.connect(sal);
    s.start();
    const parar = () => { try { s.stop(); } catch (e) {} };
    vivos.add(parar);
    s.onended = () => { vivos.delete(parar); try { g.disconnect(); } catch (e) {} };
  }
  /** Avisa a la pantalla de Relajación para que destelle (intensidad 0–1) */
  const oyentesRayo = new Set();
  function relampago(d) { const f = 1 - d / 0.45; oyentesRayo.forEach(fn => { try { fn(f); } catch (e) {} }); }

  /* ---------------- AMBIENTES ----------------
   * Cada uno recibe la salida (un GainNode) y devuelve una función para pararlo. */
  const AMBIENTES = {
    lluvia: {
      nombre: 'Lluvia', emoji: '🌧️', color: '#3D7BFF',
      crear(sal) {
        const lp = filtro('lowpass', 7000), hp = filtro('highpass', 350);
        const capa = bucle(ruido('rosa'), hp, 0.95); cadena(hp, lp, sal);
        const gotas = generar(7, (d, c, sr, n) => {
          for (let k = 0; k < 7 * 90; k++) {
            const p = Math.floor(Math.random() * n), largo = Math.floor(sr * azar(0.002, 0.012)), a = azar(0.05, 0.35) * (Math.random() < 0.08 ? 2.2 : 1);
            let lp1 = 0;
            for (let i = 0; i < largo && p + i < n; i++) { lp1 += 0.5 * ((Math.random() * 2 - 1) - lp1); d[p + i] += lp1 * a * Math.exp(-i / (largo / 4)); }
          }
        });
        const bp = filtro('bandpass', 2600, 0.5); bp.connect(sal);
        const g = bucle(gotas, bp, 1.5);
        return () => { capa.parar(); g.parar(); };
      }
    },
    tormenta: {
      nombre: 'Tormenta', emoji: '⛈️', color: '#5A4FCF',
      crear(sal) {
        // la lluvia algo más baja que sola, para que los truenos destaquen
        const salLluvia = ctx.createGain(); salLluvia.gain.value = 0.7; salLluvia.connect(sal);
        const paraLluvia = AMBIENTES.lluvia.crear(salLluvia);
        // retumbo lejano de fondo, muy suave
        const fondoLp = filtro('lowpass', 220);
        const fondo = bucle(ruido('marron', 10), fondoLp, 0.5);
        const fondoG = ctx.createGain(); fondoG.gain.value = 0.12; cadena(fondoLp, fondoG, sal);
        let vivo = true, t0 = null;
        const vivos = new Set();
        const rayo = (primera) => {
          if (!vivo) return;
          // distancia: 0 = encima, 1 = muy lejos. Alterna cercanos y lejanos para que la tormenta «se mueva».
          const d = primera ? azar(0.35, 0.7) : Math.random() < 0.4 ? azar(0, 0.35) : azar(0.35, 1);
          const cercano = d < 0.45;
          // el relámpago se ve antes de oír el trueno (unos 3 s por kilómetro)
          if (cercano) relampago(d);
          const retraso = 0.15 + d * 3.2;
          setTimeout(() => { if (vivo) trueno(d, sal, vivos); }, retraso * 1000);
          t0 = setTimeout(() => rayo(false), azar(12000, 32000));
        };
        t0 = setTimeout(() => rayo(true), azar(3000, 8000));
        return () => {
          vivo = false; clearTimeout(t0);
          vivos.forEach(f => f()); vivos.clear();
          paraLluvia(); fondo.parar(); setTimeout(() => salLluvia.disconnect(), 200);
        };
      }
    },
    olas: {
      nombre: 'Olas del mar', emoji: '🌊', color: '#16B4C8',
      crear(sal) {
        // olas de ~8–12 s generadas con su propio filtro, más brillantes al romper
        const b = generar(40, (d, c, sr, n) => {
          let t = 0, lp = 0, last = 0;
          const olas = [];
          while (t < 40) { const dur = azar(8, 12.5); olas.push([t, dur, azar(0.6, 1)]); t += dur * azar(0.75, 0.95); }
          for (let i = 0; i < n; i++) {
            const s = i / sr;
            let env = 0.12;
            for (const [o, dur, a] of olas) {
              const x = (s - o) / dur;
              if (x > 0 && x < 1) env += a * (x < 0.35 ? Math.pow(x / 0.35, 2) : Math.exp(-(x - 0.35) * 4.2));
            }
            env = Math.min(1.2, env);
            const w = Math.random() * 2 - 1;
            last = (last + 0.04 * w) / 1.04;
            const k = 0.05 + env * 0.32;               // filtro que se abre con la ola
            lp += k * ((w * 0.6 + last * 3) - lp);
            d[i] = lp * env * 0.9;
          }
          const f = 4000; for (let i = 0; i < f; i++) { const g = i / f; d[n - f + i] = d[n - f + i] * (1 - g) + d[i] * g; }
        });
        const bl = bucle(b, sal, 1);
        return () => bl.parar();
      }
    },
    rio: {
      nombre: 'Arroyo', emoji: '🏞️', color: '#22C27A',
      crear(sal) {
        const b = generar(9, (d, c, sr, n) => {
          let lp = 0, m = 0.6, objetivo = 0.6;
          for (let i = 0; i < n; i++) {
            if (i % 600 === 0) objetivo = 0.35 + Math.random() * 0.75;
            m += (objetivo - m) * 0.004;
            const w = Math.random() * 2 - 1;
            lp += 0.3 * (w - lp);
            d[i] = lp * m * 0.9;
          }
          const f = 3000; for (let i = 0; i < f; i++) { const g = i / f; d[n - f + i] = d[n - f + i] * (1 - g) + d[i] * g; }
        });
        const bp = filtro('bandpass', 1100, 0.45), bp2 = filtro('peaking', 3200, 1); bp2.gain.value = 4;
        cadena(bp, bp2, sal);
        const a = bucle(b, bp, 1.6), fondo = bucle(ruido('marron', 9), sal, 0.25);
        return () => { a.parar(); fondo.parar(); };
      }
    },
    viento: {
      nombre: 'Viento', emoji: '🍃', color: '#7CC4A0',
      crear(sal) {
        const bp = filtro('bandpass', 500, 1.2), g = ctx.createGain(); g.gain.value = 0.7;
        const r = bucle(ruido('marron', 10), bp, 2.2); cadena(bp, g, sal);
        const lfo = ctx.createOscillator(), prof = ctx.createGain();
        lfo.frequency.value = 0.07; prof.gain.value = 320; lfo.connect(prof); prof.connect(bp.frequency); lfo.start();
        const lfo2 = ctx.createOscillator(), prof2 = ctx.createGain();
        lfo2.frequency.value = 0.11; prof2.gain.value = 0.35; lfo2.connect(prof2); prof2.connect(g.gain); lfo2.start();
        return () => { r.parar(); lfo.stop(); lfo2.stop(); };
      }
    },
    bosque: {
      nombre: 'Bosque', emoji: '🐦', color: '#2EA35A',
      crear(sal) {
        const paraViento = AMBIENTES.viento.crear(sal);
        const pajaros = ctx.createGain(); pajaros.gain.value = 0.5; pajaros.connect(sal);
        const especies = [
          { f: [3200, 4200], n: [3, 6], d: 0.07, sube: true },
          { f: [2200, 2900], n: [2, 3], d: 0.16, sube: false },
          { f: [4500, 6000], n: [5, 9], d: 0.04, sube: true },
          { f: [1700, 2300], n: [1, 2], d: 0.35, sube: false }
        ];
        let vivo = true;
        const canto = () => {
          if (!vivo) return;
          const e = especies[Math.floor(Math.random() * especies.length)];
          const pan = ctx.createStereoPanner(); pan.pan.value = azar(-0.9, 0.9);
          const g = ctx.createGain(); g.gain.value = azar(0.08, 0.3);
          pan.connect(g); g.connect(pajaros); g.connect(reverb);
          let t = ctx.currentTime + 0.05;
          const notas = Math.floor(azar(e.n[0], e.n[1] + 1)), base = azar(e.f[0], e.f[1]);
          for (let k = 0; k < notas; k++) {
            const o = ctx.createOscillator(), env = ctx.createGain();
            const f1 = base * azar(0.92, 1.08), f2 = f1 * (e.sube ? azar(1.15, 1.5) : azar(0.65, 0.85));
            o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(f2, t + e.d);
            env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(1, t + 0.008); env.gain.exponentialRampToValueAtTime(0.001, t + e.d);
            o.connect(env); env.connect(pan); o.start(t); o.stop(t + e.d + 0.02);
            t += e.d + azar(0.03, 0.12);
          }
          setTimeout(canto, azar(1200, 6500));
        };
        const t0 = setTimeout(canto, 600);
        return () => { vivo = false; clearTimeout(t0); paraViento(); };
      }
    },
    hoguera: {
      nombre: 'Hoguera', emoji: '🔥', color: '#FF8A3D',
      crear(sal) {
        const lp = filtro('lowpass', 700); lp.connect(sal);
        const base = bucle(ruido('marron', 8), lp, 1.1);
        const b = generar(8, (d, c, sr, n) => {
          for (let k = 0; k < 8 * 14; k++) {
            const p = Math.floor(Math.random() * n), largo = Math.floor(sr * azar(0.0008, 0.004)), a = azar(0.2, 0.9);
            for (let i = 0; i < largo && p + i < n; i++) d[p + i] += (Math.random() * 2 - 1) * a * Math.exp(-i / (largo / 3));
          }
          for (let k = 0; k < 8 * 2; k++) {
            const p = Math.floor(Math.random() * n), largo = Math.floor(sr * azar(0.01, 0.03)), a = azar(0.15, 0.4), f = azar(300, 900);
            for (let i = 0; i < largo && p + i < n; i++) d[p + i] += Math.sin(2 * Math.PI * f * i / sr) * a * Math.exp(-i / (largo / 4));
          }
        });
        const hp = filtro('highpass', 900); hp.connect(sal);
        const chasquidos = bucle(b, hp, 0.7);
        return () => { base.parar(); chasquidos.parar(); };
      }
    },
    noche: {
      nombre: 'Noche de verano', emoji: '🦗', color: '#3B2F86',
      crear(sal) {
        const b = generar(6, (d, c, sr, n) => {
          const grillos = [{ f: 4300 + c * 180, per: 0.62, fase: 0.1 + c * 0.27, a: 0.16 }, { f: 4700 - c * 120, per: 0.81, fase: 0.4, a: 0.09 }];
          for (let i = 0; i < n; i++) {
            const t = i / sr;
            let v = 0;
            for (const g of grillos) {
              const x = ((t + g.fase) % g.per) / g.per;
              if (x < 0.22) {
                const pulso = (x * 4 * 0.22 * 100) % 1; // 3–4 pulsos por trino
                if (pulso < 0.55) v += Math.sin(2 * Math.PI * g.f * t) * g.a * Math.sin(Math.PI * pulso / 0.55);
              }
            }
            d[i] = v;
          }
        });
        const g = bucle(b, sal, 1.1);
        const lp = filtro('lowpass', 400); lp.connect(sal);
        const fondo = bucle(ruido('marron', 8), lp, 0.35);
        return () => { g.parar(); fondo.parar(); };
      }
    },
    blanco: { nombre: 'Ruido blanco', emoji: '⚪', color: '#9A96B5', crear(sal) { const lp = filtro('lowpass', 9000); lp.connect(sal); const r = bucle(ruido('blanco'), lp, 0.55); return () => r.parar(); } },
    rosa: { nombre: 'Ruido rosa', emoji: '🌸', color: '#FF4F8B', crear(sal) { const r = bucle(ruido('rosa'), sal, 0.7); return () => r.parar(); } },
    marron: { nombre: 'Ruido marrón', emoji: '🟤', color: '#8B5A3C', crear(sal) { const r = bucle(ruido('marron'), sal, 0.9); return () => r.parar(); } }
  };

  /* ---------------- INSTRUMENTOS ---------------- */
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);

  function piano(t, midi, vel, dest = musicaBus) {
    const f = hz(midi);
    const dur = u.clamp(5.5 - (midi - 40) * 0.07, 1.4, 6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * 0.22, t + 0.005);
    g.gain.exponentialRampToValueAtTime(vel * 0.08, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lp = filtro('lowpass', 900 + vel * 3500 + midi * 15, 0.4);
    lp.connect(g); g.connect(dest);
    [[1, 1], [2, 0.38], [3, 0.16], [4, 0.08], [6, 0.03]].forEach(([k, a]) => {
      const o = ctx.createOscillator(); o.frequency.value = f * k * (1 + (k - 1) * 0.0004);
      const ga = ctx.createGain(); ga.gain.value = a;
      o.connect(ga); ga.connect(lp); o.start(t); o.stop(t + dur + 0.05);
    });
  }
  function marimba(t, midi, vel, dest = musicaBus) {
    const f = hz(midi), g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel * 0.3, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    g.connect(dest);
    const o = ctx.createOscillator(); o.frequency.value = f; o.connect(g); o.start(t); o.stop(t + 1.2);
    const o2 = ctx.createOscillator(), g2 = ctx.createGain(); o2.frequency.value = f * 3.93;
    g2.gain.setValueAtTime(vel * 0.12, t); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o2.connect(g2); g2.connect(dest); o2.start(t); o2.stop(t + 0.15);
  }
  function cuerdas(t, midi, dur, vel, dest = musicaBus) {
    const f = hz(midi), g = ctx.createGain(), lp = filtro('lowpass', 1300, 0.3);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * 0.07, t + Math.min(1.2, dur * 0.35));
    g.gain.setValueAtTime(vel * 0.07, t + dur * 0.75);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.6);
    lp.connect(g); g.connect(dest);
    [-7, 0, 6].forEach(c => {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = c;
      o.connect(lp); o.start(t); o.stop(t + dur + 0.7);
    });
  }
  function cuenco(t, f, vel, dest = musicaBus) {
    const dur = 14;
    [[1, 1, 0], [2.71, 0.45, 1.3], [5.15, 0.22, 2.1], [8.4, 0.08, 0.7]].forEach(([k, a, bat]) => {
      [-1, 1].forEach(s => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = f * k + s * bat * 0.5;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel * a * 0.12, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur / Math.sqrt(k));
        o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur);
      });
    });
  }

  /* ---------------- MÚSICA (composición en tiempo real) ----------------
   * Cada pieza es un generador: paso(t) programa lo que suena desde t y devuelve
   * la duración que ocupa; el planificador lo llama con antelación. */
  const ESCALA_RE = [62, 64, 66, 69, 71, 74, 76, 78, 81];        // Re mayor pentatónica + 7ª ausente
  const PIEZAS = {
    piano: {
      nombre: 'Piano sereno', emoji: '🎹', color: '#7C5CFF', desc: 'Acordes lentos y una melodía que vaga en Re mayor',
      crear() {
        // ritmo ternario lento, alternando dos acordes de séptima (sabor a Satie)
        const prog = [[43, [59, 62, 66]], [38, [57, 61, 66]], [43, [59, 62, 66]], [38, [57, 61, 66]],
          [40, [55, 59, 62]], [45, [55, 61, 64]], [38, [57, 62, 66]], [47, [57, 62, 66]]];
        let i = 0, mel = 4;
        const negra = 60 / 66;
        return {
          paso(t) {
            const [bajo, acorde] = prog[i % prog.length];
            piano(t, bajo, 0.55);
            acorde.forEach((m, k) => piano(t + negra + k * 0.012, m, 0.32));
            if (Math.random() < 0.85) {
              const notas = Math.random() < 0.5 ? 1 : 2;
              for (let k = 0; k < notas; k++) {
                mel = u.clamp(mel + [-2, -1, -1, 1, 1, 2, 0][Math.floor(Math.random() * 7)], 0, ESCALA_RE.length - 1);
                piano(t + (k === 0 ? (Math.random() < 0.5 ? 0 : negra * 2) : negra * 2.5) + 0.02, ESCALA_RE[mel], 0.5);
              }
            }
            i++;
            return negra * 3;
          }
        };
      }
    },
    minimal: {
      nombre: 'Minimalista', emoji: '🔁', color: '#16B4C8', desc: 'Arpegios que se repiten y cambian poco a poco',
      crear() {
        const acordes = [[57, 60, 64, 69], [53, 57, 60, 65], [48, 55, 60, 64], [55, 59, 62, 67]];
        const patron = [0, 1, 2, 3, 2, 1];
        let i = 0, fase = 0;
        const corchea = 60 / 104 / 2;
        return {
          paso(t) {
            const ac = acordes[Math.floor(i / 24) % acordes.length];
            const k = i % patron.length;
            marimba(t, ac[patron[k]] + 12, 0.55);
            // segunda voz que se desfasa una nota cada 4 ciclos (proceso a lo Reich)
            if (i % 96 === 0) fase = (fase + 1) % patron.length;
            if (Math.floor(i / 48) % 2 === 1) marimba(t + 0.01, ac[patron[(k + fase) % patron.length]] + 24, 0.25);
            if (k === 0) piano(t, ac[0] - 12, 0.35);
            i++;
            return corchea;
          }
        };
      }
    },
    canon: {
      nombre: 'Canon de cuerda', emoji: '🎻', color: '#FF4F8B', desc: 'Sobre la progresión del Canon de Pachelbel (dominio público)',
      crear() {
        const prog = [[50, [62, 66, 69]], [45, [61, 64, 69]], [47, [62, 66, 71]], [42, [61, 66, 69]],
          [43, [62, 67, 71]], [38, [62, 66, 69]], [43, [62, 67, 71]], [45, [61, 64, 69]]];
        let i = 0;
        const blanca = 60 / 58 * 2;
        return {
          paso(t) {
            const [bajo, ac] = prog[i % prog.length];
            cuerdas(t, bajo, blanca * 0.98, 0.9);
            ac.forEach(m => cuerdas(t, m, blanca * 0.98, 0.55));
            const vuelta = Math.floor(i / prog.length) % 3;
            if (vuelta >= 1) [0, 1, 2, 1].forEach((n, k) => piano(t + k * blanca / 4, ac[n] + 12, 0.3));
            if (vuelta === 2) piano(t, ac[2] + 24, 0.25);
            i++;
            return blanca;
          }
        };
      }
    },
    cuencos: {
      nombre: 'Cuencos tibetanos', emoji: '🔔', color: '#F5B400', desc: 'Resonancias largas para meditar',
      crear() {
        const fs = [174.6, 196, 220, 261.6, 293.7];
        return { paso(t) { cuenco(t, fs[Math.floor(Math.random() * fs.length)], azar(0.6, 1)); return azar(6, 11); } };
      }
    },
    ambiente: {
      nombre: 'Ambiente', emoji: '🌌', color: '#3B2F86', desc: 'Un colchón de sonido que evoluciona muy despacio',
      crear() {
        const acordes = [[50, 57, 62, 66, 69], [47, 54, 59, 62, 66], [43, 50, 59, 62, 67], [45, 52, 57, 61, 64]];
        let i = 0;
        return {
          paso(t) {
            const ac = acordes[i % acordes.length], d = 11;
            ac.forEach((m, k) => cuerdas(t + k * 0.4, m, d + 2, k ? 0.45 : 0.7));
            if (Math.random() < 0.6) piano(t + azar(2, 6), ac[Math.floor(azar(2, 5))] + 12, 0.25);
            i++;
            return d;
          }
        };
      }
    }
  };

  /* ---------------- ESTADO Y CONTROL ---------------- */
  const estado = {
    ambientes: {},          // id → {salida, parar, vol}
    musica: null,           // {id, motor, siguiente, salida} o {pista, el, salida}
    finTemporizador: null,
    fundiendo: false
  };
  const ev = new Set();
  const avisar = () => ev.forEach(f => { try { f(); } catch (e) { console.error(e); } });

  let reloj = null;
  function planificar() {
    const m = estado.musica;
    if (!m || !m.motor) return;
    // con la pantalla apagada los temporizadores van más lentos: se programa más por delante
    const margen = document.hidden ? 3 : 0.4;
    while (m.siguiente < ctx.currentTime + margen) m.siguiente += m.motor.paso(m.siguiente);
  }
  function arrancarReloj() {
    if (reloj) return;
    reloj = setInterval(() => { planificar(); revisarTemporizador(); }, 100);
  }
  function quizaPararReloj() {
    if (!Object.keys(estado.ambientes).length && !estado.musica && !estado.finTemporizador) { clearInterval(reloj); reloj = null; }
  }

  function salida(vol) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(vol, ctx.currentTime + 1.5);
    return g;
  }
  function apagar(g, parar, seg = 1.2) {
    const t = ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.linearRampToValueAtTime(0, t + seg);
    setTimeout(() => { try { parar && parar(); } catch (e) {} g.disconnect(); }, seg * 1000 + 100);
  }

  const R = {
    AMBIENTES, PIEZAS,
    on(f) { ev.add(f); return () => ev.delete(f); },
    /** Relámpagos de la tormenta: f(intensidad) justo antes de cada trueno cercano */
    onRelampago(f) { oyentesRayo.add(f); return () => oyentesRayo.delete(f); },
    sonando() { return !!(Object.keys(estado.ambientes).length || estado.musica); },
    ambientesActivos() { return Object.keys(estado.ambientes); },
    musicaActiva() { return estado.musica ? (estado.musica.id || ('pista:' + estado.musica.pista)) : null; },
    volumen(id) { return estado.ambientes[id] ? estado.ambientes[id].vol : null; },

    activarAmbiente(id, vol = 0.7) {
      iniciarGrafo();
      if (estado.ambientes[id] || !AMBIENTES[id]) return;
      const s = salida(vol); s.connect(bus);
      const parar = AMBIENTES[id].crear(s);
      estado.ambientes[id] = { salida: s, parar, vol };
      arrancarReloj(); avisar();
    },
    desactivarAmbiente(id) {
      const a = estado.ambientes[id];
      if (!a) return;
      delete estado.ambientes[id];
      apagar(a.salida, a.parar);
      quizaPararReloj(); avisar();
    },
    volAmbiente(id, v) {
      const a = estado.ambientes[id];
      if (!a) return;
      a.vol = v;
      a.salida.gain.cancelScheduledValues(ctx.currentTime);
      a.salida.gain.setTargetAtTime(v, ctx.currentTime, 0.1);
    },

    tocarPieza(id) {
      iniciarGrafo();
      R.pararMusica();
      const p = PIEZAS[id];
      if (!p) return;
      // las notas se escriben directamente en musicaBus, que lleva el volumen de la música
      estado.musica = { id, motor: p.crear(), siguiente: ctx.currentTime + 0.2 };
      musicaBus.gain.cancelScheduledValues(ctx.currentTime);
      musicaBus.gain.setTargetAtTime(R.volMusica(), ctx.currentTime, 0.3);
      arrancarReloj(); planificar(); avisar();
    },
    async tocarPista(pista) {
      iniciarGrafo();
      R.pararMusica();
      const el = new Audio(URL.createObjectURL(pista.blob));
      el.loop = true;
      const fuente = ctx.createMediaElementSource(el);
      const s = salida(R.volMusica()); fuente.connect(s); s.connect(master);
      estado.musica = { pista: pista.id, el, salida: s, nombre: pista.nombre };
      try { await el.play(); } catch (e) { u.toast('No se pudo reproducir la pista'); }
      arrancarReloj(); avisar();
    },
    pararMusica() {
      const m = estado.musica;
      if (!m) return;
      estado.musica = null;
      if (m.el) { apagar(m.salida, () => { m.el.pause(); URL.revokeObjectURL(m.el.src); }); }
      else {
        // las notas ya programadas se apagan con el bus
        const t = ctx.currentTime;
        musicaBus.gain.cancelScheduledValues(t);
        musicaBus.gain.setValueAtTime(musicaBus.gain.value, t);
        musicaBus.gain.linearRampToValueAtTime(0, t + 1.5);
      }
      quizaPararReloj(); avisar();
    },
    _volMusica: 0.7,
    volMusica(v) {
      if (v === undefined) return R._volMusica;
      R._volMusica = v;
      const m = estado.musica;
      if (!m) return v;
      const g = m.el ? m.salida.gain : musicaBus.gain;
      g.cancelScheduledValues(ctx.currentTime); g.setTargetAtTime(v, ctx.currentTime, 0.1);
      return v;
    },
    volGeneral(v) { iniciarGrafo(); master.gain.setTargetAtTime(v, ctx.currentTime, 0.1); },

    pararTodo(seg = 1.2) {
      Object.keys(estado.ambientes).forEach(id => {
        const a = estado.ambientes[id]; delete estado.ambientes[id]; apagar(a.salida, a.parar, seg);
      });
      R.pararMusica();
      estado.finTemporizador = null;
      quizaPararReloj(); avisar();
    },

    /* temporizador con fundido de salida durante los últimos 30 s */
    temporizador(min) {
      iniciarGrafo();
      estado.finTemporizador = min > 0 ? Date.now() + min * 60000 : null;
      if (estado.fundiendo) { estado.fundiendo = false; master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setTargetAtTime(R._volGeneral, ctx.currentTime, 0.2); }
      arrancarReloj(); avisar();
    },
    _volGeneral: 0.8,
    restante() { return estado.finTemporizador ? Math.max(0, (estado.finTemporizador - Date.now()) / 1000) : null; }
  };
  /** Para las pruebas automáticas: acceso al grafo de audio */
  R._grafo = () => { iniciarGrafo(); return { ctx, master }; };
  const _vg = R.volGeneral;
  R.volGeneral = v => { R._volGeneral = v; _vg(v); };

  function revisarTemporizador() {
    const r = R.restante();
    if (r === null) return;
    if (r <= 30 && !estado.fundiendo && R.sonando()) {
      estado.fundiendo = true;
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0.0001, t + Math.max(1, r));
    }
    if (r <= 0) {
      R.pararTodo(0.2);
      setTimeout(() => { master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setValueAtTime(R._volGeneral, ctx.currentTime); estado.fundiendo = false; }, 600);
      u.toast('Fin del tiempo de relajación 🌙', 4000);
    }
  }

  /* ---------------- pistas propias ---------------- */
  R.pistas = {
    async lista() { return (await DB.all('pistas')).sort((a, b) => a.fecha - b.fecha); },
    async anadir(file) {
      const dur = await new Promise(res => {
        const a = new Audio(); a.preload = 'metadata';
        a.onloadedmetadata = () => { res(a.duration || 0); URL.revokeObjectURL(a.src); };
        a.onerror = () => res(0);
        a.src = URL.createObjectURL(file);
      });
      return DB.put('pistas', { nombre: file.name.replace(/\.[^.]+$/, ''), blob: file, tipo: file.type, duracion: dur, fecha: Date.now() });
    },
    borrar: id => DB.del('pistas', id)
  };

  A.relax = R;
})(window.Atril);
