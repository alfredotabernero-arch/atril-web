/* Atril — puente con la parte nativa (Capacitor) */
(function (A) {
  'use strict';
  const C = window.Capacitor;
  const esNativo = !!(C && C.isNativePlatform && C.isNativePlatform());
  const plataforma = C && C.getPlatform ? C.getPlatform() : 'web';
  // Sin registrarlos, los plugins nativos no aparecen en JavaScript
  const reg = n => (esNativo && C.registerPlugin ? C.registerPlugin(n) : null);

  A.nativo = {
    es: esNativo,
    plataforma,
    /** Versión de Windows (Electron): expone window.atrilPC */
    pc: !!window.atrilPC,
    /** Android y la versión de PC permiten cerrar la app desde dentro */
    puedeSalir: (esNativo && plataforma === 'android') || !!(window.atrilPC && window.atrilPC.salir),
    /** Cierra la app (Android o PC) */
    cerrar() {
      if (window.atrilPC && window.atrilPC.salir) window.atrilPC.salir();
      else if (A.nativo.App) A.nativo.App.exitApp();
    },
    Metronomo: reg('Metronomo'),
    Pantalla: reg('Pantalla'),
    Fondo: reg('Fondo'),
    Voz: reg('Voz'),
    App: reg('App'),
    Filesystem: reg('Filesystem'),
    Share: reg('Share')
  };
})(window.Atril);
