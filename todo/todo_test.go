// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package todo_test

import (
	"fmt"
	"github.com/dotchain/fuss/dom"
	"github.com/dotchain/fuss/dom/html"
	"github.com/dotchain/fuss/todo"
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
	//         <input checked="" id="done" type="checkbox"/>
	//         <label for="done">
	//           Showing Completed
	//         </label>
	//         <input checked="" id="notDone" type="checkbox"/>
	//         <label for="notDone">
	//           Showing Incomplete
	//         </label>
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

	// set "ShowDone" to false which should filter out the second task
	html.SetValue(root.Children()[1].Children()[0], "off")
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
	//     <input checked="" id="done" type="checkbox"/>
	//     <label for="done">
	//       Showing Completed
	//     </label>
	//     <input checked="" id="notDone" type="checkbox"/>
	//     <label for="notDone">
	//       Showing Incomplete
	//     </label>
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
	//     <input id="done" type="checkbox"/>
	//     <label for="done">
	//       Show Completed
	//     </label>
	//     <input checked="" id="notDone" type="checkbox"/>
	//     <label for="notDone">
	//       Showing Incomplete
	//     </label>
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
	showDone, showNotDone := dom.NewBoolStream(true), dom.NewBoolStream(false)
	cache.Begin()
	root := cache.TasksView("root", dom.Styles{}, showDone, showNotDone, s)
	cache.End()
	fmt.Println(gohtml.Format(fmt.Sprint(root)))

	showDone = showDone.Append(nil, false, true)
	cache.Begin()
	root = cache.TasksView("root", dom.Styles{Color: "red"}, showDone, showNotDone, s)
	cache.End()
	fmt.Println(gohtml.Format(fmt.Sprint(root)))

	showDone = showDone.Append(nil, true, true)
	cache.Begin()
	_ = cache.TasksView("root", dom.Styles{}, showDone, showNotDone, s)
	cache.End()
	showNotDone = showNotDone.Append(nil, true, true)
	cache.Begin()
	root = cache.TasksView("root", dom.Styles{}, showDone, showNotDone, s)
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
