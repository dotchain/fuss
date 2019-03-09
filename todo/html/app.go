// Copyright (C) 2018 Ramesh Vyaghrapuri. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

//+build js, !wasm

// core app building code for todo mvc demo
package main

import (
	"github.com/dotchain/fuss/core"
	"github.com/dotchain/fuss/dom"
	_ "github.com/dotchain/fuss/dom/js"
	"github.com/dotchain/fuss/todo"
	"github.com/gopherjs/gopherjs/js"
)

type dn interface {
	DOMNode() *js.Object
}

func main() {
	container := js.Global.Get("document").Call("querySelector", "#container")
	s := todo.NewTasksStream(todo.Tasks{
		todo.Task{"one", true, "First task"},
		todo.Task{"two", false, "Second task"},
	})
	var app todo.AppStruct
	app.Begin()
	root := app.App("root", dom.Styles{}, s)
	app.End()
	container.Call("appendChild", root.(dn).DOMNode())

	s.On(&core.Handler{func() {
		s = s.Latest()
		app.Begin()
		app.App("root", dom.Styles{}, s)
		app.End()
	}})
}
