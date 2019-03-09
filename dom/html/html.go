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

func init() {
	dom.RegisterDriver(Driver{OnChange: map[*html.Node]*dom.EventHandler{}})
}

// Driver implements the dom.Driver interface on top of net/html's
// Node type
type Driver struct {
	// OnChange tracks all the OnChange handlers registered
	OnChange map[*html.Node]*dom.EventHandler
}

// NewElement implements the dom.Driver NewElement method
func (d Driver) NewElement(props dom.Props, children ...dom.Element) dom.Element {
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
	elt := element{n, &d}
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
	d *Driver
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
	case "ID":
		e.setStringAttribute("id", value.(string))
	case "For":
		e.setStringAttribute("for", value.(string))
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
	case "Type":
		e.setStringAttribute("type", value.(string))
	case "TextContent":
		e.setTextContent(value.(string))
	case "Styles":
		e.setStyles(value.(dom.Styles).ToCSS())
	case "OnChange":
		e.onChange(value.(*dom.EventHandler))
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

func (e element) setStyles(css string) {
	e.removeAttribute("style")
	if css != "" {
		a := html.Attribute{Key: "style", Val: css}
		e.Node.Attr = append(e.Node.Attr, a)
	}
}

func (e element) onChange(v *dom.EventHandler) {
	if v == nil {
		delete(e.d.OnChange, e.Node)
	} else {
		e.d.OnChange[e.Node] = v
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

func (e element) Value() string {
	checked := "off"
	var val *string
	inputType := ""
	for _, a := range e.Node.Attr {
		switch a.Key {
		case "checked":
			checked = "on"
		case "value":
			val = &a.Val
		case "type":
			inputType = a.Val
		}
	}

	if inputType == "checkbox" {
		return checked
	}

	if val != nil {
		return *val
	}

	if e.Node.FirstChild != nil {
		return e.Node.FirstChild.Data
	}

	return ""
}

func (e element) SetValue(s string) {
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

	if cx, ok := e.d.OnChange[e.Node]; ok {
		cx.Handle(dom.Event{})
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
	delete(e.d.OnChange, e.Node)
}
