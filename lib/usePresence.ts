'use client';

import { useEffect, useState } from 'react';

/** Keeps something mounted for `ms` after `show` turns false, so it can play its exit animation. */
export function usePresence(show: boolean, ms = 170) {
  const [mounted, setMounted] = useState(show);
  useEffect(() => {
    if (show) {
      setMounted(true);
      return;
    }
    const t = setTimeout(() => setMounted(false), ms);
    return () => clearTimeout(t);
  }, [show, ms]);
  return { mounted: mounted || show, closing: mounted && !show };
}
