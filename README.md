# Estante

Un organizador de webapps que se instala como PWA y las agrupa en una pantalla
de inicio propia: páginas con nombre, carpetas, búsqueda al alcance del pulgar
y una cuadrícula que puedes ajustar.

**Para qué sirve.** Muchas apps que instalas en el teléfono las abres una vez al
mes. Ocupan espacio visual, distraen y consumen memoria, y casi todas tienen una
versión web perfectamente usable. Los marcadores del navegador no sirven para
esto: son una lista plana, sin carpetas, sin orden propio y sin iconos decentes.
Estante es esa capa que falta.

## Cómo funciona

Instalas **una** PWA. Dentro pones las direcciones de los servicios que usas.
Cada entrada recibe icono, color y sitio en una página. Al tocar una, se abre en
el navegador.

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
npm run build          # exportación estática en out/ más el service worker
```

Para reproducir la ruta de GitHub Pages en local, construye con
`GITHUB_PAGES=true npm run build`: eso activa el `basePath` `/app-organizer`.

- `app/` rutas, estilos y manifiesto
- `components/` la interfaz
- `lib/` tipos, almacén, catálogo e iconos
- `worker/sw.ts` el service worker, construido con Serwist
- `scripts/` generación de iconos, capturas y empaquetado del worker
- `design/` el prototipo y las direcciones visuales que dieron origen a esto

## Cómo contribuir

Lo más útil es ampliar el catálogo de `lib/catalog.ts`: nombre, dirección,
glifo y color de marca. Es un archivo de datos, no hace falta tocar nada más.

## Lo que falta

- Leer el manifiesto del sitio para sacar el icono y el color reales. Necesita
  un servidor que evite el CORS, y esta versión es estática.
- Destino de compartir en Android, para mandar una dirección desde el navegador.
- Sincronización opcional entre dispositivos.

## Licencia

MIT.
