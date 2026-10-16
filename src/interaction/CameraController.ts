import * as THREE from 'three';
import { TrackballControls } from 'three/addons/controls/TrackballControls.js';
import { SPHERE_RADIUS } from '../celestial/CelestialSphere';
import type { ViewMode } from '../core/data/State';

const WHEEL_ROTATION = 0.003;
const WHEEL_ZOOM = 0.002;
const RESPONSE_SECONDS = 0.045;
interface Tap { id: number; x: number; y: number; target: EventTarget | null }
export interface OrbitLimits {
  referenceRadius?: () => number;
  minimumDistance?: () => number;
  maximumDistance?: () => number;
}

export class CameraController {
  controls: TrackballControls;
  onTap?: (event: PointerEvent, target: EventTarget | null) => void;
  private homeDirection = new THREE.Vector3(0.9, 0.55, 1).normalize();
  private homeDistance = 11;
  private pitch = 0;
  private yaw = 0;
  private logZoom = 0;
  private lastFrame = performance.now();
  private pointers = new Set<number>();
  private tap: Tap | null = null;
  private pinchDistance = 0;
  private eye = new THREE.Vector3();
  private axis = new THREE.Vector3();
  private rotation = new THREE.Quaternion();
  private groundUp = new THREE.Vector3(0, 1, 0);
  private dragPoint: { id: number; x: number; y: number } | null = null;
  private mode: ViewMode = 'orbit';
  private skyCamera = new THREE.PerspectiveCamera();
  private orbitPosition = new THREE.Vector3();
  private orbitUp = new THREE.Vector3();
  private skyFov = 80;
  private skyInitialized = false;
  private get navigationCamera(): THREE.PerspectiveCamera { return this.mode === 'observer' ? this.skyCamera : this.camera; }

  setView(mode: ViewMode): void {
    if (mode === this.mode) return;
    this.interrupt();
    this.controls.dispose();
    if (this.mode === 'orbit') {
      this.orbitPosition.copy(this.camera.position);
      this.orbitUp.copy(this.camera.up);
    } else this.skyFov = this.camera.fov;
    this.mode = mode;
    this.camera.fov = mode === 'observer' ? this.skyFov : 42;
    if (mode === 'orbit') {
      this.camera.position.copy(this.orbitPosition);
      this.camera.up.copy(this.orbitUp);
      this.camera.lookAt(0, 0, 0);
    } else if (!this.skyInitialized) {
      this.skyCamera.position.set(0, -Math.sin(Math.PI / 12), Math.cos(Math.PI / 12));
      this.skyCamera.lookAt(0, 0, 0);
      this.skyCamera.up.set(0, 1, 0).applyQuaternion(this.skyCamera.quaternion);
      this.skyInitialized = true;
    }
    this.controls = this.createControls();
    this.camera.updateProjectionMatrix();
    this.syncObserver();
  }

  private syncObserver(): void {
    if (this.mode !== 'observer') return;
    this.camera.position.set(0, 0, 0);
    this.camera.quaternion.copy(this.skyCamera.quaternion);
    this.camera.up.copy(this.skyCamera.up);
    this.camera.updateMatrixWorld();
  }

  constructor(readonly camera: THREE.PerspectiveCamera, private surface: HTMLElement, private limits: OrbitLimits = {}) {
    // Observe the original target before TrackballControls captures the pointer.
    surface.addEventListener('pointerdown', this.onPointerDown, true);
    surface.addEventListener('pointermove', this.onPointerMove, true);
    surface.addEventListener('pointerup', this.onPointerUp, true);
    surface.addEventListener('pointercancel', this.onPointerCancel, true);
    surface.addEventListener('lostpointercapture', this.onLostCapture);
    this.controls = this.createControls();
    surface.addEventListener('wheel', this.onWheel, { passive: false });
    surface.addEventListener('keydown', this.onKey);
    surface.addEventListener('touchstart', this.onTouchStart, { passive: true });
    surface.addEventListener('touchmove', this.onTouchMove, { passive: false });
    surface.addEventListener('touchend', this.onTouchEnd);
    surface.addEventListener('touchcancel', this.onTouchEnd);
    window.addEventListener('blur', this.onBlur);
  }

  private createControls(): TrackballControls {
    const controls = new TrackballControls(this.navigationCamera, this.surface);
    controls.noPan = true;
    controls.noZoom = true;
    controls.noRotate = this.mode === 'observer';
    controls.staticMoving = true;
    controls.rotateSpeed = this.mode === 'observer' ? -1.3 : 1.3;
    controls.keys = ['', '', ''];
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: null, RIGHT: null };
    return controls;
  }

  get isInteracting(): boolean {
    return this.pointers.size > 0 || Math.abs(this.pitch) + Math.abs(this.yaw) + Math.abs(this.logZoom) > 0;
  }

  private onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.surface.clientHeight : 1;
    const x = event.deltaX * unit;
    const y = event.deltaY * unit;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    // Pixel deltas include fractional trackpad movement; never round or discard them.
    if (event.ctrlKey || event.metaKey) this.logZoom += (y || x) * WHEEL_ZOOM;
    else if (event.shiftKey) this.yaw += (y || x) * WHEEL_ROTATION;
    else {
      this.pitch += y * WHEEL_ROTATION;
      this.yaw += x * WHEEL_ROTATION;
    }
  };

  update(now = performance.now()): void {
    const camera = this.navigationCamera;
    this.controls.update();
    const dt = Math.max(0, Math.min(0.1, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    const blend = 1 - Math.exp(-dt / RESPONSE_SECONDS);
    const step = (remaining: number) => Math.abs(remaining) < 0.00001 ? remaining : remaining * blend;
    const pitch = step(this.pitch);
    const yaw = step(this.yaw);
    const zoom = step(this.logZoom);
    this.pitch -= pitch;
    this.yaw -= yaw;
    this.logZoom -= zoom;
    // Rotate the eye and its up vector together. There is no fixed world-up pole.
    this.eye.subVectors(camera.position, this.controls.target);
    if (pitch) {
      this.axis.crossVectors(camera.up, this.eye).normalize();
      this.rotation.setFromAxisAngle(this.axis, pitch * (this.mode === 'observer' ? -1 : 1));
      this.eye.applyQuaternion(this.rotation);
      camera.up.applyQuaternion(this.rotation).normalize();
    }
    if (yaw) {
      this.rotation.setFromAxisAngle(this.mode === 'observer' ? this.groundUp : camera.up, yaw * (this.mode === 'observer' ? -1 : 1));
      this.eye.applyQuaternion(this.rotation);
      if (this.mode === 'observer') camera.up.applyQuaternion(this.rotation).normalize();
    }
    camera.position.copy(this.controls.target).add(this.eye);
    if (zoom) {
      this.zoom(Math.exp(THREE.MathUtils.clamp(zoom, -20, 20)));
      // Do not accumulate an invisible zoom backlog at a distance limit.
      const distance = camera.position.distanceTo(this.controls.target);
      if (this.mode === 'observer' ? zoom < 0 && this.camera.fov <= 20 || zoom > 0 && this.camera.fov >= 110
        : zoom < 0 && distance <= this.minimumDistance || zoom > 0 && distance >= this.maximumDistance) this.logZoom = 0;
    }
    camera.lookAt(this.controls.target);
    camera.updateMatrixWorld();
    this.syncObserver();
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType !== 'touch' && event.button !== 0) return;
    this.pointers.add(event.pointerId);
    if (event.pointerType !== 'touch') this.surface.classList.add('is-dragging');
    if (this.pointers.size === 1) {
      this.clearWheel();
      this.tap = { id: event.pointerId, x: event.clientX, y: event.clientY, target: event.target };
      if (this.mode === 'observer') this.dragPoint = { id: event.pointerId, x: event.clientX, y: event.clientY };
    } else { this.tap = null; this.dragPoint = null; }
  };
  private onPointerMove = (event: PointerEvent): void => {
    if (this.tap?.id === event.pointerId && Math.hypot(event.clientX - this.tap.x, event.clientY - this.tap.y) > 5) this.tap = null;
    if (this.dragPoint?.id === event.pointerId) {
      this.yaw -= (event.clientX - this.dragPoint.x) * 0.004;
      this.pitch -= (event.clientY - this.dragPoint.y) * 0.004;
      this.dragPoint = { id: event.pointerId, x: event.clientX, y: event.clientY };
    }
  };
  private onPointerUp = (event: PointerEvent): void => {
    const tap = this.tap;
    this.pointers.delete(event.pointerId);
    if (this.pointers.size === 0) this.surface.classList.remove('is-dragging');
    this.tap = null;
    this.dragPoint = null;
    if (tap?.id === event.pointerId && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) <= 5)
      this.onTap?.(event, tap.target);
  };
  private onPointerCancel = (): void => { this.interrupt(); };
  private onLostCapture = (event: PointerEvent): void => {
    if (this.pointers.has(event.pointerId)) this.interrupt();
  };

  private onTouchStart = (event: TouchEvent): void => {
    this.pinchDistance = event.touches.length === 2 ? this.touchDistance(event) : 0;
  };
  private onTouchMove = (event: TouchEvent): void => {
    if (event.touches.length !== 2) return;
    event.preventDefault();
    const distance = this.touchDistance(event);
    if (this.pinchDistance > 0 && distance > 0) this.zoom(this.pinchDistance / distance);
    this.pinchDistance = distance;
  };
  private onTouchEnd = (event: TouchEvent): void => {
    if (event.touches.length !== 2) this.pinchDistance = 0;
  };
  private touchDistance(event: TouchEvent): number {
    return Math.hypot(event.touches[0].clientX - event.touches[1].clientX, event.touches[0].clientY - event.touches[1].clientY);
  }

  private onKey = (event: KeyboardEvent): void => {
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-0.1, 0], ArrowRight: [0.1, 0], ArrowUp: [0, -0.1], ArrowDown: [0, 0.1],
    };
    if (delta[event.key]) {
      event.preventDefault();
      this.yaw += delta[event.key][0];
      this.pitch += delta[event.key][1];
    } else if (event.key === '+' || event.key === '=') this.zoom(0.9);
    else if (event.key === '-') this.zoom(1.1);
    else if (event.key.toLowerCase() === 'r') this.reset();
  };

  private clearWheel(): void {
    this.pitch = this.yaw = this.logZoom = 0;
  }

  private onBlur = (): void => { this.interrupt(); };

  private interrupt(): void {
    this.clearWheel();
    const pointers = [...this.pointers];
    this.pointers.clear();
    this.surface.classList.remove('is-dragging');
    this.dragPoint = null;
    this.tap = null;
    this.pinchDistance = 0;
    // Reconnect through public APIs to clear gestures interrupted outside the window.
    this.controls.dispose();
    for (const pointerId of pointers) if (this.surface.hasPointerCapture(pointerId)) this.surface.releasePointerCapture(pointerId);
    this.controls = this.createControls();
  }

  setHome(direction: THREE.Vector3): void {
    this.homeDirection.copy(direction).normalize();
    this.resize(true);
  }

  resize(reset = false): void {
    const previous = this.homeDistance;
    const halfFov = THREE.MathUtils.degToRad(42 / 2);
    const limitingFov = Math.atan(Math.tan(halfFov) * Math.min(1, this.camera.aspect));
    this.homeDistance = (this.limits.referenceRadius?.() ?? SPHERE_RADIUS) / Math.sin(limitingFov) * 1.23;
    this.controls.handleResize();
    if (reset) this.reset();
    else (this.mode === 'observer' ? this.orbitPosition : this.camera.position).multiplyScalar(this.homeDistance / previous);
  }

  private get minimumDistance(): number { return this.limits.minimumDistance?.() ?? SPHERE_RADIUS * 1.35; }
  private get maximumDistance(): number { return this.limits.maximumDistance?.() ?? this.homeDistance * 2.4; }

  zoom(factor: number): void {
    if (this.mode === 'observer') {
      this.camera.fov = THREE.MathUtils.clamp(this.camera.fov * factor, 20, 110);
      this.camera.updateProjectionMatrix();
      return;
    }
    this.eye.subVectors(this.camera.position, this.controls.target);
    this.eye.setLength(THREE.MathUtils.clamp(this.eye.length() * factor, this.minimumDistance, this.maximumDistance));
    this.camera.position.copy(this.controls.target).add(this.eye);
  }

  reset(): void {
    this.clearWheel();
    if (this.mode === 'observer') {
      this.skyCamera.position.set(0, -Math.sin(Math.PI / 12), Math.cos(Math.PI / 12));
      this.skyCamera.up.set(0, 1, 0);
      this.skyCamera.lookAt(0, 0, 0);
      this.skyCamera.up.set(0, 1, 0).applyQuaternion(this.skyCamera.quaternion);
      this.camera.fov = 80;
      this.camera.updateProjectionMatrix();
      this.interrupt();
      this.syncObserver();
      return;
    }
    this.controls.update();
    this.controls.target.set(0, 0, 0);
    this.camera.position.copy(this.homeDirection).multiplyScalar(this.homeDistance);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.controls.target);
    this.camera.up.set(0, 1, 0).applyQuaternion(this.camera.quaternion).normalize();
    this.camera.updateMatrixWorld();
  }

  dispose(): void {
    this.surface.classList.remove('is-dragging');
    this.controls.dispose();
    this.surface.removeEventListener('pointerdown', this.onPointerDown, true);
    this.surface.removeEventListener('pointermove', this.onPointerMove, true);
    this.surface.removeEventListener('pointerup', this.onPointerUp, true);
    this.surface.removeEventListener('pointercancel', this.onPointerCancel, true);
    this.surface.removeEventListener('lostpointercapture', this.onLostCapture);
    this.surface.removeEventListener('wheel', this.onWheel);
    this.surface.removeEventListener('keydown', this.onKey);
    this.surface.removeEventListener('touchstart', this.onTouchStart);
    this.surface.removeEventListener('touchmove', this.onTouchMove);
    this.surface.removeEventListener('touchend', this.onTouchEnd);
    this.surface.removeEventListener('touchcancel', this.onTouchEnd);
    window.removeEventListener('blur', this.onBlur);
  }
}
