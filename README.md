# Estante

Un lugar sencillo para los enlaces que usas a menudo. Guarda tus sitios web
sin llenar la lista de aplicaciones del teléfono y encuéntralos por colección
o con la búsqueda.

## Uso

- Añade una dirección, un nombre opcional y una colección.
- Toca un acceso para abrirlo fuera de Estante.
- Mantén pulsado un acceso o una carpeta para editarlo, moverlo o quitarlo.
  También puedes usar el botón de opciones, el clic derecho o `Shift + F10`.
- En «Organizar» puedes arrastrar para cambiar el orden. Las opciones también
  permiten editar la ubicación sin depender de un gesto.
- Los ajustes ofrecen vista de iconos o lista, tema y copia de seguridad.

Estante usa enlaces externos con `target="_blank"` y `rel="noopener noreferrer"`.
No contiene un navegador incrustado ni carga los sitios en un iframe. El
navegador y el sistema operativo deciden qué aplicación recibe el enlace.
Una PWA no puede forzar universalmente Chrome ni impedir las vistas de navegador
del sistema en todos los dispositivos.

## Iconos del sitio

`/api/icon` consulta la dirección original y descarga un icono publicado por el
sitio: manifiesto, `apple-touch-icon`, `rel="icon"` o `/favicon.ico`. Los archivos
ICO se aceptan y se muestran tal como llegan. No hay logos dibujados, sustituciones
por marca ni banners `og:image` usados como iconos.

El icono se conserva como data URL en IndexedDB para funcionar sin conexión.
Si un sitio no publica un icono accesible, el enlace se conserva y se muestra
una inicial neutra como estado vacío. Las versiones antiguas con iconos locales
se migran para volver a buscar los originales.

El resolvedor rechaza destinos internos y esquemas no permitidos. Los iconos
de la propia PWA en `public/icons/` identifican Estante; son independientes de
las miniaturas de los sitios guardados.

## Datos

Los enlaces y las preferencias se guardan en el dispositivo, sin cuentas ni
sincronización. La búsqueda de iconos pasa por el servidor de Estante, que consulta
la dirección indicada. Desde los ajustes puedes exportar e importar una copia.
Las imágenes se vuelven a descargar al importar. Guarda una copia antes de borrar
el almacenamiento del navegador.

## Desarrollo

```bash
npm install
npm run dev          # Solo cuando quieras iniciar el servidor local
npm run typecheck
npm run test:icons   # Resolvedor, formatos, fallbacks y guardia de red
npm run build        # Incluye el service worker de Serwist
```

La aplicación usa Next.js, React e IndexedDB. El build utiliza webpack por la
integración actual de Serwist. Las verificaciones de interacción se realizan con
`agent-browser` contra un servidor que ya esté en marcha.

## Licencia

MIT.
