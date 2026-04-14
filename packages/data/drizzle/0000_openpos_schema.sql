CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'user')),
  permissions TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login TEXT,
  password_hashed INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_updated_at ON users(updated_at);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  price REAL NOT NULL,
  cost REAL NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0,
  category TEXT NOT NULL,
  barcode TEXT UNIQUE,
  barcode_normalized TEXT UNIQUE,
  image TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  variant_type TEXT NOT NULL DEFAULT 'simple' CHECK (variant_type IN ('simple', 'configurable')),
  default_variant_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_products_variant_type ON products(variant_type);
CREATE INDEX IF NOT EXISTS idx_products_updated_at ON products(updated_at);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_number TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  company_name TEXT,
  email TEXT,
  phone TEXT,
  phone_secondary TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'US',
  customer_type TEXT DEFAULT 'individual' CHECK (customer_type IN ('individual', 'business')),
  customer_segment TEXT,
  credit_limit REAL DEFAULT 0,
  current_balance REAL DEFAULT 0,
  tax_exempt INTEGER NOT NULL DEFAULT 0,
  tax_id TEXT,
  loyalty_points INTEGER DEFAULT 0,
  total_purchases REAL DEFAULT 0,
  total_orders INTEGER DEFAULT 0,
  first_purchase_date TEXT,
  last_purchase_date TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  tags TEXT,
  custom_fields TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER REFERENCES users(id),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_customers_customer_number ON customers(customer_number);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_customers_active ON customers(is_active);
CREATE INDEX IF NOT EXISTS idx_customers_updated_at ON customers(updated_at);

CREATE TABLE IF NOT EXISTS company_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL DEFAULT 'Titanic POS',
  app_name TEXT NOT NULL DEFAULT 'OpenPOS',
  description TEXT DEFAULT 'Modern Point of Sale System',
  tax_enabled INTEGER NOT NULL DEFAULT 1,
  tax_percentage REAL DEFAULT 10.0,
  currency_symbol TEXT DEFAULT '$',
  language TEXT DEFAULT 'en',
  logo_url TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  receipt_footer TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_company_settings_updated_at ON company_settings(updated_at);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subtotal REAL NOT NULL,
  tax REAL NOT NULL,
  total REAL NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'cancelled', 'completed')),
  payment_method TEXT CHECK (payment_method IN ('cash', 'card', 'transfer')),
  notes TEXT,
  completed_at TEXT,
  user_id INTEGER REFERENCES users(id),
  customer_id INTEGER REFERENCES customers(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_updated_at ON orders(updated_at);

CREATE TABLE IF NOT EXISTS product_attributes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  "values" TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_product_attributes_slug ON product_attributes(slug);
CREATE INDEX IF NOT EXISTS idx_product_attributes_active ON product_attributes(is_active);
CREATE INDEX IF NOT EXISTS idx_product_attributes_updated_at ON product_attributes(updated_at);

CREATE TABLE IF NOT EXISTS product_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku TEXT UNIQUE,
  barcode TEXT UNIQUE,
  barcode_normalized TEXT UNIQUE,
  price REAL NOT NULL,
  cost REAL NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0,
  attributes TEXT NOT NULL,
  image TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  position INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_product_variants_parent ON product_variants(parent_product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_active ON product_variants(is_active);
CREATE INDEX IF NOT EXISTS idx_product_variants_updated_at ON product_variants(updated_at);

CREATE TABLE IF NOT EXISTS product_variant_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL UNIQUE REFERENCES products(id) ON DELETE CASCADE,
  has_variants INTEGER NOT NULL DEFAULT 0,
  attribute_ids TEXT NOT NULL,
  variant_name_template TEXT,
  pricing_strategy TEXT DEFAULT 'individual',
  price_adjustment_formula TEXT,
  stock_strategy TEXT DEFAULT 'individual',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_product_variant_settings_product ON product_variant_settings(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variant_settings_updated_at ON product_variant_settings(updated_at);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  total_price REAL NOT NULL,
  variant_id INTEGER REFERENCES product_variants(id),
  variant_attributes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_order_items_variant ON order_items(variant_id);
CREATE INDEX IF NOT EXISTS idx_order_items_updated_at ON order_items(updated_at);
