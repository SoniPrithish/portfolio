import { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'

import { AccessiblePortfolio } from './components/AccessiblePortfolio'
import { TopNav } from './components/TopNav'
import { usePortfolioStore } from './store/usePortfolioStore'

const PoolExperience = lazy(() => import('./components/PoolExperience'))

function StandardPage({
  mode,
  projectId,
  fallbackReason,
}: {
  mode: 'about' | 'projects' | 'project' | 'contact' | 'home'
  projectId?: string
  fallbackReason?: string
}) {
  const accessibilityMode = usePortfolioStore((state) => state.accessibilityMode)
  const webglReady = usePortfolioStore((state) => state.webglReady)
  const setAccessibilityMode = usePortfolioStore((state) => state.setAccessibilityMode)
  const navigate = useNavigate()

  const isAccessibleRoute = mode !== 'home' || accessibilityMode

  return (
    <div className="site-shell">
      <TopNav
        accessibilityMode={isAccessibleRoute}
        webglReady={webglReady}
        onToggleAccessibility={() => {
          if (!webglReady) {
            setAccessibilityMode(true)
            return
          }

          if (mode !== 'home') {
            setAccessibilityMode(false)
            navigate('/')
            return
          }

          setAccessibilityMode(!accessibilityMode)
        }}
      />
      <AccessiblePortfolio mode={mode} projectId={projectId} fallbackReason={fallbackReason} />
    </div>
  )
}

function ProjectRoute() {
  const { id } = useParams()
  return <StandardPage mode="project" projectId={id} />
}

function InteractiveRoute() {
  const accessibilityMode = usePortfolioStore((state) => state.accessibilityMode)
  const webglReady = usePortfolioStore((state) => state.webglReady)

  if (accessibilityMode || !webglReady) {
    return (
      <StandardPage
        mode="home"
        projectId={undefined}
        fallbackReason={!webglReady ? 'WebGL was unavailable, so the portfolio loaded the full HTML mode instead.' : undefined}
      />
    )
  }

  return (
    <Suspense fallback={<StandardPage mode="home" />}>
      <PoolExperience />
    </Suspense>
  )
}

function AppRoutes() {
  const initializeExperience = usePortfolioStore((state) => state.initializeExperience)

  useEffect(() => {
    initializeExperience()
  }, [initializeExperience])

  return (
    <Routes>
      <Route path="/" element={<InteractiveRoute />} />
      <Route path="/about" element={<StandardPage mode="about" />} />
      <Route path="/projects" element={<StandardPage mode="projects" />} />
      <Route path="/projects/:id" element={<ProjectRoute />} />
      <Route path="/contact" element={<StandardPage mode="contact" />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
