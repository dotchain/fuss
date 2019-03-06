// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package fussy_test

import (
	"github.com/andreyvit/diff"
	"github.com/dotchain/fuss/fussy"
	"strings"
	"testing"
)

func TestTodoTasks(t *testing.T) {
	info := fussy.Info{
		Package: "task",
		Imports: [][2]string{
			{"hello", "github.com/boo/hello"},
			{"hello2", "github.com/boo/hello2"},
		},
		Streams: []fussy.StreamInfo{
			{
				StreamType: "BoolStream",
				ValueType:  "bool",
			},
			{
				StreamType: "TaskStream",
				ValueType:  "Task",
				Fields: []fussy.FieldInfo{{
					Field:            "Done",
					FieldType:        "bool",
					FieldStreamType:  "BoolStream",
					FieldConstructor: "NewBoolStream",
					FieldSubstream:   "DoneSubstream",
				}},
				EntryStreamType: "",
			},
			{
				StreamType:      "TasksStream",
				ValueType:       "[]Task",
				EntryStreamType: "Task",
			},
		},
		Contexts: []fussy.ContextInfo{
			{
				ContextType:   "taskCtx",
				Function:      "TaskView",
				Subcomponents: []string{"subTasker", "fn.Checkbox", "fn.TextEdit"},
				Params: []fussy.ParamInfo{
					{Name: "ctx", Type: "*taskCtx"},
					{Name: "boo", Type: "bool"},
					{Name: "children", Type: "...int"},
				},
				Results: []fussy.ResultInfo{{Name: "", Type: "int"}},

				Component:         "TaskViewCache",
				ComponentComments: "// TaskViewCache is something",
				Method:            "TaskView",
				MethodComments:    "// TaskView is something",
			},
			{
				ContextType: "taskStateCtx",
				Function:    "TaskViewStateful",
				Params: []fussy.ParamInfo{
					{Name: "ctx", Type: "*taskCtx"},
					{Name: "boo1State", Type: "*BoolStream"},
					{Name: "boo2State", Type: "*BoolStream"},
					{Name: "children", Type: "...int"},
				},
				Results: []fussy.ResultInfo{
					{Name: "", Type: "int"},
					{Name: "", Type: "*BoolStream"},
					{Name: "", Type: "*BoolStream"},
				},

				Component:         "TaskViewCache",
				ComponentComments: "// TaskViewCache is something",
				Method:            "TaskView",
				MethodComments:    "// TaskView is something",
			},
		},
	}
	got := strings.TrimSpace(fussy.Generate(info))
	want := strings.TrimSpace(taskExpected)
	if got != want {
		t.Errorf("Diff:\n%v", diff.LineDiff(want, got))
	}

	// Output:
}

var taskExpected = `
// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.
//

package task

import (
	"github.com/dotchain/dot/changes"
	"github.com/dotchain/dot/refs"
	"github.com/dotchain/dot/ux/fn"
	"github.com/dotchain/fuss/core"
)

// BoolStream is a stream of bool values.
type BoolStream struct {
	// Notifier provides On/Off/Notify support. New instances of
	// BoolStream created via the AppendLocal or AppendRemote
	// share the same Notifier value.
	*core.Notifier

	// Value holds the current value. The latest value may be
	// fetched via the Latest() method.
	Value bool

	// Change tracks the change that leads to the next value.
	Change changes.Change

	// Next tracks the next value in the stream.
	Next *BoolStream
}

// NewBoolStream creates a new bool stream
func NewBoolStream(value bool) *BoolStream {
	return &BoolStream{&core.Notifier{}, value, nil, nil}
}

// Latest returns the latest value in the stream
func (s *BoolStream) Latest() *BoolStream {
	for s.Next != nil {
		s = s.Next
	}
	return s
}

// Append appends a local change. isLocal identifies if the caller is
// local or remote. It returns the updated stream whose value matches
// the provided value and whose Latest() converges to the latest of
// the stream.
func (s *BoolStream) Append(c changes.Change, value bool, isLocal bool) *BoolStream {
	if c == nil {
		c = changes.Replace{Before: s.wrapValue(s.Value), After: s.wrapValue(value)}
	}

	// return value: after is correctly set to provided value
	result := &BoolStream{Notifier: s.Notifier, Value: value}

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
		after.Next = &BoolStream{Notifier: s.Notifier, Value: s.unwrapValue(v)}
		after = after.Next
	}

	// append the residual change (c) to converge to wherever
	// after has landed. Notify since s.Latest() has now changed
	before.Change, before.Next = c, after
	s.Notify()
	return result
}

func (s *BoolStream) wrapValue(i interface{}) changes.Value {
	if x, ok := i.(changes.Value); ok {
		return x
	}
	return changes.Atomic{i}
}

func (s *BoolStream) unwrapValue(v changes.Value) bool {
	if x, ok := v.(interface{}).(bool); ok {
		return x
	}
	return v.(changes.Atomic).Value.(bool)
}

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
func (s *TaskStream) DoneSubstream(cache core.Cache) (field *BoolStream) {
	n := s.Notifier
	handler := &core.Handler{nil}
	if f, h, ok := cache.GetSubstream(n, "Done"); ok {
		field, handler = f.(*BoolStream), h
	} else {
		field = NewBoolStream(s.Value.Done)
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

// TasksStream is a stream of []Task values.
type TasksStream struct {
	// Notifier provides On/Off/Notify support. New instances of
	// TasksStream created via the AppendLocal or AppendRemote
	// share the same Notifier value.
	*core.Notifier

	// Value holds the current value. The latest value may be
	// fetched via the Latest() method.
	Value []Task

	// Change tracks the change that leads to the next value.
	Change changes.Change

	// Next tracks the next value in the stream.
	Next *TasksStream
}

// NewTasksStream creates a new []Task stream
func NewTasksStream(value []Task) *TasksStream {
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
func (s *TasksStream) Append(c changes.Change, value []Task, isLocal bool) *TasksStream {
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

func (s *TasksStream) unwrapValue(v changes.Value) []Task {
	if x, ok := v.(interface{}).([]Task); ok {
		return x
	}
	return v.(changes.Atomic).Value.([]Task)
}

// Substream returns a stream for the specified index that is
// automatically connected to the current TasksStream instance.  Updates to
// one automatically update the other.
func (s *TasksStream) Substream(cache core.Cache, index int) (entry *Task) {
	n := s.Notifier
	handler := &core.Handler{nil}
	if f, h, ok := cache.GetSubstream(n, index); ok {
		entry, handler = f.(*Task), h
	} else {
		entry = NewTask(s.Value[index])
		parent, merging, path := s, false, []interface{}{index}
		handler.Handle = func() {
			if merging {
				return
			}

			merging = true
			for ; entry.Next != nil; entry = entry.Next {
				v := append([]Task(nil), parent.Value...)
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

type taskCtx struct {
	core.Cache

	initialized  bool
	stateHandler core.Handler
	subTasker

	fn struct {
		fn.Checkbox
		fn.TextEdit
	}
	memoized struct {
		boo      bool
		children []int
		result1  int
	}
}

func (ctx *taskCtx) areArgsSame(boo bool, children []int) bool {

	if boo != ctx.memoized.boo {
		return false
	}

	if len(children) != len(ctx.memoized.children) {
		return false
	}
	for childrenIdx := range children {
		if children[childrenIdx] != ctx.memoized.children[childrenIdx] {
			return false
		}
	}
	return true

}

func (ctx *taskCtx) refreshIfNeeded(boo bool, children []int) (result1 int) {
	if !ctx.initialized || !ctx.areArgsSame(boo, children) {
		return ctx.refresh(boo, children)
	}
	return ctx.memoized.result1
}

func (ctx *taskCtx) refresh(boo bool, children []int) (result1 int) {
	ctx.initialized = true
	ctx.stateHandler.Handle = func() {
		ctx.refresh(boo, children)
	}

	ctx.memoized.boo, ctx.memoized.children = boo, children

	ctx.Cache.Begin()
	defer ctx.Cache.End()

	ctx.subTasker.Begin()
	defer ctx.subTasker.End()

	ctx.fn.Checkbox.Begin()
	defer ctx.fn.Checkbox.End()

	ctx.fn.TextEdit.Begin()
	defer ctx.fn.TextEdit.End()
	ctx.memoized.result1 = TaskView(ctx, boo, children...)

	return ctx.memoized.result1
}

func (ctx *taskCtx) close() {
	ctx.Cache.Begin()
	defer ctx.Cache.End()

	ctx.subTasker.Begin()
	defer ctx.subTasker.End()

	ctx.fn.Checkbox.Begin()
	defer ctx.fn.Checkbox.End()

	ctx.fn.TextEdit.Begin()
	defer ctx.fn.TextEdit.End()
}

// TaskViewCache is something
type TaskViewCache struct {
	old, current map[interface{}]*taskCtx
}

// Begin starts a round
func (c *TaskViewCache) Begin() {
	c.old, c.current = c.current, map[interface{}]*taskCtx{}
}

// End finishes the round cleaning up any unused components
func (c *TaskViewCache) End() {
	for _, ctx := range c.old {
		ctx.close()
	}
	c.old = nil
}

// TaskView is something
func (c *TaskViewCache) TaskView(ctxKey interface{}, boo bool, children ...int) (result1 int) {
	ctxOld, ok := c.old[ctxKey]
	if ok {
		delete(c.old, ctxKey)
	} else {
		ctxOld = &taskCtx{}
	}
	c.current[ctxKey] = ctxOld
	return ctxOld.refreshIfNeeded(boo, children)
}

type taskStateCtx struct {
	core.Cache

	initialized  bool
	stateHandler core.Handler

	memoized struct {
		boo1State *BoolStream
		boo2State *BoolStream
		children  []int
		result1   int
		result2   *BoolStream
		result3   *BoolStream
	}
}

func (ctx *taskCtx) areArgsSame(children []int) bool {

	if len(children) != len(ctx.memoized.children) {
		return false
	}
	for childrenIdx := range children {
		if children[childrenIdx] != ctx.memoized.children[childrenIdx] {
			return false
		}
	}
	return true

}

func (ctx *taskCtx) refreshIfNeeded(children []int) (result1 int) {
	if !ctx.initialized || !ctx.areArgsSame(children) {
		return ctx.refresh(children)
	}
	return ctx.memoized.result1
}

func (ctx *taskCtx) refresh(children []int) (result1 int) {
	ctx.initialized = true
	ctx.stateHandler.Handle = func() {
		ctx.refresh(children)
	}

	if ctx.memoized.boo1State != nil {
		ctx.memoized.boo1State = ctx.memoized.boo1State.Latest()
	}
	if ctx.memoized.boo2State != nil {
		ctx.memoized.boo2State = ctx.memoized.boo2State.Latest()
	}
	ctx.memoized.children = children

	ctx.Cache.Begin()
	defer ctx.Cache.End()

	ctx.memoized.result1, ctx.memoized.result2, ctx.memoized.result3 = TaskViewStateful(ctx, ctx.memoized.boo1State, ctx.memoized.boo2State, children...)

	if ctx.memoized.boo1State != ctx.memoized.result2 {
		if ctx.memoized.boo1State != nil {
			ctx.memoized.boo1State.Off(&ctx.stateHandler)
		}
		if ctx.memoized.result2 != nil {
			ctx.memoized.result2.On(&ctx.stateHandler)
		}
		ctx.memoized.boo1State = ctx.memoized.result2
	}
	if ctx.memoized.boo2State != ctx.memoized.result3 {
		if ctx.memoized.boo2State != nil {
			ctx.memoized.boo2State.Off(&ctx.stateHandler)
		}
		if ctx.memoized.result3 != nil {
			ctx.memoized.result3.On(&ctx.stateHandler)
		}
		ctx.memoized.boo2State = ctx.memoized.result3
	}
	return ctx.memoized.result1
}

func (ctx *taskCtx) close() {
	ctx.Cache.Begin()
	defer ctx.Cache.End()

	if ctx.memoized.boo1State != nil {
		ctx.memoized.boo1State.Off(&ctx.stateHandler)
	}
	if ctx.memoized.boo2State != nil {
		ctx.memoized.boo2State.Off(&ctx.stateHandler)
	}
}

// TaskViewCache is something
type TaskViewCache struct {
	old, current map[interface{}]*taskCtx
}

// Begin starts a round
func (c *TaskViewCache) Begin() {
	c.old, c.current = c.current, map[interface{}]*taskCtx{}
}

// End finishes the round cleaning up any unused components
func (c *TaskViewCache) End() {
	for _, ctx := range c.old {
		ctx.close()
	}
	c.old = nil
}

// TaskView is something
func (c *TaskViewCache) TaskView(ctxKey interface{}, children ...int) (result1 int) {
	ctxOld, ok := c.old[ctxKey]
	if ok {
		delete(c.old, ctxKey)
	} else {
		ctxOld = &taskStateCtx{}
	}
	c.current[ctxKey] = ctxOld
	return ctxOld.refreshIfNeeded(children)
}

`
