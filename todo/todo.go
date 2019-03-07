// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

// Package todo demonstrates a simple todo mvc app built with FUSS
package todo

import "github.com/dotchain/fuss/dom"

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
func taskEdit(c *taskEditCtx, styles dom.Styles, task *TaskStream) dom.Element {
	return c.dom.Elt(
		"root",
		dom.Props{Tag: "div", Styles: styles},
		c.dom.CheckboxEdit("cb", dom.Styles{}, task.DoneSubstream(c.Cache)),
		c.dom.TextEdit("textedit", dom.Styles{}, task.DescriptionSubstream(c.Cache)),
	)
}

// TasksView is a control that renders tasks using TaskEdit.
//
// Individual tasks can be modified underneath. The current list of
// tasks is available via Tasks field which supports On/Off to receive
// notifications.
func tasksView(c *tasksViewCtx, styles dom.Styles, showDone *dom.BoolStream, showNotDone *dom.BoolStream, tasks *TasksStream) dom.Element {
	return c.dom.Elt(
		"root",
		dom.Props{Tag: "div", Styles: styles},
		renderTasks(tasks.Value, func(index int, t Task) dom.Element {
			if t.Done && !showDone.Value || !t.Done && !showNotDone.Value {
				return nil
			}

			return c.TaskEdit(t.ID, dom.Styles{}, tasks.Substream(c.Cache, index))
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

// App is a thin wrapper on top of TasksView with checkboxes for ShowDone and ShowUndone
//
func app(c *appCtx, styles dom.Styles, tasks *TasksStream, doneState *dom.BoolStream, notDoneState *dom.BoolStream) (*dom.BoolStream, *dom.BoolStream, dom.Element) {
	if doneState == nil {
		doneState = dom.NewBoolStream(true)
	}
	if notDoneState == nil {
		notDoneState = dom.NewBoolStream(true)
	}

	return doneState, notDoneState, c.dom.Elt(
		"root",
		dom.Props{Tag: "div", Styles: styles},
		c.dom.CheckboxEdit("done", dom.Styles{}, doneState),
		c.dom.CheckboxEdit("notDone", dom.Styles{}, notDoneState),
		c.TasksView("tasks", dom.Styles{}, doneState, notDoneState, tasks),
	)
}
