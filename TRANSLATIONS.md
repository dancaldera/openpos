# TRANSLATIONS.md

Comprehensive guide for implementing and managing internationalization (i18n) in Post POS application.

## Overview

The Post POS application supports multiple languages through a comprehensive translation system that allows for easy localization and internationalization. The system is designed to be developer-friendly, performant, and easily maintainable.

## Architecture

### Core Components

1. **Translation Service** (`src/services/translations.ts`)
2. **Language Store** (`src/stores/language/`)
3. **Translation Hook** (`src/hooks/useTranslation.ts`)
4. **Translation Files** (`src/locales/`)
5. **Language Settings** (integrated with company settings)

### Technology Stack

- **Translation Library**: Custom lightweight i18n solution optimized for Preact
- **Storage**: SQLite for user preferences + localStorage for quick access
- **State Management**: Preact Signals for reactive language switching
- **File Format**: JSON files for translation keys
- **Fallback System**: English as default with graceful fallbacks

## File Structure

```
src/
├── locales/                     # Translation files
│   ├── en.json                  # English (default)
│   ├── es.json                  # Spanish
│   ├── fr.json                  # French
│   ├── de.json                  # German
│   ├── it.json                  # Italian
│   ├── pt.json                  # Portuguese
│   ├── zh.json                  # Chinese (Simplified)
│   ├── ja.json                  # Japanese
│   └── index.ts                 # Locale exports and configuration
├── services/
│   └── translations.ts          # Translation service and utilities
├── stores/
│   └── language/
│       ├── languageStore.ts     # Language state management
│       └── languageActions.ts   # Language actions and persistence
├── hooks/
│   └── useTranslation.ts        # Translation hook for components
└── components/
    └── ui/
        └── LanguageSelector.tsx  # Language selection component
```

## Translation File Format

### Basic Structure

Each translation file follows a nested JSON structure:

```json
{
  "common": {
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete",
    "edit": "Edit",
    "add": "Add",
    "search": "Search",
    "loading": "Loading...",
    "error": "Error",
    "success": "Success",
    "confirm": "Confirm",
    "close": "Close"
  },
  "navigation": {
    "dashboard": "Dashboard",
    "analytics": "Analytics",
    "orders": "Orders",
    "products": "Products",
    "members": "Members",
    "settings": "Settings",
    "signOut": "Sign Out"
  },
  "auth": {
    "signIn": "Sign In",
    "email": "Email",
    "password": "Password",
    "rememberMe": "Remember Me",
    "forgotPassword": "Forgot Password?",
    "invalidCredentials": "Invalid email or password",
    "welcomeBack": "Welcome back!"
  },
  "dashboard": {
    "title": "Dashboard",
    "totalRevenue": "Total Revenue",
    "totalOrders": "Total Orders",
    "activeCustomers": "Active Customers",
    "lowStock": "Low Stock Items",
    "recentOrders": "Recent Orders",
    "topProducts": "Top Products"
  },
  "products": {
    "title": "Products",
    "addProduct": "Add Product",
    "editProduct": "Edit Product",
    "productName": "Product Name",
    "category": "Category",
    "price": "Price",
    "stock": "Stock",
    "description": "Description",
    "barcode": "Barcode",
    "deleteConfirm": "Are you sure you want to delete this product?",
    "stockAlert": "Low stock alert for {{productName}}"
  },
  "orders": {
    "title": "Orders",
    "createOrder": "Create Order",
    "orderNumber": "Order #{{number}}",
    "customer": "Customer",
    "total": "Total",
    "status": "Status",
    "date": "Date",
    "items": "Items",
    "addItem": "Add Item",
    "checkout": "Checkout",
    "orderCreated": "Order created successfully"
  },
  "members": {
    "title": "Members",
    "addMember": "Add Member",
    "firstName": "First Name",
    "lastName": "Last Name",
    "email": "Email",
    "phone": "Phone",
    "loyaltyPoints": "Loyalty Points",
    "joinDate": "Join Date",
    "totalSpent": "Total Spent"
  },
  "analytics": {
    "title": "Analytics",
    "dateRange": "Date Range",
    "last7Days": "Last 7 Days",
    "last30Days": "Last 30 Days",
    "last90Days": "Last 90 Days",
    "customRange": "Custom Range",
    "revenue": "Revenue",
    "salesByMember": "Sales by Member",
    "topProducts": "Top Products",
    "recentActivity": "Recent Activity",
    "adminOnly": "This section is only available for administrators"
  },
  "settings": {
    "title": "Settings",
    "general": "General",
    "appearance": "Appearance",
    "language": "Language",
    "currency": "Currency",
    "notifications": "Notifications",
    "companyInfo": "Company Information",
    "companyName": "Company Name",
    "address": "Address",
    "phone": "Phone Number",
    "email": "Email Address",
    "website": "Website",
    "languageChanged": "Language changed to {{language}}"
  },
  "validation": {
    "required": "This field is required",
    "invalidEmail": "Please enter a valid email address",
    "minLength": "Minimum length is {{min}} characters",
    "maxLength": "Maximum length is {{max}} characters",
    "positiveNumber": "Please enter a positive number",
    "invalidPrice": "Please enter a valid price"
  },
  "pagination": {
    "showing": "Showing {{start}} to {{end}} of {{total}} entries",
    "previous": "Previous",
    "next": "Next",
    "page": "Page",
    "of": "of",
    "itemsPerPage": "Items per page"
  },
  "dates": {
    "today": "Today",
    "yesterday": "Yesterday",
    "thisWeek": "This Week",
    "thisMonth": "This Month",
    "thisYear": "This Year",
    "custom": "Custom"
  }
}
```

### Interpolation Support

The translation system supports variable interpolation using double curly braces:

```json
{
  "welcome": "Welcome, {{userName}}!",
  "itemsCount": "You have {{count}} items in your cart",
  "priceRange": "Price range: {{min}} - {{max}}"
}
```

### Pluralization

Support for plural forms based on count:

```json
{
  "items": {
    "zero": "No items",
    "one": "{{count}} item",
    "other": "{{count}} items"
  }
}
```

## Implementation Guide

### 1. Translation Service

```typescript
// src/services/translations.ts
import { signal } from '@preact/signals'

interface TranslationKeys {
  [key: string]: string | TranslationKeys
}

interface Locale {
  code: string
  name: string
  nativeName: string
  flag: string
  rtl?: boolean
}

export const SUPPORTED_LOCALES: Locale[] = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇵🇹' },
  { code: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
]

class TranslationService {
  private translations = signal<Record<string, TranslationKeys>>({})
  private currentLocale = signal<string>('en')
  private fallbackLocale = 'en'

  async loadTranslation(locale: string): Promise<void> {
    try {
      const translation = await import(`../locales/${locale}.json`)
      this.translations.value = {
        ...this.translations.value,
        [locale]: translation.default
      }
    } catch (error) {
      console.warn(`Failed to load translation for ${locale}:`, error)
    }
  }

  async setLocale(locale: string): Promise<void> {
    if (!this.translations.value[locale]) {
      await this.loadTranslation(locale)
    }
    this.currentLocale.value = locale
    localStorage.setItem('preferred-language', locale)
  }

  t(key: string, params?: Record<string, any>): string {
    const translation = this.getTranslation(key, this.currentLocale.value) ||
                       this.getTranslation(key, this.fallbackLocale) ||
                       key

    return this.interpolate(translation, params)
  }

  private getTranslation(key: string, locale: string): string | null {
    const keys = key.split('.')
    let current: any = this.translations.value[locale]

    for (const k of keys) {
      if (!current || typeof current !== 'object') return null
      current = current[k]
    }

    return typeof current === 'string' ? current : null
  }

  private interpolate(text: string, params?: Record<string, any>): string {
    if (!params) return text

    return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return params[key]?.toString() || match
    })
  }

  getCurrentLocale(): string {
    return this.currentLocale.value
  }

  getSupportedLocales(): Locale[] {
    return SUPPORTED_LOCALES
  }

  async initialize(): Promise<void> {
    const savedLocale = localStorage.getItem('preferred-language') || 'en'
    await this.setLocale(savedLocale)
  }
}

export const translationService = new TranslationService()
```

### 2. Translation Hook

```typescript
// src/hooks/useTranslation.ts
import { useEffect } from 'preact/hooks'
import { translationService } from '../services/translations'

export function useTranslation() {
  useEffect(() => {
    translationService.initialize()
  }, [])

  return {
    t: (key: string, params?: Record<string, any>) => translationService.t(key, params),
    setLocale: (locale: string) => translationService.setLocale(locale),
    getCurrentLocale: () => translationService.getCurrentLocale(),
    getSupportedLocales: () => translationService.getSupportedLocales(),
  }
}
```

### 3. Language Store

```typescript
// src/stores/language/languageStore.ts
import { signal } from '@preact/signals'

export const languageStore = {
  currentLocale: signal<string>('en'),
  isLoading: signal<boolean>(false),
  availableLocales: signal<string[]>(['en', 'es', 'fr', 'de', 'it', 'pt', 'zh', 'ja']),
}
```

```typescript
// src/stores/language/languageActions.ts
import { translationService } from '../../services/translations'
import { languageStore } from './languageStore'
import { companySettingsService } from '../../services/company-settings-sqlite'

export const languageActions = {
  async changeLanguage(locale: string): Promise<void> {
    languageStore.isLoading.value = true
    
    try {
      await translationService.setLocale(locale)
      languageStore.currentLocale.value = locale
      
      // Save to company settings
      await companySettingsService.updateSetting('defaultLanguage', locale)
    } catch (error) {
      console.error('Failed to change language:', error)
    } finally {
      languageStore.isLoading.value = false
    }
  },

  async loadLanguage(locale: string): Promise<void> {
    await translationService.loadTranslation(locale)
  },

  async initializeLanguage(): Promise<void> {
    const settings = await companySettingsService.getSettings()
    const defaultLang = settings.defaultLanguage || 'en'
    
    await this.changeLanguage(defaultLang)
  }
}
```

### 4. Language Selector Component

```typescript
// src/components/ui/LanguageSelector.tsx
import { useTranslation } from '../../hooks/useTranslation'
import { languageActions } from '../../stores/language/languageActions'
import { Select } from './Select'

interface LanguageSelectorProps {
  className?: string
}

export function LanguageSelector({ className }: LanguageSelectorProps) {
  const { getCurrentLocale, getSupportedLocales, t } = useTranslation()

  const handleLanguageChange = async (locale: string) => {
    await languageActions.changeLanguage(locale)
  }

  const supportedLocales = getSupportedLocales()
  const currentLocale = getCurrentLocale()

  const options = supportedLocales.map(locale => ({
    value: locale.code,
    label: `${locale.flag} ${locale.nativeName}`
  }))

  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {t('settings.language')}
      </label>
      <Select
        value={currentLocale}
        onChange={handleLanguageChange}
        options={options}
        className="w-full"
      />
    </div>
  )
}
```

## Usage Examples

### Basic Translation

```typescript
// In any component
import { useTranslation } from '../hooks/useTranslation'

function MyComponent() {
  const { t } = useTranslation()

  return (
    <div>
      <h1>{t('dashboard.title')}</h1>
      <button>{t('common.save')}</button>
    </div>
  )
}
```

### With Parameters

```typescript
function WelcomeMessage({ userName }: { userName: string }) {
  const { t } = useTranslation()

  return (
    <h1>{t('welcome', { userName })}</h1>
  )
}
```

### Pluralization

```typescript
function ItemCount({ count }: { count: number }) {
  const { t } = useTranslation()
  
  const key = count === 0 ? 'items.zero' : count === 1 ? 'items.one' : 'items.other'
  
  return <span>{t(key, { count })}</span>
}
```

### Form Validation

```typescript
function ProductForm() {
  const { t } = useTranslation()

  const validateForm = (data: any) => {
    const errors: Record<string, string> = {}

    if (!data.name) {
      errors.name = t('validation.required')
    }

    if (data.name && data.name.length < 3) {
      errors.name = t('validation.minLength', { min: 3 })
    }

    return errors
  }

  // ... rest of component
}
```

## Database Integration

### Company Settings Table

```sql
-- Add language preference to company_settings table
ALTER TABLE company_settings ADD COLUMN default_language TEXT DEFAULT 'en';
```

### User-specific Language Preferences

```sql
-- Optional: Add user-specific language preferences
CREATE TABLE IF NOT EXISTS user_preferences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  preference_key TEXT NOT NULL,
  preference_value TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id),
  UNIQUE(user_id, preference_key)
);
```

## Best Practices

### 1. Key Naming Conventions

- Use nested structure for organization: `page.section.element`
- Use descriptive names: `products.deleteConfirm` instead of `products.confirm`
- Keep keys consistent across languages
- Use camelCase for multi-word keys

### 2. Translation Guidelines

- Keep text concise and clear
- Consider cultural context, not just language
- Use gender-neutral language where possible
- Maintain consistent tone and voice
- Test with longer translations (German, etc.)

### 3. Development Workflow

1. **Add English first**: Always start with English translations
2. **Use placeholders**: For missing translations, show the key or English fallback
3. **Batch translations**: Group related keys together for translators
4. **Version control**: Track translation changes in git
5. **Testing**: Test with different languages during development

### 4. Performance Considerations

- Lazy load translation files
- Cache translations in memory
- Use localStorage for quick language switching
- Minimize translation file size
- Consider code splitting for large applications

## Advanced Features

### 1. RTL (Right-to-Left) Support

```typescript
// Check if current language is RTL
const isRTL = getSupportedLocales()
  .find(locale => locale.code === getCurrentLocale())?.rtl || false

// Apply RTL styles conditionally
<div className={`${isRTL ? 'rtl' : 'ltr'} ${className}`}>
```

### 2. Date and Number Formatting

```typescript
// src/utils/formatters.ts
export function formatDate(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale).format(date)
}

export function formatCurrency(amount: number, locale: string, currency: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency
  }).format(amount)
}
```

### 3. Dynamic Translation Loading

```typescript
// Load translations on demand
const loadLanguagePack = async (locale: string) => {
  const { default: translations } = await import(`../locales/${locale}.json`)
  return translations
}
```

## Testing Translations

### 1. Translation Coverage

```typescript
// Utility to find missing translation keys
function findMissingTranslations(baseLocale: string, targetLocale: string) {
  const base = require(`../locales/${baseLocale}.json`)
  const target = require(`../locales/${targetLocale}.json`)
  
  const missing: string[] = []
  
  function traverse(obj: any, path: string = '') {
    Object.keys(obj).forEach(key => {
      const currentPath = path ? `${path}.${key}` : key
      
      if (typeof obj[key] === 'object') {
        traverse(obj[key], currentPath)
      } else if (!getNestedValue(target, currentPath)) {
        missing.push(currentPath)
      }
    })
  }
  
  traverse(base)
  return missing
}
```

### 2. UI Testing with Long Text

Create test translations with extra long text to verify UI handles overflow:

```json
{
  "test": {
    "longText": "This is an extremely long piece of text that should test how the UI handles text overflow in various components and layouts"
  }
}
```

## Migration Strategy

### Phase 1: Foundation
1. Set up translation service and store
2. Create base English translation file
3. Implement translation hook
4. Add language selector to settings

### Phase 2: Core Pages
1. Translate authentication pages
2. Translate navigation and common elements
3. Translate dashboard and main pages
4. Test with pseudo-localization

### Phase 3: Features & Polish
1. Add additional languages
2. Implement advanced features (RTL, formatting)
3. Add user-specific language preferences
4. Performance optimization

### Phase 4: Maintenance
1. Set up translation workflow
2. Regular translation updates
3. Monitor usage analytics
4. Continuous improvement

## Troubleshooting

### Common Issues

1. **Missing translations**: Always provide fallbacks
2. **Layout breaking**: Test with longer languages (German, Russian)
3. **Context issues**: Provide context to translators
4. **Performance**: Lazy load translation files
5. **Caching**: Clear localStorage when testing

### Debug Mode

```typescript
// Add debug mode for development
const DEBUG_TRANSLATIONS = process.env.NODE_ENV === 'development'

if (DEBUG_TRANSLATIONS && !translation) {
  console.warn(`Missing translation: ${key} for locale ${locale}`)
}
```

This comprehensive translation system provides a solid foundation for internationalizing the Post POS application while maintaining performance and developer experience.