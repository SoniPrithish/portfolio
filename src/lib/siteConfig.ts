import type { DeviceTier, GraphicsPreset, PerformancePreset } from '../types/portfolio'

export const GRAPHICS_PRESETS: Record<GraphicsPreset, PerformancePreset> = {
  low: {
    label: 'Low',
    maxDpr: 1,
    enableShadows: false,
    shadowMapSize: 0,
    envIntensity: 0.55,
    textureScale: 0.55,
    introEnabled: false,
    enhancedAudio: false,
  },
  medium: {
    label: 'Medium',
    maxDpr: 1.15,
    enableShadows: false,
    shadowMapSize: 0,
    envIntensity: 0.75,
    textureScale: 0.8,
    introEnabled: true,
    enhancedAudio: false,
  },
  high: {
    label: 'High',
    maxDpr: 1.4,
    enableShadows: true,
    shadowMapSize: 1024,
    envIntensity: 1,
    textureScale: 1,
    introEnabled: true,
    enhancedAudio: true,
  },
  ultra: {
    label: 'Ultra',
    maxDpr: 1.75,
    enableShadows: true,
    shadowMapSize: 2048,
    envIntensity: 1.15,
    textureScale: 1.3,
    introEnabled: true,
    enhancedAudio: true,
  },
}

export function detectDeviceTier(): DeviceTier {
  if (typeof window === 'undefined') {
    return 'desktop'
  }

  const coarsePointer = window.matchMedia('(pointer: coarse)').matches
  const narrowViewport = window.innerWidth < 900

  return coarsePointer || narrowViewport ? 'mobile' : 'desktop'
}

export function detectInitialGraphicsPreset(): GraphicsPreset {
  if (typeof window === 'undefined') {
    return 'high'
  }

  const deviceTier = detectDeviceTier()
  const navigatorWithMemory = navigator as Navigator & { deviceMemory?: number }
  const memory = navigatorWithMemory.deviceMemory ?? 4
  const cores = navigator.hardwareConcurrency || 4

  if (deviceTier === 'mobile') {
    return memory <= 4 || cores <= 6 ? 'low' : 'medium'
  }

  if (memory >= 8 && cores >= 8) {
    return 'high'
  }

  return 'medium'
}

export function isWebGLAvailable(): boolean {
  if (typeof document === 'undefined') {
    return true
  }

  const canvas = document.createElement('canvas')
  return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
}

export function nextLowerPreset(preset: GraphicsPreset): GraphicsPreset {
  switch (preset) {
    case 'ultra':
      return 'high'
    case 'high':
      return 'medium'
    case 'medium':
      return 'low'
    default:
      return 'low'
  }
}
