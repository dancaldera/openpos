# OpenPOS - Point of Sale App

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
- **Auto-update system** with signed updates and background checking

## Tech Stack

- **Frontend**: Preact + TypeScript with Preact Signals
- **Backend**: Tauri v2.8 (Rust)
- **Database**: SQLite with `@tauri-apps/plugin-sql` v2.3
- **Styling**: Tailwind CSS v4
- **Build Tool**: Vite
- **Package Manager**: bun

## Platform Support

| Platform | Status | Distribution |
|----------|--------|--------------|
| **Linux** | ✅ Full Support | Official releases (AppImage, .deb) |
| **macOS** | ⚠️ Development Only | Build from source |
| **Windows** | ⚠️ Development Only | Build from source |

> **Note**: macOS and Windows builds require code signing certificates for proper distribution. Official releases are provided for Linux only. macOS and Windows users can build from source for local development.

## Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) (v16+)
- [bun](https://bun.io/)
- [Rust](https://rustup.rs/)

### Installation

#### Linux (Recommended)

Download the latest release from [GitHub Releases](https://github.com/dancaldera/OpenPOS/releases/latest):
- **AppImage**: Universal Linux package (recommended)
- **.deb**: Debian/Ubuntu package

#### Build from Source (All Platforms)

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

## Auto-Update System

OpenPOS includes an integrated auto-update system for Linux that automatically checks for new versions and allows one-click updates.

**Features:**
- Automatic background checking (every 24 hours)
- Non-intrusive badge notification when updates are available
- Download progress tracking with visual feedback
- One-click install and restart

**How It Works:**
1. The app checks for updates on startup (after 30 seconds)
2. When an update is found, a blue badge appears in the bottom-left corner
3. Click the badge to open the update dialog
4. Download the update and restart to apply

**For Developers - Creating a Release:**

```bash
# 1. Bump version in src-tauri/tauri.conf.json
# 2. Build the application (Linux only)
bun tauri build

# 3. Create GitHub release with Linux artifacts
gh release create v0.X.X \
  src-tauri/target/release/bundle/deb/openpos_0.X.X_amd64.deb \
  src-tauri/target/release/bundle/appimage/openpos_0.X.X_amd64.AppImage \
  src-tauri/target/release/bundle/appimage/linux-x86_64.json \
  --title "v0.X.X - Your Title" \
  --notes "Release notes here"
```

**Required GitHub Secrets:**
- `TAURI_SIGNING_PRIVATE_KEY` - Private signing key content
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` - Key password (if set)

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
