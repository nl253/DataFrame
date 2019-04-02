#!/usr/bin/env node

const DF = require('../DataFrame');
const S = require('../Series');
const xs = DF.loadDataSet("pokemon");
console.log(process.argv.slice(2));
xs.sliceCols(0, 4).print(process.argv[2], process.argv[3]);
// xs.print();
// xs.drop(0).numeric.transpose().sliceCols(0, 40).print(10);
// xs.drop(0).numeric.transpose().sliceCols(0, 40).summary().print(10);
