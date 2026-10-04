import type { Kind } from './game/types';

/**
 * The notation architects already know, one 24×24 line symbol per piece: the cylinder for a database,
 * a lollipop for a port (UML), and the boundary / control / entity circles of the robustness diagram.
 */
const PATHS: Record<Kind, string> = {
  phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 19h2"/>',
  laptop: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/>',
  server: '<rect x="3" y="3" width="18" height="7" rx="1.5"/><rect x="3" y="14" width="18" height="7" rx="1.5"/><circle cx="7" cy="6.5" r=".9" fill="currentColor"/><circle cx="7" cy="17.5" r=".9" fill="currentColor"/>',
  db: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  adapter: '<path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4"/>',
  bank: '<path d="M3 10l9-6 9 6M6 10v8M10 10v8M14 10v8M18 10v8M4 20h16"/>',
  crowd: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.5 3-6 6-6s6 2.5 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14c2.5 0 4.5 2 4.5 5"/>',
  facade: '<path d="M4 21V8l8-5 8 5v13"/><rect x="9" y="13" width="6" height="8"/>',
  pay: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  stock: '<path d="M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8"/>',
  ship: '<rect x="1" y="6" width="13" height="10" rx="1"/><path d="M14 9h4l3 3v4h-7"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  cache: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  lb: '<path d="M3 12h5l5-6h8M8 12l5 6h8M18 3l3 3-3 3M18 15l3 3-3 3"/>',
  shop: '<path d="M3 10v4h3l8 5V5L6 10zM17.5 9a4 4 0 0 1 0 6"/>',
  broker: '<circle cx="12" cy="12" r="3"/><path d="M9.8 10L5.5 6M14.2 10l4.3-4M12 15v4"/><circle cx="4.5" cy="5" r="1.6"/><circle cx="19.5" cy="5" r="1.6"/><circle cx="12" cy="20.5" r="1.6"/>',
  queue: '<rect x="2" y="7" width="5.5" height="8" rx="1"/><rect x="9.2" y="7" width="5.5" height="8" rx="1"/><rect x="16.5" y="7" width="5.5" height="8" rx="1"/><path d="M2 20h17M16 17.5l3 2.5-3 2.5"/>',
  email: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  analytics: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
  guard: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  zip: '<path d="M4 4l6 6M10 5v5H5M20 20l-6-6M14 19v-5h5"/>',
  logbook: '<path d="M6 2h9l4 4v16H6zM9 8h3M9 12h7M9 16h7"/>',
  controller: '<circle cx="12" cy="13" r="7"/><path d="M15 3l-4 3 4 3"/>',
  usecase: '<ellipse cx="12" cy="12" rx="10" ry="6"/>',
  entity: '<circle cx="12" cy="11" r="7"/><path d="M4 21h16"/>',
  port: '<circle cx="17" cy="12" r="4"/><path d="M3 12h10"/>',
};

export function glyph(kind: Kind): string {
  return `<svg class="glyph" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[kind]}</svg>`;
}
