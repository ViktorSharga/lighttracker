import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merges class names using clsx and tailwind-merge
 * This ensures Tailwind classes are properly merged without conflicts
 *
 * @param inputs - Class values to merge
 * @returns Merged class string
 *
 * @example
 * cn('px-4 py-2', 'px-6') // => 'py-2 px-6'
 * cn('text-red-500', isActive && 'text-blue-500') // => 'text-blue-500' (if isActive is true)
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
