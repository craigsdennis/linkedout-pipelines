import { raw } from "hono/html";
import type { MapData } from "../utils/map-data";

/**
 * Interactive world map using Leaflet.js
 * Shows page view locations as markers with clustering
 */
export function LeafletMap({ mapData }: { mapData: MapData }) {
  // Generate unique map ID
  const mapId = `map-${Math.random().toString(36).substr(2, 9)}`;

  // Convert locations to markers (keep all individual city data)
  const markers = mapData.locations
    .filter((loc) => loc.latitude && loc.longitude)
    .map((loc) => {
      const lat = parseFloat(loc.latitude!);
      const lng = parseFloat(loc.longitude!);
      
      if (isNaN(lat) || isNaN(lng)) return null;
      
      // Build location label
      const parts = [];
      if (loc.city) parts.push(loc.city);
      if (loc.region) parts.push(loc.region);
      if (loc.country) parts.push(loc.country);
      const location = parts.join(', ') || 'Unknown';
      
      return {
        location,
        country: loc.country,
        city: loc.city || '',
        region: loc.region || '',
        lat,
        lng,
        count: loc.count,
      };
    })
    .filter((m) => m !== null) as Array<{
      location: string;
      country: string;
      city: string;
      region: string;
      lat: number;
      lng: number;
      count: number;
    }>;

  // Calculate marker sizes based on count
  const maxCount = Math.max(...markers.map((m) => m.count), 1);
  
  // Count unique countries
  const uniqueCountries = new Set(markers.map(m => m.country)).size;
  
  return (
    <div class="leaflet-map-container">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <div>
          <h3 style="margin: 0;">Global Page Views</h3>
          <p style="margin: 5px 0 0 0; color: #6b7280; font-size: 14px;">
            {mapData.totalViews.toLocaleString()} views from {markers.length} locations in {uniqueCountries} countries
          </p>
        </div>
        <div style="font-size: 12px; color: #9ca3af;">
          <span id="map-last-updated" data-timestamp={mapData.lastUpdated}>
            Updated: Loading...
          </span>
        </div>
      </div>

      <div 
        id={mapId} 
        style="height: 500px; width: 100%; border: 1px solid #d1d5db; border-radius: 8px; background: #e0f2fe;"
      ></div>

      {/* Top Countries List */}
      <div style="margin-top: 20px;">
        <h4 style="margin: 0 0 10px 0; font-size: 14px; color: #6b7280;">Top Locations</h4>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px;">
          {markers.slice(0, 10).map((marker) => (
            <div
              key={marker.country}
              style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;"
            >
              <span style="font-size: 13px; font-weight: 500;">{marker.country}</span>
              <span style="font-size: 13px; color: #6b7280;">{marker.count.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Leaflet JS and Initialization */}
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      {raw(`<script>
        (function() {
          // Format last updated time in user's local time
          const updateEl = document.getElementById('map-last-updated');
          if (updateEl) {
            const timestamp = updateEl.getAttribute('data-timestamp');
            const date = new Date(timestamp);
            updateEl.textContent = 'Updated: ' + date.toLocaleTimeString();
          }

          // Wait for Leaflet to load
          if (typeof L === 'undefined') {
            console.error('Leaflet not loaded');
            return;
          }

          const mapData = ${JSON.stringify(markers)};
          const maxCount = ${maxCount};
          
          // Initialize map centered on world
          const map = L.map('${mapId}').setView([20, 0], 2);
          
          // Add OpenStreetMap tiles
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            maxZoom: 18,
          }).addTo(map);
          
          // Add markers for each location
          mapData.forEach(function(loc) {
            // Calculate marker size based on view count
            const intensity = Math.min(loc.count / maxCount, 1);
            const radius = 5 + (intensity * 15); // 5-20px radius
            
            // Create circle marker
            const marker = L.circleMarker([loc.lat, loc.lng], {
              radius: radius,
              fillColor: '#f38020', // Cloudflare orange
              color: '#fff',
              weight: 2,
              opacity: 1,
              fillOpacity: 0.6 + (intensity * 0.4) // 0.6-1.0 opacity
            }).addTo(map);
            
            // Add popup with detailed location info
            marker.bindPopup(
              '<strong>' + loc.location + '</strong><br>' +
              loc.count.toLocaleString() + ' view' + (loc.count !== 1 ? 's' : '')
            );
          });
        })();
      </script>`)}
    </div>
  );
}
