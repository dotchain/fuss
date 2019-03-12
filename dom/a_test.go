// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package dom_test

import (
	"fmt"
	"github.com/dotchain/fuss/dom"
	"testing"
)

func TestA(t *testing.T) {
	var view dom.AStruct
	var texts dom.TextViewStruct

	view.Begin()
	texts.Begin()
	child := texts.TextView("t", dom.Styles{}, "hello")
	elt := view.A("root", dom.Styles{Color: "red"}, "Hello", child)
	texts.End()
	view.End()

	if x := fmt.Sprint(elt); x != "<a href=\"Hello\" style=\"color: red\"><span>hello</span></a>" {
		t.Error(x)
	}

	// cleanup
	view.Begin()
	view.End()
	texts.Begin()
	texts.End()
	reportDriverLeaks(t)
}
