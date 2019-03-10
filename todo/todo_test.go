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
	html.SetValue(root.Children()[0], "off")
	fmt.Println(gohtml.Format(fmt.Sprint(root)))

	cache.Begin()
	cache.End()
	leaks := html.GetCurrentResources()
	if n := len(leaks); n > 0 {
		fmt.Println("Leaked", n, "resources\n", leaks)
	}

	// Output:
	// <div>
	//   <input checked="" id="done" type="checkbox"/>
	//   <label for="done">
	//     Showing Completed
	//   </label>
	//   <input checked="" id="notDone" type="checkbox"/>
	//   <label for="notDone">
	//     Showing Incomplete
	//   </label>
	//   <div>
	//     <div>
	//       <input type="checkbox"/>
	//       <input type="text" value="first task"/>
	//     </div>
	//     <div>
	//       <input checked="" type="checkbox"/>
	//       <input type="text" value="second task"/>
	//     </div>
	//   </div>
	//   <button>
	//     <label>
	//       Add a task
	//     </label>
	//   </button>
	// </div>
	// <div>
	//   <input id="done" type="checkbox"/>
	//   <label for="done">
	//     Show Completed
	//   </label>
	//   <input checked="" id="notDone" type="checkbox"/>
	//   <label for="notDone">
	//     Showing Incomplete
	//   </label>
	//   <div>
	//     <div>
	//       <input type="checkbox"/>
	//       <input type="text" value="first task"/>
	//     </div>
	//   </div>
	//   <button>
	//     <label>
	//       Add a task
	//     </label>
	//   </button>
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
	// <div>
	//   <div>
	//     <input checked="" type="checkbox"/>
	//     <input type="text" value="second task"/>
	//   </div>
	// </div>
	// <div style="color: red">
	// </div>
	// <div>
	//   <div>
	//     <input type="checkbox"/>
	//     <input type="text" value="first task"/>
	//   </div>
	//   <div>
	//     <input checked="" type="checkbox"/>
	//     <input type="text" value="second task"/>
	//   </div>
	// </div>
}

func Example_renderTask() {
	task := todo.NewTaskStream(todo.Task{Done: false, Description: "first task"})
	cache := todo.TaskEditStruct{}
	cache.Begin()
	root := cache.TaskEdit("root", dom.Styles{Color: "blue"}, task)
	cache.End()
	fmt.Println(gohtml.Format(fmt.Sprint(root)))

	cache.Begin()
	root = cache.TaskEdit("root", dom.Styles{Color: "red"}, task)
	cache.End()
	fmt.Println(gohtml.Format(fmt.Sprint(root)))

	next := task.Value
	next.Done = true
	task = task.Append(nil, next, true)
	cache.Begin()
	root = cache.TaskEdit("root", dom.Styles{Color: "red"}, task)
	cache.End()
	fmt.Println(gohtml.Format(fmt.Sprint(root)))

	cache.Begin()
	cache.End()
	leaks := html.GetCurrentResources()
	if n := len(leaks); n > 0 {
		fmt.Println("Leaked", n, "resources\n", leaks)
	}

	// Output:
	// <div style="color: blue">
	//   <input type="checkbox"/>
	//   <input type="text" value="first task"/>
	// </div>
	// <div style="color: red">
	//   <input type="checkbox"/>
	//   <input type="text" value="first task"/>
	// </div>
	// <div style="color: red">
	//   <input checked="" type="checkbox"/>
	//   <input type="text" value="first task"/>
	// </div>
}
