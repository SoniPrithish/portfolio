import {
  CanvasTexture,
  ClampToEdgeWrapping,
  Color,
  MeshPhysicalMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  Vector2,
} from 'three'

const clothCache = new Map<string, { map: Texture; roughnessMap: Texture; normalMap: Texture }>()
const woodCache = new Map<string, { map: Texture; roughnessMap: Texture }>()

function createCanvas(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  return canvas
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

export function createBallAtlasTexture(): Texture {
  const canvas = createCanvas(1024)
  const context = canvas.getContext('2d')

  if (!context) {
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    return texture
  }

  context.clearRect(0, 0, canvas.width, canvas.height)
  const cellSize = canvas.width / 4

  for (let index = 0; index < 16; index += 1) {
    const cellX = (index % 4) * cellSize
    const cellY = Math.floor(index / 4) * cellSize
    const centerX = cellX + cellSize / 2
    const centerY = cellY + cellSize / 2

    if (index !== 0) {
      context.save()
      context.translate(centerX, centerY)
      context.fillStyle = 'rgba(255, 255, 255, 0.98)'
      context.beginPath()
      context.arc(0, 0, cellSize * 0.22, 0, Math.PI * 2)
      context.fill()
      context.lineWidth = cellSize * 0.03
      context.strokeStyle = 'rgba(0, 0, 0, 0.18)'
      context.stroke()
      context.fillStyle = '#101010'
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.font = `700 ${cellSize * 0.16}px "Arial Black", sans-serif`
      context.fillText(String(index), 0, cellSize * 0.01)
      context.restore()
    }
  }

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
  texture.needsUpdate = true
  return texture
}

export function createBallMaterial(ballAtlas: Texture): MeshPhysicalMaterial {
  const material = new MeshPhysicalMaterial({
    color: '#ffffff',
    roughness: 0.12,
    metalness: 0.02,
    clearcoat: 1,
    clearcoatRoughness: 0.035,
    envMapIntensity: 1.35,
  })

  material.onBeforeCompile = (shader) => {
    shader.uniforms.ballAtlas = { value: ballAtlas }

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec3 instanceColor;
attribute float instanceBallNumber;
attribute float instanceBallType;
varying vec3 vBallColor;
varying float vBallNumber;
varying float vBallType;
varying vec3 vPatternNormal;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vBallColor = instanceColor;
vBallNumber = instanceBallNumber;
vBallType = instanceBallType;
#ifdef USE_INSTANCING
  vPatternNormal = normalize(mat3(instanceMatrix) * normal);
#else
  vPatternNormal = normalize(normal);
#endif`,
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D ballAtlas;
varying vec3 vBallColor;
varying float vBallNumber;
varying float vBallType;
varying vec3 vPatternNormal;

vec3 getBallBaseColor(vec3 patternNormal, vec3 accentColor, float ballType) {
  vec3 white = vec3(0.97);
  vec3 black = vec3(0.08);

  if (ballType < 0.5) {
    return white;
  }

  if (ballType > 2.5) {
    return black;
  }

  if (ballType > 1.5) {
    float stripeMask = 1.0 - smoothstep(0.24, 0.38, abs(patternNormal.y));
    return mix(white, accentColor, stripeMask);
  }

  return accentColor;
}

vec4 getSticker(vec3 patternNormal, float atlasIndex) {
  float stickerPole = max(patternNormal.z, -patternNormal.z);
  if (stickerPole < 0.76) {
    return vec4(0.0);
  }

  vec2 stickerUv = patternNormal.xy * 0.46 + 0.5;
  if (stickerUv.x < 0.0 || stickerUv.x > 1.0 || stickerUv.y < 0.0 || stickerUv.y > 1.0) {
    return vec4(0.0);
  }

  float atlasSize = 4.0;
  vec2 atlasCell = vec2(mod(atlasIndex, atlasSize), floor(atlasIndex / atlasSize));
  vec2 atlasUv = atlasCell / atlasSize + stickerUv / atlasSize;
  return texture2D(ballAtlas, atlasUv);
}`,
      )
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `vec3 patternedBase = getBallBaseColor(normalize(vPatternNormal), vBallColor, vBallType);
vec4 sticker = getSticker(normalize(vPatternNormal), vBallNumber);
vec3 finalColor = mix(patternedBase, sticker.rgb, sticker.a);
vec4 diffuseColor = vec4(finalColor, opacity);`,
      )
  }

  material.customProgramCacheKey = () => 'pool-ball-material-v1'

  return material
}

export function createClothTextures(detailScale: number): {
  map: Texture
  roughnessMap: Texture
  normalMap: Texture
} {
  const key = detailScale.toFixed(2)
  const cached = clothCache.get(key)
  if (cached) {
    return cached
  }

  const size = Math.max(128, Math.round(256 * detailScale))
  const canvas = createCanvas(size)
  const roughnessCanvas = createCanvas(size)
  const normalCanvas = createCanvas(size)
  const ctx = canvas.getContext('2d')
  const roughnessCtx = roughnessCanvas.getContext('2d')
  const normalCtx = normalCanvas.getContext('2d')

  if (!ctx || !roughnessCtx || !normalCtx) {
    const fallback = {
      map: new CanvasTexture(canvas),
      roughnessMap: new CanvasTexture(roughnessCanvas),
      normalMap: new CanvasTexture(normalCanvas),
    }
    clothCache.set(key, fallback)
    return fallback
  }

  const heightData = new Float32Array(size * size)
  const image = ctx.createImageData(size, size)
  const roughnessImage = roughnessCtx.createImageData(size, size)
  const normalImage = normalCtx.createImageData(size, size)
  const baseColor = new Color('#0f6b4a')

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = y * size + x
      const u = x / size
      const v = y / size
      const weave = Math.sin(u * Math.PI * 42) * 0.35 + Math.cos(v * Math.PI * 42) * 0.35
      const diagonal = Math.sin((u + v) * Math.PI * 12) * 0.18
      const noise = (Math.sin(u * 89.2 + v * 21.7) + Math.cos(v * 123.4 - u * 14.2)) * 0.05
      const height = weave + diagonal + noise
      heightData[index] = height

      const brightness = clamp01(0.7 + height * 0.12)
      image.data[index * 4 + 0] = Math.round(baseColor.r * 255 * brightness)
      image.data[index * 4 + 1] = Math.round(baseColor.g * 255 * brightness)
      image.data[index * 4 + 2] = Math.round(baseColor.b * 255 * brightness)
      image.data[index * 4 + 3] = 255

      const roughness = clamp01(0.74 + Math.abs(height) * 0.14)
      const roughnessByte = Math.round(roughness * 255)
      roughnessImage.data[index * 4 + 0] = roughnessByte
      roughnessImage.data[index * 4 + 1] = roughnessByte
      roughnessImage.data[index * 4 + 2] = roughnessByte
      roughnessImage.data[index * 4 + 3] = 255
    }
  }

  const sampleHeight = (x: number, y: number): number => {
    const wrappedX = (x + size) % size
    const wrappedY = (y + size) % size
    return heightData[wrappedY * size + wrappedX]
  }

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = sampleHeight(x + 1, y) - sampleHeight(x - 1, y)
      const dy = sampleHeight(x, y + 1) - sampleHeight(x, y - 1)
      const normal = new Vector2(dx, dy).multiplyScalar(2.4)
      const nz = 1
      const length = Math.sqrt(normal.x * normal.x + normal.y * normal.y + nz * nz)
      const nx = normal.x / length
      const ny = normal.y / length
      const zz = nz / length
      const index = y * size + x
      normalImage.data[index * 4 + 0] = Math.round((nx * 0.5 + 0.5) * 255)
      normalImage.data[index * 4 + 1] = Math.round((ny * 0.5 + 0.5) * 255)
      normalImage.data[index * 4 + 2] = Math.round((zz * 0.5 + 0.5) * 255)
      normalImage.data[index * 4 + 3] = 255
    }
  }

  ctx.putImageData(image, 0, 0)
  roughnessCtx.putImageData(roughnessImage, 0, 0)
  normalCtx.putImageData(normalImage, 0, 0)

  const map = new CanvasTexture(canvas)
  const roughnessMap = new CanvasTexture(roughnessCanvas)
  const normalMap = new CanvasTexture(normalCanvas)

  ;[map, roughnessMap, normalMap].forEach((texture) => {
    texture.wrapS = RepeatWrapping
    texture.wrapT = RepeatWrapping
    texture.repeat.set(4, 2)
    texture.colorSpace = texture === normalMap || texture === roughnessMap ? texture.colorSpace : SRGBColorSpace
    texture.needsUpdate = true
  })

  const output = { map, roughnessMap, normalMap }
  clothCache.set(key, output)
  return output
}

export function createWoodTextures(detailScale: number): {
  map: Texture
  roughnessMap: Texture
} {
  const key = detailScale.toFixed(2)
  const cached = woodCache.get(key)
  if (cached) {
    return cached
  }

  const size = Math.max(128, Math.round(256 * detailScale))
  const canvas = createCanvas(size)
  const roughnessCanvas = createCanvas(size)
  const ctx = canvas.getContext('2d')
  const roughnessCtx = roughnessCanvas.getContext('2d')

  if (!ctx || !roughnessCtx) {
    const fallback = {
      map: new CanvasTexture(canvas),
      roughnessMap: new CanvasTexture(roughnessCanvas),
    }
    woodCache.set(key, fallback)
    return fallback
  }

  const image = ctx.createImageData(size, size)
  const roughnessImage = roughnessCtx.createImageData(size, size)
  const dark = new Color('#4d2f20')
  const light = new Color('#7b5037')

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = y * size + x
      const u = x / size
      const v = y / size
      const grain = Math.sin(u * Math.PI * 24 + Math.sin(v * Math.PI * 4) * 2.6) * 0.5 + 0.5
      const streak = Math.sin((u * 2 + v * 0.1) * Math.PI * 60) * 0.08
      const mixValue = clamp01(grain * 0.82 + streak)
      const color = dark.clone().lerp(light, mixValue)
      image.data[index * 4 + 0] = Math.round(color.r * 255)
      image.data[index * 4 + 1] = Math.round(color.g * 255)
      image.data[index * 4 + 2] = Math.round(color.b * 255)
      image.data[index * 4 + 3] = 255

      const roughness = clamp01(0.48 + mixValue * 0.12)
      const byte = Math.round(roughness * 255)
      roughnessImage.data[index * 4 + 0] = byte
      roughnessImage.data[index * 4 + 1] = byte
      roughnessImage.data[index * 4 + 2] = byte
      roughnessImage.data[index * 4 + 3] = 255
    }
  }

  ctx.putImageData(image, 0, 0)
  roughnessCtx.putImageData(roughnessImage, 0, 0)

  const map = new CanvasTexture(canvas)
  map.colorSpace = SRGBColorSpace
  const roughnessMap = new CanvasTexture(roughnessCanvas)

  ;[map, roughnessMap].forEach((texture) => {
    texture.wrapS = RepeatWrapping
    texture.wrapT = RepeatWrapping
    texture.repeat.set(2.5, 1)
    texture.needsUpdate = true
  })

  const output = { map, roughnessMap }
  woodCache.set(key, output)
  return output
}
