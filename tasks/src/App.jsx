import { useState, useEffect, useCallback, useRef } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor,
  useSensor, useSensors, useDroppable, closestCenter,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from './supabaseClient'
import { DatePicker } from './components/DatePicker'
import { StatusPicker } from './components/StatusPicker'
import './App.css'

export default function App() {
  const [people, setPeople] = useState({})
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [flashIds, setFlashIds] = useState(new Set())
  const [connected, setConnected] = useState(false)
  const [activeTask, setActiveTask] = useState(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
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
      supabase.from('tasks').select('*').order('position', { ascending: true, nullsFirst: false }),
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

  // Optimistic update helper — update local state immediately, then persist
  function optimisticUpdate(taskId, fields) {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...fields } : t))
    supabase.from('tasks').update(fields).eq('id', taskId).then()
  }

  function changeStatus(task, newStatus) {
    optimisticUpdate(task.id, { status: newStatus })
  }

  async function addTask(personId, title, description) {
    const personTasks = tasks.filter(t => t.person === personId && t.status !== 'done')
    const position = personTasks.length + 1
    const { data } = await supabase
      .from('tasks')
      .insert({ title, description: description || null, person: personId, status: 'todo', position })
      .select()
      .single()
    if (data) {
      setTasks(prev => [...prev, data])
    }
  }

  async function deleteTask(taskId) {
    setTasks(prev => prev.filter(t => t.id !== taskId))
    await supabase.from('tasks').delete().eq('id', taskId)
  }

  // Find which person column a task belongs to
  const findContainer = useCallback((taskId) => {
    const task = tasks.find(t => t.id === taskId)
    return task?.person
  }, [tasks])

  function handleDragStart(event) {
    const task = tasks.find(t => t.id === event.active.id)
    setActiveTask(task || null)
  }

  function handleDragOver(event) {
    const { active, over } = event
    if (!over) return

    const activeId = active.id
    const overId = over.id

    const activeContainer = findContainer(activeId)
    // over could be a task ID or a person column ID
    const overContainer = findContainer(overId) || overId

    if (activeContainer && overContainer && activeContainer !== overContainer) {
      // Moving to a different column — update person optimistically
      setTasks(prev => prev.map(t =>
        t.id === activeId ? { ...t, person: overContainer } : t
      ))
    }
  }

  async function handleDragEnd(event) {
    setActiveTask(null)
    const { active, over } = event
    if (!over) return

    const activeId = active.id
    const overId = over.id

    const activeContainer = findContainer(activeId)
    const overContainer = findContainer(overId) || overId

    if (!activeContainer) return

    // Get tasks in the target column (non-done for todo tab)
    const columnTasks = tasks
      .filter(t => t.person === activeContainer && t.status !== 'done')
      .sort((a, b) => (a.position ?? 999) - (b.position ?? 999))

    const oldIndex = columnTasks.findIndex(t => t.id === activeId)
    const newIndex = columnTasks.findIndex(t => t.id === overId)

    if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
      // Reorder within column
      const reordered = arrayMove(columnTasks, oldIndex, newIndex)

      // Optimistic update
      const updates = reordered.map((t, i) => ({ ...t, position: i + 1 }))
      setTasks(prev => {
        const other = prev.filter(t => !(t.person === activeContainer && t.status !== 'done'))
        return [...other, ...updates]
      })

      // Persist all position changes
      for (const [i, t] of reordered.entries()) {
        await supabase.from('tasks').update({ position: i + 1 }).eq('id', t.id)
      }
    } else if (activeContainer !== overContainer) {
      // Cross-column move — persist person change
      const targetTasks = tasks
        .filter(t => t.person === overContainer && t.status !== 'done')
        .sort((a, b) => (a.position ?? 999) - (b.position ?? 999))
      const newPos = targetTasks.length + 1

      await supabase.from('tasks').update({ person: overContainer, position: newPos }).eq('id', activeId)
    }
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
        onDragOver={handleDragOver}
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
              onChangeStatus={changeStatus}
              onUpdate={optimisticUpdate}
              onAddTask={addTask}
              onDeleteTask={deleteTask}
              isDragActive={!!activeTask}
              isDragTarget={activeTask && activeTask.person !== key}
            />
          ))}
        </main>

        <DragOverlay dropAnimation={null}>
          {activeTask ? (
            <div className="task task--dragging">
              <span className="task__drag-handle">⠿</span>
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

function Column({ personId, person, tasks, flashIds, onChangeStatus, onUpdate, onAddTask, onDeleteTask, isDragActive, isDragTarget }) {
  const [tab, setTab] = useState('todo')
  const [adding, setAdding] = useState(false)
  const { setNodeRef, isOver } = useDroppable({ id: personId })

  const todoTasks = tasks.filter(t => t.status !== 'done').sort((a, b) => (a.position ?? 999) - (b.position ?? 999))
  const doneTasks = tasks.filter(t => t.status === 'done').sort((a, b) => (a.position ?? 999) - (b.position ?? 999))
  const displayTasks = tab === 'todo' ? todoTasks : doneTasks
  const taskIds = displayTasks.map(t => t.id)

  function handleAdd() {
    setTab('todo')
    setAdding(true)
  }

  async function handleSaveNew(title, description) {
    setAdding(false)
    if (title.trim()) {
      await onAddTask(personId, title.trim(), description.trim())
    }
  }

  function handleCancelNew() {
    setAdding(false)
  }

  return (
    <div
      ref={setNodeRef}
      className={`column ${isOver ? 'column--over' : ''} ${isDragTarget ? 'column--drop-target' : ''}`}
    >
      <div className="column__header">
        <div className="column__header-left">
          <span className="column__name" style={{ color: person.color }}>{person.name}</span>
          <button
            className="column__add-btn"
            style={{ color: person.color }}
            onClick={handleAdd}
            title="Add task"
          >
            +
          </button>
        </div>
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
        {adding && (
          <NewTaskCard
            person={person}
            onSave={handleSaveNew}
            onCancel={handleCancelNew}
          />
        )}
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          {displayTasks.length === 0 && !adding ? (
            <div className="section__empty">{tab === 'todo' ? 'no tasks' : 'nothing yet'}</div>
          ) : (
            displayTasks.map((task, i) => (
              <SortableTask
                key={task.id}
                task={task}
                num={i + 1}
                person={person}
                isFlashing={flashIds.has(task.id)}
                onChangeStatus={onChangeStatus}
                onUpdate={onUpdate}
                onDeleteTask={onDeleteTask}
              />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  )
}

function NewTaskCard({ person, onSave, onCancel }) {
  const titleRef = useRef(null)
  const descRef = useRef(null)

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSave(titleRef.current?.textContent || '', descRef.current?.textContent || '')
    }
    if (e.key === 'Escape') {
      onCancel()
    }
  }

  function handleBlur(e) {
    // Don't cancel if focus moves within the card
    const card = e.currentTarget.closest('.task--new')
    if (card && card.contains(e.relatedTarget)) return
    const title = titleRef.current?.textContent || ''
    if (title.trim()) {
      onSave(title, descRef.current?.textContent || '')
    } else {
      onCancel()
    }
  }

  return (
    <div className="task task--new">
      <span className="task__drag-handle" style={{ color: person.color, opacity: 0.15 }}>⠿</span>
      <div className="task__body">
        <span
          ref={titleRef}
          className="task__title task__title--editable"
          contentEditable
          suppressContentEditableWarning
          data-placeholder="task title"
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
        />
        <p
          ref={descRef}
          className="task__desc task__desc--editable"
          contentEditable
          suppressContentEditableWarning
          data-placeholder="description (optional)"
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
        />
        <div className="task__new-hint">enter to save · esc to cancel</div>
      </div>
    </div>
  )
}

function SortableTask({ task, num, person, isFlashing, onChangeStatus, onUpdate, onDeleteTask }) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: task.id })
  const [ctxMenu, setCtxMenu] = useState(null)
  const [editing, setEditing] = useState(false)
  const titleRef = useRef(null)
  const descRef = useRef(null)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  function handleContextMenu(e) {
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    setCtxMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }

  useEffect(() => {
    if (!ctxMenu) return
    function close() { setCtxMenu(null) }
    window.addEventListener('click', close)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [ctxMenu])

  function handleDelete() {
    setCtxMenu(null)
    onDeleteTask(task.id)
  }

  function startEditing() {
    if (editing) return
    setEditing(true)
  }

  useEffect(() => {
    if (editing && titleRef.current) {
      titleRef.current.focus()
      // Place cursor at end
      const sel = window.getSelection()
      sel.selectAllChildren(titleRef.current)
      sel.collapseToEnd()
    }
  }, [editing])

  function saveEdits() {
    const newTitle = titleRef.current?.textContent?.trim() || task.title
    const newDesc = descRef.current?.textContent?.trim() || ''
    setEditing(false)
    const fields = {}
    if (newTitle !== task.title) fields.title = newTitle
    if (newDesc !== (task.description || '')) fields.description = newDesc || null
    if (Object.keys(fields).length > 0) {
      onUpdate(task.id, fields)
    }
  }

  function handleEditKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      saveEdits()
    }
    if (e.key === 'Escape') {
      setEditing(false)
    }
  }

  function handleEditBlur(e) {
    const card = e.currentTarget.closest('.task')
    if (card && card.contains(e.relatedTarget)) return
    saveEdits()
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`task ${isFlashing ? 'task--flash' : ''} ${isDragging ? 'task--placeholder' : ''} ${editing ? 'task--editing' : ''}`}
      onContextMenu={handleContextMenu}
    >
      <span
        className="task__drag-handle"
        style={{ color: person.color }}
        {...attributes}
        {...listeners}
        title="Drag to reorder or move"
      >
        ⠿
      </span>
      <div className="task__body" onClick={startEditing}>
        {editing ? (
          <>
            <span
              ref={titleRef}
              className="task__title task__title--editable"
              contentEditable
              suppressContentEditableWarning
              onKeyDown={handleEditKeyDown}
              onBlur={handleEditBlur}
            >
              {task.title}
            </span>
            <p
              ref={descRef}
              className="task__desc task__desc--editable"
              contentEditable
              suppressContentEditableWarning
              data-placeholder="add description"
              onKeyDown={handleEditKeyDown}
              onBlur={handleEditBlur}
            >
              {task.description || ''}
            </p>
          </>
        ) : (
          <>
            <span className="task__title">{task.title}</span>
            {task.description && <p className="task__desc">{task.description}</p>}
          </>
        )}
        <div className="task__meta" onClick={(e) => e.stopPropagation()}>
          <StatusPicker task={task} onChangeStatus={onChangeStatus} />
          <DatePicker task={task} personColor={person.color} onUpdate={onUpdate} />
        </div>
      </div>
      {task.doc && (
        <a href={task.doc} target="_blank" rel="noopener noreferrer" className="task__doc" title="View source document">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </a>
      )}
      {ctxMenu && (
        <div className="task__ctx-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }}>
          <button className="task__ctx-menu-item task__ctx-menu-item--danger" onClick={handleDelete}>
            delete task
          </button>
        </div>
      )}
    </div>
  )
}
