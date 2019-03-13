// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package dom_test

import (
	"fmt"
	"github.com/dotchain/fuss/dom"
	"github.com/dotchain/fuss/dom/html"
	"testing"
)

func TestFocusable(t *testing.T) {
	var f dom.FocusableStruct

	focused, selected := dom.NewBoolStream(false), dom.NewBoolStream(false)

	f.Begin()
	elt := f.Focusable("root", focused, selected)
	f.End()

	if x := fmt.Sprint(elt); x != "<div tabindex=\"0\"></div>" {
		t.Error(x)
	}

	html.Focus(elt)
	focused = focused.Latest()

	if !focused.Value {
		t.Fatal("Focus did not take effect")
	}

	html.Blur()
	focused = focused.Latest()

	if focused.Value {
		t.Error("Focus did not take effect")
	}

	if selected.Next != nil {
		t.Error("Focus ended up selecting!")
	}
	html.Click(elt)
	selected = selected.Latest()

	if !selected.Value {
		t.Error("Click did not take effect")
	}
	if focused.Next != nil {
		t.Error("Click ended up doing some focusing!")
	}

	// cleanup
	f.Begin()
	f.End()
	reportDriverLeaks(t)
}
