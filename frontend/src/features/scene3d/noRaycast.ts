/**
 * Pass as `raycast` on meshes and lines that are never clicked, so pointer
 * events skip them (cheaper picking, and clicks on empty space reach
 * onPointerMissed instead of hitting the ground or a halo).
 */
export function noRaycast(): void {}
