// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package dom_test

import (
	"fmt"
	"testing"

	"github.com/dotchain/fuss/dom/html"
	"github.com/dotchain/fuss/dom"
)

func TestButton(t *testing.T) {
	button, close := dom.NewButton()

	count := 0
	onClick := &dom.EventHandler{func(dom.Event) { count++ }}

	elt := button("root", dom.Styles{Color: "red"}, onClick)

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

	close()
	reportDriverLeaks(t)
}
