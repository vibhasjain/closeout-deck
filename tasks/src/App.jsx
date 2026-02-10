import { useState, useEffect } from 'react'
import { DndContext, DragOverlay, PointerSensor, TouchSensor, useSensor, useSensors, useDroppable, closestCenter } from '@dnd-kit/core'
import { useDraggable } from '@dnd-kit/core'
import { supabase } from './supabaseClient'
import { DatePicker } from './components/DatePicker'
import './App.css'

const STATUS_CYCLE = ['todo', 'in-progress', 'done']
const STATUS_LABELS = {
  'todo': 'to do',
  'in-progress': 'in progress',
  'done': 'done',
}

export default function App() {
  const [people, setPeople] = useState({})
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [flashIds, setFlashIds] = useState(new Set())
  const [connected, setConnected] = useState(false)
  const [activeTask, setActiveTask] = useState(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  )

  useEffect(() => {
    fetchData()

    const channel = supabase
      .channel('tasks-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, (payload) => {
        handleTaskChange(payload)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'people' }, () => {
        fetchPeople()
      })
      .subscribe((status) => {
        setConnected(status === 'SUBSCRIBED')
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  async function fetchPeople() {
    const { data } = await supabase.from('people').select('*')
    if (data) {
      const map = {}
      data.forEach(p => { map[p.id] = p })
      setPeople(map)
    }
  }

  async function fetchData() {
    const [peopleRes, tasksRes] = await Promise.all([
      supabase.from('people').select('*'),
      supabase.from('tasks').select('*').order('due', { ascending: true, nullsFirst: false }),
    ])

    if (peopleRes.error || tasksRes.error) {
      setError(peopleRes.error?.message || tasksRes.error?.message)
      setLoading(false)
      return
    }

    const pMap = {}
    peopleRes.data?.forEach(p => { pMap[p.id] = p })
    setPeople(pMap)
    setTasks(tasksRes.data || [])
    setLoading(false)
  }

  function handleTaskChange(payload) {
    const id = payload.new?.id || payload.old?.id

    setFlashIds(prev => new Set([...prev, id]))
    setTimeout(() => {
      setFlashIds(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }, 1500)

    if (payload.eventType === 'INSERT') {
      setTasks(prev => [...prev, payload.new])
    } else if (payload.eventType === 'UPDATE') {
      setTasks(prev => prev.map(t => t.id === payload.new.id ? payload.new : t))
    } else if (payload.eventType === 'DELETE') {
      setTasks(prev => prev.filter(t => t.id !== payload.old.id))
    }
  }

  async function cycleStatus(task) {
    const idx = STATUS_CYCLE.indexOf(task.status)
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]
    await supabase.from('tasks').update({ status: next }).eq('id', task.id)
  }

  function handleDragStart(event) {
    const task = tasks.find(t => t.id === event.active.id)
    setActiveTask(task || null)
  }

  function handleDragEnd(event) {
    setActiveTask(null)
    const { active, over } = event
    if (!over) return

    const taskId = active.id
    const targetPerson = over.id

    const task = tasks.find(t => t.id === taskId)
    if (!task || task.person === targetPerson) return

    // Optimistic update
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, person: targetPerson } : t))

    // Persist to Supabase
    supabase.from('tasks').update({ person: targetPerson }).eq('id', taskId).then()
  }

  if (loading) {
    return <div className="loading">loading<span className="loading__dots">...</span></div>
  }

  if (error) {
    return (
      <div className="error-screen">
        <p className="error-screen__title">connection error</p>
        <p className="error-screen__msg">{error}</p>
        <button className="error-screen__retry" onClick={() => { setError(null); setLoading(true); fetchData() }}>
          retry
        </button>
      </div>
    )
  }

  const personKeys = Object.keys(people)
  const todoCount = tasks.filter(t => t.status !== 'done').length
  const doneCount = tasks.filter(t => t.status === 'done').length

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
          <span className={`header__live ${connected ? 'header__live--on' : ''}`}>
            {connected ? '● live' : '○ connecting'}
          </span>
        </div>
      </header>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <main className="board">
          {personKeys.map(key => (
            <Column
              key={key}
              personId={key}
              person={people[key]}
              tasks={tasks.filter(t => t.person === key)}
              flashIds={flashIds}
              onCycleStatus={cycleStatus}
              isDragTarget={activeTask && activeTask.person !== key}
            />
          ))}
        </main>

        <DragOverlay dropAnimation={null}>
          {activeTask ? (
            <div className="task task--dragging">
              <span className="task__num" style={{ color: people[activeTask.person]?.color }}>⠿</span>
              <div className="task__body">
                <span className="task__title">{activeTask.title}</span>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </>
  )
}

function Column({ personId, person, tasks, flashIds, onCycleStatus, isDragTarget }) {
  const [tab, setTab] = useState('todo')
  const { setNodeRef, isOver } = useDroppable({ id: personId })

  const todoTasks = tasks.filter(t => t.status !== 'done')
  const doneTasks = tasks.filter(t => t.status === 'done')
  const displayTasks = tab === 'todo' ? todoTasks : doneTasks

  return (
    <div
      ref={setNodeRef}
      className={`column ${isOver ? 'column--over' : ''} ${isDragTarget ? 'column--drop-target' : ''}`}
    >
      <div className="column__header">
        <span className="column__name" style={{ color: person.color }}>{person.name}</span>
        <div className="column__tabs">
          <button
            className={`column__tab ${tab === 'todo' ? 'column__tab--active' : ''}`}
            style={{ '--tab-color': person.color }}
            onClick={() => setTab('todo')}
          >
            to do <span className="tab__count">{todoTasks.length}</span>
          </button>
          <button
            className={`column__tab ${tab === 'done' ? 'column__tab--active' : ''}`}
            style={{ '--tab-color': person.color }}
            onClick={() => setTab('done')}
          >
            done <span className="tab__count">{doneTasks.length}</span>
          </button>
        </div>
      </div>
      <div className="column__body">
        {displayTasks.length === 0 ? (
          <div className="section__empty">{tab === 'todo' ? 'no tasks' : 'nothing yet'}</div>
        ) : (
          displayTasks.map((task, i) => (
            <DraggableTask
              key={task.id}
              task={task}
              num={i + 1}
              person={person}
              isFlashing={flashIds.has(task.id)}
              onCycleStatus={onCycleStatus}
            />
          ))
        )}
      </div>
    </div>
  )
}

function DraggableTask({ task, num, person, isFlashing, onCycleStatus }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id })

  return (
    <div
      ref={setNodeRef}
      className={`task ${isFlashing ? 'task--flash' : ''} ${isDragging ? 'task--placeholder' : ''}`}
      {...attributes}
      {...listeners}
    >
      <span className="task__num" style={{ color: person.color }}>{num}</span>
      <div className="task__body">
        <span className="task__title">{task.title}</span>
        {task.description && <p className="task__desc">{task.description}</p>}
        <div className="task__meta">
          <button
            className={`task__status task__status--${task.status}`}
            onClick={(e) => { e.stopPropagation(); onCycleStatus(task) }}
            title="Click to change status"
          >
            {STATUS_LABELS[task.status] || task.status}
          </button>
          <DatePicker task={task} personColor={person.color} />
        </div>
      </div>
      {task.doc && (
        <a href={task.doc} target="_blank" rel="noopener noreferrer" className="task__doc" title="View source document"
          onClick={(e) => e.stopPropagation()}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </a>
      )}
    </div>
  )
}

