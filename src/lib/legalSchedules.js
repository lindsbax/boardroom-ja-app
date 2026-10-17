// Country lists, refund policy options and plain-English legal summaries shown at
// checkout and when opening a shop. These are summaries of the main laws, not legal
// advice, and should be reviewed by a lawyer in each region before launch.

export const COUNTRIES = [
  // [code, name, region]
  ['GB', 'United Kingdom', 'UK'],
  ['IE', 'Ireland', 'EU'], ['FR', 'France', 'EU'], ['DE', 'Germany', 'EU'], ['ES', 'Spain', 'EU'], ['IT', 'Italy', 'EU'],
  ['NL', 'Netherlands', 'EU'], ['BE', 'Belgium', 'EU'], ['PT', 'Portugal', 'EU'], ['AT', 'Austria', 'EU'], ['SE', 'Sweden', 'EU'],
  ['DK', 'Denmark', 'EU'], ['FI', 'Finland', 'EU'], ['PL', 'Poland', 'EU'], ['CZ', 'Czechia', 'EU'], ['GR', 'Greece', 'EU'],
  ['HU', 'Hungary', 'EU'], ['RO', 'Romania', 'EU'], ['BG', 'Bulgaria', 'EU'], ['HR', 'Croatia', 'EU'], ['SK', 'Slovakia', 'EU'],
  ['SI', 'Slovenia', 'EU'], ['LT', 'Lithuania', 'EU'], ['LV', 'Latvia', 'EU'], ['EE', 'Estonia', 'EU'], ['LU', 'Luxembourg', 'EU'],
  ['MT', 'Malta', 'EU'], ['CY', 'Cyprus', 'EU'],
  ['NO', 'Norway', 'EU'], ['IS', 'Iceland', 'EU'], ['LI', 'Liechtenstein', 'EU'], ['CH', 'Switzerland', 'OTHER'],
  ['CA', 'Canada', 'CA'],
  ['JM', 'Jamaica', 'JM'],
  ['AG', 'Antigua and Barbuda', 'CARICOM'], ['BS', 'Bahamas', 'CARICOM'], ['BB', 'Barbados', 'CARICOM'], ['BZ', 'Belize', 'CARICOM'],
  ['DM', 'Dominica', 'CARICOM'], ['GD', 'Grenada', 'CARICOM'], ['GY', 'Guyana', 'CARICOM'], ['HT', 'Haiti', 'CARICOM'],
  ['KN', 'Saint Kitts and Nevis', 'CARICOM'], ['LC', 'Saint Lucia', 'CARICOM'], ['VC', 'Saint Vincent and the Grenadines', 'CARICOM'],
  ['SR', 'Suriname', 'CARICOM'], ['TT', 'Trinidad and Tobago', 'CARICOM'],
  ['KE', 'Kenya', 'KE'],
  ['NG', 'Nigeria', 'NG'],
  ['GH', 'Ghana', 'AFRICA'], ['ZA', 'South Africa', 'AFRICA'], ['UG', 'Uganda', 'AFRICA'], ['TZ', 'Tanzania', 'AFRICA'],
  ['RW', 'Rwanda', 'AFRICA'], ['ZM', 'Zambia', 'AFRICA'], ['ZW', 'Zimbabwe', 'AFRICA'], ['SN', 'Senegal', 'AFRICA'], ['ET', 'Ethiopia', 'AFRICA'],
  ['XA', 'Other African country', 'AFRICA'],
  ['US', 'United States', 'US'],
  ['XX', 'Other country', 'OTHER'],
];

// Bank countries Stripe Connect can pay automatically (UK platform). Everything else is a manual payout.
export const CONNECT_COUNTRIES = new Set(['United Kingdom', 'United States', 'Canada', 'Switzerland', 'Norway', 'Iceland', 'Liechtenstein', 'Ireland', 'France', 'Germany', 'Spain', 'Italy', 'Netherlands', 'Belgium', 'Portugal', 'Austria', 'Sweden', 'Denmark', 'Finland', 'Poland', 'Czechia', 'Greece', 'Hungary', 'Romania', 'Bulgaria', 'Croatia', 'Slovakia', 'Slovenia', 'Lithuania', 'Latvia', 'Estonia', 'Luxembourg', 'Malta', 'Cyprus']);
export const payoutRoute = (country) => (CONNECT_COUNTRIES.has(country) ? 'connect' : 'manual');
export const MIN_PAYOUT = 100;

export const regionOf = (name) => (COUNTRIES.find((c) => c[1] === name) || [])[2] || 'OTHER';
export const needsDigitalWaiver = (buyerCountry) => ['UK', 'EU'].includes(regionOf(buyerCountry));

// Refund policy options. 'no_refund' is only for digital (once delivered) or made-to-order/perishable goods.
export const REFUND_POLICIES = {
  days_7: { label: '7-day returns', text: 'Return within 7 days of delivery for a refund. The item must be unused and in its original condition.' },
  days_14: { label: '14-day returns', text: 'Return within 14 days of delivery for a refund. The item must be unused and in its original condition.' },
  days_30: { label: '30-day returns', text: 'Return within 30 days of delivery for a refund. The item must be unused and in its original condition.' },
  exchange: { label: 'Exchange or store credit', text: 'No cash refunds. Unused items can be exchanged or swapped for store credit within 14 days of delivery.' },
  no_refund: { label: 'No refunds once delivered', text: 'No refunds or returns once delivered, because the item is digital, made to order or perishable. If an item arrives faulty or not as described, the seller will repair, replace or refund it.' },
};
export const REFUND_OPTIONS = {
  physical: ['days_7', 'days_14', 'days_30', 'exchange', 'no_refund'],
  digital: ['days_14', 'no_refund'],
};
export const refundLabel = (k) => REFUND_POLICIES[k]?.label || '';
export const refundText = (k) => REFUND_POLICIES[k]?.text || '';
export const STATUTORY_NOTE = 'Your legal rights as a consumer are not affected by a seller\'s refund policy.';

export const SCHEDULES = {
  UK: {
    title: 'United Kingdom',
    consumer: 'Consumer Rights Act 2015 and the Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013.',
    points: [
      'Goods bought online can normally be cancelled within 14 days of delivery.',
      'Digital content: you lose the 14-day right only if you give express consent for supply to start now and acknowledge that you lose it.',
      'Goods and digital content must be as described and of satisfactory quality, whatever the seller\'s refund policy says.',
    ],
    data: 'UK GDPR and Data Protection Act 2018. Regulator: Information Commissioner\'s Office (ico.org.uk).',
  },
  EU: {
    title: 'European Union',
    consumer: 'Consumer Rights Directive 2011/83/EU and the Digital Content Directive (EU) 2019/770, as applied in your country.',
    points: [
      'Online purchases of goods can normally be withdrawn from within 14 days of delivery.',
      'Digital content: the withdrawal right ends only if you expressly consent to immediate supply and acknowledge that you lose it.',
      'Digital content and goods must conform to the contract, whatever the seller\'s refund policy says.',
    ],
    data: 'GDPR. You can complain to your national data protection authority.',
  },
  CA: {
    title: 'Canada',
    consumer: 'Provincial consumer protection laws (for example Ontario\'s Consumer Protection Act, 2002 and Quebec\'s Consumer Protection Act).',
    points: [
      'Rules on online (distance) purchases, cancellation and refunds vary by province. Some provinces give cancellation rights where required information was not disclosed.',
      'The seller\'s refund policy applies alongside your provincial rights.',
    ],
    data: 'PIPEDA (and provincial privacy laws). Sellers must not send marketing emails without consent (CASL). Regulator: Office of the Privacy Commissioner of Canada.',
  },
  JM: {
    title: 'Jamaica',
    consumer: 'Consumer Protection Act, 2005 and Electronic Transactions Act, 2006.',
    points: [
      'Goods must be of satisfactory quality and match their description.',
      'On The Boardroom JA, physical items bought by buyers in Jamaica carry at least a 7-day returns window unless an exclusion applies (for example made-to-order, perishable or opened digital items).',
      'Your contract is formed electronically when you tick the boxes and pay, as recognised by the Electronic Transactions Act.',
    ],
    data: 'Data Protection Act, 2020. Regulator: Office of the Information Commissioner.',
  },
  CARICOM: {
    title: 'CARICOM',
    consumer: 'The consumer protection law of the buyer\'s own country (for example Barbados\' Consumer Protection Act 2002 or Trinidad and Tobago\'s Consumer Protection and Safety Act 2008).',
    points: [
      'Consumer laws differ across CARICOM countries. The law where the buyer lives still applies to the sale.',
      'The seller must honour their stated refund policy and your local statutory rights.',
    ],
    data: 'The data protection law where you live (for example Barbados\' Data Protection Act 2019). We apply the standards of Jamaica\'s Data Protection Act 2020 as a minimum.',
  },
  KE: {
    title: 'Kenya',
    consumer: 'Consumer Protection Act, 2012.',
    points: [
      'Goods must be of acceptable quality and as described. Consumers have rights to a refund, repair or replacement for faulty goods.',
      'Sellers must give accurate information about price and the goods before the sale.',
    ],
    data: 'Data Protection Act, 2019. Regulator: Office of the Data Protection Commissioner (ODPC). Personal data may only leave Kenya on the grounds the Act allows, and breaches must be reported to the ODPC within 72 hours.',
  },
  NG: {
    title: 'Nigeria',
    consumer: 'Federal Competition and Consumer Protection Act, 2018 (FCCPA).',
    points: [
      'Consumers are entitled to accurate information, goods that match their description and a remedy for defective goods or services.',
      'The seller\'s refund policy applies alongside these rights.',
    ],
    data: 'Nigeria Data Protection Act, 2023. Regulator: Nigeria Data Protection Commission (NDPC). Transfers of personal data abroad need an adequacy decision, safeguards or an allowed legal basis such as informed consent.',
  },
  AFRICA: {
    title: 'Africa',
    consumer: 'The consumer protection law of the buyer\'s own country (for example South Africa\'s Consumer Protection Act 2008).',
    points: [
      'Consumer rules differ by country. The law where the buyer lives still applies to the sale.',
      'The seller must honour their stated refund policy and your local statutory rights.',
    ],
    data: 'The data protection law where you live (for example South Africa\'s POPIA or Ghana\'s Data Protection Act 2012).',
  },
  US: {
    title: 'United States',
    consumer: 'Federal Trade Commission rules and state consumer protection laws.',
    points: ['Return rights are mainly set by the seller\'s refund policy, plus state law and implied warranty rights.'],
    data: 'State privacy laws such as the California Consumer Privacy Act.',
  },
  OTHER: {
    title: 'Your country',
    consumer: 'The mandatory consumer protection laws of the buyer\'s country.',
    points: ['Mandatory local consumer rights cannot be removed by a seller\'s refund policy.'],
    data: 'The data protection law of the buyer\'s country.',
  },
};

export const scheduleFor = (country) => SCHEDULES[regionOf(country)] || SCHEDULES.OTHER;
