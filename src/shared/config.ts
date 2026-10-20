import type { LocalizedText } from './contracts.ts';
export interface PublicSubgroup {
  id: string;
  name: LocalizedText;
  logo: string | null;
}
export interface PublicGroup extends PublicSubgroup {
  subgroups: PublicSubgroup[];
}
export interface PublicConfig {
  configVersion: string;
  site: {
    name: LocalizedText;
    logo: string | null;
    nav: { label: LocalizedText; href: string }[];
    footer: LocalizedText;
    refreshIntervalSeconds: number;
    pinAbnormal: boolean;
  };
  groups: PublicGroup[];
}
