/**
 * annotationBus — module-level store for 3D-anchored label callouts.
 * SignalField projects anchor points to screen space each frame and
 * publishes them here; the DOM AnnotationLayer subscribes and renders
 * mono labels with leader dots. FROZEN API — both sides depend on it.
 */

export interface Annotation {
  id: string;
  /** mono label text, e.g. "[frontal cortex]" */
  text: string;
  /** screen-space position in CSS px */
  x: number;
  y: number;
  /** 0..1 — fade driven by the scene (section transitions, occlusion) */
  opacity: number;
}

type Listener = (list: readonly Annotation[]) => void;

let annotations: readonly Annotation[] = [];
const listeners = new Set<Listener>();

export function setAnnotations(list: readonly Annotation[]): void {
  annotations = list;
  for (const listener of listeners) listener(annotations);
}

export function getAnnotations(): readonly Annotation[] {
  return annotations;
}

export function onAnnotations(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
