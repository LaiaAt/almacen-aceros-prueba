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
  Salidas: ['id', 'fecha', 'diametro', 'cantidad', 'elemento', 'marca', 'kg', 'usuario', 'obs', 'estado']
};
// Columnas que SIEMPRE deben quedar como texto (evita que "1.10" pase a 1.1 o "1/2" a una fecha).
var TEXTO = {
  Pedidos: ['loadId', 'pedido', 'estructura', 'descripcion', 'proyecto', 'archivo', 'fecha', 'usuario'],
  Entradas: ['loadId', 'pedido', 'estructura', 'marca', 'diametro', 'fecha'],
  Salidas: ['id', 'fecha', 'diametro', 'elemento', 'marca', 'usuario', 'obs', 'estado']
};

/** Ejecutar una vez: crea las hojas y los PIN iniciales (cámbielos luego). */
function configurar() {
  asegurarHojas_();
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty('ADMIN_PIN')) p.setProperty('ADMIN_PIN', String(100000 + Math.floor(Math.random() * 900000)));
  if (!p.getProperty('SUP_PIN')) p.setProperty('SUP_PIN', String(100000 + Math.floor(Math.random() * 900000)));
  Logger.log('Listo. PIN generados al azar: vea/cámbielos en Propiedades de la secuencia de comandos (ADMIN_PIN, SUP_PIN).');
}

function doGet(e) { return responder_(manejar_(e && e.parameter ? e.parameter : {})); }
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
      case 'anularSalida': return rol === 'admin' ? anularSalida_(req) : { ok: false, error: 'Solo el administrador puede anular' };
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
    salidas: num(strs(leer_('Salidas'), ['id', 'fecha', 'diametro', 'elemento', 'marca', 'estado']), ['cantidad', 'kg'])
  };
}

// ---------- Acciones ----------
function ahora_() { return Utilities.formatDate(new Date(), 'America/Bogota', "yyyy-MM-dd'T'HH:mm:ss"); }

function cargarDLI_(req) {
  var pedido = String(req.pedido || '').trim();
  if (!pedido) return { ok: false, error: 'Falta el número de pedido' };
  var entradas = req.entradas || [];
  if (!entradas.length) return { ok: false, error: 'El DLI no trae piezas' };
  var est = String(req.estructura || '').trim();
  var existentes = leer_('Pedidos');
  for (var i = 0; i < existentes.length; i++) {
    if (String(existentes[i].pedido) === pedido && String(existentes[i].estructura) === est)
      return { ok: false, error: 'Ya está cargado el pedido ' + pedido + ' para ' + est };
  }
  var loadId = req.loadId || ('L' + new Date().getTime());
  var fecha = ahora_();
  var piezas = 0, kg = 0;
  var filas = entradas.map(function (e) {
    piezas += Number(e.cantidad) || 0; kg += Number(e.kg) || 0;
    return { loadId: loadId, pedido: pedido, estructura: est, marca: String(e.marca), diametro: String(e.diametro),
      cantidad: Number(e.cantidad), largo: Number(e.largo) || 0, kgUnit: Number(e.kgUnit) || 0, kg: Number(e.kg) || 0, fecha: fecha };
  });
  agregar_('Entradas', filas);
  agregar_('Pedidos', [{ loadId: loadId, pedido: pedido, estructura: est, descripcion: req.descripcion || '', proyecto: req.proyecto || '',
    archivo: req.archivo || '', fecha: fecha, usuario: req.usuario || '', piezas: piezas, kg: Math.round(kg * 100) / 100 }]);
  return { ok: true, loadId: loadId, piezas: piezas, kg: Math.round(kg * 100) / 100 };
}

function saldo_(estado, elemento, diametro, marca) {
  var p = 0, kg = 0;
  estado.entradas.forEach(function (e) {
    if (e.estructura === elemento && e.diametro === diametro && (!marca || e.marca === marca)) { p += e.cantidad; kg += e.kg; }
  });
  estado.salidas.forEach(function (s) {
    if (s.estado !== 'ANULADA' && s.elemento === elemento && s.diametro === diametro && (!marca || s.marca === marca)) { p -= s.cantidad; kg -= s.kg; }
  });
  return { piezas: p, kg: kg };
}

function registrarSalida_(req) {
  var estado = leerTodo_();
  var id = String(req.id || ('S' + new Date().getTime()));
  for (var i = 0; i < estado.salidas.length; i++) if (estado.salidas[i].id === id) return { ok: true, repetida: true, id: id }; // reintento: ya existe
  var elemento = String(req.elemento || ''), diametro = String(req.diametro || ''), marca = String(req.marca || '');
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
  var fila = { id: id, fecha: ahora_(), diametro: diametro, cantidad: cant, elemento: elemento, marca: marca, kg: kg,
    usuario: String(req.usuario || ''), obs: String(req.obs || ''), estado: 'ACTIVA' };
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
    if (String(ids[i][0]) === String(req.id)) { sh.getRange(i + 2, col).setValue('ANULADA'); return { ok: true }; }
  }
  return { ok: false, error: 'No se encontró la salida' };
}

function anularCarga_(req) {
  var estado = leerTodo_();
  var carga = estado.pedidos.filter(function (p) { return p.loadId === String(req.loadId); })[0];
  if (!carga) return { ok: false, error: 'No se encontró la carga' };
  var conSalidas = estado.salidas.some(function (s) { return s.estado !== 'ANULADA' && s.elemento === carga.estructura; });
  if (conSalidas) return { ok: false, error: 'No se puede anular: ' + carga.estructura + ' ya tiene salidas. Anule primero las salidas.' };
  ['Entradas', 'Pedidos'].forEach(function (nombre) {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre);
    var n = sh.getLastRow();
    for (var i = n; i >= 2; i--) if (String(sh.getRange(i, 1).getValue()) === String(req.loadId)) sh.deleteRow(i);
  });
  return { ok: true };
}
