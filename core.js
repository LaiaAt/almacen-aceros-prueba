/*!
 * Almacén de aceros (prueba) — núcleo: lector de archivos .dli (DL-NET) y cálculo de inventario.
 * Autor: Carlos Eduardo Bermúdez Castro
 * Funciona en el navegador (window.AcerosCore) y en Node (module.exports).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AcerosCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- Pesos teóricos (kg/m) — los que usa Paz del Río (NTC 2289) ----------
  const PESOS = {
    '1/4': 0.249, '3/8': 0.560, '1/2': 0.994, '5/8': 1.552, '3/4': 2.235,
    '7/8': 3.042, '1': 3.973, '1-1/8': 5.060, '1-1/4': 6.404,
    'D4.0': 0.099, 'D4.5': 0.125, 'D5.0': 0.154, 'D5.5': 0.187, 'D6.0': 0.222,
    'D6.5': 0.260, 'D7.0': 0.302, 'D7.5': 0.347, 'D8.0': 0.395, 'D8.5': 0.446, 'D9.0': 0.500
  };
  const NUMERO = { '1/4': '#2', '3/8': '#3', '1/2': '#4', '5/8': '#5', '3/4': '#6', '7/8': '#7', '1': '#8', '1-1/8': '#9', '1-1/4': '#10' };
  const ORDEN = ['D4.0','D4.5','D5.0','D5.5','D6.0','D6.5','1/4','D7.0','D7.5','D8.0','D8.5','D9.0','3/8','1/2','5/8','3/4','7/8','1','1-1/8','1-1/4'];

  const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const r3 = (n) => Math.round((n + Number.EPSILON) * 1000) / 1000;

  function normDiam(d) {
    return String(d).replace(/["'”“′″]/g, '').trim();
  }
  function diamLabel(d) {
    if (!d) return '';
    if (d[0] === 'D') return d.replace('D', 'Ø') + ' mm';
    return d + '"' + (NUMERO[d] ? ' (' + NUMERO[d] + ')' : '');
  }
  function diamOrder(d) {
    const i = ORDEN.indexOf(d);
    return i < 0 ? 999 : i;
  }

  // ---------- Lector del .dli ----------
  // Estructura: celdas de texto = [double 8B (4 ceros + ...0x40)] [largo 2B] [texto] [2B de tipo].
  function latin1(bytes) {
    let s = '';
    const CH = 8192;
    for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return s;
  }

  function readCells(b) {
    const cells = [];
    const n = b.length;
    let i = 0;
    while (i + 12 < n) {
      if (b[i] === 0 && b[i + 1] === 0 && b[i + 2] === 0 && b[i + 3] === 0 && b[i + 7] === 0x40) {
        const len = b[i + 8] | (b[i + 9] << 8);
        if (len >= 1 && len <= 200 && i + 10 + len <= n) {
          let ok = true;
          for (let k = 0; k < len; k++) {
            const c = b[i + 10 + k];
            if (c < 0x20 || c > 0xfe) { ok = false; break; }
          }
          if (ok) {
            let t = '';
            for (let k = 0; k < len; k++) t += String.fromCharCode(b[i + 10 + k]);
            cells.push(t);
            i += 10 + len + 2;
            continue;
          }
        }
      }
      i++;
    }
    return cells;
  }

  const RE_MARCA = /^\d+[a-z]?(?:\.\d+)?$/;
  const RE_RECTA = /^(\d+)\s+"([^"]+)"\s+([0-9.]+)\s*(.*)$/;
  const RE_PATA = /^(\d+)\s+P\s+"?([^"\s]+)"?\s+([\d.]+)\/(-?[\d.]+)\s+([\d.]+)X\s+([\d.]+)\/(-?[\d.]+)/;
  const RE_ESTRIBO = /^(\d+)\s+E\s+"([^"]+)"\s+([\d.]*)\*([\d.]+)\s+G([\d.]+)/;

  /** Lee un .dli (Uint8Array) y devuelve las piezas con su cantidad, largo y peso. */
  function parseDLI(bytes, nombreArchivo) {
    const avisos = [];
    const s = latin1(bytes);
    if (s.indexOf('DL-NET') < 0) avisos.push('El archivo no parece ser un .dli de DL-NET.');

    const cells = readCells(bytes);

    // Cabecera: elemento y descripción
    let nombre = '', descripcion = '';
    const iNom = cells.findIndex((c) => /[A-Za-z]{4}/.test(c) && !/^(DL-NET|PREFERENCIAS|DIBUJOS)/.test(c) && !/^["#]/.test(c));
    if (iNom >= 0) { nombre = cells[iNom].trim(); descripcion = (cells[iNom + 1] || '').trim(); }
    if (!nombre && nombreArchivo) nombre = nombreArchivo.replace(/\.dli$/i, '');
    if (descripcion && !/^[A-Za-zÁÉÍÓÚÑ ]+$/.test(descripcion)) descripcion = '';

    // Empresa / proyecto (textos entre comillas de la cabecera)
    const q = (s.slice(0, 1500).match(/"([^"]{4,60})"/g) || []).map((x) => x.slice(1, -1))
      .filter((x) => !/#|^[\d\-\s]+$|@/.test(x));
    const empresa = q[0] || '';
    const proyecto = q[1] || '';

    // Filas del despiece: marca, multiplicador, dato
    const rows = [];
    let declarado = null;
    const esFila = (i) => i + 2 < cells.length && RE_MARCA.test(cells[i].trim()) && /^\s*\d+$/.test(cells[i + 1]) &&
      (RE_RECTA.test(cells[i + 2].trim()) || RE_PATA.test(cells[i + 2].trim()) || RE_ESTRIBO.test(cells[i + 2].trim()));
    let ini = 1;
    while (ini + 2 < cells.length && !esFila(ini)) ini++;
    if (/^\s*\d+$/.test(cells[ini - 1] || '')) declarado = parseInt(cells[ini - 1], 10);
    // Las filas vienen en tripletas: marca, multiplicador, dato. Se lee hasta que termina la tabla.
    for (let i = ini; i + 2 < cells.length; i += 3) {
      const marca = cells[i].trim();
      if (!RE_MARCA.test(marca) || !/^\s*\d+$/.test(cells[i + 1])) break;
      const mult = cells[i + 1];
      const dato = cells[i + 2].trim();
      if (!/^\d+\s+\S/.test(dato)) break;

      const m = parseInt(mult, 10) || 1;
      let cant, diam, largo = null, forma = '', aviso = '';
      let mm;
      if ((mm = RE_RECTA.exec(dato))) {
        cant = +mm[1]; diam = normDiam(mm[2]); largo = +mm[3]; forma = mm[4].replace(/\s+/g, ' ').trim();
      } else if ((mm = RE_PATA.exec(dato))) {
        cant = +mm[1]; diam = normDiam(mm[2]);
        largo = r2(+mm[5] + Math.hypot(+mm[3], +mm[4]) + Math.hypot(+mm[6], +mm[7]));
        forma = 'Barra con patas ' + mm[3] + '/' + mm[4] + ' · tramo ' + mm[5];
      } else if ((mm = RE_ESTRIBO.exec(dato))) {
        cant = +mm[1]; diam = normDiam(mm[2]);
        largo = r2(2 * (+('0' + mm[3]) + +mm[4]) + 2 * +mm[5]);
        forma = 'Estribo ' + mm[3] + '×' + mm[4] + ' gancho ' + mm[5];
      } else {
        const c = /^(\d+)\s+(.*)$/.exec(dato);
        cant = c ? +c[1] : 0; diam = (/"([^"]+)"|\s(\d[\d\/\-]*)''/.exec(dato) || [])[1] || '';
        diam = normDiam(diam); forma = dato;
        aviso = 'Forma no reconocida: indique el largo a mano';
      }
      if (!cant) continue; // solo cantidades positivas
      const cantidad = cant * m;
      const peso = PESOS[diam];
      if (!peso) aviso = aviso || 'Diámetro sin peso definido (' + diam + ')';
      rows.push({ marca, cantidad, diametro: diam, largo, forma, aviso, peso: peso || 0 });
    }
    recalcular(rows);

    if (declarado !== null && declarado !== rows.length)
      avisos.push('El archivo declara ' + declarado + ' filas y se leyeron ' + rows.length + '. Revise antes de registrar.');
    if (!rows.length) avisos.push('No se encontraron piezas en el archivo.');
    rows.forEach((r) => { if (r.aviso) avisos.push('Marca ' + r.marca + ': ' + r.aviso); });

    return { archivo: nombreArchivo || '', nombre, descripcion, empresa, proyecto, declarado, rows, avisos, ...totales(rows) };
  }

  function recalcular(rows) {
    rows.forEach((r) => {
      if (r.largo && r.peso) { r.kgUnit = r3(r.largo * r.peso); r.kg = r3(r.cantidad * r.largo * r.peso); }
      else { r.kgUnit = 0; r.kg = 0; }
    });
  }
  function totales(rows) {
    return {
      totalPiezas: rows.reduce((a, r) => a + r.cantidad, 0),
      totalKg: r2(rows.reduce((a, r) => a + r.kg, 0))
    };
  }

  // ---------- Inventario ----------
  function vacio() { return { in_p: 0, in_kg: 0, out_p: 0, out_kg: 0, sal_p: 0, sal_kg: 0 }; }
  function sumar(o, key, p, kg, tipo) {
    const x = o[key] || (o[key] = vacio());
    if (tipo === 'in') { x.in_p += p; x.in_kg += kg; } else { x.out_p += p; x.out_kg += kg; }
    x.sal_p = x.in_p - x.out_p; x.sal_kg = r3(x.in_kg - x.out_kg);
  }

  /** state = { pedidos:[], entradas:[], salidas:[] }  → totales por diámetro, elemento, pedido, marca. */
  function calcular(state) {
    const porDiam = {}, porElem = {}, porElemDiam = {}, porMarca = {}, porPedido = {};
    let tot = vacio();
    (state.entradas || []).forEach((e) => {
      sumar(porDiam, e.diametro, e.cantidad, e.kg, 'in');
      sumar(porElem, e.estructura, e.cantidad, e.kg, 'in');
      sumar(porElemDiam, e.estructura + '|' + e.diametro, e.cantidad, e.kg, 'in');
      sumar(porMarca, e.estructura + '|' + e.diametro + '|' + e.marca, e.cantidad, e.kg, 'in');
      sumar(porPedido, e.pedido + '|' + e.estructura, e.cantidad, e.kg, 'in');
      tot.in_p += e.cantidad; tot.in_kg += e.kg;
    });
    (state.salidas || []).filter((s) => s.estado !== 'ANULADA').forEach((s) => {
      sumar(porDiam, s.diametro, s.cantidad, s.kg, 'out');
      sumar(porElem, s.elemento, s.cantidad, s.kg, 'out');
      sumar(porElemDiam, s.elemento + '|' + s.diametro, s.cantidad, s.kg, 'out');
      if (s.marca) sumar(porMarca, s.elemento + '|' + s.diametro + '|' + s.marca, s.cantidad, s.kg, 'out');
      tot.out_p += s.cantidad; tot.out_kg += s.kg;
    });
    tot.sal_p = tot.in_p - tot.out_p; tot.sal_kg = r3(tot.in_kg - tot.out_kg);
    return { porDiam, porElem, porElemDiam, porMarca, porPedido, tot };
  }

  /** Disponible de un diámetro en un elemento (y opcionalmente una marca). */
  function disponible(calc, elemento, diametro, marca) {
    const x = (marca ? calc.porMarca[elemento + '|' + diametro + '|' + marca] : calc.porElemDiam[elemento + '|' + diametro]) || vacio();
    return { piezas: x.sal_p, kg: x.sal_kg };
  }

  /** kg de una salida: promedio del saldo; si se sacan todas, el saldo exacto (sin residuos). */
  function kgSalida(calc, elemento, diametro, cantidad, marca) {
    const d = disponible(calc, elemento, diametro, marca);
    if (!d.piezas || cantidad <= 0) return 0;
    if (cantidad >= d.piezas) return r3(d.kg);
    return r3((d.kg / d.piezas) * cantidad);
  }

  /** Valida una salida; devuelve texto de error o ''. */
  function validarSalida(calc, elemento, diametro, cantidad, marca) {
    if (!elemento) return 'Indique el elemento.';
    if (!diametro) return 'Indique el diámetro.';
    if (!(cantidad > 0) || Math.floor(cantidad) !== cantidad) return 'La cantidad debe ser un número entero mayor que 0.';
    const pool = disponible(calc, elemento, diametro, '');
    if (cantidad > pool.piezas) return 'Solo hay ' + pool.piezas + ' de ' + diamLabel(diametro) + ' en ' + elemento + '.';
    if (marca) {
      const m = disponible(calc, elemento, diametro, marca);
      if (cantidad > m.piezas) return 'Solo hay ' + m.piezas + ' de la marca ' + marca + '.';
    }
    return '';
  }

  /** Convierte un despiece leído en filas de entrada para el inventario. */
  // Posición = número de la etiqueta del listado para estribadora: dentro de cada diámetro, las barras iguales
  // (mismo largo y misma forma) forman una posición y se numeran de mayor a menor largo.
  // El .dli no guarda la posición; se reconstruye. En empates de largo el orden puede variar.
  function asignarPosiciones(rows) {
    const porDiam = {};
    rows.forEach((r) => { (porDiam[r.diametro] = porDiam[r.diametro] || []).push(r); });
    const grupos = [];
    Object.keys(porDiam).forEach((d) => {
      const g = new Map();
      porDiam[d].forEach((r) => {
        const k = (r.largo || 0).toFixed(2) + '|' + String(r.forma || '').replace(/[0-9.]+/g, '#').split('·')[0].trim();
        if (!g.has(k)) g.set(k, { diametro: d, largo: r.largo || 0, rows: [] });
        g.get(k).rows.push(r);
      });
      const L = [...g.values()].sort((a, b) => (b.largo - a.largo) || (a.rows[0].marca < b.rows[0].marca ? 1 : a.rows[0].marca > b.rows[0].marca ? -1 : 0));
      L.forEach((x, i) => { x.pos = i + 1; x.empate = L.some((y) => y !== x && Math.abs(y.largo - x.largo) < 0.005); grupos.push(x); });
    });
    return grupos;
  }

  function aEntradas(parsed, pedido, loadId, fecha) {
    return asignarPosiciones(parsed.rows).map((g) => {
      const cantidad = g.rows.reduce((a, r) => a + r.cantidad, 0);
      const kg = r3(g.rows.reduce((a, r) => a + r.kg, 0));
      return { loadId, pedido: String(pedido).trim(), estructura: parsed.nombre, marca: String(g.pos),
        diametro: g.diametro, cantidad, largo: g.largo, kgUnit: cantidad ? r3(kg / cantidad) : 0, kg, fecha };
    });
  }

  return { PESOS, NUMERO, parseDLI, recalcular, totales, calcular, disponible, kgSalida, validarSalida, aEntradas, asignarPosiciones, diamLabel, diamOrder, normDiam, r2, r3 };
});
