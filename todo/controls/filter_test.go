// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package controls_test

import (
	"fmt"

	"github.com/dotchain/dot/streams"
	"github.com/dotchain/fuss/dom/html"
	"github.com/dotchain/fuss/todo/controls"
	"github.com/yosssi/gohtml"
)

func Example_filter() {
	filter, close := controls.NewFilter()
	selected := &streams.S16{Stream: streams.New(), Value: controls.ShowAll}

	root := filter("root", selected)
	fmt.Println(gohtml.Format(fmt.Sprint(root)))

	selected = selected.Update(controls.ShowActive)
	root = filter("root", selected)
	fmt.Println(gohtml.Format(fmt.Sprint(root)))

	html.Click(root.Children()[2])
	if selected.Latest().Value != controls.ShowDone {
		fmt.Println("Unexpected selection state", selected.Latest().Value)
	}

	selected = selected.Latest()
	root = filter("root", selected)
	fmt.Println(gohtml.Format(fmt.Sprint(root)))

	close()
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
