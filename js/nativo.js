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
    /** Solo Android permite cerrar la app desde dentro */
    puedeSalir: esNativo && plataforma === 'android',
    Metronomo: reg('Metronomo'),
    Pantalla: reg('Pantalla'),
    App: reg('App'),
    Filesystem: reg('Filesystem'),
    Share: reg('Share')
  };
})(window.Atril);
