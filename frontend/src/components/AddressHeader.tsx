import { useTranslation } from 'react-i18next';
import type { ResolvedAddress, BuildingFacts } from '../types/api';
import './AddressHeader.css';

interface AddressHeaderProps {
  address: ResolvedAddress;
  building?: BuildingFacts;
  isBookmarked?: boolean;
  onBookmarkToggle?: () => void;
}

export default function AddressHeader({ address, building, isBookmarked = false, onBookmarkToggle }: AddressHeaderProps) {
  const { t, i18n } = useTranslation();

  const street = address.street || '';
  const houseNumber = [address.house_number, address.house_letter, address.addition]
    .filter(Boolean)
    .join('');
  const mainLine = [street, houseNumber].filter(Boolean).join(' ');
  const subLine = [address.postcode, address.city].filter(Boolean).join(' ');

  const buildingDetails: string[] = [];
  if (building?.construction_year) {
    buildingDetails.push(t('building.built', { year: building.construction_year }));
  }
  if (building?.num_units && building.num_units > 1) {
    buildingDetails.push(t('building.units', { count: building.num_units }));
  }
  const use = i18n.language === 'nl' ? building?.intended_use : building?.intended_use_en;
  if (use?.length) {
    buildingDetails.push(use[0]);
  }

  return (
    <div className="address-header">
      <div className="address-header__info">
        <h2 className="address-header__street">{mainLine || address.display_name}</h2>
        {subLine && <p className="address-header__postcode">{subLine}</p>}
        {buildingDetails.length > 0 && (
          <p className="address-header__facts">{buildingDetails.join(' \u00B7 ')}</p>
        )}
      </div>
      {onBookmarkToggle && (
        <button
          className={`address-header__bookmark${isBookmarked ? ' address-header__bookmark--active' : ''}`}
          onClick={onBookmarkToggle}
          aria-label={isBookmarked ? 'Remove from shortlist' : 'Add to shortlist'}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill={isBookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
            <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
        </button>
      )}
    </div>
  );
}
