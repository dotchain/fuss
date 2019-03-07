// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.
//

package todo

import (
	"github.com/dotchain/dot/changes"
	"github.com/dotchain/dot/refs"
	"github.com/dotchain/fuss/core"
	"github.com/dotchain/fuss/dom"
)

// TaskStream is a stream of Task values.
type TaskStream struct {
	// Notifier provides On/Off/Notify support. New instances of
	// TaskStream created via the AppendLocal or AppendRemote
	// share the same Notifier value.
	*core.Notifier

	// Value holds the current value. The latest value may be
	// fetched via the Latest() method.
	Value Task

	// Change tracks the change that leads to the next value.
	Change changes.Change

	// Next tracks the next value in the stream.
	Next *TaskStream
}

// NewTaskStream creates a new Task stream
func NewTaskStream(value Task) *TaskStream {
	return &TaskStream{&core.Notifier{}, value, nil, nil}
}

// Latest returns the latest value in the stream
func (s *TaskStream) Latest() *TaskStream {
	for s.Next != nil {
		s = s.Next
	}
	return s
}

// Append appends a local change. isLocal identifies if the caller is
// local or remote. It returns the updated stream whose value matches
// the provided value and whose Latest() converges to the latest of
// the stream.
func (s *TaskStream) Append(c changes.Change, value Task, isLocal bool) *TaskStream {
	if c == nil {
		c = changes.Replace{Before: s.wrapValue(s.Value), After: s.wrapValue(value)}
	}

	// return value: after is correctly set to provided value
	result := &TaskStream{Notifier: s.Notifier, Value: value}

	// before tracks s, after tracks result, v tracks latest value
	// of after chain
	before := s
	var v changes.Value = changes.Atomic{value}

	// walk the chain of Next and find corresponding values to
	// add to after so that both s annd after converge
	after := result
	for ; before.Next != nil; before = before.Next {
		var afterChange changes.Change

		if isLocal {
			c, afterChange = before.Change.Merge(c)
		} else {
			afterChange, c = c.Merge(before.Change)
		}

		if c == nil {
			// the convergence point is before.Next
			after.Change, after.Next = afterChange, before.Next
			return result
		}

		if afterChange == nil {
			continue
		}

		// append this to after and continue with that
		v = v.Apply(nil, afterChange)
		after.Change = afterChange
		after.Next = &TaskStream{Notifier: s.Notifier, Value: s.unwrapValue(v)}
		after = after.Next
	}

	// append the residual change (c) to converge to wherever
	// after has landed. Notify since s.Latest() has now changed
	before.Change, before.Next = c, after
	s.Notify()
	return result
}

func (s *TaskStream) wrapValue(i interface{}) changes.Value {
	if x, ok := i.(changes.Value); ok {
		return x
	}
	return changes.Atomic{i}
}

func (s *TaskStream) unwrapValue(v changes.Value) Task {
	if x, ok := v.(interface{}).(Task); ok {
		return x
	}
	return v.(changes.Atomic).Value.(Task)
}

// SetDone updates the field with a new value
func (s *TaskStream) SetDone(v bool) *TaskStream {
	c := changes.Replace{s.wrapValue(s.Value.Done), s.wrapValue(v)}
	value := s.Value
	value.Done = v
	key := []interface{}{"Done"}
	return s.Append(changes.PathChange{key, c}, value, true)
}

// DoneSubstream returns a stream for Done that is automatically
// connected to the current TaskStream instance.  Updates to one
// automatically update the other.
func (s *TaskStream) DoneSubstream(cache core.Cache) (field *dom.BoolStream) {
	n := s.Notifier
	handler := &core.Handler{nil}
	if f, h, ok := cache.GetSubstream(n, "Done"); ok {
		field, handler = f.(*dom.BoolStream), h
	} else {
		field = dom.NewBoolStream(s.Value.Done)
		parent, merging, path := s, false, []interface{}{"Done"}
		handler.Handle = func() {
			if merging {
				return
			}

			merging = true
			for ; field.Next != nil; field = field.Next {
				v := parent.Value
				v.Done = field.Next.Value
				c := changes.PathChange{path, field.Change}
				parent = parent.Append(c, v, true)
			}

			for ; parent.Next != nil; parent = parent.Next {
				result := refs.Merge(path, parent.Change)
				if result == nil {
					field = field.Append(nil, parent.Next.Value.Done, true)
				} else {
					field = field.Append(result.Affected, parent.Next.Value.Done, true)
				}
			}
			merging = false
		}
		field.On(handler)
		parent.On(handler)
	}

	handler.Handle()
	field = field.Latest()
	n2 := field.Notifier
	close := func() { n.Off(handler); n2.Off(handler) }
	cache.SetSubstream(n, "Done", field, handler, close)
	return field
}

// SetDescription updates the field with a new value
func (s *TaskStream) SetDescription(v string) *TaskStream {
	c := changes.Replace{s.wrapValue(s.Value.Description), s.wrapValue(v)}
	value := s.Value
	value.Description = v
	key := []interface{}{"Description"}
	return s.Append(changes.PathChange{key, c}, value, true)
}

// DescriptionSubstream returns a stream for Description that is automatically
// connected to the current TaskStream instance.  Updates to one
// automatically update the other.
func (s *TaskStream) DescriptionSubstream(cache core.Cache) (field *dom.TextStream) {
	n := s.Notifier
	handler := &core.Handler{nil}
	if f, h, ok := cache.GetSubstream(n, "Description"); ok {
		field, handler = f.(*dom.TextStream), h
	} else {
		field = dom.NewTextStream(s.Value.Description)
		parent, merging, path := s, false, []interface{}{"Description"}
		handler.Handle = func() {
			if merging {
				return
			}

			merging = true
			for ; field.Next != nil; field = field.Next {
				v := parent.Value
				v.Description = field.Next.Value
				c := changes.PathChange{path, field.Change}
				parent = parent.Append(c, v, true)
			}

			for ; parent.Next != nil; parent = parent.Next {
				result := refs.Merge(path, parent.Change)
				if result == nil {
					field = field.Append(nil, parent.Next.Value.Description, true)
				} else {
					field = field.Append(result.Affected, parent.Next.Value.Description, true)
				}
			}
			merging = false
		}
		field.On(handler)
		parent.On(handler)
	}

	handler.Handle()
	field = field.Latest()
	n2 := field.Notifier
	close := func() { n.Off(handler); n2.Off(handler) }
	cache.SetSubstream(n, "Description", field, handler, close)
	return field
}

// TasksStream is a stream of Tasks values.
type TasksStream struct {
	// Notifier provides On/Off/Notify support. New instances of
	// TasksStream created via the AppendLocal or AppendRemote
	// share the same Notifier value.
	*core.Notifier

	// Value holds the current value. The latest value may be
	// fetched via the Latest() method.
	Value Tasks

	// Change tracks the change that leads to the next value.
	Change changes.Change

	// Next tracks the next value in the stream.
	Next *TasksStream
}

// NewTasksStream creates a new Tasks stream
func NewTasksStream(value Tasks) *TasksStream {
	return &TasksStream{&core.Notifier{}, value, nil, nil}
}

// Latest returns the latest value in the stream
func (s *TasksStream) Latest() *TasksStream {
	for s.Next != nil {
		s = s.Next
	}
	return s
}

// Append appends a local change. isLocal identifies if the caller is
// local or remote. It returns the updated stream whose value matches
// the provided value and whose Latest() converges to the latest of
// the stream.
func (s *TasksStream) Append(c changes.Change, value Tasks, isLocal bool) *TasksStream {
	if c == nil {
		c = changes.Replace{Before: s.wrapValue(s.Value), After: s.wrapValue(value)}
	}

	// return value: after is correctly set to provided value
	result := &TasksStream{Notifier: s.Notifier, Value: value}

	// before tracks s, after tracks result, v tracks latest value
	// of after chain
	before := s
	var v changes.Value = changes.Atomic{value}

	// walk the chain of Next and find corresponding values to
	// add to after so that both s annd after converge
	after := result
	for ; before.Next != nil; before = before.Next {
		var afterChange changes.Change

		if isLocal {
			c, afterChange = before.Change.Merge(c)
		} else {
			afterChange, c = c.Merge(before.Change)
		}

		if c == nil {
			// the convergence point is before.Next
			after.Change, after.Next = afterChange, before.Next
			return result
		}

		if afterChange == nil {
			continue
		}

		// append this to after and continue with that
		v = v.Apply(nil, afterChange)
		after.Change = afterChange
		after.Next = &TasksStream{Notifier: s.Notifier, Value: s.unwrapValue(v)}
		after = after.Next
	}

	// append the residual change (c) to converge to wherever
	// after has landed. Notify since s.Latest() has now changed
	before.Change, before.Next = c, after
	s.Notify()
	return result
}

func (s *TasksStream) wrapValue(i interface{}) changes.Value {
	if x, ok := i.(changes.Value); ok {
		return x
	}
	return changes.Atomic{i}
}

func (s *TasksStream) unwrapValue(v changes.Value) Tasks {
	if x, ok := v.(interface{}).(Tasks); ok {
		return x
	}
	return v.(changes.Atomic).Value.(Tasks)
}

// Substream returns a stream for the specified index that is
// automatically connected to the current TasksStream instance.  Updates to
// one automatically update the other.
func (s *TasksStream) Substream(cache core.Cache, index int) (entry *TaskStream) {
	n := s.Notifier
	handler := &core.Handler{nil}
	if f, h, ok := cache.GetSubstream(n, index); ok {
		entry, handler = f.(*TaskStream), h
	} else {
		entry = NewTaskStream(s.Value[index])
		parent, merging, path := s, false, []interface{}{index}
		handler.Handle = func() {
			if merging {
				return
			}

			merging = true
			for ; entry.Next != nil; entry = entry.Next {
				v := append(Tasks(nil), parent.Value...)
				v[index] = entry.Next.Value
				c := changes.PathChange{path, entry.Change}
				parent = parent.Append(c, v, true)
			}

			for ; parent.Next != nil; parent = parent.Next {
				result := refs.Merge(path, parent.Change)
				var c changes.Change
				if result != nil {
					index = result.P[0].(int)
					// TODO: if the index changed fix up
					// the key in the cache
					c = result.Affected
				}
				entry = entry.Append(c, parent.Next.Value[index], true)
			}
			merging = false
		}
		entry.On(handler)
		parent.On(handler)
	}

	handler.Handle()
	entry = entry.Latest()
	n2 := entry.Notifier
	close := func() { n.Off(handler); n2.Off(handler) }
	cache.SetSubstream(n, index, entry, handler, close)
	return entry
}

type appCtx struct {
	core.Cache

	TasksViewStruct
	initialized  bool
	stateHandler core.Handler

	dom struct {
		dom.CheckboxEditStruct
		dom.EltStruct
	}
	memoized struct {
		doneState    *dom.BoolStream
		notDoneState *dom.BoolStream
		result1      *dom.BoolStream
		result2      *dom.BoolStream
		result3      dom.Element
		styles       dom.Styles
		tasks        *TasksStream
	}
}

func (c *appCtx) areArgsSame(styles dom.Styles, tasks *TasksStream) bool {

	if styles != c.memoized.styles {
		return false
	}

	return tasks == c.memoized.tasks

}

func (c *appCtx) refreshIfNeeded(styles dom.Styles, tasks *TasksStream) (result3 dom.Element) {
	if !c.initialized || !c.areArgsSame(styles, tasks) {
		return c.refresh(styles, tasks)
	}
	return c.memoized.result3
}

func (c *appCtx) refresh(styles dom.Styles, tasks *TasksStream) (result3 dom.Element) {
	c.initialized = true
	c.stateHandler.Handle = func() {
		c.refresh(styles, tasks)
	}

	if c.memoized.doneState != nil {
		c.memoized.doneState = c.memoized.doneState.Latest()
	}
	if c.memoized.notDoneState != nil {
		c.memoized.notDoneState = c.memoized.notDoneState.Latest()
	}
	c.memoized.styles, c.memoized.tasks = styles, tasks

	c.Cache.Begin()
	defer c.Cache.End()

	c.TasksViewStruct.Begin()
	defer c.TasksViewStruct.End()

	c.dom.CheckboxEditStruct.Begin()
	defer c.dom.CheckboxEditStruct.End()

	c.dom.EltStruct.Begin()
	defer c.dom.EltStruct.End()
	c.memoized.result1, c.memoized.result2, c.memoized.result3 = app(c, styles, tasks, c.memoized.doneState, c.memoized.notDoneState)

	if c.memoized.doneState != c.memoized.result1 {
		if c.memoized.doneState != nil {
			c.memoized.doneState.Off(&c.stateHandler)
		}
		if c.memoized.result1 != nil {
			c.memoized.result1.On(&c.stateHandler)
		}
		c.memoized.doneState = c.memoized.result1
	}
	if c.memoized.notDoneState != c.memoized.result2 {
		if c.memoized.notDoneState != nil {
			c.memoized.notDoneState.Off(&c.stateHandler)
		}
		if c.memoized.result2 != nil {
			c.memoized.result2.On(&c.stateHandler)
		}
		c.memoized.notDoneState = c.memoized.result2
	}
	return c.memoized.result3
}

func (c *appCtx) close() {
	c.Cache.Begin()
	defer c.Cache.End()

	c.TasksViewStruct.Begin()
	defer c.TasksViewStruct.End()

	c.dom.CheckboxEditStruct.Begin()
	defer c.dom.CheckboxEditStruct.End()

	c.dom.EltStruct.Begin()
	defer c.dom.EltStruct.End()
	if c.memoized.doneState != nil {
		c.memoized.doneState.Off(&c.stateHandler)
	}
	if c.memoized.notDoneState != nil {
		c.memoized.notDoneState.Off(&c.stateHandler)
	}
}

// AppStruct is a cache for App
// App is a thin wrapper on top of TasksView with checkboxes for ShowDone and ShowUndone
//
type AppStruct struct {
	old, current map[interface{}]*appCtx
}

// Begin starts a round
func (c *AppStruct) Begin() {
	c.old, c.current = c.current, map[interface{}]*appCtx{}
}

// End finishes the round cleaning up any unused components
func (c *AppStruct) End() {
	for _, ctx := range c.old {
		ctx.close()
	}
	c.old = nil
}

// App - see the type for details
func (c *AppStruct) App(cKey interface{}, styles dom.Styles, tasks *TasksStream) (result3 dom.Element) {
	cOld, ok := c.old[cKey]
	if ok {
		delete(c.old, cKey)
	} else {
		cOld = &appCtx{}
	}
	c.current[cKey] = cOld
	return cOld.refreshIfNeeded(styles, tasks)
}

type taskEditCtx struct {
	core.Cache

	initialized  bool
	stateHandler core.Handler

	dom struct {
		dom.CheckboxEditStruct
		dom.EltStruct
		dom.TextEditStruct
	}
	memoized struct {
		result1 dom.Element
		styles  dom.Styles
		task    *TaskStream
	}
}

func (c *taskEditCtx) areArgsSame(styles dom.Styles, task *TaskStream) bool {

	if styles != c.memoized.styles {
		return false
	}

	return task == c.memoized.task

}

func (c *taskEditCtx) refreshIfNeeded(styles dom.Styles, task *TaskStream) (result1 dom.Element) {
	if !c.initialized || !c.areArgsSame(styles, task) {
		return c.refresh(styles, task)
	}
	return c.memoized.result1
}

func (c *taskEditCtx) refresh(styles dom.Styles, task *TaskStream) (result1 dom.Element) {
	c.initialized = true
	c.stateHandler.Handle = func() {
		c.refresh(styles, task)
	}

	c.memoized.styles, c.memoized.task = styles, task

	c.Cache.Begin()
	defer c.Cache.End()

	c.dom.CheckboxEditStruct.Begin()
	defer c.dom.CheckboxEditStruct.End()

	c.dom.EltStruct.Begin()
	defer c.dom.EltStruct.End()

	c.dom.TextEditStruct.Begin()
	defer c.dom.TextEditStruct.End()
	c.memoized.result1 = taskEdit(c, styles, task)

	return c.memoized.result1
}

func (c *taskEditCtx) close() {
	c.Cache.Begin()
	defer c.Cache.End()

	c.dom.CheckboxEditStruct.Begin()
	defer c.dom.CheckboxEditStruct.End()

	c.dom.EltStruct.Begin()
	defer c.dom.EltStruct.End()

	c.dom.TextEditStruct.Begin()
	defer c.dom.TextEditStruct.End()
}

// TaskEditStruct is a cache for TaskEdit
// TaskEdit is a control that displays a task as well as allowing it
// to be edited. The current value of the data is available in the
// Task field (which is a stream and so supports On/Off methods).
type TaskEditStruct struct {
	old, current map[interface{}]*taskEditCtx
}

// Begin starts a round
func (c *TaskEditStruct) Begin() {
	c.old, c.current = c.current, map[interface{}]*taskEditCtx{}
}

// End finishes the round cleaning up any unused components
func (c *TaskEditStruct) End() {
	for _, ctx := range c.old {
		ctx.close()
	}
	c.old = nil
}

// TaskEdit - see the type for details
func (c *TaskEditStruct) TaskEdit(cKey interface{}, styles dom.Styles, task *TaskStream) (result1 dom.Element) {
	cOld, ok := c.old[cKey]
	if ok {
		delete(c.old, cKey)
	} else {
		cOld = &taskEditCtx{}
	}
	c.current[cKey] = cOld
	return cOld.refreshIfNeeded(styles, task)
}

type tasksViewCtx struct {
	core.Cache

	TaskEditStruct
	initialized  bool
	stateHandler core.Handler

	dom struct {
		dom.EltStruct
	}
	memoized struct {
		result1     dom.Element
		showDone    *dom.BoolStream
		showNotDone *dom.BoolStream
		styles      dom.Styles
		tasks       *TasksStream
	}
}

func (c *tasksViewCtx) areArgsSame(styles dom.Styles, showDone *dom.BoolStream, showNotDone *dom.BoolStream, tasks *TasksStream) bool {

	if styles != c.memoized.styles {
		return false
	}

	if showDone != c.memoized.showDone {
		return false
	}

	if showNotDone != c.memoized.showNotDone {
		return false
	}

	return tasks == c.memoized.tasks

}

func (c *tasksViewCtx) refreshIfNeeded(styles dom.Styles, showDone *dom.BoolStream, showNotDone *dom.BoolStream, tasks *TasksStream) (result1 dom.Element) {
	if !c.initialized || !c.areArgsSame(styles, showDone, showNotDone, tasks) {
		return c.refresh(styles, showDone, showNotDone, tasks)
	}
	return c.memoized.result1
}

func (c *tasksViewCtx) refresh(styles dom.Styles, showDone *dom.BoolStream, showNotDone *dom.BoolStream, tasks *TasksStream) (result1 dom.Element) {
	c.initialized = true
	c.stateHandler.Handle = func() {
		c.refresh(styles, showDone, showNotDone, tasks)
	}

	c.memoized.styles, c.memoized.showDone, c.memoized.showNotDone, c.memoized.tasks = styles, showDone, showNotDone, tasks

	c.Cache.Begin()
	defer c.Cache.End()

	c.TaskEditStruct.Begin()
	defer c.TaskEditStruct.End()

	c.dom.EltStruct.Begin()
	defer c.dom.EltStruct.End()
	c.memoized.result1 = tasksView(c, styles, showDone, showNotDone, tasks)

	return c.memoized.result1
}

func (c *tasksViewCtx) close() {
	c.Cache.Begin()
	defer c.Cache.End()

	c.TaskEditStruct.Begin()
	defer c.TaskEditStruct.End()

	c.dom.EltStruct.Begin()
	defer c.dom.EltStruct.End()
}

// TasksViewStruct is a cache for TasksView
// TasksView is a control that renders tasks using TaskEdit.
//
// Individual tasks can be modified underneath. The current list of
// tasks is available via Tasks field which supports On/Off to receive
// notifications.
type TasksViewStruct struct {
	old, current map[interface{}]*tasksViewCtx
}

// Begin starts a round
func (c *TasksViewStruct) Begin() {
	c.old, c.current = c.current, map[interface{}]*tasksViewCtx{}
}

// End finishes the round cleaning up any unused components
func (c *TasksViewStruct) End() {
	for _, ctx := range c.old {
		ctx.close()
	}
	c.old = nil
}

// TasksView - see the type for details
func (c *TasksViewStruct) TasksView(cKey interface{}, styles dom.Styles, showDone *dom.BoolStream, showNotDone *dom.BoolStream, tasks *TasksStream) (result1 dom.Element) {
	cOld, ok := c.old[cKey]
	if ok {
		delete(c.old, cKey)
	} else {
		cOld = &tasksViewCtx{}
	}
	c.current[cKey] = cOld
	return cOld.refreshIfNeeded(styles, showDone, showNotDone, tasks)
}
