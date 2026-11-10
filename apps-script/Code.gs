/**
 * Almacén de aceros (prueba) — Backend en Google Apps Script
 * Autor: Carlos Eduardo Bermúdez Castro
 *
 * Guarda los datos en las hojas Pedidos, Entradas y Salidas del Google Sheet donde se pegue este script.
 * Es un Sheet NUEVO e independiente: no toca Parte diario ni Transportes.
 *
 * Instalación: ver README.md (5 pasos). Después de pegar el código, ejecute UNA vez la función
 * configurar() y cambie los PIN en Configuración del proyecto → Propiedades de la secuencia de comandos.
 */

var HOJAS = {
  Pedidos: ['loadId', 'pedido', 'estructura', 'descripcion', 'proyecto', 'archivo', 'fecha', 'usuario', 'piezas', 'kg'],
  Entradas: ['loadId', 'pedido', 'estructura', 'marca', 'diametro', 'cantidad', 'largo', 'kgUnit', 'kg', 'fecha'],
  Salidas: ['id', 'fecha', 'diametro', 'cantidad', 'elemento', 'marca', 'kg', 'usuario', 'obs', 'estado', 'fase', 'modo', 'pct', 'tipo']
};
// Columnas que SIEMPRE deben quedar como texto (evita que "1.10" pase a 1.1 o "1/2" a una fecha).
var TEXTO = {
  Pedidos: ['loadId', 'pedido', 'estructura', 'descripcion', 'proyecto', 'archivo', 'fecha', 'usuario'],
  Entradas: ['loadId', 'pedido', 'estructura', 'marca', 'diametro', 'fecha'],
  Salidas: ['id', 'fecha', 'diametro', 'elemento', 'marca', 'usuario', 'obs', 'estado', 'fase', 'modo', 'tipo']
};

/** Ejecutar una vez: crea las hojas y los PIN iniciales (cámbielos luego). */
function configurar() {
  asegurarHojas_();
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty('ADMIN_PIN')) p.setProperty('ADMIN_PIN', String(100000 + Math.floor(Math.random() * 900000)));
  if (!p.getProperty('SUP_PIN')) p.setProperty('SUP_PIN', String(100000 + Math.floor(Math.random() * 900000)));
  Logger.log('Listo. PIN generados al azar: vea/cámbielos en Propiedades de la secuencia de comandos (ADMIN_PIN, SUP_PIN).');
}

// Solo POST: por GET el PIN viajaría en la URL (queda en historiales y registros).
function doGet() { return responder_({ ok: false, error: 'Use POST' }); }
function doPost(e) {
  var req = {};
  try { req = JSON.parse(e.postData.contents); } catch (err) { return responder_({ ok: false, error: 'Solicitud inválida' }); }
  return responder_(manejar_(req));
}

function responder_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function rolDe_(pin) {
  var p = PropertiesService.getScriptProperties();
  pin = String(pin || '');
  if (pin && pin === p.getProperty('ADMIN_PIN')) return 'admin';
  if (pin && pin === p.getProperty('SUP_PIN')) return 'supervisor';
  return '';
}

var MAX_FALLOS = 5, BLOQUEO_SEG = 900;
function manejar_(req) {
  var cache = CacheService.getScriptCache();
  var fallos = Number(cache.get('fallos') || 0);
  if (fallos >= MAX_FALLOS) return { ok: false, error: 'Demasiados intentos fallidos. Espere 15 minutos.' };
  var rol = rolDe_(req.pin);
  if (!rol) {
    cache.put('fallos', String(fallos + 1), BLOQUEO_SEG);
    return { ok: false, error: 'PIN incorrecto' };
  }
  if (fallos) cache.remove('fallos');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    asegurarHojas_();
    switch (req.action) {
      case 'login': return { ok: true, rol: rol };
      case 'estado': return { ok: true, rol: rol, estado: leerTodo_() };
      case 'cargarDLI': return rol === 'admin' ? cargarDLI_(req) : { ok: false, error: 'Solo el administrador puede cargar un DLI' };
      case 'salida': return registrarSalida_(req);
      case 'salidaLote': return registrarSalidaLote_(req);
      case 'anularSalida': return anularSalida_(req);
      case 'anularCarga': return rol === 'admin' ? anularCarga_(req) : { ok: false, error: 'Solo el administrador puede anular una carga' };
      default: return { ok: false, error: 'Acción desconocida' };
    }
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  } finally {
    lock.releaseLock();
  }
}

// ---------- Hojas ----------
function asegurarHojas_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(HOJAS).forEach(function (nombre) {
    var sh = ss.getSheetByName(nombre);
    if (!sh) {
      sh = ss.insertSheet(nombre);
      sh.getRange(1, 1, 1, HOJAS[nombre].length).setValues([HOJAS[nombre]]).setFontWeight('bold');
      sh.setFrozenRows(1);
      TEXTO[nombre].forEach(function (col) {
        var c = HOJAS[nombre].indexOf(col) + 1;
        sh.getRange(1, c, sh.getMaxRows(), 1).setNumberFormat('@');
      });
      sh.getRange(1, 1, 1, HOJAS[nombre].length).setNumberFormat('@');
    }
  });
  // Migración: hojas creadas antes de agregar columnas nuevas (fase, modo, pct)
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('MIGRADO_V3')) {
  Object.keys(HOJAS).forEach(function (nombre) {
    var sh2 = ss.getSheetByName(nombre), cols = HOJAS[nombre];
    var cab = sh2.getRange(1, 1, 1, cols.length).getValues()[0];
    var falta = false;
    cols.forEach(function (c, i) { if (cab[i] !== c) falta = true; });
    if (falta) {
      sh2.getRange(1, 1, 1, cols.length).setNumberFormat('@').setValues([cols]).setFontWeight('bold');
      TEXTO[nombre].forEach(function (col) { sh2.getRange(2, cols.indexOf(col) + 1, sh2.getMaxRows() - 1, 1).setNumberFormat('@'); });
    }
  });
  props.setProperty('MIGRADO_V3', '1');
  }
  var h1 = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1');
  if (h1 && ss.getSheets().length > 1 && h1.getLastRow() === 0) ss.deleteSheet(h1);
}

function leer_(nombre) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre);
  var n = sh.getLastRow();
  if (n < 2) return [];
  var cols = HOJAS[nombre];
  var vals = sh.getRange(2, 1, n - 1, cols.length).getValues();
  return vals.map(function (f) {
    var o = {};
    cols.forEach(function (c, i) { o[c] = f[i]; });
    return o;
  });
}
function agregar_(nombre, objs) {
  if (!objs.length) return;
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre);
  var cols = HOJAS[nombre];
  var filas = objs.map(function (o) { return cols.map(function (c) { return o[c] === undefined || o[c] === null ? '' : o[c]; }); });
  sh.getRange(sh.getLastRow() + 1, 1, filas.length, cols.length).setValues(filas);
}

function leerTodo_() {
  var num = function (a, ks) { return a.map(function (o) { ks.forEach(function (k) { o[k] = Number(o[k]) || 0; }); return o; }); };
  var strs = function (a, ks) { return a.map(function (o) { ks.forEach(function (k) { o[k] = String(o[k]); }); return o; }); };
  return {
    pedidos: num(strs(leer_('Pedidos'), ['loadId', 'pedido', 'estructura', 'fecha']), ['piezas', 'kg']),
    entradas: num(strs(leer_('Entradas'), ['loadId', 'pedido', 'estructura', 'marca', 'diametro', 'fecha']), ['cantidad', 'largo', 'kgUnit', 'kg']),
    salidas: num(strs(leer_('Salidas'), ['id', 'fecha', 'diametro', 'elemento', 'marca', 'estado', 'fase', 'modo', 'tipo']), ['cantidad', 'kg', 'pct']).map(function (s) { s.tipo = s.tipo === 'ARMADO' ? 'ARMADO' : 'SALIDA'; return s; })
  };
}

// ---------- Validación de entradas (el servidor nunca confía en la app) ----------
var MAX_FILAS_DLI = 3000;
/** Texto seguro: recorta, quita control y evita que una celda se interprete como fórmula (=, +, -, @). */
function txt_(v, max) {
  var s = String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max || 120);
  return /^[=+\-@]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s) ? "'" + s : s;
}
/** Número finito y no negativo, o error. */
function num_(v, nombre, max) {
  var n = Number(v);
  if (!isFinite(n) || n < 0 || n > (max || 1e7)) throw new Error('Valor inválido en ' + nombre);
  return n;
}

// ---------- Acciones ----------
function ahora_() { return Utilities.formatDate(new Date(), 'America/Bogota', "yyyy-MM-dd'T'HH:mm:ss"); }

function cargarDLI_(req) {
  var pedido = txt_(req.pedido, 30);
  if (!/^[A-Za-z0-9._\-]{1,30}$/.test(pedido)) return { ok: false, error: 'Número de pedido inválido (use letras, números, punto o guion)' };
  var entradas = Array.isArray(req.entradas) ? req.entradas : [];
  if (!entradas.length) return { ok: false, error: 'El DLI no trae piezas' };
  if (entradas.length > MAX_FILAS_DLI) return { ok: false, error: 'El DLI trae demasiadas filas' };
  var est = txt_(req.estructura, 80);
  if (!est) return { ok: false, error: 'Falta la estructura' };
  var existentes = leer_('Pedidos');
  for (var i = 0; i < existentes.length; i++) {
    // Un DLI es único: una estructura no puede cargarse dos veces (ni con otro pedido).
    if (String(existentes[i].estructura) === est)
      return { ok: false, error: 'Este DLI ya está cargado (' + est + ', pedido ' + existentes[i].pedido + '). No se permite repetirlo.' };
  }
  var loadId = /^[A-Za-z0-9_\-]{1,40}$/.test(String(req.loadId || '')) ? String(req.loadId) : ('L' + new Date().getTime());
  var fecha = ahora_();
  var piezas = 0, kg = 0;
  var filas = entradas.map(function (e) {
    var cant = num_(e.cantidad, 'cantidad', 100000), k = num_(e.kg, 'kg', 1e7);
    piezas += cant; kg += k;
    return { loadId: loadId, pedido: pedido, estructura: est, marca: txt_(e.marca, 20), diametro: txt_(e.diametro, 12),
      cantidad: cant, largo: num_(e.largo || 0, 'largo', 1000), kgUnit: num_(e.kgUnit || 0, 'kgUnit', 1e5), kg: k, fecha: fecha };
  });
  agregar_('Entradas', filas);
  agregar_('Pedidos', [{ loadId: loadId, pedido: pedido, estructura: est, descripcion: txt_(req.descripcion, 120), proyecto: txt_(req.proyecto, 120),
    archivo: txt_(req.archivo, 120), fecha: fecha, usuario: txt_(req.usuario, 60), piezas: piezas, kg: Math.round(kg * 100) / 100 }]);
  return { ok: true, loadId: loadId, piezas: piezas, kg: Math.round(kg * 100) / 100 };
}

function saldo_(estado, elemento, diametro, marca) {
  var p = 0, kg = 0;
  estado.entradas.forEach(function (e) {
    if (e.estructura === elemento && e.diametro === diametro && (!marca || e.marca === marca)) { p += e.cantidad; kg += e.kg; }
  });
  estado.salidas.forEach(function (s) {
    if (s.estado !== 'ANULADA' && s.tipo !== 'ARMADO' && s.elemento === elemento && s.diametro === diametro && (!marca || s.marca === marca)) { p -= s.cantidad; kg -= s.kg; }
  });
  return { piezas: p, kg: kg };
}

/** Piezas ARMADAS vigentes de una posición (lo armado sigue en almacén; al salir, sale primero lo armado). */
function armado_(estado, elemento, diametro, marca) {
  var inP = 0, arm = 0, out = 0;
  estado.entradas.forEach(function (e) { if (e.estructura === elemento && e.diametro === diametro && e.marca === marca) inP += e.cantidad; });
  estado.salidas.forEach(function (s) {
    if (s.estado === 'ANULADA' || s.elemento !== elemento || s.diametro !== diametro || s.marca !== marca) return;
    if (s.tipo === 'ARMADO') arm += Math.max(0, Math.min(s.cantidad, inP - out - arm));
    else { arm -= Math.min(arm, s.cantidad); out += s.cantidad; }
  });
  return arm;
}

function registrarSalida_(req) {
  var estado = leerTodo_();
  var id = /^[A-Za-z0-9_\-]{1,60}$/.test(String(req.id || '')) ? String(req.id) : ('S' + new Date().getTime());
  for (var i = 0; i < estado.salidas.length; i++) if (estado.salidas[i].id === id) return { ok: true, repetida: true, id: id }; // reintento: ya existe
  var elemento = txt_(req.elemento, 80), diametro = txt_(req.diametro, 12), marca = txt_(req.marca, 20);
  var cant = Number(req.cantidad);
  if (!elemento || !diametro) return { ok: false, error: 'Falta el elemento o el diámetro' };
  if (!(cant > 0) || Math.floor(cant) !== cant) return { ok: false, error: 'La cantidad debe ser un entero mayor que 0' };
  var pool = saldo_(estado, elemento, diametro, '');
  if (cant > pool.piezas) return { ok: false, error: 'Solo hay ' + pool.piezas + ' de ' + diametro + '" en ' + elemento };
  var ref = pool;
  if (marca) {
    ref = saldo_(estado, elemento, diametro, marca);
    if (cant > ref.piezas) return { ok: false, error: 'Solo hay ' + ref.piezas + ' de la marca ' + marca };
  }
  var kg = cant >= ref.piezas ? ref.kg : (ref.kg / ref.piezas) * cant;
  kg = Math.round(kg * 1000) / 1000;
  var fecha = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/.test(String(req.fecha || '')) ? String(req.fecha) : ahora_();
  var fila = { id: id, fecha: fecha, diametro: diametro, cantidad: cant, elemento: elemento, marca: marca, kg: kg,
    usuario: txt_(req.usuario, 60), obs: txt_(req.obs, 120), estado: 'ACTIVA' };
  agregar_('Salidas', [fila]);
  return { ok: true, salida: fila };
}

function anularSalida_(req) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Salidas');
  var n = sh.getLastRow();
  if (n < 2) return { ok: false, error: 'No hay salidas' };
  var ids = sh.getRange(2, 1, n - 1, 1).getValues();
  var col = HOJAS.Salidas.indexOf('estado') + 1;
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(req.id)) {
      var fch = String(sh.getRange(i + 2, 2).getValue()).slice(0, 10);
      if (fch !== ahora_().slice(0, 10)) return { ok: false, error: 'Solo se puede anular una salida el mismo día en que se registró' };
      sh.getRange(i + 2, col).setValue('ANULADA'); return { ok: true };
    }
  }
  return { ok: false, error: 'No se encontró la salida' };
}

function anularCarga_(req) {
  var estado = leerTodo_();
  var carga = estado.pedidos.filter(function (p) { return p.loadId === String(req.loadId); })[0];
  if (!carga) return { ok: false, error: 'No se encontró la carga' };
  if (String(carga.fecha).slice(0, 10) !== ahora_().slice(0, 10)) return { ok: false, error: 'Solo se puede anular una carga el mismo día en que se registró' };
  var conSalidas = estado.salidas.some(function (s) { return s.estado !== 'ANULADA' && s.elemento === carga.estructura; });
  if (conSalidas) return { ok: false, error: 'No se puede anular: ' + carga.estructura + ' ya tiene salidas. Anule primero las salidas.' };
  ['Entradas', 'Pedidos'].forEach(function (nombre) {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre);
    var n = sh.getLastRow();
    for (var i = n; i >= 2; i--) if (String(sh.getRange(i, 1).getValue()) === String(req.loadId)) sh.deleteRow(i);
  });
  return { ok: true };
}

/** Varias posiciones en UNA sola llamada: se valida todo y se escribe todo junto (o nada). */
function registrarSalidaLote_(req) {
  var items = Array.isArray(req.items) ? req.items : [];
  if (!items.length) return { ok: false, error: 'No hay piezas en la salida' };
  if (items.length > 300) return { ok: false, error: 'Demasiadas posiciones en una salida' };
  var base = /^[A-Za-z0-9_\-]{1,50}$/.test(String(req.grupo || '')) ? String(req.grupo) : ('S' + new Date().getTime());
  var estado = leerTodo_();
  for (var i = 0; i < estado.salidas.length; i++) if (estado.salidas[i].id === base + '-1') return { ok: true, repetida: true, id: base };
  var fecha = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/.test(String(req.fecha || '')) ? String(req.fecha) : ahora_();
  var usuario = txt_(req.usuario, 60), obs = txt_(req.obs, 120), filas = [];
  var tipo = req.tipo === 'ARMADO' ? 'ARMADO' : 'SALIDA';
  var modo = req.modo === 'PCT' ? 'PCT' : 'POS', fase = txt_(req.fase, 60), pct = modo === 'PCT' ? num_(req.pct || 0, 'porcentaje', 100) : 0;
  if (modo === 'POS' && Number(req.v) >= 2 && !fase) return { ok: false, error: 'Falta la fase' };
  for (var n = 0; n < items.length; n++) {
    var it = items[n] || {};
    var elemento = txt_(it.elemento, 80), diametro = txt_(it.diametro, 12), marca = txt_(it.marca, 20), cant = Number(it.cantidad);
    if (!elemento || !diametro) return { ok: false, error: 'Falta la estructura o el diámetro' };
    if (!(cant > 0) || Math.floor(cant) !== cant) return { ok: false, error: 'La cantidad debe ser un entero mayor que 0' };
    var pool = saldo_(estado, elemento, diametro, '');
    if (cant > pool.piezas) return { ok: false, error: 'Solo hay ' + pool.piezas + ' de ' + diametro + '" en ' + elemento };
    var ref = pool;
    if (tipo === 'ARMADO') {
      if (!marca) return { ok: false, error: 'Falta la posición' };
      var libres = saldo_(estado, elemento, diametro, marca).piezas - armado_(estado, elemento, diametro, marca);
      if (cant > libres) return { ok: false, error: 'Solo hay ' + libres + ' libres de la posición ' + marca };
    }
    if (marca) { ref = saldo_(estado, elemento, diametro, marca); if (cant > ref.piezas) return { ok: false, error: 'Solo hay ' + ref.piezas + ' de la posición ' + marca }; }
    var kg = Math.round((cant >= ref.piezas ? ref.kg : (ref.kg / ref.piezas) * cant) * 1000) / 1000;
    var fila = { id: base + '-' + (n + 1), fecha: fecha, diametro: diametro, cantidad: cant, elemento: elemento, marca: marca, kg: kg, usuario: usuario, obs: obs, estado: 'ACTIVA', fase: fase, modo: modo, pct: pct, tipo: tipo };
    estado.salidas.push(fila); filas.push(fila);
  }
  agregar_('Salidas', filas);
  return { ok: true, grupo: base, filas: filas.length };
}
