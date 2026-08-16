import { computed, signal } from '@preact/signals'
import type { User } from '../../services/auth-turso'

// Auth state signals
export const user = signal<User | null>(null)
export const isLoading = signal(false)
export const error = signal<string | null>(null)

// Computed values
export const isAuthenticated = computed(() => !!user.value)
export const isAdmin = computed(() => user.value?.role === 'admin')
export const isManager = computed(() => user.value?.role === 'manager')
export const isUser = computed(() => user.value?.role === 'user')
