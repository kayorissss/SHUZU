/** Значения акцентов в JS (нужны canvas-анимациям, где CSS-переменные недоступны). */
import type { Settings } from '../shared/types';

export const ACCENTS: Record<Settings['accent'], { primary: string; secondary: string; rgb: [number, number, number] }> = {
  mint: { primary: '#3EE0A8', secondary: '#22C4E0', rgb: [62, 224, 168] },
  ice: { primary: '#58C7FF', secondary: '#8F7DFF', rgb: [88, 199, 255] },
  violet: { primary: '#A98BFF', secondary: '#FF7DE0', rgb: [169, 139, 255] },
  amber: { primary: '#FFC14D', secondary: '#FF8A4D', rgb: [255, 193, 77] },
};

export function accentOf(settings: Settings) {
  return ACCENTS[settings.accent] ?? ACCENTS.mint;
}
