// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package dom_test

import (
	"fmt"
	"testing"

	"github.com/dotchain/dot/streams"
	"github.com/dotchain/fuss/dom/html"
	"github.com/dotchain/fuss/dom"
)

func NewBoolStream(v bool) *streams.Bool {
	return &streams.Bool{Stream: streams.New(), Value: v}
}

func TestFocusable(t *testing.T) {
	focusable, close := dom.NewFocusable()

	focused, selected := NewBoolStream(false), NewBoolStream(false)
	h := &dom.EventHandler{func(e dom.Event) {
		switch e.Value() {
		case "click":
			selected.Update(true)
		case "focus":
			focused.Update(true)
		case "blur":
			focused.Update(false)
		}
	}}

	elt := focusable("root", h)

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

	if v, _ := selected.Next(); v != nil {
		t.Fatal("Focus ended up selecting!")
	}
	html.Click(elt)
	selected = selected.Latest()

	if !selected.Value {
		t.Error("Click did not take effect")
	}
	if v, _ := focused.Next(); v != nil {
		t.Error("Click ended up doing some focusing!")
	}

	// cleanup
	close()
	reportDriverLeaks(t)
}
