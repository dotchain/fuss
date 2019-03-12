// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

// Package html implements a basic html driver for dom
//
// It uses "golang.org/x/net/html" as the basis
package html

import (
	"bytes"
	"github.com/dotchain/fuss/dom"
	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
	"sort"
	"strings"
)

var current *driver

func init() {
	current = &driver{events: map[string]map[*html.Node]*dom.EventHandler{
		"change": {},
		"click":  {},
	}}
	dom.RegisterDriver(current)
}

// GetCurrentResources returns the set of resources in use currently.
// This is meant for testing leaks
func GetCurrentResources() []string {
	result := []string{}
	for k, v := range current.events {
		for n := range v {
			var buf bytes.Buffer
			if err := html.Render(&buf, n); err != nil {
				panic(err)
			}
			result = append(result, k+":"+buf.String())
		}
	}
	return result
}

// SetValue sets the value for the provided element
func SetValue(e dom.Element, value string) {
	e.(element).setValue(value)
}

// Click clicks the provided element
func Click(elt dom.Element) {
	e := elt.(element)
	if cx, ok := e.d.events["click"][e.Node]; ok {
		cx.Handle(newEvent(e))
	}
}

// driver implements the dom.driver interface on top of net/html's
// Node type
type driver struct {
	// events tracks all registered handlers
	events map[string]map[*html.Node]*dom.EventHandler
}

// NewElement implements the dom.driver NewElement method
func (d *driver) NewElement(props dom.Props, children ...dom.Element) dom.Element {
	tag := strings.ToLower(props.Tag)
	if tag == "" {
		tag = "div"
	}
	a := atom.Lookup([]byte(tag))
	n := &html.Node{
		Type:     html.ElementNode,
		DataAtom: a,
		Data:     a.String(),
	}
	elt := element{n, d}
	for k, v := range props.ToMap() {
		elt.SetProp(k, v)
	}
	for kk, child := range children {
		elt.InsertChild(kk, child)
	}
	elt.sortAttr()
	return elt
}

type element struct {
	*html.Node
	d *driver
}

func (e element) String() string {
	var buf bytes.Buffer
	if err := html.Render(&buf, e.Node); err != nil {
		panic(err)
	}
	return buf.String()
}

func (e element) sortAttr() {
	sort.Slice(e.Node.Attr, func(i, j int) bool {
		return e.Node.Attr[i].Key < e.Node.Attr[j].Key
	})
}

func (e element) SetProp(key string, value interface{}) {
	defer e.sortAttr()
	switch key {
	case "ID", "For", "Href", "Type", "Placeholder":
		e.setStringAttribute(strings.ToLower(key), value.(string))
	case "Tag":
		tag := strings.ToLower(value.(string))
		if tag == "" {
			tag = "div"
		}
		if tag != e.Node.Data {
			panic("Cannot change the tag of an element: " + tag)
		}
	case "Checked":
		e.setChecked(value.(bool))
	case "TextContent":
		e.setTextContent(value.(string))
	case "Styles":
		e.setStringAttribute("style", value.(dom.Styles).String())
	case "OnChange":
		e.onEvent("change", value.(*dom.EventHandler))
	case "OnClick":
		e.onEvent("click", value.(*dom.EventHandler))
	default:
		panic("Unknown key: " + key)
	}
}

func (e element) setChecked(v bool) {
	e.removeAttribute("checked")
	if v {
		e.Node.Attr = append(e.Node.Attr, html.Attribute{Key: "checked"})
	}
}

func (e element) setStringAttribute(key, val string) {
	e.removeAttribute(key)
	if val != "" {
		e.Node.Attr = append(e.Node.Attr, html.Attribute{Key: key, Val: val})
	}
}

func (e element) setTextContent(s string) {
	for e.Node.FirstChild != nil {
		e.Node.RemoveChild(e.Node.FirstChild)
	}

	if e.Node.Data == "input" {
		e.removeAttribute("value")
		if s != "" {
			a := html.Attribute{Key: "value", Val: s}
			e.Node.Attr = append(e.Node.Attr, a)
		}
	} else if s != "" {
		e.Node.AppendChild(&html.Node{Type: html.TextNode, Data: s})
	}
}

func (e element) onEvent(key string, v *dom.EventHandler) {
	if v == nil {
		delete(e.d.events[key], e.Node)
	} else {
		e.d.events[key][e.Node] = v
	}
}

func (e element) HTMLElement() *html.Node {
	return e.Node
}

func (e element) removeAttribute(key string) {
	attr := e.Node.Attr
	for kk, a := range attr {
		if a.Key == key {
			copy(attr[kk:], attr[kk+1:])
			e.Node.Attr = attr[:len(attr)-1]
			return
		}
	}
}

func (e element) setValue(s string) {
	inputType := ""
	for _, a := range e.Node.Attr {
		switch a.Key {
		case "type":
			inputType = a.Val
		}
	}

	if inputType == "checkbox" {
		e.SetProp("Checked", s == "on")
	} else {
		e.SetProp("TextContent", s)
	}

	if cx, ok := e.d.events["change"][e.Node]; ok {
		cx.Handle(newEvent(e))
	}
}

func (e element) Children() []dom.Element {
	if x := e.Node.FirstChild; x != nil && x.Type == html.TextNode {
		return nil
	}

	result := []dom.Element{}
	for n := e.Node.FirstChild; n != nil; n = n.NextSibling {
		result = append(result, element{n, e.d})
	}
	return result
}

func (e element) RemoveChild(index int) {
	n := e.Node.FirstChild
	for kk := 0; kk < index; kk++ {
		n = n.NextSibling
	}
	e.Node.RemoveChild(n)
}

func (e element) InsertChild(index int, elt dom.Element) {
	if n := elt.(element).Node; n.Parent == e.Node {
		e.Node.RemoveChild(n)
	}

	n := e.Node.FirstChild
	for kk := 0; kk < index; kk++ {
		n = n.NextSibling
	}
	if n != nil {
		e.Node.InsertBefore(elt.(element).Node, n)
	} else {
		e.Node.AppendChild(elt.(element).Node)
	}
}

func (e element) Close() {
	for _, v := range e.d.events {
		delete(v, e.Node)
	}
}
