import { useState, useEffect, useRef } from 'react'
import './App.css'

const POLL_INTERVAL = 30_000
const COLORS = ['#06b6d4', '#f59e0b', '#a855f7', '#f43f5e', '#22c55e', '#3b82f6', '#ec4899', '#14b8a6']

async function fetchLinear() {
  const res = await fetch('/api/linear')
  if (!res.ok) throw new Error('Failed to fetch')
  const json = await res.json()
  if (json.error) throw new Error(json.error)
  return json.data.team
}

export default function App() {
  const [team, setTeam] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const colorMap = useRef({})
  const colorIndex = useRef(0)

  function getColor(personId) {
    if (!colorMap.current[personId]) {
      colorMap.current[personId] = COLORS[colorIndex.current % COLORS.length]
      colorIndex.current++
    }
    return colorMap.current[personId]
  }

  async function load(silent) {
    try {
      const data = await fetchLinear()
      setTeam(data)
      setLastUpdated(new Date())
      if (!silent) setLoading(false)
      setError(null)
    } catch (err) {
      if (!silent) {
        setError(err.message)
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    load(false)
    const interval = setInterval(() => load(true), POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return <div className="loading">loading<span className="loading__dots">...</span></div>
  }

  if (error) {
    return (
      <div className="error-screen">
        <p className="error-screen__title">failed to load</p>
        <p className="error-screen__msg">{error}</p>
        <button className="error-screen__retry" onClick={() => { setLoading(true); load(false) }}>
          retry
        </button>
      </div>
    )
  }

  const issues = team?.issues?.nodes || []
  const states = team?.states?.nodes || []

  // Build columns from assignees who have issues
  const assigneeMap = {}
  issues.forEach(issue => {
    const assignee = issue.assignee
    if (!assignee) return
    if (!assigneeMap[assignee.id]) {
      assigneeMap[assignee.id] = {
        id: assignee.id,
        name: assignee.name,
        color: getColor(assignee.id),
        issues: [],
      }
    }
    assigneeMap[assignee.id].issues.push(issue)
  })

  // Unassigned issues
  const unassigned = issues.filter(i => !i.assignee)

  const columns = Object.values(assigneeMap)

  const todoCount = issues.filter(i => i.state?.type !== 'completed').length
  const doneCount = issues.filter(i => i.state?.type === 'completed').length

  return (
    <>
      <header className="header">
        <div className="header__left">
          <a href="/" className="header__logo">
            <img src="logo-small.svg" alt="HyperTrack" className="header__logo-img" />
          </a>
        </div>
        <div className="header__right">
          <span className="header__stat">
            {todoCount} to do &middot; {doneCount} done
          </span>
          {lastUpdated && (
            <span className="header__sync" title={`Last synced: ${lastUpdated.toLocaleTimeString()}`}>
              <span className="header__sync-dot" />
              linear
            </span>
          )}
        </div>
      </header>

      <main className="board">
        {columns.map(col => (
          <Column key={col.id} person={col} />
        ))}
        <Column person={{ id: '_unassigned', name: 'Unassigned', color: '#71717a', issues: unassigned }} />
      </main>
    </>
  )
}

function Column({ person }) {
  const [tab, setTab] = useState('todo')

  const todoIssues = person.issues
    .filter(i => i.state?.type !== 'completed')
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

  const doneIssues = person.issues
    .filter(i => i.state?.type === 'completed')
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

  const displayIssues = tab === 'todo' ? todoIssues : doneIssues

  // Clean display name (strip email domain)
  const displayName = person.name.includes('@')
    ? person.name.split('@')[0]
    : person.name.split(' ')[0]

  return (
    <div className="column">
      <div className="column__header">
        <div className="column__header-left">
          <span className="column__name" style={{ color: person.color }}>{displayName}</span>
        </div>
        <div className="column__tabs">
          <button
            className={`column__tab ${tab === 'todo' ? 'column__tab--active' : ''}`}
            style={{ '--tab-color': person.color }}
            onClick={() => setTab('todo')}
          >
            to do <span className="tab__count">{todoIssues.length}</span>
          </button>
          <button
            className={`column__tab ${tab === 'done' ? 'column__tab--active' : ''}`}
            style={{ '--tab-color': person.color }}
            onClick={() => setTab('done')}
          >
            done <span className="tab__count">{doneIssues.length}</span>
          </button>
        </div>
      </div>
      <div className="column__body">
        {displayIssues.length === 0 ? (
          <div className="section__empty">{tab === 'todo' ? 'no tasks' : 'nothing yet'}</div>
        ) : (
          displayIssues.map(issue => (
            <IssueCard key={issue.id} issue={issue} personColor={person.color} />
          ))
        )}
      </div>
    </div>
  )
}

function IssueCard({ issue, personColor }) {
  const stateType = issue.state?.type
  const statusClass =
    stateType === 'started' ? 'task__status--in-progress' :
    stateType === 'completed' ? 'task__status--done' :
    'task__status--todo'

  const statusLabel =
    stateType === 'started' ? 'in progress' :
    stateType === 'completed' ? 'done' :
    stateType === 'backlog' ? 'backlog' :
    'to do'

  return (
    <div className="task">
      <span className="task__identifier" style={{ color: personColor }}>{issue.identifier}</span>
      <div className="task__body">
        <span className="task__title">{issue.title}</span>
        {issue.description && <p className="task__desc">{issue.description}</p>}
        <div className="task__meta">
          {issue.project && <span className="task__project">{issue.project.name}</span>}
          {issue.dueDate && (
            <span className="task__due" style={{ color: personColor }}>
              {new Date(issue.dueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
