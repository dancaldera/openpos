# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OpenPOS is a Bun workspace monorepo. The main product is a cross-platform desktop POS application built with Electron and Preact, alongside a Hono API and an Astro landing site.

## Essential Commands

- `bun run dev` - Start the Electron desktop app
- `bun run dev:desktop:web` - Start the desktop renderer in a browser
- `bun run dev:api` - Start the API server
- `bun run dev:landing` - Start the landing site
- `bun run build:desktop` - Build the desktop app bundle
- `bun run build:api` - Build the API
- `bun run build:landing` - Build the landing site
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
- Reusable UI components in `apps/desktop/src/components/ui/`
- Page components in `apps/desktop/src/pages/`
- Layout component handles navigation and role-based menus

### Service Layer
- Singleton services for business logic
- SQLite database with persistent storage
- Full CRUD operations with search and filtering
- Database migrations and seeding

### Database Architecture
- **SQLite**: Local-first storage with `postpos.db`
- **Desktop Access**: Via Electron IPC + `better-sqlite3`
- **Migrations**: SQL files in `apps/desktop/electron/migrations/`
- **Tables**: `users`, `customers`, `products`, `orders`, `company_settings`
- **Remote Sync**: Turso via `@tursodatabase/serverless`

## Configuration

- **Workspace Layout**: Applications live under `apps/`
- **Dev Server**: `http://localhost:1420` for the desktop renderer
- **TypeScript**: Strict mode, ES2020 target, Preact JSX
- **Electron**: 1200x800 desktop window with preload IPC bridge
- **API**: Hono on Node/Bun runtime
- **Landing**: Astro site in its own workspace app
- **Code Quality**: Biome for linting, formatting, import organization

## File Structure

```text
apps/
├── desktop/
│   ├── electron/               # Main/preload process and migrations
│   ├── scripts/                # Desktop operational scripts
│   ├── src/                    # Preact renderer
│   └── package.json
├── api/
│   ├── src/                    # Hono routes and middleware
│   └── package.json
└── landing/
    ├── src/                    # Astro pages and layouts
    └── package.json
```

## Internationalization (i18n)

### Key Files
- `apps/desktop/src/locales/*.json` - Translation files (en, es, fr, de, it, pt, zh, ja)
- `apps/desktop/src/services/translations.ts` - Translation service
- `apps/desktop/src/hooks/useTranslation.ts` - Translation hook
- `apps/desktop/src/stores/language/` - Language state management

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
- Use existing components from `apps/desktop/src/components/ui/`
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

- **SQLite Services**: `apps/desktop/src/services/{entity}-sqlite.ts` (preferred)
- **Turso Services**: `apps/desktop/src/services/{entity}-turso.ts`
- Always export both service class and singleton instance
- Database: `postpos.db` in app config directory
- Migrations: `apps/desktop/electron/migrations/{schema,seeds}`
- Workspace apps: `apps/{desktop,api,landing}`
