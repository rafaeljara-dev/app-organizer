# Estante

Ábrelo en el móvil y añádelo a la pantalla de inicio para usarlo como app.

Un organizador de webapps que se instala como PWA y las agrupa en una pantalla
de inicio propia: páginas con nombre, carpetas, búsqueda al alcance del pulgar
y una cuadrícula que puedes ajustar.

**Para qué sirve.** Muchas apps que instalas en el teléfono las abres una vez al
mes. Ocupan espacio visual, distraen y consumen memoria, y casi todas tienen una
versión web perfectamente usable. Los marcadores del navegador no sirven para
esto: son una lista plana, sin carpetas, sin orden propio y sin iconos decentes.
Estante es esa capa que falta.

## Cómo funciona

Instalas **una** PWA. Dentro pegas la dirección de un servicio y ya está: la app
va al sitio, lee su icono y su nombre, y lo coloca en la página que elijas. Al
tocarlo se abre en el navegador.

## El icono sale de la dirección

Cada sitio publica su propio icono, y `/api/icon` lo va a buscar por ti. El
orden importa:

1. **El manifiesto** (`<link rel="manifest">`). Es la fuente autorizada: el
   sitio dice qué imagen lo representa, en qué tamaños, y de paso su nombre
   corto y su color de tema.
2. **`apple-touch-icon`**, normalmente 180 px y ya recortado como cuadrado.
3. **`<link rel="icon">`**, prefiriendo SVG y descartando los `.ico` de 16 px.
4. **`og:image`**, que es un banner social y no un icono, pero es mejor que nada.
5. **`/favicon.ico`**, el último recurso.

Entre varios candidatos gana el que más se acerque a 256 px, penalizando los
`maskable` porque se dibujan con zona de seguridad y se ven recortados fuera de
su máscara. El tipo real se decide olfateando los primeros bytes, no fiándose
de la cabecera `content-type`, que muchas veces miente.

El icono se guarda como data URL en tu dispositivo. Así sigue estando sin
conexión y no se rompe si el sitio cambia su ruta.

Un icono que llega de un manifiesto o de `apple-touch-icon` es un cuadrado
terminado y llena la teja. Un favicon o un banner no lo son, así que se dibujan
dentro de la teja sobre el color de la marca.

### Ese endpoint es una puerta hacia dentro, y está cerrada

Un servicio que busca cualquier dirección que le pasen es un proxy abierto si no
se defiende. `lib/net-guard.ts` sólo admite `http` y `https`, sólo los puertos
80 y 443, y resuelve el nombre antes de tocarlo para rechazar todo lo que caiga
en rango privado: loopback, enlaces locales, el metadato de la nube en
`169.254.169.254`, las redes internas y las IPv4 escondidas dentro de IPv6. Los
motivos que devuelve están saneados para no filtrar errores internos.

Se abre siempre fuera de la app, nunca dentro. La mayoría de sitios grandes
bloquean el empotrado con `X-Frame-Options` o `frame-ancestors`, así que un
navegador interno fallaría con Gmail, WhatsApp o cualquier banco. En Android el
enlace abre una vista integrada con botón de regreso, y si el destino tiene su
propia PWA instalada el sistema la abre directamente. En iOS abre una hoja de
Safari dentro de la app.

## Tus datos

Todo vive en IndexedDB, en tu dispositivo. No hay cuentas, no hay servidor, no
hay analítica. Exportar produce un JSON con versión de esquema; importar lo lee
de vuelta. Haz copias: si pierdes el almacenamiento del navegador, pierdes el
estante.

## El cristal

Las superficies usan el enfoque que Apple llama Liquid Glass, hasta donde el
navegador lo permite:

1. Un tinte de baja opacidad, para que la superficie sea un material y no un
   agujero.
2. `backdrop-filter` con desenfoque y saturación. Esto lo hacen todos los
   navegadores modernos.
3. Un anillo de borde en degradado que recoge la luz arriba a la izquierda y
   vuelve a recogerla abajo a la derecha.
4. Refracción de borde con un filtro SVG `feDisplacementMap`, donde el canal
   rojo del mapa desplaza en horizontal y el verde en vertical.

El punto cuatro **sólo funciona en navegadores Chromium**: `url()` dentro de
`backdrop-filter` lo ignoran Safari y Firefox. Por eso la refracción vive en su
propia capa, y quien no la soporta se queda con los tres primeros puntos en vez
de perder el desenfoque entero. Se puede apagar desde los ajustes.

En dispositivos Apple la tipografía es San Francisco, la del sistema. En el
resto se usa Onest, empaquetada con la app.

## Desarrollo

```bash
npm install
npm run dev            # http://localhost:3000
npm run typecheck
npm run build          # compilación para Vercel, con el service worker
```

Se despliega en Vercel. El complemento de Serwist usa webpack, así que la
construcción lleva `--webpack`: Next 16 usa Turbopack por defecto y los dos no
conviven todavía.

### Pruebas

```bash
npm run test:icons     # resolvedor y guardia de red, contra un sitio de prueba
npm run build && npm run test:ui    # la interfaz en un navegador real
npm run build && npm run test:sw    # service worker y arranque sin conexión
```

`test:icons` levanta un servidor que imita los casos que se dan de verdad: con
manifiesto, sólo con `apple-touch-icon`, con SVG, con la cabecera mintiendo
sobre el tipo, con el manifiesto roto, con redirección y sin ningún icono. Las
pruebas de navegador necesitan Playwright.
- `app/` rutas, estilos y manifiesto
- `components/` la interfaz
- `lib/` tipos, almacén, catálogo e iconos
- `app/api/icon/` el servicio que saca el icono de una dirección
- `lib/resolve-icon.ts` la lógica de resolución, y `lib/net-guard.ts` su guardia
- `worker/sw.ts` el service worker, construido con Serwist
- `scripts/` generación de iconos, capturas y empaquetado del worker
- `design/` el prototipo y las direcciones visuales que dieron origen a esto

## Cómo contribuir

Lo más útil es ampliar el catálogo de `lib/catalog.ts`: nombre, dirección,
glifo y color de marca. Es un archivo de datos, no hace falta tocar nada más.

## Lo que falta

- Destino de compartir en Android, para mandar una dirección desde el navegador.
- Sincronización opcional entre dispositivos.
- Reducir los iconos grandes en el servidor, para que una teja no arrastre
  cientos de kilobytes.

## Licencia

MIT.
