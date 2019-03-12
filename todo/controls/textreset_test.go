// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package controls_test

import (
	"fmt"
	"github.com/dotchain/fuss/dom"
	"github.com/dotchain/fuss/dom/html"
	"github.com/dotchain/fuss/todo/controls"
	"github.com/yosssi/gohtml"
)

func Example_textreset() {
	cache := controls.TextResetStruct{}
	text := dom.NewTextStream("hello")

	cache.Begin()
	root := cache.TextReset("root", text, "booya")
	cache.End()

	html.SetValue(root, "singer")
	text = text.Latest()
	if text.Value != "singer" {
		fmt.Println("Unexpected", text.Value)
	}

	cache.Begin()
	root = cache.TextReset("root", text, "booya")
	cache.End()

	fmt.Println(gohtml.Format(fmt.Sprint(root)))

	cache.Begin()
	cache.End()
	leaks := html.GetCurrentResources()
	if n := len(leaks); n > 0 {
		fmt.Println("Leaked", n, "resources\n", leaks)
	}

	// Output:
	// <input placeholder="booya" type="text"/>
}
