interface Term { name: string; english: string }
const terms: Record<string, Term> = {
  RA: { name: '赤经', english: 'Right Ascension' },
  Dec: { name: '赤纬', english: 'Declination' },
  Az: { name: '方位角', english: 'Azimuth' },
  Alt: { name: '高度角', english: 'Altitude' },
  Lat: { name: '纬度', english: 'Latitude' },
  Lon: { name: '经度', english: 'Longitude' },
  'λ': { name: '黄经', english: 'Ecliptic Longitude' },
  'β': { name: '黄纬', english: 'Ecliptic Latitude' },
  'ε': { name: '黄赤交角', english: 'Obliquity of the Ecliptic' },
  UTC: { name: '协调世界时', english: 'Coordinated Universal Time' },
  LST: { name: '地方恒星时', english: 'Local Sidereal Time' },
  JD: { name: '儒略日', english: 'Julian Date' },
};
let anchor: HTMLElement | null = null;
let popup: HTMLElement | null = null;

export function showTerm(element: HTMLElement, term: Term): void {
  hideTerm();
  anchor = element;
  popup = document.createElement('div');
  popup.className = 'term-popover';
  popup.id = 'term-definition';
  popup.setAttribute('role', 'tooltip');
  popup.textContent = term.name;
  const english = document.createElement('span');
  english.textContent = term.english;
  popup.append(english);
  document.body.append(popup);
  element.setAttribute('aria-describedby', popup.id);
  const bounds = element.getBoundingClientRect();
  popup.style.left = `${Math.max(12, Math.min(innerWidth - popup.offsetWidth - 12, bounds.left))}px`;
  popup.style.top = `${Math.max(12, Math.min(innerHeight - popup.offsetHeight - 12, bounds.bottom + 8))}px`;
}

export function hideTerm(): void {
  anchor?.removeAttribute('aria-describedby');
  anchor = null;
  popup?.remove();
  popup = null;
}

export function terminology(root: HTMLElement): () => void {
  const doubleClick = (event: MouseEvent) => {
    const element = (event.target as Element).closest<HTMLElement>('[data-term-cn], [data-term]');
    if (!element) return;
    const term = element.dataset.termCn ? { name: element.dataset.termCn, english: element.dataset.termEn! } : terms[element.dataset.term!];
    if (term) showTerm(element, term);
  };
  const move = (event: PointerEvent) => {
    if (!anchor) return;
    const box = anchor.getBoundingClientRect();
    if (!anchor.isConnected || event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) hideTerm();
  };
  root.addEventListener('dblclick', doubleClick);
  document.addEventListener('pointermove', move);
  document.addEventListener('wheel', hideTerm, { passive: true });
  document.addEventListener('scroll', hideTerm, true);
  window.addEventListener('blur', hideTerm);
  return () => {
    hideTerm();
    root.removeEventListener('dblclick', doubleClick);
    document.removeEventListener('pointermove', move);
    document.removeEventListener('wheel', hideTerm);
    document.removeEventListener('scroll', hideTerm, true);
    window.removeEventListener('blur', hideTerm);
  };
}

export function termKey(label: string): string {
  const abbreviation = label.split(' · ').at(-1)!;
  return terms[abbreviation] ? abbreviation : '';
}
