// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package controls_test

import (
	"fmt"
	"github.com/dotchain/fuss/dom/html"
	"github.com/dotchain/fuss/dom/v2"
	"github.com/dotchain/fuss/todo/controls"
	"github.com/yosssi/gohtml"
)

func Example_renderFilteredTasks() {
	header, closeh := dom.NewTextView()
	body, closeb := dom.NewTextView()
	footer, closef := dom.NewTextView()
	chrome, close := controls.NewChrome()

	root := chrome(
		"root",
		header("header", dom.Styles{}, "Header"),
		body("body", dom.Styles{}, "Body"),
		footer("footer", dom.Styles{}, "Footer"),
	)

	fmt.Println(gohtml.Format(fmt.Sprint(root)))

	close()
	closeb()
	closeh()
	closef()
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
