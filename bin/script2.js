#!/usr/bin/env node

const DF = require('../DataFrame');
const S = require('../Series');
const xs = DF.loadDataSet("pokemon");
xs.sliceCols(0, 5).print(10);
xs.drop(0).numeric.transpose().sliceCols(0, 40).print(10);
xs.drop(0).numeric.transpose().sliceCols(0, 40).summary().print(10);
