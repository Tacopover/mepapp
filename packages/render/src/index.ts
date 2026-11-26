// Scene graph, hit testing, and interactive tools. PixiJS-based. Depends on core only.
export * from './scene.js';
export * from './texture.js';
export { WALL_DEBUG_GROUPS, type WallDebugGroup, type WallLineInfo } from './wallDebugLayer.js';
export { drawRouteArea, type RouteAreaView } from './routeAreaLayer.js';
export { drawRoutePreview, type RoutePreviewView } from './routePreviewLayer.js';
export { type RiserMark, type RiserConflict, type FittingContext } from './riserMarks.js';
export { type RiserAnchor } from './riserAnchors.js';
export { riserArrowShapes, riserArrowShaftPattern, RISER_ARROW_STYLE, RISER_ARROW_SHAFT_LENGTH_PT, type RiserArrowShape } from './riserArrowShapes.js';
