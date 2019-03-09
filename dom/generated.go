// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.
//

package dom

import (
	"github.com/dotchain/dot/changes"
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

// TextStream is a stream of string values.
type TextStream struct {
	// Notifier provides On/Off/Notify support. New instances of
	// TextStream created via the AppendLocal or AppendRemote
	// share the same Notifier value.
	*core.Notifier

	// Value holds the current value. The latest value may be
	// fetched via the Latest() method.
	Value string

	// Change tracks the change that leads to the next value.
	Change changes.Change

	// Next tracks the next value in the stream.
	Next *TextStream
}

// NewTextStream creates a new string stream
func NewTextStream(value string) *TextStream {
	return &TextStream{&core.Notifier{}, value, nil, nil}
}

// Latest returns the latest value in the stream
func (s *TextStream) Latest() *TextStream {
	for s.Next != nil {
		s = s.Next
	}
	return s
}

// Append appends a local change. isLocal identifies if the caller is
// local or remote. It returns the updated stream whose value matches
// the provided value and whose Latest() converges to the latest of
// the stream.
func (s *TextStream) Append(c changes.Change, value string, isLocal bool) *TextStream {
	if c == nil {
		c = changes.Replace{Before: s.wrapValue(s.Value), After: s.wrapValue(value)}
	}

	// return value: after is correctly set to provided value
	result := &TextStream{Notifier: s.Notifier, Value: value}

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
		after.Next = &TextStream{Notifier: s.Notifier, Value: s.unwrapValue(v)}
		after = after.Next
	}

	// append the residual change (c) to converge to wherever
	// after has landed. Notify since s.Latest() has now changed
	before.Change, before.Next = c, after
	s.Notify()
	return result
}

func (s *TextStream) wrapValue(i interface{}) changes.Value {
	if x, ok := i.(changes.Value); ok {
		return x
	}
	return changes.Atomic{i}
}

func (s *TextStream) unwrapValue(v changes.Value) string {
	if x, ok := v.(interface{}).(string); ok {
		return x
	}
	return v.(changes.Atomic).Value.(string)
}

type buttonCtx struct {
	core.Cache
	finalizer func()

	EltStruct
	initialized  bool
	stateHandler core.Handler

	memoized struct {
		children []Element
		onClick  *EventHandler
		result1  Element
		styles   Styles
	}
}

func (c *buttonCtx) areArgsSame(styles Styles, onClick *EventHandler, children []Element) bool {

	if styles != c.memoized.styles {
		return false
	}

	if onClick != c.memoized.onClick {
		return false
	}

	if len(children) != len(c.memoized.children) {
		return false
	}
	for childrenIdx := range children {
		if children[childrenIdx] != c.memoized.children[childrenIdx] {
			return false
		}
	}
	return true

}

func (c *buttonCtx) refreshIfNeeded(styles Styles, onClick *EventHandler, children []Element) (result1 Element) {
	if !c.initialized || !c.areArgsSame(styles, onClick, children) {
		return c.refresh(styles, onClick, children)
	}
	return c.memoized.result1
}

func (c *buttonCtx) refresh(styles Styles, onClick *EventHandler, children []Element) (result1 Element) {
	c.initialized = true
	c.stateHandler.Handle = func() {
		c.refresh(styles, onClick, children)
	}

	c.memoized.styles, c.memoized.onClick, c.memoized.children = styles, onClick, children

	c.Cache.Begin()
	defer c.Cache.End()

	c.EltStruct.Begin()
	defer c.EltStruct.End()
	c.memoized.result1 = button(c, styles, onClick, children...)

	return c.memoized.result1
}

func (c *buttonCtx) close() {
	c.Cache.Begin()
	c.Cache.End()

	c.EltStruct.Begin()
	c.EltStruct.End()
	if c.finalizer != nil {
		c.finalizer()
	}
}

// ButtonStruct is a cache for Button
// Button implements a button control.
type ButtonStruct struct {
	old, current map[interface{}]*buttonCtx
}

// Begin starts a round
func (c *ButtonStruct) Begin() {
	c.old, c.current = c.current, map[interface{}]*buttonCtx{}
}

// End finishes the round cleaning up any unused components
func (c *ButtonStruct) End() {
	for _, ctx := range c.old {
		ctx.close()
	}
	c.old = nil
}

// Button - see the type for details
func (c *ButtonStruct) Button(cKey interface{}, styles Styles, onClick *EventHandler, children ...Element) (result1 Element) {
	cOld, ok := c.old[cKey]
	if ok {
		delete(c.old, cKey)
	} else {
		cOld = &buttonCtx{}
	}
	c.current[cKey] = cOld
	return cOld.refreshIfNeeded(styles, onClick, children)
}

type cbEditCtx struct {
	core.Cache
	finalizer func()

	EltStruct
	initialized  bool
	stateHandler core.Handler

	memoized struct {
		checked *BoolStream
		id      string
		result1 Element
		styles  Styles
	}
}

func (c *cbEditCtx) areArgsSame(styles Styles, checked *BoolStream, id string) bool {

	if styles != c.memoized.styles {
		return false
	}

	if checked != c.memoized.checked {
		return false
	}

	return id == c.memoized.id

}

func (c *cbEditCtx) refreshIfNeeded(styles Styles, checked *BoolStream, id string) (result1 Element) {
	if !c.initialized || !c.areArgsSame(styles, checked, id) {
		return c.refresh(styles, checked, id)
	}
	return c.memoized.result1
}

func (c *cbEditCtx) refresh(styles Styles, checked *BoolStream, id string) (result1 Element) {
	c.initialized = true
	c.stateHandler.Handle = func() {
		c.refresh(styles, checked, id)
	}

	c.memoized.styles, c.memoized.checked, c.memoized.id = styles, checked, id

	c.Cache.Begin()
	defer c.Cache.End()

	c.EltStruct.Begin()
	defer c.EltStruct.End()
	c.memoized.result1 = checkboxEdit(c, styles, checked, id)

	return c.memoized.result1
}

func (c *cbEditCtx) close() {
	c.Cache.Begin()
	c.Cache.End()

	c.EltStruct.Begin()
	c.EltStruct.End()
	if c.finalizer != nil {
		c.finalizer()
	}
}

// CheckboxEditStruct is a cache for CheckboxEdit
// CheckboxEdit implements a checkbox control.
type CheckboxEditStruct struct {
	old, current map[interface{}]*cbEditCtx
}

// Begin starts a round
func (c *CheckboxEditStruct) Begin() {
	c.old, c.current = c.current, map[interface{}]*cbEditCtx{}
}

// End finishes the round cleaning up any unused components
func (c *CheckboxEditStruct) End() {
	for _, ctx := range c.old {
		ctx.close()
	}
	c.old = nil
}

// CheckboxEdit - see the type for details
func (c *CheckboxEditStruct) CheckboxEdit(cKey interface{}, styles Styles, checked *BoolStream, id string) (result1 Element) {
	cOld, ok := c.old[cKey]
	if ok {
		delete(c.old, cKey)
	} else {
		cOld = &cbEditCtx{}
	}
	c.current[cKey] = cOld
	return cOld.refreshIfNeeded(styles, checked, id)
}

type nodeCtx struct {
	core.Cache
	finalizer func()

	initialized  bool
	stateHandler core.Handler

	memoized struct {
		children  []Element
		lastState *nodeStream
		props     Props
		result1   *nodeStream
		result2   Element
	}
}

func (c *nodeCtx) areArgsSame(props Props, children []Element) bool {

	if props != c.memoized.props {
		return false
	}

	if len(children) != len(c.memoized.children) {
		return false
	}
	for childrenIdx := range children {
		if children[childrenIdx] != c.memoized.children[childrenIdx] {
			return false
		}
	}
	return true

}

func (c *nodeCtx) refreshIfNeeded(props Props, children []Element) (result2 Element) {
	if !c.initialized || !c.areArgsSame(props, children) {
		return c.refresh(props, children)
	}
	return c.memoized.result2
}

func (c *nodeCtx) refresh(props Props, children []Element) (result2 Element) {
	c.initialized = true
	c.stateHandler.Handle = func() {
		c.refresh(props, children)
	}

	if c.memoized.lastState != nil {
		c.memoized.lastState = c.memoized.lastState.Latest()
	}
	c.memoized.props, c.memoized.children = props, children

	c.Cache.Begin()
	defer c.Cache.End()

	c.memoized.result1, c.memoized.result2 = elt(c, c.memoized.lastState, props, children...)

	if c.memoized.lastState != c.memoized.result1 {
		if c.memoized.lastState != nil {
			c.memoized.lastState.Off(&c.stateHandler)
		}
		if c.memoized.result1 != nil {
			c.memoized.result1.On(&c.stateHandler)
		}
		c.memoized.lastState = c.memoized.result1
	}
	return c.memoized.result2
}

func (c *nodeCtx) close() {
	c.Cache.Begin()
	c.Cache.End()

	if c.memoized.result1 != nil {
		c.memoized.result1.Off(&c.stateHandler)
	}
	if c.finalizer != nil {
		c.finalizer()
	}
}

// EltStruct is a cache for Elt
// Elt implements a reactive Element control.
//
// Usage:
//
// func myComponent(c *myComponentCtx, ...) controls.Element {
// return c.dom.Elt("root", props, children...)
// }
type EltStruct struct {
	old, current map[interface{}]*nodeCtx
}

// Begin starts a round
func (c *EltStruct) Begin() {
	c.old, c.current = c.current, map[interface{}]*nodeCtx{}
}

// End finishes the round cleaning up any unused components
func (c *EltStruct) End() {
	for _, ctx := range c.old {
		ctx.close()
	}
	c.old = nil
}

// Elt - see the type for details
func (c *EltStruct) Elt(cKey interface{}, props Props, children ...Element) (result2 Element) {
	cOld, ok := c.old[cKey]
	if ok {
		delete(c.old, cKey)
	} else {
		cOld = &nodeCtx{}
	}
	c.current[cKey] = cOld
	return cOld.refreshIfNeeded(props, children)
}

type labelViewCtx struct {
	core.Cache
	finalizer func()

	EltStruct
	initialized  bool
	stateHandler core.Handler

	memoized struct {
		inputID string
		result1 Element
		styles  Styles
		text    string
	}
}

func (c *labelViewCtx) areArgsSame(styles Styles, text string, inputID string) bool {

	if styles != c.memoized.styles {
		return false
	}

	if text != c.memoized.text {
		return false
	}

	return inputID == c.memoized.inputID

}

func (c *labelViewCtx) refreshIfNeeded(styles Styles, text string, inputID string) (result1 Element) {
	if !c.initialized || !c.areArgsSame(styles, text, inputID) {
		return c.refresh(styles, text, inputID)
	}
	return c.memoized.result1
}

func (c *labelViewCtx) refresh(styles Styles, text string, inputID string) (result1 Element) {
	c.initialized = true
	c.stateHandler.Handle = func() {
		c.refresh(styles, text, inputID)
	}

	c.memoized.styles, c.memoized.text, c.memoized.inputID = styles, text, inputID

	c.Cache.Begin()
	defer c.Cache.End()

	c.EltStruct.Begin()
	defer c.EltStruct.End()
	c.memoized.result1 = labelView(c, styles, text, inputID)

	return c.memoized.result1
}

func (c *labelViewCtx) close() {
	c.Cache.Begin()
	c.Cache.End()

	c.EltStruct.Begin()
	c.EltStruct.End()
	if c.finalizer != nil {
		c.finalizer()
	}
}

// LabelViewStruct is a cache for LabelView
// LabelView implements a label control.
type LabelViewStruct struct {
	old, current map[interface{}]*labelViewCtx
}

// Begin starts a round
func (c *LabelViewStruct) Begin() {
	c.old, c.current = c.current, map[interface{}]*labelViewCtx{}
}

// End finishes the round cleaning up any unused components
func (c *LabelViewStruct) End() {
	for _, ctx := range c.old {
		ctx.close()
	}
	c.old = nil
}

// LabelView - see the type for details
func (c *LabelViewStruct) LabelView(cKey interface{}, styles Styles, text string, inputID string) (result1 Element) {
	cOld, ok := c.old[cKey]
	if ok {
		delete(c.old, cKey)
	} else {
		cOld = &labelViewCtx{}
	}
	c.current[cKey] = cOld
	return cOld.refreshIfNeeded(styles, text, inputID)
}

type textEditCtx struct {
	core.Cache
	finalizer func()

	EltStruct
	initialized  bool
	stateHandler core.Handler

	memoized struct {
		result1 Element
		styles  Styles
		text    *TextStream
	}
}

func (c *textEditCtx) areArgsSame(styles Styles, text *TextStream) bool {

	if styles != c.memoized.styles {
		return false
	}

	return text == c.memoized.text

}

func (c *textEditCtx) refreshIfNeeded(styles Styles, text *TextStream) (result1 Element) {
	if !c.initialized || !c.areArgsSame(styles, text) {
		return c.refresh(styles, text)
	}
	return c.memoized.result1
}

func (c *textEditCtx) refresh(styles Styles, text *TextStream) (result1 Element) {
	c.initialized = true
	c.stateHandler.Handle = func() {
		c.refresh(styles, text)
	}

	c.memoized.styles, c.memoized.text = styles, text

	c.Cache.Begin()
	defer c.Cache.End()

	c.EltStruct.Begin()
	defer c.EltStruct.End()
	c.memoized.result1 = textEdit(c, styles, text)

	return c.memoized.result1
}

func (c *textEditCtx) close() {
	c.Cache.Begin()
	c.Cache.End()

	c.EltStruct.Begin()
	c.EltStruct.End()
	if c.finalizer != nil {
		c.finalizer()
	}
}

// TextEditStruct is a cache for TextEdit
// TextEdit implements a text edit control.
type TextEditStruct struct {
	old, current map[interface{}]*textEditCtx
}

// Begin starts a round
func (c *TextEditStruct) Begin() {
	c.old, c.current = c.current, map[interface{}]*textEditCtx{}
}

// End finishes the round cleaning up any unused components
func (c *TextEditStruct) End() {
	for _, ctx := range c.old {
		ctx.close()
	}
	c.old = nil
}

// TextEdit - see the type for details
func (c *TextEditStruct) TextEdit(cKey interface{}, styles Styles, text *TextStream) (result1 Element) {
	cOld, ok := c.old[cKey]
	if ok {
		delete(c.old, cKey)
	} else {
		cOld = &textEditCtx{}
	}
	c.current[cKey] = cOld
	return cOld.refreshIfNeeded(styles, text)
}
