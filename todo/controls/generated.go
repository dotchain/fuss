// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.
//
// Code generated by /Users/vkvk/dev/go/src/github.com/dotchain/fuss/todo/controls/codegen.go. DO NOT EDIT.

package controls

import (
	"github.com/dotchain/fuss/core"
	"github.com/dotchain/fuss/dom"
)

type chromeCtx struct {
	core.Cache
	finalizer func()

	initialized  bool
	stateHandler core.Handler

	dom struct {
		dom.FixedStruct
		dom.StretchStruct
		dom.VRunStruct
	}
	memoized struct {
		body    dom.Element
		footer  dom.Element
		header  dom.Element
		result1 dom.Element
	}
}

func (c *chromeCtx) areArgsSame(header dom.Element, body dom.Element, footer dom.Element) bool {

	if header != c.memoized.header {
		return false
	}

	if body != c.memoized.body {
		return false
	}

	return footer == c.memoized.footer

}

func (c *chromeCtx) refreshIfNeeded(header dom.Element, body dom.Element, footer dom.Element) (result1 dom.Element) {
	if !c.initialized || !c.areArgsSame(header, body, footer) {
		return c.refresh(header, body, footer)
	}
	return c.memoized.result1
}

func (c *chromeCtx) refresh(header dom.Element, body dom.Element, footer dom.Element) (result1 dom.Element) {
	c.initialized = true
	c.stateHandler.Handle = func() {
		c.refresh(header, body, footer)
	}

	c.memoized.header, c.memoized.body, c.memoized.footer = header, body, footer

	c.Cache.Begin()
	defer c.Cache.End()

	c.dom.FixedStruct.Begin()
	defer c.dom.FixedStruct.End()

	c.dom.StretchStruct.Begin()
	defer c.dom.StretchStruct.End()

	c.dom.VRunStruct.Begin()
	defer c.dom.VRunStruct.End()
	c.memoized.result1 = chrome(c, header, body, footer)

	return c.memoized.result1
}

func (c *chromeCtx) close() {
	c.Cache.Begin()
	c.Cache.End()

	c.dom.FixedStruct.Begin()
	c.dom.FixedStruct.End()

	c.dom.StretchStruct.Begin()
	c.dom.StretchStruct.End()

	c.dom.VRunStruct.Begin()
	c.dom.VRunStruct.End()
	if c.finalizer != nil {
		c.finalizer()
	}
}

// ChromeStruct is a cache for Chrome
// Chrome renders the app chrome
type ChromeStruct struct {
	old, current map[interface{}]*chromeCtx
}

// Begin starts a round
func (c *ChromeStruct) Begin() {
	c.old, c.current = c.current, map[interface{}]*chromeCtx{}
}

// End finishes the round cleaning up any unused components
func (c *ChromeStruct) End() {
	for _, ctx := range c.old {
		ctx.close()
	}
	c.old = nil
}

// Chrome - see the type for details
func (c *ChromeStruct) Chrome(cKey interface{}, header dom.Element, body dom.Element, footer dom.Element) (result1 dom.Element) {
	cOld, ok := c.old[cKey]
	if ok {
		delete(c.old, cKey)
	} else {
		cOld = &chromeCtx{}
	}
	c.current[cKey] = cOld
	return cOld.refreshIfNeeded(header, body, footer)
}

type filterCtx struct {
	core.Cache
	finalizer func()

	FilterOptionStruct
	initialized  bool
	stateHandler core.Handler

	dom struct {
		dom.RunStruct
	}
	memoized struct {
		result1  dom.Element
		selected *dom.TextStream
	}
}

func (c *filterCtx) areArgsSame(selected *dom.TextStream) bool {

	return selected == c.memoized.selected

}

func (c *filterCtx) refreshIfNeeded(selected *dom.TextStream) (result1 dom.Element) {
	if !c.initialized || !c.areArgsSame(selected) {
		return c.refresh(selected)
	}
	return c.memoized.result1
}

func (c *filterCtx) refresh(selected *dom.TextStream) (result1 dom.Element) {
	c.initialized = true
	c.stateHandler.Handle = func() {
		c.refresh(selected)
	}

	c.memoized.selected = selected

	c.Cache.Begin()
	defer c.Cache.End()

	c.FilterOptionStruct.Begin()
	defer c.FilterOptionStruct.End()

	c.dom.RunStruct.Begin()
	defer c.dom.RunStruct.End()
	c.memoized.result1 = filter(c, selected)

	return c.memoized.result1
}

func (c *filterCtx) close() {
	c.Cache.Begin()
	c.Cache.End()

	c.FilterOptionStruct.Begin()
	c.FilterOptionStruct.End()

	c.dom.RunStruct.Begin()
	c.dom.RunStruct.End()
	if c.finalizer != nil {
		c.finalizer()
	}
}

// FilterStruct is a cache for Filter
// Filter renders a row of options for "All", "Active" or "Done"
//
// This is reflected in the selected stream (which is both input and output).
type FilterStruct struct {
	old, current map[interface{}]*filterCtx
}

// Begin starts a round
func (c *FilterStruct) Begin() {
	c.old, c.current = c.current, map[interface{}]*filterCtx{}
}

// End finishes the round cleaning up any unused components
func (c *FilterStruct) End() {
	for _, ctx := range c.old {
		ctx.close()
	}
	c.old = nil
}

// Filter - see the type for details
func (c *FilterStruct) Filter(cKey interface{}, selected *dom.TextStream) (result1 dom.Element) {
	cOld, ok := c.old[cKey]
	if ok {
		delete(c.old, cKey)
	} else {
		cOld = &filterCtx{}
	}
	c.current[cKey] = cOld
	return cOld.refreshIfNeeded(selected)
}

type filterOptionCtx struct {
	core.Cache
	finalizer func()

	initialized  bool
	stateHandler core.Handler

	dom struct {
		dom.FocusableStruct
		dom.LabelViewStruct
	}
	memoized struct {
		key      string
		result1  dom.Element
		selected *dom.TextStream
	}
}

func (c *filterOptionCtx) areArgsSame(selected *dom.TextStream, key string) bool {

	if selected != c.memoized.selected {
		return false
	}

	return key == c.memoized.key

}

func (c *filterOptionCtx) refreshIfNeeded(selected *dom.TextStream, key string) (result1 dom.Element) {
	if !c.initialized || !c.areArgsSame(selected, key) {
		return c.refresh(selected, key)
	}
	return c.memoized.result1
}

func (c *filterOptionCtx) refresh(selected *dom.TextStream, key string) (result1 dom.Element) {
	c.initialized = true
	c.stateHandler.Handle = func() {
		c.refresh(selected, key)
	}

	c.memoized.selected, c.memoized.key = selected, key

	c.Cache.Begin()
	defer c.Cache.End()

	c.dom.FocusableStruct.Begin()
	defer c.dom.FocusableStruct.End()

	c.dom.LabelViewStruct.Begin()
	defer c.dom.LabelViewStruct.End()
	c.memoized.result1 = filterOption(c, selected, key)

	return c.memoized.result1
}

func (c *filterOptionCtx) close() {
	c.Cache.Begin()
	c.Cache.End()

	c.dom.FocusableStruct.Begin()
	c.dom.FocusableStruct.End()

	c.dom.LabelViewStruct.Begin()
	c.dom.LabelViewStruct.End()
	if c.finalizer != nil {
		c.finalizer()
	}
}

// FilterOptionStruct is a cache for FilterOption
// FilterOption renders a filter option as a focusable which when
// clicked will automatically append the provided key to the selected
// stream.
type FilterOptionStruct struct {
	old, current map[interface{}]*filterOptionCtx
}

// Begin starts a round
func (c *FilterOptionStruct) Begin() {
	c.old, c.current = c.current, map[interface{}]*filterOptionCtx{}
}

// End finishes the round cleaning up any unused components
func (c *FilterOptionStruct) End() {
	for _, ctx := range c.old {
		ctx.close()
	}
	c.old = nil
}

// FilterOption - see the type for details
func (c *FilterOptionStruct) FilterOption(cKey interface{}, selected *dom.TextStream, key string) (result1 dom.Element) {
	cOld, ok := c.old[cKey]
	if ok {
		delete(c.old, cKey)
	} else {
		cOld = &filterOptionCtx{}
	}
	c.current[cKey] = cOld
	return cOld.refreshIfNeeded(selected, key)
}

type textResetCtx struct {
	core.Cache
	finalizer func()

	initialized  bool
	stateHandler core.Handler

	dom struct {
		dom.TextEditOStruct
	}
	memoized struct {
		ph      string
		result1 dom.Element
		text    *dom.TextStream
	}
}

func (c *textResetCtx) areArgsSame(text *dom.TextStream, ph string) bool {

	if text != c.memoized.text {
		return false
	}

	return ph == c.memoized.ph

}

func (c *textResetCtx) refreshIfNeeded(text *dom.TextStream, ph string) (result1 dom.Element) {
	if !c.initialized || !c.areArgsSame(text, ph) {
		return c.refresh(text, ph)
	}
	return c.memoized.result1
}

func (c *textResetCtx) refresh(text *dom.TextStream, ph string) (result1 dom.Element) {
	c.initialized = true
	c.stateHandler.Handle = func() {
		c.refresh(text, ph)
	}

	c.memoized.text, c.memoized.ph = text, ph

	c.Cache.Begin()
	defer c.Cache.End()

	c.dom.TextEditOStruct.Begin()
	defer c.dom.TextEditOStruct.End()
	c.memoized.result1 = textReset(c, text, ph)

	return c.memoized.result1
}

func (c *textResetCtx) close() {
	c.Cache.Begin()
	c.Cache.End()

	c.dom.TextEditOStruct.Begin()
	c.dom.TextEditOStruct.End()
	if c.finalizer != nil {
		c.finalizer()
	}
}

// TextResetStruct is a cache for TextReset
// TextReset renders a text input that resets when input is submitted
type TextResetStruct struct {
	old, current map[interface{}]*textResetCtx
}

// Begin starts a round
func (c *TextResetStruct) Begin() {
	c.old, c.current = c.current, map[interface{}]*textResetCtx{}
}

// End finishes the round cleaning up any unused components
func (c *TextResetStruct) End() {
	for _, ctx := range c.old {
		ctx.close()
	}
	c.old = nil
}

// TextReset - see the type for details
func (c *TextResetStruct) TextReset(cKey interface{}, text *dom.TextStream, ph string) (result1 dom.Element) {
	cOld, ok := c.old[cKey]
	if ok {
		delete(c.old, cKey)
	} else {
		cOld = &textResetCtx{}
	}
	c.current[cKey] = cOld
	return cOld.refreshIfNeeded(text, ph)
}
