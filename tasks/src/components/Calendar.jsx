import { ChevronLeft, ChevronRight } from 'lucide-react'
import { DayPicker } from 'react-day-picker'
import { cn } from '../lib/utils'

function Calendar({ className, classNames, showOutsideDays = true, ...props }) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        months: 'flex flex-col sm:flex-row gap-2',
        month: 'flex flex-col gap-4',
        month_caption: 'flex justify-center pt-1 relative items-center h-7',
        caption_label: 'text-xs font-medium text-zinc-300',
        nav: 'flex items-center gap-1',
        button_previous: 'absolute left-1 top-0 inline-flex items-center justify-center rounded size-7 bg-transparent text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors cursor-pointer',
        button_next: 'absolute right-1 top-0 inline-flex items-center justify-center rounded size-7 bg-transparent text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors cursor-pointer',
        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday: 'text-zinc-500 rounded-md w-8 font-normal text-[0.65rem]',
        week: 'flex w-full mt-1',
        day: 'relative p-0 text-center text-[0.7rem] focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-emerald-500/20 [&:has([aria-selected])]:rounded-md',
        day_button: cn(
          'inline-flex items-center justify-center rounded-md size-8 font-normal transition-colors cursor-pointer',
          'hover:bg-zinc-800 hover:text-zinc-100',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500',
          'aria-selected:bg-emerald-600 aria-selected:text-white aria-selected:hover:bg-emerald-500',
        ),
        range_end: 'day-range-end',
        selected: 'bg-emerald-500/20 text-emerald-400 rounded-md',
        today: 'bg-zinc-800 text-zinc-100 rounded-md',
        outside: 'text-zinc-700 aria-selected:text-zinc-400',
        disabled: 'text-zinc-700',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) => {
          const Icon = orientation === 'left' ? ChevronLeft : ChevronRight
          return <Icon className="size-4" />
        },
      }}
      {...props}
    />
  )
}

export { Calendar }
