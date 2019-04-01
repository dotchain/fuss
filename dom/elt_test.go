// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package dom_test

import (
	"fmt"
	"reflect"
	"testing"

	"github.com/dotchain/fuss/dom"
)

// var newtestElt func() (testEltFunc, func())

type testeltDep struct {
	span dom.TextViewFunc
	run  dom.RunFunc
}

type testEltFunc = func(key interface{}, kind string) dom.Element

func testElt(c *testeltDep, kind string) dom.Element {
	switch kind {
	case "empty":
		return c.span("root", dom.Styles{}, "")
	case "boouya":
		return c.span("root", dom.Styles{}, "boouya")
	case "children 1 2":
		return c.run(
			"root", dom.Styles{},
			c.span("inner1", dom.Styles{}, "inner1"),
			c.span("inner2", dom.Styles{}, "inner2"))
	case "children 3 1":
		return c.run(
			"root", dom.Styles{},
			c.span("inner3", dom.Styles{}, "inner3"),
			c.span("inner1", dom.Styles{}, "inner1"))
	case "children 3":
		return c.run(
			"root", dom.Styles{},
			c.span("inner3", dom.Styles{}, "inner3"))
	case "children 1 2 3":
		return c.run(
			"root", dom.Styles{},
			c.span("inner1", dom.Styles{}, "inner1"),
			c.span("inner2", dom.Styles{}, "inner2"),
			c.span("inner3", dom.Styles{}, "inner3"))
	case "children 3 1 2":
		return c.run(
			"root", dom.Styles{},
			c.span("inner3", dom.Styles{}, "inner3"),
			c.span("inner1", dom.Styles{}, "inner1"),
			c.span("inner2", dom.Styles{}, "inner2"))
	case "children 2 3 1":
		return c.run(
			"root", dom.Styles{},
			c.span("inner2", dom.Styles{}, "inner2"),
			c.span("inner3", dom.Styles{}, "inner3"),
			c.span("inner1", dom.Styles{}, "inner1"))
	case "children 1 2 4":
		return c.run(
			"root", dom.Styles{},
			c.span("inner1", dom.Styles{}, "inner1"),
			c.span("inner2", dom.Styles{}, "inner2"),
			c.span("inner4", dom.Styles{}, "inner4"))
	}
	panic("unexpected test elt type")
}

func TestElt(t *testing.T) {
	elt, close := newtestElt()

	one := elt("one", "empty")
	if x := fmt.Sprint(one); x != "<span></span>" {
		t.Error(x)
	}

	if x := elt("one", "boouya"); x != one {
		t.Error("node changed", x)
	}

	if x := fmt.Sprint(one); x != "<span>boouya</span>" {
		t.Error(x)
	}

	one = elt("one", "children 1 2")
	prefix := "<div style=\"display: flex; flex-direction: row\">"
	if x := fmt.Sprint(one); x != prefix+"<span>inner1</span><span>inner2</span></div>" {
		t.Error(x)
	}

	in1 := one.Children()[0]

	if x := elt("one", "children 3 1"); x != one {
		t.Error("node changed", x)
	}

	if x := fmt.Sprint(one); x != prefix+"<span>inner3</span><span>inner1</span></div>" {
		t.Error(x)
	}

	if one.Children()[1] != in1 {
		t.Error("node child not reused")
	}

	if x := elt("one", "children 3"); x != one {
		t.Error("node changed", x)
	}

	if x := fmt.Sprint(one); x != prefix+"<span>inner3</span></div>" {
		t.Error(x)
	}

	close()
	reportDriverLeaks(t)
}

func TestEltLastChildChanging(t *testing.T) {
	elt, close := newtestElt()

	parent := elt("parent", "children 1 2 3")
	c1 := parent.Children()
	parent2 := elt("parent", "children 1 2 4")
	c2 := parent2.Children()

	if parent2 != parent || !reflect.DeepEqual(c1[:2], c2[:2]) {
		t.Fatal("Failed", parent2 != parent)
	}

	if reflect.DeepEqual(c1, c2) {
		t.Fatal("Unexpected children change", c1, c2)
	}

	// cleanup
	close()
	reportDriverLeaks(t)
}

func TestEltRotateRight(t *testing.T) {
	elt, close := newtestElt()

	parent := elt("parent", "children 1 2 3")
	c1 := parent.Children()
	parent2 := elt("parent", "children 3 1 2")
	c2 := parent2.Children()
	expected := []dom.Element{c1[2], c1[0], c1[1]}

	if !reflect.DeepEqual(c2, expected) {
		t.Fatal("Failed", c2, expected)
	}

	// cleanup
	close()
	reportDriverLeaks(t)
}

func TestEltRotateLeft(t *testing.T) {
	elt, close := newtestElt()

	parent := elt("parent", "children 1 2 3")
	c1 := parent.Children()
	parent2 := elt("parent", "children 2 3 1")
	c2 := parent2.Children()
	expected := []dom.Element{c1[1], c1[2], c1[0]}

	if !reflect.DeepEqual(c2, expected) {
		t.Fatal("Failed", c2, expected)
	}

	// cleanup
	close()
	reportDriverLeaks(t)
}
