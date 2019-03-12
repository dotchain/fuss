// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

// Package todo demonstrates a simple todo mvc app built with FUSS
package todo

import (
	"github.com/dotchain/fuss/dom"
	_ "github.com/dotchain/fuss/todo/controls" // requried for codegen
)

// Task represents an item in the TODO list.
type Task struct {
	ID          string
	Done        bool
	Description string
}

// Tasks represents a collection of tasks
type Tasks []Task

// TaskEdit is a control that displays a task as well as allowing it
// to be edited. The current value of the data is available in the
// Task field (which is a stream and so supports On/Off methods).
func taskEdit(c *taskEditCtx, task *TaskStream) dom.Element {
	done := task.DoneSubstream(c.Cache)
	desc := task.DescriptionSubstream(c.Cache)
	return c.dom.Run(
		"root",
		dom.Styles{},
		c.dom.CheckboxEdit("cb", dom.Styles{}, done, ""),
		c.dom.TextEdit("textedit", dom.Styles{}, desc),
	)
}

// TasksView is a control that renders tasks using TaskEdit.
//
// Individual tasks can be modified underneath. The current list of
// tasks is available via Tasks field which supports On/Off to receive
// notifications.
func tasksView(c *tasksViewCtx, styles dom.Styles, showDone *dom.BoolStream, showNotDone *dom.BoolStream, tasks *TasksStream) dom.Element {
	return c.dom.VRun(
		"root",
		styles,
		renderTasks(tasks.Value, func(index int, t Task) dom.Element {
			if t.Done && !showDone.Value || !t.Done && !showNotDone.Value {
				return nil
			}

			return c.TaskEdit(t.ID, tasks.Substream(c.Cache, index))
		})...,
	)
}

func renderTasks(t Tasks, fn func(int, Task) dom.Element) []dom.Element {
	result := make([]dom.Element, len(t))
	for kk, elt := range t {
		result[kk] = fn(kk, elt)
	}
	return result
}

// FilteredTasks is a thin wrapper on top of TasksView with checkboxes for ShowDone and ShowUndone
//
func filteredTasks(c *filteredCtx, styles dom.Styles, tasks *TasksStream, doneState *dom.BoolStream, notDoneState *dom.BoolStream) (*dom.BoolStream, *dom.BoolStream, dom.Element) {
	if doneState == nil {
		doneState = dom.NewBoolStream(true)
	}
	if notDoneState == nil {
		notDoneState = dom.NewBoolStream(true)
	}

	opt := dom.TextEditOptions{
		Placeholder: "Add a task",
		Text:        tasks.addTaskStream(c.Cache),
	}
	return doneState, notDoneState, c.dom.VRun(
		"root",
		styles,
		// note the key below forces the text input control to
		// be recreated whenever the stream changes thereby forcing
		// it to be cleared out. this is because textInput is
		// semi-managed right now.
		c.dom.TextEditO(opt.Text, opt),
		c.controls.Filter("f", doneState, notDoneState),
		c.TasksView("tasks", dom.Styles{}, doneState, notDoneState, tasks),
	)
}

// App hosts the todo MVC app
func app(c *appCtx, tasksState *TasksStream) (*TasksStream, dom.Element) {
	if tasksState == nil {
		// TODO: fetch this from the network
		tasksState = NewTasksStream(Tasks{
			Task{"one", true, "First task"},
			Task{"two", false, "Second task"},
		})
	}
	root := c.controls.Chrome(
		"root",
		c.dom.TextView("h", dom.Styles{}, "FUSS TODO"),
		c.FilteredTasks("root", dom.Styles{}, tasksState),
		c.dom.A(
			"a",
			dom.Styles{},
			"https://github.com/dotchain/fuss",
			c.dom.TextView("tv", dom.Styles{}, "github"),
		),
	)
	return tasksState, root
}
