// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

// Package js implements a basic gopherjs driver for dom
package js

import (
	"github.com/dotchain/fuss/dom"
	"github.com/gopherjs/gopherjs/js"
	"strings"
	"unsafe"
)

func init() {
	events := map[string]*js.Object{
		"change": js.Global.Get("Map").New(),
		"click":  js.Global.Get("Map").New(),
	}
	dom.RegisterDriver(driver{events})
}

type driver struct {
	events map[string]*js.Object
}

type cbInfo struct {
	*dom.EventHandler
	listener func(*js.Object)
}

func (d driver) NewElement(props dom.Props, children ...dom.Element) dom.Element {
	tag := strings.ToLower(props.Tag)
	if tag == "" {
		tag = "div"
	}
	elt := element{js.Global.Get("document").Call("createElement", tag), &d}
	for k, v := range props.ToMap() {
		elt.SetProp(k, v)
	}
	for kk, child := range children {
		elt.InsertChild(kk, child)
	}
	return elt
}

type element struct {
	n *js.Object
	d *driver
}

func (e element) SetProp(key string, value interface{}) {
	switch key {
	case "Tag":
		tag := strings.ToLower(value.(string))
		if tag == "" {
			tag = "div"
		}
		if tag != strings.ToLower(e.n.Get("tagName").String()) {
			panic("Cannot change the tag of an element: " + tag)
		}
	case "Checked":
		e.n.Set("checked", value.(bool))
	case "Type":
		e.setAttr("type", value.(string))
	case "ID":
		e.setAttr("id", value.(string))
	case "For":
		e.setAttr("for", value.(string))
	case "TextContent":
		if strings.ToLower(e.n.Get("tagName").String()) == "input" {
			e.n.Set("value", value.(string))
		} else {
			e.n.Set("textContent", value.(string))
		}
	case "Styles":
		e.setAttr("style", value.(dom.Styles).ToCSS())
	case "OnChange":
		e.onEvent("change", value.(*dom.EventHandler))
	case "OnClick":
		e.onEvent("click", value.(*dom.EventHandler))
	default:
		panic("Unknown key: " + key)
	}
}

func (e element) setAttr(key, val string) {
	if val != "" {
		e.n.Call("setAttribute", key, val)
	} else {
		e.n.Call("removeAttribute", key)
	}
}

func (e element) onEvent(key string, h *dom.EventHandler) {
	dict := e.d.events[key]
	info, ok := get(dict, e.n)

	switch {
	case !ok && h != nil:
		listener := listener(e.n, dict)
		e.n.Call("addEventListener", key, js.InternalObject(listener), false)
		dict.Call("set", e.n, js.InternalObject(&cbInfo{h, listener}))
	case ok && h == nil:
		dict.Call("delete", e.n)
		e.n.Call("removeEventListener", key, js.InternalObject(info.listener))
	case ok && h != nil:
		info.EventHandler = h
	}
}

func (e element) Value() string {
	isInput := strings.ToLower(e.n.Get("tagName").String()) == "input"
	isCheckbox := e.n.Get("type").String() == "checkbox"

	if isInput && isCheckbox {
		m := map[bool]string{true: "on", false: "off"}
		return m[e.n.Get("checked").Bool()]
	}
	return e.n.Get("value").String()
}

func (e element) SetValue(s string) {
	e.n.Set("value", s)
}

func (e element) Children() []dom.Element {
	if x := e.n.Get("firstChild"); x != nil && x.Get("nodeType").Int() == 3 /* text node */ {
		return nil
	}

	result := []dom.Element{}
	for n := e.n.Get("firstChild"); n != nil; n = n.Get("nextSibling") {
		result = append(result, element{n, e.d})
	}
	return result
}

func (e element) RemoveChild(index int) {
	n := e.n.Get("firstChild")
	for kk := 0; kk < index; kk++ {
		n = n.Get("nextSibling")
	}
	e.n.Call("removeChild", n)
}

func (e element) InsertChild(index int, elt dom.Element) {
	if n := elt.(element).n; n.Get("parentElement") == e.n {
		e.n.Call("removeChild", n)
	}

	n := e.n.Get("firstChild")
	for kk := 0; kk < index; kk++ {
		n = n.Get("nextSibling")
	}
	if n != nil {
		e.n.Call("insertBefore", elt.(element).n, n)
	} else {
		e.n.Call("appendChild", elt.(element).n)
	}
}

func (e element) Close() {
	for k := range e.d.events {
		e.onEvent(k, nil)
	}
}

func (e element) DOMNode() *js.Object {
	return e.n
}

func get(m *js.Object, key *js.Object) (*cbInfo, bool) {
	if ok := m.Call("has", key).Bool(); !ok {
		return nil, false
	}

	jso := m.Call("get", key)
	return (*cbInfo)(unsafe.Pointer(jso.Unsafe())), true // nolint
}

func listener(n *js.Object, dict *js.Object) func(*js.Object) {
	return func(*js.Object) {
		if info, ok := get(dict, n); ok {
			info.EventHandler.Handle(dom.Event{})
		}
	}
}
