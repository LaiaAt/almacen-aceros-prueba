/* Almacén de aceros (prueba) — interfaz. Autor: Carlos Eduardo Bermúdez Castro */
(function () {
  'use strict';
  var C = window.AcerosCore, Api = window.Api, CFG = window.ACEROS_CONFIG;

  var S = {
    ses: null, estado: { pedidos: [], entradas: [], salidas: [] }, calc: null, tab: 'panel', offline: false, enviando: false,
    sal: { q: '', fdiam: '', items: [], grupo: '', n: 0, diam: '', elem: '', marca: '', pos: '', cant: 1, obs: '', fecha: '', msg: '', err: '' },
    inv: { vista: 'diametro', elem: '', diam: '' },
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
      '</div>';
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
    var G = {}, orden = [];
    S.estado.salidas.forEach(function (s) {
      var k = String(s.id).replace(/-\d+$/, '');
      if (!G[k]) { G[k] = []; orden.push(k); }
      G[k].push(s);
    });
    orden.forEach(function (k) { L.push({ t: 'S', f: G[k][0].fecha, s: G[k][0], g: G[k] }); });
    L.sort(function (a, b) { return a.f < b.f ? 1 : a.f > b.f ? -1 : 0; });
    return L;
  }

  function vMov(m, conAcciones) {
    if (m.t === 'E') {
      var p = m.p;
      return '<div class="mov"><div class="ic e">+</div><div class="cu"><b>Carga DLI · ' + esc(p.estructura) + '</b><span>Pedido ' + esc(p.pedido) + ' · ' + n0(p.piezas) + ' pzs · ' + kg(p.kg) + ' kg · ' + esc(p.usuario) + ' · ' + fecha(p.fecha) + '</span></div>' +
        (conAcciones && esAdmin() ? '<button class="btn chico sec" data-a="anularCarga" data-v="' + esc(p.loadId) + '">Anular</button>' : '') + '</div>';
    }
    if (m.g && m.g.length > 1) {
      var activas = m.g.filter(function (x) { return x.estado !== 'ANULADA'; }), anG = !activas.length, g0 = m.g[0];
      var totkg = activas.reduce(function (a, x) { return a + x.kg; }, 0);
      return '<div class="mov' + (anG ? ' anul' : '') + '"><div class="ic ' + (anG ? 'a' : 's') + '">−</div><div class="cu"><b>Salida · ' + m.g.length + ' líneas' + (anG ? '<span class="tag">anulada</span>' : '') + '</b>' +
        m.g.map(function (x) { return '<span>' + n0(x.cantidad) + ' × ' + esc(C.diamLabel(x.diametro)) + (x.marca ? ' · pos. ' + esc(x.marca) : '') + ' · ' + esc(x.elemento) + ' · ' + kg(x.kg) + ' kg' + (x.estado === 'ANULADA' && !anG ? ' (anulada)' : '') + '</span>'; }).join('') +
        '<span><b>' + kg(totkg) + ' kg</b> · ' + esc(g0.usuario) + ' · ' + fecha(g0.fecha) + (g0.obs ? ' · ' + esc(g0.obs) : '') + '</span></div>' +
        (conAcciones && esAdmin() && !anG && !m.g.some(function (x) { return x.pendiente; }) ? '<button class="btn chico sec" data-a="anularSalida" data-v="' + esc(activas.map(function (x) { return x.id; }).join(',')) + '">Anular todo</button>' : '') + '</div>';
    }
    var s = m.s, an = s.estado === 'ANULADA';
    return '<div class="mov' + (an ? ' anul' : '') + '"><div class="ic ' + (an ? 'a' : 's') + '">−</div><div class="cu"><b>' + n0(s.cantidad) + ' × ' + esc(C.diamLabel(s.diametro)) + ' · ' + esc(s.elemento) +
      (s.pendiente ? '<span class="tag pend">sin enviar</span>' : '') + (an ? '<span class="tag">anulada</span>' : '') + '</b><span>' + kg(s.kg) + ' kg' + (s.marca ? ' · pos. ' + esc(s.marca) : '') + ' · ' + esc(s.usuario) + ' · ' + fecha(s.fecha) + (s.obs ? ' · ' + esc(s.obs) : '') + '</span></div>' +
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
  function elemsDisp() {
    var r = {};
    Object.keys(S.calc.porElemDiam).forEach(function (k) {
      if (S.calc.porElemDiam[k].sal_p > 0) r[k.slice(0, k.lastIndexOf('|'))] = 1;
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
  function ajustarSalida() {
    var s = S.sal, es = elemsDisp();
    if (todasElems().indexOf(s.elem) < 0) s.elem = '';
    if (!s.elem && es.length === 1) s.elem = es[0];
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
      if (v.sal_p > 0 || en > 0) ms.push({ marca: x.marca, diam: x.diametro, largo: x.largo, disp: v.sal_p - en, total: v.in_p, en: en });
    });
    return ms.sort(function (a, b) { return C.diamOrder(a.diam) - C.diamOrder(b.diam) || cmpMarca(a.marca, b.marca); });
  }
  function sumarItem(e, d, m, delta) {
    var s = S.sal, it = s.items.filter(function (x) { return x.elem === e && x.diam === d && x.marca === m; })[0];
    var v = S.calc.porMarca[e + '|' + d + '|' + m]; if (!v) return;
    if (delta > 0) {
      if (v.sal_p - (it ? it.cant : 0) < 1) { toast('No quedan más piezas de esa posición'); return; }
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
    var s = S.sal, todas = todasElems(), conSaldo = elemsDisp();
    var h = '<div class="card sal"><h2>¿Qué acero sale hoy?</h2>';
    if (!conSaldo.length && !s.items.length) return h + '<div class="vacio">No queda acero disponible en el almacén.</div></div>';
    h += '<div class="fgrid">' +
      '<div class="fld"><label for="s-fecha">Fecha</label><input id="s-fecha" type="date" max="' + hoyISO() + '" value="' + esc(s.fecha || hoyISO()) + '" data-i="sal.fecha"></div>' +
      '<div class="fld" style="grid-column: span 2"><label for="s-elem">Estructura</label><select id="s-elem" data-f="sal.elem">' + (s.elem ? '' : '<option value="">Elija la estructura…</option>') +
        todas.map(function (e) {
          var pz = S.calc.porElem[e] ? S.calc.porElem[e].sal_p : 0, ped = {};
          S.estado.pedidos.forEach(function (p) { if (p.estructura === e) ped[p.pedido] = 1; });
          return '<option value="' + esc(e) + '"' + (e === s.elem ? ' selected' : '') + (pz > 0 || e === s.elem ? '' : ' disabled') + '>' + esc(e) + ' · pedido ' + esc(Object.keys(ped).join(', ')) + ' · ' + (pz > 0 ? n0(pz) + ' pzs' : 'sin saldo') + '</option>'; }).join('') + '</select></div></div>';
    if (!s.elem) { h += '<div class="vacio-s" style="margin-top:14px">Elija la estructura para ver las piezas.</div>'; }
    else {
      var todasP = piezasSalida(s.elem), diams = [];
      todasP.forEach(function (p) { if (diams.indexOf(p.diam) < 0) diams.push(p.diam); });
      var q = String(s.q || '').trim().toLowerCase().replace(',', '.');
      var lista = todasP.filter(function (p) {
        if (s.fdiam && p.diam !== s.fdiam) return false;
        if (!q) return true;
        return p.marca.toLowerCase().indexOf(q) >= 0 || (p.largo && p.largo.toFixed(2).indexOf(q) === 0);
      });
      var maxL = todasP.reduce(function (a, p) { return Math.max(a, p.largo || 0); }, 0) || 1;
      h += '<div class="busq"><input id="s-q" type="search" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Buscar: 4.06, 2a o largo 3.30" value="' + esc(s.q) + '" data-i="sal.q"></div>';
      if (diams.length > 1) h += '<div class="fch"><button type="button" class="fc' + (!s.fdiam ? ' on' : '') + '" data-a="fdiam" data-v="">Todas</button>' + diams.map(function (d) { return '<button type="button" class="fc' + (s.fdiam === d ? ' on' : '') + '" data-a="fdiam" data-v="' + esc(d) + '">' + esc(C.diamLabel(d)) + '</button>'; }).join('') + '</div>';
      h += '<div class="paso-t">Toque una pieza para agregarla a la salida</div>';
      if (!lista.length) h += '<div class="vacio-s">No hay piezas que coincidan con "' + esc(s.q) + '".</div>';
      else h += '<div class="pgrid">' + lista.map(function (p) {
        var dis = p.disp <= 0;
        return '<div class="pc' + (p.en ? ' en' : '') + (dis && !p.en ? ' agot' : '') + '"' + (dis ? '' : ' data-a="sumar" data-v="' + esc(p.marca) + '" data-d="' + esc(p.diam) + '"') + '>' +
          '<div class="pc-c">' + esc(p.marca) + '</div><div class="pc-d">' + esc(C.diamLabel(p.diam)) + (p.largo ? ' · ' + p.largo.toFixed(2) + ' m' : '') + '</div>' +
          '<div class="pc-b"><i style="width:' + Math.max(6, Math.round(100 * (p.largo || 0) / maxL)) + '%"></i></div>' +
          '<div class="pc-q">' + (p.disp > 0 ? 'Quedan ' + n0(p.disp) : 'Sin más') + '</div>' +
          (p.en ? '<div class="pc-ctl"><button type="button" data-a="restar" data-v="' + esc(p.marca) + '" data-d="' + esc(p.diam) + '" aria-label="Quitar una">−</button><b>' + p.en + '</b><button type="button" data-a="sumar" data-v="' + esc(p.marca) + '" data-d="' + esc(p.diam) + '" aria-label="Agregar una"' + (dis ? ' disabled' : '') + '>+</button></div>' : '') +
          '</div>'; }).join('') + '</div>';
    }
    h += '<details class="mas"><summary>Agregar una nota (opcional)</summary><input id="s-obs" type="text" maxlength="120" placeholder="Ej. losa de fondo, turno noche" value="' + esc(s.obs) + '" data-i="sal.obs"></details>';
    if (s.err) h += '<div class="error">' + esc(s.err) + '</div>';
    var tp = 0, tk = 0; s.items.forEach(function (it) { tp += it.cant; tk += it.kg; });
    h += '<div class="sb-esp"></div><div class="sbar"><div class="sres">' + (s.items.length
      ? '<b>' + n0(tp) + (tp === 1 ? ' pieza' : ' piezas') + '</b> · ' + kg(tk) + ' kg<small>' + s.items.map(function (it) { return esc(it.pos) + ' ×' + it.cant; }).join(' · ') + '</small>'
      : '<span class="mut">Aún no ha elegido piezas</span>') + '</div>' +
      (s.items.length ? '<button type="button" class="btn sec" data-a="vaciar">Vaciar</button>' : '') +
      '<button type="button" class="btn sacar2" data-a="registrarSalida"' + (s.items.length ? '' : ' disabled') + '>Sacar</button></div>';
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
      cols = [{ t: 'Elemento', f: function (f) { return esc(f.e); } }, { t: 'Diám.', f: function (f) { return esc(C.diamLabel(f.d)); } }, { t: 'Posición', f: function (f) { return '<b>' + esc(f.m) + '</b>'; } },
        { t: 'Largo m', n: 1, f: function (f) { return f.largo ? kg(f.largo) : ''; } }].concat(base);
    }
    var h = '<div class="card"><h2>Inventario</h2><div class="seg">' +
      [['diametro', 'Por diámetro'], ['elemento', 'Por elemento'], ['marca', 'Por posición']].map(function (o) { return '<button class="' + (v.vista === o[0] ? 'on' : '') + '" data-a="invVista" data-v="' + o[0] + '">' + o[1] + '</button>'; }).join('') + '</div>' +
      '<div class="row2"><select data-f="inv.elem" style="flex:1;min-width:150px"><option value="">Todos los elementos</option>' + elems.map(function (e) { return '<option value="' + esc(e) + '"' + (e === v.elem ? ' selected' : '') + '>' + esc(e) + '</option>'; }).join('') + '</select>' +
      '<select data-f="inv.diam" style="flex:1;min-width:130px"><option value="">Todos los diámetros</option>' + diams.map(function (d) { return '<option value="' + esc(d) + '"' + (d === v.diam ? ' selected' : '') + '>' + esc(C.diamLabel(d)) + '</option>'; }).join('') + '</select></div>' +
      '<div style="margin-top:10px">' + (filas.length ? tablaInv(filas, cols) : '<div class="vacio">Sin datos con ese filtro</div>') + '</div>' +
      (v.vista === 'marca' ? '<p class="peq mut">Posición = número de la etiqueta.</p>' : '') + '</div>';
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
    var fo = S.focus; S.focus = '';
    app.innerHTML = '<div class="cab">' + vTop() + vTabs() + '</div>' + vBandas() + '<main>' + vista() + '</main><div class="pie">Almacén de aceros · versión de prueba</div>';
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
    var s = S.sal, lista = s.items.slice(), actual = null;
    if (!lista.length) { s.err = 'Elija al menos una pieza.'; s.msg = ''; render(); return; }
    for (var i = 0; i < lista.length; i++) {
      var err = C.validarSalida(S.calc, lista[i].elem, lista[i].diam, lista[i].cant, lista[i].marca);
      if (err) { s.err = 'Posición ' + lista[i].pos + ': ' + err; s.msg = ''; render(); return; }
    }
    var fch = /^\d{4}-\d\d-\d\d$/.test(s.fecha) ? s.fecha : hoyISO();
    if (fch > hoyISO()) { s.err = 'La fecha de salida no puede ser futura.'; s.msg = ''; render(); return; }
    if (!s.grupo) s.grupo = 'S' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    lista.forEach(function (it) { if (!it.id) it.id = s.grupo + '-' + (++s.n); });
    var enviadas = 0, pend = false, totKg = 0, fallo = '';
    lista.reduce(function (pr, it) {
      return pr.then(function () {
        if (fallo) return;
        return Api.salida(S.ses, { id: it.id, diametro: it.diam, cantidad: it.cant, elemento: it.elem, marca: it.marca, obs: s.obs, fecha: fch }).then(function (r) {
          if (!r.ok) { fallo = 'Posición ' + it.pos + ': ' + r.error; return; }
          enviadas++; totKg += it.kg; if (r.pendiente) pend = true;
          s.items = s.items.filter(function (x) { return x !== it; });
          if (it === actual) { s.pos = ''; s.marca = ''; s.cant = 1; }
        });
      });
    }, Promise.resolve()).then(function () {
      if (fallo) { s.err = (enviadas ? 'Se registraron ' + enviadas + ' de ' + lista.length + '. ' : '') + fallo; s.msg = ''; return cargarEstado(); }
      s.err = ''; s.obs = ''; s.fecha = ''; s.grupo = ''; s.n = 0; s.items = [];
      s.msg = 'Salida registrada: ' + enviadas + (enviadas === 1 ? ' línea' : ' líneas') + ' (≈ ' + kg(totKg) + ' kg)' + (pend ? '. Sin señal: se enviará sola al volver la conexión.' : '.');
      toast('Salida registrada');
      S.tab = 'panel'; window.scrollTo(0, 0);
      return cargarEstado();
    });
  }

  function descargarCSV() {
    var q = function (v) { v = String(v == null ? '' : v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var num = function (n) { return String(n == null ? '' : n).replace('.', ','); };
    var f = [['Tipo', 'Fecha', 'Pedido', 'Elemento', 'Posicion', 'Diametro', 'Cantidad', 'Largo_m', 'Kg', 'Usuario', 'Observacion', 'Estado']];
    var ped = {}; S.estado.pedidos.forEach(function (p) { ped[p.loadId] = p; });
    S.estado.entradas.forEach(function (e) { var p = ped[e.loadId] || {}; f.push(['ENTRADA', e.fecha, e.pedido, e.estructura, e.marca, e.diametro, e.cantidad, num(e.largo), num(e.kg), p.usuario || '', '', '']); });
    S.estado.salidas.forEach(function (s) { f.push(['SALIDA', s.fecha, '', s.elemento, s.marca, s.diametro, s.cantidad, '', num(s.kg), s.usuario, s.obs, s.estado]); });
    var blob = new Blob(['﻿' + f.map(function (r) { return r.map(q).join(';'); }).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'movimientos_aceros.csv';
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }


  // ---------- Eventos ----------
  document.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-a]'); if (!el) return;
    var a = el.getAttribute('data-a'), v = el.getAttribute('data-v');
    switch (a) {
      case 'tab': S.tab = v; render(); window.scrollTo(0, 0); break;
      case 'refrescar': cargarEstado().then(function () { toast('Actualizado'); }); break;
      case 'salir': Api.salir(); S.ses = null; S.loginErr = ''; render(); break;
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
      case 'enviarCola': enviarCola(); break;
      case 'limpiarErrores': Api.limpiarErroresCola(); render(); break;
      case 'anularSalida':
        if (confirm('¿Anular esta salida? El acero vuelve al inventario.')) {
          var ids = String(v).split(','), okT = true, errT = '';
          ids.reduce(function (pr, id) { return pr.then(function () { return Api.anularSalida(S.ses, id).then(function (r) { if (!r.ok) { okT = false; errT = r.error; } }); }); }, Promise.resolve())
            .then(function () { toast(okT ? 'Salida anulada' : errT); return cargarEstado(); });
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
      if (f === 'sal.elem') { S.sal.q = ''; S.sal.fdiam = ''; }
      S.sal.err = ''; S.sal.msg = '';
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
    else if (i === 'sal.q') { S.sal.q = t.value; S.focus = 's-q'; render(); var e3 = $('s-q'); if (e3) { try { e3.setSelectionRange(e3.value.length, e3.value.length); } catch (x) { } } }
    else if (i === 'sal.fecha') S.sal.fecha = t.value;
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
