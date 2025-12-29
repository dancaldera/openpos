# Titanic POS - Quick Start Guide

## What's New: Customer Management (Phase 1) ✅

The application now includes a complete customer management system! You can track customers, link them to orders, and manage loyalty points.

---

## Quick Navigation

- **Full Progress Details:** See `IMPLEMENTATION_PROGRESS.md` in this folder
- **Implementation Plan:** See `~/.claude/plans/frolicking-plotting-reddy.md`
- **Main Documentation:** See `/CLAUDE.md` in project root

---

## What's Working Now

### Customer Management
- ✅ Create, edit, and delete customers
- ✅ Individual and Business customer types
- ✅ Complete contact and address information
- ✅ Loyalty points tracking
- ✅ Purchase history
- ✅ Search and pagination
- ✅ Customer segments (VIP, wholesale, etc.)

### Order Integration
- ✅ Select customer when creating orders
- ✅ Optional customer field (supports walk-in sales)
- ✅ Default "Walk-In Customer" available
- ✅ Customer information stored with orders

### Database
- ✅ 3 new migrations applied (14-16)
- ✅ Customers table with 30+ fields
- ✅ Orders linked to customers
- ✅ Default customers seeded

---

## How to Use

### Access Customer Management
1. Navigate to **Customers** from the sidebar (👥 icon)
2. Permission required: Manager or Admin role

### Create a New Customer
1. Click **"Add Customer"** button
2. Fill in customer information:
   - **Required:** First Name, Last Name
   - **Optional:** Company Name, Email, Phone, Address, etc.
   - **Customer Type:** Individual or Business
3. Click **"Save"** to create

### Link Customer to Order
1. Navigate to **Orders** page
2. Click **"Create New Order"**
3. Use the **Customer** dropdown to select a customer
4. Leave blank for walk-in sales (uses default Walk-In Customer)
5. Complete order as usual

### Search Customers
- Use the search bar on the Customers page
- Searches: Name, Email, Phone, Customer Number
- Results update in real-time

---

## Test Accounts

### Users (for login)
- **Admin:** admin@postpos.com / 123456
- **Manager:** manager@postpos.com / 123456
- **User:** user@postpos.com / 123456

### Default Customers
- **CUST-00001:** Walk-In Customer (default for anonymous sales)
- **CUST-00002:** John Doe (sample individual)
- **CUST-00003:** Acme Corporation (sample business)

---

## Development Commands

```bash
# Start development server
bun tauri dev

# Build for production
bun tauri build

# Run linting/formatting
bun check
```

---

## File Locations

### New Files
- `src/services/customers-sqlite.ts` - Customer service (750+ lines)
- `src/pages/Customers.tsx` - Customer UI (870+ lines)
- `docs/IMPLEMENTATION_PROGRESS.md` - This progress document
- `docs/QUICK_START.md` - This quick start guide

### Updated Files
- `src-tauri/src/lib.rs` - Added migrations 14-16
- `src/services/orders-sqlite.ts` - Added customer support
- `src/pages/Orders.tsx` - Added customer selection
- `src/locales/en.json` - Added customer translations
- `src/App.tsx` - Added Customers route
- `src/components/Layout.tsx` - Added Customers menu item

---

## What's Next?

### Pending Translations (2-3 hours)
Customer translations need to be added to 7 language files:
- Spanish (es.json)
- French (fr.json)
- German (de.json)
- Italian (it.json)
- Portuguese (pt.json)
- Chinese (zh.json)
- Japanese (ja.json)

### Recommended Next Phase: Product Variants (24-30 hours)
Enables:
- Size, color, prescription variations
- Weight-based products for butcher shops
- Prescription attributes for optics
- Fractional stock (kg, lb, oz)
- SKU generation per variant

**Why this phase?**
- Critical for optics and butcher shop support
- Enables core multi-industry functionality
- Higher complexity benefits from early attention

### Alternative: Dynamic Categories (8-10 hours)
If you prefer a quicker win:
- Replace hardcoded product categories
- Admin UI for category management
- Industry-specific category sets
- Lower complexity

---

## Industry Support Roadmap

### Current: General Retail ✅
- Basic product catalog
- Standard orders
- Customer management ✅ NEW

### Future: Optics Shop
**Needs:**
- Product variants for prescriptions (Phase 3)
- Custom fields for prescription data (Phase 5)
- Lens types and measurements

**When:** After Phase 3 + Phase 5

### Future: Butcher Shop
**Needs:**
- Weight-based pricing (Phase 4)
- Fractional stock in kg/lb (Phase 3)
- Custom cut instructions (Phase 5)

**When:** After Phase 3 + Phase 4 + Phase 5

### Future: Restaurant
**Needs:**
- Table management (Future Phase 7)
- Modifiers and combos (Future)
- Kitchen display system (Future)

**When:** Future roadmap beyond current 6 phases

---

## Performance Notes

- **Pagination:** All lists default to 10 items per page
- **Indexes:** Added on all searchable fields
- **Search:** Debounced for better performance
- **Stock Operations:** Optimized with proper WHERE clauses

---

## Known Limitations

1. **Translations:** Only English is complete (7 languages pending)
2. **Order Editing:** Cannot change customer after order creation
3. **Customer Deletion:** Soft delete only (recoverable)
4. **Loyalty Points:** Manual management only (not auto-calculated yet)
5. **Purchase History:** Tracked but no dedicated UI yet

---

## Troubleshooting

### Database Migration Failed
- Check: Migration already applied?
- Solution: Migrations are idempotent, safe to re-run

### Customer Number Not Generated
- Check: Database connection
- Check: Console for errors
- Last resort: Manually set to "CUST-XXXXX" format

### Orders Not Showing Customer
- Check: Migration 15 applied?
- Check: Order created after migration?
- Note: Old orders won't have customer_id (backward compatible)

### Permissions Error on Customers Page
- Check: Logged in as Manager or Admin?
- Check: User role in database
- Solution: Use admin@postpos.com / 123456

---

## Support

For detailed implementation information, see:
- **Progress Report:** `docs/IMPLEMENTATION_PROGRESS.md`
- **Full Plan:** `~/.claude/plans/frolicking-plotting-reddy.md`
- **Main Docs:** `/CLAUDE.md`

---

**Version:** 1.0
**Last Updated:** December 29, 2024
**Phase:** 1 of 6 Complete
**Status:** Customer Management Operational ✅
