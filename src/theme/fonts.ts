import { useFonts } from 'expo-font';

import { appFonts } from './brand-fonts.ts';

export function useAppFonts() {
  return useFonts(appFonts);
}
