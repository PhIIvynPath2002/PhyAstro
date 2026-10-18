import { Store } from './core/data/State';
import { CelestialScene } from './rendering/Scene';
import { AppUI } from './ui/AppUI';
import './style.css';
import { solarLunarPositions } from './core/astronomy/Ephemeris';
import { astronomicalTime } from './core/astronomy/Time';
import { SystemStore } from './core/system/Store';
import { SystemScene } from './rendering/system/SystemScene';
import { SystemUI } from './ui/SystemUI';
import './system.css';
import { viewNavigation } from './ui/ViewNavigation';
import type { CameraState } from './interaction/CameraController';

const app = document.querySelector<HTMLElement>('#app')!;
const coordinateStore = new Store();
const systemStore = new SystemStore();
let disposeCurrent = () => {};
let diagnostics: () => unknown = () => ({});
let spaceView: ReturnType<SystemScene['saveView']> | undefined;
let coordinateView: CameraState | undefined;

function launch(mode: 'space' | 'coordinates', synchronize = true): void {
  disposeCurrent();
  app.className = mode === 'space' ? 'space-app' : '';
  app.replaceChildren();
  const failure = document.createElement('div');
  failure.id = 'render-error';
  failure.setAttribute('role', 'alert');
  failure.hidden = true;
  try {
    if (mode === 'space') {
      if (synchronize) systemStore.update({ instant: coordinateStore.state.instant });
      const surface = document.createElement('main');
      surface.id = 'space-stage';
      const uiRoot = document.createElement('div');
      uiRoot.id = 'system-interface';
      app.append(surface, uiRoot, failure);
      surface.addEventListener('render-error', event => { failure.hidden = false; failure.textContent = (event as CustomEvent<string>).detail; });
      const scene = new SystemScene(surface, systemStore, coordinateStore);
      const ui = new SystemUI(uiRoot, systemStore, scene);
      viewNavigation(uiRoot, mode, launch);
      if (spaceView) scene.restoreView(spaceView);
      diagnostics = () => scene.diagnostics;
      disposeCurrent = () => { spaceView = scene.saveView(); ui.dispose(); scene.dispose(); };
      return;
    }
    if (synchronize) coordinateStore.update({ instant: new Date(systemStore.state.snapshot.utc) });
    app.innerHTML = '<div id="scene-input"><main id="universe" aria-label="PhyAstro 天球坐标仪"></main><div id="labels"></div></div><div id="interface"></div>';
    app.append(failure);
    const surface = app.querySelector<HTMLElement>('#universe')!;
    surface.addEventListener('render-error', event => { failure.hidden = false; failure.textContent = (event as CustomEvent<string>).detail; });
    const store = coordinateStore;
    const scene = new CelestialScene(surface, app.querySelector('#labels')!, store);
    const ui = new AppUI(app.querySelector('#interface')!, store, scene);
    app.querySelector('.version')!.textContent = '0.3.0';
    viewNavigation(app.querySelector('#interface')!, mode, launch);
    if (coordinateView) scene.controller.restore(coordinateView);
    diagnostics = () => ({ mode: 'coordinates',
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
    });
    disposeCurrent = () => { coordinateView = scene.controller.save(); ui.dispose(); scene.dispose(); };
  } catch (error) {
    console.error(error);
    if (!failure.isConnected) app.append(failure);
    failure.hidden = false;
    failure.textContent = '无法建立三维视图。请启用浏览器硬件加速，或使用支持 WebGL 2 的浏览器。';
  }
}
if (import.meta.env.DEV) Object.defineProperty(window, '__phyastro', { configurable: true, get: () => diagnostics() });
launch(new URLSearchParams(location.search).get('view') === 'coordinates' ? 'coordinates' : 'space', false);
import.meta.hot?.dispose(() => disposeCurrent());
