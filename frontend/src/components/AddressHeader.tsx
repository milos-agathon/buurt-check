import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ResolvedAddress, BuildingFacts } from '../types/api';
import './AddressHeader.css';

interface AddressHeaderProps {
  address: ResolvedAddress;
  building?: BuildingFacts;
}

function AddressHeader({ address, building }: AddressHeaderProps) {
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
    <div className="address-header" data-testid="address-header">
      <div className="address-header__info">
        <h2 className="address-header__street">{mainLine || address.display_name}</h2>
        {subLine && <p className="address-header__postcode">{subLine}</p>}
        {buildingDetails.length > 0 && (
          <p className="address-header__facts">{buildingDetails.join(' \u00B7 ')}</p>
        )}
      </div>
    </div>
  );
}

export default memo(AddressHeader);
