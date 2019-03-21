// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.
//
// Code generated by . DO NOT EDIT.

package datum_test

import (
	datum "github.com/dotchain/fuss/fussy/v2/testdata/parse"
)

// NewMyTest is the constructor for MyTestFunc
func NewMyTest() (update MyTestFunc, close func()) {
	var lasta datum.Array
	var lastresult float32
	var initialized bool
	avgFnMap := map[interface{}]datum.AvgFunc{}
	avgCloseMap := map[interface{}]func(){}
	avgUsedMap := map[interface{}]bool{}

	depsLocal := &testDeps{
		avg: func(key interface{}, a datum.Array) (result float32) {
			avgUsedMap[key] = true
			if avgFnMap[key] == nil {
				avgFnMap[key], avgCloseMap[key] = datum.NewAvg()
			}
			return avgFnMap[key](key, a)
		},
	}

	close = func() {
		for key := range avgCloseMap {
			if !avgUsedMap[key] {
				avgCloseMap[key]()
				delete(avgCloseMap, key)
				delete(avgFnMap, key)
			}
		}
		avgUsedMap = map[interface{}]bool{}
	}

	update = func(deps interface{}, a datum.Array) (result float32) {
		if initialized {
			switch {
			case lasta.Equals(a):

			default:
				return lastresult
			}
		}
		initialized = true
		lasta = a
		lastresult = myTest(depsLocal, a)
		close()
		return lastresult
	}

	return update, close
}

type equals interface {
	Equals(o interface{}) bool
}
