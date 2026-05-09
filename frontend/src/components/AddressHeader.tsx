import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ResolvedAddress, BuildingFacts } from '../types/api';
import './AddressHeader.css';

interface AddressHeaderProps {
  address: ResolvedAddress;
  building?: BuildingFacts;
  onChangeAddress?: () => void;
  variant?: 'card' | 'embedded';
}

function AddressHeader({ address, building, onChangeAddress, variant = 'card' }: AddressHeaderProps) {
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
    <div
      className={`address-header${variant === 'embedded' ? ' address-header--embedded' : ''}`}
      data-testid="address-header"
    >
      <div className="address-header__info">
        <h2 className="address-header__street">{mainLine || address.display_name}</h2>
        {subLine && <p className="address-header__postcode">{subLine}</p>}
        {buildingDetails.length > 0 && (
          <p className="address-header__facts">{buildingDetails.join(' \u00B7 ')}</p>
        )}
      </div>
      {onChangeAddress && (
        <button
          type="button"
          className="address-header__change"
          onClick={onChangeAddress}
          aria-label={t('address_header.change_address')}
        >
          <svg className="address-header__change-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <span className="address-header__change-label">{t('address_header.change_address')}</span>
        </button>
      )}
    </div>
  );
}

export default memo(AddressHeader);
