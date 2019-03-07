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
