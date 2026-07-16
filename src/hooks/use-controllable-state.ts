import * as React from 'react'

/**
 * Local replacement for Radix's use-controllable-state hook — the last
 * Radix dependency removed in the Base UI migration. Same semantics:
 *
 * - Controlled when `prop !== undefined`: the setter never writes internal
 *   state; it resolves updaters against `prop` and fires `onChange` only
 *   when the resolved value differs.
 * - Uncontrolled: plain `useState(defaultProp)`; `onChange` fires after a
 *   committed change (prev-value ref comparison), never on initial mount.
 * - The setter accepts a value or an updater function, like `setState`.
 * - `onChange` identity is kept in a ref so a fresh inline callback per
 *   render doesn't invalidate the setter.
 */
interface UseControllableStateParams<T> {
  prop?: T | undefined
  defaultProp: T
  onChange?: (value: T) => void
}

export function useControllableState<T>({
  prop,
  defaultProp,
  onChange,
}: UseControllableStateParams<T>): [T, (next: React.SetStateAction<T>) => void] {
  const [uncontrolledValue, setUncontrolledValue] = React.useState<T>(defaultProp)
  const isControlled = prop !== undefined
  const value = isControlled ? prop : uncontrolledValue

  const onChangeRef = React.useRef(onChange)
  React.useInsertionEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  // Uncontrolled changes notify after commit (mirrors radix: no call on mount).
  const prevValueRef = React.useRef(uncontrolledValue)
  React.useEffect(() => {
    if (prevValueRef.current !== uncontrolledValue) {
      prevValueRef.current = uncontrolledValue
      if (!isControlled) onChangeRef.current?.(uncontrolledValue)
    }
  }, [uncontrolledValue, isControlled])

  const setValue = React.useCallback(
    (next: React.SetStateAction<T>) => {
      if (isControlled) {
        const nextValue = typeof next === 'function' ? (next as (prev: T) => T)(prop as T) : next
        if (nextValue !== prop) onChangeRef.current?.(nextValue)
      } else {
        setUncontrolledValue(next)
      }
    },
    [isControlled, prop]
  )

  return [value, setValue]
}
