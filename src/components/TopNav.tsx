import { NavLink, Link } from 'react-router-dom'

import { brand } from '../data/portfolio'

interface TopNavProps {
  immersive?: boolean
  accessibilityMode: boolean
  webglReady: boolean
  onToggleAccessibility: () => void
}

export function TopNav({
  immersive = false,
  accessibilityMode,
  webglReady,
  onToggleAccessibility,
}: TopNavProps) {
  return (
    <header className={`top-nav ${immersive ? 'top-nav--immersive' : ''}`}>
      <Link className="brand-mark" to="/" aria-label={`${brand.name} home`}>
        <span className="brand-mark__monogram">PS</span>
        <span>
          <strong>{brand.name}</strong>
          <small>{brand.role}</small>
        </span>
      </Link>

      <nav aria-label="Primary">
        <NavLink to="/about">About</NavLink>
        <NavLink to="/projects">Projects</NavLink>
        <NavLink to="/contact">Contact</NavLink>
      </nav>

      <div className="top-nav__actions">
        <a href={brand.github} target="_blank" rel="noreferrer">
          GitHub
        </a>
        <a href={brand.linkedin} target="_blank" rel="noreferrer">
          LinkedIn
        </a>
        <button type="button" onClick={onToggleAccessibility}>
          {accessibilityMode ? (webglReady ? 'Interactive Mode' : 'WebGL Unavailable') : 'Accessibility Mode'}
        </button>
      </div>
    </header>
  )
}
