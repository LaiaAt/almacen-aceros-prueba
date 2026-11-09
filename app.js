/* Almacén de aceros (prueba) — interfaz. Autor: Carlos Eduardo Bermúdez Castro */
(function () {
  'use strict';
  var C = window.AcerosCore, Api = window.Api, CFG = window.ACEROS_CONFIG;

  var S = {
    ses: null, estado: { pedidos: [], entradas: [], salidas: [] }, calc: null, tab: 'panel', offline: false, enviando: false,
    sal: { diam: '', elem: '', marca: '', cant: 1, obs: '', msg: '', err: '' },
    inv: { vista: 'diametro', elem: '', diam: '' },
    cargas: [], loginErr: '', loginNom: ''
  };

  // ---------- Utilidades ----------
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function n0(n) { return Number(n || 0).toLocaleString('es-CO'); }
  function kg(n) { return Number(n || 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function fecha(f) {
    var m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/.exec(f || '');
    return m ? m[3] + '/' + m[2] + ' ' + m[4] + ':' + m[5] : (f || '');
  }
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.className = 'v';
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.className = ''; }, 3200);
  }
  function cmpMarca(a, b) {
    var f = function (x) { var m = /^(\d+)([a-z]?)(?:\.(\d+))?$/.exec(x); return m ? [+m[1], m[2] || '', +(m[3] || 0)] : [9999, x, 0]; };
    var x = f(a), y = f(b);
    return x[0] - y[0] || (x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : 0) || x[2] - y[2];
  }
  var esAdmin = function () { return S.ses && S.ses.rol === 'admin'; };

  // ---------- Vistas ----------
  function vLogin() {
    return '<div class="login"><div class="marca"><img src="icons/icon-192.png" alt=""><h1>' + esc(CFG.TITULO) + '</h1>' +
      (Api.remoto ? '' : '<span class="insignia">Modo local de prueba</span>') + '</div>' +
      '<form id="f-login" class="card"><label class="f" for="l-nom">Su nombre</label>' +
      '<input id="l-nom" type="text" autocomplete="name" placeholder="Ej. Juan Pérez" value="' + esc(S.loginNom || (Api.sesion() || {}).nombre || '') + '">' +
      '<label class="f" for="l-pin">PIN</label><input id="l-pin" type="password" inputmode="numeric" autocomplete="current-password" placeholder="••••">' +
      (S.loginErr ? '<div class="error">' + esc(S.loginErr) + '</div>' : '') +
      '<div style="margin-top:16px"><button class="btn blk" type="submit">Entrar</button></div></form>' +
      '<div class="pie">Autor: Carlos Eduardo Bermúdez Castro</div></div>';
  }

  function vTop() {
    return '<header class="top"><img class="logo" src="icons/icon-192.png" alt=""><div class="tit"><b>' + esc(CFG.TITULO) + '</b><span>' +
      esc(S.ses.nombre) + ' · ' + (esAdmin() ? 'Administrador' : 'Supervisor') + (Api.remoto ? '' : ' · modo local') + '</span></div>' +
      '<button class="ibtn" data-a="refrescar" title="Actualizar">⟳</button><button class="ibtn" data-a="salir" title="Salir">⏻</button></header>';
  }

  function vBandas() {
    var h = '', pend = Api.pendientes(), errs = Api.erroresCola();
    if (!Api.remoto) h += '<div class="banda info">Modo local de prueba: los datos solo existen en este navegador.</div>';
    if (S.offline) h += '<div class="banda warn">Sin conexión: se muestran los últimos datos guardados en este celular.</div>';
    if (pend) h += '<div class="banda warn">' + pend + ' salida(s) sin enviar por falta de señal. Se envían solas al volver la conexión.<button class="btn chico" data-a="enviarCola">Enviar ahora</button></div>';
    if (errs.length) h += '<div class="banda bad"><div>' + errs.map(function (e) { return 'No se pudo registrar ' + esc(e.body.cantidad) + ' × ' + esc(e.body.diametro) + '" en ' + esc(e.body.elemento) + ': ' + esc(e.error); }).join('<br>') + '</div><button class="btn chico sec" data-a="limpiarErrores">Entendido</button></div>';
    return h;
  }

  function vTabs() {
    var T = [['panel', '📊', 'Panel'], ['salida', '📤', 'Salida'], ['inv', '📦', 'Inventario'], ['mov', '🧾', 'Movimientos']];
    if (esAdmin()) T.push(['cargar', '📥', 'Cargar DLI']);
    return '<nav class="tabs">' + T.map(function (t) {
      return '<button class="' + (S.tab === t[0] ? 'on' : '') + '" data-a="tab" data-v="' + t[0] + '"><span>' + t[1] + '</span>' + t[2] + '</button>';
    }).join('') + '</nav>';
  }

  function sinInventario() {
    return '<div class="card vacio"><b>Aún no hay acero en el inventario.</b><br>' + (esAdmin()
      ? '<p>Cargue un archivo .dli y asígnele su número de pedido.</p><button class="btn" data-a="tab" data-v="cargar">Cargar DLI</button>'
      : '<p>El administrador debe cargar primero un DLI.</p>') + '</div>';
  }

  function movimientos() {
    var L = [];
    S.estado.pedidos.forEach(function (p) { L.push({ t: 'E', f: p.fecha, p: p }); });
    S.estado.salidas.forEach(function (s) { L.push({ t: 'S', f: s.fecha, s: s }); });
    L.sort(function (a, b) { return a.f < b.f ? 1 : a.f > b.f ? -1 : 0; });
    return L;
  }

  function vMov(m, conAcciones) {
    if (m.t === 'E') {
      var p = m.p;
      return '<div class="mov"><div class="ic e">+</div><div class="cu"><b>Carga DLI · ' + esc(p.estructura) + '</b><span>Pedido ' + esc(p.pedido) + ' · ' + n0(p.piezas) + ' pzs · ' + kg(p.kg) + ' kg · ' + esc(p.usuario) + ' · ' + fecha(p.fecha) + '</span></div>' +
        (conAcciones && esAdmin() ? '<button class="btn chico sec" data-a="anularCarga" data-v="' + esc(p.loadId) + '">Anular</button>' : '') + '</div>';
    }
    var s = m.s, an = s.estado === 'ANULADA';
    return '<div class="mov' + (an ? ' anul' : '') + '"><div class="ic ' + (an ? 'a' : 's') + '">−</div><div class="cu"><b>' + n0(s.cantidad) + ' × ' + esc(C.diamLabel(s.diametro)) + ' · ' + esc(s.elemento) +
      (s.pendiente ? '<span class="tag pend">sin enviar</span>' : '') + (an ? '<span class="tag">anulada</span>' : '') + '</b><span>' + kg(s.kg) + ' kg' + (s.marca ? ' · marca ' + esc(s.marca) : '') + ' · ' + esc(s.usuario) + ' · ' + fecha(s.fecha) + (s.obs ? ' · ' + esc(s.obs) : '') + '</span></div>' +
      (conAcciones && esAdmin() && !an && !s.pendiente ? '<button class="btn chico sec" data-a="anularSalida" data-v="' + esc(s.id) + '">Anular</button>' : '') + '</div>';
  }

  function vPanel() {
    if (!S.estado.entradas.length) return sinInventario();
    var c = S.calc, t = c.tot;
    var diams = Object.keys(c.porDiam).sort(function (a, b) { return C.diamOrder(a) - C.diamOrder(b); });
    var h = '<div class="grid kpis">' +
      '<div class="kpi ent"><small>Ingresado</small><b class="num">' + kg(t.in_kg) + '</b><span>kg · ' + n0(t.in_p) + ' piezas</span></div>' +
      '<div class="kpi sal"><small>Salido</small><b class="num">' + kg(t.out_kg) + '</b><span>kg · ' + n0(t.out_p) + ' piezas</span></div>' +
      '<div class="kpi sdo"><small>Saldo en almacén</small><b class="num">' + kg(t.sal_kg) + '</b><span>kg</span></div>' +
      '<div class="kpi sdo"><small>Piezas en almacén</small><b class="num">' + n0(t.sal_p) + '</b><span>de ' + n0(t.in_p) + ' ingresadas</span></div></div>';
    h += '<div class="grid dos" style="margin-top:14px"><div class="card"><h2>Saldo por tipo de varilla</h2>';
    diams.forEach(function (d) {
      var x = c.porDiam[d], pct = x.in_p ? Math.round(100 * x.sal_p / x.in_p) : 0;
      h += '<div class="fila-d"><b>' + esc(C.diamLabel(d)) + '</b><div><div class="barra"><i style="width:' + pct + '%"></i></div><span class="peq mut">salió ' + n0(x.out_p) + ' de ' + n0(x.in_p) + '</span></div>' +
        '<div class="der num"><b>' + n0(x.sal_p) + '</b> pzs<br><span class="peq mut">' + kg(x.sal_kg) + ' kg</span></div></div>';
    });
    h += '</div><div class="card"><h2>Por elemento</h2><div class="tw"><table><thead><tr><th>Elemento</th><th class="n">Ingreso</th><th class="n">Salida</th><th class="n">Saldo pzs</th><th class="n">Saldo kg</th></tr></thead><tbody>';
    Object.keys(c.porElem).sort().forEach(function (e) {
      var x = c.porElem[e];
      h += '<tr><td>' + esc(e) + '</td><td class="n">' + n0(x.in_p) + '</td><td class="n">' + n0(x.out_p) + '</td><td class="n"><b>' + n0(x.sal_p) + '</b></td><td class="n">' + kg(x.sal_kg) + '</td></tr>';
    });
    h += '</tbody></table></div></div></div>';
    h += '<div class="card"><h2>Por pedido</h2><div class="tw"><table><thead><tr><th>Pedido</th><th>Elemento</th><th>Fecha</th><th class="n">Piezas</th><th class="n">Kg</th></tr></thead><tbody>';
    S.estado.pedidos.slice().sort(function (a, b) { return a.fecha < b.fecha ? 1 : -1; }).forEach(function (p) {
      h += '<tr><td><b>' + esc(p.pedido) + '</b></td><td>' + esc(p.estructura) + '</td><td>' + fecha(p.fecha) + '</td><td class="n">' + n0(p.piezas) + '</td><td class="n">' + kg(p.kg) + '</td></tr>';
    });
    h += '</tbody></table></div></div>';
    var L = movimientos().slice(0, 8);
    h += '<div class="card"><h2>Últimos movimientos</h2>' + (L.length ? L.map(function (m) { return vMov(m, false); }).join('') : '<div class="vacio">Sin movimientos</div>') + '</div>';
    return h;
  }

  function diamsDisponibles() {
    return Object.keys(S.calc.porDiam).filter(function (d) { return S.calc.porDiam[d].sal_p > 0; })
      .sort(function (a, b) { return C.diamOrder(a) - C.diamOrder(b); });
  }
  function elemsDe(d) {
    var r = [];
    Object.keys(S.calc.porElemDiam).forEach(function (k) {
      var i = k.lastIndexOf('|');
      if (k.slice(i + 1) === d && S.calc.porElemDiam[k].sal_p > 0) r.push(k.slice(0, i));
    });
    return r.sort();
  }
  function marcasDe(e, d) {
    var seen = {}, r = [];
    S.estado.entradas.forEach(function (x) {
      if (x.estructura !== e || x.diametro !== d || seen[x.marca]) return;
      seen[x.marca] = 1;
      var sd = S.calc.porMarca[e + '|' + d + '|' + x.marca];
      if (sd && sd.sal_p > 0) r.push({ marca: x.marca, largo: x.largo, disp: sd.sal_p });
    });
    return r.sort(function (a, b) { return cmpMarca(a.marca, b.marca); });
  }
  function ajustarSalida() {
    var s = S.sal, ds = diamsDisponibles();
    if (ds.indexOf(s.diam) < 0) { s.diam = ''; s.elem = ''; s.marca = ''; }
    if (s.diam) {
      var es = elemsDe(s.diam);
      if (es.indexOf(s.elem) < 0) s.elem = es.length === 1 ? es[0] : '';
      if (s.elem && marcasDe(s.elem, s.diam).every(function (m) { return m.marca !== s.marca; })) s.marca = '';
    }
    var max = maxSalida();
    if (!(s.cant >= 1)) s.cant = 1;
    if (max && s.cant > max) s.cant = max;
  }
  function maxSalida() {
    var s = S.sal;
    return s.elem && s.diam ? C.disponible(S.calc, s.elem, s.diam, s.marca).piezas : 0;
  }
  function resumenSalida() {
    var s = S.sal, max = maxSalida();
    return { max: max, kg: s.elem && s.diam ? C.kgSalida(S.calc, s.elem, s.diam, s.cant, s.marca) : 0 };
  }

  function vSalida() {
    if (!S.estado.entradas.length) return sinInventario();
    ajustarSalida();
    var s = S.sal, ds = diamsDisponibles();
    var h = '<div class="card"><h2>Registrar salida de acero</h2>';
    if (!ds.length) return h + '<div class="vacio">No queda acero disponible en el almacén.</div></div>';
    h += '<label class="f" style="margin-top:0">1. Tipo de varilla</label><div class="chips">';
    ds.forEach(function (d) {
      var x = S.calc.porDiam[d];
      h += '<button class="chip' + (s.diam === d ? ' on' : '') + '" data-a="diam" data-v="' + esc(d) + '"><b>' + esc(C.diamLabel(d)) + '</b><small>' + n0(x.sal_p) + ' pzs · ' + kg(x.sal_kg) + ' kg</small></button>';
    });
    h += '</div>';
    if (s.diam) {
      var es = elemsDe(s.diam);
      h += '<label class="f" for="s-elem">2. Elemento donde se usa</label><select id="s-elem" data-f="sal.elem"><option value="">Seleccione…</option>' +
        es.map(function (e) { return '<option value="' + esc(e) + '"' + (e === s.elem ? ' selected' : '') + '>' + esc(e) + ' — ' + n0(C.disponible(S.calc, e, s.diam, '').piezas) + ' disp.</option>'; }).join('') + '</select>';
    }
    if (s.diam && s.elem) {
      var ms = marcasDe(s.elem, s.diam);
      h += '<label class="f" for="s-marca">Marca (opcional)</label><select id="s-marca" data-f="sal.marca"><option value="">Cualquiera</option>' +
        ms.map(function (m) { return '<option value="' + esc(m.marca) + '"' + (m.marca === s.marca ? ' selected' : '') + '>' + esc(m.marca) + (m.largo ? ' · ' + m.largo + ' m' : '') + ' · ' + n0(m.disp) + ' disp.</option>'; }).join('') + '</select>';
      var r = resumenSalida();
      h += '<label class="f">3. Cantidad de varillas</label><div class="step"><button data-a="menos" aria-label="Menos">−</button>' +
        '<input id="s-cant" type="number" inputmode="numeric" min="1" max="' + r.max + '" value="' + s.cant + '" data-i="sal.cant"><button data-a="mas" aria-label="Más">+</button></div>' +
        '<div class="resumen"><div><small>Disponible</small><b id="r-disp">' + n0(r.max) + ' pzs</b></div><div class="der"><small>Peso estimado</small><b id="r-kg">' + kg(r.kg) + ' kg</b></div></div>' +
        '<label class="f" for="s-obs">Observación (opcional)</label><input id="s-obs" type="text" maxlength="120" placeholder="Ej. losa fondo, turno noche" value="' + esc(s.obs) + '" data-i="sal.obs">';
      if (s.err) h += '<div class="error">' + esc(s.err) + '</div>';
      h += '<div style="margin-top:14px"><button class="btn blk" data-a="registrarSalida">Registrar salida</button></div>';
    }
    if (s.msg) h += '<div class="ok">' + esc(s.msg) + '</div>';
    return h + '</div>';
  }

  function tablaInv(filas, cols) {
    var tot = { in_p: 0, in_kg: 0, out_p: 0, sal_p: 0, sal_kg: 0 };
    var h = '<div class="tw"><table><thead><tr>' + cols.map(function (c) { return '<th' + (c.n ? ' class="n"' : '') + '>' + c.t + '</th>'; }).join('') + '</tr></thead><tbody>';
    filas.forEach(function (f) {
      h += '<tr>' + cols.map(function (c) { return '<td' + (c.n ? ' class="n"' : '') + '>' + c.f(f) + '</td>'; }).join('') + '</tr>';
      tot.in_p += f.x.in_p; tot.in_kg += f.x.in_kg; tot.out_p += f.x.out_p; tot.sal_p += f.x.sal_p; tot.sal_kg += f.x.sal_kg;
    });
    if (filas.length > 1) h += '<tr class="tot">' + cols.map(function (c, i) { return '<td' + (c.n ? ' class="n"' : '') + '>' + (i === 0 ? 'Total' : c.tot ? c.tot(tot) : '') + '</td>'; }).join('') + '</tr>';
    return h + '</tbody></table></div>';
  }

  function vInv() {
    if (!S.estado.entradas.length) return sinInventario();
    var c = S.calc, v = S.inv, filas = [];
    var elems = Object.keys(c.porElem).sort();
    var diams = Object.keys(c.porDiam).sort(function (a, b) { return C.diamOrder(a) - C.diamOrder(b); });
    var base = [{ t: 'Ingreso', n: 1, f: function (f) { return n0(f.x.in_p); }, tot: function (t) { return n0(t.in_p); } },
      { t: 'Ingreso kg', n: 1, f: function (f) { return kg(f.x.in_kg); }, tot: function (t) { return kg(t.in_kg); } },
      { t: 'Salida', n: 1, f: function (f) { return n0(f.x.out_p); }, tot: function (t) { return n0(t.out_p); } },
      { t: 'Saldo', n: 1, f: function (f) { return '<b>' + n0(f.x.sal_p) + '</b>'; }, tot: function (t) { return n0(t.sal_p); } },
      { t: 'Saldo kg', n: 1, f: function (f) { return kg(f.x.sal_kg); }, tot: function (t) { return kg(t.sal_kg); } }];
    var cols;
    if (v.vista === 'diametro') {
      Object.keys(v.elem ? c.porElemDiam : c.porDiam).forEach(function (k) {
        var d = v.elem ? k.slice(k.lastIndexOf('|') + 1) : k, e = v.elem ? k.slice(0, k.lastIndexOf('|')) : '';
        if (v.elem && e !== v.elem) return;
        filas.push({ d: d, x: (v.elem ? c.porElemDiam : c.porDiam)[k] });
      });
      filas.sort(function (a, b) { return C.diamOrder(a.d) - C.diamOrder(b.d); });
      cols = [{ t: 'Diámetro', f: function (f) { return '<b>' + esc(C.diamLabel(f.d)) + '</b>'; } }].concat(base);
    } else if (v.vista === 'elemento') {
      Object.keys(v.diam ? c.porElemDiam : c.porElem).forEach(function (k) {
        var e = v.diam ? k.slice(0, k.lastIndexOf('|')) : k, d = v.diam ? k.slice(k.lastIndexOf('|') + 1) : '';
        if (v.diam && d !== v.diam) return;
        filas.push({ e: e, x: (v.diam ? c.porElemDiam : c.porElem)[k] });
      });
      filas.sort(function (a, b) { return a.e < b.e ? -1 : 1; });
      cols = [{ t: 'Elemento', f: function (f) { return esc(f.e); } }].concat(base);
    } else {
      var seen = {};
      S.estado.entradas.forEach(function (e) {
        var k = e.estructura + '|' + e.diametro + '|' + e.marca;
        if (seen[k] || (v.elem && e.estructura !== v.elem) || (v.diam && e.diametro !== v.diam)) return;
        seen[k] = 1;
        filas.push({ e: e.estructura, d: e.diametro, m: e.marca, largo: e.largo, x: c.porMarca[k] });
      });
      filas.sort(function (a, b) { return (a.e < b.e ? -1 : a.e > b.e ? 1 : 0) || C.diamOrder(a.d) - C.diamOrder(b.d) || cmpMarca(a.m, b.m); });
      cols = [{ t: 'Elemento', f: function (f) { return esc(f.e); } }, { t: 'Diám.', f: function (f) { return esc(C.diamLabel(f.d)); } }, { t: 'Marca', f: function (f) { return '<b>' + esc(f.m) + '</b>'; } },
        { t: 'Largo m', n: 1, f: function (f) { return f.largo ? kg(f.largo) : ''; } }].concat(base);
    }
    var h = '<div class="card"><h2>Inventario</h2><div class="seg">' +
      [['diametro', 'Por diámetro'], ['elemento', 'Por elemento'], ['marca', 'Por marca']].map(function (o) { return '<button class="' + (v.vista === o[0] ? 'on' : '') + '" data-a="invVista" data-v="' + o[0] + '">' + o[1] + '</button>'; }).join('') + '</div>' +
      '<div class="row2"><select data-f="inv.elem" style="flex:1;min-width:150px"><option value="">Todos los elementos</option>' + elems.map(function (e) { return '<option value="' + esc(e) + '"' + (e === v.elem ? ' selected' : '') + '>' + esc(e) + '</option>'; }).join('') + '</select>' +
      '<select data-f="inv.diam" style="flex:1;min-width:130px"><option value="">Todos los diámetros</option>' + diams.map(function (d) { return '<option value="' + esc(d) + '"' + (d === v.diam ? ' selected' : '') + '>' + esc(C.diamLabel(d)) + '</option>'; }).join('') + '</select></div>' +
      '<div style="margin-top:10px">' + (filas.length ? tablaInv(filas, cols) : '<div class="vacio">Sin datos con ese filtro</div>') + '</div>' +
      (v.vista === 'marca' ? '<p class="peq mut">Las salidas que se registran sin marca se descuentan del total del diámetro, no de una marca.</p>' : '') + '</div>';
    return h;
  }

  function vMovs() {
    var L = movimientos();
    return '<div class="card"><div class="row2" style="justify-content:space-between"><h2 style="margin:0">Movimientos</h2><button class="btn chico sec" data-a="csv">Descargar CSV</button></div>' +
      (L.length ? L.slice(0, 150).map(function (m) { return vMov(m, true); }).join('') : '<div class="vacio">Sin movimientos</div>') +
      (L.length > 150 ? '<p class="peq mut">Se muestran los 150 más recientes. El CSV trae todo.</p>' : '') +
      (!Api.remoto && esAdmin() ? '<div style="margin-top:14px"><button class="btn chico peligro" data-a="borrarLocal">Borrar datos de prueba de este navegador</button></div>' : '') + '</div>';
  }

  function resumenDiam(parsed) {
    var por = {};
    parsed.rows.forEach(function (r) { var x = por[r.diametro] || (por[r.diametro] = { p: 0, kg: 0 }); x.p += r.cantidad; x.kg += r.kg; });
    return por;
  }
  function vCargar() {
    if (!esAdmin()) return '<div class="card vacio">Solo el administrador puede cargar un DLI.</div>';
    var h = '<div class="card"><h2>Cargar archivos DLI</h2><p class="mut" style="margin-top:0">Seleccione uno o varios .dli. Cada uno se registra con su número de pedido y suma al inventario las piezas con cantidad mayor que cero.</p>' +
      '<label class="btn" for="dli-file">Elegir archivos .dli</label><input id="dli-file" type="file" accept=".dli" multiple style="display:none"></div>';
    S.cargas.forEach(function (c, i) {
      var p = c.parsed, por = resumenDiam(p), ya = S.estado.pedidos.filter(function (x) { return x.estructura === p.nombre; });
      h += '<div class="card"><h3>' + esc(p.nombre) + (p.descripcion ? '<span class="tag">' + esc(p.descripcion) + '</span>' : '') + '</h3>' +
        '<div class="peq mut">' + esc(p.archivo) + ' · ' + p.rows.length + ' filas · ' + n0(p.totalPiezas) + ' piezas · ' + kg(p.totalKg) + ' kg</div>';
      p.avisos.forEach(function (a) { h += '<div class="aviso">⚠ ' + esc(a) + '</div>'; });
      if (ya.length) h += '<div class="aviso">Este elemento ya tiene carga(s) del pedido ' + ya.map(function (x) { return esc(x.pedido); }).join(', ') + '. Continúe solo si es un pedido distinto (complemento); no cargue dos veces el mismo archivo.</div>';
      h += '<div class="tw"><table><thead><tr><th>Diámetro</th><th class="n">Piezas</th><th class="n">Kg</th></tr></thead><tbody>' +
        Object.keys(por).sort(function (a, b) { return C.diamOrder(a) - C.diamOrder(b); }).map(function (d) { return '<tr><td>' + esc(C.diamLabel(d)) + '</td><td class="n">' + n0(por[d].p) + '</td><td class="n">' + kg(por[d].kg) + '</td></tr>'; }).join('') + '</tbody></table></div>';
      var pend = p.rows.map(function (r, j) { return { r: r, j: j }; }).filter(function (o) { return !o.r.largo; });
      if (pend.length) {
        h += '<div class="aviso"><b>Falta el largo de ' + pend.length + ' marca(s).</b> Escríbalo para poder registrar:</div><div class="tw"><table><tbody>' +
          pend.map(function (o) { return '<tr><td>Marca ' + esc(o.r.marca) + '</td><td>' + esc(o.r.cantidad) + ' pzs · ' + esc(o.r.forma) + '</td><td class="n"><input class="mini" type="number" step="0.01" min="0" placeholder="m" data-largo="' + i + ':' + o.j + '"></td></tr>'; }).join('') + '</tbody></table></div>';
      }
      h += '<details><summary>Ver las ' + p.rows.length + ' filas</summary><div class="tw"><table><thead><tr><th>Marca</th><th class="n">Cant.</th><th>Diám.</th><th class="n">Largo m</th><th class="n">Kg</th></tr></thead><tbody>' +
        p.rows.map(function (r) { return '<tr><td>' + esc(r.marca) + '</td><td class="n">' + r.cantidad + '</td><td>' + esc(C.diamLabel(r.diametro)) + '</td><td class="n">' + (r.largo ? kg(r.largo) : '—') + '</td><td class="n">' + kg(r.kg) + '</td></tr>'; }).join('') + '</tbody></table></div></details>';
      h += '<label class="f">Número de pedido de esta carga</label><input type="text" inputmode="numeric" placeholder="Ej. 203192" value="' + esc(c.pedido) + '" data-i="carga.' + i + '.pedido">';
      if (c.err) h += '<div class="error">' + esc(c.err) + '</div>';
      h += '<div class="row2" style="margin-top:12px"><button class="btn" data-a="registrarCarga" data-v="' + i + '">Registrar en inventario</button><button class="btn sec" data-a="quitarCarga" data-v="' + i + '">Quitar</button></div></div>';
    });
    return h;
  }

  function vista() {
    switch (S.tab) {
      case 'salida': return vSalida();
      case 'inv': return vInv();
      case 'mov': return vMovs();
      case 'cargar': return vCargar();
      default: return vPanel();
    }
  }

  function render() {
    var app = $('app');
    if (!S.ses) { app.innerHTML = vLogin(); return; }
    S.calc = C.calcular(S.estado);
    app.innerHTML = vTop() + vBandas() + '<main>' + vista() + '</main>' + vTabs() + '<div class="pie">Almacén de aceros · versión de prueba · Autor: Carlos Eduardo Bermúdez Castro</div>';
  }

  // ---------- Acciones ----------
  function cargarEstado() {
    return Api.estado(S.ses).then(function (r) {
      if (!r.ok) {
        if (r.error === 'PIN incorrecto') { Api.salir(); S.ses = null; S.loginErr = 'El PIN cambió. Ingrese de nuevo.'; }
        else toast(r.error);
        render(); return;
      }
      S.estado = r.estado; S.offline = !!r.offline; render();
    });
  }
  function enviarCola() {
    if (S.enviando || !Api.remoto || !S.ses) return Promise.resolve();
    S.enviando = true;
    return Api.flush(S.ses).then(function (r) {
      S.enviando = false;
      if (r.enviadas) { toast(r.enviadas + ' salida(s) enviadas'); return cargarEstado(); }
      render();
    }).catch(function () { S.enviando = false; });
  }

  function leerArchivos(files) {
    var lista = Array.prototype.slice.call(files);
    return lista.reduce(function (p, f) {
      return p.then(function () { return f.arrayBuffer(); }).then(function (buf) {
        var parsed = C.parseDLI(new Uint8Array(buf), f.name);
        S.cargas.push({ parsed: parsed, pedido: '', err: '' });
      }).catch(function () { toast('No se pudo leer ' + f.name); });
    }, Promise.resolve()).then(render);
  }

  function registrarCarga(i) {
    var c = S.cargas[i]; if (!c) return;
    var p = c.parsed;
    c.err = '';
    if (!String(c.pedido).trim()) c.err = 'Escriba el número de pedido.';
    else if (!p.rows.length) c.err = 'El archivo no trae piezas.';
    else {
      var mal = p.rows.filter(function (r) { return !r.largo || !r.peso; })[0];
      if (mal) c.err = 'Complete la marca ' + mal.marca + ' (falta largo o peso del diámetro ' + mal.diametro + ').';
    }
    if (c.err) { render(); return; }
    Api.cargarDLI(S.ses, p, c.pedido).then(function (r) {
      if (!r.ok) { c.err = r.error; render(); return; }
      S.cargas.splice(i, 1);
      toast('Cargado: pedido ' + String(c.pedido).trim() + ' · ' + p.nombre);
      S.tab = 'panel';
      return cargarEstado();
    });
  }

  function registrarSalida() {
    var s = S.sal;
    var err = C.validarSalida(S.calc, s.elem, s.diam, s.cant, s.marca);
    if (err) { s.err = err; s.msg = ''; render(); return; }
    var kgEst = C.kgSalida(S.calc, s.elem, s.diam, s.cant, s.marca), cant = s.cant, d = s.diam, e = s.elem;
    Api.salida(S.ses, { diametro: d, cantidad: cant, elemento: e, marca: s.marca, obs: s.obs }).then(function (r) {
      if (!r.ok) { s.err = r.error; s.msg = ''; render(); return; }
      s.err = ''; s.cant = 1; s.obs = ''; s.marca = '';
      s.msg = 'Salida registrada: ' + cant + ' × ' + C.diamLabel(d) + ' en ' + e + ' (≈ ' + kg(kgEst) + ' kg)' + (r.pendiente ? '. Sin señal: se enviará sola al volver la conexión.' : '.');
      toast('Salida registrada');
      return cargarEstado();
    });
  }

  function descargarCSV() {
    var q = function (v) { v = String(v == null ? '' : v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var num = function (n) { return String(n == null ? '' : n).replace('.', ','); };
    var f = [['Tipo', 'Fecha', 'Pedido', 'Elemento', 'Marca', 'Diametro', 'Cantidad', 'Largo_m', 'Kg', 'Usuario', 'Observacion', 'Estado']];
    var ped = {}; S.estado.pedidos.forEach(function (p) { ped[p.loadId] = p; });
    S.estado.entradas.forEach(function (e) { var p = ped[e.loadId] || {}; f.push(['ENTRADA', e.fecha, e.pedido, e.estructura, e.marca, e.diametro, e.cantidad, num(e.largo), num(e.kg), p.usuario || '', '', '']); });
    S.estado.salidas.forEach(function (s) { f.push(['SALIDA', s.fecha, '', s.elemento, s.marca, s.diametro, s.cantidad, '', num(s.kg), s.usuario, s.obs, s.estado]); });
    var blob = new Blob(['﻿' + f.map(function (r) { return r.map(q).join(';'); }).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'movimientos_aceros.csv';
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function actualizarResumen() {
    var r = resumenSalida(), a = $('r-kg'), b = $('r-disp');
    if (a) a.textContent = kg(r.kg) + ' kg';
    if (b) b.textContent = n0(r.max) + ' pzs';
  }

  // ---------- Eventos ----------
  document.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-a]'); if (!el) return;
    var a = el.getAttribute('data-a'), v = el.getAttribute('data-v');
    switch (a) {
      case 'tab': S.tab = v; render(); window.scrollTo(0, 0); break;
      case 'refrescar': cargarEstado().then(function () { toast('Actualizado'); }); break;
      case 'salir': Api.salir(); S.ses = null; S.loginErr = ''; render(); break;
      case 'diam': S.sal.diam = v; S.sal.elem = ''; S.sal.marca = ''; S.sal.cant = 1; S.sal.err = ''; S.sal.msg = ''; render(); break;
      case 'mas': S.sal.cant = Math.min((S.sal.cant || 0) + 1, maxSalida() || 1); render(); break;
      case 'menos': S.sal.cant = Math.max((S.sal.cant || 1) - 1, 1); render(); break;
      case 'registrarSalida': registrarSalida(); break;
      case 'invVista': S.inv.vista = v; render(); break;
      case 'registrarCarga': registrarCarga(+v); break;
      case 'quitarCarga': S.cargas.splice(+v, 1); render(); break;
      case 'csv': descargarCSV(); break;
      case 'enviarCola': enviarCola(); break;
      case 'limpiarErrores': Api.limpiarErroresCola(); render(); break;
      case 'anularSalida':
        if (confirm('¿Anular esta salida? El acero vuelve al inventario.')) Api.anularSalida(S.ses, v).then(function (r) { toast(r.ok ? 'Salida anulada' : r.error); return cargarEstado(); });
        break;
      case 'anularCarga':
        if (confirm('¿Anular esta carga de DLI? Se quitan sus piezas del inventario.')) Api.anularCarga(S.ses, v).then(function (r) { toast(r.ok ? 'Carga anulada' : r.error); return cargarEstado(); });
        break;
      case 'borrarLocal':
        if (confirm('¿Borrar TODOS los datos de prueba de este navegador?')) { Api.borrarLocal(); S.estado = { pedidos: [], entradas: [], salidas: [] }; render(); toast('Datos de prueba borrados'); }
        break;
    }
  });

  document.addEventListener('change', function (ev) {
    var t = ev.target;
    if (t.id === 'dli-file') { leerArchivos(t.files).then(function () { t.value = ''; }); return; }
    var f = t.getAttribute('data-f');
    if (f) {
      var p = f.split('.'); S[p[0]][p[1]] = t.value;
      if (f === 'sal.elem') { S.sal.marca = ''; S.sal.cant = 1; S.sal.err = ''; S.sal.msg = ''; }
      if (f === 'sal.marca') { S.sal.cant = 1; }
      render(); return;
    }
    var lg = t.getAttribute('data-largo');
    if (lg) {
      var ij = lg.split(':'), c = S.cargas[+ij[0]], row = c.parsed.rows[+ij[1]], val = parseFloat(String(t.value).replace(',', '.'));
      if (val > 0) {
        row.largo = val; row.aviso = '';
        C.recalcular(c.parsed.rows);
        var tt = C.totales(c.parsed.rows); c.parsed.totalPiezas = tt.totalPiezas; c.parsed.totalKg = tt.totalKg;
        c.parsed.avisos = c.parsed.avisos.filter(function (x) { return x.indexOf('Marca ' + row.marca + ':') !== 0; });
        render();
      }
    }
  });

  document.addEventListener('input', function (ev) {
    var t = ev.target, i = t.getAttribute('data-i'); if (!i) return;
    if (i === 'sal.obs') S.sal.obs = t.value;
    else if (i === 'sal.cant') {
      var n = parseInt(t.value, 10), max = maxSalida();
      S.sal.cant = isNaN(n) ? 0 : n;
      if (max && S.sal.cant > max) { S.sal.cant = max; t.value = max; }
      actualizarResumen();
    } else {
      var m = /^carga\.(\d+)\.pedido$/.exec(i);
      if (m && S.cargas[+m[1]]) S.cargas[+m[1]].pedido = t.value;
    }
  });

  document.addEventListener('submit', function (ev) {
    if (ev.target.id !== 'f-login') return;
    ev.preventDefault();
    var nom = $('l-nom').value, pin = $('l-pin').value; S.loginNom = nom;
    Api.login(nom, pin).then(function (r) {
      if (!r.ok) { S.loginErr = r.error; render(); return; }
      S.ses = r.ses; S.loginErr = ''; S.tab = 'panel';
      render(); enviarCola().then(cargarEstado);
    });
  });

  window.addEventListener('online', enviarCola);
  setInterval(function () { if (S.ses && Api.pendientes()) enviarCola(); }, 30000);

  // ---------- Inicio ----------
  S.ses = Api.sesion();
  if (S.ses) { render(); enviarCola().then(cargarEstado); } else render();
})();
