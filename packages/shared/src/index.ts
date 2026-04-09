/**
 * @mcstudio/shared — Common utilities across all MCStudio apps
 * 
 * This package will grow as we migrate apps to share:
 * - Firebase initialization patterns
 * - Gemini API helpers
 * - Shared TypeScript types
 * - Common UI components (if using the same design system)
 */

export const MCSTUDIO_VERSION = '1.0.0';

/**
 * Shared app identifiers — used for Firebase project routing, analytics, etc.
 */
export const AppId = {
  NEMT: 'nemt',
  NUTRIMOMENT: 'nutrimoment',
  REALESTATE: 'realestate',
  MINA_ENERGY: 'mina-energy',
} as const;

export type AppIdType = typeof AppId[keyof typeof AppId];
