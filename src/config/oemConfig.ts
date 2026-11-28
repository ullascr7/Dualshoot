export interface OemConfig {
  appName: string;
  companyName: string;
  packageId: string;
  primaryAccentColor: string;
  showBrandWatermark: boolean;
  watermarkText: string;
}

export const OEM_CONFIG: OemConfig = {
  appName: 'Dualshoot',
  companyName: 'OEM Partner',
  packageId: 'com.oem.dualshoot',
  primaryAccentColor: '#3B82F6',
  showBrandWatermark: false,
  watermarkText: 'Shot on Dualshoot',
};
