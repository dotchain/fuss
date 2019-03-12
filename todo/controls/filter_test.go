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

func Example_filter() {
	cache := controls.FilterStruct{}
	done, active := dom.NewBoolStream(false), dom.NewBoolStream(false)

	cache.Begin()
	root := cache.Filter("root", done, active)
	cache.End()

	fmt.Println(gohtml.Format(fmt.Sprint(root)))

	cache.Begin()
	done = done.Append(nil, true, true)
	active = active.Append(nil, true, true)
	root = cache.Filter("root", done, active)
	cache.End()

	fmt.Println(gohtml.Format(fmt.Sprint(root)))

	cache.Begin()
	cache.End()
	leaks := html.GetCurrentResources()
	if n := len(leaks); n > 0 {
		fmt.Println("Leaked", n, "resources\n", leaks)
	}

	// Output:
	// <div style="display: flex; flex-direction: row">
	//   <input id="done" type="checkbox"/>
	//   <label for="done">
	//     Show Completed
	//   </label>
	//   <input id="notDone" type="checkbox"/>
	//   <label for="notDone">
	//     Show Incomplete
	//   </label>
	// </div>
	// <div style="display: flex; flex-direction: row">
	//   <input checked="" id="done" type="checkbox"/>
	//   <label for="done">
	//     Showing Completed
	//   </label>
	//   <input checked="" id="notDone" type="checkbox"/>
	//   <label for="notDone">
	//     Showing Incomplete
	//   </label>
	// </div>
}
