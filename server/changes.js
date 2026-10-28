// Sier fra til åpne skjermstrømmer (src/api/stream.js) når noe endres hos en
// kunde, så skjermene får endringen med en gang i stedet for ved neste runde.

import { EventEmitter } from 'node:events';

const bus = new EventEmitter();
bus.setMaxListeners(0);

export function notifyChange(slug) {
  bus.emit(slug);
}

/** Venter til noe endres hos kunden, eller maks ms. -> true ved endring. */
export function waitForChange(slug, ms) {
  return new Promise((resolve) => {
    const done = (changed) => {
      clearTimeout(timer);
      bus.off(slug, onChange);
      resolve(changed);
    };
    const onChange = () => done(true);
    const timer = setTimeout(() => done(false), ms);
    bus.on(slug, onChange);
  });
}
