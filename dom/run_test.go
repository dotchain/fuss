// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package dom_test

import (
	"fmt"
	"github.com/dotchain/fuss/dom"
	"testing"
)

func TestRun(t *testing.T) {
	var e dom.EltStruct
	e.Begin()
	cell1 := e.Elt(1, dom.Props{ID: "one"})
	cell2 := e.Elt(2, dom.Props{ID: "two"})
	e.End()

	var r dom.RunStruct
	r.Begin()
	elt := r.Run("root", dom.Styles{Color: "red"}, cell1, cell2)
	r.End()

	if x := fmt.Sprint(elt); x != "<div style=\"color: red; display: flex; flex-direction: row\"><div id=\"one\"></div><div id=\"two\"></div></div>" {
		t.Error(x)
	}

	// cleanup
	r.Begin()
	r.End()
	e.Begin()
	e.End()
	reportDriverLeaks(t)
}

func TestVRun(t *testing.T) {
	var e dom.EltStruct
	e.Begin()
	cell1 := e.Elt(1, dom.Props{ID: "one"})
	cell2 := e.Elt(2, dom.Props{ID: "two"})
	e.End()

	var r dom.VRunStruct
	r.Begin()
	elt := r.VRun("root", dom.Styles{Color: "red"}, cell1, cell2)
	r.End()

	if x := fmt.Sprint(elt); x != "<div style=\"color: red; display: flex; flex-direction: column\"><div id=\"one\"></div><div id=\"two\"></div></div>" {
		t.Error(x)
	}

	// cleanup
	r.Begin()
	r.End()
	e.Begin()
	e.End()
	reportDriverLeaks(t)
}

func TestFixedStretch(t *testing.T) {
	var f dom.FixedStruct
	var s dom.StretchStruct

	f.Begin()
	s.Begin()
	cell1 := f.Fixed(1, dom.Styles{})
	cell2 := s.Stretch(2, dom.Styles{})
	f.End()
	s.End()

	var r dom.VRunStruct
	r.Begin()
	elt := r.VRun("root", dom.Styles{Color: "red"}, cell1, cell2)
	r.End()

	if x := fmt.Sprint(elt); x != "<div style=\"color: red; display: flex; flex-direction: column\"><div style=\"flex-shrink: 0\"></div><div style=\"flex-grow: 1\"></div></div>" {
		t.Error(x)
	}

	// cleanup
	r.Begin()
	r.End()
	f.Begin()
	f.End()
	s.Begin()
	s.End()
	reportDriverLeaks(t)
}
