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

func TestTextEdit(t *testing.T) {
	var edit dom.TextEditStruct

	text := dom.NewTextStream("boo")

	edit.Begin()
	elt := edit.TextEdit("root", dom.Styles{}, text)
	edit.End()

	if x := fmt.Sprint(elt); x != "<input type=\"text\" value=\"boo\"/>" {
		t.Error(x)
	}

	html.SetValue(elt, "booya")
	if text.Latest().Value != "booya" {
		t.Error("SetValue did not take effect")
	}

	// cleanup
	edit.Begin()
	edit.End()
	reportDriverLeaks(t)
}
