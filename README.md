# DataFrame 

- pandas-like data-frame library
- series built on typed arrays
- tries to be memory efficient
- extensions to arrays
- great for tabular data
- reads CSV
- work in progress

See JSDoc-generated API docs see [gh-pages](https://nl253.github.io/DataFrame/DataFrame.html).

For more human-friendly docs keep reading.

## Installation

```sh
$ npm install --save dataf
```

## Human-Friendly API

### Preliminaries

Run the node REPL.

```sh
$ node
```

Import the library (make sure it's installed).

```javascript
const DF = require('dataf')
```

### Toy Datasets (shipped with the library)

```javascript
DF.dataSets
```

```javascript
[ 'alcohol',   // alcohol consumption math students
  'countries', // geographical and economical data for all countries
  'diabetes',  
  'food',      // food choices
  'got',       // game of thrones deaths
  'happiness', // world happiness 2017
  'iris',     
  'lifting',   // powerlifting
  'mushrooms',
  'pokemon',   // stats for all from all generations
  'superheros' ] 
```

All have been placed in the public domain.

### Load the Iris DataSet

```javascript
iris = DF.loadDataSet('iris')
```

### Selecting / Slicing Rows

#### Head / Tail

```javascript
iris.head().print() 
// can be head(20) for the first 20 rows
// or tail() for last rows
```

```
# u8 Id f32 SepalLe... f32 SepalWi... f32 PetalLe... f32 PetalWi... s     Species
- ----- -------------- -------------- -------------- -------------- -------------
0     1           5.09           3.50           1.39           0.20 Iris-setos...
1     2           4.90           3.00           1.39           0.20 Iris-setos...
2     3           4.69           3.20           1.29           0.20 Iris-setos...
3     4           4.59           3.09           1.50           0.20 Iris-setos...
4     5           5.00           3.59           1.39           0.20 Iris-setos...
- ----- -------------- -------------- -------------- -------------- -------------
     5B            20B            20B            20B            20B           NaN
```

Note the data types next to column names and memory indicators for every column.

#### Rename Columns

```javascript
iris.rename(0, 'First').rename(-2, 'Second to Last')
// or just
iris.rename(0, 'First', -2, 'Second to Last')
```

#### Slicing

```javascript
iris.slice(10, 20).print() // can be .slice(5) for .slice(5, end)
```

```
# u8 Id f32 SepalLe... f32 SepalWi... f32 PetalLe... f32 PetalWi... s     Species
- ----- -------------- -------------- -------------- -------------- -------------
0    11           5.40           3.70           1.50           0.20 Iris-setos...
1    12           4.80           3.40           1.60           0.20 Iris-setos...
- ----- -------------- -------------- -------------- -------------- -------------
     2B             8B             8B             8B             8B           NaN
```

#### Getting a Column (Series)

We know that there are 6 columns (try running `iris.nCols`).  To get all column names run: 

```javascript
iris.colNames
```

```javascript
[ 'Id',
  'SepalLengthCm',
  'SepalWidthCm',
  'PetalLengthCm',
  'PetalWidthCm',
  'Species' ]
```

If you want to extract a column (series, see the Series API below) *from* a data frame try:

```javascript
iris.Species.print(5) // last column
```

```
Series s[Iris-setosa, Iris-setosa, Iris-setosa, Iris-setosa, Iris-setosa, ... 145 more]
```

Here `s` stands for STRING. You may also see:  `f64`, `f32`, `i32`, `i16`, `i8`, `u32`, `u16` and `u8`.

**NOTE** some column names will have spaces or/and will clash with the API and you will have to use `iris.col(2)` OR `iris.col('SepalWidthCm')`. 
**Columns can always be referred to by their index OR name**.

#### Selecting columns (Data Frame)

Suppose you only want the first couple of columns:

```javascript
iris.select(0, 1, -2).print(5) // the 1st, 2nd and the 2nd to last
```

This show the first 5 rows of the *new* data frame with only: `Id`, `SepalLength` and `PetalWidth`.

```
  # u8 Id f32 SepalLe... f32 PetalWi...
--- ----- -------------- --------------
  0     1           5.09           0.20
  1     2           4.90           0.20
  2     3           4.69           0.20
  3     4           4.59           0.20
  4     5           5.00           0.20
...   ...     (145 more)            ...
--- ----- -------------- --------------
     150B           600B           600B
```

If you want to select a *range* of column: e.g. from the 1st to the 3rd try:

```javascript
iris.sliceCols(0, 2).print(3)
```

```
  # u8 Id f32 SepalLe... f32 SepalWi...
--- ----- -------------- --------------
  0     1           5.09           3.50
  1     2           4.90           3.00
  2     3           4.69           3.20
...   ...     (147 more)            ...
--- ----- -------------- --------------
     150B           600B           600B
```

This is equivalent to:

```javascript
iris.sliceCols('Id', 'SepalWidthCm').print(3)
```

### Only Numeric Columns (remove string columns)

```javascript
iris.numeric // all BUT the "Species" column (getter)
```

### Only String Columns (remove numeric columns)

```javascript
iris.nominal // just the "Species" column (getter)
```

### Removing (Dropping) Columns

If you want to remove the 2nd and the second to last columns:

```javascript
iris.drop(1, -2).print(3)
```

```
  # f32 SepalLe... f32 SepalWi... f32 PetalLe... s     Species
--- -------------- -------------- -------------- -------------
  0           5.09           3.50           1.39 Iris-setos...
  1           4.90           3.00           1.39 Iris-setos...
  2           4.69           3.20           1.29 Iris-setos...
...            ...     (147 more)            ...           ...
--- -------------- -------------- -------------- -------------
              600B           600B           600B           NaN
```

**NOTE** those operations are **not** in-place meaning dropping produces a *new* data frame without specified columns.

#### Selecting Rows

##### With Specific Value

Signature: `iris.where(val, colId, op)`. Where op is one of `{"=" (default), ">", "<", ">=", "<="}`.

```javascript
iris.Species[0]

'Iris-setosa'

iris.where('Iris-setosa', -1) // -1 for last col
```

#### Matching Predicate (Test)

Signature: `iris.filter(rowTestFunc)`. <br>
Signature: `iris.filter(valTestFunc, colId)`.<br>

```javascript
iris.filter(species => species === 'Iris-setosa', -1)
// OR (expensive) 
iris.filter(row => row[row.length - 1] === 'Iris-setosa')
```

### Accessing Values (preferred way)

```javascript
iris.val(10, 'Species') // val(rowIdx, colId)

'Iris-setosa'
```

### Accessing Rows

#### One Row

Accessing a single row:

```javascript
const row = iris.row(20); // 21st row

row

[ 21,
  5.400000095367432,
  3.4000000953674316,
  1.7000000476837158,
  0.20000000298023224,
  'Iris-setosa' ]
```

#### Iterating Over Many Rows

If you want to iterate over all the rows (this isn't very efficient) try:

```javascript
const rowIt = iris.slice(0, 3).rowsIter // (getter)

for (const r of rowIt) {
  console.log(r)
}

[ 1,
  5.099999904632568,
  3.5,
  1.399999976158142,
  0.20000000298023224,
  'Iris-setosa' ]
[ 2,
  4.900000095367432,
  3,
  1.399999976158142,
  0.20000000298023224,
  'Iris-setosa' ]
[ 3,
  4.699999809265137,
  3.200000047683716,
  1.2999999523162842,
  0.20000000298023224,
  'Iris-setosa' ]
```

### Manipulation

#### Merging Data Frames

```javascript
iris.concat(iris) // append all rows (axis 0)
iris.concat(iris, 1) // append all columns (axis 1)
```

**NOTE** this library will manage duplicate column names.

```javascript
iris.concat(iris, 1).colNames

[ 'Id',
  'SepalLengthCm',
  'SepalWidthCm',
  'PetalLengthCm',
  'PetalWidthCm',
  'Species',
  'Id2',
  'SepalLengthCm2',
  'SepalWidthCm2',
  'PetalLengthCm2',
  'PetalWidthCm2',
  'Species2' ]
```

#### Shuffle

```javascript
iris.shuffle()
```

#### Reverse

```javascript
iris.reverse()
```

#### Sort

Signature: `iris.sort(colId, 'asc' (default) | 'des' )`. <br>

```javascript
iris.sort('SepalWidthCm') // default is iris.sort('asc')
```

```javascript
iris.sort('SepalWidthCm', 'des') // descending sort 
```

### Transpose (inefficient)

Although it's inefficient it's sometimes useful to be able to swap the x and y axis.
Suppose you want to do summation row-wise (not column wise):

```javascript
// numeric will drop the 'Species' column
iris.numeric.transpose().sum() 
```

```
  # u8  column f32 add
--- ---------- -------
  0          0   11.19
  1          1   11.50
  2          2   12.39
  3          3   13.39
  4          4   15.19
... (145 more)     ...
--- ---------- -------
          150B    600B
```

### Statistics & Math

TODO

#### Sample (get a random subset of rows)

Signature: `iris.sample(0.15)` for random 15% of the dataset. <br>
Signature: `iris.sample(30)` for random 30 sample of the dataset. <br>
Signature: `iris.sample(0.5, true)` (with replacement -- default) <br>
Signature: `iris.sample(100, false)` (**without** replacement)

#### Summary

```javascript
iris.summary() // this will produce a summary dataframe with info for every column
```

```
# s      column s dtype f32 min f32 max f32 range f32 mean f32 stdev
- ------------- ------- ------- ------- --------- -------- ---------
0            Id      u8    1.00  150.00    149.00    75.50     43.30
1 SepalLengt...     f32    4.30    7.90      3.59     5.84      0.82
2 SepalWidth...     f32    2.00    4.40      2.40     3.05      0.43
3 PetalLengt...     f32    1.00    6.90      5.90     3.75      1.75
4 PetalWidth...     f32    0.10    2.50      2.40     1.19      0.76
5       Species       s     NaN     NaN       NaN      NaN       NaN
- ------------- ------- ------- ------- --------- -------- ---------
            NaN     NaN     24B     24B       24B      24B       24B
```

### Aggregates

#### Counts (of unique values)

```javascript
iris.counts(-1) // for the last column
```

```
# s     Species u8 count
- ------------- --------
0 Iris-setos...       50
1 Iris-versi...       50
2 Iris-virgi...       50
- ------------- --------
            NaN       3B
```

#### Correlations (Matrix)

```javascript
iris.corr()
```

```
# s      column f64 Id f64 SepalLe... f64 SepalWi... f64 PetalLe... f64 PetalWi...
- ------------- ------ -------------- -------------- -------------- --------------
0            Id   1.00           0.71          -0.39           0.88           0.89
1 SepalLengt...   0.71           1.00          -0.10           0.87           0.81
2 SepalWidth...  -0.39          -0.10           1.00          -0.42          -0.35
3 PetalLengt...   0.88           0.87          -0.42           1.00           0.96
4 PetalWidth...   0.89           0.81          -0.35           0.96           1.00
- ------------- ------ -------------- -------------- -------------- --------------
            NaN    40B            40B            40B            40B            40B
```

### Pre-Processing

#### Remove NaN / Infinity / other

To remove all rows that have some value:

```javascript
iris.removeAll(NaN) // from all cols
// from 1th and 3rd cols and from col 'PetalLengthCm'
iris.removeAll(NaN, 0, 2, 'PetalLengthCm') 
```

#### Feature (Column) Selection

Signature: `iris.nBest(n, metric)` where metric is one of `{"var", "stdev", "mean", "mad", "IQR", "median", "Q1", "Q3", "skewness", "minimum", "range", "maximum"}` OR a function from Series (one column) to a number (`Series -> Num`). <br>

Feature selection (i.e. select best columns, by default uses "var" -- variance):

```javascript
iris.drop('Id').numeric.nBest(2).print(3) // note the numeric
```

```
  # f32 PetalLe... f32 SepalLe...
--- -------------- --------------
  0           1.39           5.09
  1           1.39           4.90
  2           1.29           4.69
...     (147 more)            ...
--- -------------- --------------
              600B           600B
```

#### Normalization

However, this is very naive and you might want to normalize (scale to the same range) the values:

```javascript
iris.drop('Id').numeric.normalize().nBest(2).print(3)
```

As you can see you might get different results:

```
  # f32 PetalWi... f32 PetalLe...
--- -------------- --------------
  0           0.04           0.06
  1           0.04           0.06
  2           0.04           0.05
...     (147 more)            ...
--- -------------- --------------
              600B           600B
```

#### Label Encoding

It's a bit awkward for us to constantly have to drop the 'Species' column because it's a string column...

You can easily convert it to a numeric colunm:

From:

```javascript
iris.print(48, 52)
```

```
  # u8 Id f32 SepalLe... f32 SepalWi... f32 PetalLe... f32 PetalWi... s     Species
--- ----- -------------- -------------- -------------- -------------- -------------
...   ...            ...      (48 more)            ...            ...           ...
 48    49           5.30           3.70           1.50           0.20 Iris-setos...
 49    50           5.00           3.29           1.39           0.20 Iris-setos...
 50    51           7.00           3.20           4.69           1.39 Iris-versi...
 51    52           6.40           3.20           4.50           1.50 Iris-versi...
...   ...            ...      (98 more)            ...            ...           ...
--- ----- -------------- -------------- -------------- -------------- -------------
     150B           600B           600B           600B           600B           NaN
```

To:

```javascript
iris.labelEncode().print(48, 52)
```

```
  # u8 Id f32 SepalLe... f32 SepalWi... f32 PetalLe... f32 PetalWi... u8 Species
--- ----- -------------- -------------- -------------- -------------- ----------
...   ...            ...      (48 more)            ...            ...        ...
 48    49           5.30           3.70           1.50           0.20          0
 49    50           5.00           3.29           1.39           0.20          0
 50    51           7.00           3.20           4.69           1.39          1
 51    52           6.40           3.20           4.50           1.50          1
...   ...            ...      (98 more)            ...            ...        ...
--- ----- -------------- -------------- -------------- -------------- ----------
     150B           600B           600B           600B           600B       150B
```

By default all string columns will be label encoded (numeric columns will be ignored). You may specify the colIds e.g. `df.labelEncode(0, -3, 'Target')`.

#### One-Hot Encoding

Signature: `iris.oneHot(colId)` <br>

```javascript
// expects the column to be unsigned int
iris.labelEncode('Species').oneHot('Species').print(48, 52)
```

```
  # u8 0 u8      1 u8 2
--- ---- --------- ----
...  ... (48 more)  ...
 48    1         0    0
 49    1         0    0
 50    0         1    0
 51    0         1    0
...  ... (98 more)  ...
--- ---- --------- ----
    150B      150B 150B
```

#### Clipping (ensuring value is in range)

For demonstration let's make a 1-col data frame:

```javascript
iris.select(1)

// print with iris.select(1).head(3)
```

```
# f32 SepalLe...
- --------------
0           5.09
1           4.90
2           4.69
- --------------
             12B
```

To clip:

```javascript
iris.select(1).clip(null, 4, 5).print(3) // null == all cols
```

```
# f32 SepalLe...
- --------------
0           5.00
1           4.90
2           4.69
- --------------
             12B
```

## Advanced Human-Friendly API

### Data Types

<table>
  <tr>
   <th>Data Type</th>
   <th>String</th>
  </tr>
  <tr>
    <td>string</td>
    <td>"s"</td>
  </tr>
  <tr>
    <td>32-bit signed integer</td>
    <td>"i32"</td>
  </tr>
  <tr>
    <td>16-bit signed integer</td>
    <td>"i16"</td>
  </tr>
  <tr>
    <td>8-bit signed integer</td>
    <td>"i8"</td>
  </tr>
  <tr>
    <td>32-bit unsigned integer</td>
    <td>"u32"</td>
  </tr>
  <tr>
    <td>16-bit unsigned integer</td>
    <td>"u16"</td>
  </tr>
  <tr>
    <td>8-bit unsigned integer</td>
    <td>"u8"</td>
  </tr>
  <tr>
    <td>32-bit float (single precision)</td>
    <td>"f32"</td>
  </tr>
  <tr>
    <td>64-bit float (double precision)</td>
    <td>"f64"</td>
  </tr>
</table>

If you want to get the data type for all columns try:

```javascript
iris.dtypes // list of string data types (getter) 
```

Or for a prettier output make a meta data frame with information about the
previous data frame!

```javascript
iris.dtype() // note difference between `iris.dtype()` (method) and `iris.dtypes` (getter)
```

**SIDENOTE** .dtype() is an aggregate!  this means it produces a data frame from applying a `Series -> *` operation to all columns.

```
# s      column s dtype
- ------------- -------
  0            Id      u8
  1 SepalLengt...     f32
  2 SepalWidth...     f32
  3 PetalLengt...     f32
  4 PetalWidth...     f32
  5       Species       s
  - ------------- -------
              NaN     NaN
```

You can force-cast columns:

```javascript
iris.cast(2, 'u8')
```

`cast(colId, dtype)` **expects the column number as the first parameter**.


### Down-Casting

You can also run `iris.downcast()` and let the library figure out the most efficient data type for each column so that data is not lost.
This is especially useful after truncating (floats are converted to ints).

Default:


```
# u8 Id f32 SepalLe... f32 SepalWi... f32 PetalLe... f32 PetalWi... s     Species
- ----- -------------- -------------- -------------- -------------- -------------
0     1           5.09           3.50           1.39           0.20 Iris-setos...
1     2           4.90           3.00           1.39           0.20 Iris-setos...
2     3           4.69           3.20           1.29           0.20 Iris-setos...
- ----- -------------- -------------- -------------- -------------- -------------
     3B            12B            12B            12B            12B           NaN
```

Now see how much memory can be saved:

```javascript
iris.trunc().downcast().head(3)
```

```
# u8 Id u8 SepalLe... u8 SepalWi... u8 PetalLe... u8 PetalWi... s     Species
- ----- ------------- ------------- ------------- ------------- -------------
0     1             5             3             1             0 Iris-setos...
1     2             4             3             1             0 Iris-setos...
2     3             4             3             1             0 Iris-setos...
- ----- ------------- ------------- ------------- ------------- -------------
     3B            3B            3B            3B            3B           NaN
```

### Memory

Although this information is by default printed, you may produce a data frame with information about memory consumption of each column.

```javascript
iris.memory()
```

```
# s      column u16 memory
- ------------- ----------
0            Id        150
1 SepalLengt...        600
2 SepalWidth...        600
3 PetalLengt...        600
4 PetalWidth...        600
- ------------- ----------
            NaN        10B
```

**NOTE** it's not calculated for string columns (notice that "Species" is missing).

### Copies

#### Deep Copy

If for some reason you need a deep-copy try:

```javascript
iris.clone()
```

#### Shallow Copy

Shallow copies are cheap:

```javascript
iris.copy()
```

### Generalized Row Slicing

TODO

### Generalized Column Slicing

TODO

### Exporting 

#### Array

#### Array of Columns

```javascript
iris.head(2).toArray('col')

[ [ 1, 2 ],
  [ 5.099999904632568, 4.900000095367432 ],
  [ 3.5, 3 ],
  [ 1.399999976158142, 1.399999976158142 ],
  [ 0.20000000298023224, 0.20000000298023224 ],
  [ 'Iris-setosa', 'Iris-setosa' ] ]
```

#### Array of Rows

```javascript
iris.head(2).toArray()

[ [ 1,
    5.099999904632568,
    3.5,
    1.399999976158142,
    0.20000000298023224,
    'Iris-setosa' ],
  [ 2,
    4.900000095367432,
    3,
    1.399999976158142,
    0.20000000298023224,
    'Iris-setosa' ] ]
```

#### HTML

```javascript
iris.head(2).toHTML()
```

```html
<table>
  <tr>
    <th>Id</th>
    <th>SepalLengthCm</th>
    <th>SepalWidthCm</th>
    <th>PetalLengthCm</th>
    <th>PetalWidthCm</th>
    <th>Species</th>
  </tr>
  <tr>
    <td>1</td>
    <td>5.099999904632568</td>
    <td>3.5</td>
    <td>1.399999976158142</td>
    <td>0.20000000298023224</td>
    <td>Iris-setosa</td>
  </tr>
  <tr>
    <td>2</td>
    <td>4.900000095367432</td>
    <td>3</td>
    <td>1.399999976158142</td>
    <td>0.20000000298023224</td>
    <td>Iris-setosa</td>
  </tr>
</table>
```

#### JSON

```javascript
iris.head(2).toJSON()
```

```json
{
  "Id": [1, 2],
  "SepalLengthCm": [5.099999904632568, 4.900000095367432],
  "SepalWidthCm": [3.5, 3],
  "PetalLengthCm": [1.399999976158142, 1.399999976158142],
  "PetalWidthCm": [0.20000000298023224, 0.20000000298023224],
  "Species": ["Iris-setosa", "Iris-setosa"]
}
```

#### CSV

```javascript
iris.head(2).toCSV(true) // hasHeader = true
```

```csv
Id,SepalLengthCm,SepalWidthCm,PetalLengthCm,PetalWidthCm,Species
1,5.099999904632568,3.5,1.399999976158142,0.20000000298023224,Iris-setosa
2,4.900000095367432,3,1.399999976158142,0.20000000298023224,Iris-setosa
```

### Settings

#### Printing

#### Float Precision (32 / 64)
