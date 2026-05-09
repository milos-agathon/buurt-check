import type {
  PrebidBriefingResponse,
  PrebidCoverageRow,
  PrebidPackResponse,
  PrebidVerificationAction,
} from '../../types/api';

export const coverageRows: PrebidCoverageRow[] = [
  {
    id: 'noise',
    authority: 'RIVM',
    label: 'RIVM noise contours',
    status: 'checked',
    basis: 'Address overlay',
    method: 'Open-data overlay',
    version: '2025',
    duration_ms: 420,
    checked_at: '2026-05-06',
    source_date: '2025-03',
    limitation: 'Modelled outdoor contours. Verify indoor noise during the viewing.',
    limitation_nl: 'Gemodelleerde buitensignalen. Controleer geluid binnen tijdens de bezichtiging.',
  },
  {
    id: 'climate',
    authority: 'Klimaateffectatlas',
    label: 'Heat and water stress',
    status: 'review',
    basis: 'Street context',
    method: 'Open-data overlay',
    checked_at: '2026-05-06',
    limitation: 'Area-level signal. Check drainage and maintenance records.',
  },
];

export const action: PrebidVerificationAction = {
  id: 'noise-viewing-check',
  category: 'noise',
  priority: 1,
  severity: 'moderate',
  finding: 'Road noise should be checked in the bedroom.',
  finding_nl: 'Controleer verkeersgeluid in de slaapkamer.',
  why_it_matters: 'Noise can affect sleep and facade expectations.',
  why_it_matters_nl: 'Geluid kan slaap en gevelverwachtingen beinvloeden.',
  ask_this: {
    en: 'Can you hear traffic with bedroom windows closed?',
    nl: 'Hoor je verkeer met gesloten slaapkamerramen?',
  },
  request_this: 'Ask for glazing and ventilation documentation.',
  request_this_nl: 'Vraag documentatie over glas en ventilatie.',
  who_to_ask: ['Selling agent', 'Inspector'],
  confidence: 'medium',
  limitation: coverageRows[0].limitation,
  limitation_nl: coverageRows[0].limitation_nl,
  source_refs: [
    {
      name: 'RIVM noise contours',
      source_date: '2025-03',
      checked_at: '2026-05-06',
      method: 'Open-data overlay',
      coverage_status: 'checked',
      limitation: coverageRows[0].limitation,
      limitation_nl: coverageRows[0].limitation_nl,
    },
  ],
};

export const briefing: PrebidBriefingResponse = {
  briefing_id: 'brief-1',
  address_id: '0363010000696734',
  report_id: 'report-1',
  address_label: 'Keizersgracht 100, 1015AA Amsterdam',
  checked_at: '2026-05-06',
  result_state: 'data_incomplete',
  disclaimer: 'Source-bound briefing for viewing preparation. Confirm decisions with your inspector, adviser, notary, or buyer agent.',
  disclaimer_nl: 'Brongebonden briefing voor bezichtigingsvoorbereiding. Bevestig beslissingen met je bouwkundige, adviseur, notaris of aankoopmakelaar.',
  coverage: coverageRows,
  top_actions: [action],
  source_quality: {
    unknown_source_date_count: 0,
    generic_confidence_count: 0,
    generic_limitation_count: 0,
    missing_source_ref_count: 0,
    missing_recipient_count: 0,
    caps: [],
  },
};

export const pack: PrebidPackResponse = {
  pack_id: 'pack-1',
  address_id: '0363010000696734',
  report_id: 'report-1',
  address_label: briefing.address_label,
  checked_at: briefing.checked_at,
  status: 'ready',
  disclaimer: briefing.disclaimer,
  disclaimer_nl: briefing.disclaimer_nl,
  actions: [action],
  question_groups: [
    {
      recipient: 'Selling agent',
      questions: [action.ask_this],
      requests: [action.request_this],
    },
  ],
  coverage: coverageRows,
  share_url: 'https://app.buurt-check.nl/#/shared-pack/token-1',
};
