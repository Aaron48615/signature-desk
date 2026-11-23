const paths: Record<string, string> = {
  globe: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z M2 12h20 M12 2c6 5 6 15 0 20-6-5-6-15 0-20z',
  pen: 'm4 20 4.5-1 12-12-3.5-3.5-12 12z M14 6.5l3.5 3.5',
  pad: 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z M6 15h12',
  undo: 'm8 5-5 5 5 5 M4 10h10a6 6 0 0 1 6 6v2',
  redo: 'm16 5 5 5-5 5 M20 10H10a6 6 0 0 0-6 6v2',
  trash: 'M4 6h16 M9 6V3h6v3 M6 6l1 15h10l1-15 M10 9v8 M14 9v8',
  image: 'M4 3h16v18H4z M5 17l5-5 3 3 3-4 4 5 M8 8h.1',
  download: 'M12 3v12 m-5-5 5 5 5-5 M4 16v5h16v-5',
  corners: 'M3 9V4h5 M16 4h5v5 M21 15v5h-5 M8 20H3v-5',
  ruler: 'm3 15 12-12 6 6L9 21z M12 6l3 3 M9 9l2 2 M6 12l3 3',
  sliders: 'M3 7h7m4 0h7 M3 17h3m4 0h11 M10 4h4v6h-4z M6 14h4v6H6z',
  crop: 'M6 3v15h15 M3 6h15v15',
  link: 'm9 14 6-6 M8 16l-1 1a3.5 3.5 0 0 1-5-5l5-5a3.5 3.5 0 0 1 5 0 M16 8l1-1a3.5 3.5 0 0 1 5 5l-5 5a3.5 3.5 0 0 1-5 0',
};
export function icons() {
  document.querySelectorAll<HTMLElement>('i[data-icon]').forEach((el) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(svg.namespaceURI, 'path');
    Object.entries({
      d: paths[el.dataset.icon!],
      stroke: 'currentColor',
      fill: 'none',
      'stroke-width': '1.65',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    }).forEach(([k, v]) => path.setAttribute(k, v));
    svg.append(path);
    el.append(svg);
  });
}
