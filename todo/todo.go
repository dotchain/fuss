// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

// Package todo demonstrates a simple todo mvc app built with FUSS
package todo

//go:generate go run codegen.go
//go:generate gopherjs build -m html/app.go -o html/app.js
//go:generate gopherjs build -m collab/app.go -o collab/app.js
import (
	"github.com/dotchain/dot/streams"
	"github.com/dotchain/fuss/dom"
	"github.com/dotchain/fuss/todo/controls"
)

// Todo represents an item in the TODO list.
type Todo struct {
	ID          string
	Complete    bool
	Description string
}

// TodoList represents a collection of todos
type TodoList []Todo

func (list TodoList) renderTodo(fn func(int, Todo) dom.Element) []dom.Element {
	result := make([]dom.Element, len(list))
	for kk, elt := range list {
		result[kk] = fn(kk, elt)
	}
	return result
}

// Todo renders a Todo item
func todo(deps *todoDeps, todoStream *TodoStream) dom.Element {
	return deps.run(
		"root",
		dom.Styles{},
		deps.checkboxEdit("cb", dom.Styles{}, todoStream.Complete(), ""),
		deps.textEdit("textedit", dom.Styles{}, todoStream.Description()),
	)
}

type TodoFunc = func(key interface{}, todoStream *TodoStream) dom.Element
type todoDeps struct {
	run          dom.RunFunc
	checkboxEdit dom.CheckboxEditFunc
	textEdit     dom.TextEditFunc
}

// FilteredList renders  a list of filtered todos
//
// Individual tasks can be modified underneath.
func filteredList(deps *filteredListDeps, filter *streams.S16, todos *TodoListStream) dom.Element {
	return deps.vRun(
		"root",
		dom.Styles{},
		todos.Value.renderTodo(func(index int, t Todo) dom.Element {
			done := filter.Value == controls.ShowDone
			active := filter.Value == controls.ShowActive
			if t.Complete && active || !t.Complete && done {
				return nil
			}

			return deps.todo(t.ID, todos.Item(index))
		})...,
	)
}

type FilteredListFunc = func(key interface{}, filter *streams.S16, todos *TodoListStream) dom.Element
type filteredListDeps struct {
	vRun dom.VRunFunc
	todo TodoFunc
}

// ListView renders aa filteredList with a filter to control the behavior
func listView(deps *listViewDeps, todos *TodoListStream, filterState *streams.S16) (*streams.S16, dom.Element) {
	if filterState == nil {
		filterState = &streams.S16{Stream: streams.New(), Value: controls.ShowAll}
	}

	appendStream := todos.appendStream()
	return filterState, deps.vRun(
		"root",
		dom.Styles{},
		deps.textReset("input", appendStream, "Add a todo"),
		deps.filter("f", filterState),
		deps.filteredList("todos", filterState, todos),
	)
}

type ListViewFunc = func(key interface{}, todos *TodoListStream) dom.Element
type listViewDeps struct {
	vRun         dom.VRunFunc
	textReset    controls.TextResetFunc
	filter       controls.FilterFunc
	filteredList FilteredListFunc
}

// App hosts the todo MVC app
func app(deps *appDeps, state *TodoListStream) (*TodoListStream, dom.Element) {
	if state == nil {
		// TODO: fetch this from the network
		state = &TodoListStream{
			Stream: streams.New(),
			Value: TodoList{
				Todo{"one", true, "First task"},
				Todo{"two", false, "Second task"},
			},
		}
	}

	return state, deps.collab("root", state)
}

type AppFunc = func(key interface{}) dom.Element
type appDeps struct {
	collab CollabFunc
}

// Collab hosts a collaborative todo MVC app
func collab(deps *collabDeps, todos *TodoListStream) dom.Element {
	return deps.chrome(
		"root",
		deps.textView("h", dom.Styles{}, "FUSS TODO"),
		deps.listView("root", todos),
		deps.a(
			"a",
			dom.Styles{},
			"https://github.com/dotchain/fuss",
			deps.textView("tv", dom.Styles{}, "github"),
		),
	)
}

type CollabFunc = func(key interface{}, todos *TodoListStream) dom.Element
type collabDeps struct {
	textView dom.TextViewFunc
	listView ListViewFunc
	a        dom.AFunc
	chrome   controls.ChromeFunc
}
