// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package todo_test

import (
	"fmt"
	"github.com/dotchain/fuss/dom"
	"github.com/dotchain/fuss/dom/html"
	"github.com/dotchain/fuss/todo"
	"github.com/dotchain/fuss/todo/controls"
	"github.com/yosssi/gohtml"
)

func Example_app() {
	cache := todo.AppStruct{}

	cache.Begin()
	root := cache.App("root")
	cache.End()

	// add a "Third task" via the input control
	html.SetValue(root.Children()[1].Children()[0].Children()[0], "Third task")

	fmt.Println(gohtml.Format(fmt.Sprint(root)))

	cache.Begin()
	cache.End()
	leaks := html.GetCurrentResources()
	if n := len(leaks); n > 0 {
		fmt.Println("Leaked", n, "resources\n", leaks)
	}

	// Output:
	// <div style="display: flex; flex-direction: column">
	//   <div style="flex-shrink: 0">
	//     <span>
	//       FUSS TODO
	//     </span>
	//   </div>
	//   <div style="overflow-y: auto; flex-grow: 1">
	//     <div style="display: flex; flex-direction: column">
	//       <input placeholder="Add a task" type="text"/>
	//       <div style="display: flex; flex-direction: row">
	//         <div tabindex="0">
	//           <label style="border-radius: 4px; border-color: blue; border-width: 1px">
	//             All
	//           </label>
	//         </div>
	//         <div tabindex="0">
	//           <label style="border-radius: 4px; border-color: lightgrey; border-width: 1px">
	//             Active
	//           </label>
	//         </div>
	//         <div tabindex="0">
	//           <label style="border-radius: 4px; border-color: lightgrey; border-width: 1px">
	//             Done
	//           </label>
	//         </div>
	//       </div>
	//       <div style="display: flex; flex-direction: column">
	//         <div style="display: flex; flex-direction: row">
	//           <input checked="" type="checkbox"/>
	//           <input type="text" value="First task"/>
	//         </div>
	//         <div style="display: flex; flex-direction: row">
	//           <input type="checkbox"/>
	//           <input type="text" value="Second task"/>
	//         </div>
	//         <div style="display: flex; flex-direction: row">
	//           <input type="checkbox"/>
	//           <input type="text" value="Third task"/>
	//         </div>
	//       </div>
	//     </div>
	//   </div>
	//   <div style="flex-shrink: 0">
	//     <a href="https://github.com/dotchain/fuss">
	//       <span>
	//         github
	//       </span>
	//     </a>
	//   </div>
	// </div>
}

func Example_renderFilteredTasks() {
	tasks := todo.Tasks{
		{"one", false, "first task"},
		{"two", true, "second task"},
	}
	cache := todo.FilteredTasksStruct{}

	cache.Begin()
	root := cache.FilteredTasks("root", dom.Styles{}, todo.NewTasksStream(tasks))
	cache.End()

	fmt.Println(gohtml.Format(fmt.Sprint(root)))

	// TODO: find a better way to work with private state in
	// test tools rather than mucking directly with HTML output
	// set filter = "Active" which should filter out the second task
	html.Click(root.Children()[1].Children()[1])
	fmt.Println(gohtml.Format(fmt.Sprint(root)))

	cache.Begin()
	cache.End()
	leaks := html.GetCurrentResources()
	if n := len(leaks); n > 0 {
		fmt.Println("Leaked", n, "resources\n", leaks)
	}

	// Output:
	// <div style="display: flex; flex-direction: column">
	//   <input placeholder="Add a task" type="text"/>
	//   <div style="display: flex; flex-direction: row">
	//     <div tabindex="0">
	//       <label style="border-radius: 4px; border-color: blue; border-width: 1px">
	//         All
	//       </label>
	//     </div>
	//     <div tabindex="0">
	//       <label style="border-radius: 4px; border-color: lightgrey; border-width: 1px">
	//         Active
	//       </label>
	//     </div>
	//     <div tabindex="0">
	//       <label style="border-radius: 4px; border-color: lightgrey; border-width: 1px">
	//         Done
	//       </label>
	//     </div>
	//   </div>
	//   <div style="display: flex; flex-direction: column">
	//     <div style="display: flex; flex-direction: row">
	//       <input type="checkbox"/>
	//       <input type="text" value="first task"/>
	//     </div>
	//     <div style="display: flex; flex-direction: row">
	//       <input checked="" type="checkbox"/>
	//       <input type="text" value="second task"/>
	//     </div>
	//   </div>
	// </div>
	// <div style="display: flex; flex-direction: column">
	//   <input placeholder="Add a task" type="text"/>
	//   <div style="display: flex; flex-direction: row">
	//     <div tabindex="0">
	//       <label style="border-radius: 4px; border-color: lightgrey; border-width: 1px">
	//         All
	//       </label>
	//     </div>
	//     <div tabindex="0">
	//       <label style="border-radius: 4px; border-color: blue; border-width: 1px">
	//         Active
	//       </label>
	//     </div>
	//     <div tabindex="0">
	//       <label style="border-radius: 4px; border-color: lightgrey; border-width: 1px">
	//         Done
	//       </label>
	//     </div>
	//   </div>
	//   <div style="display: flex; flex-direction: column">
	//     <div style="display: flex; flex-direction: row">
	//       <input type="checkbox"/>
	//       <input type="text" value="first task"/>
	//     </div>
	//   </div>
	// </div>
}

func Example_renderTasks() {
	cache := todo.TasksViewStruct{}

	tasks := todo.Tasks{
		{"one", false, "first task"},
		{"two", true, "second task"},
	}
	s := todo.NewTasksStream(tasks)
	selected := dom.NewFocusTrackerStream(dom.FocusTracker{Current: controls.ShowDone})

	cache.Begin()
	root := cache.TasksView("root", dom.Styles{}, selected, s)
	cache.End()
	fmt.Println(gohtml.Format(fmt.Sprint(root)))

	selected = selected.Append(nil, dom.FocusTracker{Current: controls.ShowActive}, true)
	cache.Begin()
	root = cache.TasksView("root", dom.Styles{Color: "red"}, selected, s)
	cache.End()
	fmt.Println(gohtml.Format(fmt.Sprint(root)))

	selected = selected.Append(nil, dom.FocusTracker{Current: controls.ShowAll}, true)
	cache.Begin()
	root = cache.TasksView("root", dom.Styles{}, selected, s)
	cache.End()
	fmt.Println(gohtml.Format(fmt.Sprint(root)))

	cache.Begin()
	cache.End()
	leaks := html.GetCurrentResources()
	if n := len(leaks); n > 0 {
		fmt.Println("Leaked", n, "resources\n", leaks)
	}

	// Output:
	// <div style="display: flex; flex-direction: column">
	//   <div style="display: flex; flex-direction: row">
	//     <input checked="" type="checkbox"/>
	//     <input type="text" value="second task"/>
	//   </div>
	// </div>
	// <div style="color: red; display: flex; flex-direction: column">
	//   <div style="display: flex; flex-direction: row">
	//     <input type="checkbox"/>
	//     <input type="text" value="first task"/>
	//   </div>
	// </div>
	// <div style="display: flex; flex-direction: column">
	//   <div style="display: flex; flex-direction: row">
	//     <input type="checkbox"/>
	//     <input type="text" value="first task"/>
	//   </div>
	//   <div style="display: flex; flex-direction: row">
	//     <input checked="" type="checkbox"/>
	//     <input type="text" value="second task"/>
	//   </div>
	// </div>
}

func Example_renderTask() {
	task := todo.NewTaskStream(todo.Task{Done: false, Description: "first task"})
	cache := todo.TaskEditStruct{}
	cache.Begin()
	root := cache.TaskEdit("root", task)
	cache.End()
	fmt.Println(gohtml.Format(fmt.Sprint(root)))

	next := task.Value
	next.Done = true
	task = task.Append(nil, next, true)
	cache.Begin()
	root = cache.TaskEdit("root", task)
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
	//   <input type="checkbox"/>
	//   <input type="text" value="first task"/>
	// </div>
	// <div style="display: flex; flex-direction: row">
	//   <input checked="" type="checkbox"/>
	//   <input type="text" value="first task"/>
	// </div>
}
