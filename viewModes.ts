export type ViewModeId = 'default' | 'buster' | '8-bitruvius' | '16-bitruvius' | '32-bitruvius' | 'noir' | 'skeletal' | 'lotte';

export interface ViewModeOption {
  id: ViewModeId;
  label: string;
}

export const viewModes: ViewModeOption[] = [
  { id: 'default', label: 'Default' },
  { id: 'buster', label: 'Buster Silent' },
  { id: '8-bitruvius', label: '8-Bitruvius' },
  { id: '16-bitruvius', label: '16-Bitruvius' },
  { id: '32-bitruvius', label: '32-Bitruvius' },
  { id: 'noir', label: 'Noir' },
  { id: 'skeletal', label: 'Skeletal' },
  { id: 'lotte', label: 'Lotte' },
];
