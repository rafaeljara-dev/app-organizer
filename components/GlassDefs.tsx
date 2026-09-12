/**
 * Edge refraction for the glass surfaces.
 *
 * feDisplacementMap shifts each pixel of the backdrop by the colour of a
 * second image: red drives the horizontal offset, green the vertical, with
 * 128 meaning "do not move". The map below is flat grey through the middle
 * and ramps hard in the last fifth on every side, so content bends only
 * where a real pane of glass would bend it.
 *
 * url() inside backdrop-filter is Chromium-only today. Safari and Firefox
 * drop this one layer and keep the blur underneath, which is why the filter
 * lives on its own element instead of in the same declaration as the blur.
 */
const MAP = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220">
<defs>
<linearGradient id="h" x1="0" y1="0" x2="1" y2="0">
<stop offset="0" stop-color="#f00"/><stop offset="0.2" stop-color="#800000"/>
<stop offset="0.8" stop-color="#800000"/><stop offset="1" stop-color="#000"/>
</linearGradient>
<linearGradient id="v" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#0f0"/><stop offset="0.2" stop-color="#008000"/>
<stop offset="0.8" stop-color="#008000"/><stop offset="1" stop-color="#000"/>
</linearGradient>
</defs>
<rect width="220" height="220" fill="url(#h)"/>
<rect width="220" height="220" fill="url(#v)" style="mix-blend-mode:screen"/>
</svg>`;

const MAP_URI = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(MAP)}`;

export default function GlassDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true"
         style={{ position: "absolute", pointerEvents: "none" }}>
      <defs>
        <filter id="lg-refract" x="0" y="0" width="100%" height="100%"
                filterUnits="objectBoundingBox" colorInterpolationFilters="sRGB">
          <feImage href={MAP_URI} result="map" x="0" y="0" width="100%" height="100%"
                   preserveAspectRatio="none" />
          <feDisplacementMap in="SourceGraphic" in2="map" scale="26"
                             xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
    </svg>
  );
}
