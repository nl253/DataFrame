# DataFrame

- [pandas](https://pandas.pydata.org/pandas-docs/stable/reference/frame.html)-like data-frame library
- Column built on typed arrays
- tries to be memory efficient
- extensions to arrays
- great for tabular data
- reads data in various formats: CSV, JSON, array of rows, array of columns, JS object, JS Map
- work in progress

See [JSDoc](http://usejsdoc.org/)-generated API docs see [docs](https://nl253.github.io/DataFrame/).

For more human-friendly docs keep reading.

## Installation

```sh
npm install --save dataf
```

## Human-Friendly API

### Preliminaries

Run the node REPL.

```sh
node
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
[ 'alcohol.csv',   // alcohol consumption math students
  'countries.csv', // geopolitical data for all countries
  'diabetes.csv',
  'food.csv',      // food choices
  'got.csv',       // game of thrones deaths
  'happiness.csv', // world happiness 2017
  'iris.csv',
  'mushrooms.csv',
  'pokemon.csv',   // stats for all from all generations
  'superheros.csv'
  ...  ]
```

All have been placed in the public domain.

### Load the Iris DataSet

```javascript
let iris = new DF('iris') // use `let`, you will be re-assigning a lot
```

**NOTE** 

the lookup of datasets happens by recursive search of each directory in `DF.opts.DATASETS`. You can use this and simply `df.opts.DATASETS.push(yourDir)` and your dataset will be discoverable. You don't need to specify the extension. `.csv` and `.json` extensions are appended if not provided (e.g. iris is actually stored in `iris.csv`). Dataset files must be in either CSV or JSON formats.

### Selecting / Slicing Rows

#### Head / Tail

```javascript
iris.head().print()
//  .head(20) for the first 20 rows
//  .tail()   for last rows
```

```text
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

**NOTE** the data types next to column names and memory indicators for every column.

#### Slicing

```javascript
iris.slice(10, 20).print() // can be .slice(5) for .slice(5, end)
```

```text
# u8 Id f32 SepalLe... f32 SepalWi... f32 PetalLe... f32 PetalWi... s     Species
- ----- -------------- -------------- -------------- -------------- -------------
0    11           5.40           3.70           1.50           0.20 Iris-setos...
1    12           4.80           3.40           1.60           0.20 Iris-setos...
- ----- -------------- -------------- -------------- -------------- -------------
     2B             8B             8B             8B             8B           NaN
```

**NOTE** the library will try to compute the width of each column

#### Getting a Column (Column)

We know that there are 6 columns (try running `iris.nCols`).  To get all column names run:

```javascript
iris.colNames.print(100) // make sure it prints all
```

```javascript
Column s [Id, SepalLengthCm, SepalWidthCm, PetalLengthCm, PetalWidthCm, Species]
```

If you want to extract a column (Column, see the Column API below) *from* a data frame try:

```javascript
iris.Species.print(5) // last column
```

```text
Column s[Iris-setosa, Iris-setosa, Iris-setosa, Iris-setosa, Iris-setosa, ... 145 more]
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

```text
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

```text
  # u8 Id f32 SepalLe... f32 SepalWi...
--- ----- -------------- --------------
  0     1           5.09           3.50
  1     2           4.90           3.00
  2     3           4.69           3.20
...   ...     (147 more)            ...
--- ----- -------------- --------------
     150B           600B           600B
```

This is the same as:

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

```text
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

// ... DataFrame with subset of rows with just Iris-setosa
```

#### Matching Predicate (Test)

Signature: `iris.filter(rowTestFunc)`. <br>
Signature: `iris.filter(valTestFunc, colId)`.<br>

```javascript
iris.where('Iris-setosa', -1)
// OR
iris.filter(species => species === 'Iris-setosa', -1)
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
const row = iris.row(20) // 21st row

[ 21,
  5.400000095367432,
  3.4000000953674316,
  1.7000000476837158,
  0.20000000298023224,
  'Iris-setosa' ]
```

#### Iterating Over Values in a Single Row

```javascript
const irow = iris.irow(10);

Array.from(irow)

[ 5.400000095367432,
  3.700000047683716,
  1.5,
  0.20000000298023224,
  'Iris-setosa' ]
```

#### Iterating Over Rows

If you want to iterate over all the rows (not efficient) try:

```javascript
const rowIt = iris.slice(0, 3).rowsIter // (getter)

for (const r of rowIt) {
  console.log(r)
}

// you may also iterate over the dataframe (equivalent method)
for (const r of iris) {
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

#### In-Place Modification of Columns

Just assign:

```javascript
// 2nd col
iris[1] = iris[1].map(s => s >= 5 ? 0 : 1)

// equivalent to:
iris.SepalLengthCm = iris.SepalLengthCm.map(s => s >= 5 ? 0 : 1)
```

**NOTE** this might have to be `dataset[' Col With Spaces'] = newCol`.

#### Mapping Columns

Apply function to each element is selected column:

```javascript
iris.map(-1, label => {
  // there is an easier way to do this (see `DataFrame.labelEncode()`)
  if (label === 'Iris-versi') {
    return 0;
  } else if (label === 'Iris-virgi') {
    return 1;
  } else {
    return 2;
  }
});
```

**NOTE** use `iris.map(null, f)` to apply to all columns.

#### Mapping Shortcuts

`null` means it will be applied to all.

- `.trunc(colId | null)`
- `.floor(colId | null)`
- `.ceil(colId | null)`
- `.round(colId | null)`
- `.abs(colId | null)`
- `.sqrt(colId | null)`
- `.cbrt(colId | null)`
- `.square(colId | null)`
- `.cube(colId | null)`
- `.add(colId | null, n)`
- `.sub(colId | null, n)`
- `.mul(colId | null, n)`
- `.div(colId | null, n)`

It's smart enough to know not to apply them to string columns if they don't
make sense (e.g. `.abs()`). String columns are ignored.

#### Rename Columns

```javascript
iris.rename(0, 'First').rename(-2, 'Second to Last')
// or just
iris.rename(0, 'First', -2, 'Second to Last')
```

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

#### Appending a Column

```javascript
iris.appendCol(iris.Id, 'Id2') // .appendCol(col, colName)
```

#### Shuffle, Reverse

```javascript
iris.shuffle()
iris.reverse()
```

Both are *safe* in that the **won't modify** in place.

#### Sort

Signature: `iris.sort(colId, 'asc' (default) | 'des' )`. <br>

```javascript
iris.sort('SepalWidthCm') // default is iris.sort(colId, 'asc')
```

```javascript
iris.sort('SepalWidthCm', 'des') // descending sort
```

**NOTE**

constants such as `'des'` are defined in the `constants` module which you can import:

```js
const { DataType, LoggingLevel, PrintingPreset, SortingOrder, What } = require('dataf/constants')
``` 

### Statistics & Math

#### Aggregate operations, each is `DataFrame -> DataFrame`

**MATH**

- `.add()`
- `.sub()`
- `.mul()`
- `.div()`

**STATS**

- `.min()`
- `.max()`
- `.range()`
- `.mean()`
- `.var()` variance
- `.stdev()` standard deviation
- `.median()`
- `.Q3()`
- `.Q1()`
- `.IQR()` inter-quartile range
- `.skewness()`
- `.kurtosis()`
- `.mad()` mean absolute deviation

E.g.:

```javascript
iris.IQR()
```

```text
# s      column f32 IQR
- ------------- -------
0            Id   75.00
1 SepalLengt...    1.30
2 SepalWidth...    0.50
3 PetalLengt...    3.50
4 PetalWidth...    1.50
- ------------- -------
            NaN     20B
```

##### Sample (get a random subset of rows)

Signatures:

<table>
  <tr>
    <th>Signature</th>
    <th>Description</th>
  </tr>
  <tr>
    <td>`.sample(0.15)`</td>
    <td>for random 15% of the dataset</td>
  </tr>
  <tr>
    <td>`iris.sample(30)`</td>
    <td>for random 30 sample of the dataset</td>
  </tr>
  <tr>
    <td>`iris.sample(0.5, true)`</td>
    <td>with replacement (default)</td>
  </tr>
  <tr>
    <td>`iris.sample(100, false)`</td>
    <td>**without** replacement</td>
  </tr>
</table>

##### Summary

```javascript
iris.summary() // this will produce a summary data frame with info for every column
```

```text
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

This is particularly useful for nominal / discrete attributes that take on a
small amount of values. E.g. `Gender` is one of `{M, F}` or `Salary` is one of `{Low, Med, High}`.

```javascript
iris.counts(-1) // for the last column
// iris.ps(-1) // for normalized values
```

```text
# s     Species u8 count
- ------------- --------
0 Iris-setos...       50
1 Iris-versi...       50
2 Iris-virgi...       50
- ------------- --------
            NaN       3B
```

#### Correlations (A Matrix Operation)

For a correlation of each column with each other column (matrix):

```javascript
iris.corr()      // .corr(false) to *not* print the first column
// iris.cov()    // covariance
// iris.dot()    // dot product between each col
distance
distance
distance
```

```text
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
// from all cols i.e. remove all rows where any of the value is NaN
iris.removeAll(NaN)

// from 1th and 3rd cols and from col 'PetalLengthCm'
iris.removeAll(NaN, 0, 2, 'PetalLengthCm')
```

#### Discretize (Bin)

```javascript
iris.kBins('SepalLengthCm', 5); // 5 bins for this column

iris.kBins(null, 3);            // 3 bins for all columns

iris.kBins(2, 3) // 3rd (2 idx) col, 3 bins
    .col(2)      // select ONLY 3rd column (index is 2), which is of type Column
    .print(10)
```

```text
Column u8[2, 1, 2, 1, 2, 2, 2, 2, 1, 1, ... 40 more]
```

**NOTE** this is smart enough only to target numeric attributes so string columns will be ignored (no need to run `.numeric`).

#### Feature (Column) Selection

Feature selection (i.e. select best columns, by default uses `"var"` -- variance):

Signature: `iris.nBest(n, metric)` where metric is one of:

- `"var"`
- `"stdev"`
- `"mean"`
- `"mad"`
- `"IQR"`
- `"median"`
- `"Q1"`
- `"Q3"`
- `"skewness"`
- `"min"`
- `"range"`
- `"max"`

OR a function from Column (one column) to a number (`Column -> Num`). <br>

```javascript
iris.drop('Id') // `Id` column is not useful
    .numeric    // select all numeric cols
    .nBest(2)   // best 2 features using variance as score
    .print(3)   // show first 3 rows

// try: iris.drop('Id').numeric.nBest(2, 'mad').print(3)
```

```text
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

Using `.nBest()` in this way is naive and you might want to normalize (scale to the same range) the values:

```javascript
iris.drop('Id')  // `Id` column is not useful
    .numeric     // select all numeric cols
    .normalize() // bring them to range [0, 1]
    .nBest(2)    // best 2 features using variance as score
    .print(3)
```

As you can see you might get different results:

```text
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

It's a bit awkward to constantly have to drop the `'Species'` column because it's a string column...

You can easily convert it to a numeric column:

From:

```javascript
iris.select(-2, -1).print(48, 52)
```

```text
  # f32 PetalWi... s     Species
--- -------------- -------------
...      (48 more)           ...
 48           0.20 Iris-setos...
 49           0.20 Iris-setos...
 50           1.39 Iris-versi...
 51           1.50 Iris-versi...
...      (98 more)           ...
--- -------------- -------------
              600B           NaN
```

To:

```javascript
iris.select(-2, -1).labelEncode().print(48, 52)
```

```text
  # f32 PetalWi... u8 Species
--- -------------- ----------
...      (48 more)        ...
 48           0.20          0
 49           0.20          0
 50           1.39          1
 51           1.50          1
...      (98 more)        ...
--- -------------- ----------
              600B       150B
```

By default all string columns will be label encoded (numeric columns will be ignored). You may specify the `colIds` e.g. `df.labelEncode(0, -3, 'Target')`.

#### One-Hot Encoding

Signature: `iris.oneHot(colId)` <br>

```javascript
// expects the column to be unsigned int
iris.labelEncode('Species')
    .oneHot('Species')
    .print(48, 52)
```

```text
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
iris.select(1).print(3)
```

```text
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
iris.select(1)
    .clip(null, 4.88, 5) // null == all cols
    .print(3)
```

```text
  # f32 SepalLe...
--- --------------
  0           5.00
  1           4.90
  2           4.88
...     (147 more)
--- --------------
              600B
```

Notice that `5.09` got clipped to `5.00`!

### Outliers

To remove outliers (outside of Q1 to Q3) run:

```javascript
iris.dropOutliers()      // consider all cols
iris.dropOutliers(0, -2) // consider just 1st and second to last cols
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
    <td>s</td>
  </tr>
  <tr>
    <td>32-bit signed integer</td>
    <td>i32</td>
  </tr>
  <tr>
    <td>16-bit signed integer</td>
    <td>i16</td>
  </tr>
  <tr>
    <td>8-bit signed integer</td>
    <td>i8</td>
  </tr>
  <tr>
    <td>32-bit unsigned integer</td>
    <td>u32</td>
  </tr>
  <tr>
    <td>16-bit unsigned integer</td>
    <td>u16</td>
  </tr>
  <tr>
    <td>8-bit unsigned integer</td>
    <td>u8</td>
  </tr>
  <tr>
    <td>32-bit float (single precision)</td>
    <td>f32</td>
  </tr>
  <tr>
    <td>64-bit float (double precision)</td>
    <td>f64</td>
  </tr>
</table>

If you want to get the data type for all columns try:

```javascript
iris.dtypes

[ 'u8', 'f32', 'f32', 'f32', 'f32', 's' ] // read-only
```

Or for a prettier output make a meta data frame with information about the
previous data frame!

```javascript
iris.dtype() // note difference between `iris.dtype()` (method) and `iris.dtypes` (getter)
```

**SIDENOTE** `.dtype()` is an aggregate! This means it produces a data frame from applying a `Column -> *` operation to all columns.

```text
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
iris.cast(2, 'u8') // passing `null` instead of `2` would run cast on all cols
```

### Down-Casting

You can also run `iris.downcast()` and let the library figure out the most efficient data type for each column so that data is not lost.
This is especially useful after truncating (floats are converted to integers).

Default:

```text
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

```text
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

```text
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

To figure out how much your data frame is taking in total try:

```javascript
iris.memory()
    .col(-1)
    .add()

2550 // bytes
```

### Copies

#### Deep Copy

If for some reason you need a deep-copy try (expensive):

```javascript
iris.clone()
```

#### Shallow Copy

Shallow copies are cheap:

```javascript
iris.copy()
```

### Generalized Row Slicing

Sometimes you may want to get rows from 10th to 20th and e.g. 50th to 65th:

```javascript
//         [F, T],[F,  T] // FROM - TO
iris.slice(9, 19, 49, 64)
```

### Generalized Column Slicing

The same applies to column slices:

```javascript
iris.sliceCols(-3, -2, 0, 2)
```

```text
# f32 PetalLe... f32 PetalWi... u8 Id f32 SepalLe... f32 SepalWi...
- -------------- -------------- ----- -------------- --------------
0           1.39           0.20     1           5.09           3.50
1           1.39           0.20     2           4.90           3.00
2           1.29           0.20     3           4.69           3.20
- -------------- -------------- ----- -------------- --------------
             12B            12B    3B            12B            12B
```

### Exporting

#### HTML

```javascript
iris.head(2).toHTML(/* optional file name */)
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
iris.head(2).toJSON(/* optional file name */)
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
iris.head(2).toCSV(/* optional file name */)
```

```csv
Id,SepalLengthCm,SepalWidthCm,PetalLengthCm,PetalWidthCm,Species
1,5.099999904632568,3.5,1.399999976158142,0.20000000298023224,Iris-setosa
2,4.900000095367432,3,1.399999976158142,0.20000000298023224,Iris-setosa
```

#### SQL Table

```javascript
iris.head(2).toSQLTableDef('MyIrisTable', /* optional file name */)
```

```sql
CREATE TABLE IF NOT EXISTS MyIrisTable (
  
  Id INT,
  SepalLengthCm REAL,
  SepalWidthCm REAL,
  PetalLengthCm REAL,
  PetalWidthCm REAL,
  Species TEXT
)
```

#### SQL Updates

```javascript
iris.toSQLUpdates('MyIrisTable', /* optional file name */)
```

```sql
UPDATE MyIrisTable SET Id = 1, SepalLengthCm = 5.099999904632568, SepalWidthCm = 3.5, PetalLengthCm = 1.399999976158142, PetalWidthCm = 0.20000000298023224, Species = Iris-setosa;
UPDATE MyIrisTable SET Id = 2, SepalLengthCm = 4.900000095367432, SepalWidthCm = 3, PetalLengthCm = 1.399999976158142, PetalWidthCm = 0.20000000298023224, Species = Iris-setosa;
UPDATE MyIrisTable SET Id = 3, SepalLengthCm = 4.699999809265137, SepalWidthCm = 3.200000047683716, PetalLengthCm = 1.2999999523162842, PetalWidthCm = 0.20000000298023224, Species = Iris-setosa;
UPDATE MyIrisTable SET Id = 4, SepalLengthCm = 4.599999904632568, SepalWidthCm = 3.0999999046325684, PetalLengthCm = 1.5, PetalWidthCm = 0.20000000298023224, Species = Iris-setosa;
```

#### SQL Inserts

```javascript
iris.head(4).toSQLInserts('MyIrisTable', /* optional file name */)
```

```sql
INSERT INTO MyIrisTable (Id, SepalLengthCm, SepalWidthCm, PetalLengthCm, PetalWidthCm, Species) VALUES (1, 5.099999904632568, 3.5, 1.399999976158142, 0.20000000298023224, Iris-setosa);
INSERT INTO MyIrisTable (Id, SepalLengthCm, SepalWidthCm, PetalLengthCm, PetalWidthCm, Species) VALUES (2, 4.900000095367432, 3, 1.399999976158142, 0.20000000298023224, Iris-setosa);
INSERT INTO MyIrisTable (Id, SepalLengthCm, SepalWidthCm, PetalLengthCm, PetalWidthCm, Species) VALUES (3, 4.699999809265137, 3.200000047683716, 1.2999999523162842, 0.20000000298023224, Iris-setosa);
INSERT INTO MyIrisTable (Id, SepalLengthCm, SepalWidthCm, PetalLengthCm, PetalWidthCm, Species) VALUES (4, 4.599999904632568, 3.0999999046325684, 1.5, 0.20000000298023224, Iris-setosa);
```

### Settings

<table>
  <tr>
    <th>Option</th>
    <th>Default</th>
    <th>Sensible Alternatives</th>
    <th>Description</th>
  </tr>
  <tr>
    <td>`PRINT_PREC`</td>
    <td>2</td>
    <td>3, 4, 5, 6, 7, 8</td>
    <td>how many float digits after the radix point to print</td>
  </tr>
  <tr>
    <td>`FLOAT_PREC`</td>
    <td>32</td>
    <td>64</td>
    <td>-</td>
  </tr>
  <tr>
    <td>`MIN_COL_WIDTH`</td>
    <td>10</td>
    <td>12, 15, 20</td>
    <td>constrain width of columns when printing</td>
  </tr>
  <tr>
    <td>`HEAD_LEN`</td>
    <td>5</td>
    <td>7, 10, 20</td>
    <td>by default print this number of rows when running `.head()`, `.tail()` etc.</td>
  </tr>
</table>

To set:

```javascript
DF.opts.OPTION = VALUE;
```

### More Advanced Examples

#### Fix Column Names With Spaces

```javascript
const args = df.colNames
               // replace spaces with '_'
               .map(c => [c, c.replace(/\s+/, '_')])
               // flatten
               .reduce((pair1, pair2) => pair1.concat(pair2), []);

df = df.rename(...args)
```

#### Matrix of Normalized Differences Between Means of Columns

This would normally take a lot of code:

```javascript
iris.normalize()
    .matrix(
        (col1, col2) => Math.abs(col1.mean() - col2.mean()),
        true, // show cols
        true, // halves the computation time when f(c2, c1) == f(c1, c2)
        0)    // saves computation on the diagonal, when f(c, c) == id
```

#### Save Memory

```javascript
df = df.labelEncode()  // string cols => unsigned int
       .kBins(null, 5) // f64, f32, ... => unsigned int
       .downcast()     // optimize

// see memory
df.memory()

// see dtypes
df.dtype()

// megabytes
B = df.memory()  // mem for each col
      .add()     // add up
      .val(0, 1) // get total

MB = B / 1e6
```

### Column Human-Friendly API

TODO

### Disclaimer

1. I am not a statistician
2. Unit tests for `DataFrame` are not done yet
3. Alpha-stage
4. I would not use it in production (yet)
5. This isn't supposed to be an exact copy of pandas
6. In some places it's not efficient
7. Date columns / mixed data types not supported. Every column must be either
   numeric OR string. A single `DataFrame` may have a combination of numeric
   and string columns.
8. I am a student.

### License

MIT
