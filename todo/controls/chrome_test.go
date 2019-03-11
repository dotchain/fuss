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

func Example_renderFilteredTasks() {
	cache := controls.ChromeStruct{}
	texts := dom.TextViewStruct{}

	cache.Begin()
	texts.Begin()
	root := cache.Chrome(
		"root",
		texts.TextView("header", dom.Styles{}, "Header"),
		texts.TextView("body", dom.Styles{}, "Body"),
		texts.TextView("footer", dom.Styles{}, "Footer"),
	)
	cache.End()

	fmt.Println(gohtml.Format(fmt.Sprint(root)))

	cache.Begin()
	cache.End()
	texts.Begin()
	texts.End()
	leaks := html.GetCurrentResources()
	if n := len(leaks); n > 0 {
		fmt.Println("Leaked", n, "resources\n", leaks)
	}

	// Output:
	// <div style="display: flex; flex-direction: column">
	//   <div style="flex-shrink: 0">
	//     <span>
	//       Header
	//     </span>
	//   </div>
	//   <div style="overflow-y: auto; flex-grow: 1">
	//     <span>
	//       Body
	//     </span>
	//   </div>
	//   <div style="flex-shrink: 0">
	//     <span>
	//       Footer
	//     </span>
	//   </div>
	// </div>
}
