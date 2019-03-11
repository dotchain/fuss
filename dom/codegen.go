// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

//+build ignore

package main

import (
	"github.com/dotchain/fuss/fussy"
	"io/ioutil"
	"path"
	"runtime"
)

func main() {
	_, self, _, _ := runtime.Caller(0)
	output := "generated.go"
	info := fussy.ParseDir(path.Dir(self), output)
	info.Generator = "github.com/dotchain/fuss/dom/codegen.go"
	info.Streams = []fussy.StreamInfo{
		{StreamType: "BoolStream", ValueType: "bool"},
		{StreamType: "TextStream", ValueType: "string"},
	}
	ioutil.WriteFile(output, []byte(fussy.Generate(info)), 0644)
}
