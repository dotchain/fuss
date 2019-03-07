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

type diff struct {
	insert bool
	elt    Element
	index  int
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
	e.updateChildren(children)
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

func (e *node) updateChildren(after []Element) {
	for _, op := range e.bestDiff(e.root.Children(), after, 0, nil) {
		if op.insert {
			e.root.InsertChild(op.index, op.elt)
		} else {
			e.root.RemoveChild(op.index)
		}
	}
}

func (e *node) bestDiff(before, after []Element, offset int, ops []diff) []diff {
	for len(before) > 0 && len(after) > 0 && before[0] == after[0] {
		offset++
		before, after = before[1:], after[1:]
	}

	switch {
	case len(before) == 0:
		for _, elt := range after {
			ops = append(ops, diff{true, elt, offset})
			offset++
		}
	case len(after) == 0:
		for _, item := range before {
			found := false
			for _, op := range ops {
				found = found || op.elt == item
			}
			if !found {
				ops = append(ops, diff{false, nil, offset})
			}
		}
	default:
		ops = e.chooseDiff(before, after, offset, ops)
	}

	return ops
}

func (e *node) chooseDiff(before, after []Element, offset int, ops []diff) []diff {
	if len(before) > 0 && len(ops) > 0 {
		for _, op := range ops {
			if op.insert && op.elt == before[0] {
				return e.bestDiff(before[1:], after, offset, ops)
			}
		}
	}

	// choice1 = clone of ops + delete first before elt
	choice1 := append(ops, diff{false, nil, offset})
	choice1 = e.bestDiff(before[1:], after, offset, choice1)

	index := e.indexOf(before[0], after)
	if index == -1 {
		return choice1
	}

	// choice2 = clone of ops + insert index after elts
	choice2 := append([]diff(nil), ops...)
	for kk := 0; kk < index+1; kk++ {
		choice2 = append(choice2, diff{true, after[kk], offset + kk})
	}
	choice2 = e.bestDiff(before, after[index+1:], offset+index+1, choice2)
	if len(choice1) < len(choice2) {
		return choice1
	}
	return choice2
}

func (e *node) indexOf(elt Element, elts []Element) int {
	for kk, elt1 := range elts {
		if elt1 == elt {
			return kk
		}
	}
	return -1
}
