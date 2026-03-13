import { create } from 'zustand'

import { projectByBallNumber } from '../data/portfolio'
import { GRAPHICS_PRESETS, detectDeviceTier, detectInitialGraphicsPreset, isWebGLAvailable, nextLowerPreset } from '../lib/siteConfig'
import type { ActivePanelState, DeviceTier, GraphicsPreset, PerformanceStats } from '../types/portfolio'

type IntroPhase = 'idle' | 'playing' | 'complete' | 'skipped'
type IntroChallenge = 'active' | 'completed' | 'skipped'

interface UnlockState {
  about: boolean
  skills: boolean
  contact: boolean
}

interface PortfolioState {
  initialized: boolean
  deviceTier: DeviceTier
  webglReady: boolean
  accessibilityMode: boolean
  graphicsPreset: GraphicsPreset
  introPhase: IntroPhase
  introChallenge: IntroChallenge
  rackMode: 'full' | '8ball'
  activePanel: ActivePanelState | null
  shotsTaken: number
  pocketedCount: number
  unlockedSections: UnlockState
  viewedProjects: string[]
  soundEnabled: boolean
  volume: number
  advancedAudio: boolean
  guidedMode: boolean
  devStatsVisible: boolean
  spin: { x: number; y: number }
  performance: PerformanceStats
  rackVersion: number
  initializeExperience: () => void
  setAccessibilityMode: (enabled: boolean) => void
  setGraphicsPreset: (preset: GraphicsPreset) => void
  acceptGraphicsReduction: () => void
  setPerformance: (stats: Partial<PerformanceStats>) => void
  setIntroPhase: (phase: IntroPhase) => void
  skipIntroChallenge: () => void
  openPanel: (panel: ActivePanelState) => void
  closePanel: () => void
  recordShot: () => void
  handlePocketedBall: (ballNumber: number) => void
  notifyEightBallFoul: () => void
  toggleGuidedMode: () => void
  toggleDevStats: () => void
  toggleSound: () => void
  setVolume: (volume: number) => void
  setAdvancedAudio: (enabled: boolean) => void
  setSpin: (spin: { x: number; y: number }) => void
  resetRackProgress: () => void
}

const defaultPerformance: PerformanceStats = {
  fps: 60,
  physicsMs: 0.8,
  suggestionVisible: false,
}

function createUnlockState(): UnlockState {
  return {
    about: false,
    skills: false,
    contact: false,
  }
}

export const usePortfolioStore = create<PortfolioState>((set, get) => ({
  initialized: false,
  deviceTier: 'desktop',
  webglReady: true,
  accessibilityMode: false,
  graphicsPreset: 'high',
  introPhase: 'idle',
  introChallenge: 'active',
  rackMode: '8ball',
  activePanel: null,
  shotsTaken: 0,
  pocketedCount: 0,
  unlockedSections: createUnlockState(),
  viewedProjects: [],
  soundEnabled: true,
  volume: 0.62,
  advancedAudio: true,
  guidedMode: true,
  devStatsVisible: false,
  spin: { x: 0, y: 0 },
  performance: defaultPerformance,
  rackVersion: 0,
  initializeExperience: () => {
    if (get().initialized) {
      return
    }

    const deviceTier = detectDeviceTier()
    const graphicsPreset = detectInitialGraphicsPreset()
    const webglReady = isWebGLAvailable()

    set({
      initialized: true,
      deviceTier,
      graphicsPreset,
      webglReady,
      accessibilityMode: !webglReady,
      introPhase: GRAPHICS_PRESETS[graphicsPreset].introEnabled ? 'playing' : 'skipped',
      advancedAudio: GRAPHICS_PRESETS[graphicsPreset].enhancedAudio,
      soundEnabled: true,
    })
  },
  setAccessibilityMode: (enabled) => {
    set({ accessibilityMode: enabled })
  },
  setGraphicsPreset: (preset) => {
    set({
      graphicsPreset: preset,
      advancedAudio: GRAPHICS_PRESETS[preset].enhancedAudio,
      performance: {
        ...get().performance,
        suggestionVisible: false,
      },
    })
  },
  acceptGraphicsReduction: () => {
    const current = get().graphicsPreset
    set({
      graphicsPreset: nextLowerPreset(current),
      performance: {
        ...get().performance,
        suggestionVisible: false,
      },
    })
  },
  setPerformance: (stats) => {
    set((state) => ({
      performance: {
        ...state.performance,
        ...stats,
      },
    }))
  },
  setIntroPhase: (phase) => {
    set({ introPhase: phase })
  },
  skipIntroChallenge: () => {
    set((state) => ({
      introChallenge: 'skipped',
      rackMode: 'full',
      rackVersion: state.rackVersion + 1,
      shotsTaken: 0,
      pocketedCount: 0,
    }))
  },
  openPanel: (panel) => {
    set({ activePanel: panel })
  },
  closePanel: () => {
    set({ activePanel: null })
  },
  recordShot: () => {
    set((state) => ({
      shotsTaken: state.shotsTaken + 1,
    }))
  },
  handlePocketedBall: (ballNumber) => {
    const state = get()

    if (state.introChallenge === 'active') {
      state.skipIntroChallenge()
      return
    }

    if (ballNumber === 8) {
      const project = projectByBallNumber.get(8)
      const viewedProjects = project && !state.viewedProjects.includes(project.id)
        ? [...state.viewedProjects, project.id]
        : state.viewedProjects

      set({
        pocketedCount: state.pocketedCount + 1,
        viewedProjects,
        unlockedSections: {
          ...state.unlockedSections,
          contact: true,
        },
        activePanel: {
          kind: 'contact',
          projectId: project?.id,
        },
      })
      return
    }

    const project = projectByBallNumber.get(ballNumber)
    if (!project) {
      return
    }

    const viewedProjects = state.viewedProjects.includes(project.id)
      ? state.viewedProjects
      : [...state.viewedProjects, project.id]

    set({
      pocketedCount: state.pocketedCount + 1,
      viewedProjects,
      unlockedSections: {
        ...state.unlockedSections,
        about: ballNumber < 8 || state.unlockedSections.about,
        skills: ballNumber > 8 || state.unlockedSections.skills,
      },
      activePanel: {
        kind: 'project',
        projectId: project.id,
      },
    })
  },
  notifyEightBallFoul: () => {
    set({
      activePanel: {
        kind: 'foul',
      },
    })
  },
  toggleGuidedMode: () => {
    set((state) => ({
      guidedMode: !state.guidedMode,
    }))
  },
  toggleDevStats: () => {
    set((state) => ({
      devStatsVisible: !state.devStatsVisible,
    }))
  },
  toggleSound: () => {
    set((state) => ({
      soundEnabled: !state.soundEnabled,
    }))
  },
  setVolume: (volume) => {
    set({ volume })
  },
  setAdvancedAudio: (enabled) => {
    set({ advancedAudio: enabled })
  },
  setSpin: (spin) => {
    set({ spin })
  },
  resetRackProgress: () => {
    set((state) => ({
      activePanel: null,
      shotsTaken: 0,
      pocketedCount: 0,
      unlockedSections: createUnlockState(),
      viewedProjects: [],
      performance: {
        ...state.performance,
        suggestionVisible: false,
      },
      spin: { x: 0, y: 0 },
      rackVersion: state.rackVersion + 1,
    }))
  },
}))
