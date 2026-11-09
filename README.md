# Almacén de aceros (prueba)

App instalable en el celular (PWA) para controlar el acero de la playa de hierros: **entradas desde el .dli**, **salidas por supervisor** y **dashboard**.
Proyecto independiente: no toca Parte diario ni Transportes.

Autor: Carlos Eduardo Bermúdez Castro

## Cómo funciona

1. **Administrador** entra con su PIN, carga uno o varios `.dli` y escribe el **número de pedido** de cada uno. La app lee el archivo y suma al inventario todas las piezas con cantidad mayor que cero, por diámetro, con su cantidad y sus kilos (peso teórico 1/2" = 0.994 kg/m, el de Paz del Río).
2. **Supervisor** entra con su PIN y registra la salida: **tipo de varilla → elemento → cantidad** (la marca es opcional). No deja sacar más de lo que hay.
3. **Panel** muestra ingresado, salido y saldo (kg y piezas) por diámetro, elemento y pedido. El **CSV** de movimientos se baja desde la pestaña Movimientos.
4. El administrador puede **anular** una salida (el acero vuelve al inventario) o una carga completa (si ese elemento no tiene salidas).
5. Sin señal en obra: la salida queda en el celular y se envía sola al volver la conexión.

## Puesta en marcha

### A. Datos compartidos (Google Sheet + Apps Script, 5 minutos)
1. Cree un Google Sheet **nuevo** (por ejemplo "ACEROS_ALMACEN_PRUEBA"). No use el de Parte diario.
2. Extensiones → Apps Script. Borre lo que haya y pegue el contenido de `apps-script/Code.gs`. Guarde.
3. Ejecute una vez la función `configurar` (autorice los permisos). Crea las hojas Pedidos, Entradas y Salidas.
4. Implementar → Nueva implementación → tipo **Aplicación web** → Ejecutar como: *Yo* → Quién tiene acceso: *Cualquier usuario*. Copie la URL que termina en `/exec`.
5. Configuración del proyecto → Propiedades de la secuencia de comandos: cambie `ADMIN_PIN` y `SUP_PIN` (inician en 1234 y 0000).

### B. Publicar en GitHub (repositorio nuevo, separado del de Parte diario)
1. Cree un repositorio nuevo (ej. `almacen-aceros-prueba`) y suba todos los archivos de esta carpeta.
2. Settings → Pages → Deploy from a branch → `main` / raíz.
3. En `config.js` pegue la URL del paso A4 en `API_URL` y suba el cambio.
4. Abra la dirección de Pages en el celular → menú del navegador → **Agregar a pantalla de inicio**.

Sin `API_URL` la app funciona en **modo local** (datos solo en ese navegador, PIN 1234 / 0000): sirve para que los ingenieros la revisen sin instalar nada.

## Seguridad (versión de prueba)
- Los PIN se validan en el servidor; cualquier acción sin PIN válido se rechaza. Es una protección básica, no un sistema de usuarios.
- El código de la app es público si el repositorio es público; los datos no, porque están en el Sheet y solo se entregan con PIN.
- Para pasar a producción conviene un PIN por persona y auditoría de accesos.

## Archivos
- `core.js` lector del .dli, pesos e inventario · `api.js` datos (servidor/local/cola sin señal) · `app.js` interfaz
- `apps-script/Code.gs` servidor · `sw.js` y `manifest.webmanifest` instalación y uso sin señal
- `test/test.js` pruebas: `node test/test.js` (valida contra el PDF de Paz del Río: 467.88 kg)

## Límites conocidos
- Formas del .dli distintas a recta, barra con patas (P) y estribo (E) no se calculan solas: la app pide el largo a mano antes de registrar.
- Al **cambiar la versión** de la app, suba el número de `VERSION` en `sw.js` para que los celulares se actualicen.
