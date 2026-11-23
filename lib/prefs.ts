export type Prefs = {
  defaultMic: boolean;
  defaultCam: boolean;
  layout: 'star' | 'grid' | 'speaker';
  /** Where recordings go on a computer. Phones can only use Drive. */
  recordTo: 'drive' | 'folder' | 'both';
};

export const DEFAULT_PREFS: Prefs = { defaultMic: true, defaultCam: true, layout: 'star', recordTo: 'drive' };

export function loadPrefs(): Prefs {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem('dm-prefs') || '{}') };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(p: Prefs) {
  try {
    localStorage.setItem('dm-prefs', JSON.stringify(p));
  } catch {
    /* storage unavailable */
  }
}

export const isMobile = () => typeof navigator !== 'undefined' && (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform)));
