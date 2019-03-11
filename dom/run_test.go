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
