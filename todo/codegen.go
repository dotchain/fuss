// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

//+build ignore

package main

import (
	"io/ioutil"
	"path/filepath"
	"runtime"

	"github.com/dotchain/dot/x/dotc"
	"github.com/dotchain/fuss/fussy"
)

func main() {
	generateTypes()
	generateComponents()
}

func generateTypes() {
	_, self, _, _ := runtime.Caller(0)
	output := filepath.Join(filepath.Dir(self), "generated1.go")

	info := dotc.Info{
		Package: "todo",
		Structs: []dotc.Struct{{
			Recv: "t",
			Type: "Todo",
			Fields: []dotc.Field{{
				Name: "Complete",
				Key:  "complete",
				Type: "bool",
			}, {
				Name: "Description",
				Key:  "desc",
				Type: "string",
			}},
		}},
		Slices: []dotc.Slice{{
			Recv:     "t",
			Type:     "TodoList",
			ElemType: "Todo",
		}},
	}
	code, err := info.Generate()
	if err != nil {
		panic(err)
	}
	err = ioutil.WriteFile(output, []byte(code), 0644)
	if err != nil {
		panic(err)
	}
}

func generateComponents() {
	_, self, _, _ := runtime.Caller(0)
	output := filepath.Join(filepath.Dir(self), "generated2.go")
	skip := []string{"generated2.go"}
	info, err := fussy.ParseDir(filepath.Dir(self), "todo", skip)
	if err != nil {
		panic(err)
	}
	err = ioutil.WriteFile(output, []byte(fussy.Generate(*info)), 0644)
	if err != nil {
		panic(err)
	}
}
