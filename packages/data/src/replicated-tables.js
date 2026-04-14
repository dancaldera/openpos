const { buildReplicatedTableConfig, buildReplicatedTableMap } = require('@openpos/db-core')
const {
  companySettings,
  customers,
  orderItems,
  orders,
  productAttributes,
  productVariantSettings,
  productVariants,
  products,
  users,
} = require('./schema')

const replicatedTables = [
  buildReplicatedTableConfig(users, {
    primaryKey: 'id',
    watermarkColumn: 'updated_at',
    deleteStrategy: 'soft',
    pullOrder: 10,
  }),
  buildReplicatedTableConfig(products, {
    primaryKey: 'id',
    watermarkColumn: 'updated_at',
    deleteStrategy: 'hard',
    pullOrder: 20,
  }),
  buildReplicatedTableConfig(customers, {
    primaryKey: 'id',
    watermarkColumn: 'updated_at',
    deleteStrategy: 'soft',
    pullOrder: 30,
  }),
  buildReplicatedTableConfig(companySettings, {
    primaryKey: 'id',
    watermarkColumn: 'updated_at',
    deleteStrategy: 'hard',
    pullOrder: 40,
  }),
  buildReplicatedTableConfig(orders, {
    primaryKey: 'id',
    watermarkColumn: 'updated_at',
    deleteStrategy: 'hard',
    pullOrder: 50,
  }),
  buildReplicatedTableConfig(orderItems, {
    primaryKey: 'id',
    watermarkColumn: 'updated_at',
    deleteStrategy: 'hard',
    pullOrder: 60,
  }),
  buildReplicatedTableConfig(productAttributes, {
    primaryKey: 'id',
    watermarkColumn: 'updated_at',
    deleteStrategy: 'hard',
    pullOrder: 70,
  }),
  buildReplicatedTableConfig(productVariants, {
    primaryKey: 'id',
    watermarkColumn: 'updated_at',
    deleteStrategy: 'hard',
    pullOrder: 80,
  }),
  buildReplicatedTableConfig(productVariantSettings, {
    primaryKey: 'id',
    watermarkColumn: 'updated_at',
    deleteStrategy: 'hard',
    pullOrder: 90,
  }),
]

const replicatedTablesByName = buildReplicatedTableMap(replicatedTables)

module.exports = {
  replicatedTables,
  replicatedTablesByName,
}
