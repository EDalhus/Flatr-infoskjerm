import { useState } from 'react';

/**
 * HTML5 dra-og-slipp for en vertikal liste.
 * `onReorder(fromIndex, toIndex)` kalles ved slipp.
 */
export function useListDnd(onReorder) {
  const [from, setFrom] = useState(null);
  const [over, setOver] = useState(null);

  const rowProps = (index) => ({
    draggable: true,
    onDragStart: (e) => {
      setFrom(index);
      e.dataTransfer.effectAllowed = 'move';
    },
    onDragOver: (e) => {
      e.preventDefault();
      if (over !== index) setOver(index);
    },
    onDrop: (e) => {
      e.preventDefault();
      if (from != null && from !== index) onReorder(from, index);
      setFrom(null);
      setOver(null);
    },
    onDragEnd: () => {
      setFrom(null);
      setOver(null);
    },
    className: over === index && from != null && from !== index ? 'ring-2 ring-brand ring-inset' : ''
  });

  return { rowProps, draggingIndex: from };
}
