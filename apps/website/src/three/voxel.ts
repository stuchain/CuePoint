import {
  BoxGeometry,
  Color,
  DataTexture,
  InstancedMesh,
  MeshLambertMaterial,
  NearestFilter,
  Object3D,
  RGBAFormat,
  UnsignedByteType,
  type BufferGeometry,
  type Material,
} from "three";

/**
 * Voxel helpers (SITE-05): instanced cubes and pixel textures. Every texture here is NearestFilter
 * with no mipmaps, so a texel stays a hard square at any size.
 */

/** An RGBA pixel texture from rows of [r, g, b] (0..255), nearest-neighbor, no mipmaps. */
export function pixelTexture(width: number, height: number, rgb: ReadonlyArray<readonly [number, number, number]>): DataTexture {
  if (rgb.length !== width * height) throw new Error(`pixelTexture: ${rgb.length} pixels for ${width}x${height}`);
  const data = new Uint8Array(width * height * 4);
  rgb.forEach((p, i) => {
    data[i * 4] = p[0];
    data[i * 4 + 1] = p[1];
    data[i * 4 + 2] = p[2];
    data[i * 4 + 3] = 255;
  });
  const tex = new DataTexture(data, width, height, RGBAFormat, UnsignedByteType);
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export interface VoxelField {
  mesh: InstancedMesh;
  /** Sets cube i's position and height (a unit cube stretched in y, standing on `y`), then uploads. */
  set(i: number, x: number, y: number, z: number, height: number): void;
  setColor(i: number, color: Color | string | number): void;
  /** Call after a batch of set() / setColor(). */
  commit(): void;
  dispose(): void;
}

/** `count` cubes in one InstancedMesh (one draw call). Cubes cast and receive hard shadows. */
export function createVoxelField(count: number, material?: Material, geometry?: BufferGeometry): VoxelField {
  const geo = geometry ?? new BoxGeometry(1, 1, 1);
  const mat = material ?? new MeshLambertMaterial();
  const mesh = new InstancedMesh(geo, mat, count);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  const dummy = new Object3D();
  const tint = new Color();
  // allocate instanceColor up front so a material compiled once never changes its program
  for (let i = 0; i < count; i++) mesh.setColorAt(i, tint.set(0xffffff));
  return {
    mesh,
    set(i, x, y, z, height) {
      dummy.position.set(x, y + height / 2, z);
      dummy.scale.set(1, Math.max(0.0001, height), 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    },
    setColor(i, color) {
      mesh.setColorAt(i, tint.set(color as Color));
    },
    commit() {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
    dispose() {
      geo.dispose();
      if (!material) mat.dispose();
      mesh.dispose();
    },
  };
}
