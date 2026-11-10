/* Almacén de aceros (prueba) — interfaz */
(function () {
  'use strict';
  var C = window.AcerosCore, Api = window.Api, CFG = window.ACEROS_CONFIG;
  var MODO = window.ACEROS_MODO === 'salidas' ? 'salidas' : 'dashboard', BASE = window.ACEROS_BASE || '';

  var S = {
    ses: null, estado: { pedidos: [], entradas: [], salidas: [] }, calc: null, tab: MODO === 'salidas' ? 'salida' : 'panel', offline: false, enviando: false, per: { k: 'todo', d: '', h: '' },
    sal: { q: '', fdiam: '', items: [], grupo: '', n: 0, diam: '', elem: '', marca: '', pos: '', cant: 1, obs: '', fecha: '', msg: '', err: '', modo: 'pos', tipo: 'SALIDA', fase: '', pct: '', balElem: '' },
    inv: { vista: 'diametro', elem: '', diam: '' }, ped: { q: '', pag: 0 }, inf: { d: '' },
    cargas: [], loginErr: '', loginNom: ''
  };

  // ---------- Utilidades ----------
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function n0(n) { return Number(n || 0).toLocaleString('es-CO'); }
  function kg(n) { return Number(n || 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function hoyISO() {
    var d = new Date(), z = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
  }
  function isoDe(d) { var z = function (n) { return String(n).padStart(2, '0'); }; return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()); }
  function rangoPer() {
    var p = S.per, h = hoyISO(), d = new Date();
    if (p.k === 'hoy') return [h, h];
    if (p.k === '7d') { d.setDate(d.getDate() - 6); return [isoDe(d), h]; }
    if (p.k === 'mes') return [h.slice(0, 8) + '01', h];
    if (p.k === 'rango') return [p.d || '0000-01-01', p.h || '9999-12-31'];
    return null;
  }
  function enPer(f) { var r = rangoPer(); if (!r) return true; var d = String(f || '').slice(0, 10); return d >= r[0] && d <= r[1]; }
  function vFiltro() {
    var P = [['hoy', 'Hoy'], ['7d', '7 días'], ['mes', 'Este mes'], ['todo', 'Todo'], ['rango', 'Rango']];
    return '<div class="fper"><div class="fch">' + P.map(function (x) { return '<button type="button" class="fc' + (S.per.k === x[0] ? ' on' : '') + '" data-a="per" data-v="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>' +
      (S.per.k === 'rango' ? '<div class="frng"><label>Desde<input type="date" max="' + hoyISO() + '" value="' + esc(S.per.d) + '" data-f="per.d"></label><label>Hasta<input type="date" max="' + hoyISO() + '" value="' + esc(S.per.h) + '" data-f="per.h"></label></div>' : '') + '</div>';
  }
  function esHoy(f) { return String(f || '').slice(0, 10) === hoyISO(); }
  function horaAhora() { var d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
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
  var tp = function (x) { return x && x.tipo === 'ARMADO' ? 'ARMADO' : 'SALIDA'; };
  var esArm = function () { return S.sal.tipo === 'ARMADO'; };
  var dispDe = function (v) { return v ? (esArm() ? v.lib_p : v.sal_p) : 0; };
  var esAdmin = function () { return S.ses && S.ses.rol === 'admin'; };

  // ---------- Vistas ----------
  function vLogin() {
    return '<div class="login"><div class="marca"><img src="' + BASE + 'icons/icon-192.png" alt=""><h1>' + esc(CFG.TITULO) + '</h1>' +
      (Api.remoto ? '' : '<span class="insignia">Modo local de prueba</span>') + '</div>' +
      '<form id="f-login" class="card"><label class="f" for="l-nom">Su nombre</label>' +
      '<input id="l-nom" type="text" autocomplete="name" placeholder="Ej. Juan Pérez" value="' + esc(S.loginNom || (Api.sesion() || {}).nombre || '') + '">' +
      '<label class="f" for="l-pin">PIN</label><input id="l-pin" type="password" inputmode="numeric" autocomplete="current-password" placeholder="••••">' +
      (S.loginErr ? '<div class="error">' + esc(S.loginErr) + '</div>' : '') +
      '<div style="margin-top:16px"><button class="btn blk" type="submit">Entrar</button></div></form>' +
      '</div>';
  }

  function vTop() {
    return '<header class="top"><img class="logo" src="' + BASE + 'icons/icon-192.png" alt=""><div class="tit"><b>' + esc(CFG.TITULO) + '</b><span>' +
      esc(S.ses.nombre) + ' · ' + (esAdmin() ? 'Administrador' : 'Supervisor') + (Api.remoto ? '' : ' · modo local') + '</span></div>' +
      '<button class="ibtn" data-a="refrescar" title="Actualizar">⟳</button><button class="ibtn" data-a="salir" title="Salir">⏻</button></header>';
  }

  function vBandas() {
    var h = '', pend = Api.pendientes(), errs = Api.erroresCola();
    if (!Api.remoto) h += '<div class="banda info">Modo local de prueba: los datos solo existen en este navegador.</div>';
    if (S.offline) h += '<div class="banda warn">Sin conexión: se muestran los últimos datos guardados en este celular.</div>';
    if (pend && S.enviando) h += '<div class="banda info env"><span>Enviando la salida al almacén…</span><i class="prog"><b></b></i></div>';
    else if (pend) h += '<div class="banda warn">' + pend + ' salida(s) sin enviar por falta de señal. Se envían solas al volver la conexión.<button class="btn chico" data-a="enviarCola">Enviar ahora</button></div>';
    if (errs.length) h += '<div class="banda bad"><div>' + errs.map(function (e) { return e.body.items ? 'No se pudo registrar la salida (' + e.body.items.length + ' posiciones): ' + esc(e.error) : 'No se pudo registrar ' + esc(e.body.cantidad) + ' × ' + esc(e.body.diametro) + '" en ' + esc(e.body.elemento) + ': ' + esc(e.error); }).join('<br>') + '</div><button class="btn chico sec" data-a="limpiarErrores">Entendido</button></div>';
    return h;
  }

  function vTabs() {
    var T = MODO === 'salidas'
      ? [['salida', '✍️', 'Registrar'], ['mov', '🧾', 'Movimientos'], ['inv', '📦', 'Inventario'], ['inf', '📄', 'Informe']]
      : [['panel', '📊', 'Panel'], ['salida', '✍️', 'Registrar'], ['inv', '📦', 'Inventario'], ['mov', '🧾', 'Movimientos'], ['ped', '📋', 'Pedidos'], ['inf', '📄', 'Informe'], ['cargar', '📥', 'Cargar DLI']];
    return '<nav class="tabs">' + T.map(function (t) {
      return '<button class="' + (S.tab === t[0] ? 'on' : '') + '" data-a="tab" data-v="' + t[0] + '"><span>' + t[1] + '</span><em>' + t[2] + '</em></button>';
    }).join('') + '</nav>';
  }
  function pz(n) { return n0(n) + (n === 1 ? ' pieza' : ' piezas'); }
  /** Tres cajas grandes: Libre / Armado / Salió. */
  function celdas(x, salioX) {
    var o = salioX || { p: x.out_p, kg: x.out_kg };
    return '<div class="ec-n"><div class="cl lib"><small>✅ Libre</small><b>' + n0(x.lib_p) + '</b><i>' + kg(x.lib_kg) + ' kg</i></div>' +
      '<div class="cl arm"><small>🔧 Armado</small><b>' + n0(x.arm_p) + '</b><i>' + kg(x.arm_kg) + ' kg</i></div>' +
      '<div class="cl out"><small>🚚 Salió</small><b>' + n0(o.p) + '</b><i>' + kg(o.kg) + ' kg</i></div></div>';
  }
  function apilada(x) {
    var t = x.in_p || 1, f = function (n) { return Math.max(0, Math.min(100, 100 * n / t)).toFixed(1) + '%'; };
    return '<div class="stk"><i class="lib" style="width:' + f(x.lib_p) + '"></i><i class="arm" style="width:' + f(x.arm_p) + '"></i><i class="out" style="width:' + f(x.out_p) + '"></i></div>';
  }
  function estCard(titulo, sub, x) {
    return '<div class="ec"><div class="ec-h"><b>' + titulo + '</b>' + (sub ? '<span>' + sub + '</span>' : '') + '</div>' + apilada(x) + celdas(x) + '</div>';
  }
  function sinInventario() {
    return '<div class="card vacio"><b>Aún no hay acero en el inventario.</b><br>' + (esAdmin()
      ? '<p>Cargue un archivo .dli y asígnele su número de pedido.</p><button class="btn" data-a="tab" data-v="cargar">Cargar DLI</button>'
      : '<p>El administrador debe cargar primero un DLI.</p>') + '</div>';
  }

  function movimientos() {
    var L = [];
    S.estado.pedidos.forEach(function (p) { L.push({ t: 'E', f: p.fecha, p: p }); });
    var G = {}, orden = [];
    S.estado.salidas.forEach(function (s) {
      var k = String(s.id).replace(/-\d+$/, '');
      if (!G[k]) { G[k] = []; orden.push(k); }
      G[k].push(s);
    });
    orden.forEach(function (k) { L.push({ t: 'S', f: G[k][0].fecha, s: G[k][0], g: G[k] }); });
    L = L.filter(function (m) { return enPer(m.f); });
    L.sort(function (a, b) { return a.f < b.f ? 1 : a.f > b.f ? -1 : 0; });
    return L;
  }

  function vMov(m, conAcciones) {
    if (m.t === 'E') {
      var p = m.p;
      return '<div class="mv ent"><div class="mv-i">📥</div><div class="mv-c"><div class="mv-t">Llegó acero · pedido ' + esc(p.pedido) + '</div><div class="mv-s">' + esc(p.estructura) + '</div>' +
        '<div class="mv-m"><span>' + pz(p.piezas) + '</span><span>' + kg(p.kg) + ' kg</span><span>' + esc(p.usuario) + ' · ' + fecha(p.fecha) + '</span></div></div>' +
        (conAcciones && esAdmin() && esHoy(p.fecha) ? '<button class="btn chico sec" data-a="anularCarga" data-v="' + esc(p.loadId) + '">Anular</button>' : '') + '</div>';
    }
    var g = m.g, g0 = g[0], arm = tp(g0) === 'ARMADO', activas = g.filter(function (x) { return x.estado !== 'ANULADA'; }), anG = !activas.length, uso = anG ? g : activas;
    var nP = 0, nK = 0, els = [];
    uso.forEach(function (x) { nP += x.cantidad; nK += x.kg; if (els.indexOf(x.elemento) < 0) els.push(x.elemento); });
    var tit = g0.modo === 'PCT' ? (arm ? 'Armado del ' : 'Salida del ') + fmtPct(g0.pct) + ' %' : (arm ? (nP === 1 ? 'Se armó ' : 'Se armaron ') : (nP === 1 ? 'Salió ' : 'Salieron ')) + pz(nP);
    var pend = g.some(function (x) { return x.pendiente; });
    var det = '<details class="mv-d"><summary>Ver las ' + g.length + (g.length === 1 ? ' posición' : ' posiciones') + '</summary><table><thead><tr><th>Posición</th><th>Varilla</th><th class="n">Piezas</th><th class="n">Kg</th></tr></thead><tbody>' +
      g.map(function (x) { return '<tr' + (x.estado === 'ANULADA' && !anG ? ' class="anu"' : '') + '><td><b>' + esc(x.marca || '—') + '</b></td><td>' + esc(C.diamLabel(x.diametro)) + '</td><td class="n">' + n0(x.cantidad) + '</td><td class="n">' + kg(x.kg) + '</td></tr>'; }).join('') + '</tbody></table></details>';
    return '<div class="mv ' + (arm ? 'arm' : 'out') + (anG ? ' anul' : '') + '"><div class="mv-i">' + (arm ? '🔧' : '🚚') + '</div><div class="mv-c"><div class="mv-t">' + tit +
      (anG ? '<span class="chp anu">Anulada</span>' : '') + (pend ? '<span class="chp pen">Sin enviar</span>' : '') + '</div><div class="mv-s">' + els.map(esc).join(' · ') + '</div>' +
      '<div class="mv-m"><span>' + kg(nK) + ' kg</span>' + (g0.modo !== 'PCT' && g0.fase ? '<span>Fase: ' + esc(g0.fase) + '</span>' : '') + '<span>' + esc(g0.usuario) + ' · ' + fecha(g0.fecha) + '</span>' + (g0.obs ? '<span>' + esc(g0.obs) + '</span>' : '') + '</div>' + det + '</div>' +
      (conAcciones && !anG && g.every(function (x) { return !x.pendiente && esHoy(x.fecha); }) ? '<button class="btn chico sec" data-a="anularSalida" data-v="' + esc(activas.map(function (x) { return x.id; }).join(',')) + '">Anular</button>' : '') + '</div>';
  }
  // ---- gráficos del panel (SVG/CSS, sin librerías) ----
  function donut(l, a, o) {
    var t = l + a + o || 1, R = 15.915, off = 25, seg = [[l, '#16a34a'], [a, '#f59e0b'], [o, '#2563eb']], acc = 0, h = '';
    seg.forEach(function (x) { var p = 100 * x[0] / t; if (p > 0) h += '<circle cx="21" cy="21" r="' + R + '" fill="none" stroke="' + x[1] + '" stroke-width="7" stroke-dasharray="' + p.toFixed(2) + ' ' + (100 - p).toFixed(2) + '" stroke-dashoffset="' + (off - acc).toFixed(2) + '"/>'; acc += p; });
    var av = Math.round(100 * (a + o) / t);
    return '<svg class="dn" viewBox="0 0 42 42" role="img" aria-label="Distribución de piezas"><circle cx="21" cy="21" r="' + R + '" fill="none" stroke="#e2e8f0" stroke-width="7"/>' + h +
      '<text x="21" y="20.5" text-anchor="middle" class="dn-n">' + av + '%</text><text x="21" y="26" text-anchor="middle" class="dn-s">usado</text></svg>';
  }
  function barraH(x) {
    var t = x.in_p || 1, f = function (n) { return (100 * n / t).toFixed(1) + '%'; };
    return '<div class="bh"><i class="lib" style="width:' + f(x.lib_p) + '"></i><i class="arm" style="width:' + f(x.arm_p) + '"></i><i class="out" style="width:' + f(x.out_p) + '"></i></div>';
  }
  function leyenda() { return '<div class="ley"><span><i class="lib"></i>Libre</span><span><i class="arm"></i>Armado</span><span><i class="out"></i>Salió</span></div>'; }
  function tendencia7() {
    var dias = [], d = new Date(), k, i, z = isoDe;
    for (i = 6; i >= 0; i--) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate() - i); dias.push({ f: z(x), a: 0, o: 0, l: ['D', 'L', 'M', 'M', 'J', 'V', 'S'][x.getDay()] + ' ' + x.getDate() }); }
    S.estado.salidas.forEach(function (x) { if (x.estado === 'ANULADA') return; var f = String(x.fecha || '').slice(0, 10); dias.forEach(function (y) { if (y.f === f) { if (tp(x) === 'ARMADO') y.a += +x.kg || 0; else y.o += +x.kg || 0; } }); });
    var mx = Math.max.apply(null, dias.map(function (y) { return Math.max(y.a, y.o); }).concat([1])), W = 300, H = 120, bw = 13, gx = W / 7, g = '';
    dias.forEach(function (y, n) {
      var x0 = n * gx + gx / 2 - bw - 1, ha = 100 * y.a / mx, ho = 100 * y.o / mx;
      g += '<rect x="' + x0.toFixed(1) + '" y="' + (105 - ha).toFixed(1) + '" width="' + bw + '" height="' + ha.toFixed(1) + '" rx="2" fill="#f59e0b"/>' +
        '<rect x="' + (x0 + bw + 2).toFixed(1) + '" y="' + (105 - ho).toFixed(1) + '" width="' + bw + '" height="' + ho.toFixed(1) + '" rx="2" fill="#2563eb"/>' +
        '<text x="' + (n * gx + gx / 2).toFixed(1) + '" y="118" text-anchor="middle" class="tx">' + y.l + '</text>';
    });
    var tA = dias.reduce(function (a, y) { return a + y.a; }, 0), tO = dias.reduce(function (a, y) { return a + y.o; }, 0);
    return '<div class="card gr"><h3>Últimos 7 días (kg)</h3><svg viewBox="0 0 ' + W + ' ' + H + '" class="tr" role="img" aria-label="Armado y salida por día"><line x1="0" y1="105" x2="' + W + '" y2="105" stroke="#94a3b8"/>' + g + '</svg>' +
      '<div class="ley"><span><i class="arm"></i>Armado ' + kg(tA) + ' kg</span><span><i class="out"></i>Salió ' + kg(tO) + ' kg</span></div></div>';
  }
  function vPanel() {
    if (!S.estado.entradas.length) return sinInventario();
    var c = S.calc, t = c.tot, filtrado = S.per.k !== 'todo';
    var diams = Object.keys(c.porDiam).sort(function (a, b) { return C.diamOrder(a) - C.diamOrder(b); });
    var ps = { p: 0, kg: 0 };
    S.estado.salidas.forEach(function (x) { if (x.estado !== 'ANULADA' && tp(x) === 'SALIDA' && enPer(x.fecha)) { ps.p += x.cantidad; ps.kg += x.kg; } });
    var h = '<div class="hero"><small>En la playa de hierros hay</small><b>' + pz(t.sal_p) + '</b><span>' + kg(t.sal_kg) + ' kg · de ' + n0(t.in_p) + ' que llegaron</span>' + apilada(t) + '</div>';
    h += vFiltro() + '<div class="tri">' +
      '<div class="tl lib"><div class="tl-i">✅</div><b>' + n0(t.lib_p) + '</b><strong>Libre</strong><small>Sin usar</small><i>' + kg(t.lib_kg) + ' kg</i></div>' +
      '<div class="tl arm"><div class="tl-i">🔧</div><b>' + n0(t.arm_p) + '</b><strong>Armado</strong><small>Ya armado, sigue aquí</small><i>' + kg(t.arm_kg) + ' kg</i></div>' +
      '<div class="tl out"><div class="tl-i">🚚</div><b>' + n0(filtrado ? ps.p : t.out_p) + '</b><strong>Salió</strong><small>' + (filtrado ? 'En el período' : 'Ya se fue de la playa') + '</small><i>' + kg(filtrado ? ps.kg : t.out_kg) + ' kg</i></div></div>';
    // distribución general
    h += '<div class="card gr"><h3>¿Cómo está el acero?</h3><div class="dn-w">' + donut(t.lib_p, t.arm_p, t.out_p) +
      '<div class="dn-l"><div><i class="lib"></i><b>' + n0(t.lib_p) + '</b> libres<small>' + kg(t.lib_kg) + ' kg</small></div><div><i class="arm"></i><b>' + n0(t.arm_p) + '</b> armadas<small>' + kg(t.arm_kg) + ' kg</small></div><div><i class="out"></i><b>' + n0(t.out_p) + '</b> salieron<small>' + kg(t.out_kg) + ' kg</small></div></div></div></div>';
    h += tendencia7();
    // avance por estructura (ranking)
    var es = Object.keys(c.porElem).map(function (e) { var x = c.porElem[e]; return { e: e, x: x, av: x.in_p ? (x.arm_p + x.out_p) / x.in_p : 0 }; }).sort(function (a, b) { return b.av - a.av; });
    h += '<div class="card gr"><h3>Avance por estructura</h3><p class="peq mut" style="margin:0 0 8px">Armado + salida sobre lo que llegó</p>' + leyenda() +
      es.map(function (r) { return '<div class="bh-r"><div class="bh-t"><b>' + esc(r.e) + '</b><span>' + Math.round(100 * r.av) + '%</span></div>' + barraH(r.x) + '<small>' + n0(r.x.lib_p) + ' libres · ' + n0(r.x.arm_p) + ' armadas · ' + n0(r.x.out_p) + ' salieron</small></div>'; }).join('') + '</div>';
    // kg por varilla
    var mxk = Math.max.apply(null, diams.map(function (d) { return c.porDiam[d].in_kg || 0; }).concat([1]));
    h += '<div class="card gr"><h3>Kilos por tipo de varilla</h3>' + leyenda() + diams.map(function (d) {
      var x = c.porDiam[d], w = function (n) { return (100 * n / mxk).toFixed(1) + '%'; };
      return '<div class="bh-r"><div class="bh-t"><b>' + esc(C.diamLabel(d)) + '</b><span>' + kg(x.in_kg) + ' kg</span></div><div class="bh"><i class="lib" style="width:' + w(x.lib_kg) + '"></i><i class="arm" style="width:' + w(x.arm_kg) + '"></i><i class="out" style="width:' + w(x.out_kg) + '"></i></div></div>'; }).join('') + '</div>';
    var L = movimientos().slice(0, 5);
    h += '<h2 class="sec-t">Últimos movimientos</h2><div class="card">' + (L.length ? L.map(function (m) { return vMov(m, false); }).join('') : '<div class="vacio">Sin movimientos</div>') + '</div>';
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
  function elemsDisp() {
    var r = {};
    Object.keys(S.calc.porElemDiam).forEach(function (k) {
      if (dispDe(S.calc.porElemDiam[k]) > 0) r[k.slice(0, k.lastIndexOf('|'))] = 1;
    });
    return Object.keys(r).sort();
  }
  function diamsDeElem(e) {
    return diamsDisponibles().filter(function (d) { var x = S.calc.porElemDiam[e + '|' + d]; return x && x.sal_p > 0; });
  }
  function enCarrito(e, d, p) {
    return S.sal.items.reduce(function (a, it) { return a + (it.elem === e && it.diam === d && it.pos === p ? it.cant : 0); }, 0);
  }
  function todasElems() {
    var r = {};
    S.estado.entradas.forEach(function (x) { r[x.estructura] = 1; });
    return Object.keys(r).sort();
  }
  function fmtPct(x) { return Number(x || 0).toLocaleString('es-CO', { maximumFractionDigits: 1 }); }
  function fasesDe(e) {
    var seen = {}, r = [];
    S.estado.salidas.slice().sort(function (a, b) { return a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0; }).forEach(function (x) {
      if (x.elemento === e && x.fase && !seen[x.fase]) { seen[x.fase] = 1; r.push(x.fase); }
    });
    return r;
  }
  function pctAcum(e) {
    var G = {};
    S.estado.salidas.forEach(function (x) { if (x.elemento === e && x.estado !== 'ANULADA' && x.modo === 'PCT' && tp(x) === S.sal.tipo) G[String(x.id).replace(/-\d+$/, '')] = x.pct || 0; });
    return Object.keys(G).reduce(function (t, k) { return t + G[k]; }, 0);
  }
  function tomadoPct(e, d, m) {
    return S.estado.salidas.reduce(function (t, x) { return t + (x.elemento === e && x.diametro === d && x.marca === m && x.estado !== 'ANULADA' && x.modo === 'PCT' && tp(x) === S.sal.tipo ? x.cantidad : 0); }, 0);
  }
  function itemsPct(e, p) {
    var cum = Math.min(100, pctAcum(e) + p), r = [], vistos = {};
    S.estado.entradas.forEach(function (x) {
      if (x.estructura !== e) return;
      var k = x.diametro + '|' + x.marca; if (vistos[k]) return; vistos[k] = 1;
      var v = S.calc.porMarca[e + '|' + x.diametro + '|' + x.marca]; if (!v) return;
      var meta = cum >= 100 - 1e-9 ? v.in_p : Math.floor(v.in_p * cum / 100 + 1e-9);
      var q = Math.max(0, Math.min(dispDe(v), meta - tomadoPct(e, x.diametro, x.marca)));
      if (q > 0) r.push({ id: '', largo: x.largo || 0, elem: e, diam: x.diametro, pos: x.marca, marca: x.marca, cant: q, kg: C.kgSalida(S.calc, e, x.diametro, q, x.marca) });
    });
    return r.sort(function (a, b) { return C.diamOrder(a.diam) - C.diamOrder(b.diam) || cmpMarca(a.marca, b.marca); });
  }
  function aplicarPct() {
    var s = S.sal, p = parseFloat(String(s.pct).replace(',', '.')) || 0, rest = Math.max(0, 100 - pctAcum(s.elem));
    s.items = s.elem && p > 0 && p <= rest + 1e-9 ? itemsPct(s.elem, p) : [];
    s.err = p > rest + 1e-9 ? 'Solo falta ' + fmtPct(rest) + ' % para completar la estructura.' : '';
  }
  function vBalance(e) {
    var vistos = {}, filas = [];
    S.estado.entradas.forEach(function (x) {
      if (x.estructura !== e) return;
      var k = x.diametro + '|' + x.marca; if (vistos[k]) return; vistos[k] = 1;
      var v = S.calc.porMarca[e + '|' + x.diametro + '|' + x.marca]; if (!v) return;
      filas.push({ marca: x.marca, diam: x.diametro, in_p: v.in_p, pct: tomadoPct(e, x.diametro, x.marca), sal_p: v.sal_p, sal_kg: v.sal_kg });
    });
    filas.sort(function (a, b) { return C.diamOrder(a.diam) - C.diamOrder(b.diam) || cmpMarca(a.marca, b.marca); });
    var quedan = filas.filter(function (f) { return f.sal_p > 0; });
    return '<div class="balance"><div class="paso-h"><b>' + esc(e) + ' llegó al 100 %</b><button type="button" class="lnk" data-a="cerrarBal">Cerrar</button></div>' +
      (quedan.length ? '<p class="mut" style="margin:0 0 8px">Esto es lo que queda en almacén por posición:</p><div class="tw"><table><thead><tr><th>Posición</th><th>Varilla</th><th class="n">Ingresó</th><th class="n">Queda</th><th class="n">Kg</th></tr></thead><tbody>' +
        quedan.map(function (f) { return '<tr><td><b>' + esc(f.marca) + '</b></td><td>' + esc(C.diamLabel(f.diam)) + '</td><td class="n">' + n0(f.in_p) + '</td><td class="n"><b>' + n0(f.sal_p) + '</b></td><td class="n">' + kg(f.sal_kg) + '</td></tr>'; }).join('') + '</tbody></table></div>'
        : '<p class="mut" style="margin:0">No queda acero de esta estructura en el almacén.</p>') + '</div>';
  }
  function ajustarSalida() {
    var s = S.sal, es = elemsDisp();
    if (todasElems().indexOf(s.elem) < 0) s.elem = '';
    if (!s.elem && es.length === 1) { s.elem = es[0]; }
  }
  function cantEn(e, d, m) { return enCarrito(e, d, m); }
  function piezasSalida(e) {
    var ms = [], vistos = {};
    S.estado.entradas.forEach(function (x) {
      if (x.estructura !== e) return;
      var k = x.diametro + '|' + x.marca;
      if (vistos[k]) return; vistos[k] = 1;
      var v = S.calc.porMarca[e + '|' + x.diametro + '|' + x.marca];
      if (!v) return;
      var en = cantEn(e, x.diametro, x.marca);
      if (dispDe(v) > 0 || en > 0) ms.push({ marca: x.marca, diam: x.diametro, largo: x.largo, disp: dispDe(v) - en, total: v.in_p, en: en });
    });
    return ms.sort(function (a, b) { return C.diamOrder(a.diam) - C.diamOrder(b.diam) || cmpMarca(a.marca, b.marca); });
  }
  function setCant(e, d, m, n) {
    var s = S.sal, v = S.calc.porMarca[e + '|' + d + '|' + m]; if (!v) return;
    n = Math.max(0, Math.min(dispDe(v), Math.floor(+n || 0)));
    var it = s.items.filter(function (x) { return x.elem === e && x.diam === d && x.marca === m; })[0];
    if (!it && n > 0) { var ent = S.estado.entradas.filter(function (z) { return z.estructura === e && z.diametro === d && z.marca === m; })[0] || {};
      it = { id: '', largo: ent.largo || 0, elem: e, diam: d, pos: m, marca: m, cant: 0, kg: 0 }; s.items.push(it); }
    if (it) { it.cant = n; if (n <= 0) s.items.splice(s.items.indexOf(it), 1); else it.kg = C.kgSalida(S.calc, e, d, n, m); }
    s.err = ''; s.msg = '';
  }
  function sumarItem(e, d, m, delta) {
    var s = S.sal, it = s.items.filter(function (x) { return x.elem === e && x.diam === d && x.marca === m; })[0];
    var v = S.calc.porMarca[e + '|' + d + '|' + m]; if (!v) return;
    if (delta > 0) {
      if (dispDe(v) - (it ? it.cant : 0) < 1) { toast('No quedan más piezas de esa posición'); return; }
      if (!it) { var ent = S.estado.entradas.filter(function (z) { return z.estructura === e && z.diametro === d && z.marca === m; })[0] || {};
        it = { id: '', largo: ent.largo || 0, elem: e, diam: d, pos: m, marca: m, cant: 0, kg: 0 }; s.items.push(it); }
      it.cant += 1;
    } else if (it) {
      it.cant -= 1;
      if (it.cant <= 0) s.items.splice(s.items.indexOf(it), 1);
    }
    if (it && it.cant > 0) it.kg = C.kgSalida(S.calc, e, d, it.cant, m);
    s.err = ''; s.msg = '';
  }

  function vSalida() {
    if (!S.estado.entradas.length) return sinInventario();
    ajustarSalida();
    var s = S.sal, arm = esArm(), todas = todasElems(), conSaldo = elemsDisp();
    var h = '<div class="card sal ' + (arm ? 't-arm' : 't-out') + '"><div class="tipo"><button type="button" class="tp arm' + (arm ? ' on' : '') + '" data-a="tipo" data-v="ARMADO"><span>🔧</span><b>Armar</b><small>Se usa. Sigue en la playa.</small></button>' +
      '<button type="button" class="tp out' + (!arm ? ' on' : '') + '" data-a="tipo" data-v="SALIDA"><span>🚚</span><b>Sacar</b><small>Sale de la playa.</small></button></div>';
    if (s.msg) h += '<div class="okmsg">✓ ' + esc(s.msg) + '</div>';
    if (s.balElem && !arm) h += vBalance(s.balElem);
    if (!conSaldo.length && !s.items.length) return h + '<div class="vacio">' + (arm ? 'No queda acero libre para armar.' : 'No queda acero en la playa.') + '</div></div>';
    h += '<div class="seg"><button type="button" class="' + (s.modo === 'pos' ? 'on' : '') + '" data-a="modo" data-v="pos">Por posiciones</button><button type="button" class="' + (s.modo === 'pct' ? 'on' : '') + '" data-a="modo" data-v="pct">Por % de avance</button></div>';
    h += '<section class="paso"><div class="paso-h"><i>1</i><b>¿Cuándo y dónde?</b></div><div class="fgrid">' +
      '<div class="fld"><label for="s-fecha">Fecha</label><input id="s-fecha" type="date" max="' + hoyISO() + '" value="' + esc(s.fecha || hoyISO()) + '" data-i="sal.fecha"></div>' +
      '<div class="fld"><label for="s-hora">Hora</label><input id="s-hora" type="text" readonly tabindex="-1" value="' + horaAhora() + '"></div>' +
      '<div class="fld" style="grid-column: 1 / -1"><label for="s-elem">Estructura</label><select id="s-elem" data-f="sal.elem">' + (s.elem ? '' : '<option value="">Elija la estructura…</option>') +
        todas.map(function (e) {
          var pzs = dispDe(S.calc.porElem[e]), ped = {};
          S.estado.pedidos.forEach(function (p) { if (p.estructura === e) ped[p.pedido] = 1; });
          return '<option value="' + esc(e) + '"' + (e === s.elem ? ' selected' : '') + (pzs > 0 || e === s.elem ? '' : ' disabled') + '>' + esc(e) + ' · ' + (pzs > 0 ? n0(pzs) + (arm ? ' libres' : ' piezas') : 'sin acero') + '</option>'; }).join('') + '</select></div>' +
      (s.modo === 'pos' && s.elem ? '<div class="fld" style="grid-column: 1 / -1"><label for="s-fase">Fase</label><input id="s-fase" type="text" list="fases" maxlength="60" autocomplete="off" placeholder="Ej. Losa de fondo, Muros, Cabezal" value="' + esc(s.fase) + '" data-i="sal.fase"><datalist id="fases">' + fasesDe(s.elem).map(function (f) { return '<option value="' + esc(f) + '">'; }).join('') + '</datalist></div>' : '') +
      '</div></section>';
    if (s.elem && s.modo === 'pct') {
      var ac = pctAcum(s.elem), rest = Math.max(0, 100 - ac);
      h += '<section class="paso"><div class="paso-h"><i>2</i><b>¿Qué porcentaje?</b></div>' +
        '<div class="avance"><div class="av-b"><i style="width:' + Math.min(100, ac) + '%"></i></div><span>Ya ' + (arm ? 'se armó ' : 'salió ') + '<b>' + fmtPct(ac) + ' %</b>' + (rest <= 0 ? ' · completa' : '') + '</span></div>';
      if (rest <= 0) h += '<div class="vacio-s">Esta estructura ya está al 100 %.</div>';
      else h += '<div class="fch">' + [10, 25, 50, 75].filter(function (x) { return x < rest; }).map(function (x) { return '<button type="button" class="fc" data-a="pctset" data-v="' + x + '">' + x + ' %</button>'; }).join('') +
        '<button type="button" class="fc" data-a="pctset" data-v="' + rest + '">Completar ' + fmtPct(rest) + ' %</button></div>' +
        '<div class="pctin"><input id="s-pct" type="text" inputmode="decimal" autocomplete="off" placeholder="0" value="' + esc(s.pct) + '" data-i="sal.pct"><span>% de la estructura</span></div>';
      h += '</section>';
    } else if (s.elem) {
      var todasP = piezasSalida(s.elem), diams = [];
      todasP.forEach(function (p) { if (diams.indexOf(p.diam) < 0) diams.push(p.diam); });
      var q = String(s.q || '').trim().toLowerCase().replace(',', '.');
      var lista = todasP.filter(function (p) {
        if (p.disp <= 0) return false;
        if (s.fdiam && p.diam !== s.fdiam) return false;
        return p.marca.toLowerCase().indexOf(q) >= 0 || (p.largo && p.largo.toFixed(2).indexOf(q) === 0);
      });
      h += '<section class="paso"><div class="paso-h"><i>2</i><b>Busque la posición</b></div>' +
        '<div class="busq"><input id="s-q" type="search" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Escriba la posición. Ej. 4.06 o 2a" value="' + esc(s.q) + '" data-i="sal.q"></div>';
      if (diams.length > 1) h += '<div class="fch">' + diams.map(function (d) { return '<button type="button" class="fc' + (s.fdiam === d ? ' on' : '') + '" data-a="fdiam" data-v="' + (s.fdiam === d ? '' : esc(d)) + '">' + esc(C.diamLabel(d)) + '</button>'; }).join('') + '</div>';
      if (!q) h += '<div class="vacio-s">Las posiciones aparecen aquí cuando usted escribe.</div>';
      else if (!lista.length) h += '<div class="vacio-s">No hay posiciones que coincidan con “' + esc(s.q) + '”.</div>';
      else h += '<div class="rlist">' + lista.map(function (p) {
        var a1 = ' data-v="' + esc(p.marca) + '" data-d="' + esc(p.diam) + '"';
        return '<div class="rr"><div class="rr-i"><b>' + esc(p.marca) + '</b><span>' + esc(C.diamLabel(p.diam)) + (p.largo ? ' · ' + p.largo.toFixed(2) + ' m' : '') + ' · ' + (arm ? 'libres ' : 'quedan ') + n0(p.disp) + '</span></div>' +
          '<button type="button" class="b1" data-a="sumar"' + a1 + '>+1</button>' +
          (p.disp > 1 ? '<button type="button" class="bt" data-a="todas"' + a1 + '>Todas · ' + n0(p.disp) + '</button>' : '') + '</div>'; }).join('') + '</div>';
      h += '</section>';
    }
    h += '<section class="paso"><div class="paso-h"><i>3</i><b>' + (arm ? 'Lo que se arma' : 'Lo que sale') + '</b>' + (s.items.length ? '<button type="button" class="lnk" data-a="vaciar">Vaciar</button>' : '') + '</div>';
    if (!s.items.length) h += '<div class="vacio-s">Todavía no ha agregado piezas.</div>';
    else h += '<div class="rlist">' + s.items.map(function (it, ix) {
      var v = S.calc.porMarca[it.elem + '|' + it.diam + '|' + it.marca], mx = v ? dispDe(v) : it.cant, a1 = ' data-v="' + esc(it.marca) + '" data-d="' + esc(it.diam) + '"';
      return '<div class="rr en"><div class="rr-i"><b>' + esc(it.marca) + '</b><span>' + esc(C.diamLabel(it.diam)) + (it.largo ? ' · ' + it.largo.toFixed(2) + ' m' : '') + ' · ' + kg(it.kg) + ' kg</span></div>' +
        '<div class="pc-ctl"><button type="button" data-a="restar"' + a1 + ' aria-label="Quitar una">−</button><input class="qn" type="number" inputmode="numeric" min="0" max="' + mx + '" value="' + it.cant + '" data-q="' + ix + '" aria-label="Cantidad"><button type="button" data-a="sumar"' + a1 + ' aria-label="Agregar una"' + (it.cant >= mx ? ' disabled' : '') + '>+</button></div>' +
        '<button type="button" class="bx" data-a="quitar" data-v="' + ix + '" aria-label="Quitar">✕</button></div>'; }).join('') + '</div>';
    h += '<details class="mas"><summary>Agregar una nota (opcional)</summary><input id="s-obs" type="text" maxlength="120" placeholder="Ej. turno noche" value="' + esc(s.obs) + '" data-i="sal.obs"></details></section>';
    if (s.err) h += '<div class="error">' + esc(s.err) + '</div>';
    var tp2 = 0, tk = 0; s.items.forEach(function (it) { tp2 += it.cant; tk += it.kg; });
    h += '<div class="sb-esp"></div><div class="sbar"><div class="sres">' + (s.items.length
      ? '<b>' + pz(tp2) + '</b><small>' + kg(tk) + ' kg</small>'
      : '<span class="mut">Aún no hay piezas</span>') + '</div>' +
      '<button type="button" class="btn sacar2" data-a="registrarSalida"' + (s.items.length ? '' : ' disabled') + '>' + (arm ? '🔧 Guardar armado' : '🚚 Guardar salida') + '</button></div>';
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
    var c = S.calc, v = S.inv, t = c.tot, filas = [];
    var elems = Object.keys(c.porElem).sort();
    var diams = Object.keys(c.porDiam).sort(function (a, b) { return C.diamOrder(a) - C.diamOrder(b); });
    var tarjetas;
    if (v.vista === 'diametro') {
      Object.keys(v.elem ? c.porElemDiam : c.porDiam).forEach(function (k) {
        var d = v.elem ? k.slice(k.lastIndexOf('|') + 1) : k, e = v.elem ? k.slice(0, k.lastIndexOf('|')) : '';
        if (v.elem && e !== v.elem) return;
        filas.push({ d: d, x: (v.elem ? c.porElemDiam : c.porDiam)[k] });
      });
      filas.sort(function (a, b) { return C.diamOrder(a.d) - C.diamOrder(b.d); });
      tarjetas = filas.map(function (f) { return estCard(esc(C.diamLabel(f.d)), '', f.x); });
    } else if (v.vista === 'elemento') {
      Object.keys(v.diam ? c.porElemDiam : c.porElem).forEach(function (k) {
        var e = v.diam ? k.slice(0, k.lastIndexOf('|')) : k, d = v.diam ? k.slice(k.lastIndexOf('|') + 1) : '';
        if (v.diam && d !== v.diam) return;
        filas.push({ e: e, x: (v.diam ? c.porElemDiam : c.porElem)[k] });
      });
      filas.sort(function (a, b) { return a.e < b.e ? -1 : 1; });
      tarjetas = filas.map(function (f) { return estCard(esc(f.e), '', f.x); });
    } else {
      var seen = {};
      S.estado.entradas.forEach(function (e) {
        var k = e.estructura + '|' + e.diametro + '|' + e.marca;
        if (seen[k] || (v.elem && e.estructura !== v.elem) || (v.diam && e.diametro !== v.diam)) return;
        seen[k] = 1;
        filas.push({ e: e.estructura, d: e.diametro, m: e.marca, largo: e.largo, x: c.porMarca[k] });
      });
      filas.sort(function (a, b) { return (a.e < b.e ? -1 : a.e > b.e ? 1 : 0) || C.diamOrder(a.d) - C.diamOrder(b.d) || cmpMarca(a.m, b.m); });
      tarjetas = filas.slice(0, 200).map(function (f) { return estCard('Posición ' + esc(f.m), esc(C.diamLabel(f.d)) + (f.largo ? ' · ' + f.largo.toFixed(2) + ' m' : '') + (v.elem ? '' : ' · ' + esc(f.e)), f.x); });
      if (filas.length > 200) tarjetas.push('<p class="peq mut">Se muestran 200 de ' + filas.length + '. Use los filtros para ver el resto.</p>');
    }
    return '<div class="hero"><small>En la playa de hierros hay</small><b>' + pz(t.sal_p) + '</b><span>' + kg(t.sal_kg) + ' kg</span>' + apilada(t) + '</div>' +
      '<div class="tri"><div class="tl lib"><div class="tl-i">✅</div><b>' + n0(t.lib_p) + '</b><strong>Libre</strong><i>' + kg(t.lib_kg) + ' kg</i></div>' +
      '<div class="tl arm"><div class="tl-i">🔧</div><b>' + n0(t.arm_p) + '</b><strong>Armado</strong><i>' + kg(t.arm_kg) + ' kg</i></div>' +
      '<div class="tl out"><div class="tl-i">🚚</div><b>' + n0(t.out_p) + '</b><strong>Salió</strong><i>' + kg(t.out_kg) + ' kg</i></div></div>' +
      '<div class="card"><div class="seg">' + [['diametro', 'Por varilla'], ['elemento', 'Por estructura'], ['marca', 'Por posición']].map(function (o) { return '<button class="' + (v.vista === o[0] ? 'on' : '') + '" data-a="invVista" data-v="' + o[0] + '">' + o[1] + '</button>'; }).join('') + '</div>' +
      '<div class="row2"><select data-f="inv.elem" style="flex:1;min-width:150px"><option value="">Todas las estructuras</option>' + elems.map(function (e) { return '<option value="' + esc(e) + '"' + (e === v.elem ? ' selected' : '') + '>' + esc(e) + '</option>'; }).join('') + '</select>' +
      '<select data-f="inv.diam" style="flex:1;min-width:130px"><option value="">Todas las varillas</option>' + diams.map(function (d) { return '<option value="' + esc(d) + '"' + (d === v.diam ? ' selected' : '') + '>' + esc(C.diamLabel(d)) + '</option>'; }).join('') + '</select></div></div>' +
      (tarjetas.length ? tarjetas.join('') : '<div class="card vacio">Sin datos con ese filtro</div>');
  }
  function vMovs() {
    var L = movimientos();
    return vFiltro() + '<div class="card"><div class="row2" style="justify-content:space-between"><h2 style="margin:0">Movimientos</h2><button class="btn chico sec" data-a="csv">Descargar CSV</button></div>' +
      (L.length ? L.slice(0, 150).map(function (m) { return vMov(m, true); }).join('') : '<div class="vacio">Sin movimientos</div>') +
      (L.length > 150 ? '<p class="peq mut">Se muestran los 150 más recientes. El CSV trae todo.</p>' : '') +
      (!Api.remoto && esAdmin() ? '<div style="margin-top:14px"><button class="btn chico peligro" data-a="borrarLocal">Borrar datos de prueba de este navegador</button></div>' : '') + '</div>';
  }

  // ---------- Informe diario (PDF de armado por estructura) ----------
  function numVar(d) { var n = C.NUMERO[d]; return n || (d ? C.diamLabel(d) : ''); }
  function datosInforme(dia) {
    var fd = function (x) { return String(x.fecha || '').slice(0, 10); };
    var act = S.estado.salidas.filter(function (x) { return x.estado !== 'ANULADA'; });
    var arm = act.filter(function (x) { return fd(x) === dia && tp(x) === 'ARMADO'; });
    var sal = act.filter(function (x) { return fd(x) === dia && tp(x) === 'SALIDA'; });
    var calc = S.calc || C.calcular(S.estado), tot = function (e) { return (calc.porElem[e] || {}).in_p || 0; };
    var ini = {}, hoyEnt = { p: 0, kg: 0 };
    S.estado.entradas.forEach(function (e) {
      var f = fd(e);
      if (f < dia) { var o = ini[e.diametro] || (ini[e.diametro] = { p: 0, kg: 0 }); o.p += +e.cantidad || 0; o.kg += +e.kg || 0; }
      else if (f === dia) { hoyEnt.p += +e.cantidad || 0; hoyEnt.kg += +e.kg || 0; }
    });
    act.forEach(function (x) { if (tp(x) === 'SALIDA' && fd(x) < dia) { var o = ini[x.diametro] || (ini[x.diametro] = { p: 0, kg: 0 }); o.p -= +x.cantidad || 0; o.kg -= +x.kg || 0; } });
    var run = {}, runH = {}, orig = {}, M = { aSale: { p: 0, kg: 0 }, aPrev: { p: 0, kg: 0 }, dir: { p: 0, kg: 0 } };
    act.filter(function (x) { return fd(x) <= dia; }).sort(function (a, b) { return String(a.fecha) < String(b.fecha) ? -1 : String(a.fecha) > String(b.fecha) ? 1 : String(a.id) < String(b.id) ? -1 : 1; }).forEach(function (x) {
      var k = x.elemento + '|' + x.diametro + '|' + (x.marca || ''), c = +x.cantidad || 0;
      if (tp(x) === 'ARMADO') { run[k] = (run[k] || 0) + c; if (fd(x) === dia) runH[k] = (runH[k] || 0) + c; return; }
      var viejo = Math.max(0, (run[k] || 0) - (runH[k] || 0)), dOld = Math.min(viejo, c), dHoy = Math.min(runH[k] || 0, c - dOld), dir = c - dOld - dHoy;
      run[k] = (run[k] || 0) - dOld - dHoy; runH[k] = (runH[k] || 0) - dHoy;
      if (fd(x) === dia) {
        orig[x.id] = [dOld + dHoy, dir];
        var kp = c ? (+x.kg || 0) / c : 0;
        M.aSale.p += dHoy; M.aSale.kg += dHoy * kp; M.aPrev.p += dOld; M.aPrev.kg += dOld * kp; M.dir.p += dir; M.dir.kg += dir * kp;
      }
    });
    function agrupar(L, modo) {
      var G = {}, ord = [];
      L.forEach(function (x) {
        var c = +x.cantidad || 0, kgx = +x.kg || 0, o = orig[x.id] || [0, c], partes = modo ? [['Armado', o[0]], ['Directo', o[1]]] : [['Armado', c]];
        partes.forEach(function (pt) {
          if (!pt[1]) return;
          var k = x.elemento + '|' + x.diametro + '|' + pt[0];
          if (!G[k]) { G[k] = { e: x.elemento, d: x.diametro, est: pt[0], p: 0, kg: 0, fases: {}, us: {}, pos: {} }; ord.push(k); }
          var g = G[k]; g.p += pt[1]; g.kg += c ? kgx * pt[1] / c : 0;
          if (x.fase) g.fases[x.fase] = 1; if (x.usuario) g.us[x.usuario] = 1; if (x.marca) g.pos[x.marca] = 1;
        });
      });
      ord.sort(function (a, b) { var x = G[a], y = G[b]; return x.e < y.e ? -1 : x.e > y.e ? 1 : C.diamOrder(x.d) - C.diamOrder(y.d) || (x.est < y.est ? -1 : 1); });
      return ord.map(function (k) { var g = G[k]; g.pc = tot(g.e) ? 100 * g.p / tot(g.e) : 0; return g; });
    }
    var ks = Object.keys(ini).filter(function (k) { return ini[k].p > 0; }).sort(function (a, b) { return C.diamOrder(a) - C.diamOrder(b); });
    var nEst = {}; arm.forEach(function (x) { nEst[x.elemento] = 1; });
    var fin = C.calcular({ pedidos: S.estado.pedidos, entradas: S.estado.entradas.filter(function (e) { return fd(e) <= dia; }), salidas: S.estado.salidas.filter(function (x) { return fd(x) <= dia; }) });
    var ini0 = C.calcular({ pedidos: S.estado.pedidos, entradas: S.estado.entradas.filter(function (e) { return fd(e) < dia; }), salidas: S.estado.salidas.filter(function (x) { return fd(x) < dia; }) });
    return {
      ini0: ini0, fin: fin, M: M, armP: arm.reduce(function (a, x) { return a + (+x.cantidad || 0); }, 0), dia: dia, ini: ini, ks: ks, hoyEnt: hoyEnt, armG: agrupar(arm, false), salG: agrupar(sal, true), nEst: Object.keys(nEst).length,
      kgArm: arm.reduce(function (a, x) { return a + (+x.kg || 0); }, 0), kgSal: sal.reduce(function (a, x) { return a + (+x.kg || 0); }, 0)
    };
  }
  function vInforme() {
    var dia = S.inf.d || hoyISO(), D = datosInforme(dia);
    return '<div class="card inf-ctl"><h2 style="margin-top:0">Informe del día</h2><label class="f" style="margin:0">Fecha<input type="date" max="' + hoyISO() + '" value="' + esc(dia) + '" data-f="inf.d"></label>' +
      '<div class="inf-res"><div><b>' + D.nEst + '</b><small>estructuras armadas</small></div><div><b>' + kg(D.kgArm) + '</b><small>kg armados</small></div><div><b>' + kg(D.kgSal) + '</b><small>kg que salieron</small></div></div>' +
      '<button class="btn blk" data-a="bajarInforme">⬇️ Descargar informe (PDF)</button>' +
      '<p class="peq mut">Parte diario de armado por estructura del día elegido. Personal (oficiales y ayudantes): se toma del Parte diario con la llave del usuario.</p></div>';
  }
  function descargarInforme() {
    var dia = S.inf.d || hoyISO(), D = datosInforme(dia), P = new MiniPdf('Parte diario de producción - Taller de acero ' + dia);
    var M = 36, AN = 523, FIN = 800, y = 0, VERDE = [0.043, 0.42, 0.227], CLARO = [0.91, 0.945, 0.925], BL = [1, 1, 1], d = dia.split('-');
    var resp = S.ses ? S.ses.nombre : '';
    function pagina() { P.nueva(); y = M; }
    function banda(t) { P.rect(M, y, AN, 17, VERDE); P.texto(M + AN / 2 - P.ancho(t, 9, true) / 2, y + 12, t, 9, true, BL); y += 17; }
    function celda(x, w, h, lineas, o) {
      o = o || {}; P.rect(x, y, w, h, o.fill, [0, 0, 0]);
      var yy = y + 3 + (o.size || 8.5), n = 0;
      lineas.forEach(function (ln) {
        var sz = ln.size || o.size || 8.5, tx = M, ax = P.ancho(ln.t, sz, ln.b);
        tx = o.al === 'c' ? x + w / 2 - ax / 2 : o.al === 'r' ? x + w - 3 - ax : x + 3;
        P.texto(tx, yy + n, ln.t, sz, ln.b, ln.c); n += sz + 2.2;
      });
    }
    function alto(lineas, size) { return Math.max(16, lineas.reduce(function (a, l) { return a + (l.size || size || 8.5) + 2.2; }, 0) + 5); }
    pagina();
    P.rect(M, y, AN, 34, VERDE);
    var t1 = 'PARTE DIARIO DE PRODUCCIÓN · TALLER DE ACERO'; P.texto(M + AN / 2 - P.ancho(t1, 12, true) / 2, y + 15, t1, 12, true, BL);
    var t2 = CFG.TITULO || 'Almacén de aceros'; P.texto(M + AN / 2 - P.ancho(t2, 8) / 2, y + 28, t2, 8, false, BL); y += 34;
    // fila de datos
    var meta = [['FECHA', d[2] + '/' + d[1] + '/' + d[0]], ['ESTRUCTURAS ARMADAS', String(D.nEst)], ['ARMADO', kg(D.kgArm) + ' kg'], ['SALIÓ', kg(D.kgSal) + ' kg']], mw = [110, 150, 130, 133], mx = M;
    meta.forEach(function (m, i) { P.rect(mx, y, mw[i], 22, CLARO, [0, 0, 0]); P.texto(mx + 4, y + 8, m[0], 6.5, true); P.texto(mx + 4, y + 18, m[1], 9.5, true); mx += mw[i]; });
    y += 22;
    P.texto(M, y + 11, 'Personal (oficiales y ayudantes): se toma del Parte diario del día, con la llave de este usuario.', 8, false, [0.25, 0.25, 0.25]); y += 18;
    // 1) almacén al iniciar
    function tabla4(titulo, primera, claves, mapa) {
      var W4 = [165, 52, 70, 52, 70, 52, 62];
      function cab4() { var x = M, T = [primera, 'Libre pzs', 'Libre kg', 'Armado pzs', 'Armado kg', 'Total pzs', 'Total kg']; T.forEach(function (t, i) { celda(x, W4[i], 16, [{ t: t, b: true, size: 7 }], { fill: CLARO, al: i ? 'c' : 'l', size: 7 }); x += W4[i]; }); y += 16; }
      if (y + 17 + 16 + 20 > FIN) pagina();
      banda(titulo); cab4();
      var T0 = { lib_p: 0, lib_kg: 0, arm_p: 0, arm_kg: 0, sal_p: 0, sal_kg: 0 };
      claves.forEach(function (k) {
        var q = mapa[k], ln = P.partir(k === '__' ? '' : (primera === '#Varilla' ? C.diamLabel(k) : k), W4[0] - 6, 8, false), h = Math.max(16, ln.length * 10.5 + 6);
        if (y + h > FIN) { pagina(); cab4(); }
        var vals = [q.lib_p, q.lib_kg, q.arm_p, q.arm_kg, q.sal_p, q.sal_kg], x = M;
        celda(x, W4[0], h, ln.map(function (t) { return { t: t, size: 8 }; }), { size: 8 }); x += W4[0];
        vals.forEach(function (v, i) { celda(x, W4[i + 1], h, [{ t: i % 2 ? kg(v) : n0(v), size: 8, b: i >= 4 }], { al: 'r', size: 8 }); x += W4[i + 1]; });
        y += h; Object.keys(T0).forEach(function (f) { T0[f] += q[f] || 0; });
      });
      if (y + 16 > FIN) { pagina(); cab4(); }
      var x2 = M; celda(x2, W4[0], 16, [{ t: 'TOTAL', b: true }], { fill: CLARO }); x2 += W4[0];
      [T0.lib_p, T0.lib_kg, T0.arm_p, T0.arm_kg, T0.sal_p, T0.sal_kg].forEach(function (v, i) { celda(x2, W4[i + 1], 16, [{ t: i % 2 ? kg(v) : n0(v), b: true, size: 8 }], { fill: CLARO, al: 'r' }); x2 += W4[i + 1]; });
      y += 16 + 10;
    }
    var F0 = D.ini0, k0 = Object.keys(F0.porDiam).filter(function (k) { return F0.porDiam[k].sal_p > 0; }).sort(function (a, b) { return C.diamOrder(a) - C.diamOrder(b); });
    if (k0.length) tabla4('1 · ACERO EN EL ALMACÉN AL INICIAR EL DÍA · POR VARILLA', '#Varilla', k0, F0.porDiam);
    else { banda('1 · ACERO EN EL ALMACÉN AL INICIAR EL DÍA'); P.rect(M, y, AN, 18, null, [0, 0, 0]); P.texto(M + 6, y + 12, 'No había acero en el almacén al iniciar el día.', 8.5); y += 28; }
    if (D.hoyEnt.p) { P.texto(M, y + 11, 'Además llegaron en el día: ' + n0(D.hoyEnt.p) + ' piezas (' + kg(D.hoyEnt.kg) + ' kg).', 8, false, [0.25, 0.25, 0.25]); y += 15; }
    y += 8;
    // 2) y 3) tablas con filas que se ajustan
    var CW = [50, 208, 42, 36, 42, 65, 80], CT = ['Estado', 'Estructura', '#Varilla', 'Cant.', '% estr.', 'Kg', 'Responsable'];
    function cabecera() { var x = M; CT.forEach(function (t, i) { celda(x, CW[i], 16, [{ t: t, b: true, size: 7.5 }], { fill: CLARO, al: i === 1 || i === 6 ? 'l' : 'c', size: 7.5 }); x += CW[i]; }); y += 16; }
    function tabla(titulo, G, vacio) {
      if (y + 17 + 16 + 24 > FIN) pagina();
      banda(titulo); cabecera();
      if (!G.length) { P.rect(M, y, AN, 18, null, [0, 0, 0]); P.texto(M + 6, y + 12, vacio, 8.5); y += 28; return; }
      var tp_ = 0, tk = 0;
      G.forEach(function (r) {
        var L1 = P.partir(r.e, CW[1] - 6, 8.5, true).map(function (t) { return { t: t, b: true }; });
        if (Object.keys(r.fases).length) P.partir('Fase: ' + Object.keys(r.fases).join(', '), CW[1] - 6, 7).forEach(function (t) { L1.push({ t: t, size: 7, c: [0.2, 0.2, 0.2] }); });
        var pos = Object.keys(r.pos).sort(cmpMarca).join(', ');
        if (pos) P.partir('Pos.: ' + pos, CW[1] - 6, 7).forEach(function (t) { L1.push({ t: t, size: 7, c: [0.2, 0.2, 0.2] }); });
        var Lr = P.partir(Object.keys(r.us).join(', '), CW[6] - 6, 8.5).map(function (t) { return { t: t }; });
        var h = Math.max(alto(L1), alto(Lr));
        if (y + h > FIN) { pagina(); cabecera(); }
        var x = M;
        [[[{ t: r.est, b: true }], 'c'], [L1, 'l'], [[{ t: numVar(r.d), b: true }], 'c'], [[{ t: n0(r.p) }], 'c'], [[{ t: fmtPct(r.pc) + '%' }], 'c'], [[{ t: kg(r.kg) }], 'r'], [Lr, 'l']].forEach(function (c, i) { celda(x, CW[i], h, c[0], { al: c[1] }); x += CW[i]; });
        y += h; tp_ += r.p; tk += r.kg;
      });
      if (y + 16 > FIN) { pagina(); cabecera(); }
      celda(M, CW[0] + CW[1] + CW[2], 16, [{ t: 'TOTAL', b: true }], { fill: CLARO });
      celda(M + CW[0] + CW[1] + CW[2], CW[3], 16, [{ t: n0(tp_), b: true }], { fill: CLARO, al: 'c' });
      celda(M + CW[0] + CW[1] + CW[2] + CW[3], CW[4], 16, [], { fill: CLARO });
      celda(M + AN - CW[5] - CW[6], CW[5], 16, [{ t: kg(tk), b: true }], { fill: CLARO, al: 'r' });
      celda(M + AN - CW[6], CW[6], 16, [], { fill: CLARO });
      y += 16 + 10;
    }
    tabla('2 · PRODUCCIÓN DE ACERO DEL DÍA (ARMADO POR ESTRUCTURA)', D.armG, 'No se armó acero este día.');
    tabla('3 · SALIDA DE ACERO DEL DÍA (ARMADO QUE SALIÓ O SALIDA DIRECTA)', D.salG, 'No salió acero este día.');
    // observaciones
    var Mx = D.M, obs = [];
    if (D.armP) obs.push('Se armaron ' + kg(D.kgArm) + ' kg (' + n0(D.armP) + ' piezas). De ellos, ' + kg(Mx.aSale.kg) + ' kg (' + n0(Mx.aSale.p) + ' piezas) salieron del almacén y ' + kg(Math.max(0, D.kgArm - Mx.aSale.kg)) + ' kg (' + n0(D.armP - Mx.aSale.p) + ' piezas) siguen en el almacén como acero armado.');
    if (Mx.aPrev.p) obs.push('Además salieron ' + kg(Mx.aPrev.kg) + ' kg (' + n0(Mx.aPrev.p) + ' piezas) de acero armado en días anteriores.');
    if (Mx.dir.p) obs.push('Salieron directo, sin armar: ' + kg(Mx.dir.kg) + ' kg (' + n0(Mx.dir.p) + ' piezas).');
    obs.push(D.kgSal ? 'Total que salió del almacén en el día: ' + kg(D.kgSal) + ' kg.' : 'En el día no salió acero del almacén.');
    var oL = []; obs.forEach(function (t) { P.partir(t, AN - 22, 8.5).forEach(function (ln, i) { oL.push({ t: ln, pt: i === 0 }); }); });
    var oH = oL.length * 11 + 8;
    if (y + 17 + oH > FIN) pagina();
    banda('OBSERVACIONES DEL DÍA');
    P.rect(M, y, AN, oH, null, [0, 0, 0]);
    oL.forEach(function (l, i) { if (l.pt) P.texto(M + 6, y + 12 + i * 11, '•', 8.5, true); P.texto(M + 16, y + 12 + i * 11, l.t, 8.5); });
    y += oH + 10;
    // almacén actualizado al cierre
    var F = D.fin;
    var kd = Object.keys(F.porDiam).filter(function (k) { return F.porDiam[k].sal_p > 0; }).sort(function (a, b) { return C.diamOrder(a) - C.diamOrder(b); });
    var ke = Object.keys(F.porElem).filter(function (k) { return F.porElem[k].sal_p > 0; }).sort();
    if (kd.length) {
      tabla4('4 · ACERO EN EL ALMACÉN AL CIERRE DEL DÍA · POR VARILLA', '#Varilla', kd, F.porDiam);
      tabla4('5 · ACERO EN EL ALMACÉN AL CIERRE DEL DÍA · POR ESTRUCTURA', 'Estructura', ke, F.porElem);
    } else { banda('4 · ACERO EN EL ALMACÉN AL CIERRE DEL DÍA'); P.rect(M, y, AN, 18, null, [0, 0, 0]); P.texto(M + 6, y + 12, 'No queda acero en el almacén.', 8.5); y += 28; }
    if (y + 50 > FIN) pagina();
    y += 26; P.linea(M, y, M + 250, y); P.linea(M + 290, y, M + AN, y);
    P.texto(M, y + 11, 'Responsable: ' + resp, 8.5); P.texto(M + 290, y + 11, 'Firma', 8.5);
    var gen = 'Generado ' + new Date().toLocaleString('es-CO') + '';
    P.pages.forEach(function (pg, i) {
      P.cur = pg; P.texto(M, 826, gen, 7, false, [0.35, 0.35, 0.35]);
      var h = 'Hoja ' + (i + 1) + ' de ' + P.pages.length; P.texto(M + AN - P.ancho(h, 7.5), 826, h, 7.5, true);
    });
    var blob = new Blob([P.salida()], { type: 'application/pdf' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'Informe_armado_' + dia + '.pdf';
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
    toast('Informe descargado');
  }

  var PAG = 15;
  function vPedidos() {
    if (!esAdmin()) return '<div class="card vacio">Solo el administrador ve los pedidos.</div>';
    var q = String(S.ped.q || '').trim().toLowerCase();
    var L = S.estado.pedidos.filter(function (p) {
      return !q || (String(p.pedido) + ' ' + p.estructura + ' ' + (p.archivo || '') + ' ' + (p.usuario || '')).toLowerCase().indexOf(q) >= 0;
    }).sort(function (a, b) { return a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0; });
    var tp2 = 0, tk = 0; L.forEach(function (p) { tp2 += p.piezas; tk += p.kg; });
    var pags = Math.max(1, Math.ceil(L.length / PAG)); if (S.ped.pag >= pags) S.ped.pag = pags - 1; if (S.ped.pag < 0) S.ped.pag = 0;
    var vis = L.slice(S.ped.pag * PAG, S.ped.pag * PAG + PAG);
    var h = '<div class="hero"><small>Pedidos' + (q ? ' que coinciden' : ' cargados') + '</small><b>' + n0(L.length) + (L.length === 1 ? ' pedido' : ' pedidos') + '</b><span>' + pz(tp2) + ' · ' + kg(tk) + ' kg</span></div>' +
      '<div class="card"><input id="p-q" type="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Buscar por pedido, estructura o archivo" value="' + esc(S.ped.q) + '" data-i="ped.q"></div>';
    if (!vis.length) return h + '<div class="card vacio">' + (S.estado.pedidos.length ? 'Ningún pedido coincide con “' + esc(S.ped.q) + '”.' : 'Aún no hay pedidos cargados.') + '</div>';
    h += vis.map(function (p) {
      var x = S.calc.porElem[p.estructura] || { lib_p: 0, arm_p: 0, out_p: 0 };
      return '<div class="pd"><div class="pd-h"><b>Pedido ' + esc(p.pedido) + '</b><span>' + fecha(p.fecha) + '</span></div><div class="pd-e">' + esc(p.estructura) + (p.descripcion ? '<em>' + esc(p.descripcion) + '</em>' : '') + '</div>' +
        '<div class="pd-m"><span><b>' + n0(p.piezas) + '</b> piezas</span><span><b>' + kg(p.kg) + '</b> kg</span><span>' + esc(p.usuario) + '</span></div>' +
        '<div class="pd-s"><span class="lib">✅ ' + n0(x.lib_p) + ' libres</span><span class="arm">🔧 ' + n0(x.arm_p) + ' armadas</span><span class="out">🚚 ' + n0(x.out_p) + ' salieron</span></div></div>';
    }).join('');
    if (pags > 1) h += '<div class="pag"><button class="btn sec" data-a="pagPed" data-v="-1"' + (S.ped.pag <= 0 ? ' disabled' : '') + '>← Anterior</button><span>Página ' + (S.ped.pag + 1) + ' de ' + pags + '</span><button class="btn sec" data-a="pagPed" data-v="1"' + (S.ped.pag >= pags - 1 ? ' disabled' : '') + '>Siguiente →</button></div>';
    return h;
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
      if (ya.length) h += '<div class="error"><b>🚫 Este DLI ya fue cargado</b> (pedido ' + ya.map(function (x) { return esc(x.pedido); }).join(', ') + '). No se puede guardar de nuevo, ni con otro número de pedido.</div>';
      h += '<div class="tw"><table><thead><tr><th>Diámetro</th><th class="n">Piezas</th><th class="n">Kg</th></tr></thead><tbody>' +
        Object.keys(por).sort(function (a, b) { return C.diamOrder(a) - C.diamOrder(b); }).map(function (d) { return '<tr><td>' + esc(C.diamLabel(d)) + '</td><td class="n">' + n0(por[d].p) + '</td><td class="n">' + kg(por[d].kg) + '</td></tr>'; }).join('') + '</tbody></table></div>';
      var pend = p.rows.map(function (r, j) { return { r: r, j: j }; }).filter(function (o) { return !o.r.largo; });
      if (pend.length) {
        h += '<div class="aviso"><b>Falta el largo de ' + pend.length + ' marca(s).</b> Escríbalo para poder registrar:</div><div class="tw"><table><tbody>' +
          pend.map(function (o) { return '<tr><td>Marca ' + esc(o.r.marca) + '</td><td>' + esc(o.r.cantidad) + ' pzs · ' + esc(o.r.forma) + '</td><td class="n"><input class="mini" type="number" step="0.01" min="0" placeholder="m" data-largo="' + i + ':' + o.j + '"></td></tr>'; }).join('') + '</tbody></table></div>';
      }
      h += '<details><summary>Ver las ' + p.rows.length + ' filas</summary><div class="tw"><table><thead><tr><th>Marca</th><th class="n">Cant.</th><th>Diám.</th><th class="n">Largo m</th><th class="n">Kg</th></tr></thead><tbody>' +
        p.rows.map(function (r) { return '<tr><td>' + esc(r.marca) + '</td><td class="n">' + r.cantidad + '</td><td>' + esc(C.diamLabel(r.diametro)) + '</td><td class="n">' + (r.largo ? kg(r.largo) : '—') + '</td><td class="n">' + kg(r.kg) + '</td></tr>'; }).join('') + '</tbody></table></div></details>';
      if (!ya.length) h += '<label class="f">Número de pedido de esta carga</label><input type="text" inputmode="numeric" placeholder="Ej. 203192" value="' + esc(c.pedido) + '" data-i="carga.' + i + '.pedido">';
      if (c.err && !ya.length) h += '<div class="error">' + esc(c.err) + '</div>';
      h += '<div class="row2" style="margin-top:12px">' + (ya.length ? '' : '<button class="btn" data-a="registrarCarga" data-v="' + i + '">Registrar en inventario</button>') + '<button class="btn sec" data-a="quitarCarga" data-v="' + i + '">Quitar</button></div></div>';
    });
    return h;
  }

  function vista() {
    switch (S.tab) {
      case 'salida': return vSalida();
      case 'inv': return vInv();
      case 'mov': return vMovs();
      case 'cargar': return vCargar();
      case 'ped': return vPedidos();
      case 'inf': return vInforme();
      default: return MODO === 'salidas' ? vSalida() : vPanel();
    }
  }

  function render() {
    var app = $('app');
    if (!S.ses) { app.innerHTML = vLogin(); return; }
    S.calc = C.calcular(S.estado);
    var fo = S.focus; S.focus = '';
    app.innerHTML = '<div class="cab">' + vTop() + vTabs() + '</div>' + vBandas() + '<main>' + vista() + '</main><div class="pie">Almacén de aceros · ' + (MODO === 'salidas' ? 'Salidas' : 'Panel de control') + ' · versión de prueba</div>';
    if (fo && $(fo)) { var el = $(fo); el.focus(); try { el.select(); } catch (e) { } }
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
    S.enviando = true; render();
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
    if (!c.err) {
      var rep = S.estado.pedidos.filter(function (x) { return x.estructura === p.nombre; })[0];
      if (!rep) rep = S.cargas.filter(function (x, j) { return j !== i && x.parsed.nombre === p.nombre; })[0] ? { pedido: 'en esta misma lista' } : null;
      if (rep) c.err = 'Este DLI ya fue cargado (' + p.nombre + ', pedido ' + rep.pedido + '). No se puede guardar de nuevo, ni con otro número de pedido.';
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
    var s = S.sal, lista = s.items.slice(), actual = null, tipoReg = s.tipo === 'ARMADO' ? 'ARMADO' : 'SALIDA';
    S.tipo2 = tipoReg;
    if (!lista.length) { s.err = s.modo === 'pct' ? 'Escriba el porcentaje de avance.' : 'Elija al menos una pieza.'; s.msg = ''; render(); return; }
    if (s.modo === 'pos' && !String(s.fase).trim()) { s.err = 'Escriba la fase.'; s.msg = ''; render(); return; }
    var pctV = s.modo === 'pct' ? (parseFloat(String(s.pct).replace(',', '.')) || 0) : 0, elemSel = s.elem;
    var llegaA100 = s.modo === 'pct' && tipoReg === 'SALIDA' && pctAcum(elemSel) + pctV >= 100 - 1e-9;
    for (var i = 0; i < lista.length; i++) {
      var err = S.tipo2 === 'ARMADO' ? C.validarArmado(S.calc, lista[i].elem, lista[i].diam, lista[i].cant, lista[i].marca) : C.validarSalida(S.calc, lista[i].elem, lista[i].diam, lista[i].cant, lista[i].marca);
      if (err) { s.err = 'Posición ' + lista[i].pos + ': ' + err; s.msg = ''; render(); return; }
    }
    var fch = /^\d{4}-\d\d-\d\d$/.test(s.fecha) ? s.fecha : hoyISO();
    if (fch > hoyISO()) { s.err = 'La fecha de salida no puede ser futura.'; s.msg = ''; render(); return; }
    if (!s.grupo) s.grupo = 'S' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    var totKg = 0, totP = 0; lista.forEach(function (it) { totKg += it.kg; totP += it.cant; });
    var obs = s.obs;
    s.err = ''; s.msg = '';
    Api.salidaLote(S.ses, { grupo: s.grupo, items: lista.map(function (it) { return { diametro: it.diam, cantidad: it.cant, elemento: it.elem, marca: it.marca }; }), obs: obs, fecha: fch, fase: s.modo === 'pos' ? String(s.fase).trim() : '', modo: s.modo === 'pct' ? 'PCT' : 'POS', pct: pctV, tipo: tipoReg }).then(function (r) {
      if (!r.ok) { s.err = r.error; render(); return; }
      s.obs = ''; s.fecha = ''; s.grupo = ''; s.n = 0; s.items = []; s.q = ''; s.pct = ''; s.elem = ''; s.diam = ''; s.marca = ''; s.pos = ''; s.cant = 1; s.fase = ''; s.fdiam = '';
      s.balElem = llegaA100 ? elemSel : '';
      s.msg = (tipoReg === 'ARMADO' ? 'Armado guardado: ' : 'Salida guardada: ') + pz(totP) + ' (≈ ' + kg(totKg) + ' kg)' + (s.modo === 'pct' ? ' · ' + fmtPct(pctV) + ' % de avance' : '') + '.';
      window.scrollTo(0, 0);
      if (Api.remoto) { S.estado = Api.conCola(S.estado); render(); return enviarCola(); }
      return cargarEstado();
    });
  }

  function descargarCSV() {
    var q = function (v) { v = String(v == null ? '' : v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var num = function (n) { return String(n == null ? '' : n).replace('.', ','); };
    var f = [['Tipo', 'Fecha', 'Pedido', 'Elemento', 'Posicion', 'Diametro', 'Cantidad', 'Largo_m', 'Kg', 'Usuario', 'Observacion', 'Estado']];
    var ped = {}; S.estado.pedidos.forEach(function (p) { ped[p.loadId] = p; });
    S.estado.entradas.forEach(function (e) { var p = ped[e.loadId] || {}; f.push(['ENTRADA', e.fecha, e.pedido, e.estructura, e.marca, e.diametro, e.cantidad, num(e.largo), num(e.kg), p.usuario || '', '', '']); });
    S.estado.salidas.forEach(function (s) { f.push([tp(s), s.fecha, '', s.elemento, s.marca, s.diametro, s.cantidad, '', num(s.kg), s.usuario, s.obs, s.estado]); });
    var blob = new Blob(['﻿' + f.map(function (r) { return r.map(q).join(';'); }).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'movimientos_aceros.csv';
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }


  // ---------- Eventos ----------
  document.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-a]'); if (!el) return;
    var a = el.getAttribute('data-a'), v = el.getAttribute('data-v');
    switch (a) {
      case 'tipo': if (S.sal.tipo !== v) { S.sal.tipo = v; S.sal.items = []; S.sal.pct = ''; S.sal.err = ''; S.sal.msg = ''; S.sal.balElem = ''; S.sal.q = ''; } render(); break;
      case 'modo': if (S.sal.modo !== v) { S.sal.modo = v; S.sal.items = []; S.sal.pct = ''; S.sal.err = ''; S.sal.msg = ''; S.sal.balElem = ''; } render(); break;
      case 'pctset': S.sal.pct = String(v); S.sal.msg = ''; aplicarPct(); render(); break;
      case 'cerrarBal': S.sal.balElem = ''; render(); break;
      case 'pagPed': S.ped.pag += +v; render(); window.scrollTo(0, 0); break;
      case 'per': S.per.k = v; render(); break;
      case 'tab': S.tab = v; render(); window.scrollTo(0, 0); break;
      case 'refrescar': cargarEstado().then(function () { toast('Actualizado'); }); break;
      case 'salir': Api.salir(); S.ses = null; S.loginErr = ''; render(); break;
      case 'todas': setCant(S.sal.elem, el.getAttribute('data-d'), v, 99999); render(); break;
      case 'quitar': S.sal.items.splice(+v, 1); S.sal.err = ''; render(); break;
      case 'sumar': sumarItem(S.sal.elem, el.getAttribute('data-d'), v, 1); render(); break;
      case 'restar': sumarItem(S.sal.elem, el.getAttribute('data-d'), v, -1); render(); break;
      case 'fdiam': S.sal.fdiam = v; render(); break;
      case 'vaciar': S.sal.items = []; S.sal.err = ''; render(); break;
      case 'registrarSalida': registrarSalida(); break;
      case 'invVista': S.inv.vista = v; render(); break;
      case 'registrarCarga': registrarCarga(+v); break;
      case 'quitarCarga': S.cargas.splice(+v, 1); render(); break;
      case 'csv': descargarCSV(); break;
      case 'bajarInforme': descargarInforme(); break;
      case 'enviarCola': enviarCola(); break;
      case 'limpiarErrores': Api.limpiarErroresCola(); render(); break;
      case 'anularSalida':
        if (confirm('¿Anular esto? El acero vuelve a como estaba antes.')) {
          toast('Anulando…');
          Api.anularSalida(S.ses, String(v).split(',')).then(function (r) {
            toast(r.ok ? 'Anulado' : r.error);
            if (r.ok) { S.tab = MODO === 'salidas' ? 'inv' : 'panel'; window.scrollTo(0, 0); }
            return cargarEstado();
          });
        }
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
      if (f === 'sal.elem') { S.sal.q = ''; S.sal.fdiam = ''; S.sal.items = []; S.sal.pct = ''; S.sal.balElem = ''; S.sal.fase = ''; }
      S.sal.err = ''; S.sal.msg = '';
      render(); return;
    }
    var dq = t.getAttribute('data-q');
    if (dq !== null) { var itq = S.sal.items[+dq]; if (itq) setCant(itq.elem, itq.diam, itq.marca, t.value); render(); return; }
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
    else if (i === 'sal.q') { S.sal.q = t.value; S.focus = 's-q'; render(); var e3 = $('s-q'); if (e3) { try { e3.setSelectionRange(e3.value.length, e3.value.length); } catch (x) { } } }
    else if (i === 'ped.q') { S.ped.q = t.value; S.ped.pag = 0; S.focus = 'p-q'; render(); var e5 = $('p-q'); if (e5) { try { e5.setSelectionRange(e5.value.length, e5.value.length); } catch (x) { } } }
    else if (i === 'sal.fecha') S.sal.fecha = t.value;
    else if (i === 'sal.fase') S.sal.fase = t.value;
    else if (i === 'sal.pct') { S.sal.pct = t.value.replace(/[^0-9.,]/g, ''); S.sal.msg = ''; aplicarPct(); S.focus = 's-pct'; render(); var e4 = $('s-pct'); if (e4) { try { e4.setSelectionRange(e4.value.length, e4.value.length); } catch (x) { } } }
    else {
      var m = /^carga\.(\d+)\.pedido$/.exec(i);
      if (m && S.cargas[+m[1]]) S.cargas[+m[1]].pedido = t.value;
    }
  });

  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter') return;
    if (ev.target.id === 's-q') { ev.preventDefault(); var qq = String(S.sal.q || '').trim().toLowerCase(), ex = piezasSalida(S.sal.elem).filter(function (p) { return p.marca.toLowerCase() === qq && p.disp > 0; }); if (ex.length === 1) { sumarItem(S.sal.elem, ex[0].diam, ex[0].marca, 1); S.sal.q = ''; S.focus = 's-q'; render(); } }
  });

  document.addEventListener('submit', function (ev) {
    if (ev.target.id !== 'f-login') return;
    ev.preventDefault();
    var nom = $('l-nom').value, pin = $('l-pin').value; S.loginNom = nom;
    Api.login(nom, pin).then(function (r) {
      if (!r.ok) { S.loginErr = r.error; render(); return; }
      if (MODO === 'dashboard' && r.ses.rol !== 'admin') { Api.salir(); S.loginErr = 'Esta aplicación es solo para el administrador. Use la app de Salidas.'; render(); return; }
      S.ses = r.ses; S.loginErr = ''; S.tab = MODO === 'salidas' ? 'salida' : 'panel';
      render(); enviarCola().then(cargarEstado);
    });
  });

  window.addEventListener('online', enviarCola);
  setInterval(function () { if (S.ses && Api.pendientes()) enviarCola(); }, 30000);

  // ---------- Inicio ----------
  S.ses = Api.sesion();
  if (S.ses && MODO === 'dashboard' && S.ses.rol !== 'admin') { Api.salir(); S.ses = null; S.loginErr = 'Esta aplicación es solo para el administrador. Use la app de Salidas.'; }
  if (S.ses) { render(); enviarCola().then(cargarEstado); } else render();
})();
