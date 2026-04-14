const { sql } = require('drizzle-orm')
const { check, index, integer, real, sqliteTable, text, uniqueIndex } = require('drizzle-orm/sqlite-core')

const currentTimestamp = sql`CURRENT_TIMESTAMP`

function createdAt(name = 'created_at') {
  return text(name).notNull().default(currentTimestamp)
}

function updatedAt(name = 'updated_at') {
  return text(name).notNull().default(currentTimestamp)
}

function optionalTimestamp(name) {
  return text(name)
}

function booleanColumn(name, defaultValue = false) {
  return integer(name, { mode: 'boolean' }).notNull().default(defaultValue)
}

const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    email: text('email').notNull(),
    password: text('password').notNull(),
    name: text('name').notNull(),
    role: text('role').notNull(),
    permissions: text('permissions').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    lastLogin: optionalTimestamp('last_login'),
    passwordHashed: booleanColumn('password_hashed'),
    deletedAt: optionalTimestamp('deleted_at'),
  },
  (table) => [
    uniqueIndex('idx_users_email_unique').on(table.email),
    index('idx_users_updated_at').on(table.updatedAt),
    check('users_role_check', sql`${table.role} in ('admin', 'manager', 'user')`),
  ],
)

const productAttributes = sqliteTable(
  'product_attributes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    values: text('values').notNull(),
    isActive: booleanColumn('is_active', true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('idx_product_attributes_name_unique').on(table.name),
    uniqueIndex('idx_product_attributes_slug_unique').on(table.slug),
    index('idx_product_attributes_slug').on(table.slug),
    index('idx_product_attributes_active').on(table.isActive),
    index('idx_product_attributes_updated_at').on(table.updatedAt),
  ],
)

const products = sqliteTable(
  'products',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    description: text('description').notNull(),
    price: real('price').notNull(),
    cost: real('cost').notNull(),
    stock: integer('stock').notNull().default(0),
    category: text('category').notNull(),
    barcode: text('barcode'),
    barcodeNormalized: text('barcode_normalized'),
    image: text('image'),
    isActive: booleanColumn('is_active', true),
    variantType: text('variant_type').notNull().default('simple'),
    defaultVariantId: integer('default_variant_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('idx_products_barcode_unique').on(table.barcode),
    uniqueIndex('idx_products_barcode_normalized_unique').on(table.barcodeNormalized),
    index('idx_products_variant_type').on(table.variantType),
    index('idx_products_updated_at').on(table.updatedAt),
    check('products_variant_type_check', sql`${table.variantType} in ('simple', 'configurable')`),
  ],
)

const customers = sqliteTable(
  'customers',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    customerNumber: text('customer_number').notNull(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    companyName: text('company_name'),
    email: text('email'),
    phone: text('phone'),
    phoneSecondary: text('phone_secondary'),
    addressLine1: text('address_line1'),
    addressLine2: text('address_line2'),
    city: text('city'),
    state: text('state'),
    postalCode: text('postal_code'),
    country: text('country').default('US'),
    customerType: text('customer_type').default('individual'),
    customerSegment: text('customer_segment'),
    creditLimit: real('credit_limit').default(0),
    currentBalance: real('current_balance').default(0),
    taxExempt: booleanColumn('tax_exempt'),
    taxId: text('tax_id'),
    loyaltyPoints: integer('loyalty_points').default(0),
    totalPurchases: real('total_purchases').default(0),
    totalOrders: integer('total_orders').default(0),
    firstPurchaseDate: optionalTimestamp('first_purchase_date'),
    lastPurchaseDate: optionalTimestamp('last_purchase_date'),
    isActive: booleanColumn('is_active', true),
    notes: text('notes'),
    tags: text('tags'),
    customFields: text('custom_fields'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    createdBy: integer('created_by').references(() => users.id),
    deletedAt: optionalTimestamp('deleted_at'),
  },
  (table) => [
    uniqueIndex('idx_customers_customer_number_unique').on(table.customerNumber),
    index('idx_customers_customer_number').on(table.customerNumber),
    index('idx_customers_email').on(table.email),
    index('idx_customers_phone').on(table.phone),
    index('idx_customers_name').on(table.lastName, table.firstName),
    index('idx_customers_active').on(table.isActive),
    index('idx_customers_updated_at').on(table.updatedAt),
    check('customers_type_check', sql`${table.customerType} in ('individual', 'business')`),
  ],
)

const companySettings = sqliteTable(
  'company_settings',
  {
    id: integer('id').primaryKey(),
    name: text('name').notNull().default('Titanic POS'),
    appName: text('app_name').notNull().default('OpenPOS'),
    description: text('description').default('Modern Point of Sale System'),
    taxEnabled: booleanColumn('tax_enabled', true),
    taxPercentage: real('tax_percentage').default(10),
    currencySymbol: text('currency_symbol').default('$'),
    language: text('language').default('en'),
    logoUrl: text('logo_url'),
    address: text('address'),
    phone: text('phone'),
    email: text('email'),
    website: text('website'),
    receiptFooter: text('receipt_footer'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('idx_company_settings_updated_at').on(table.updatedAt),
    check('company_settings_singleton_check', sql`${table.id} = 1`),
  ],
)

const orders = sqliteTable(
  'orders',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    subtotal: real('subtotal').notNull(),
    tax: real('tax').notNull(),
    total: real('total').notNull(),
    status: text('status').notNull(),
    paymentMethod: text('payment_method'),
    notes: text('notes'),
    completedAt: optionalTimestamp('completed_at'),
    userId: integer('user_id').references(() => users.id),
    customerId: integer('customer_id').references(() => customers.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('idx_orders_customer_id').on(table.customerId),
    index('idx_orders_updated_at').on(table.updatedAt),
    check('orders_status_check', sql`${table.status} in ('pending', 'paid', 'cancelled', 'completed')`),
    check('orders_payment_method_check', sql`${table.paymentMethod} is null or ${table.paymentMethod} in ('cash', 'card', 'transfer')`),
  ],
)

const productVariants = sqliteTable(
  'product_variants',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    parentProductId: integer('parent_product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
    sku: text('sku'),
    barcode: text('barcode'),
    barcodeNormalized: text('barcode_normalized'),
    price: real('price').notNull(),
    cost: real('cost').notNull(),
    stock: integer('stock').notNull().default(0),
    attributes: text('attributes').notNull(),
    image: text('image'),
    isActive: booleanColumn('is_active', true),
    position: integer('position').default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('idx_product_variants_sku_unique').on(table.sku),
    uniqueIndex('idx_product_variants_barcode_unique').on(table.barcode),
    uniqueIndex('idx_product_variants_barcode_normalized_unique').on(table.barcodeNormalized),
    index('idx_product_variants_parent').on(table.parentProductId),
    index('idx_product_variants_active').on(table.isActive),
    index('idx_product_variants_updated_at').on(table.updatedAt),
  ],
)

const productVariantSettings = sqliteTable(
  'product_variant_settings',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
    hasVariants: booleanColumn('has_variants'),
    attributeIds: text('attribute_ids').notNull(),
    variantNameTemplate: text('variant_name_template'),
    pricingStrategy: text('pricing_strategy').default('individual'),
    priceAdjustmentFormula: text('price_adjustment_formula'),
    stockStrategy: text('stock_strategy').default('individual'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('idx_product_variant_settings_product_unique').on(table.productId),
    index('idx_product_variant_settings_product').on(table.productId),
    index('idx_product_variant_settings_updated_at').on(table.updatedAt),
  ],
)

const orderItems = sqliteTable(
  'order_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    orderId: integer('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
    productId: integer('product_id').notNull().references(() => products.id),
    productName: text('product_name').notNull(),
    quantity: integer('quantity').notNull(),
    unitPrice: real('unit_price').notNull(),
    totalPrice: real('total_price').notNull(),
    variantId: integer('variant_id').references(() => productVariants.id),
    variantAttributes: text('variant_attributes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('idx_order_items_order_id').on(table.orderId),
    index('idx_order_items_product_id').on(table.productId),
    index('idx_order_items_variant').on(table.variantId),
    index('idx_order_items_updated_at').on(table.updatedAt),
  ],
)

const schema = {
  users,
  products,
  customers,
  companySettings,
  orders,
  orderItems,
  productAttributes,
  productVariants,
  productVariantSettings,
}

module.exports = {
  ...schema,
  schema,
}
