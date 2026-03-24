// src/renderer/src/components/ui/DateInput.tsx
// Text input with auto MM/DD/YYYY formatting + native picker fallback via calendar icon

import { useState, useRef, useEffect } from 'react'
import { Calendar } from 'lucide-react'

interface DateInputProps {
  value: string           // YYYY-MM-DD (same as <input type="date">)
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export default function DateInput({ value, onChange, placeholder, className }: DateInputProps) {
  const [displayValue, setDisplayValue] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const hiddenDateRef = useRef<HTMLInputElement>(null)

  // Sync external value → display when not actively typing
  useEffect(() => {
    if (isFocused) return
    if (!value) { setDisplayValue(''); return }
    const [y, m, d] = value.split('-')
    if (y && m && d) setDisplayValue(`${m}/${d}/${y}`)
    else setDisplayValue('')
  }, [value, isFocused])

  function handleTextChange(raw: string) {
    const digits = raw.replace(/\D/g, '')

    let formatted = ''
    if (digits.length <= 2) {
      formatted = digits
    } else if (digits.length <= 4) {
      formatted = digits.slice(0, 2) + '/' + digits.slice(2)
    } else {
      formatted = digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4, 8)
    }
    setDisplayValue(formatted)

    if (digits.length === 8) {
      const mm = digits.slice(0, 2)
      const dd = digits.slice(2, 4)
      const yyyy = digits.slice(4, 8)
      const numM = parseInt(mm)
      const numD = parseInt(dd)
      const numY = parseInt(yyyy)
      if (numM >= 1 && numM <= 12 && numD >= 1 && numD <= 31 && numY >= 2020 && numY <= 2099) {
        onChange(`${yyyy}-${mm}-${dd}`)
      }
    }

    if (digits.length === 0) onChange('')
  }

  function handleBlur() {
    setIsFocused(false)
    if (!value) { setDisplayValue(''); return }
    const [y, m, d] = value.split('-')
    if (y && m && d) setDisplayValue(`${m}/${d}/${y}`)
  }

  function openNativePicker() {
    hiddenDateRef.current?.showPicker()
  }

  function handleNativeChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange(e.target.value)
  }

  return (
    <div className="relative flex items-center">
      <input
        type="text"
        value={displayValue}
        onChange={(e) => handleTextChange(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={handleBlur}
        placeholder={placeholder ?? 'MM/DD/YYYY'}
        maxLength={10}
        className={className ?? 'w-full rounded-lg border border-gray-200 bg-white px-2 py-1 pr-7 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:outline-none focus:border-green-500'}
      />
      <button
        type="button"
        onClick={openNativePicker}
        className="absolute right-1 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        tabIndex={-1}
      >
        <Calendar size={14} />
      </button>
      <input
        ref={hiddenDateRef}
        type="date"
        value={value}
        onChange={handleNativeChange}
        className="absolute inset-0 opacity-0 pointer-events-none"
        tabIndex={-1}
      />
    </div>
  )
}
