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

func TestButton(t *testing.T) {
	var b dom.ButtonStruct
	count := 0

	onClick := &dom.EventHandler{func(dom.Event) { count++ }}

	b.Begin()
	elt := b.Button("root", dom.Styles{Color: "red"}, onClick)
	b.End()

	if x := fmt.Sprint(elt); x != "<button style=\"color: red\"></button>" {
		t.Error(x)
	}

	html.Click(elt)
	if count != 1 {
		t.Error("Click count = ", count)
	}
	html.Click(elt)
	if count != 2 {
		t.Error("Click count = ", count)
	}

	// cleanup
	b.Begin()
	b.End()
	reportDriverLeaks(t)
}
