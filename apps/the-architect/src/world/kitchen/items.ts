import * as THREE from 'three';
import { M, bar, box, carcass, flat, frame, group, handle, hinged, legs, many, mesh, panelDoor, panelDrawer, root } from './kit';

// Kitchen props from the reference sheet, sized to read correctly at the sheet's viewing distance.
// Each builder returns a Group: origin at the floor centre (the hood: canopy bottom), +Z front.

type V3 = [number, number, number];

function twoDoorCabinet(name: string) {
  const g = root(name);
  const W = 0.8, H = 0.86, D = 0.7;
  const z = carcass(g, W, H, D);
  const dh = H - 0.035 - 0.09 - 0.02, dy = 0.09 + 0.01 + dh / 2, dw = W / 2 - 0.004;
  panelDoor(g, 'Door west', dw, dh, [-W / 2 + 0.002, dy, z], -1);
  panelDoor(g, 'Door east', dw, dh, [W / 2 - 0.002, dy, z], 1);
  return g;
}

export function baseCabinet2Door() { return twoDoorCabinet('Base cabinet, 2 doors'); }

export function baseCabinet2Drawer() {
  const g = root('Base cabinet, 2 drawers');
  const W = 0.8, H = 0.86, D = 0.7;
  const z = carcass(g, W, H, D);
  const fh = (H - 0.035 - 0.09 - 0.03) / 2;
  panelDrawer(g, 'Drawer top', W - 0.01, fh, 0.09 + 0.01 + fh * 1.5 + 0.01, z, D - 0.08);
  panelDrawer(g, 'Drawer bottom', W - 0.01, fh, 0.09 + 0.01 + fh / 2, z, D - 0.08);
  return g;
}

export function prepCabinet() {
  const g = twoDoorCabinet('Prep cabinet');
  const top = 0.86;
  box(g, 'Cutting board', M.wood, [0.7, 0.04, 0.5], [-0.02, top + 0.02, 0.06], 0.014);
  box(g, 'Board groove', M.woodDark, [0.62, 0.004, 0.42], [-0.02, top + 0.041, 0.06], 0.002);
  bar(g, 'Utensil cup', M.steel, [0.26, top + 0.04, -0.2], [0.26, top + 0.2, -0.2], 0.05, 16);
  const tips: V3[] = [[0.23, 0.42, -0.22], [0.27, 0.45, -0.17], [0.3, 0.4, -0.23], [0.25, 0.38, -0.25]];
  tips.forEach((t, i) => {
    bar(g, 'Wooden utensil', M.wood, [0.26, top + 0.05, -0.2], [t[0], top + t[1] - 0.05, t[2]], 0.008, 6);
    box(g, 'Utensil head', M.wood, [0.04, 0.06, 0.012], [t[0], top + t[1], t[2]], 0.006).rotation.y = i;
  });
  return g;
}

function bin(parent: THREE.Object3D, name: string, mat: THREE.Material, w: number, h: number, d: number, p: V3) {
  const geo = flat(new THREE.CylinderGeometry(Math.SQRT1_2 * w, Math.SQRT1_2 * w * 0.86, h, 4, 1, true).rotateY(Math.PI / 4).scale(1, 1, d / w));
  mesh(parent, name, geo, mat, p);
  box(parent, `${name} rim`, mat, [w + 0.01, 0.02, d + 0.01], [p[0], p[1] + h / 2 - 0.01, p[2]], 0.005);
  box(parent, `${name} bottom`, mat, [w * 0.86, 0.01, d * 0.86], [p[0], p[1] - h / 2 + 0.005, p[2]], 0);
}

export function binDrawerCabinet() {
  const g = root('Cabinet with bin drawer');
  const W = 0.8, H = 0.86, D = 0.7;
  const z = carcass(g, W, H, D);
  const fh = H - 0.035 - 0.09 - 0.02;
  const dr = panelDrawer(g, 'Bin drawer', W - 0.01, fh, 0.1 + fh / 2, z, D - 0.08);
  bin(dr, 'Green bin', M.green, 0.32, 0.4, 0.5, [-0.18, -fh / 2 + 0.21, -0.32]);
  bin(dr, 'Blue bin', M.blue, 0.32, 0.4, 0.5, [0.18, -fh / 2 + 0.21, -0.32]);
  return g;
}

export function binStation() {
  const g = root('Bin station');
  const W = 1.0, H = 0.9, D = 0.7, C = 0.22; // C = chamfer on the front-west corner
  const shape = new THREE.Shape([
    new THREE.Vector2(-W / 2, -D / 2), new THREE.Vector2(W / 2, -D / 2), new THREE.Vector2(W / 2, D / 2),
    new THREE.Vector2(-W / 2 + C, D / 2), new THREE.Vector2(-W / 2, D / 2 - C),
  ]);
  const slab = (h: number, inset: number) =>
    new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004 - inset, bevelSegments: 1 }).rotateX(Math.PI / 2);
  mesh(g, 'Body', slab(H - 0.12, 0), M.steel, [0, H - 0.04, 0]);
  mesh(g, 'Worktop', slab(0.035, 0), M.steel, [0, H, 0]).scale.set(1.02, 1, 1.02);
  box(g, 'Kick plinth', M.steelDark, [W - 0.06, 0.08, D - 0.1], [0.02, 0.04, -0.03], 0);
  box(g, 'Back upstand', M.steel, [W, 0.05, 0.02], [0, H + 0.025, -D / 2], 0.004);
  box(g, 'East upstand', M.steel, [0.02, 0.05, D], [W / 2, H + 0.025, 0], 0.004);
  bin(g, 'Green bin', M.green, 0.34, 0.12, 0.3, [-0.12, H - 0.04, -0.08]);
  bin(g, 'Blue bin', M.blue, 0.34, 0.12, 0.3, [0.27, H - 0.04, -0.08]);
  const door = hinged(g, 'Door', [-W / 2 + C + 0.03, 0.47, D / 2], -1);
  box(door, 'Door slab', M.steel, [0.5, 0.62, 0.02], [0.25, 0, 0.01], 0.004);
  frame(door, 'Door frame', M.steel, 0.5, 0.62, 0.25, 0, 0.02);
  handle(door, 'Door handle', [0.44, 0.15, 0.028], 0.12, true);
  bar(g, 'Towel bar', M.chrome, [W / 2 - 0.25, H - 0.08, D / 2 + 0.04], [W / 2 - 0.03, H - 0.08, D / 2 + 0.04], 0.008);
  box(g, 'Towel', M.white, [0.16, 0.36, 0.012], [W / 2 - 0.13, H - 0.25, D / 2 + 0.046], 0.006);
  return g;
}

export function cleaningCabinet() {
  const g = root('Cleaning cabinet');
  const W = 0.9, H = 0.9, D = 0.6, T = 0.02;
  box(g, 'Floor', M.steel, [W, T, D], [0, T / 2, 0], 0.004);
  box(g, 'Back', M.steel, [W, H, T], [0, H / 2, -D / 2 + T / 2], 0.004);
  box(g, 'East side', M.steel, [T, H, D], [W / 2 - T / 2, H / 2, 0], 0.004);
  box(g, 'Divider', M.steel, [T, H * 0.75, D * 0.85], [0.02, H * 0.375, -D * 0.075], 0.004);
  bar(g, 'Hook rail', M.chrome, [-0.42, 0.72, -0.27], [0.0, 0.72, -0.27], 0.008);
  const hang = (x: number, len: number, head: THREE.Material, headSize: V3) => {
    bar(g, 'Hanging tool handle', M.wood, [x, 0.72, -0.25], [x, 0.72 - len, -0.25], 0.012, 8);
    box(g, 'Hanging tool head', head, headSize, [x, 0.72 - len - headSize[1] / 2, -0.24], 0.01);
  };
  hang(-0.36, 0.3, M.red, [0.1, 0.05, 0.05]);
  hang(-0.28, 0.38, M.woodDark, [0.05, 0.12, 0.03]);
  box(g, 'Hanging cloth', M.cloth, [0.13, 0.34, 0.015], [-0.13, 0.52, -0.255], 0.007);
  bar(g, 'Broom handle', M.wood, [0.2, 0.08, 0.05], [0.16, 0.95, -0.27], 0.012, 8);
  box(g, 'Broom head', M.woodDark, [0.24, 0.04, 0.06], [0.2, 0.08, 0.06], 0.01);
  box(g, 'Broom bristles', M.yellow, [0.24, 0.07, 0.07], [0.2, 0.03, 0.06], 0.012);
  const spray = (x: number, z: number, mat: THREE.Material, h: number) => {
    bar(g, 'Bottle', mat, [x, T, z], [x, T + h, z], 0.04, 14);
    bar(g, 'Bottle neck', mat, [x, T + h, z], [x, T + h + 0.04, z], 0.04, 14, 0.015);
    box(g, 'Trigger', M.white, [0.03, 0.05, 0.06], [x, T + h + 0.07, z + 0.01], 0.008);
  };
  spray(0.33, -0.05, M.red, 0.18);
  spray(0.38, 0.1, M.white, 0.2);
  return g;
}

export function jarShelf() {
  const g = root('Jar shelf');
  const W = 0.6, D = 0.32, ys = [0.06, 0.32, 0.58, 0.84];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bar(g, 'Post', M.steel, [sx * (W / 2 - 0.015), 0, sz * (D / 2 - 0.015)], [sx * (W / 2 - 0.015), 1.04, sz * (D / 2 - 0.015)], 0.014, 10);
  for (const y of ys) {
    box(g, 'Shelf', M.steel, [W, 0.02, D], [0, y, 0], 0.004);
    box(g, 'Shelf lip', M.steel, [W, 0.05, 0.012], [0, y + 0.02, D / 2], 0.003);
    for (const s of [-1, 1]) box(g, 'Shelf lip', M.steel, [0.012, 0.05, D], [s * W / 2, y + 0.02, 0], 0.003);
  }
  const row = (y: number, z: number, n: number) => Array.from({ length: n }, (_, i): V3 => [-W / 2 + 0.07 + (i * (W - 0.14)) / (n - 1), y, z]);
  const glassJars: V3[] = [], tins: V3[] = [];
  for (const z of [-0.07, 0.07]) {
    tins.push(...row(ys[3] + 0.01, z, 5));
    for (const y of ys.slice(0, 3)) glassJars.push(...row(y + 0.01, z, 5));
  }
  const jarH = 0.18, r = 0.045;
  many(g, 'Tins', new THREE.CylinderGeometry(r, r, jarH, 14).translate(0, jarH / 2, 0), M.steel, tins);
  many(g, 'Jar glass', new THREE.CylinderGeometry(r, r, jarH, 14).translate(0, jarH / 2, 0), M.glass, glassJars);
  many(g, 'Jar contents', new THREE.CylinderGeometry(r * 0.9, r * 0.9, jarH * 0.78, 10).translate(0, jarH * 0.39 + 0.004, 0), M.grain, glassJars);
  many(g, 'Lids', new THREE.CylinderGeometry(r * 1.03, r * 1.03, 0.025, 14).translate(0, jarH + 0.012, 0), M.chrome, [...glassJars, ...tins]);
  return g;
}

export function wineCooler() {
  const g = root('Wine cooler');
  const W = 0.6, H = 0.86, D = 0.6;
  box(g, 'Worktop', M.steel, [W + 0.02, 0.03, D + 0.02], [0, H - 0.015, 0], 0.008);
  for (const s of [-1, 1]) box(g, 'Side', M.steel, [0.03, H - 0.03, D], [s * (W / 2 - 0.015), (H - 0.03) / 2, 0], 0.004);
  box(g, 'Back', M.steel, [W, H - 0.03, 0.03], [0, (H - 0.03) / 2, -D / 2 + 0.015], 0);
  box(g, 'Base', M.steel, [W, 0.08, D], [0, 0.04, 0], 0.004);
  box(g, 'Interior', M.black, [W - 0.06, H - 0.14, 0.01], [0, H / 2, -D / 2 + 0.035], 0);
  const racks = [0.18, 0.31, 0.44, 0.57, 0.7];
  const ends: V3[] = [];
  for (const y of racks) {
    box(g, 'Wine rack front', M.wood, [W - 0.07, 0.025, 0.02], [0, y - 0.04, D / 2 - 0.09], 0.004);
    for (let i = 0; i < 6; i++) ends.push([-0.21 + i * 0.084, y, D / 2 - 0.1]);
  }
  many(g, 'Bottles', new THREE.CylinderGeometry(0.035, 0.035, 0.42, 10).rotateX(Math.PI / 2).translate(0, 0, -0.21), M.bottle, ends);
  many(g, 'Bottle necks', new THREE.CylinderGeometry(0.014, 0.03, 0.08, 8).rotateX(Math.PI / 2).translate(0, 0, 0.04), M.bottle, ends);
  const door = hinged(g, 'Glass door', [W / 2, 0.08 + (H - 0.11) / 2, D / 2], 1);
  const dw = W, dh = H - 0.11;
  box(door, 'Door glass', M.glass, [dw - 0.08, dh - 0.08, 0.01], [-dw / 2, 0, 0.012], 0);
  frame(door, 'Door frame', M.steel, dw, dh, -dw / 2, 0, 0.0, 0.045, 0.03);
  handle(door, 'Door handle', [-dw + 0.06, 0, 0.03], 0.36, true);
  return g;
}

export function conveyorToaster() {
  const g = root('Conveyor toaster');
  const W = 0.42, D = 0.55, LH = 0.1;
  legs(g, W, D, LH, 0.04, 0.012);
  box(g, 'Base', M.steel, [W, 0.06, D], [0, LH + 0.03, 0], 0.006);
  box(g, 'Body', M.steel, [W, 0.28, D - 0.14], [0, LH + 0.2, -0.07], 0.01);
  const hood = box(g, 'Sloped hood', M.steel, [W, 0.02, 0.2], [0, LH + 0.3, D / 2 - 0.12], 0.006);
  hood.rotation.x = 0.45;
  box(g, 'Top', M.steel, [W, 0.02, D - 0.1], [0, LH + 0.35, -0.05], 0.006);
  box(g, 'Conveyor bed', M.black, [W - 0.06, 0.01, 0.2], [0, LH + 0.26, D / 2 - 0.08], 0);
  for (let i = 0; i < 9; i++) bar(g, 'Conveyor wire', M.chrome, [-W / 2 + 0.03, LH + 0.268, D / 2 - 0.17 + i * 0.022], [W / 2 - 0.03, LH + 0.268, D / 2 - 0.17 + i * 0.022], 0.003, 5);
  box(g, 'Control strip', M.black, [W - 0.04, 0.09, 0.01], [0, LH + 0.12, D / 2 - 0.06], 0.004);
  for (const x of [-0.08, 0.08]) bar(g, 'Knob', M.red, [x, LH + 0.12, D / 2 - 0.055], [x, LH + 0.12, D / 2 - 0.025], 0.022, 14);
  const tray = group(g, 'Collection tray', [0, LH - 0.02, D / 2 - 0.05]);
  tray.userData.actionProfile = { animationRole: 'drawer-slide' };
  box(tray, 'Tray', M.steel, [W - 0.05, 0.02, 0.22], [0, 0, 0.02], 0.004);
  box(tray, 'Tray lip', M.steel, [W - 0.05, 0.04, 0.01], [0, 0.015, 0.13], 0.003);
  return g;
}

export function extractorHood() {
  const g = root('Extractor hood');
  const S = 1.0;
  box(g, 'Canopy rim', M.steel, [S, 0.06, S], [0, 0.03, 0], 0.006);
  const pyr = flat(new THREE.CylinderGeometry(0.22 * Math.SQRT2, (S / 2) * Math.SQRT2, 0.14, 4, 1).rotateY(Math.PI / 4));
  mesh(g, 'Canopy', pyr, M.steelDark, [0, 0.13, 0]);
  box(g, 'Filter panel', M.steelDark, [S - 0.08, 0.004, S - 0.08], [0, 0.0, 0], 0);
  box(g, 'Chimney', M.steel, [0.36, 0.7, 0.36], [0, 0.2 + 0.35, 0], 0.006);
  box(g, 'Badge', M.black, [0.12, 0.012, 0.004], [0.3, 0.04, S / 2 + 0.002], 0);
  return g;
}

export function gasRange() {
  const g = root('Gas range');
  const W = 0.9, D = 0.8, LH = 0.12, H = 0.9;
  legs(g, W, D, LH, 0.06, 0.022);
  box(g, 'Body', M.steel, [W, H - LH - 0.06, D], [0, LH + (H - LH - 0.06) / 2, 0], 0.006);
  box(g, 'Top tray', M.steelDark, [W, 0.03, D - 0.06], [0, H - 0.045, 0.03], 0.004);
  box(g, 'Flue strip', M.steel, [W, 0.08, 0.06], [0, H, -D / 2 + 0.03], 0.006);
  for (let i = 0; i < 6; i++) box(g, 'Flue slot', M.black, [0.1, 0.012, 0.002], [-0.35 + i * 0.14, H + 0.02, -D / 2 + 0.061], 0);
  const gx = -W / 2 + 0.3, gw = 0.58, gd = D - 0.12;
  for (const [bx, bz] of [[-0.14, -0.17], [0.14, -0.17], [-0.14, 0.17], [0.14, 0.17]] as [number, number][]) {
    bar(g, 'Burner', M.black, [gx + bx, H - 0.03, 0.03 + bz], [gx + bx, H - 0.015, 0.03 + bz], 0.05, 16);
  }
  for (let i = 0; i < 5; i++) box(g, 'Grate bar', M.black, [0.016, 0.022, gd], [gx - gw / 2 + 0.01 + (i * (gw - 0.02)) / 4, H - 0.01, 0.03], 0.004);
  for (let i = 0; i < 4; i++) box(g, 'Grate bar', M.black, [gw, 0.022, 0.016], [gx, H - 0.01, 0.03 - gd / 2 + 0.01 + (i * (gd - 0.02)) / 3], 0.004);
  box(g, 'Griddle', M.steelDark, [0.28, 0.02, gd], [W / 2 - 0.16, H - 0.02, 0.03], 0.004);
  box(g, 'Griddle rim', M.steel, [0.3, 0.035, 0.015], [W / 2 - 0.16, H - 0.01, -D / 2 + 0.08], 0.004);
  const rail = box(g, 'Control rail', M.steel, [W, 0.1, 0.06], [0, H - 0.1, D / 2 + 0.01], 0.008);
  rail.rotation.x = -0.25;
  for (let i = 0; i < 6; i++) bar(g, 'Knob', M.black, [-0.36 + i * 0.144, H - 0.105, D / 2 + 0.04], [-0.36 + i * 0.144, H - 0.105, D / 2 + 0.075], 0.026, 14);
  const dh = H - LH - 0.22;
  const door = hinged(g, 'Oven door', [0, LH + 0.03, D / 2], 0);
  box(door, 'Door slab', M.steel, [W - 0.04, dh, 0.025], [0, dh / 2, 0.0125], 0.006);
  frame(door, 'Door frame', M.steel, W - 0.04, dh, 0, dh / 2, 0.025, 0.04);
  handle(door, 'Door handle', [0, dh - 0.07, 0.033], 0.6, false, 0.012);
  return g;
}

export function combiOven() {
  const g = root('Combi oven on stand');
  const W = 0.86, D = 0.8, SH = 0.72, OH = 0.78;
  legs(g, W, D, SH - 0.03, 0.03, 0.02);
  box(g, 'Stand top', M.steel, [W, 0.03, D], [0, SH - 0.015, 0], 0.004);
  box(g, 'Stand shelf', M.steel, [W - 0.04, 0.02, D - 0.04], [0, 0.15, 0], 0.004);
  for (const s of [-1, 1]) for (let i = 0; i < 6; i++) bar(g, 'Tray runner', M.chrome, [s * (W / 2 - 0.04), 0.25 + i * 0.07, -D / 2 + 0.05], [s * (W / 2 - 0.04), 0.25 + i * 0.07, D / 2 - 0.05], 0.005, 6);
  const y0 = SH, cy = y0 + OH / 2;
  box(g, 'Oven body', M.steel, [W, OH, D - 0.04], [0, cy, -0.02], 0.008);
  box(g, 'Vent', M.steel, [0.08, 0.06, 0.08], [W / 2 - 0.12, y0 + OH + 0.03, -0.2], 0.01);
  box(g, 'Oven interior', M.steelDark, [0.56, OH - 0.14, 0.01], [0.1, cy, D / 2 - 0.06], 0);
  for (let i = 0; i < 7; i++) box(g, 'Oven tray', M.chrome, [0.52, 0.006, 0.4], [0.1, y0 + 0.12 + i * 0.08, D / 2 - 0.27], 0);
  box(g, 'Control panel', M.black, [0.18, OH - 0.04, 0.01], [-W / 2 + 0.1, cy, D / 2 - 0.035], 0.004);
  box(g, 'Screen', M.screen, [0.12, 0.2, 0.004], [-W / 2 + 0.1, cy + 0.17, D / 2 - 0.028], 0.002);
  box(g, 'Brand label', M.red, [0.06, 0.02, 0.003], [-W / 2 + 0.1, cy + 0.32, D / 2 - 0.028], 0);
  bar(g, 'Dial', M.chrome, [-W / 2 + 0.1, cy - 0.06, D / 2 - 0.03], [-W / 2 + 0.1, cy - 0.06, D / 2 + 0.0], 0.035, 16);
  const dw = W - 0.2, dh = OH - 0.04;
  const door = hinged(g, 'Oven door', [W / 2, cy, D / 2 - 0.02], 1);
  box(door, 'Door glass', M.glass, [dw - 0.08, dh - 0.08, 0.012], [-dw / 2, 0, 0.01], 0);
  frame(door, 'Door frame', M.steel, dw, dh, -dw / 2, 0, 0, 0.045, 0.03);
  handle(door, 'Door handle', [-dw + 0.05, 0, 0.03], 0.3, true, 0.012);
  return g;
}

export function doubleOven() {
  const g = root('Double convection oven');
  const W = 0.95, D = 0.8, LH = 0.16, OH = 0.62;
  legs(g, W, D, LH, 0.05, 0.022);
  for (const [i, name] of [[0, 'Lower oven'], [1, 'Upper oven']] as [number, string][]) {
    const y0 = LH + i * OH, cy = y0 + OH / 2;
    box(g, `${name} body`, M.steel, [W, OH - 0.01, D], [0, cy, 0], 0.008);
    box(g, `${name} control strip`, M.black, [0.16, OH - 0.08, 0.01], [-W / 2 + 0.1, cy, D / 2 + 0.002], 0.004);
    box(g, `${name} display`, M.screen, [0.1, 0.08, 0.004], [-W / 2 + 0.1, cy + 0.17, D / 2 + 0.008], 0.002);
    for (const k of [0.03, -0.12]) bar(g, `${name} knob`, M.chrome, [-W / 2 + 0.1, cy + k, D / 2], [-W / 2 + 0.1, cy + k, D / 2 + 0.03], 0.028, 14);
    const dw = W - 0.22, dh = OH - 0.1;
    const door = hinged(g, `${name} door`, [-W / 2 + 0.03, cy, D / 2], -1);
    box(door, 'Door glass', M.smoked, [dw - 0.1, dh - 0.1, 0.012], [dw / 2, 0, 0.012], 0);
    frame(door, 'Door frame', M.steel, dw, dh, dw / 2, 0, 0, 0.05, 0.03);
    handle(door, 'Door handle', [dw - 0.05, 0, 0.03], 0.28, true, 0.011);
  }
  return g;
}

export function tallFridge() {
  const g = root('Tall fridge');
  const W = 0.8, D = 0.72, LH = 0.12, H = 2.05;
  legs(g, W, D, LH, 0.05, 0.022);
  box(g, 'Body', M.steel, [W, H - LH, D], [0, LH + (H - LH) / 2, 0], 0.008);
  box(g, 'Header band', M.steel, [W, 0.14, 0.02], [0, H - 0.07, D / 2 + 0.01], 0.004);
  bar(g, 'Thermometer', M.white, [0, H - 0.07, D / 2 + 0.02], [0, H - 0.07, D / 2 + 0.035], 0.04, 20);
  bar(g, 'Thermometer bezel', M.chrome, [0, H - 0.07, D / 2 + 0.018], [0, H - 0.07, D / 2 + 0.03], 0.046, 20);
  const dh = H - LH - 0.18, dw = W - 0.01;
  const door = hinged(g, 'Door', [-W / 2 + 0.005, LH + 0.02 + dh / 2, D / 2], -1);
  box(door, 'Door slab', M.steel, [dw, dh, 0.025], [dw / 2, 0, 0.0125], 0.006);
  frame(door, 'Door frame', M.steel, dw, dh, dw / 2, 0, 0.025, 0.045);
  handle(door, 'Door handle', [dw - 0.07, -0.02, 0.033], 0.22, true, 0.012);
  bar(door, 'Latch bar', M.chrome, [dw - 0.03, -0.02, 0.04], [dw - 0.14, -0.02, 0.07], 0.01, 8);
  return g;
}

export function espressoStation() {
  const g = root('Espresso station');
  const W = 0.9, H = 0.6, D = 0.6;
  box(g, 'Stand top', M.steel, [W, 0.03, D], [0, H - 0.015, 0], 0.006);
  for (const s of [-1, 1]) box(g, 'Stand side', M.steel, [0.025, H - 0.03, D], [s * (W / 2 - 0.0125), (H - 0.03) / 2, 0], 0.004);
  box(g, 'Stand back', M.steel, [W, H - 0.03, 0.02], [0, (H - 0.03) / 2, -D / 2 + 0.01], 0);
  box(g, 'Stand shelf', M.steel, [W - 0.05, 0.02, D - 0.02], [0, 0.06, 0], 0.004);
  const jars: V3[] = [[-0.25, 0.07, 0.05], [-0.1, 0.07, 0.05], [0.05, 0.07, 0.05]];
  many(g, 'Bean jar glass', new THREE.CylinderGeometry(0.055, 0.055, 0.2, 14).translate(0, 0.1, 0), M.glass, jars);
  many(g, 'Coffee beans', new THREE.CylinderGeometry(0.05, 0.05, 0.15, 12).translate(0, 0.076, 0), M.bean, jars);
  many(g, 'Jar lids', new THREE.CylinderGeometry(0.058, 0.058, 0.025, 14).translate(0, 0.21, 0), M.chrome, jars);
  bar(g, 'Utensil cup', M.steel, [0.25, 0.07, 0.1], [0.25, 0.19, 0.1], 0.04, 14);
  for (const [dx, dz] of [[-0.02, 0], [0.02, 0.02], [0.0, -0.02]]) bar(g, 'Wooden utensil', M.wood, [0.25, 0.1, 0.1], [0.25 + dx * 3, 0.36, 0.1 + dz * 3], 0.007, 6);
  // machine
  const m = group(g, 'Espresso machine', [0, H, -0.02]);
  box(m, 'Machine base', M.steel, [0.74, 0.08, 0.5], [0, 0.04, 0], 0.01);
  box(m, 'Machine body', M.chrome, [0.74, 0.3, 0.32], [0, 0.23, -0.09], 0.02);
  box(m, 'Front panel', M.steel, [0.62, 0.14, 0.01], [0, 0.29, 0.075], 0.004);
  box(m, 'Cup tray', M.steel, [0.7, 0.015, 0.3], [0, 0.39, -0.09], 0.004);
  for (const s of [-1, 1]) bar(m, 'Cup rail', M.chrome, [-0.35, 0.42, s * 0.14 - 0.09], [0.35, 0.42, s * 0.14 - 0.09], 0.006, 6);
  box(m, 'Drip tray', M.steelDark, [0.6, 0.025, 0.14], [0, 0.095, 0.17], 0.004);
  for (const x of [-0.16, 0.16]) {
    bar(m, 'Group head', M.chrome, [x, 0.2, 0.1], [x, 0.16, 0.1], 0.045, 16);
    bar(m, 'Portafilter', M.chrome, [x, 0.16, 0.1], [x, 0.135, 0.1], 0.04, 16);
    bar(m, 'Portafilter handle', M.black, [x, 0.145, 0.12], [x, 0.135, 0.26], 0.014, 8);
    for (const k of [-0.05, 0.05]) bar(m, 'Button', M.black, [x + k, 0.3, 0.08], [x + k, 0.3, 0.09], 0.012, 10);
  }
  bar(m, 'Steam wand', M.chrome, [0.32, 0.2, 0.06], [0.33, 0.06, 0.12], 0.007, 8);
  bar(m, 'Pressure gauge', M.white, [0, 0.32, 0.075], [0, 0.32, 0.085], 0.035, 18);
  return g;
}

export function tripleSink() {
  const g = root('Triple sink');
  const BW = 0.55, N = 3, WALL = 0.02, W = N * BW + 0.14, D = 0.68, H = 0.9, DEEP = 0.33;
  const x0 = -W / 2 + 0.07;
  // basins: walls, floors and drains
  box(g, 'Front apron', M.steel, [W, DEEP + 0.03, WALL], [0, H - (DEEP + 0.03) / 2, D / 2 - WALL / 2], 0.005);
  box(g, 'Back wall', M.steel, [W, DEEP + 0.03, WALL], [0, H - (DEEP + 0.03) / 2, -D / 2 + 0.12], 0.005);
  for (let i = 0; i <= N; i++) {
    const x = x0 + i * BW;
    box(g, i === 0 || i === N ? 'End wall' : 'Divider', M.steel, [i === 0 || i === N ? WALL : 0.04, DEEP + 0.03, D - 0.12], [x, H - (DEEP + 0.03) / 2, 0.06], 0.005);
  }
  for (let i = 0; i < N; i++) {
    const cx = x0 + BW * (i + 0.5);
    box(g, 'Basin floor', M.steelDark, [BW - 0.03, WALL, D - 0.14], [cx, H - DEEP, 0.06], 0.004);
    bar(g, 'Drain', M.chrome, [cx, H - DEEP + 0.008, 0.06], [cx, H - DEEP + 0.014, 0.06], 0.035, 16);
  }
  box(g, 'Side ledge west', M.steel, [0.07, 0.03, D], [-W / 2 + 0.035, H, 0], 0.005);
  box(g, 'Side ledge east', M.steel, [0.07, 0.03, D], [W / 2 - 0.035, H, 0], 0.005);
  box(g, 'Back ledge', M.steel, [W, 0.03, 0.1], [0, H, -D / 2 + 0.05], 0.005);
  box(g, 'Front rim', M.steel, [W, 0.035, 0.03], [0, H, D / 2 - 0.015], 0.008);
  box(g, 'Backsplash', M.steel, [W, 0.26, 0.02], [0, H + 0.13, -D / 2 + 0.01], 0.005);
  box(g, 'Backsplash cap', M.steel, [W, 0.02, 0.06], [0, H + 0.26, -D / 2 + 0.02], 0.005);
  // frame
  const legX = [-W / 2 + 0.05, 0, W / 2 - 0.05], legZ = [-D / 2 + 0.08, D / 2 - 0.08];
  for (const x of legX) for (const z of legZ) {
    bar(g, 'Leg', M.chrome, [x, 0.03, z], [x, H - DEEP, z], 0.02, 10);
    bar(g, 'Foot', M.steelDark, [x, 0, z], [x, 0.03, z], 0.028, 10);
  }
  for (const z of legZ) bar(g, 'Long crossbar', M.chrome, [-W / 2 + 0.05, 0.2, z], [W / 2 - 0.05, 0.2, z], 0.014, 8);
  for (const x of legX) bar(g, 'Short crossbar', M.chrome, [x, 0.2, legZ[0]], [x, 0.2, legZ[1]], 0.014, 8);
  // pre-rinse faucet on the back ledge, middle basin
  const fx = 0.05, fz = -D / 2 + 0.06, top = H + 0.95;
  bar(g, 'Faucet riser', M.chrome, [fx, H + 0.02, fz], [fx, top, fz], 0.016, 12);
  bar(g, 'Faucet mixer', M.chrome, [fx - 0.12, H + 0.3, fz + 0.04], [fx + 0.12, H + 0.3, fz + 0.04], 0.02, 12);
  bar(g, 'Mixer valve', M.chrome, [fx, H + 0.25, fz], [fx, H + 0.3, fz + 0.04], 0.014, 10);
  for (const s of [-1, 1]) bar(g, 'Valve handle', M.chrome, [fx + s * 0.12, H + 0.3, fz + 0.04], [fx + s * 0.12, H + 0.38, fz + 0.06], 0.008, 8);
  bar(g, 'Wall bracket', M.chrome, [fx, top - 0.15, fz], [fx, top - 0.15, -D / 2 - 0.0], 0.01, 8);
  const coil = new THREE.CatmullRomCurve3(Array.from({ length: 64 }, (_, i) => {
    const t = i / 63, a = t * Math.PI * 2 * 14;
    return new THREE.Vector3(fx + 0.15 + Math.cos(a) * 0.028, top - 0.06 - t * 0.5, fz + 0.12 + Math.sin(a) * 0.028);
  }));
  mesh(g, 'Spring', new THREE.TubeGeometry(coil, 260, 0.004, 5), M.chrome);
  bar(g, 'Hose arm', M.chrome, [fx, top, fz], [fx + 0.15, top - 0.03, fz + 0.12], 0.012, 10);
  bar(g, 'Spray head', M.chrome, [fx + 0.15, top - 0.56, fz + 0.12], [fx + 0.15, top - 0.68, fz + 0.12], 0.025, 12, 0.015);
  box(g, 'Spray trigger', M.black, [0.02, 0.06, 0.03], [fx + 0.15, top - 0.6, fz + 0.15], 0.006);
  // floor drain grate in front of the west end
  const grate = group(g, 'Floor drain', [-W / 2 + 0.35, 0, D / 2 + 0.25]);
  box(grate, 'Drain frame', M.steelDark, [0.32, 0.012, 0.22], [0, 0.006, 0], 0.003);
  for (let i = 0; i < 7; i++) box(grate, 'Drain slot', M.black, [0.03, 0.004, 0.18], [-0.12 + i * 0.04, 0.012, 0], 0);
  return g;
}

export function tallGlassFridge() {
  const g = root('Tall glass fridge');
  const W = 1.24, D = 0.8, H = 2.0, BASE = 0.22;
  box(g, 'Top', M.steel, [W + 0.02, 0.05, D + 0.02], [0, H - 0.025, 0], 0.008);
  box(g, 'Base', M.steel, [W, BASE, D], [0, BASE / 2, 0], 0.006);
  for (const s of [-1, 1]) box(g, 'Side', M.steel, [0.04, H - BASE - 0.05, D], [s * (W / 2 - 0.02), BASE + (H - BASE - 0.05) / 2, 0], 0.004);
  box(g, 'Back', M.steelDark, [W, H - BASE - 0.05, 0.03], [0, BASE + (H - BASE - 0.05) / 2, -D / 2 + 0.015], 0);
  for (let i = 0; i < 4; i++) box(g, 'Grille slat', M.black, [0.42, 0.018, 0.01], [0.3, 0.06 + i * 0.035, D / 2 + 0.002], 0);
  for (let i = 0; i < 4; i++) {
    const y = BASE + 0.32 + i * 0.36;
    box(g, 'Shelf rail', M.chrome, [W - 0.1, 0.012, 0.012], [0, y, D / 2 - 0.08], 0);
    for (let k = 0; k < 10; k++) bar(g, 'Shelf wire', M.chrome, [-W / 2 + 0.08 + k * 0.12, y, D / 2 - 0.08], [-W / 2 + 0.08 + k * 0.12, y, -D / 2 + 0.06], 0.004, 5);
  }
  const dh = H - BASE - 0.07, dw = W / 2 - 0.01, cy = BASE + 0.01 + dh / 2;
  for (const side of [-1, 1] as const) {
    const door = hinged(g, side < 0 ? 'Door west' : 'Door east', [side * (W / 2 - 0.005), cy, D / 2], side);
    const cx = -side * dw / 2;
    box(door, 'Door glass', M.glass, [dw - 0.08, dh - 0.1, 0.01], [cx, 0, 0.012], 0);
    frame(door, 'Door frame', M.steel, dw, dh, cx, 0, 0, 0.045, 0.03);
    handle(door, 'Door handle', [-side * (dw - 0.05), 0, 0.03], 0.5, true, 0.012);
  }
  return g;
}

/**
 * The pass: one continuous counter (length in metres) between the kitchen and the dining room. Doors and
 * drawers face the cooks (+Z); the dining side gets a finished panelled front, since that is the side the
 * camera sees, and the worktop is one piece so the ready dishes sit on a single shelf.
 */
export function passCounter(length = 8.6) {
  const g = root('Pass counter');
  const H = 0.86, D = 0.7, n = Math.round(length / 0.8), u = length / n;
  carcass(g, length, H, D);
  const dh = H - 0.035 - 0.09 - 0.02, dy = 0.09 + 0.01 + dh / 2;
  for (let i = 0; i < n; i++) {
    const x = -length / 2 + u * (i + 0.5);
    if (i % 3 === 1) {
      const fh = (dh - 0.01) / 2;
      panelDrawer(g, 'Drawer', u - 0.01, fh, dy + fh / 2 + 0.005, D / 2, D - 0.1);
      panelDrawer(g, 'Drawer', u - 0.01, fh, dy - fh / 2 - 0.005, D / 2, D - 0.1);
    } else {
      panelDoor(g, 'Door west', u / 2 - 0.004, dh, [x - u / 2 + 0.002, dy, D / 2], -1);
      panelDoor(g, 'Door east', u / 2 - 0.004, dh, [x + u / 2 - 0.002, dy, D / 2], 1);
    }
    frame(g, 'Dining-side panel', M.steel, u - 0.02, dh, x, dy, -D / 2 - 0.008, 0.04, 0.008);
  }
  box(g, 'Dining-side kick', M.steelDark, [length, 0.09, 0.01], [0, 0.045, -D / 2 + 0.035], 0);
  return g;
}

export const MODELS: Record<string, () => THREE.Group> = {
  'base-cabinet-2door': baseCabinet2Door,
  'base-cabinet-2drawer': baseCabinet2Drawer,
  'prep-cabinet': prepCabinet,
  'bin-drawer-cabinet': binDrawerCabinet,
  'bin-station': binStation,
  'cleaning-cabinet': cleaningCabinet,
  'jar-shelf': jarShelf,
  'wine-cooler': wineCooler,
  'conveyor-toaster': conveyorToaster,
  'extractor-hood': extractorHood,
  'gas-range': gasRange,
  'combi-oven': combiOven,
  'double-oven': doubleOven,
  'tall-fridge': tallFridge,
  'espresso-station': espressoStation,
  'triple-sink': tripleSink,
  'tall-glass-fridge': tallGlassFridge,
  'pass-counter': passCounter,
};
