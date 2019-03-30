#!/usr/bin/env node

const DF = require('../DataFrame')
const Series = require('../Series')
let migration = DF.loadDataSet('ukMigration');
migration.Sex = Series.from(migration.Sex.replace('M', 0).replace('F', 1));
migration.print();
console.log('');
migration.numeric.summary().print();

module.exports = migration;
