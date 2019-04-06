#!/usr/bin/env node

const DF = require('../DataFrame');
const Column = require('../Column');

const xs = new DF('iris');

xs.print(0, 10);

module.exports = xs;
