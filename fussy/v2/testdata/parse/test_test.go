// This file should be ignored because it is a _test.go file

package datum_test

import "github.com/dotchain/fuss/fussy/v2/testdata/parse"

type MyTestFunc = func(key interface{}, a datum.Array) float32

func myTest(deps *testDeps, a datum.Array) float32 {
	return deps.avg("key", a)
}

type testDeps struct {
	avg datum.AvgFunc
}

// skipping missing types with name = newXYZ() or NewXY()
var something = newboo()
var somethingElse = NewBoo()

