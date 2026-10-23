import type { LocalizedText } from './contracts.ts';
export interface PublicSubgroup {
  id: string;
  name: LocalizedText;
  logo: string | null;
  showLinks?: boolean;
}
export interface PublicGroup extends PublicSubgroup {
  subgroups: PublicSubgroup[];
}
export interface PublicConfig {
  configVersion: string;
  build: {
    commit: string;
    commitUrl: string;
  };
  site: {
    name: LocalizedText;
    logo: string | null;
    nav: { label: LocalizedText; href: string; newTab: boolean }[];
    footer: LocalizedText | '';
    refreshIntervalSeconds: number;
    pinAbnormal: boolean;
    showLinks: boolean;
    umami: { scriptUrl: string; websiteId: string } | null;
  };
  groups: PublicGroup[];
}
