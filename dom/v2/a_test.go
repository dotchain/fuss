// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package dom_test

import (
	"fmt"
	"testing"

	"github.com/dotchain/fuss/dom/v2"
)

func TestA(t *testing.T) {
	textView, closeTextView := dom.NewTextView()
	anchor, closeA := dom.NewA()

	child := textView("t", dom.Styles{}, "hello")
	elt := anchor("root", dom.Styles{Color: "red"}, "Hello", child)

	if x := fmt.Sprint(elt); x != "<a href=\"Hello\" style=\"color: red\"><span>hello</span></a>" {
		t.Error(x)
	}

	// cleanup
	closeTextView()
	closeA()
	reportDriverLeaks(t)
}
