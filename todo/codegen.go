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
	files := []string{"todo.go"}
	info := fussy.ParseFiles(files, output)
	info.Generator = "github.com/dotchain/fuss/todo/codegen.go"
	info.Streams = []fussy.StreamInfo{
		{
			StreamType: "TaskStream",
			ValueType:  "Task",
			Fields: []fussy.FieldInfo{{
				Field:            "Done",
				FieldType:        "bool",
				FieldStreamType:  "dom.BoolStream",
				FieldConstructor: "dom.NewBoolStream",
				FieldSubstream:   "DoneSubstream",
			}, {
				Field:            "Description",
				FieldType:        "string",
				FieldStreamType:  "dom.TextStream",
				FieldConstructor: "dom.NewTextStream",
				FieldSubstream:   "DescriptionSubstream",
			}},
			EntryStreamType: "",
		},
		{
			StreamType:       "TasksStream",
			ValueType:        "Tasks",
			Fields:           nil,
			EntryStreamType:  "TaskStream",
			EntryConstructor: "NewTaskStream",
		},
	}
	ioutil.WriteFile(output, []byte(fussy.Generate(info)), 0644)
}
