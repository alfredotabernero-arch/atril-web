/* Atril — pantalla «Hoy» */
(function (A) {
  'use strict';
  const { u, DB, modelo, icono } = A;
  const { h } = u;

  function anillo(frac) {
    const r = 50, c = 2 * Math.PI * r;
    return h('div.anillo', {
      html: `<svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="${r}" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="14"/>
      <circle cx="60" cy="60" r="${r}" fill="none" stroke="#fff" stroke-width="14" stroke-linecap="round"
      stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - Math.min(1, frac))}" style="transition:stroke-dashoffset .8s cubic-bezier(.2,.8,.2,1)"/></svg>`
    });
  }

  /** Gráfico de la semana: previsto (contorno) frente a real (barra de color) */
  function graficoSemana(dias) {
    const max = Math.max(30, ...dias.map(d => Math.max(d.prev, d.real)));
    const hoy = u.claveDia(new Date());
    return h('div',
      h('div.grafico-semana', dias.map(d => {
        const esHoy = u.claveDia(d.fecha) === hoy;
        const cumple = d.prev && d.real >= d.prev;
        return h('div.col',
          h('div.pila', { title: `${u.DIAS[d.fecha.getDay()]}: ${u.minutos(d.real)} de ${u.minutos(d.prev)}` },
            d.prev ? h('div.prev', { style: { height: (d.prev / max * 100) + '%' } }) : null,
            h('div.real' + (cumple ? '.cumple' : ''), { style: { height: (d.real / max * 100) + '%' } }, cumple ? h('span', '✓') : null)),
          h('span.et' + (esHoy ? '.hoy' : ''), u.DIAS_CORTOS[d.fecha.getDay()]));
      })),
      h('div.leyenda',
        h('span', h('i.prev-ley'), 'Previsto'),
        h('span', h('i', { style: { background: 'var(--primario)' } }), 'Estudiado'),
        h('span', h('i', { style: { background: 'var(--verde)' } }), 'Cumplido')));
  }

  A.vistas.hoy = {
    titulo: 'Hoy',
    async render({ main, titulo, acciones }) {
      const ahora = new Date();
      titulo.textContent = saludo(ahora);
      acciones.appendChild(h('button.btn-icono', { 'aria-label': 'Añadir sesión pasada', title: 'Añadir sesión pasada', onclick: async () => { await A.dialogos.sesionManual(); A.app.refrescar(); } }, icono('reloj')));
      // en la app de Android: acceso a Ajustes y botón Salir
      if (A.nativo && A.nativo.puedeSalir) {
        acciones.append(
          h('a.btn-icono', { href: '#/ajustes', 'aria-label': 'Ajustes', title: 'Ajustes' }, icono('ajustes')),
          h('button.btn-icono.btn-salir', { 'aria-label': 'Salir de Atril', title: 'Salir de Atril', onclick: () => A.app.pedirSalida() }, icono('salir')));
      }

      const [plan, sesiones, cart] = await Promise.all([modelo.plan(), DB.all('sesiones'), modelo.cartera()]);
      const porDia = modelo.minutosPorDia(sesiones);
      const kHoy = u.claveDia(ahora);
      const enCurso = () => modelo.sesion.estado ? modelo.sesion.segundos() / 60 : 0;
      const realHoy = porDia[kHoy] || 0;
      const prevHoy = modelo.previstoDia(plan, ahora);
      const racha = modelo.racha(porDia);

      // --------- tarjeta principal
      const totalHoy = realHoy + enCurso();
      const frac = prevHoy ? totalHoy / prevHoy : (totalHoy > 0 ? 1 : 0);
      const numHoy = h('b', Math.round(totalHoy));
      const an = anillo(frac);
      an.appendChild(h('div.centro', h('div', numHoy, h('small', prevHoy ? 'de ' + prevHoy + ' min' : 'min'))));
      const falta = Math.max(0, prevHoy - totalHoy);
      const textoHoy = !prevHoy ? (totalHoy ? '¡Estudio extra en tu día libre! 💪' : 'Hoy es tu día libre.')
        : falta <= 0 ? '¡Objetivo de hoy cumplido! 🎉'
          : totalHoy > 0 ? `¡Vas bien! Te quedan ${u.minutos(falta)}.` : `Hoy tocan ${u.minutos(prevHoy)} de estudio.`;
      const btnEstudiar = modelo.sesion.estado
        ? h('button.btn.blanco.grande.bloque', { onclick: () => A.dialogos.terminar() }, icono('stop'), 'Terminar la sesión')
        : h('button.btn.blanco.grande.bloque', { onclick: () => A.dialogos.iniciar() }, icono('play'), 'Empezar a estudiar');
      main.appendChild(h('section.hero.hero-hoy',
        h('div.anillo-hoy', an,
          h('div.crece',
            h('div.hero-sub', u.fechaLarga(ahora)),
            h('div.hero-titulo', textoHoy),
            racha ? h('div.racha', icono('fuego'), h('b', racha), racha === 1 ? ' día seguido' : ' días seguidos') : null)),
        h('div', { style: { marginTop: '18px' } }, btnEstudiar)));

      // --------- obras activas?
      const activas = cart.filter(c => c.obra.estado !== 'archivada');
      if (!activas.length) {
        main.appendChild(h('section.tarjeta.vacio',
          h('div.vacio-icono', icono('obras')),
          h('h3', 'Tu cartera está vacía'),
          h('p', 'Añade las obras que estás preparando, divídelas en secciones por compases y Atril te dirá qué estudiar cada día.'),
          h('div.fila', { style: { justifyContent: 'center' } },
            h('button.btn.primario', { onclick: async () => { const o = await A.dialogos.obra(); if (o) location.hash = '#/obra/' + o.id; } }, icono('mas'), 'Añadir obra'),
            h('a.btn', { href: '#/ajustes' }, 'Ver un ejemplo'))));
      } else {
        // --------- hoy te toca: primero lo preparado («Para mañana» de ayer), luego las sugerencias
        const { preparados, auto } = await modelo.hoyTeToca(activas, sesiones, 3);
        const todos = preparados.filter(x => !x.hecho).concat(auto, preparados.filter(x => x.hecho));
        const cambiarHoy = h('button.enlace.mini', { onclick: async () => { if (await A.dialogos.paraDia(new Date())) A.app.refrescar(); } },
          preparados.length ? 'Cambiar' : 'Elegir yo');
        if (todos.length) {
          main.appendChild(h('div.seccion-titulo', h('h2', 'Hoy te toca'),
            h('span.mini.tenue', preparados.length ? (auto.length ? 'lo que preparaste y tus prioridades' : 'lo que preparaste') : 'según tus prioridades'), cambiarHoy));
          const caja = h('div.sugerencias');
          let num = 0;
          todos.forEach(({ c, s, motivos, preparado, hecho }, i) => {
            if (!preparado && i > 0 && todos[i - 1].preparado && !todos[i - 1].hecho) caja.appendChild(h('div.sug-separador', 'Además, según tus prioridades'));
            const destino = s ? '#/seccion/' + s.id : '#/obra/' + c.obra.id;
            const jugar = s
              ? h('a.btn.primario.redondo-btn', { href: '#/atril/' + s.id, 'aria-label': 'Estudiar en el atril', title: 'Al atril' }, icono('play'))
              : h('button.btn.primario.redondo-btn', { 'aria-label': 'Empezar a estudiar', title: 'Empezar', onclick: () => A.dialogos.iniciar(c.obra.id) }, icono('play'));
            caja.appendChild(h('div.sug-card' + (preparado ? '.preparada' : '') + (hecho ? '.hecha' : ''), { style: { '--c': c.obra.color } },
              h('div.sug-num', hecho ? icono('check') : ++num),
              h('a.crece.sug-cuerpo', { href: destino },
                h('div.sug-obra', c.obra.titulo),
                s ? h('div.sug-sec', (s.letra ? s.letra + ' · ' : '') + s.nombre, h('span', ' ' + modelo.rangoTexto(s)))
                  : h('div.sug-sec', c.secciones.length ? 'Toda la obra' : 'La obra'),
                h('div.fila.envuelve', { style: { gap: '5px', marginTop: '6px' } }, motivos.slice(0, 3).map(m => h('span.chip.' + m.c, m.t)))),
              jugar));
          });
          main.appendChild(caja);
        }
        // lo ya trabajado hoy no se propone de nuevo: se recuerda aquí
        const hechasHoy = modelo.trabajadasHoy(activas, sesiones);
        if (hechasHoy.length) {
          const porObra = {};
          hechasHoy.forEach(({ c, s }) => (porObra[c.obra.titulo] = porObra[c.obra.titulo] || []).push((s.letra ? s.letra + ' · ' : '') + s.nombre));
          main.appendChild(h('p.hoy-ya', icono('check'), h('span', 'Hoy ya has trabajado: ',
            Object.entries(porObra).map(([t, l], i) => [i ? '; ' : '', h('b', l.join(', ')), ' (' + t + ')']).flat())));
        }

        // --------- obras con urgencia
        const urgentes = activas.filter(c => c.ritmo && c.ritmo.nivel !== 'bien').sort((a, b) => a.ritmo.quedan - b.ritmo.quedan);
        const lunes0 = u.inicioSemana(ahora).getTime();
        const minSemObra = {};
        sesiones.filter(s => s.inicio >= lunes0 && s.obraId).forEach(s => { minSemObra[s.obraId] = (minSemObra[s.obraId] || 0) + s.minutos; });
        const deficit = activas.filter(c => c.obra.minSemana > 0 && !urgentes.includes(c))
          .map(c => ({ c, falta: c.obra.minSemana - (minSemObra[c.obra.id] || 0) })).filter(x => x.falta > 0).sort((a, b) => b.falta - a.falta);
        if (urgentes.length || deficit.length) {
          const l = h('ul.lista');
          urgentes.slice(0, 3).forEach(c => {
            const r = c.ritmo;
            l.appendChild(h('li', h('a.item', { href: '#/obra/' + c.obra.id },
              h('span.punto-color', { style: { background: c.obra.color } }),
              h('div.crece', h('div.titulo', c.obra.titulo),
                h('div.mini.tenue', r.nivel === 'vencida' ? 'Fecha superada y sin terminar' : `Quedan ${r.quedan} días · ${Math.round(c.progreso * 100)} % (lo esperable: ${Math.round(r.esperado * 100)} %)`)),
              A.obrasUI.chipRitmo(r))));
          });
          deficit.slice(0, 2).forEach(({ c, falta }) => l.appendChild(h('li', h('a.item', { href: '#/obra/' + c.obra.id },
            h('span.punto-color', { style: { background: c.obra.color } }),
            h('div.crece', h('div.titulo', c.obra.titulo), h('div.mini.tenue', `Le faltan ${u.minutos(falta)} esta semana`)),
            h('span.chip.acento', 'Plan')))));
          main.appendChild(h('section.tarjeta', h('h2', 'Ojo con…'), l));
        }
      }

      // --------- para mañana
      if (activas.length) {
        const manana = modelo.paraDia.manana();
        const lm = await modelo.paraDia.de(manana);
        const nombres = lm.map(x => {
          const c = activas.find(y => y.obra.id === x.obraId);
          if (!c) return null;
          const sec = x.seccionId ? c.secciones.find(y => y.id === x.seccionId) : null;
          if (x.seccionId && !sec) return null;
          return h('li', h('span.punto-color', { style: { background: c.obra.color } }),
            h('span', h('b', sec ? (sec.letra ? sec.letra + ' · ' : '') + sec.nombre : 'Toda la obra'), ' · ' + c.obra.titulo));
        }).filter(Boolean);
        main.appendChild(h('section.tarjeta.para-manana',
          h('div.tarjeta-cab', h('span.tarjeta-icono', { style: { background: '#7C5CFF' } }, icono('manana')), h('h2.crece', 'Para mañana'),
            h('button.btn' + (nombres.length ? '' : '.primario'), { onclick: async () => { if (await A.dialogos.paraDia(manana)) A.app.refrescar(); } },
              nombres.length ? 'Cambiar' : 'Preparar')),
          nombres.length
            ? h('ul.lista-manana', nombres)
            : h('p.mini.tenue', { style: { margin: 0 } }, 'Deja elegido lo que quieres estudiar mañana: saldrá lo primero en «Hoy te toca», y Atril completará con sus sugerencias.')));
      }

      // --------- semana
      const lunes = u.inicioSemana(ahora);
      const dias = [];
      for (let i = 0; i < 7; i++) {
        const f = u.sumarDias(lunes, i), k = u.claveDia(f);
        dias.push({ fecha: f, prev: modelo.previstoDia(plan, f), real: (porDia[k] || 0) + (k === kHoy ? enCurso() : 0) });
      }
      const semReal = dias.reduce((a, d) => a + d.real, 0);
      const semPrev = dias.reduce((a, d) => a + d.prev, 0);
      const hastaHoy = dias.filter(d => d.fecha <= ahora).reduce((a, d) => a + d.prev, 0);
      main.appendChild(h('section.tarjeta',
        h('div.fila', h('h2.crece', 'Esta semana'),
          semPrev ? h('span.chip.' + (semReal >= hastaHoy ? 'bien' : semReal >= hastaHoy * 0.7 ? 'aviso' : 'mal'),
            semReal >= hastaHoy ? '¡Al día!' : 'Debes ' + u.minutos(hastaHoy - semReal)) : null),
        h('div.metricas',
          h('div.metrica.m1', h('b', u.minutos(semReal)), h('span', 'estudiado')),
          h('div.metrica.m2', h('b', semPrev ? Math.round(semReal / semPrev * 100) + ' %' : '—'), h('span', 'de ' + u.minutos(semPrev))),
          h('div.metrica.m3', h('b', racha), h('span', racha === 1 ? 'día de racha' : 'días de racha'))),
        graficoSemana(dias)));

      // --------- próximas fechas
      const proximas = activas.filter(c => c.obra.fechaObjetivo && c.ritmo && c.ritmo.quedan >= 0).slice(0, 4);
      if (proximas.length) {
        main.appendChild(h('section.tarjeta', h('h2', 'Próximas fechas'), h('ul.lista', proximas.map(c =>
          h('li', h('a.item', { href: '#/obra/' + c.obra.id },
            h('div.cuenta-atras', { style: { background: c.obra.color } }, h('b', c.ritmo.quedan), h('span', c.ritmo.quedan === 1 ? 'día' : 'días')),
            h('div.crece', h('div.titulo', c.obra.titulo), h('div.barra', { style: { marginTop: '6px' } }, h('i', { style: { width: Math.round(c.progreso * 100) + '%', background: c.obra.color } }))),
            h('span.mini.tenue', u.fechaCorta(c.obra.fechaObjetivo))))))));
      }

      const t = setInterval(() => { if (modelo.sesion.estado) numHoy.textContent = Math.round(realHoy + enCurso()); }, 5000);
      const off = modelo.sesion.on(() => A.app.refrescar());
      return () => { clearInterval(t); off(); };
    }
  };

  function saludo(d) {
    const hh = d.getHours();
    return hh < 6 ? 'Buenas noches' : hh < 13 ? '¡Buenos días!' : hh < 21 ? '¡Buenas tardes!' : 'Buenas noches';
  }
})(window.Atril);
