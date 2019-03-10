// Copyright (C) 2018 Ramesh Vyaghrapuri. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

//+build js

// core app building code for todo mvc demo
package main

import (
	"github.com/dotchain/fuss/dom/js"
	"github.com/dotchain/fuss/todo"
)

func main() {
	var app todo.AppStruct
	app.Begin()
	root := app.App("root")
	app.End()
	js.QuerySelector("#container").InsertChild(0, root)
}
