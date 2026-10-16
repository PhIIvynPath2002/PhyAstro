import { Store } from './core/data/State';
import { CelestialScene } from './rendering/Scene';
import { AppUI } from './ui/AppUI';
import './style.css';
import { solarLunarPositions } from './core/astronomy/Ephemeris';
import { astronomicalTime } from './core/astronomy/Time';

const app = document.querySelector<HTMLElement>('#app')!;
app.innerHTML = '<div id="scene-input"><main id="universe" aria-label="PhyAstro 天球坐标仪"></main><div id="labels"></div></div><div id="interface"></div><div id="render-error" role="alert" hidden></div>';
const surface = app.querySelector<HTMLElement>('#universe')!;
const failure = app.querySelector<HTMLElement>('#render-error')!;
function renderError(message: string): void {
  failure.hidden = false;
  failure.textContent = message;
}
surface.addEventListener('render-error', event => renderError((event as CustomEvent<string>).detail));

try {
  const store = new Store();
  const scene = new CelestialScene(surface, app.querySelector('#labels')!, store);
  const ui = new AppUI(app.querySelector('#interface')!, store, scene);
  // Read-only diagnostics support browser checks without coupling the astronomy core to UI.
  if (import.meta.env.DEV) {
    Object.defineProperty(window, '__phyastro', { configurable: true, get: () => ({
      observer: { ...store.state.observer },
      instant: store.state.instant.toISOString(),
      view: store.state.view,
      showBelowHorizon: store.state.showBelowHorizon,
      fov: scene.camera.fov,
      bodies: solarLunarPositions(astronomicalTime(store.state.instant), store.state.observer),
      references: scene.referenceDiagnostics,
      camera: scene.camera.position.toArray(),
      cameraUp: scene.camera.up.toArray(),
      cameraQuaternion: scene.camera.quaternion.toArray(),
      interacting: scene.controller.isInteracting,
      layers: { ...store.state.layers },
      selected: store.state.selected,
      probe: store.state.probe && { ...store.state.probe },
      drawCalls: scene.renderer.info.render.calls,
    }) });
  }
  import.meta.hot?.dispose(() => { ui.dispose(); scene.dispose(); });
} catch (error) {
  console.error(error);
  renderError('无法建立三维视图。请启用浏览器硬件加速，或使用支持 WebGL 2 的浏览器。');
}
