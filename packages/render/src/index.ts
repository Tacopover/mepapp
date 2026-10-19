// Scene graph, hit testing, and interactive tools. PixiJS-based. Depends on core only.
export * from './scene.js';
export * from './texture.js';
export { WALL_DEBUG_GROUPS, type WallDebugGroup, type WallLineInfo } from './wallDebugLayer.js';
export { drawRouteArea, type RouteAreaView } from './routeAreaLayer.js';
export { drawRoutePreview, type RoutePreviewView } from './routePreviewLayer.js';
