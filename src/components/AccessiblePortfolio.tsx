import { useEffect } from 'react'
import { Link } from 'react-router-dom'

import {
  aboutParagraphs,
  brand,
  contactHighlights,
  featuredStats,
  heroCallsToAction,
  projectMap,
  projects,
  skillClusters,
} from '../data/portfolio'

type AccessibleMode = 'home' | 'about' | 'projects' | 'project' | 'contact'

interface AccessiblePortfolioProps {
  mode: AccessibleMode
  projectId?: string
  fallbackReason?: string
}

function getTitle(mode: AccessibleMode, projectId?: string): string {
  if (mode === 'project' && projectId) {
    const project = projectMap.get(projectId)
    return project ? `${project.name} · ${brand.name}` : `Projects · ${brand.name}`
  }

  switch (mode) {
    case 'about':
      return `About · ${brand.name}`
    case 'projects':
      return `Projects · ${brand.name}`
    case 'contact':
      return `Contact · ${brand.name}`
    default:
      return `${brand.name} · ${brand.role}`
  }
}

export function AccessiblePortfolio({ mode, projectId, fallbackReason }: AccessiblePortfolioProps) {
  const selectedProject = projectId ? projectMap.get(projectId) : undefined

  useEffect(() => {
    document.title = getTitle(mode, projectId)
  }, [mode, projectId])

  return (
    <main className="accessible-layout">
      <section className="hero-panel hero-panel--html">
        <p className="eyebrow">Accessibility Mode</p>
        <h1>{brand.name}</h1>
        <p className="hero-panel__subtitle">{brand.role}</p>
        <p className="hero-panel__copy">{brand.tagline}</p>
        <p className="hero-panel__meta">
          {brand.location} · <a href={`mailto:${brand.email}`}>{brand.email}</a>
        </p>
        <div className="hero-panel__actions">
          <a href={brand.github} target="_blank" rel="noreferrer">
            GitHub
          </a>
          <a href={brand.linkedin} target="_blank" rel="noreferrer">
            LinkedIn
          </a>
          <a href={brand.portfolioRepo} target="_blank" rel="noreferrer">
            Portfolio Repo
          </a>
        </div>
        <div className="hero-panel__badge-row" aria-label="Portfolio prompts">
          {heroCallsToAction.map((line) => (
            <span key={line} className="chip">
              {line}
            </span>
          ))}
        </div>
        {fallbackReason ? <p className="hero-panel__notice">{fallbackReason}</p> : null}
      </section>

      {(mode === 'home' || mode === 'about') && (
        <>
          <section className="content-card" id="about">
            <div className="section-heading">
              <p className="eyebrow">About</p>
              <h2>Built like a premium match table.</h2>
            </div>
            <div className="content-stack">
              {aboutParagraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </section>

          <section className="content-card" id="skills">
            <div className="section-heading">
              <p className="eyebrow">Skills</p>
              <h2>Craft, systems, and speed.</h2>
            </div>
            <div className="skill-grid">
              {skillClusters.map((cluster) => (
                <article key={cluster.title} className="mini-card">
                  <h3>{cluster.title}</h3>
                  <p>{cluster.items.join(' · ')}</p>
                </article>
              ))}
            </div>
          </section>
        </>
      )}

      {(mode === 'home' || mode === 'projects') && (
        <section className="content-card" id="projects">
          <div className="section-heading">
            <p className="eyebrow">Projects</p>
            <h2>Every ball maps to a build.</h2>
          </div>
          <div className="stats-strip" aria-label="Feature highlights">
            {featuredStats.map((stat) => (
              <span key={stat}>{stat}</span>
            ))}
          </div>
          <div className="project-grid">
            {projects.map((project) => (
              <article className="project-card" key={project.id}>
                <div className="project-card__header">
                  <span className="project-ball-number">{project.ballNumber}</span>
                  <h3>{project.name}</h3>
                </div>
                <p>{project.description}</p>
                <div className="chip-row">
                  {project.tech.map((tech) => (
                    <span className="chip" key={tech}>
                      {tech}
                    </span>
                  ))}
                </div>
                <div className="project-card__footer">
                  <Link to={`/projects/${project.id}`}>Read details</Link>
                  <a href={project.demoUrl} target="_blank" rel="noreferrer">
                    Live Demo
                  </a>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {mode === 'project' && selectedProject ? (
        <section className="content-card content-card--detail">
          <div className="section-heading">
            <p className="eyebrow">Ball {selectedProject.ballNumber}</p>
            <h2>{selectedProject.name}</h2>
          </div>
          <p className="hero-panel__copy">{selectedProject.description}</p>
          <ul className="detail-list">
            {selectedProject.highlights.map((highlight) => (
              <li key={highlight}>{highlight}</li>
            ))}
          </ul>
          <div className="chip-row">
            {selectedProject.tech.map((tech) => (
              <span className="chip" key={tech}>
                {tech}
              </span>
            ))}
          </div>
          <div className="hero-panel__actions">
            <a href={selectedProject.githubUrl} target="_blank" rel="noreferrer">
              GitHub
            </a>
            <a href={selectedProject.demoUrl} target="_blank" rel="noreferrer">
              Live Demo
            </a>
            <Link to="/projects">All projects</Link>
          </div>
        </section>
      ) : null}

      {(mode === 'home' || mode === 'contact') && (
        <section className="content-card" id="contact">
          <div className="section-heading">
            <p className="eyebrow">Contact</p>
            <h2>Open for high-performance, design-forward work.</h2>
          </div>
          <ul className="detail-list">
            {contactHighlights.map((highlight) => (
              <li key={highlight}>{highlight}</li>
            ))}
          </ul>
          <div className="hero-panel__actions">
            <a href={`mailto:${brand.email}`}>Email</a>
            <a href={brand.linkedin} target="_blank" rel="noreferrer">
              LinkedIn
            </a>
            <a href={brand.portfolioRepo} target="_blank" rel="noreferrer">
              Source
            </a>
          </div>
        </section>
      )}
    </main>
  )
}
