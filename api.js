/* Almacén de aceros (prueba) — capa de datos. Autor: Carlos Eduardo Bermúdez Castro
 * Dos modos: REMOTO (Google Apps Script, datos compartidos) y LOCAL (solo en este navegador, para pruebas).
 * Las salidas hechas sin señal quedan en una cola y se envían solas al volver la conexión.
 */
(function () {
  'use strict';
  var CFG = window.ACEROS_CONFIG, C = window.AcerosCore;
  var K = { local: 'acp_local_v1', cache: 'acp_cache_v1', cola: 'acp_cola_v1', err: 'acp_cola_err_v1', ses: 'acp_ses_v1' };
  var remoto = !!CFG.API_URL;

  function leer(k, def) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? def : v; } catch (e) { return def; } }
  function guardar(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
  function vacio() { return { pedidos: [], entradas: [], salidas: [] }; }
  function uid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function ahora() {
    var d = new Date(), z = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + 'T' + z(d.getHours()) + ':' + z(d.getMinutes()) + ':' + z(d.getSeconds());
  }
  function conFecha(dia) {
    var a = ahora();
    return /^\d{4}-\d\d-\d\d$/.test(dia || '') ? dia + a.slice(10) : a;
  }
  function post(body) {
    return fetch(CFG.API_URL, { method: 'POST', body: JSON.stringify(body) }).then(function (r) { return r.json(); });
  }

  // Suma al estado las salidas que están en cola (para que el saldo del celular sea correcto sin señal).
  function conCola(estado) {
    var q = leer(K.cola, []);
    if (!q.length) return estado;
    var e = { pedidos: estado.pedidos, entradas: estado.entradas, salidas: estado.salidas.slice() };
    q.forEach(function (b) {
      if (e.salidas.some(function (s) { return s.id === b.id; })) return;
      var calc = C.calcular(e);
      e.salidas.push({ id: b.id, fecha: conFecha(b.fecha), diametro: b.diametro, cantidad: b.cantidad, elemento: b.elemento, marca: b.marca || '',
        kg: C.kgSalida(calc, b.elemento, b.diametro, b.cantidad, b.marca || ''), usuario: b.usuario, obs: b.obs || '', estado: 'ACTIVA', pendiente: true });
    });
    return e;
  }

  window.Api = {
    remoto: remoto,
    sesion: function () { return leer(K.ses, null); },
    salir: function () { localStorage.removeItem(K.ses); },

    login: function (nombre, pin) {
      nombre = (nombre || '').trim();
      if (!nombre) return Promise.resolve({ ok: false, error: 'Escriba su nombre' });
      var fin = function (rol) {
        var ses = { nombre: nombre, pin: String(pin), rol: rol };
        guardar(K.ses, ses);
        return { ok: true, ses: ses };
      };
      if (!remoto) {
        var rol = pin === CFG.PIN_LOCAL_ADMIN ? 'admin' : pin === CFG.PIN_LOCAL_SUPERVISOR ? 'supervisor' : '';
        return Promise.resolve(rol ? fin(rol) : { ok: false, error: 'PIN incorrecto' });
      }
      return post({ action: 'login', pin: pin }).then(function (r) { return r.ok ? fin(r.rol) : r; })
        .catch(function () { return { ok: false, error: 'Sin conexión con el servidor' }; });
    },

    estado: function (ses) {
      if (!remoto) return Promise.resolve({ ok: true, estado: leer(K.local, vacio()) });
      return post({ action: 'estado', pin: ses.pin }).then(function (r) {
        if (!r.ok) return r;
        guardar(K.cache, r.estado);
        return { ok: true, estado: conCola(r.estado) };
      }).catch(function () {
        var c = leer(K.cache, null);
        return c ? { ok: true, estado: conCola(c), offline: true } : { ok: false, error: 'Sin conexión y sin datos guardados en este celular' };
      });
    },

    cargarDLI: function (ses, parsed, pedido) {
      pedido = String(pedido).trim();
      var loadId = uid('L');
      var entradas = C.aEntradas(parsed, pedido, loadId, ahora());
      if (!remoto) {
        var s = leer(K.local, vacio());
        if (s.pedidos.some(function (p) { return p.pedido === pedido && p.estructura === parsed.nombre; }))
          return Promise.resolve({ ok: false, error: 'Ya está cargado el pedido ' + pedido + ' para ' + parsed.nombre });
        s.entradas = s.entradas.concat(entradas);
        s.pedidos.push({ loadId: loadId, pedido: pedido, estructura: parsed.nombre, descripcion: parsed.descripcion, proyecto: parsed.proyecto,
          archivo: parsed.archivo, fecha: ahora(), usuario: ses.nombre, piezas: parsed.totalPiezas, kg: parsed.totalKg });
        guardar(K.local, s);
        return Promise.resolve({ ok: true });
      }
      return post({ action: 'cargarDLI', pin: ses.pin, usuario: ses.nombre, loadId: loadId, pedido: pedido, estructura: parsed.nombre,
        descripcion: parsed.descripcion, proyecto: parsed.proyecto, archivo: parsed.archivo, entradas: entradas })
        .catch(function () { return { ok: false, error: 'Sin conexión: la carga de un DLI necesita internet' }; });
    },

    salida: function (ses, d) {
      var id = d.id || uid('S');
      var marca = d.marca || '';
      if (!remoto) {
        var s = leer(K.local, vacio());
        var calc = C.calcular(s);
        var err = C.validarSalida(calc, d.elemento, d.diametro, d.cantidad, marca);
        if (err) return Promise.resolve({ ok: false, error: err });
        s.salidas.push({ id: id, fecha: conFecha(d.fecha), diametro: d.diametro, cantidad: d.cantidad, elemento: d.elemento, marca: marca,
          kg: C.kgSalida(calc, d.elemento, d.diametro, d.cantidad, marca), usuario: ses.nombre, obs: d.obs || '', estado: 'ACTIVA' });
        guardar(K.local, s);
        return Promise.resolve({ ok: true });
      }
      var body = { action: 'salida', pin: ses.pin, usuario: ses.nombre, id: id, diametro: d.diametro, cantidad: d.cantidad,
        elemento: d.elemento, marca: marca, obs: d.obs || '', fecha: conFecha(d.fecha) };
      return post(body).catch(function () {
        var q = leer(K.cola, []), nb = JSON.parse(JSON.stringify(body)); delete nb.pin; q.push(nb); guardar(K.cola, q); // el PIN no se guarda en la cola
        return { ok: true, pendiente: true };
      });
    },

    anularSalida: function (ses, id) {
      if (!remoto) {
        var s = leer(K.local, vacio());
        s.salidas.forEach(function (x) { if (x.id === id) x.estado = 'ANULADA'; });
        guardar(K.local, s); return Promise.resolve({ ok: true });
      }
      return post({ action: 'anularSalida', pin: ses.pin, id: id }).catch(function () { return { ok: false, error: 'Sin conexión' }; });
    },

    anularCarga: function (ses, loadId) {
      if (!remoto) {
        var s = leer(K.local, vacio());
        var c = s.pedidos.filter(function (p) { return p.loadId === loadId; })[0];
        if (!c) return Promise.resolve({ ok: false, error: 'No se encontró la carga' });
        if (s.salidas.some(function (x) { return x.estado !== 'ANULADA' && x.elemento === c.estructura; }))
          return Promise.resolve({ ok: false, error: 'No se puede anular: ' + c.estructura + ' ya tiene salidas. Anule primero las salidas.' });
        s.entradas = s.entradas.filter(function (e) { return e.loadId !== loadId; });
        s.pedidos = s.pedidos.filter(function (p) { return p.loadId !== loadId; });
        guardar(K.local, s); return Promise.resolve({ ok: true });
      }
      return post({ action: 'anularCarga', pin: ses.pin, loadId: loadId }).catch(function () { return { ok: false, error: 'Sin conexión' }; });
    },

    // Cola de salidas hechas sin señal
    pendientes: function () { return leer(K.cola, []).length; },
    erroresCola: function () { return leer(K.err, []); },
    limpiarErroresCola: function () { guardar(K.err, []); },
    flush: function (ses) {
      var q = leer(K.cola, []);
      if (!remoto || !q.length) return Promise.resolve({ enviadas: 0 });
      var enviadas = 0, quedan = [], errores = leer(K.err, []);
      return q.reduce(function (p, b, i) {
        return p.then(function () {
          if (quedan.length) return;
          return post(Object.assign({}, b, { pin: ses.pin })).then(function (r) { if (r.ok) enviadas++; else errores.push({ body: b, error: r.error }); })
            .catch(function () { quedan = q.slice(i); });
        });
      }, Promise.resolve()).then(function () {
        guardar(K.cola, quedan); guardar(K.err, errores);
        return { enviadas: enviadas, quedan: quedan.length, errores: errores.length };
      });
    },

    // Solo modo local: borrar los datos de prueba de este navegador
    borrarLocal: function () { localStorage.removeItem(K.local); }
  };
})();
