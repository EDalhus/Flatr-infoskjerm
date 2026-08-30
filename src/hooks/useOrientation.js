import { useEffect, useState } from 'react';

const read = () =>
  typeof window !== 'undefined' && window.matchMedia('(orientation: portrait)').matches
    ? 'portrait'
    : 'landscape';

/** 'portrait' | 'landscape' – oppdateres når vinduet roteres/endres. */
export function useOrientation() {
  const [orientation, setOrientation] = useState(read);

  useEffect(() => {
    const mq = window.matchMedia('(orientation: portrait)');
    const update = () => setOrientation(read());
    mq.addEventListener?.('change', update);
    window.addEventListener('resize', update);
    return () => {
      mq.removeEventListener?.('change', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return orientation;
}
