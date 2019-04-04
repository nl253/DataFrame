#!/usr/bin/env node

const DF = require('../DataFrame');
const Series = require('../Series');

const xs = DF.loadDataSet('lifting');

xs.sliceCols(0, 6).slice(0, 0).print();

module.exports = xs;
