/**
 * Region Mapping Configuration
 *
 * Maps Cloudflare data center location codes (colos) to geographical regions.
 * This mapping enables region-aware routing and connection management.
 *
 * Regions are organized by continent and geographical area for more
 * user-friendly display and logical grouping of connections.
 */

/**
 * Mapping of Cloudflare colo codes to geographical regions
 *
 * Format: 'COLO_CODE': 'region-name'
 *
 * Region naming convention:
 * - Continental prefix (us, eu, ap, au, sa, af, me)
 * - Directional suffix (east, west, central, north, south)
 */
export const REGION_MAP: Record<string, string> = {
  // North America - United States
  // East Coast
  IAD: 'us-east', // Ashburn, Virginia
  JFK: 'us-east', // New York City
  ATL: 'us-east', // Atlanta
  ORD: 'us-east', // Chicago
  DCA: 'us-east', // Washington DC
  MIA: 'us-east', // Miami
  BWI: 'us-east', // Baltimore

  // West Coast
  SFO: 'us-west', // San Francisco
  SEA: 'us-west', // Seattle
  LAX: 'us-west', // Los Angeles
  PDX: 'us-west', // Portland
  PHX: 'us-west', // Phoenix
  LAS: 'us-west', // Las Vegas

  // Central
  DEN: 'us-central', // Denver
  DFW: 'us-central', // Dallas
  MSP: 'us-central', // Minneapolis
  STL: 'us-central', // St. Louis
  MCI: 'us-central', // Kansas City

  // North America - Canada
  YYZ: 'ca-central', // Toronto
  YVR: 'ca-west', // Vancouver
  YUL: 'ca-east', // Montreal
  YOW: 'ca-east', // Ottawa

  // Europe
  // Western Europe
  LHR: 'eu-west', // London
  AMS: 'eu-west', // Amsterdam
  CDG: 'eu-west', // Paris
  FRA: 'eu-west', // Frankfurt
  MAD: 'eu-west', // Madrid
  DUB: 'eu-west', // Dublin
  BRU: 'eu-west', // Brussels
  LGW: 'eu-west', // London Gatwick

  // Central/Eastern Europe
  VIE: 'eu-central', // Vienna
  PRG: 'eu-central', // Prague
  WAW: 'eu-central', // Warsaw
  MUC: 'eu-central', // Munich
  OTP: 'eu-east', // Bucharest
  BUD: 'eu-east', // Budapest
  SOF: 'eu-east', // Sofia

  // Asia-Pacific
  // Northeast Asia
  NRT: 'ap-northeast', // Tokyo (Narita)
  KIX: 'ap-northeast', // Osaka
  HND: 'ap-northeast', // Tokyo (Haneda)
  ICN: 'ap-northeast', // Seoul

  // East Asia
  HKG: 'ap-east', // Hong Kong

  // Southeast Asia
  SIN: 'ap-southeast', // Singapore
  BKK: 'ap-southeast', // Bangkok
  KUL: 'ap-southeast', // Kuala Lumpur
  MNL: 'ap-southeast', // Manila

  // Oceania
  SYD: 'au-southeast', // Sydney
  MEL: 'au-southeast', // Melbourne
  BNE: 'au-southeast', // Brisbane
  AKL: 'nz-north', // Auckland

  // South America
  GRU: 'sa-east', // São Paulo
  EZE: 'sa-east', // Buenos Aires
  SCL: 'sa-west', // Santiago
  LIM: 'sa-west', // Lima
  BOG: 'sa-north', // Bogotá

  // Africa / Middle East
  CPT: 'af-south', // Cape Town
  JNB: 'af-south', // Johannesburg
  DXB: 'me-central', // Dubai
  TLV: 'me-central', // Tel Aviv
  CAI: 'af-north', // Cairo
};
