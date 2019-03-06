// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.
//

package dom

import (
	"github.com/dotchain/fuss/core"
)

type nodeCtx struct {
	core.Cache

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
	defer c.Cache.End()

	if c.memoized.lastState != nil {
		c.memoized.lastState.Off(&c.stateHandler)
	}
}

// EltStruct is a cache for Elt
// Elt implements a reactive Element control.
//
// Usage:
//
// func myComponent(c *myComponentCtx, ...) controls.Element {
// return c.controls.Elt("root", props, children...)
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
