// Centralized enumerations for constrained fields across All Info editors and Property Settings
// Each entry is an array of { value, label }

export const ENUMS = {
  // Basic Info
  type: [
    { value: 'apartment', label: 'Apartment' },
    { value: 'house', label: 'House' },
    { value: 'studio', label: 'Studio' },
    { value: 'villa', label: 'Villa' },
    { value: 'room', label: 'Room' },
    { value: 'other', label: 'Other' },
  ],

  // Media & Content
  bookingDescriptionStatus: [
    { value: 'yes', label: 'Yes' },
    { value: 'no', label: 'No' },
    { value: 'missing', label: 'Missing' },
    { value: 'needs-updating', label: 'Needs updating' },
  ],

  // Legal & Compliance
  contractsStatus: [
    { value: 'signed', label: 'Signed' },
    { value: 'missing-signature', label: 'Missing Signature' },
    { value: 'old', label: 'Old' },
    { value: 'not-necessary', label: 'Not necessary' },
  ],
  complaintBooksStatus: [
    { value: 'in-office', label: 'In the office' },
    { value: 'missing', label: 'Missing' },
  ],
  statisticsStatus: [
    { value: 'on-platform', label: 'On the Platform' },
    { value: 'missing', label: 'Missing' },
  ],
  sefStatus: [
    { value: 'on-platform', label: 'On the platform' },
    { value: 'missing', label: 'Missing' },
  ],

  // Online Services
  airbnbLinksStatus: [
    { value: 'yes', label: 'Yes' },
    { value: 'missing', label: 'Missing' },
  ],

  // Connectivity & Utilities
  wifiSpeed: [
    { value: 'basic', label: '< 25 Mbps' },
    { value: 'standard', label: '25-50 Mbps' },
    { value: 'fast', label: '50-100 Mbps' },
    { value: 'very-fast', label: '100+ Mbps' },
    { value: 'fiber', label: 'Fiber (500+ Mbps)' },
  ],
  internetProvider: [
    { value: 'MEO', label: 'MEO' },
    { value: 'NOS', label: 'NOS' },
  ],
  energySource: [
    { value: 'electric', label: 'Electric' },
    { value: 'gas', label: 'Gas' },
    { value: 'mixed', label: 'Mixed' },
    { value: 'solar', label: 'Solar' },
    { value: 'heat-pump', label: 'Heat Pump' },
  ],

  // Frames
  wifiFrame: [
    { value: 'placed', label: 'Placed' },
    { value: 'no', label: 'No' },
    { value: 'done', label: 'Done' },
    { value: 'check', label: 'Check' },
  ],
  recommendationsFrame: [
    { value: 'placed', label: 'Placed' },
    { value: 'no', label: 'No' },
    { value: 'done', label: 'Done' },
    { value: 'check', label: 'Check' },
  ],
  investmentFrame: [
    { value: 'yes', label: 'Yes' },
    { value: 'no', label: 'No' },
    { value: 'do-not-place', label: 'Do not place' },
  ],

  // Services & Extras
  breakfastBox: [
    { value: 'yes', label: 'Yes' },
    { value: 'no', label: 'No' },
  ],
  poolMaintenanceDay: [
    { value: 'Monday', label: 'Monday' },
    { value: 'Tuesday', label: 'Tuesday' },
    { value: 'Wednesday', label: 'Wednesday' },
    { value: 'Thursday', label: 'Thursday' },
    { value: 'Friday', label: 'Friday' },
    { value: 'Saturday', label: 'Saturday' },
    { value: 'Sunday', label: 'Sunday' },
  ],

  // Signage
  privateSign: [
    { value: 'yes', label: 'Yes' },
    { value: 'needs-checking', label: 'Needs checking' },
    { value: 'not-necessary', label: 'Not necessary' },
  ],
  noSmokingSign: [
    { value: 'yes', label: 'Yes' },
    { value: 'needs-checking', label: 'Needs checking' },
    { value: 'not-necessary', label: 'Not necessary' },
  ],
  noJunkMailSign: [
    { value: 'yes', label: 'Yes' },
    { value: 'needs-checking', label: 'Needs checking' },
    { value: 'not-necessary', label: 'Not necessary' },
  ],
  alAhSign: [
    { value: 'yes', label: 'Yes' },
    { value: 'not-necessary', label: 'Not necessary' },
    { value: 'authorized', label: 'Authorized' },
  ],
  keysNotice: [
    { value: 'yes', label: 'Yes' },
    { value: 'needs-checking', label: 'Needs checking' },
    { value: 'not-necessary', label: 'Not necessary' },
  ],
  wcSign: [
    { value: 'yes', label: 'Yes' },
    { value: 'needs-checking', label: 'Needs checking' },
    { value: 'not-necessary', label: 'Not necessary' },
  ],

  // Safety
  firstAidStatus: [
    { value: 'Complete', label: 'Complete' },
    { value: 'Incomplete', label: 'Incomplete' },
    { value: 'Needs Restocking', label: 'Needs Restocking' },
    { value: 'Missing', label: 'Missing' },
  ],
};

export function getEnumOptions(field) {
  return ENUMS[field] || null;
}
