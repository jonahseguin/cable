/**
 * Gets the user's default timezone from the browser
 */
export function getDefaultTimezone(): string {
  try {
    // Get the browser timezone
    const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Map to a supported timezone if needed
    const mappedTimezone = mapToSupportedTimezone(browserTimezone);
    return mappedTimezone || browserTimezone || 'America/Los_Angeles';
  } catch {
    return 'America/Los_Angeles';
  }
}

/**
 * All supported timezones in our app
 */
export const SUPPORTED_TIMEZONES = [
  { value: 'America/Los_Angeles', label: 'Pacific Time (UTC-8)' },
  { value: 'America/Denver', label: 'Mountain Time (UTC-7)' },
  { value: 'America/Chicago', label: 'Central Time (UTC-6)' },
  { value: 'America/New_York', label: 'Eastern Time (UTC-5)' },
  { value: 'America/Sao_Paulo', label: 'Brazil Time (UTC-3)' },
  { value: 'Europe/London', label: 'London/West Africa (UTC+0)' },
  { value: 'Europe/Paris', label: 'Central Europe (UTC+1)' },
  { value: 'Africa/Cairo', label: 'Eastern/Southern Africa (UTC+2)' },
  { value: 'Asia/Dubai', label: 'Gulf States (UTC+4)' },
  { value: 'Asia/Kolkata', label: 'India (UTC+5:30)' },
  { value: 'Asia/Singapore', label: 'Singapore/China (UTC+8)' },
  { value: 'Asia/Tokyo', label: 'Japan/Korea (UTC+9)' },
  { value: 'Australia/Sydney', label: 'Eastern Australia (UTC+10)' },
  { value: 'Pacific/Auckland', label: 'New Zealand (UTC+12)' },
];

/**
 * Full mapping of all IANA timezones to our supported ones
 * This is a comprehensive list of commonly used timezones
 */
const TIMEZONE_MAPPINGS: Record<string, string> = {
  // North American Timezones (PT)
  'America/Vancouver': 'America/Los_Angeles',
  'America/Tijuana': 'America/Los_Angeles',
  'America/Santa_Isabel': 'America/Los_Angeles',
  'America/Dawson': 'America/Los_Angeles',
  'America/Whitehorse': 'America/Los_Angeles',
  'US/Pacific': 'America/Los_Angeles',
  PST8PDT: 'America/Los_Angeles',

  // North American Timezones (MT)
  'America/Edmonton': 'America/Denver',
  'America/Phoenix': 'America/Denver',
  'America/Chihuahua': 'America/Denver',
  'America/Hermosillo': 'America/Denver',
  'America/Mazatlan': 'America/Denver',
  'US/Mountain': 'America/Denver',
  MST7MDT: 'America/Denver',

  // North American Timezones (CT)
  'America/Winnipeg': 'America/Chicago',
  'America/Mexico_City': 'America/Chicago',
  'America/Belize': 'America/Chicago',
  'America/Costa_Rica': 'America/Chicago',
  'America/Guatemala': 'America/Chicago',
  'America/Managua': 'America/Chicago',
  'America/Regina': 'America/Chicago',
  'US/Central': 'America/Chicago',
  CST6CDT: 'America/Chicago',

  // North American Timezones (ET)
  'America/Montreal': 'America/New_York',
  'America/Toronto': 'America/New_York',
  'America/Indiana/Indianapolis': 'America/New_York',
  'America/Detroit': 'America/New_York',
  'America/Nassau': 'America/New_York',
  'America/Jamaica': 'America/New_York',
  'America/Panama': 'America/New_York',
  'US/Eastern': 'America/New_York',
  EST5EDT: 'America/New_York',

  // South American Timezones (BRT)
  'America/Argentina/Buenos_Aires': 'America/Sao_Paulo',
  'America/Santiago': 'America/Sao_Paulo',
  'America/Montevideo': 'America/Sao_Paulo',
  'Brazil/East': 'America/Sao_Paulo',

  // Central & Northern South America
  'America/Lima': 'America/New_York',
  'America/Bogota': 'America/New_York',
  'America/Caracas': 'America/New_York',
  'America/La_Paz': 'America/New_York',
  'America/Asuncion': 'America/New_York',

  // European Timezones (GMT/UTC)
  'Europe/Dublin': 'Europe/London',
  'Europe/Lisbon': 'Europe/London',
  'Atlantic/Reykjavik': 'Europe/London',
  UTC: 'Europe/London',
  GMT: 'Europe/London',

  // European Timezones (CET/CEST)
  'Europe/Berlin': 'Europe/Paris',
  'Europe/Madrid': 'Europe/Paris',
  'Europe/Rome': 'Europe/Paris',
  'Europe/Amsterdam': 'Europe/Paris',
  'Europe/Vienna': 'Europe/Paris',
  'Europe/Brussels': 'Europe/Paris',
  'Europe/Copenhagen': 'Europe/Paris',
  'Europe/Stockholm': 'Europe/Paris',
  'Europe/Prague': 'Europe/Paris',
  'Europe/Warsaw': 'Europe/Paris',
  CET: 'Europe/Paris',

  // Eastern European
  'Europe/Moscow': 'Africa/Cairo',
  'Europe/Kiev': 'Africa/Cairo',
  'Europe/Bucharest': 'Africa/Cairo',
  'Europe/Athens': 'Africa/Cairo',
  'Europe/Istanbul': 'Africa/Cairo',
  'Europe/Helsinki': 'Africa/Cairo',

  // Eastern African Timezones (EAT)
  'Africa/Nairobi': 'Africa/Cairo',
  'Africa/Addis_Ababa': 'Africa/Cairo',
  'Africa/Khartoum': 'Africa/Cairo',
  'Africa/Dar_es_Salaam': 'Africa/Cairo',
  'Africa/Djibouti': 'Africa/Cairo',
  'Africa/Mogadishu': 'Africa/Cairo',
  'Africa/Kampala': 'Africa/Cairo',

  // Northern African Timezones
  'Africa/Algiers': 'Europe/Paris',
  'Africa/Tunis': 'Europe/Paris',
  'Africa/Tripoli': 'Africa/Cairo',

  // Western African Timezones (WAT)
  'Africa/Lagos': 'Europe/Paris',
  'Africa/Luanda': 'Europe/Paris',
  'Africa/Porto-Novo': 'Europe/Paris',
  'Africa/Kinshasa': 'Europe/Paris',
  'Africa/Douala': 'Europe/Paris',
  'Africa/Libreville': 'Europe/Paris',
  'Africa/Malabo': 'Europe/Paris',
  'Africa/Niamey': 'Europe/Paris',
  'Africa/Brazzaville': 'Europe/Paris',

  // Southern African Timezones (SAST)
  'Africa/Johannesburg': 'Africa/Cairo',
  'Africa/Maputo': 'Africa/Cairo',
  'Africa/Windhoek': 'Africa/Cairo',
  'Africa/Lusaka': 'Africa/Cairo',
  'Africa/Harare': 'Africa/Cairo',
  'Africa/Gaborone': 'Africa/Cairo',
  'Africa/Mbabane': 'Africa/Cairo',
  'Africa/Maseru': 'Africa/Cairo',

  // Western Africa (GMT)
  'Africa/Accra': 'Europe/London',
  'Africa/Abidjan': 'Europe/London',
  'Africa/Bamako': 'Europe/London',
  'Africa/Banjul': 'Europe/London',
  'Africa/Conakry': 'Europe/London',
  'Africa/Dakar': 'Europe/London',
  'Africa/Freetown': 'Europe/London',
  'Africa/Lome': 'Europe/London',
  'Africa/Nouakchott': 'Europe/London',
  'Africa/Ouagadougou': 'Europe/London',

  // Middle East / Gulf Timezones (GST)
  'Asia/Muscat': 'Asia/Dubai',
  'Asia/Bahrain': 'Asia/Dubai',
  'Asia/Qatar': 'Asia/Dubai',
  'Asia/Kuwait': 'Asia/Dubai',
  'Asia/Riyadh': 'Asia/Dubai',

  // Indian Subcontinent (IST)
  'Asia/Colombo': 'Asia/Kolkata',
  'Asia/Kathmandu': 'Asia/Kolkata',
  'Asia/Dhaka': 'Asia/Kolkata',
  'Asia/Thimphu': 'Asia/Kolkata',

  // East Asian Timezones
  'Asia/Shanghai': 'Asia/Singapore',
  'Asia/Hong_Kong': 'Asia/Singapore',
  'Asia/Kuala_Lumpur': 'Asia/Singapore',
  'Asia/Manila': 'Asia/Singapore',
  'Asia/Taipei': 'Asia/Singapore',
  'Asia/Brunei': 'Asia/Singapore',

  // Japan and Korea
  'Asia/Seoul': 'Asia/Tokyo',
  Japan: 'Asia/Tokyo',
  JST: 'Asia/Tokyo',

  // Southeast Asian Timezones
  'Asia/Bangkok': 'Asia/Singapore',
  'Asia/Jakarta': 'Asia/Singapore',
  'Asia/Phnom_Penh': 'Asia/Singapore',
  'Asia/Vientiane': 'Asia/Singapore',
  'Asia/Ho_Chi_Minh': 'Asia/Singapore',

  // Australian Timezones
  'Australia/Melbourne': 'Australia/Sydney',
  'Australia/Brisbane': 'Australia/Sydney',
  'Australia/Hobart': 'Australia/Sydney',
  'Australia/Canberra': 'Australia/Sydney',

  // Central/Western Australia
  'Australia/Adelaide': 'Australia/Sydney',
  'Australia/Perth': 'Asia/Singapore', // Perth is UTC+8, same as Singapore
  'Australia/Darwin': 'Asia/Singapore', // Darwin is UTC+9:30, closer to Singapore than Sydney

  // New Zealand and Pacific
  'Pacific/Fiji': 'Pacific/Auckland',
  'Pacific/Tongatapu': 'Pacific/Auckland',

  // Hawaii and Alaska
  'US/Hawaii': 'America/Los_Angeles',
  'US/Alaska': 'America/Los_Angeles',
  'Pacific/Honolulu': 'America/Los_Angeles',
  'America/Anchorage': 'America/Los_Angeles',
};

/**
 * Maps any timezone to one of our supported timezones
 */
function mapToSupportedTimezone(timezone: string): string | null {
  // Direct mapping if available
  if (TIMEZONE_MAPPINGS[timezone]) {
    return TIMEZONE_MAPPINGS[timezone];
  }

  // If the timezone is already in our supported list, return it
  if (SUPPORTED_TIMEZONES.some((tz) => tz.value === timezone)) {
    return timezone;
  }

  return null;
}

/**
 * Formats a timezone string into a human-readable format
 */
export function formatTimezone(timezone: string): string {
  // First check if there's a direct mapping
  const mappedTimezone = mapToSupportedTimezone(timezone);

  // Look up in our supported timezones
  const found = SUPPORTED_TIMEZONES.find((tz) => tz.value === (mappedTimezone || timezone));
  if (found) {
    return found.label;
  }

  // Fall back to a cleaned-up version of the timezone
  return timezone.replace(/_/g, ' ').replace('America/', '');
}
