export const BETA_MODE = typeof window !== 'undefined'
  && localStorage.getItem('zettabyte-beta-mode') === 'true';
