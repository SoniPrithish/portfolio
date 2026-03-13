export type GraphicsPreset = 'low' | 'medium' | 'high' | 'ultra'

export type DeviceTier = 'mobile' | 'desktop'

export interface BrandProfile {
  name: string
  role: string
  tagline: string
  location: string
  email: string
  github: string
  linkedin: string
  portfolioRepo: string
}

export interface SkillCluster {
  title: string
  items: string[]
}

export interface ProjectEntry {
  id: string
  ballNumber: number
  name: string
  description: string
  tech: string[]
  highlights: string[]
  githubUrl: string
  demoUrl: string
  images: string[]
  accent: string
}

export interface PerformancePreset {
  label: string
  maxDpr: number
  enableShadows: boolean
  shadowMapSize: number
  envIntensity: number
  textureScale: number
  introEnabled: boolean
  enhancedAudio: boolean
}

export interface ActivePanelState {
  kind: 'project' | 'about' | 'skills' | 'contact' | 'help' | 'foul'
  projectId?: string
}

export interface PerformanceStats {
  fps: number
  physicsMs: number
  suggestionVisible: boolean
}
