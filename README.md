# Post POS - Point of Sale Application

A comprehensive Point of Sale (POS) desktop application built with modern technologies. Features role-based authentication, real-time dashboard analytics, complete inventory management, and customer relationship management in a sleek, responsive interface.

## ✨ Features

### 🔐 Authentication & Security
- Role-based access control (Admin, Manager, User)
- Secure authentication with permission-based features
- Protected routes and role-specific UI elements

### 📊 Dashboard & Analytics
- Real-time sales statistics and metrics
- Revenue tracking and order analytics
- Inventory alerts for low stock products
- Comprehensive business overview

### 🛍️ Sales & Order Management
- Complete order processing system
- Customer order history tracking
- Order status management
- Payment processing integration ready

### 📦 Inventory Management
- Product catalog with categories
- Stock level monitoring
- Product CRUD operations
- Inventory alerts and reporting

### 👥 Customer Management
- Customer database and profiles
- Purchase history tracking
- Customer relationship management
- Member and loyalty program support

### 🎨 Modern UI/UX
- Glass morphism design with Tailwind CSS v4
- Fully responsive across all screen sizes
- Consistent design system and component library
- Pagination component for large data sets
- Advanced data tables with sorting and filtering
- Modal dialogs and form components
- Intuitive navigation and user experience
- Loading states and error handling

### 🌐 Internationalization (i18n)
- Multi-language support with 8 languages (EN, ES, FR, DE, IT, PT, ZH, JA)
- Dynamic language switching with persistent preferences
- Comprehensive translation system with interpolation support
- RTL (Right-to-Left) language support
- Localized date and currency formatting
- Company-wide and user-specific language settings

## 🛠️ Tech Stack

- **Frontend**: Preact + TypeScript with Preact Signals
- **Backend**: Tauri v2 (Rust)
- **Styling**: Tailwind CSS v4
- **State Management**: Preact Signals
- **Build Tool**: Vite
- **Package Manager**: pnpm

## 📋 Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher)
- [pnpm](https://pnpm.io/) (recommended package manager)
- [Rust](https://rustup.rs/) (for Tauri backend)

## 🚀 Getting Started

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd post-pos
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Start development server**
   ```bash
   pnpm tauri dev
   ```

The application will open as a desktop app with the frontend served on `http://localhost:1420`.

## 📜 Available Scripts

### Development
- `pnpm tauri dev` - Start full development environment (frontend + backend)
- `pnpm dev` - Start Vite development server (frontend only)
- `pnpm preview` - Preview built application

### Build & Deploy
- `pnpm build` - Build frontend only
- `pnpm tauri build` - Build complete application for production
- `pnpm tauri bundle` - Generate platform-specific installers

### Tauri Commands
- `pnpm tauri info` - Show environment information
- `pnpm tauri android` - Android development commands
- `pnpm tauri ios` - iOS development commands

## 🏗️ Project Structure

```
post-pos/
├── src/                          # Frontend source code
│   ├── components/               # Reusable UI components
│   │   ├── Layout.tsx           # Main layout with navigation
│   │   └── ui/                  # UI component library
│   │       ├── Button.tsx       # Button component
│   │       ├── Input.tsx        # Input components
│   │       ├── Table.tsx        # Data table component
│   │       ├── Dialog.tsx       # Modal dialogs
│   │       ├── Pagination.tsx   # Data pagination component
│   │       ├── Select.tsx       # Dropdown select component
│   │       ├── LanguageSelector.tsx # Language selection component
│   │       └── ...              # Other UI components
│   ├── pages/                   # Application pages
│   │   ├── Dashboard.tsx        # Main dashboard overview
│   │   ├── Analytics.tsx        # Advanced analytics and reporting
│   │   ├── Orders.tsx           # Order management
│   │   ├── Products.tsx         # Product catalog
│   │   ├── Members.tsx          # Member and customer management
│   │   ├── Settings.tsx         # Application settings
│   │   └── SignIn.tsx           # Authentication page
│   ├── services/                # Business logic services (SQLite-based)
│   │   ├── auth-sqlite.ts       # Authentication service
│   │   ├── dashboard-sqlite.ts  # Dashboard data service
│   │   ├── analytics-sqlite.ts  # Analytics and reporting service
│   │   ├── products-sqlite.ts   # Product management
│   │   ├── users-sqlite.ts      # User management service
│   │   ├── orders-sqlite.ts     # Order processing
│   │   ├── company-settings-sqlite.ts # Company configuration
│   │   └── translations.ts      # Translation and i18n service
│   ├── stores/                  # State management
│   │   ├── auth/                # Authentication store
│   │   │   ├── authStore.ts     # Auth state
│   │   │   └── authActions.ts   # Auth actions
│   │   └── language/            # Language/i18n store
│   │       ├── languageStore.ts # Language state
│   │       └── languageActions.ts # Language actions
│   ├── hooks/                   # Custom React hooks
│   │   ├── useAuth.ts           # Authentication hook
│   │   └── useTranslation.ts    # Translation and i18n hook
│   ├── locales/                 # Translation files
│   │   ├── en.json              # English (default)
│   │   ├── es.json              # Spanish
│   │   ├── fr.json              # French
│   │   ├── de.json              # German
│   │   ├── it.json              # Italian
│   │   ├── pt.json              # Portuguese
│   │   ├── zh.json              # Chinese (Simplified)
│   │   ├── ja.json              # Japanese
│   │   └── index.ts             # Locale configuration
│   ├── App.tsx                  # Main application component
│   └── main.tsx                 # Application entry point
├── src-tauri/                   # Tauri/Rust backend
│   ├── src/                     # Rust source code
│   │   ├── main.rs              # Application entry point
│   │   └── lib.rs               # Tauri commands and setup
│   ├── capabilities/            # Security capabilities
│   ├── icons/                   # Application icons
│   └── tauri.conf.json          # Tauri configuration
├── public/                      # Static assets
├── AGENTS.md                    # Detailed project documentation
├── CLAUDE.md                    # Claude Code instructions
├── TRANSLATIONS.md              # Internationalization guide
└── README.md                    # This file
```

## 🔑 Default Login Credentials

The application includes mock authentication with three role levels:

### Admin Account
- **Username:** `admin`
- **Password:** `admin`
- **Permissions:** Full system access

### Manager Account
- **Username:** `manager`
- **Password:** `manager`
- **Permissions:** Limited administrative access

### User Account
- **Username:** `user`
- **Password:** `user`
- **Permissions:** Basic POS operations

## 🌐 Architecture

### Frontend Architecture
- **Component-based**: Modular Preact components with TypeScript
- **State Management**: Preact Signals for reactive state
- **Service Layer**: Singleton services for business logic
- **Hook Pattern**: Custom hooks for shared logic
- **Responsive Design**: Mobile-first approach with Tailwind CSS

### Backend Architecture
- **Tauri Framework**: Rust-based backend with security-first approach
- **Cross-platform**: Native performance on Windows, macOS, and Linux
- **Secure Communication**: IPC between frontend and backend
- **File System Access**: Controlled file operations

### Security Features
- **Role-based Access Control**: Three-tier permission system
- **Route Protection**: Authentication-based navigation
- **Secure Storage**: Local data persistence with encryption ready
- **CSP Ready**: Content Security Policy support for production

## 🚀 Development Workflow

### Setting up Development Environment

1. **Environment Variables**
   ```bash
   # Create .env file (if needed for API endpoints)
   cp .env.example .env
   ```

2. **Development Server**
   ```bash
   # Start with hot reload
   pnpm tauri dev
   
   # Frontend only (for UI development)
   pnpm dev
   ```

3. **Code Quality**
   ```bash
   # Type checking
   pnpm tsc --noEmit
   
   # Linting with Biome
   pnpm lint
   
   # Format code
   pnpm format
   
   # Run all checks (lint + format + organize imports)
   pnpm check
   ```

### Building for Production

1. **Development Build**
   ```bash
   pnpm tauri build --debug
   ```

2. **Production Build**
   ```bash
   pnpm tauri build
   ```

3. **Platform-specific Builds**
   ```bash
   # Generate installers for current platform
   pnpm tauri bundle
   ```

## 🤝 Contributing

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Make your changes** following the existing code style
4. **Test your changes** thoroughly
5. **Commit your changes**: `git commit -m 'Add amazing feature'`
6. **Push to the branch**: `git push origin feature/amazing-feature`
7. **Open a Pull Request**

### Development Guidelines
- Follow TypeScript strict mode requirements
- Use existing UI components from `src/components/ui/`
- Maintain consistent code formatting with Biome
- Test across different screen sizes and languages
- Ensure role-based features work correctly
- Use SQLite services for data persistence
- Implement proper internationalization for new features
- Run `pnpm check` before committing changes
- Follow existing patterns for service architecture
- Add translation keys for all user-facing text

## 📱 Cross-Platform Support

### Desktop Platforms
- **Windows**: Windows 10+ (x64, ARM64)
- **macOS**: macOS 10.15+ (Intel, Apple Silicon)
- **Linux**: Most distributions (x64, ARM64)

### Mobile Support (Future)
- **iOS**: Planned support via Tauri Mobile
- **Android**: Planned support via Tauri Mobile

## 🌐 Internationalization

The application supports multiple languages with a comprehensive translation system. See [TRANSLATIONS.md](./TRANSLATIONS.md) for detailed implementation guide.

### Supported Languages
- 🇺🇸 English (default)
- 🇪🇸 Spanish (Español)
- 🇫🇷 French (Français)
- 🇩🇪 German (Deutsch)
- 🇮🇹 Italian (Italiano)
- 🇵🇹 Portuguese (Português)
- 🇨🇳 Chinese (中文)
- 🇯🇵 Japanese (日本語)

### Translation Features
- Dynamic language switching
- Persistent language preferences
- Interpolation and pluralization support
- RTL language support
- Localized formatting for dates and currency
- Comprehensive fallback system

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🔗 Additional Resources

- [Tauri Documentation](https://tauri.app/v1/guides/)
- [Preact Documentation](https://preactjs.com/)
- [Tailwind CSS Documentation](https://tailwindcss.com/)
- [TypeScript Documentation](https://www.typescriptlang.org/)
- [Internationalization Guide](./TRANSLATIONS.md)

## 📞 Support

For support and questions:
- Check the [AGENTS.md](./AGENTS.md) file for detailed project documentation
- Review the [TRANSLATIONS.md](./TRANSLATIONS.md) for i18n implementation
- Review existing issues before creating new ones
- Follow the contributing guidelines for pull requests

---

Built with ❤️ using modern web technologies and Rust
