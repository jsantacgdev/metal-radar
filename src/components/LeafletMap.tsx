import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

export type LeafletMarker = {
  id: string;
  lat: number;
  lng: number;
  color: string; // hex
  label?: string;
  count?: number;
};

type Props = {
  centerLat: number;
  centerLng: number;
  zoom: number;
  markers: LeafletMarker[];
  onMarkerPress?: (markerId: string) => void;
};

export type LeafletMapRef = {
  setCenter: (lat: number, lng: number, zoom?: number) => void;
};

const LeafletMap = forwardRef<LeafletMapRef, Props>(
  ({ centerLat, centerLng, zoom, markers, onMarkerPress }, ref) => {
    const webviewRef = useRef<WebView>(null);

    useImperativeHandle(ref, () => ({
      setCenter: (lat, lng, z) => {
        webviewRef.current?.injectJavaScript(`
          map.setView([${lat}, ${lng}], ${z ?? zoom});
          true;
        `);
      },
    }));

    const html = useMemo(
      () => buildHtml(centerLat, centerLng, zoom, markers),
      // Re-renderizamos el HTML solo cuando cambian los markers (no por cada re-render del padre).
      // El centro/zoom inicial los fija la primera carga; setCenter lo cambia después.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [markers],
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
): string {
  const markersJson = JSON.stringify(markers);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
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
    }
    .leaflet-control-attribution {
      font-size: 9px;
      background: rgba(10,10,12,0.7) !important;
      color: #82858d !important;
    }
    .leaflet-control-attribution a {
      color: #c7cad0 !important;
    }
    .leaflet-control-zoom {
      display: none;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const map = L.map('map', {
      center: [${centerLat}, ${centerLng}],
      zoom: ${zoom},
      zoomControl: false,
      attributionControl: true,
    });

    // Tile layer estilo oscuro de CARTO (gratis, sin API key)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    const markers = ${markersJson};

    markers.forEach((m) => {
      const html = '<div class="marker-pin" style="background:' + m.color + '">' +
        (m.count && m.count > 1 ? m.count : '') +
        '</div>';
      const icon = L.divIcon({
        html,
        className: '',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      const marker = L.marker([m.lat, m.lng], { icon }).addTo(map);
      marker.on('click', () => {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'marker_click', id: m.id }));
      });
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
