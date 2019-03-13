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
	selected := dom.NewFocusTrackerStream(dom.FocusTracker{Current: controls.ShowAll})

	cache.Begin()
	root := cache.Filter("root", selected)
	cache.End()

	fmt.Println(gohtml.Format(fmt.Sprint(root)))

	cache.Begin()
	selected = selected.Append(nil, dom.FocusTracker{Current: controls.ShowActive}, true)
	root = cache.Filter("root", selected)
	cache.End()
	fmt.Println(gohtml.Format(fmt.Sprint(root)))

	html.Click(root.Children()[2])
	if selected.Latest().Value.Current != controls.ShowDone {
		fmt.Println("Unexpected selection state", selected.Latest().Value.Current)
	}

	cache.Begin()
	selected = selected.Latest()
	root = cache.Filter("root", selected)
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
	//   <div tabindex="0">
	//     <label style="border-radius: 4px; border-color: blue; border-width: 1px">
	//       All
	//     </label>
	//   </div>
	//   <div tabindex="0">
	//     <label style="border-radius: 4px; border-color: lightgrey; border-width: 1px">
	//       Active
	//     </label>
	//   </div>
	//   <div tabindex="0">
	//     <label style="border-radius: 4px; border-color: lightgrey; border-width: 1px">
	//       Done
	//     </label>
	//   </div>
	// </div>
	// <div style="display: flex; flex-direction: row">
	//   <div tabindex="0">
	//     <label style="border-radius: 4px; border-color: lightgrey; border-width: 1px">
	//       All
	//     </label>
	//   </div>
	//   <div tabindex="0">
	//     <label style="border-radius: 4px; border-color: blue; border-width: 1px">
	//       Active
	//     </label>
	//   </div>
	//   <div tabindex="0">
	//     <label style="border-radius: 4px; border-color: lightgrey; border-width: 1px">
	//       Done
	//     </label>
	//   </div>
	// </div>
	// <div style="display: flex; flex-direction: row">
	//   <div tabindex="0">
	//     <label style="border-radius: 4px; border-color: lightgrey; border-width: 1px">
	//       All
	//     </label>
	//   </div>
	//   <div tabindex="0">
	//     <label style="border-radius: 4px; border-color: lightgrey; border-width: 1px">
	//       Active
	//     </label>
	//   </div>
	//   <div tabindex="0">
	//     <label style="border-radius: 4px; border-color: blue; border-width: 1px">
	//       Done
	//     </label>
	//   </div>
	// </div>
}
