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
          attribution='&copy; <a href="https://www.pdok.nl">PDOK</a> / Kadaster'
          url="https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/grijs/EPSG:3857/{z}/{x}/{y}.png"
        />
        {footprint && (
          <GeoJSON
            key={JSON.stringify(footprint)}
            data={footprint as GeoJSON.GeoJsonObject}
            style={{ color: '#2EC4B6', weight: 2, fillColor: '#2EC4B6', fillOpacity: 0.25 }}
          />
        )}
      </MapContainer>
    </div>
  );
}
