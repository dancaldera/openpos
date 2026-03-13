# OpenPOS - Point of Sale Application

A modern cross-platform POS desktop application with real-time analytics, inventory management, and customer relationship management.

## Features

**Authentication & Security**
- Role-based access control (Admin, Manager, User)
- Protected routes and permission-based features

**Business Operations**
- Complete order processing and tracking
- Product catalog with inventory management
- Customer profiles and purchase history
- Real-time dashboard analytics

**User Experience**
- Modern glass morphism UI with Tailwind CSS v4
- Fully responsive across all screen sizes
- Multi-language support (8 languages)

## Tech Stack

- **Frontend**: Preact + TypeScript with Preact Signals
- **Backend**: Tauri v2.8 (Rust)
- **Database**: SQLite with `@tauri-apps/plugin-sql` v2.3
- **Styling**: Tailwind CSS v4
- **Build Tool**: Vite
- **Package Manager**: bun

## Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) (v16+)
- [bun](https://bun.io/)
- [Rust](https://rustup.rs/)

### Installation

```bash
# Clone and install
git clone <repository-url>
cd OpenPOS
bun install

# Start development
bun tauri dev
```

The application will open as a desktop app on `http://localhost:1420`.

## Available Scripts

| Command | Description |
|---------|-------------|
| `bun tauri dev` | Start full development environment |
| `bun dev` | Start Vite dev server (frontend only) |
| `bun build` | Build frontend for production |
| `bun tauri build` | Build complete application |
| `bun tauri bundle` | Generate platform-specific installers |
| `bun check` | Run linting, formatting, and type checks |

## Default Credentials

| Role | Username | Password | Permissions |
|------|----------|----------|-------------|
| Admin | `admin` | `admin` | Full system access |
| Manager | `manager` | `manager` | Limited administrative access |
| User | `user` | `user` | Basic POS operations |

## Project Structure

```
OpenPOS/
├── src/                          # Frontend source
│   ├── components/               # UI components
│   │   ├── Layout.tsx           # Main layout
│   │   └── ui/                  # Reusable components
│   ├── pages/                   # Application pages
│   ├── services/                # Business logic (SQLite)
│   ├── stores/                  # State management
│   ├── hooks/                   # Custom hooks
│   ├── locales/                 # Translation files
│   └── main.tsx                 # Entry point
├── src-tauri/                   # Rust backend
│   ├── src/
│   │   ├── main.rs              # Entry point
│   │   └── lib.rs               # Tauri commands & migrations
│   ├── capabilities/            # Tauri v2 permissions
│   │   └── default.json         # Core, opener, SQL permissions
│   └── tauri.conf.json          # Tauri v2 configuration
├── AGENTS.md                    # Agent-focused documentation
├── CLAUDE.md                    # Claude Code instructions
├── TRANSLATIONS.md              # i18n implementation guide
└── README.md                    # This file
```

## Internationalization

OpenPOS supports 8 languages with dynamic switching and persistent preferences. See [TRANSLATIONS.md](./TRANSLATIONS.md) for implementation details.

**Supported Languages**: English (default), Spanish, French, German, Italian, Portuguese, Chinese, Japanese

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make changes and run `bun check`
4. Commit: `git commit -m 'Add amazing feature'`
5. Push and open a Pull Request

**Development Guidelines**
- Use existing UI components from `src/components/ui/`
- Add translation keys for all user-facing text
- Use SQLite services for data persistence
- Test role-based features with different accounts
- Ensure responsive design across screen sizes

## License

MIT License - see [LICENSE](./LICENSE) for details.

## Resources

- [Tauri Documentation](https://tauri.app/v1/guides/)
- [Preact Documentation](https://preactjs.com/)
- [TRANSLATIONS.md](./TRANSLATIONS.md) - i18n implementation
- [AGENTS.md](./AGENTS.md) - Project architecture for contributors

---

Built with ❤️ using modern web technologies and Rust
