/**
 * The notation architects already know, one 24×24 line symbol per role (copied from Archipelago's set and
 * extended): a cylinder for the database, stacked boxes for a queue, a server rack for an API instance.
 */
export type Glyph = 'client' | 'lb' | 'server' | 'db' | 'queue' | 'worker' | 'lock';

const PATHS: Record<Glyph, string> = {
  client: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.5 3-6 6-6s6 2.5 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14c2.5 0 4.5 2 4.5 5"/>',
  lb: '<path d="M3 12h5l5-6h8M8 12l5 6h8M18 3l3 3-3 3M18 15l3 3-3 3"/>',
  server:
    '<rect x="3" y="3" width="18" height="7" rx="1.5"/><rect x="3" y="14" width="18" height="7" rx="1.5"/><circle cx="7" cy="6.5" r=".9" fill="currentColor"/><circle cx="7" cy="17.5" r=".9" fill="currentColor"/>',
  db: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  queue: '<rect x="2" y="7" width="5.5" height="8" rx="1"/><rect x="9.2" y="7" width="5.5" height="8" rx="1"/><rect x="16.5" y="7" width="5.5" height="8" rx="1"/><path d="M2 20h17M16 17.5l3 2.5-3 2.5"/>',
  worker: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
};

/** The symbol as SVG markup, for HTML. */
export function glyph(kind: Glyph, size = 16): string {
  return `<svg class="glyph" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[kind]}</svg>`;
}

/** The symbol's inner paths, to place inside a larger SVG. */
export const glyphPaths = (kind: Glyph) => PATHS[kind];
