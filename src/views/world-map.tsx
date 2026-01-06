import type { MapData } from "../utils/map-data";

/**
 * World map visualization component
 * Shows a simple SVG map with country highlighting based on page view counts
 */
export function WorldMap({ mapData }: { mapData: MapData }) {
  // Create a lookup for quick access
  const countryMap = new Map(
    mapData.locations.map((loc) => [loc.country.toUpperCase(), loc.count])
  );

  // Calculate color intensity based on view count
  const maxCount = Math.max(...mapData.locations.map((l) => l.count), 1);
  const getColor = (country: string): string => {
    const count = countryMap.get(country.toUpperCase()) || 0;
    if (count === 0) return "#cbd5e1"; // Slightly darker gray for better contrast
    
    // Orange gradient for Cloudflare branding
    const intensity = Math.min(count / maxCount, 1);
    const r = 243; // #f38020
    const g = 128 + Math.round((255 - 128) * (1 - intensity));
    const b = 32 + Math.round((255 - 32) * (1 - intensity));
    return `rgb(${r}, ${g}, ${b})`;
  };

  // ISO country codes mapping (simplified - just major countries for MVP)
  const countries: Array<{ code: string; name: string; path: string }> = [
    {
      code: "US",
      name: "United States",
      path: "M150,100 L240,100 L240,140 L150,140 Z", // Simplified rectangle
    },
    {
      code: "CA",
      name: "Canada",
      path: "M140,60 L250,60 L250,95 L140,95 Z",
    },
    {
      code: "GB",
      name: "United Kingdom",
      path: "M280,95 L290,95 L290,105 L280,105 Z",
    },
    {
      code: "FR",
      name: "France",
      path: "M285,110 L300,110 L300,125 L285,125 Z",
    },
    {
      code: "DE",
      name: "Germany",
      path: "M300,100 L315,100 L315,115 L300,115 Z",
    },
    {
      code: "BR",
      name: "Brazil",
      path: "M230,180 L270,180 L270,230 L230,230 Z",
    },
    {
      code: "IN",
      name: "India",
      path: "M390,130 L420,130 L420,170 L390,170 Z",
    },
    {
      code: "CN",
      name: "China",
      path: "M420,100 L480,100 L480,140 L420,140 Z",
    },
    {
      code: "JP",
      name: "Japan",
      path: "M490,110 L510,110 L510,140 L490,140 Z",
    },
    {
      code: "AU",
      name: "Australia",
      path: "M450,220 L510,220 L510,260 L450,260 Z",
    },
  ];

  return (
    <div class="world-map">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <div>
          <h3 style="margin: 0;">Global Page Views</h3>
          <p style="margin: 5px 0 0 0; color: #6b7280; font-size: 14px;">
            {mapData.totalViews.toLocaleString()} views from {mapData.locations.length} countries
          </p>
        </div>
        <div style="font-size: 12px; color: #9ca3af;">
          Updated: {new Date(mapData.lastUpdated).toLocaleTimeString()}
        </div>
      </div>

      <svg
        viewBox="0 0 600 300"
        style="width: 100%; height: auto; border: 1px solid #d1d5db; border-radius: 8px; background: #ffffff;"
      >
        {/* Ocean background */}
        <rect x="0" y="0" width="600" height="300" fill="#e0f2fe" />

        {/* Countries */}
        {countries.map((country) => {
          const count = countryMap.get(country.code) || 0;
          const color = getColor(country.code);
          
          return (
            <g key={country.code}>
              <path
                d={country.path}
                fill={color}
                stroke="#9ca3af"
                stroke-width="0.5"
                class="country-path"
                data-country={country.code}
                data-name={country.name}
                data-count={count}
              >
                <title>{country.name}: {count.toLocaleString()} views</title>
              </path>
            </g>
          );
        })}

        {/* Legend */}
        <g transform="translate(10, 260)">
          <text x="0" y="0" font-size="10" fill="#6b7280">Page Views:</text>
          <rect x="0" y="5" width="30" height="10" fill="#e5e7eb" />
          <text x="35" y="14" font-size="9" fill="#6b7280">None</text>
          
          <rect x="70" y="5" width="30" height="10" fill="#f3a060" />
          <text x="105" y="14" font-size="9" fill="#6b7280">Low</text>
          
          <rect x="140" y="5" width="30" height="10" fill="#f38020" />
          <text x="175" y="14" font-size="9" fill="#6b7280">High</text>
        </g>
      </svg>

      {/* Top Countries List */}
      <div style="margin-top: 20px;">
        <h4 style="margin: 0 0 10px 0; font-size: 14px; color: #6b7280;">Top Countries</h4>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px;">
          {mapData.locations.slice(0, 10).map((loc) => (
            <div
              key={loc.country}
              style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;"
            >
              <span style="font-size: 13px; font-weight: 500;">{loc.country}</span>
              <span style="font-size: 13px; color: #6b7280;">{loc.count.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        .country-path {
          cursor: pointer;
          transition: opacity 0.2s;
        }
        .country-path:hover {
          opacity: 0.8;
          stroke: #f38020;
          stroke-width: 1.5;
        }
      `}</style>
    </div>
  );
}
