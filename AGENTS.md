# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Post POS is a modern Point of Sale (POS) application built as a cross-platform desktop application using Tauri framework. It combines a Rust backend with a Preact + TypeScript frontend, styled with Tailwind CSS.

## Technology Stack

- **Frontend**: Preact + TypeScript with Tailwind CSS v4
- **Backend**: Tauri v2 (Rust)
- **Database**: SQLite with Tauri SQL Plugin
- **State Management**: Preact Signals
- **Internationalization**: Custom lightweight i18n solution
- **Build Tool**: Vite
- **Package Manager**: pnpm
- **Code Quality**: Biome (linting, formatting, import organization)

## Common Development Commands

### Development
- `pnpm tauri dev` - Start full development environment (frontend + backend)
- `pnpm dev` - Start Vite development server (frontend only, runs on port 1420)
- `pnpm preview` - Preview built application

### Build & Deploy
- `pnpm build` - Build frontend only
- `pnpm tauri build` - Build complete application for production
- `pnpm tauri bundle` - Generate platform-specific installers

### Tauri Commands
- `pnpm tauri info` - Show environment information
- `pnpm tauri android` - Android development commands
- `pnpm tauri ios` - iOS development commands

## Architecture Overview

### Frontend Structure
```
src/
├── components/
│   ├── Layout.tsx        # Main layout with sidebar navigation
│   └── ui/               # Reusable UI components (Button, Input, etc.)
├── pages/                # Application pages (Dashboard, Sales, Products, etc.)
├── hooks/                # Custom hooks (useAuth)
├── services/             # API services (auth, products)
├── stores/               # State management (authStore, authActions)
└── main.tsx              # Application entry point
```

### Backend Structure
```
src-tauri/
├── src/
│   ├── main.rs          # Application entry point
│   └── lib.rs           # Tauri commands, setup, and SQLite migrations
├── capabilities/         # Security capabilities (includes SQL permissions)
└── tauri.conf.json      # Tauri configuration
```

## Key Architecture Patterns

### State Management
- **Preact Signals** for reactive state management
- **Store pattern** with separate store and action files
- **Singleton pattern** for services (AuthService, ProductService)

### Authentication & Authorization
- Role-based access control (admin, manager, user)
- Permission-based feature access
- SQLite-based authentication with localStorage persistence
- Route protection based on authentication status
- Default test users seeded in database

### Component Architecture
- Reusable UI components in `src/components/ui/`
- Page components in `src/pages/`
- Layout component handling navigation and role-based menu items

### Service Layer
- Singleton services for business logic
- SQLite database with persistent storage
- Full CRUD operations with database transactions
- Search and filtering capabilities
- Database migrations and seeding

### Database Architecture
- **SQLite Database**: Local-first storage with `postpos.db`
- **Migration System**: Versioned database schema updates
- **Seeded Data**: Default users, customers, and products for development
- **Tables**: 
  - `users` - Authentication and role management
  - `customers` - Customer information and loyalty tracking
  - `products` - Product catalog with inventory and pricing

## Configuration Details

### Development Server
- Frontend runs on `http://localhost:1420`
- HMR enabled with WebSocket on `ws://localhost:1421`
- Tauri expects fixed port 1420, will fail if not available

### TypeScript Configuration
- Target: ES2020
- Strict mode enabled
- JSX support with Preact
- Module resolution: bundler

### Tauri Configuration
- Window size: 800x600 (resizable)
- Security: CSP disabled (for development)
- Bundle targets: all platforms
- SQL Plugin: Enabled with SQLite support
- Permissions: Core, opener, and SQL operations allowed

## Internationalization (i18n)

The application includes comprehensive multi-language support with the following features:

### Translation System
- **8 Supported Languages**: English (default), Spanish, French, German, Italian, Portuguese, Chinese (Simplified), Japanese
- **Custom i18n Solution**: Lightweight translation system optimized for Preact
- **Dynamic Language Switching**: Real-time language changes without page reload
- **Persistent Preferences**: Language settings stored in SQLite and localStorage
- **Interpolation Support**: Variable substitution in translations (e.g., "Welcome, {{name}}!")
- **Pluralization**: Support for plural forms based on count values
- **RTL Support**: Right-to-left language support preparation
- **Fallback System**: Graceful degradation to English for missing translations

### File Structure
```
src/locales/
├── en.json              # English (default/fallback)
├── es.json              # Spanish
├── fr.json              # French  
├── de.json              # German
├── it.json              # Italian
├── pt.json              # Portuguese
├── zh.json              # Chinese (Simplified)
├── ja.json              # Japanese
└── index.ts             # Locale configuration
```

### Key Components
- **Translation Service** (`src/services/translations.ts`): Core i18n functionality
- **Language Store** (`src/stores/language/`): State management for language preferences
- **Translation Hook** (`src/hooks/useTranslation.ts`): React hook for components
- **Language Selector** (`src/components/ui/LanguageSelector.tsx`): UI component for language switching

### Implementation Pattern
```typescript
// In components
const { t } = useTranslation()
return <h1>{t('dashboard.title')}</h1>

// With parameters
return <p>{t('welcome.message', { userName })}</p>
```

### Database Integration
- Language preferences stored in `company_settings` table
- User-specific preferences supported via `user_preferences` table
- Automatic language detection and persistence

### Development Guidelines
- **Always** add translation keys for new user-facing text
- Test with different languages during development
- Use nested JSON structure for organized translations
- Provide context comments for translators
- Follow consistent key naming conventions (camelCase)
- Test UI with longer translations (German, etc.)
- Use the `useTranslation` hook in all components
- Implement proper fallbacks for missing translations

## Key Features & Current State

### Authentication System
- Three roles: admin, manager, user with comprehensive permissions
- Role-based permissions and menu visibility
- SQLite-stored users with secure authentication
- Default test accounts:
  - admin@postpos.com / 123456
  - manager@postpos.com / 123456
  - user@postpos.com / 123456

### Customer & Member Management
- Full CRUD operations with SQLite persistence
- Dedicated Members page for enhanced customer management
- Customer information, contact details, and loyalty tracking
- Purchase history and analytics integration
- Advanced search and filtering with pagination
- Customer relationship management features

### Product Management
- Full CRUD operations with SQLite persistence
- Categories and inventory tracking
- Real-time search across multiple fields
- Stock level monitoring and alerts
- Pricing and cost management
- Barcode support for product identification

### Order Management
- Complete order processing system with SQLite persistence
- Order creation with multiple items and customer association
- Order status tracking and management
- Real-time order totals and calculations
- Order history and analytics integration
- Advanced order filtering and search capabilities

### Analytics & Reporting
- Comprehensive Analytics page with detailed business metrics
- Revenue tracking with configurable date ranges (7d, 30d, 90d, custom)
- Sales performance analytics by members and products
- Top-performing products and customer insights
- Recent activity tracking and monitoring
- Role-based access control (admin-only features)
- Company currency settings integration

### UI/UX
- Glass morphism design with Tailwind CSS v4
- Fully responsive design across all screen sizes
- Comprehensive component library with consistent styling
- Advanced pagination component for large datasets
- Loading states, error handling, and user feedback
- Modal dialogs and confirmation actions
- Real-time search and filtering across all data
- Data tables with sorting, filtering, and pagination
- Dropdown menus and select components

## Development Guidelines

### Code Organization
- Keep components small and focused with single responsibility
- Use TypeScript strict mode for comprehensive type safety
- Separate business logic into dedicated SQLite services
- Follow consistent naming conventions across the codebase
- Organize imports and use Biome for code quality
- Always add translation keys for user-facing text
- Use the `useTranslation` hook in all components

### Internationalization Guidelines
- **Always** implement translations for new features from the start
- Use the `useTranslation` hook in all components with user-facing text
- Add translation keys to appropriate language files (start with `en.json`)
- Test components with different languages to ensure UI handles text length variations
- Use interpolation for dynamic content: `t('welcome.message', { userName })`
- Implement pluralization for count-based text
- Provide context comments in translation files for translators
- Follow nested JSON structure for organized translations
- Use consistent key naming: `page.section.element`
- Test RTL languages if implementing RTL support
- Always provide fallback translations in English

### State Management
- Use Preact Signals for reactive state
- Keep state updates immutable
- Separate state and actions in store pattern

### UI Components
- Use existing UI components from `src/components/ui/`
- Follow the established design system
- Ensure responsive design with Tailwind classes

### Authentication Flow
- Always check authentication status before protected routes
- Use the useAuth hook for authentication state
- Implement role-based UI rendering

### Database Operations
- Use the service layer (`*-sqlite.ts`) for all database interactions
- Follow the established patterns for CRUD operations
- Handle errors gracefully with user-friendly messages
- Use transactions for complex operations
- Implement proper validation before database writes

### Service Architecture
- Prefer SQLite services over mock services for new features
- Use the singleton pattern for service instances
- Implement proper error handling and logging
- Follow async/await patterns for database operations
- Convert between database and UI data types appropriately

## File Structure & Naming Conventions

### Services
- **Mock Services**: `src/services/{entity}.ts` (legacy, being phased out)
- **SQLite Services**: `src/services/{entity}-sqlite.ts` (preferred for new development)
- **Pattern**: Always export both the service class and singleton instance

### Database Files
- **Location**: SQLite database stored in app config directory
- **Name**: `postpos.db`
- **Migrations**: Defined in `src-tauri/src/lib.rs`
- **Access**: Via `@tauri-apps/plugin-sql`

## Testing & Quality

### Code Quality Tools
- **Biome**: Integrated linting, formatting, and import organization
- **TypeScript**: Strict mode enabled for comprehensive type safety
- **Commands**: `pnpm lint`, `pnpm format`, `pnpm check`

### Database Testing
- Manual testing with comprehensive seeded data
- Database migrations tested on application startup
- CRUD operations validated through UI interactions
- Role-based access control tested across all features

### Quality Assurance
- Run `pnpm check` before committing changes
- Test role-based features with different user accounts
- Validate responsive design across screen sizes
- Ensure data persistence across application restarts
