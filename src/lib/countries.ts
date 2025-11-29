/**
 * Geographic data for country and state/province selection
 * Focused on Australia + common countries for CRM contacts
 */

export interface State {
  code: string
  name: string
}

export interface Country {
  code: string
  name: string
  states: State[]
}

/**
 * Countries with their states/provinces/territories
 * Australia first (primary market), then common countries alphabetically
 */
export const COUNTRIES: Country[] = [
  {
    code: 'AU',
    name: 'Australia',
    states: [
      { code: 'NSW', name: 'New South Wales' },
      { code: 'VIC', name: 'Victoria' },
      { code: 'QLD', name: 'Queensland' },
      { code: 'SA', name: 'South Australia' },
      { code: 'WA', name: 'Western Australia' },
      { code: 'TAS', name: 'Tasmania' },
      { code: 'NT', name: 'Northern Territory' },
      { code: 'ACT', name: 'Australian Capital Territory' },
    ],
  },
  {
    code: 'CA',
    name: 'Canada',
    states: [
      { code: 'AB', name: 'Alberta' },
      { code: 'BC', name: 'British Columbia' },
      { code: 'MB', name: 'Manitoba' },
      { code: 'NB', name: 'New Brunswick' },
      { code: 'NL', name: 'Newfoundland and Labrador' },
      { code: 'NS', name: 'Nova Scotia' },
      { code: 'ON', name: 'Ontario' },
      { code: 'PE', name: 'Prince Edward Island' },
      { code: 'QC', name: 'Quebec' },
      { code: 'SK', name: 'Saskatchewan' },
      { code: 'NT', name: 'Northwest Territories' },
      { code: 'NU', name: 'Nunavut' },
      { code: 'YT', name: 'Yukon' },
    ],
  },
  {
    code: 'CN',
    name: 'China',
    states: [
      { code: 'BJ', name: 'Beijing' },
      { code: 'SH', name: 'Shanghai' },
      { code: 'GD', name: 'Guangdong' },
      { code: 'ZJ', name: 'Zhejiang' },
      { code: 'JS', name: 'Jiangsu' },
      { code: 'SD', name: 'Shandong' },
    ],
  },
  {
    code: 'FR',
    name: 'France',
    states: [
      { code: 'IDF', name: 'Île-de-France' },
      { code: 'ARA', name: 'Auvergne-Rhône-Alpes' },
      { code: 'PACA', name: "Provence-Alpes-Côte d'Azur" },
      { code: 'OCC', name: 'Occitanie' },
      { code: 'NAQ', name: 'Nouvelle-Aquitaine' },
    ],
  },
  {
    code: 'DE',
    name: 'Germany',
    states: [
      { code: 'BW', name: 'Baden-Württemberg' },
      { code: 'BY', name: 'Bavaria' },
      { code: 'BE', name: 'Berlin' },
      { code: 'HH', name: 'Hamburg' },
      { code: 'NW', name: 'North Rhine-Westphalia' },
    ],
  },
  {
    code: 'IN',
    name: 'India',
    states: [
      { code: 'MH', name: 'Maharashtra' },
      { code: 'DL', name: 'Delhi' },
      { code: 'KA', name: 'Karnataka' },
      { code: 'TN', name: 'Tamil Nadu' },
      { code: 'WB', name: 'West Bengal' },
      { code: 'GJ', name: 'Gujarat' },
    ],
  },
  {
    code: 'ID',
    name: 'Indonesia',
    states: [
      { code: 'JK', name: 'Jakarta' },
      { code: 'JB', name: 'West Java' },
      { code: 'JT', name: 'Central Java' },
      { code: 'JI', name: 'East Java' },
      { code: 'BA', name: 'Bali' },
    ],
  },
  {
    code: 'JP',
    name: 'Japan',
    states: [
      { code: 'TK', name: 'Tokyo' },
      { code: 'OS', name: 'Osaka' },
      { code: 'KY', name: 'Kyoto' },
      { code: 'AI', name: 'Aichi' },
      { code: 'KN', name: 'Kanagawa' },
    ],
  },
  {
    code: 'NZ',
    name: 'New Zealand',
    states: [
      { code: 'AUK', name: 'Auckland' },
      { code: 'WGN', name: 'Wellington' },
      { code: 'CAN', name: 'Canterbury' },
      { code: 'BOP', name: 'Bay of Plenty' },
      { code: 'WKO', name: 'Waikato' },
      { code: 'OTA', name: 'Otago' },
    ],
  },
  {
    code: 'SG',
    name: 'Singapore',
    states: [], // City-state, no subdivisions needed
  },
  {
    code: 'GB',
    name: 'United Kingdom',
    states: [
      { code: 'ENG', name: 'England' },
      { code: 'SCT', name: 'Scotland' },
      { code: 'WLS', name: 'Wales' },
      { code: 'NIR', name: 'Northern Ireland' },
    ],
  },
  {
    code: 'US',
    name: 'United States',
    states: [
      { code: 'AL', name: 'Alabama' },
      { code: 'AK', name: 'Alaska' },
      { code: 'AZ', name: 'Arizona' },
      { code: 'AR', name: 'Arkansas' },
      { code: 'CA', name: 'California' },
      { code: 'CO', name: 'Colorado' },
      { code: 'CT', name: 'Connecticut' },
      { code: 'DE', name: 'Delaware' },
      { code: 'FL', name: 'Florida' },
      { code: 'GA', name: 'Georgia' },
      { code: 'HI', name: 'Hawaii' },
      { code: 'ID', name: 'Idaho' },
      { code: 'IL', name: 'Illinois' },
      { code: 'IN', name: 'Indiana' },
      { code: 'IA', name: 'Iowa' },
      { code: 'KS', name: 'Kansas' },
      { code: 'KY', name: 'Kentucky' },
      { code: 'LA', name: 'Louisiana' },
      { code: 'ME', name: 'Maine' },
      { code: 'MD', name: 'Maryland' },
      { code: 'MA', name: 'Massachusetts' },
      { code: 'MI', name: 'Michigan' },
      { code: 'MN', name: 'Minnesota' },
      { code: 'MS', name: 'Mississippi' },
      { code: 'MO', name: 'Missouri' },
      { code: 'MT', name: 'Montana' },
      { code: 'NE', name: 'Nebraska' },
      { code: 'NV', name: 'Nevada' },
      { code: 'NH', name: 'New Hampshire' },
      { code: 'NJ', name: 'New Jersey' },
      { code: 'NM', name: 'New Mexico' },
      { code: 'NY', name: 'New York' },
      { code: 'NC', name: 'North Carolina' },
      { code: 'ND', name: 'North Dakota' },
      { code: 'OH', name: 'Ohio' },
      { code: 'OK', name: 'Oklahoma' },
      { code: 'OR', name: 'Oregon' },
      { code: 'PA', name: 'Pennsylvania' },
      { code: 'RI', name: 'Rhode Island' },
      { code: 'SC', name: 'South Carolina' },
      { code: 'SD', name: 'South Dakota' },
      { code: 'TN', name: 'Tennessee' },
      { code: 'TX', name: 'Texas' },
      { code: 'UT', name: 'Utah' },
      { code: 'VT', name: 'Vermont' },
      { code: 'VA', name: 'Virginia' },
      { code: 'WA', name: 'Washington' },
      { code: 'WV', name: 'West Virginia' },
      { code: 'WI', name: 'Wisconsin' },
      { code: 'WY', name: 'Wyoming' },
      { code: 'DC', name: 'District of Columbia' },
    ],
  },
]

/**
 * Get states/provinces for a specific country by country code
 */
export function getStatesForCountry(countryCode: string): State[] {
  const country = COUNTRIES.find((c) => c.code === countryCode)
  return country?.states || []
}

/**
 * Get country name by country code
 */
export function getCountryName(countryCode: string): string | undefined {
  const country = COUNTRIES.find((c) => c.code === countryCode)
  return country?.name
}

/**
 * Get state name by country code and state code
 */
export function getStateName(countryCode: string, stateCode: string): string | undefined {
  const states = getStatesForCountry(countryCode)
  const state = states.find((s) => s.code === stateCode)
  return state?.name
}
