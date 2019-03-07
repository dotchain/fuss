// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package dom_test

import (
	"fmt"
	"github.com/dotchain/fuss/dom"
	"testing"
)

func TestTextEdit(t *testing.T) {
	var edit dom.TextEditStruct

	text := dom.NewTextStream("boo")

	edit.Begin()
	elt := edit.TextEdit("root", dom.Styles{}, text)
	edit.End()

	// sadly attribute order is not guaranteed
	// TODO: sort them?
	options := map[string]bool{
		"<input value=\"boo\" type=\"text\"/>": true,
		"<input type=\"text\" value=\"boo\"/>": true,
	}

	if x := fmt.Sprint(elt); !options[x] {
		t.Error(x)
	}

	elt.(setter).SetValue("booya")
	if text.Latest().Value != "booya" {
		t.Error("SetValue did not take effect")
	}
}
