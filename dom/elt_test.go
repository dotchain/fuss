// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package dom_test

import (
	"fmt"
	"github.com/dotchain/fuss/dom"
	_ "github.com/dotchain/fuss/dom/html"
	"testing"
)

func TestElt(t *testing.T) {
	var e dom.EltStruct

	elt := func(key string, props dom.Props, fn ...func() dom.Element) dom.Element {
		e.Begin()
		defer e.End()
		c := []dom.Element{}
		for _, f := range fn {
			c = append(c, f())
		}
		return e.Elt(key, props, c...)
	}

	one := elt("one", dom.Props{})
	if x := fmt.Sprint(one); x != "<div></div>" {
		t.Error(x)
	}

	if x := elt("one", dom.Props{TextContent: "boouya"}); x != one {
		t.Error("node changed", x)
	}

	if x := fmt.Sprint(one); x != "<div>boouya</div>" {
		t.Error(x)
	}

	inner1 := func() dom.Element {
		return e.Elt("inner1", dom.Props{TextContent: "inner1"})
	}
	inner2 := func() dom.Element {
		return e.Elt("inner2", dom.Props{TextContent: "inner2"})
	}
	inner3 := func() dom.Element {
		return e.Elt("inner3", dom.Props{TextContent: "inner3"})
	}

	if x := elt("one", dom.Props{}, inner1, inner2); x != one {
		t.Error("node changed", x)
	}

	if x := fmt.Sprint(one); x != "<div><div>inner1</div><div>inner2</div></div>" {
		t.Error(x)
	}

	in1 := one.Children()[0]

	if x := elt("one", dom.Props{}, inner3, inner1); x != one {
		t.Error("node changed", x)
	}

	if x := fmt.Sprint(one); x != "<div><div>inner3</div><div>inner1</div></div>" {
		t.Error(x)
	}

	if one.Children()[1] != in1 {
		t.Error("node child not reused")
	}

	if x := elt("one", dom.Props{}, inner3); x != one {
		t.Error("node changed", x)
	}

	if x := fmt.Sprint(one); x != "<div><div>inner3</div></div>" {
		t.Error(x)
	}

	// cleanup
	e.Begin()
	e.End()
	reportDriverLeaks(t)
}

func TestEltLastChildChanging(t *testing.T) {
	var e dom.EltStruct

	e.Begin()
	one := e.Elt("one", dom.Props{})
	two := e.Elt("two", dom.Props{})
	three := e.Elt("three", dom.Props{})
	parent := e.Elt("parent", dom.Props{}, one, two, three)
	e.End()

	e.Begin()
	one2 := e.Elt("one", dom.Props{})
	two2 := e.Elt("two", dom.Props{})
	three2 := e.Elt("three-new", dom.Props{})
	parent2 := e.Elt("parent", dom.Props{}, one2, two2, three2)
	e.End()

	if parent2 != parent || one2 != one || two2 != two || three2 == three {
		t.Fatal("Failed", parent2 != parent, one2 != one, two2 != two, three2 == three)
	}

	children := parent2.Children()
	if children[0] != one || children[1] != two || children[2] == three {
		t.Fatal("Unexpected children change", children[0] == one2, children[1] != two, children[2] == three)
	}

	// cleanup
	e.Begin()
	e.End()
	reportDriverLeaks(t)
}

func TestEltRotateRight(t *testing.T) {
	var e dom.EltStruct

	e.Begin()
	one := e.Elt("one", dom.Props{})
	two := e.Elt("two", dom.Props{})
	three := e.Elt("three", dom.Props{})
	parent := e.Elt("parent", dom.Props{}, one, two, three)
	e.End()

	e.Begin()
	one = e.Elt("one", dom.Props{})
	two = e.Elt("two", dom.Props{})
	three = e.Elt("three", dom.Props{})
	parent2 := e.Elt("parent", dom.Props{}, three, one, two)
	e.End()

	children := parent2.Children()
	c1, c2, c3 := children[0], children[1], children[2]

	if parent2 != parent || c1 != three || c2 != one || c3 != two {
		t.Fatal("Failed", parent2 != parent, c1 != three, c2 != one, c3 != two)
	}

	// cleanup
	e.Begin()
	e.End()
	reportDriverLeaks(t)
}

func TestEltRotateLeft(t *testing.T) {
	var e dom.EltStruct

	e.Begin()
	one := e.Elt("one", dom.Props{})
	two := e.Elt("two", dom.Props{})
	three := e.Elt("three", dom.Props{})
	parent := e.Elt("parent", dom.Props{}, one, two, three)
	e.End()

	e.Begin()
	one = e.Elt("one", dom.Props{})
	two = e.Elt("two", dom.Props{})
	three = e.Elt("three", dom.Props{})
	parent2 := e.Elt("parent", dom.Props{}, two, three, one)
	e.End()

	children := parent2.Children()
	c1, c2, c3 := children[0], children[1], children[2]

	if parent2 != parent || c1 != two || c2 != three || c3 != one {
		t.Fatal("Failed", parent2 != parent, c1 != two, c2 != three, c3 != one)
	}

	// cleanup
	e.Begin()
	e.End()
	reportDriverLeaks(t)
}
