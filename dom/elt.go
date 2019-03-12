// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package dom

import "github.com/dotchain/fuss/core"

// nodeStream does not implement the full Stream interface
// because only a minimal version is actually used.
type nodeStream struct {
	*core.Notifier
	node
}

func (n *nodeStream) Latest() *nodeStream {
	return n
}

// Elt implements a reactive Element control.
//
// Usage:
//
//     func myComponent(c *myComponentCtx, ...) controls.Element {
//          return c.dom.Elt("root", props, children...)
//     }
func elt(c *nodeCtx, lastState *nodeStream, props Props, children ...Element) (*nodeStream, Element) {
	if lastState == nil {
		lastState = &nodeStream{Notifier: &core.Notifier{}}
	}
	elt := lastState.reconcile(props, children)

	c.finalizer = elt.Close
	return lastState, elt
}

type node struct {
	root  Element
	props Props
}

func (e *node) reconcile(props Props, children []Element) Element {
	children = e.filterNil(children)
	if len(children) > 0 {
		props.TextContent = ""
	}

	if e.root == nil {
		e.root = NewElement(props, children...)
		e.props = props
		return e.root
	}

	if e.props != props {
		before, after := e.props.ToMap(), props.ToMap()
		e.props = props
		for k, v := range after {
			if before[k] != v {
				e.root.SetProp(k, v)
			}
		}
	}

	before := e.root.Children()
	eq := func(i, j int) bool {
		return before[i] == children[j]
	}
	insert := func(i, j int) {
		e.root.InsertChild(i, children[j])
	}
	remove := e.root.RemoveChild
	core.Diff(len(before), len(children), eq, insert, remove)
	return e.root
}

func (e *node) filterNil(children []Element) []Element {
	result := children[:0]
	for _, elt := range children {
		if elt != nil {
			result = append(result, elt)
		}
	}
	return result
}
