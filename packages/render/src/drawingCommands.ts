import type { Annotation, Command, Fitting, PlacedStamp, Segment } from '@mepapp/core';
import type { DrawingState } from './document.js';

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const rest = { ...record };
  delete rest[key];
  return rest;
}

export function createFittingCommand(fitting: Fitting): Command<DrawingState> {
  return {
    description: `Create fitting ${fitting.id}`,
    execute: (state) => ({ ...state, fittings: { ...state.fittings, [fitting.id]: fitting } }),
    undo: (state) => ({ ...state, fittings: withoutKey(state.fittings, fitting.id) }),
  };
}

export function createSegmentCommand(segment: Segment): Command<DrawingState> {
  return {
    description: `Create segment ${segment.id}`,
    execute: (state) => ({ ...state, segments: { ...state.segments, [segment.id]: segment } }),
    undo: (state) => ({ ...state, segments: withoutKey(state.segments, segment.id) }),
  };
}

export function deleteSegmentCommand(segment: Segment): Command<DrawingState> {
  return {
    description: `Delete segment ${segment.id}`,
    execute: (state) => ({ ...state, segments: withoutKey(state.segments, segment.id) }),
    undo: (state) => ({ ...state, segments: { ...state.segments, [segment.id]: segment } }),
  };
}

export function createStampCommand(stamp: PlacedStamp): Command<DrawingState> {
  return {
    description: `Place stamp ${stamp.id}`,
    execute: (state) => ({ ...state, stamps: { ...state.stamps, [stamp.id]: stamp } }),
    undo: (state) => ({ ...state, stamps: withoutKey(state.stamps, stamp.id) }),
  };
}

/** One command per whole annotation (a freehand stroke's every point included) — never one command per point, so undoing a drawn annotation is always a single step. */
export function createAnnotationCommand(annotation: Annotation): Command<DrawingState> {
  return {
    description: `Create annotation ${annotation.id}`,
    execute: (state) => ({ ...state, annotations: { ...state.annotations, [annotation.id]: annotation } }),
    undo: (state) => ({ ...state, annotations: withoutKey(state.annotations, annotation.id) }),
  };
}
