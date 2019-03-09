// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

// Package todo demonstrates a simple todo mvc app built with FUSS
package todo

import (
	"github.com/dotchain/fuss/core"
	"github.com/dotchain/fuss/dom"
	"time"
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
func taskEdit(c *taskEditCtx, styles dom.Styles, task *TaskStream) dom.Element {
	done := task.DoneSubstream(c.Cache)
	desc := task.DescriptionSubstream(c.Cache)
	return c.dom.Elt(
		"root",
		dom.Props{Tag: "div", Styles: styles},
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

type handlerStream struct {
	*core.Notifier
	dom.EventHandler
}

func (h *handlerStream) Latest() *handlerStream {
	return h
}

func newTaskButton(c *newTaskCtx, styles dom.Styles, tasks *TasksStream, hState *handlerStream) (*handlerStream, dom.Element) {
	if hState == nil {
		hState = &handlerStream{Notifier: &core.Notifier{}}
		hState.Handle = func(dom.Event) {
			tasks = tasks.Latest()
			v := append(Tasks(nil), tasks.Value...)
			// TODO: better ID generation
			v = append(v, Task{ID: time.Now().Format("15:04:05.000")})
			tasks = tasks.Append(nil, v, true)
		}
	}

	label := c.dom.LabelView("root", dom.Styles{}, "Add a task", "")
	return hState, c.dom.Button("root", dom.Styles{}, &hState.EventHandler, label)
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

	doneLabel, notDoneLabel := "Show Completed", "Show Incomplete"
	if doneState.Value {
		doneLabel = "Showing Completed"
	}

	if notDoneState.Value {
		notDoneLabel = "Showing Incomplete"
	}

	return doneState, notDoneState, c.dom.Elt(
		"root",
		dom.Props{Tag: "div", Styles: styles},
		c.dom.CheckboxEdit("done", dom.Styles{}, doneState, "done"),
		c.dom.LabelView("done", dom.Styles{}, doneLabel, "done"),
		c.dom.CheckboxEdit("notDone", dom.Styles{}, notDoneState, "notDone"),
		c.dom.LabelView("notDone", dom.Styles{}, notDoneLabel, "notDone"),
		c.TasksView("tasks", dom.Styles{}, doneState, notDoneState, tasks),
		c.NewTaskButton("new", dom.Styles{}, tasks),
	)
}
