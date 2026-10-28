// Sub-national areas by country. Countries not listed here get a free-text "State, region or city" box.
export const REGIONS = {
  'Jamaica': { label: 'Parish', items: ['Kingston', 'St. Andrew', 'St. Thomas', 'Portland', 'St. Mary', 'St. Ann', 'Trelawny', 'St. James', 'Hanover', 'Westmoreland', 'St. Elizabeth', 'Manchester', 'Clarendon', 'St. Catherine'] },
  'United Kingdom': { label: 'Nation or region', items: ['England: London', 'England: South East', 'England: South West', 'England: East of England', 'England: East Midlands', 'England: West Midlands', 'England: North West', 'England: North East', 'England: Yorkshire and the Humber', 'Scotland', 'Wales', 'Northern Ireland'] },
  'United States': { label: 'State', items: ['Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'District of Columbia', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming', 'Puerto Rico'] },
  'Canada': { label: 'Province or territory', items: ['Alberta', 'British Columbia', 'Manitoba', 'New Brunswick', 'Newfoundland and Labrador', 'Northwest Territories', 'Nova Scotia', 'Nunavut', 'Ontario', 'Prince Edward Island', 'Quebec', 'Saskatchewan', 'Yukon'] },
  'Ireland': { label: 'County', items: ['Carlow', 'Cavan', 'Clare', 'Cork', 'Donegal', 'Dublin', 'Galway', 'Kerry', 'Kildare', 'Kilkenny', 'Laois', 'Leitrim', 'Limerick', 'Longford', 'Louth', 'Mayo', 'Meath', 'Monaghan', 'Offaly', 'Roscommon', 'Sligo', 'Tipperary', 'Waterford', 'Westmeath', 'Wexford', 'Wicklow'] },
  'Barbados': { label: 'Parish', items: ['Christ Church', 'St. Andrew', 'St. George', 'St. James', 'St. John', 'St. Joseph', 'St. Lucy', 'St. Michael', 'St. Peter', 'St. Philip', 'St. Thomas'] },
  'Trinidad and Tobago': { label: 'Region', items: ['Port of Spain', 'San Fernando', 'Arima', 'Chaguanas', 'Point Fortin', 'Diego Martin', 'Tunapuna-Piarco', 'San Juan-Laventille', 'Sangre Grande', 'Couva-Tabaquite-Talparo', 'Penal-Debe', 'Princes Town', 'Siparia', 'Mayaro-Rio Claro', 'Tobago'] },
  'Bahamas': { label: 'Island', items: ['New Providence', 'Grand Bahama', 'Abaco', 'Eleuthera', 'Exuma', 'Andros', 'Other islands'] },
  'Guyana': { label: 'Region', items: ['Barima-Waini', 'Pomeroon-Supenaam', 'Essequibo Islands-West Demerara', 'Demerara-Mahaica', 'Mahaica-Berbice', 'East Berbice-Corentyne', 'Cuyuni-Mazaruni', 'Potaro-Siparuni', 'Upper Takutu-Upper Essequibo', 'Upper Demerara-Berbice'] },
  'Australia': { label: 'State or territory', items: ['Australian Capital Territory', 'New South Wales', 'Northern Territory', 'Queensland', 'South Australia', 'Tasmania', 'Victoria', 'Western Australia'] },
  'Nigeria': { label: 'State', items: ['Abuja (FCT)', 'Lagos', 'Rivers', 'Kano', 'Oyo', 'Delta', 'Anambra', 'Enugu', 'Ogun', 'Kaduna', 'Other'] },
};

export const regionLabel = (country) => (REGIONS[country] ? REGIONS[country].label : 'State, region or city');

// Selling currencies: pounds for the UK, euros for euro-area countries, US dollars everywhere else.
export const SELL_CURRENCIES = ['USD', 'GBP', 'EUR'];
const EURO_AREA = new Set(['Ireland', 'France', 'Germany', 'Spain', 'Italy', 'Netherlands', 'Belgium', 'Portugal', 'Austria', 'Finland', 'Greece', 'Luxembourg', 'Malta', 'Cyprus', 'Slovakia', 'Slovenia', 'Estonia', 'Latvia', 'Lithuania', 'Croatia']);
export const currencyForCountry = (country) => (country === 'United Kingdom' ? 'GBP' : EURO_AREA.has(country) ? 'EUR' : 'USD');
export const CURRENCY_LABELS = { USD: 'US dollars (USD)', GBP: 'Pounds (GBP)', EUR: 'Euros (EUR)' };

// Messages cannot carry contact details (keeps sales on the platform). The database enforces the same rule.
export function contactDetailsIn(text) {
  let t = String(text || '').toLowerCase();
  ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'].forEach((w, i) => { t = t.replace(new RegExp(`\\b${w}\\b`, 'g'), String(i)); });
  return /([0-9][ .()+-]{0,2}){7,}/.test(t)
    || /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/.test(t)
    || /(whats ?app|telegram|wa\.me|t\.me\/|signal app)/.test(t)
    || /\b(gmail|hotmail|yahoo|outlook|icloud)\b/.test(t);
}

export const INQUIRY_INDUSTRIES = [
  'Accounting & Finance', 'Legal', 'Marketing & PR', 'Design & Creative', 'Technology', 'Events & Hospitality',
  'Food & Beverage', 'Beauty & Wellness', 'Fashion & Retail', 'Education & Training', 'Health & Medical', 'Real Estate',
  'Construction', 'Agriculture', 'Logistics & Shipping', 'Tourism & Travel', 'Media & Content', 'Consulting',
  'Manufacturing', 'Photography', 'Print & Packaging', 'Non-profit', 'Energy', 'Security',
];
