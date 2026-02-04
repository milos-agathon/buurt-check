import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet';
import { useTranslation } from 'react-i18next';
import 'leaflet/dist/leaflet.css';
import './BuildingFootprintMap.css';

interface Props {
  lat: number;
  lng: number;
  footprint?: GeoJSON.Geometry;
}

export default function BuildingFootprintMap({ lat, lng, footprint }: Props) {
  const { t } = useTranslation();

  return (
    <div className="footprint-map">
      <h2 className="footprint-map__title">{t('map.title')}</h2>
      <MapContainer
        key={`${lat}-${lng}`}
        center={[lat, lng]}
        zoom={18}
        className="footprint-map__container"
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {footprint && (
          <GeoJSON
            key={JSON.stringify(footprint)}
            data={footprint as GeoJSON.GeoJsonObject}
            style={{ color: '#e74c3c', weight: 2, fillColor: '#e74c3c', fillOpacity: 0.25 }}
          />
        )}
      </MapContainer>
    </div>
  );
}
