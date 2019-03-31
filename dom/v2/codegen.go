// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

//+build ignore

package main

import (
	"io/ioutil"
	"path/filepath"
	"runtime"

	"github.com/dotchain/fuss/fussy/v2"
)

func main() {
	_, self, _, _ := runtime.Caller(0)
	skip := []string{"generated.go", "generated_test.go"}
	info, err := fussy.ParseDir(filepath.Dir(self), "dom", skip)
	if err != nil {
		panic(err)
	}

	info.Generator = "github.com/dotchain/fuss/dom/codegen.go"
	ioutil.WriteFile(skip[0], []byte(fussy.Generate(*info)), 0644)

	info, err = fussy.ParseDir(filepath.Dir(self), "dom_test", skip)
	if err != nil {
		panic(err)
	}

	info.Generator = "github.com/dotchain/fuss/dom/codegen.go"
	ioutil.WriteFile(skip[1], []byte(fussy.Generate(*info)), 0644)
}
