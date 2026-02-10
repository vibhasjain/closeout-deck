import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Calendar } from './Calendar'
import { Popover, PopoverContent, PopoverTrigger } from './Popover'
import { supabase } from '../supabaseClient'

export function DatePicker({ task, personColor }) {
  const [open, setOpen] = useState(false)
  const currentDate = task.due ? parseISO(task.due) : undefined

  async function handleSelect(date) {
    setOpen(false)
    const newDue = date ? format(date, 'yyyy-MM-dd') : null
    await supabase.from('tasks').update({ due: newDue }).eq('id', task.id)
  }

  async function handleClear(e) {
    e.stopPropagation()
    setOpen(false)
    await supabase.from('tasks').update({ due: null }).eq('id', task.id)
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
