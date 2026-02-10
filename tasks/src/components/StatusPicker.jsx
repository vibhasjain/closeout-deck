import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from './Popover'

const STATUSES = [
  { value: 'todo', label: 'to do', color: '#a1a1aa', bg: '#27272a' },
  { value: 'in-progress', label: 'in progress', color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.12)' },
  { value: 'done', label: 'done', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.12)' },
]

export function StatusPicker({ task, onChangeStatus }) {
  const [open, setOpen] = useState(false)
  const current = STATUSES.find(s => s.value === task.status) || STATUSES[0]

  function handleSelect(status) {
    setOpen(false)
    if (status !== task.status) {
      onChangeStatus(task, status)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={`task__status task__status--${task.status}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {current.label}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="status-picker"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {STATUSES.map(s => (
          <button
            key={s.value}
            className={`status-picker__option ${s.value === task.status ? 'status-picker__option--active' : ''}`}
            style={{ '--status-color': s.color, '--status-bg': s.bg }}
            onClick={() => handleSelect(s.value)}
          >
            <span className="status-picker__dot" />
            {s.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}
