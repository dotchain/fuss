// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

//+build ignore

package main

import (
	"github.com/dotchain/fuss/fussy"
	"io/ioutil"
)

func main() {
	output := "generated.go"
	files := []string{"dom.go", "elt.go", "checkbox.go", "text.go", "label.go", "button.go"}
	info := fussy.ParseFiles(files, output)
	info.Streams = []fussy.StreamInfo{
		{StreamType: "BoolStream", ValueType: "bool"},
		{StreamType: "TextStream", ValueType: "string"},
	}
	ioutil.WriteFile(output, []byte(fussy.Generate(info)), 0644)
}
