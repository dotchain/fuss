// Copyright (C) 2018 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

//+build js

package main

import (
	"encoding/gob"

	"github.com/dotchain/dot"
	"github.com/dotchain/dot/ops"
	"github.com/dotchain/fuss/dom/js"
	"github.com/dotchain/fuss/todo"
)

func SaveSession(version int, pending []ops.Op, todos todo.TodoList) {
	// this is not yet implemented. if it were, then
	// this value should be persisted locally and returned
	// by the call to savedSession
}

func SavedSession() (version int, pending []ops.Op, todos todo.TodoList) {
	// this is not yet implemented. return default values
	return -1, nil, nil
}

func main() {
	gob.Register(todo.Todo{})
	gob.Register(todo.TodoList{})

	url := "http://localhost:8080/todo/"
	version, pending, todos := SavedSession()

	_, s := dot.Reconnect(url, version, pending)
	todosStream := &todo.TodoListStream{Stream: s, Value: todos}

	/**
	// save session before shutdown
	defer func() {
		todosStream.Stream.Nextf("key", nil)
		version, pending = session.Close()
		todos = todosStream.Latest().Value
		SaveSession(version, pending, todos)
	}()
	**/

	collab, _ := todo.NewCollab()
	js.QuerySelector("#container").InsertChild(0, collab("root", todosStream))

	todosStream.Stream.Nextf("key", func() {
		todosStream = todosStream.Latest()
		collab("root", todosStream)
	})
}
