import { useEffect } from 'react'
import FocusTrap from 'focus-trap-react'

import { aboutParagraphs, brand, contactHighlights, projectMap, skillClusters } from '../data/portfolio'
import type { ActivePanelState } from '../types/portfolio'

interface FocusPanelProps {
  panel: ActivePanelState | null
  onClose: () => void
}

export function FocusPanel({ panel, onClose }: FocusPanelProps) {
  useEffect(() => {
    if (!panel) {
      return undefined
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, panel])

  if (!panel) {
    return null
  }

  const project = panel.projectId ? projectMap.get(panel.projectId) : undefined

  return (
    <FocusTrap focusTrapOptions={{ initialFocus: '#focus-panel-close' }}>
      <aside className="focus-panel-backdrop" aria-hidden={false} onClick={onClose}>
        <section
          className="focus-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="focus-panel-title"
          onClick={(event) => event.stopPropagation()}
        >
          <button id="focus-panel-close" className="focus-panel__close" type="button" onClick={onClose}>
            Close
          </button>

          {panel.kind === 'project' && project ? (
            <>
              <p className="focus-panel__eyebrow">Ball {project.ballNumber} · Project unlocked</p>
              <h2 id="focus-panel-title">{project.name}</h2>
              <p className="focus-panel__lead">{project.description}</p>
              <ul className="focus-panel__list">
                {project.highlights.map((highlight) => (
                  <li key={highlight}>{highlight}</li>
                ))}
              </ul>
              <div className="chip-row" aria-label="Technologies used">
                {project.tech.map((tech) => (
                  <span className="chip" key={tech}>
                    {tech}
                  </span>
                ))}
              </div>
              <div className="focus-panel__actions">
                <a href={project.githubUrl} target="_blank" rel="noreferrer">
                  GitHub
                </a>
                <a href={project.demoUrl} target="_blank" rel="noreferrer">
                  Live Demo
                </a>
              </div>
            </>
          ) : null}

          {panel.kind === 'contact' ? (
            <>
              <p className="focus-panel__eyebrow">8-ball cleared · Contact unlocked</p>
              <h2 id="focus-panel-title">Let&apos;s build something tactile.</h2>
              <p className="focus-panel__lead">
                The finale ball doubles as the portfolio source: a realtime rack built for performance, accessibility,
                and playful navigation.
              </p>
              <ul className="focus-panel__list">
                {contactHighlights.map((highlight) => (
                  <li key={highlight}>{highlight}</li>
                ))}
              </ul>
              {project ? (
                <div className="chip-row" aria-label="Portfolio stack">
                  {project.tech.map((tech) => (
                    <span className="chip" key={tech}>
                      {tech}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="focus-panel__actions">
                <a href={`mailto:${brand.email}`}>Email</a>
                <a href={brand.linkedin} target="_blank" rel="noreferrer">
                  LinkedIn
                </a>
                <a href={brand.portfolioRepo} target="_blank" rel="noreferrer">
                  Portfolio Repo
                </a>
              </div>
            </>
          ) : null}

          {panel.kind === 'about' ? (
            <>
              <p className="focus-panel__eyebrow">Any solid unlocks this brief</p>
              <h2 id="focus-panel-title">About the builder</h2>
              <div className="focus-panel__stack">
                {aboutParagraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </>
          ) : null}

          {panel.kind === 'skills' ? (
            <>
              <p className="focus-panel__eyebrow">Any stripe unlocks the skill board</p>
              <h2 id="focus-panel-title">Core skills</h2>
              <div className="focus-panel__grid">
                {skillClusters.map((cluster) => (
                  <section key={cluster.title} className="mini-card">
                    <h3>{cluster.title}</h3>
                    <p>{cluster.items.join(' · ')}</p>
                  </section>
                ))}
              </div>
            </>
          ) : null}

          {panel.kind === 'help' ? (
            <>
              <p className="focus-panel__eyebrow">Controls</p>
              <h2 id="focus-panel-title">How to play the portfolio</h2>
              <ul className="focus-panel__list">
                <li>Desktop: move the pointer around the cue ball to aim, then click and pull back to set power.</li>
                <li>Mobile: drag on the table to aim, use the power slider, and tap Shoot.</li>
                <li>Use the cue-ball widget to apply topspin, backspin, or side English.</li>
                <li>Pocket a solid for About, a stripe for Skills, and the 8-ball after any project to unlock Contact.</li>
              </ul>
            </>
          ) : null}

          {panel.kind === 'foul' ? (
            <>
              <p className="focus-panel__eyebrow">Foul on the 8</p>
              <h2 id="focus-panel-title">Sink any project ball first.</h2>
              <p className="focus-panel__lead">
                The 8-ball is the finale. Open at least one project before taking the contact shot, and the ball will
                stay down next time.
              </p>
            </>
          ) : null}
        </section>
      </aside>
    </FocusTrap>
  )
}
