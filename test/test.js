// Pruebas del núcleo. Ejecutar: node test/test.js
const fs = require('fs');
const path = require('path');
const C = require('../core.js');
let fallos = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + m); if (!c) fallos++; };

const bytes = new Uint8Array(fs.readFileSync(path.join(__dirname, 'alcantarilla.dli')));
const p = C.parseDLI(bytes, '03._ALCANTARILLA_5364.97.dli');
console.log(p.nombre, '|', p.descripcion, '|', p.empresa, '|', p.proyecto);

ok(p.rows.length === 92, 'Se leen 92 filas (declaradas: ' + p.declarado + ') → ' + p.rows.length);
ok(p.declarado === 92, 'Cantidad de filas declarada en el archivo = 92');
ok(p.totalPiezas === 233, 'Total piezas = 233 → ' + p.totalPiezas);
ok(p.avisos.length === 0, 'Sin avisos → ' + JSON.stringify(p.avisos));
ok(p.nombre === 'ALCANTARILLA 5+364.97', 'Nombre del elemento');
ok(p.descripcion === 'DESCOLE', 'Descripción = DESCOLE');
const get = (m) => p.rows.find((r) => r.marca === m);
ok(get('9').largo === 1.9 && get('10').largo === 1.75 && get('16').largo === 1.21, 'Largos de barras con patas (1.90 / 1.75 / 1.21)');
ok(get('11.01').largo === 2.44 && get('11.02').largo === 3.14 && get('13').largo === 1.72, 'Largos de estribos (2.44 / 3.14 / 1.72)');
const kgPdf = 467.88;
ok(Math.abs(p.totalKg - kgPdf) <= 0.05, 'Peso total ' + p.totalKg + ' kg vs PDF Paz del Río ' + kgPdf + ' kg');

// Inventario
const state = { pedidos: [], entradas: C.aEntradas(p, '203192', 'L1', '2026-11-09'), salidas: [] };
let calc = C.calcular(state);
ok(calc.porDiam['1/2'].sal_p === 233, 'Saldo 1/2" = 233 piezas');
ok(Math.abs(calc.tot.in_kg - kgPdf) <= 0.05, 'Ingreso total en kg');
const el = 'ALCANTARILLA 5+364.97';
ok(C.validarSalida(calc, el, '1/2', 500, '') !== '', 'Rechaza salida mayor al saldo');
ok(C.validarSalida(calc, el, '3/8', 1, '') !== '', 'Rechaza diámetro sin existencias');
ok(C.validarSalida(calc, el, '1/2', 5, '') === '', 'Acepta salida de 5');
const kg5 = C.kgSalida(calc, el, '1/2', 5, '');
state.salidas.push({ id: 'S1', estado: 'ACTIVA', diametro: '1/2', cantidad: 5, elemento: el, marca: '', kg: kg5 });
calc = C.calcular(state);
ok(calc.porDiam['1/2'].sal_p === 228, 'Saldo tras salida = 228');
// Sacar todo lo que queda deja el saldo exactamente en 0 kg
const resto = calc.porDiam['1/2'].sal_p;
state.salidas.push({ id: 'S2', estado: 'ACTIVA', diametro: '1/2', cantidad: resto, elemento: el, marca: '', kg: C.kgSalida(calc, el, '1/2', resto, '') });
calc = C.calcular(state);
ok(calc.porDiam['1/2'].sal_p === 0 && Math.abs(calc.porDiam['1/2'].sal_kg) < 0.011, 'Saldo final 0 piezas / 0 kg → ' + calc.porDiam['1/2'].sal_kg);
// Salida anulada no cuenta
state.salidas[1].estado = 'ANULADA';
calc = C.calcular(state);
ok(calc.porDiam['1/2'].sal_p === resto, 'Una salida anulada devuelve el saldo');

console.log(fallos ? '\n' + fallos + ' prueba(s) fallaron' : '\nTodas las pruebas pasaron');
process.exit(fallos ? 1 : 0);
