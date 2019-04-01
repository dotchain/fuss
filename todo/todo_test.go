// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package todo_test

import (
	"fmt"

	"github.com/dotchain/dot/streams"
	"github.com/dotchain/fuss/dom/html"
	"github.com/dotchain/fuss/todo"
	"github.com/dotchain/fuss/todo/controls"
	"github.com/yosssi/gohtml"
)

func Example_app() {
	app, close := todo.NewApp()

	root := app("root")

	// add a "Third task" via the input control
	html.SetValue(root.Children()[1].Children()[0].Children()[0], "Third task")

	fmt.Println(gohtml.Format(fmt.Sprint(root)))

	close()
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
	//       <input placeholder="Add a todo" type="text"/>
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

func Example_renderListView() {
	todos := todo.TodoList{
		{"one", false, "first task"},
		{"two", true, "second task"},
	}
	stream := &todo.TodoListStream{Stream: streams.New(), Value: todos}

	listView, close := todo.NewListView()
	root := listView("root", stream)

	fmt.Println(gohtml.Format(fmt.Sprint(root)))

	// TODO: find a better way to work with private state in
	// test tools rather than mucking directly with HTML output
	// set filter = "Active" which should filter out the second task
	html.Click(root.Children()[1].Children()[1])
	fmt.Println(gohtml.Format(fmt.Sprint(root)))

	close()
	leaks := html.GetCurrentResources()
	if n := len(leaks); n > 0 {
		fmt.Println("Leaked", n, "resources\n", leaks)
	}

	// Output:
	// <div style="display: flex; flex-direction: column">
	//   <input placeholder="Add a todo" type="text"/>
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
	//   <input placeholder="Add a todo" type="text"/>
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

func Example_renderFilteredList() {
	todos := todo.TodoList{
		{"one", false, "first task"},
		{"two", true, "second task"},
	}
	stream := &todo.TodoListStream{Stream: streams.New(), Value: todos}
	filter := &streams.S16{Stream: streams.New(), Value: controls.ShowDone}

	filteredList, close := todo.NewFilteredList()

	root := filteredList("root", filter, stream)
	fmt.Println(gohtml.Format(fmt.Sprint(root)))

	filter = filter.Update(controls.ShowActive)
	root = filteredList("root", filter, stream)
	fmt.Println(gohtml.Format(fmt.Sprint(root)))

	filter = filter.Update(controls.ShowAll)
	root = filteredList("root", filter, stream)
	fmt.Println(gohtml.Format(fmt.Sprint(root)))

	close()
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
	// <div style="display: flex; flex-direction: column">
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
	item := &todo.TodoStream{Stream: streams.New(), Value: todo.Todo{Description: "first task"}}
	render, close := todo.NewTodo()

	root := render("root", item)
	fmt.Println(gohtml.Format(fmt.Sprint(root)))

	item.Complete().Update(true)
	item = item.Latest()
	root = render("root", item)
	fmt.Println(gohtml.Format(fmt.Sprint(root)))

	close()
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
