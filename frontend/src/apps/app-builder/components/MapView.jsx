import { useEffect, useRef, useMemo } from "react";

export function MapView({ records = [], fields = [] }) {
  const mapInstanceRef = useRef(null);
  const containerRef = useRef(null);
  const markersRef = useRef([]);

  const geoFields = fields.filter(f => f.type === "geolocation");
  const labelField = fields.find(f => f.type === "text" || f.type === "short_text")?.name;

  const points = useMemo(() => {
    if (!geoFields.length) return [];
    return records.flatMap(r => {
      return geoFields.flatMap(f => {
        const val = r[f.name];
        if (!val) return [];
        try {
          const parsed = typeof val === "string" ? JSON.parse(val) : val;
          if (parsed?.lat != null && parsed?.lng != null) {
            return [{ lat: parsed.lat, lng: parsed.lng, label: r[labelField] || r.id, id: r.id }];
          }
        } catch (_) {}
        return [];
      });
    });
  }, [records, geoFields, labelField]);

  function initMap() {
    if (!containerRef.current || mapInstanceRef.current) return;
    const L = window.L;
    const center = points.length > 0 ? [points[0].lat, points[0].lng] : [20, 0];
    mapInstanceRef.current = L.map(containerRef.current).setView(center, points.length > 0 ? 5 : 2);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
    }).addTo(mapInstanceRef.current);
    addMarkers(L);
  }

  function addMarkers(L) {
    // Clear existing markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    points.forEach(p => {
      const marker = L.marker([p.lat, p.lng]).addTo(mapInstanceRef.current).bindPopup(p.label);
      markersRef.current.push(marker);
    });

    if (points.length === 1) {
      mapInstanceRef.current.setView([points[0].lat, points[0].lng], 13);
    } else if (points.length > 1) {
      const group = L.featureGroup(markersRef.current);
      mapInstanceRef.current.fitBounds(group.getBounds().pad(0.1));
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return;

    function setup() {
      initMap();
    }

    if (!window.L) {
      // Load Leaflet CSS
      if (!document.querySelector('link[href*="leaflet"]')) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }
      // Load Leaflet JS
      if (!document.querySelector('script[src*="leaflet"]')) {
        const script = document.createElement("script");
        script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
        script.onload = setup;
        document.head.appendChild(script);
      } else {
        // Script tag exists but may still be loading
        const existing = document.querySelector('script[src*="leaflet"]');
        existing.addEventListener("load", setup, { once: true });
      }
    } else {
      setup();
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markersRef.current = [];
      }
    };
  }, []);

  // Update markers when points change (after map is initialized)
  useEffect(() => {
    if (!mapInstanceRef.current || !window.L) return;
    addMarkers(window.L);
  }, [points]);

  if (geoFields.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground border rounded-lg">
        <p>
          Map view requires at least one <strong>geolocation</strong> field in your model.
        </p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden relative">
      <div ref={containerRef} style={{ height: 480, width: "100%" }} />
      {points.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-muted/20">
          <p className="text-muted-foreground text-sm bg-background/80 px-3 py-1.5 rounded">
            No records with location data
          </p>
        </div>
      )}
    </div>
  );
}
