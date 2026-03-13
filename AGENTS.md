# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OpenPOS is a modern Point of Sale (POS) application built as a cross-platform desktop application using Tauri v2.8. It combines a Rust backend with a Preact + TypeScript frontend, styled with Tailwind CSS.

## Essential Commands

- `bun tauri dev` - Start full development environment (frontend + backend)
- `bun dev` - Start Vite development server (frontend only, port 1420)
- `bun build` - Build frontend for production
- `bun tauri build` - Build complete application
- `bun tauri bundle` - Generate platform-specific installers
- `bun check` - Run linting, formatting, and type checks

## Architecture

### State Management
- **Preact Signals** for reactive state
- **Store pattern** with separate store and action files
- **Singleton services** for business logic

### Authentication & Authorization
- Role-based access control (admin, manager, user)
- SQLite-based authentication with localStorage persistence
- Route protection and permission-based UI rendering

### Component Architecture
- Reusable UI components in `src/components/ui/`
- Page components in `src/pages/`
- Layout component handles navigation and role-based menus

### Service Layer
- Singleton services for business logic
- SQLite database with persistent storage
- Full CRUD operations with search and filtering
- Database migrations and seeding

### Database Architecture
- **SQLite**: Local-first storage with `postpos.db`
- **Access**: Via `@tauri-apps/plugin-sql` v2.3 (Tauri v2 SQL plugin)
- **Migrations**: Versioned schema updates in `src-tauri/src/lib.rs`
- **Tables**: `users`, `customers`, `products`, `orders`, `company_settings`
- **Permissions**: Configured in `src-tauri/capabilities/default.json`

## Configuration

- **Dev Server**: `http://localhost:1420` (fixed port required by Tauri)
- **TypeScript**: Strict mode, ES2020 target, Preact JSX
- **Tauri v2**: 1200x800 window (resizable), config schema v2
- **Plugins**: `@tauri-apps/plugin-opener` v2.5, `@tauri-apps/plugin-sql` v2.3
- **Capabilities**: Permissions defined in `src-tauri/capabilities/default.json`
- **Code Quality**: Biome for linting, formatting, import organization

## File Structure

```
src/
├── components/
│   ├── Layout.tsx              # Main layout with sidebar
│   └── ui/                     # Reusable UI components
├── pages/                      # Application pages
├── hooks/
│   ├── useAuth.ts              # Authentication hook
│   └── useTranslation.ts       # i18n hook
├── services/
│   ├── {entity}-sqlite.ts      # SQLite services (preferred)
│   └── translations.ts         # Translation service
├── stores/
│   ├── auth/                   # Auth store & actions
│   └── language/               # Language store & actions
├── locales/                    # Translation files (en.json, es.json, etc.)
└── main.tsx                    # Entry point

src-tauri/
├── src/
│   ├── main.rs                 # Application entry
│   └── lib.rs                  # Tauri commands, setup, migrations
├── capabilities/               # Tauri v2 permissions
│   └── default.json            # Core, opener, SQL permissions
└── tauri.conf.json             # Tauri v2 configuration
```

## Internationalization (i18n)

### Key Files
- `src/locales/*.json` - Translation files (en, es, fr, de, it, pt, zh, ja)
- `src/services/translations.ts` - Translation service
- `src/hooks/useTranslation.ts` - Translation hook
- `src/stores/language/` - Language state management

### Implementation Pattern

```typescript
// In components
const { t } = useTranslation()
return <h1>{t('dashboard.title')}</h1>

// With interpolation
return <p>{t('welcome.message', { userName })}</p>

// Pluralization
const key = count === 1 ? 'items.one' : 'items.other'
return <span>{t(key, { count })}</span>
```

### Translation File Format

```json
{
  "common": {
    "save": "Save",
    "cancel": "Cancel"
  },
  "dashboard": {
    "title": "Dashboard",
    "welcome": "Welcome, {{name}}!"
  }
}
```

### Supported Locales

```typescript
export const SUPPORTED_LOCALES = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇵🇹' },
  { code: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
]
```

### Best Practices
- Use nested structure: `page.section.element`
- Add translation keys for all user-facing text
- Test with different languages (especially longer ones like German)
- Use interpolation for dynamic content
- Follow camelCase key naming conventions

## Development Guidelines

### Code Organization
- Keep components small and focused
- Use TypeScript strict mode
- Separate business logic into SQLite services
- Run `bun check` before committing

### State Management
- Use Preact Signals for reactive state
- Keep state updates immutable
- Separate state and actions in store pattern

### UI Components
- Use existing components from `src/components/ui/`
- Follow the established design system
- Ensure responsive design with Tailwind

### Authentication
- Check authentication status before protected routes
- Use the `useAuth` hook for auth state
- Implement role-based UI rendering

### Database Operations
- Use `*-sqlite.ts` services for all database interactions
- Follow established CRUD patterns
- Handle errors gracefully
- Use transactions for complex operations

### Service Architecture
- Prefer SQLite services over mock services
- Use singleton pattern for service instances
- Follow async/await patterns
- Convert between database and UI data types appropriately

## File Naming Conventions

- **SQLite Services**: `src/services/{entity}-sqlite.ts` (preferred)
- **Mock Services**: `src/services/{entity}.ts` (legacy)
- Always export both service class and singleton instance
- Database: `postpos.db` in app config directory
- Migrations: Defined in `src-tauri/src/lib.rs`
- Capabilities: `src-tauri/capabilities/{name}.json` (Tauri v2 permissions)
