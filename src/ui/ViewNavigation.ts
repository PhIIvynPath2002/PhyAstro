export function viewNavigation(root: HTMLElement, active: 'space' | 'coordinates', change: (mode: 'space' | 'coordinates') => void): void {
  const nav = document.createElement('nav');
  nav.className = 'primary-navigation';
  nav.setAttribute('aria-label', '主视图');
  for (const [mode, name, english] of [
    ['coordinates', '天球坐标仪', 'Celestial Instrument'],
    ['space', '宇宙空间观测', 'Space Observation'],
  ] as const) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', mode === 'space' && active === 'coordinates' ? '返回空间系统' : name);
    button.setAttribute('aria-pressed', String(mode === active));
    button.innerHTML = `<span>${name}</span><small>${english}</small>`;
    button.addEventListener('click', () => { if (mode !== active) change(mode); });
    nav.append(button);
  }
  root.append(nav);
}
