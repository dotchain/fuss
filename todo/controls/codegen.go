// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

//+build ignore

package main

import (
	"io/ioutil"
	"path/filepath"
	"runtime"

	"github.com/dotchain/fuss/fussy"
)

func main() {
	_, self, _, _ := runtime.Caller(0)
	output := "generated.go"
	skip := []string{"generated.go"}
	info, err := fussy.ParseDir(filepath.Dir(self), "controls", skip)
	if err != nil {
		panic(err)
	}
	info.Generator = self

	ioutil.WriteFile(output, []byte(fussy.Generate(*info)), 0644)
}
