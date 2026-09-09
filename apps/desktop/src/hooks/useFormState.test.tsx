// @vitest-environment happy-dom

import { cleanup, render } from '@testing-library/preact'
import { act } from 'preact/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createCheckboxChangeHandler,
  createSelectChangeHandler,
  useFormState,
  type ValidationRules,
} from './useFormState'

type LoginForm = {
  email: string
  password: string
  age: number
  nickname: string
}

const initialValues: LoginForm = { email: '', password: '', age: 0, nickname: '' }

type Hook = ReturnType<typeof useFormState<LoginForm>>

function setup(rules?: Parameters<typeof useFormState<LoginForm>>[1]) {
  let captured: Hook | null = null
  function Probe() {
    captured = useFormState<LoginForm>(initialValues, rules)
    return null
  }
  render(<Probe />)
  return {
    get state(): Hook {
      if (!captured) throw new Error('hook did not render')
      return captured
    },
  }
}

function changeEvent(value: string, type = 'text'): Event {
  return { target: { value, type, checked: false } } as unknown as Event
}

afterEach(cleanup)

describe('useFormState values', () => {
  it('exposes initial values without errors', () => {
    const { state } = setup()

    expect(state.formData).toEqual(initialValues)
    expect(state.errors).toEqual({})
    expect(state.touched).toEqual({})
    expect(state.hasErrors).toBe(false)
  })

  it('sets a single field and clears its error', () => {
    const hook = setup()
    act(() => {
      hook.state.setErrors({ email: 'stale' })
    })
    act(() => {
      hook.state.setFieldValue('email', 'a@example.com')
    })

    expect(hook.state.formData.email).toBe('a@example.com')
    expect(hook.state.errors).toEqual({})
  })

  it('replaces all values with setFormData', () => {
    const hook = setup()
    const next = { email: 'b@example.com', password: 'secret', age: 30, nickname: 'bob' }

    act(() => {
      hook.state.setFormData(next)
    })

    expect(hook.state.formData).toEqual(next)
  })

  it('resets to initial values and clears errors', () => {
    const hook = setup()
    act(() => {
      hook.state.setFieldValue('email', 'dirty@example.com')
    })
    act(() => {
      hook.state.setErrors({ email: 'broken' })
    })
    act(() => {
      hook.state.reset()
    })

    expect(hook.state.formData.email).toBe('')
    expect(hook.state.errors).toEqual({})
    expect(hook.state.touched).toEqual({})
  })
})

describe('useFormState handleChange', () => {
  it('updates text inputs and marks the field touched', () => {
    const hook = setup()

    act(() => {
      hook.state.handleChange('email')(changeEvent('hello@example.com'))
    })

    expect(hook.state.formData.email).toBe('hello@example.com')
    expect(hook.state.touched.email).toBe(true)
  })

  it('reads checkbox state instead of value', () => {
    const hook = setup()

    act(() => {
      hook.state.handleChange('email')({
        target: { type: 'checkbox', checked: true, value: 'ignored' },
      } as unknown as Event)
    })

    expect(hook.state.formData.email).toBe(true)
  })
})

describe('useFormState validation', () => {
  const rules: ValidationRules<LoginForm> = {
    email: { required: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
    password: {
      required: true,
      validate: (value) => (typeof value === 'string' && value.length < 8 ? 'too short' : undefined),
    },
    age: { min: 18, max: 99 },
  }

  it('returns true without rules', () => {
    const { state } = setup()

    expect(state.validate()).toBe(true)
    expect(state.validateField('email')).toBeUndefined()
  })

  it('requires missing values', () => {
    const hook = setup(rules)

    expect(hook.state.validateField('email')).toBe('email is required')
    let valid = true
    act(() => {
      valid = hook.state.validate()
    })

    expect(valid).toBe(false)
    expect(hook.state.errors.email).toBe('email is required')
    expect(hook.state.hasErrors).toBe(true)
  })

  it('rejects invalid patterns', () => {
    const hook = setup(rules)
    act(() => {
      hook.state.setFieldValue('email', 'not-an-email')
    })

    expect(hook.state.validateField('email')).toBe('email format is invalid')
  })

  it('accepts valid values', () => {
    const hook = setup(rules)
    act(() => {
      hook.state.setFieldValue('email', 'ok@example.com')
    })
    act(() => {
      hook.state.setFieldValue('password', 'long-enough')
    })
    act(() => {
      hook.state.setFieldValue('age', 42)
    })

    expect(hook.state.validateField('email')).toBeUndefined()
    expect(hook.state.validateField('nickname')).toBeUndefined()
    let valid = false
    act(() => {
      valid = hook.state.validate()
    })

    expect(valid).toBe(true)
    expect(hook.state.errors).toEqual({})
  })

  it('enforces min and max for numbers', () => {
    const hook = setup(rules)
    act(() => {
      hook.state.setFieldValue('age', 12)
    })

    expect(hook.state.validateField('age')).toBe('age must be at least 18')

    act(() => {
      hook.state.setFieldValue('age', 120)
    })

    expect(hook.state.validateField('age')).toBe('age must be at most 99')
  })

  it('runs custom validators', () => {
    const hook = setup(rules)
    act(() => {
      hook.state.setFieldValue('password', 'short')
    })

    expect(hook.state.validateField('password')).toBe('too short')
  })

  it('validates and records a single field error', () => {
    const hook = setup(rules)
    let valid = true
    act(() => {
      valid = hook.state.validateAndSetError('email')
    })

    expect(valid).toBe(false)
    expect(hook.state.errors.email).toBe('email is required')
  })

  it('clears a single field error once it passes', () => {
    const hook = setup(rules)
    act(() => {
      hook.state.validateAndSetError('email')
    })
    act(() => {
      hook.state.setFieldValue('email', 'fixed@example.com')
    })

    let valid = false
    act(() => {
      valid = hook.state.validateAndSetError('email')
    })

    expect(valid).toBe(true)
    expect(hook.state.errors.email).toBeUndefined()
  })
})

describe('change handler factories', () => {
  it('forwards select values', () => {
    let received: string | null = null
    const handler = createSelectChangeHandler<string>((value) => {
      received = value
    })

    handler(changeEvent('es'))

    expect(received).toBe('es')
  })

  it('forwards checkbox state', () => {
    let received: boolean | null = null
    const handler = createCheckboxChangeHandler((checked) => {
      received = checked
    })

    handler({ target: { checked: true } } as unknown as Event)

    expect(received).toBe(true)
  })
})
