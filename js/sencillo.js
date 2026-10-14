/* Atril — modo sencillo (para niños): menos opciones, botones grandes y una estrella por cada día de música */
(function (A) {
  'use strict';
  const { u, DB, modelo, icono } = A;
  const { h } = u;

  const DIAS_C = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  // pantallas que no existen en el modo sencillo
  const BLOQUEADAS = ['estadisticas'];

  const sencillo = {
    activo: false,
    pin: '',
    async cargar() {
      const c = await DB.kvGet('modoSencillo', null) || {};
      this.activo = !!c.activo;
      this.pin = c.pin || '';
      document.body.classList.toggle('modo-sencillo', this.activo);
    },
    async _guardar() {
      await DB.kvSet('modoSencillo', { activo: this.activo, pin: this.pin });
      document.body.classList.toggle('modo-sencillo', this.activo);
    },
    bloqueada: vista => BLOQUEADAS.includes(vista),

    /** Activar el modo sencillo, con un PIN de 4 cifras opcional para salir */
    async activar() {
      const pin = h('input', { type: 'password', inputmode: 'numeric', pattern: '[0-9]*', maxlength: 4, name: 'pin', placeholder: 'Sin PIN', autocomplete: 'off' });
      const pin2 = h('input', { type: 'password', inputmode: 'numeric', pattern: '[0-9]*', maxlength: 4, name: 'pin2', placeholder: 'Repítelo', autocomplete: 'off' });
      const cuerpo = h('div',
        h('p', { style: { marginTop: 0 } }, 'Atril se queda con lo esencial: «Hoy te toca», sus obras, estudiar con el cronómetro, el metrónomo y el afinador. Botones grandes y una estrella por cada día de música.'),
        h('p.mini.tenue', 'Se ocultan las fases, los porcentajes, el reparto de minutos, dividir y unir secciones, el Progreso detallado y los ajustes avanzados. No se borra nada: al salir, todo vuelve a estar como antes.'),
        h('div.rejilla-2', u.campo('PIN para salir (opcional)', pin), u.campo('Repite el PIN', pin2)),
        h('p.mini.tenue', { style: { margin: 0 } }, 'Con PIN, solo quien lo sepa puede volver al modo completo. Déjalo vacío si no hace falta.'));
      const r = await u.modal('Modo sencillo', cuerpo, [
        { texto: 'Cancelar', accion: () => null },
        { texto: 'Activar', clase: 'primario', accion: () => {
          const a = pin.value.trim(), b = pin2.value.trim();
          if (a && !/^\d{4}$/.test(a)) { u.toast('El PIN son 4 cifras'); return false; }
          if (a !== b) { u.toast('Los dos PIN no coinciden'); return false; }
          return { pin: a };
        } }
      ]);
      if (!r) return false;
      this.activo = true; this.pin = r.pin;
      await this._guardar();
      u.toast('Modo sencillo activado ⭐');
      location.hash = '#/hoy';
      A.app.refrescar();
      return true;
    },

    /** Salir del modo sencillo (pide el PIN si lo hay) */
    async salir() {
      if (this.pin) {
        const pin = h('input.pin-grande', { type: 'password', inputmode: 'numeric', pattern: '[0-9]*', maxlength: 4, autocomplete: 'off', 'aria-label': 'PIN' });
        let olvido = null;
        const cuerpo = h('div', h('p', { style: { marginTop: 0 } }, 'Escribe el PIN de 4 cifras para volver al modo completo.'), pin,
          h('button.enlace.mini', { type: 'button', style: { marginTop: '10px' }, onclick: () => {
            const a = 12 + Math.floor(Math.random() * 80), b = 6 + Math.floor(Math.random() * 7);
            olvido = a * b;
            const resp = h('input', { type: 'number', 'aria-label': 'Resultado' });
            resp.addEventListener('input', () => { if (Number(resp.value) === olvido) pin.value = sencillo.pin; });
            cuerpo.lastChild.replaceWith(h('div.campo', h('span.campo-et', `Para una persona adulta: ¿cuánto es ${a} × ${b}?`), resp,
              h('small.campo-ayuda', 'Si aciertas, el PIN se rellena solo.')));
          } }, '¿Has olvidado el PIN?'));
        const ok = await u.modal('Salir del modo sencillo', cuerpo, [
          { texto: 'Cancelar', accion: () => null },
          { texto: 'Salir', clase: 'primario', accion: () => { if (pin.value.trim() !== sencillo.pin) { u.toast('PIN incorrecto'); pin.value = ''; return false; } return true; } }
        ]);
        if (!ok) return false;
      } else if (!(await u.confirmar('¿Volver al modo completo de Atril?', 'Volver'))) return false;
      this.activo = false;
      await this._guardar();
      u.toast('Modo completo');
      A.app.refrescar();
      return true;
    },

    /** Tarjeta de Ajustes */
    tarjetaAjustes() {
      return h('section.tarjeta.tarjeta-sencillo',
        h('div.tarjeta-cab', h('span.tarjeta-icono', { style: { background: '#F5B400' } }, '⭐'), h('h2', 'Modo sencillo')),
        this.activo
          ? [h('p', { style: { marginTop: 0 } }, 'Atril está en modo sencillo' + (this.pin ? ', protegido con PIN.' : '.')),
            h('button.btn.grande', { onclick: () => this.salir() }, 'Volver al modo completo')]
          : [h('p.mini.tenue', { style: { marginTop: 0 } }, 'Para niños y niñas: solo lo esencial, botones grandes y una estrella por cada día de música. Puedes protegerlo con un PIN.'),
            h('button.btn', { 'data-ayuda': 'modoSencillo', onclick: () => this.activar() }, '⭐ Activar el modo sencillo')]);
    },

    /** Pantalla «Hoy» del modo sencillo */
    async hoy({ main, titulo }) {
      if (titulo) titulo.textContent = 'Hoy';
      const [cart, sesiones, cfg] = await Promise.all([modelo.cartera(), DB.all('sesiones'), DB.kvGet('resumenProfesor', {})]);
      const activas = cart.filter(c => c.obra.estado !== 'archivada');
      const porDia = modelo.minutosPorDia(sesiones);
      const hoy = new Date(), lunes = u.inicioSemana(hoy);
      const racha = modelo.racha(porDia);
      const minHoy = porDia[u.claveDia(hoy)] || 0;
      const nombre = cfg && cfg.nombre ? cfg.nombre.split(' ')[0] : '';
      const hora = hoy.getHours();

      main.appendChild(h('div.sen-saludo', h('h2', (hora < 14 ? '¡Buenos días' : hora < 21 ? '¡Buenas tardes' : '¡Buenas noches') + (nombre ? ', ' + nombre : '') + '!'),
        h('p', minHoy ? 'Hoy ya llevas ' + u.minutos(minHoy) + ' de música. ¡Genial!' : '¿Tocamos un rato?')));

      // ---------- la semana: una estrella por cada día de música
      const dias = h('div.sen-estrellas');
      for (let i = 0; i < 7; i++) {
        const f = u.sumarDias(lunes, i);
        const m = porDia[u.claveDia(f)] || 0;
        const esHoy = u.claveDia(f) === u.claveDia(hoy);
        dias.appendChild(h('div.sen-dia' + (m ? '.con' : '') + (esHoy ? '.hoy' : '') + (f > hoy ? '.futuro' : ''),
          h('span.sen-estrella', { 'aria-hidden': 'true' }, m ? '★' : '☆'), h('b', DIAS_C[i]), h('small', m ? u.minutos(m) : '')));
      }
      const estrellasSem = Array.from({ length: 7 }, (_, i) => porDia[u.claveDia(u.sumarDias(lunes, i))] > 0).filter(Boolean).length;
      main.appendChild(h('section.tarjeta.sen-semana',
        h('div.fila', h('h2.crece', 'Mi semana'), h('span.sen-cuenta', estrellasSem + ' ★')),
        dias,
        racha > 1 ? h('p.sen-racha', '🔥 ' + racha + ' días seguidos con música') : null));

      // ---------- estudiar
      if (!modelo.sesion.estado) {
        main.appendChild(h('button.btn.primario.sen-grande', { onclick: () => A.dialogos.iniciar() }, icono('play'), 'Empezar a estudiar'));
      } else {
        main.appendChild(h('button.btn.primario.sen-grande', { onclick: () => A.dialogos.terminar() }, icono('stop'), 'Terminar de estudiar'));
      }

      // ---------- hoy te toca
      if (activas.length) {
        const { preparados, auto } = await modelo.hoyTeToca(activas, sesiones, 3);
        const todos = preparados.filter(x => !x.hecho).concat(auto, preparados.filter(x => x.hecho));
        if (todos.length) {
          main.appendChild(h('div.seccion-titulo', h('h2', 'Hoy te toca')));
          const caja = h('div.sen-toca');
          todos.forEach(({ c, s, hecho, pasaje }) => {
            const ir = () => {
              if (pasaje) return A.dialogos.estudiarPasaje(c.obra, pasaje, c.secciones);
              if (s) { location.hash = '#/atril/' + s.id; return; }
              if (!modelo.sesion.estado) A.dialogos.iniciar(c.obra.id); else location.hash = '#/obra/' + c.obra.id;
            };
            caja.appendChild(h('button.sen-tarjeta' + (hecho ? '.hecha' : ''), { style: { '--c': c.obra.color }, onclick: ir },
              h('span.sen-tarjeta-icono', hecho ? '✓' : pasaje ? '⚡' : '▶'),
              h('span.crece',
                h('b', c.obra.titulo),
                h('span', pasaje ? 'Compases ' + modelo.textoPasaje(pasaje).slice(3) + (pasaje.nota ? ' · ' + pasaje.nota : '')
                  : s ? (s.letra ? s.letra + ' · ' : '') + s.nombre : 'La obra'))));
          });
          main.appendChild(caja);
        }
      } else {
        main.appendChild(h('section.tarjeta.vacio', h('h3', 'Todavía no hay obras'), h('p', 'Pide a tu profe o a una persona mayor que añada tus obras desde el modo completo.')));
      }

      // ---------- resumen para el profe
      main.appendChild(h('button.btn.sen-grande.sen-secundario', { onclick: () => A.resumen.dialogo() }, icono('compartir'), 'Enviar mi semana al profe'));

      const off = modelo.sesion.on(() => A.app.refrescar());
      return () => off();
    }
  };

  A.sencillo = sencillo;
})(window.Atril);
