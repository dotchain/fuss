// Copyright (C) 2018 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

//+build ignore

package main

import (
	"encoding/gob"
	"net/http"

	"github.com/dotchain/dot"
	"github.com/dotchain/fuss/todo"
	"github.com/rs/cors"
)

func main() {
	gob.Register(todo.Todo{})
	gob.Register(todo.TodoList{})
	http.Handle("/todo/", cors.Default().Handler(dot.BoltServer("todo.bolt")))
	http.ListenAndServe(":8080", nil)
}
