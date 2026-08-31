export type ViewportClass = 'compact' | 'reference' | 'large';

export type ResponsiveLayout = {
  contentMaxWidth: number;
  horizontalPadding: number;
  keyboardOpen: boolean;
  shouldScroll: boolean;
  viewport: ViewportClass;
};

export const VIEWPORTS = {
  compactMaximum: 359,
  contentMaximum: 480,
  largeMinimum: 430,
  referenceWidth: 390,
} as const;

export function getViewportClass(width: number): ViewportClass {
  if (!Number.isFinite(width) || width <= 0) return 'compact';
  if (width <= VIEWPORTS.compactMaximum) return 'compact';
  if (width >= VIEWPORTS.largeMinimum) return 'large';
  return 'reference';
}

export function getResponsiveLayout(
  width: number,
  fontScale = 1,
  keyboardOpen = false,
): ResponsiveLayout {
  const viewport = getViewportClass(width);
  return {
    contentMaxWidth: VIEWPORTS.contentMaximum,
    horizontalPadding: viewport === 'compact' ? 16 : viewport === 'large' ? 24 : 20,
    keyboardOpen,
    shouldScroll: keyboardOpen || fontScale >= 2,
    viewport,
  };
}
