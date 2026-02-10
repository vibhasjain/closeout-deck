import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Calendar } from './Calendar'
import { Popover, PopoverContent, PopoverTrigger } from './Popover'

export function DatePicker({ task, personColor, onUpdate }) {
  const [open, setOpen] = useState(false)
  const currentDate = task.due ? parseISO(task.due) : undefined

  function handleSelect(date) {
    setOpen(false)
    const newDue = date ? format(date, 'yyyy-MM-dd') : null
    onUpdate(task.id, { due: newDue })
  }

  function handleClear(e) {
    e.stopPropagation()
    setOpen(false)
    onUpdate(task.id, { due: null })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="task__due-btn"
          style={{ color: task.due ? personColor : '#3f3f46' }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {task.due ? format(currentDate, 'MMM d') : '+ date'}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <Calendar
          mode="single"
          selected={currentDate}
          onSelect={handleSelect}
          defaultMonth={currentDate}
        />
        {task.due && (
          <div className="border-t border-zinc-800 px-3 py-2">
            <button
              onClick={handleClear}
              className="text-[10px] text-zinc-500 hover:text-red-400 transition-colors font-mono cursor-pointer"
            >
              clear date
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
