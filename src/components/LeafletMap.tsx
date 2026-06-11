import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

export type LeafletMarker = {
  id: string;
  lat: number;
  lng: number;
  color: string;
  label?: string;
  count?: number;
};

type Props = {
  centerLat: number;
  centerLng: number;
  zoom: number;
  markers: LeafletMarker[];
  userLat?: number;
  userLng?: number;
  onMarkerPress?: (markerId: string) => void;
  maptilerKey: string;
};

export type LeafletMapRef = {
  setCenter: (lat: number, lng: number, zoom?: number) => void;
};

const LeafletMap = forwardRef<LeafletMapRef, Props>(
  ({ centerLat, centerLng, zoom, markers, userLat, userLng, onMarkerPress, maptilerKey }, ref) => {
    const webviewRef = useRef<WebView>(null);

    useImperativeHandle(ref, () => ({
      setCenter: (lat, lng, z) => {
        // MapLibre usa [lng, lat], al revés que Leaflet
        webviewRef.current?.injectJavaScript(`
          map.flyTo({ center: [${lng}, ${lat}], zoom: ${z ?? zoom}, essential: true });
          true;
        `);
      },
    }));

    const html = useMemo(
      () => buildHtml(centerLat, centerLng, zoom, markers, userLat, userLng, maptilerKey),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [markers, userLat, userLng, maptilerKey],
    );

    const handleMessage = (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (data.type === 'marker_click' && onMarkerPress) {
          onMarkerPress(data.id);
        }
      } catch {
        // ignore
      }
    };

    return (
      <View style={styles.container}>
        <WebView
          ref={webviewRef}
          source={{ html }}
          style={styles.webview}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          onMessage={handleMessage}
          scrollEnabled={false}
          androidLayerType="hardware"
          mixedContentMode="always"
          applicationNameForUserAgent="MetalRadar/1.0"
        />
      </View>
    );
  },
);

LeafletMap.displayName = 'LeafletMap';

export default LeafletMap;

function buildHtml(
  centerLat: number,
  centerLng: number,
  zoom: number,
  markers: LeafletMarker[],
  userLat?: number,
  userLng?: number,
  maptilerKey?: string,
): string {
  const markersJson = JSON.stringify(markers);
  const userJson = JSON.stringify(
    userLat != null && userLng != null ? { lat: userLat, lng: userLng } : null,
  );

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" />
  <style>
    html, body, #map {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background: #0a0a0c;
    }
    .marker-pin {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      border: 3px solid #0a0a0c;
      box-shadow: 0 2px 6px rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-weight: 700;
      font-size: 11px;
      cursor: pointer;
    }
    .user-pin-outer {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: rgba(63, 137, 255, 0.25);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .user-pin-inner {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #3f89ff;
      border: 3px solid #fff;
      box-shadow: 0 0 6px rgba(63, 137, 255, 0.8);
    }
    .maplibregl-ctrl-attrib {
      font-size: 9px !important;
      background: rgba(10,10,12,0.7) !important;
      color: #82858d !important;
    }
    .maplibregl-ctrl-attrib a {
      color: #c7cad0 !important;
    }
    .maplibregl-ctrl-attrib-button {
      background-color: rgba(10,10,12,0.7) !important;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
  <script>
    const map = new maplibregl.Map({
      container: 'map',
      style: 'https://api.maptiler.com/maps/dataviz-dark/style.json?key=${maptilerKey}',
      center: [${centerLng}, ${centerLat}],
      zoom: ${zoom},
      attributionControl: { compact: true },
    });

    // Forzar etiquetas en español globalmente
    function localizeLabels() {
      const layers = map.getStyle().layers;
      if (!layers) return;
      for (const layer of layers) {
        if (layer.type === 'symbol' && layer.layout && layer.layout['text-field']) {
          try {
            map.setLayoutProperty(layer.id, 'text-field', [
              'coalesce',
              ['get', 'name:es'],
              ['get', 'name:latin'],
              ['get', 'name']
            ]);
          } catch (e) {
            // algunos layers pueden no aceptar el cambio, ignorar
          }
        }
      }
    }

    map.on('load', () => {
      localizeLabels();

      // Marker del usuario
      const user = ${userJson};
      if (user) {
        const userEl = document.createElement('div');
        userEl.innerHTML = '<div class="user-pin-outer"><div class="user-pin-inner"></div></div>';
        new maplibregl.Marker({ element: userEl, anchor: 'center' })
          .setLngLat([user.lng, user.lat])
          .addTo(map);
      }

      // Markers de conciertos
      const markers = ${markersJson};
      markers.forEach((m) => {
        const isLight = m.color === '#c7cad0';
        const textColor = isLight ? '#0a0a0c' : '#fff';
        const el = document.createElement('div');
        el.className = 'marker-pin';
        el.style.background = m.color;
        el.style.color = textColor;
        if (m.count && m.count > 1) {
          el.textContent = String(m.count);
        }
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'marker_click', id: m.id }));
        });
        new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([m.lng, m.lat])
          .addTo(map);
      });
    });

    // Si el estilo se recarga (por cambio de viewport, etc.), re-aplicar idioma
    map.on('styledata', () => {
      localizeLabels();
    });
  </script>
</body>
</html>
  `;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0c',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
