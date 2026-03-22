# OpenPOS - Modern Cross-Platform Point of Sale System

OpenPOS is organized as a Bun workspace monorepo with three runnable applications:

- `apps/desktop`: Electron + Preact POS client
- `apps/api`: Hono API for remote sync and auth flows
- `apps/landing`: Astro marketing site

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
- Multi-language support (currently English and Spanish)
- **Auto-update system** with signed updates and background checking

## Tech Stack

- **Desktop app**: Electron, Preact, TypeScript, Vite
- **API**: Hono, TypeScript
- **Landing**: Astro, Tailwind CSS
- **Database**: SQLite locally, Turso remotely
- **Package manager**: Bun workspaces

## Platform Support

| Platform | Status | Distribution |
|----------|--------|--------------|
| **Linux** | ✅ Full Support | Official releases (AppImage, .deb) |
| **macOS** | ⚠️ Development Only | Build from source |
| **Windows** | ⚠️ Development Only | Build from source |

> **Note**: macOS and Windows builds require code signing certificates for proper distribution. Official releases are provided for Linux only. macOS and Windows users can build from source for local development.

## Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) (v20+ recommended)
- [bun](https://bun.io/)

### Installation

#### Linux (Recommended)

Download the latest release from [GitHub Releases](https://github.com/dancaldera/OpenPOS/releases/latest):
- **AppImage**: Universal Linux package (recommended)
- **.deb**: Debian/Ubuntu package

#### Build from Source (All Platforms)

```bash
git clone <repository-url>
cd openpos
bun install

# Desktop app + Electron shell
bun run dev

# API only
bun run dev:api

# Landing site only
bun run dev:landing
```

The desktop renderer runs on `http://localhost:1420` during development.

Run `bun install` before any `bun run ...` script in a fresh clone. The root validation entrypoint is `bun run check`, and the root test entrypoint is `bun run test`.

### Desktop Runtime Config

For AppImage installs:

```bash
sudo mv openpos.AppImage /usr/local/bin/openpos
chmod +x /usr/local/bin/openpos
mkdir -p ~/.config/com.openpos.app
```

Then create the runtime config file at `~/.config/com.openpos.app/config.json`:

```json
{
  "tursoDatabaseUrl": "libsql://your-db.turso.io",
  "tursoAuthToken": "your-token-here",
  "apiUrl": "https://your-api.example.com",
  "printerCommand": "lp",
  "printerArgs": []
}
```

Include only the fields needed for that install. Public production desktop installs do not require any env vars by default.

Desktop config precedence is:
1. `~/.config/com.openpos.app/config.json`
2. Runtime env vars (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `VITE_API_URL`) for local development or internal CI only
3. Local SQLite fallback when no remote config is present

`OPENPOS_PRINTER_COMMAND` is an optional non-secret runtime override for packaged desktop installs and defaults to `lp`.

Public GitHub releases must not embed `TURSO_AUTH_TOKEN`, `JWT_SECRET`, or other backend secrets.

## Workspace Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start the desktop app in Electron |
| `bun run dev:desktop:web` | Start the desktop renderer in a browser |
| `bun run dev:api` | Start the API server |
| `bun run dev:landing` | Start the landing site |
| `bun run build:desktop` | Build the desktop app bundle |
| `bun run build:desktop:web` | Build the desktop web target |
| `bun run build:api` | Build the API |
| `bun run build:landing` | Build the landing site |
| `bun run check` | Run desktop and API checks |
| `bun run test` | Run the initial desktop and API test suites |

## Default Credentials

| Role | Username | Password | Permissions |
|------|----------|----------|-------------|
| Admin | `admin` | `admin` | Full system access |
| Manager | `manager` | `manager` | Limited administrative access |
| User | `user` | `user` | Basic POS operations |

## Project Structure

```text
openpos/
├── apps/
│   ├── desktop/                 # Electron + Preact POS app
│   │   ├── electron/            # Main/preload process and migrations
│   │   └── src/                 # Renderer source
│   ├── api/                     # Hono API
│   └── landing/                 # Astro marketing site
├── scripts/                     # Repository operational scripts
├── docs/                        # Project documentation
├── AGENTS.md                    # Repository guidance
└── README.md
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
# 1. Bump the desktop version
bun run version:bump 0.X.X

# 2. Build the Linux desktop bundle
bun run build:desktop

# 3. Create GitHub release with Linux artifacts
gh release create v0.X.X \
  apps/desktop/dist-electron/*.deb \
  apps/desktop/dist-electron/*.AppImage \
  --title "v0.X.X - Your Title" \
  --notes "Release notes here"
```

**Required GitHub Secrets:**
- `GITHUB_TOKEN` - Provided automatically by GitHub Actions for release publishing
- `TAURI_SIGNING_PRIVATE_KEY` - Private signing key content
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` - Key password (if set)

**Do not inject into public desktop release builds:**
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `JWT_SECRET`
- `ALLOWED_ORIGIN`
- `VITE_API_URL`

Those values are runtime or web/API configuration, not desktop release build inputs. If a production desktop install should use Turso, distribute `config.json` through your private operational process after install instead of baking secrets into the artifact.

## Internationalization

OpenPOS currently supports 2 languages with dynamic switching and persistent preferences.

**Supported Languages**: English (default), Spanish

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make changes and run `bun check`
4. Commit: `git commit -m 'Add amazing feature'`
5. Push and open a Pull Request

**Development Guidelines**
- Use existing UI components from `apps/desktop/src/components/ui/`
- Add translation keys for all user-facing text
- Use SQLite services for data persistence
- Test role-based features with different accounts
- Ensure responsive design across screen sizes

## License

MIT License - see [LICENSE](./LICENSE) for details.

## Resources

- [Electron Documentation](https://www.electronjs.org/docs/latest/)
- [Preact Documentation](https://preactjs.com/)
- [TRANSLATIONS.md](./TRANSLATIONS.md) - i18n implementation
- [AGENTS.md](./AGENTS.md) - Project architecture for contributors
