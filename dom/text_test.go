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

func TestTextView(t *testing.T) {
	var view dom.TextViewStruct

	view.Begin()
	elt := view.TextView("root", dom.Styles{Color: "red"}, "Hello")
	view.End()

	if x := fmt.Sprint(elt); x != "<span style=\"color: red\">Hello</span>" {
		t.Error(x)
	}

	// cleanup
	view.Begin()
	view.End()
	reportDriverLeaks(t)
}

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

func TestTextEditPlaceholder(t *testing.T) {
	var edit dom.TextEditOStruct

	text := dom.NewTextStream("boo")

	edit.Begin()
	opt := dom.TextEditOptions{Text: text, Placeholder: "booya"}
	elt := edit.TextEditO("root", opt)
	edit.End()

	if x := fmt.Sprint(elt); x != "<input placeholder=\"booya\" type=\"text\" value=\"boo\"/>" {
		t.Error(x)
	}

	// cleanup
	edit.Begin()
	edit.End()
	reportDriverLeaks(t)
}

func TestTextEditRawText(t *testing.T) {
	var edit dom.TextEditOStruct

	text := dom.NewTextStream("boo")
	raw := "raw"

	edit.Begin()
	opt := dom.TextEditOptions{Text: text, Placeholder: "booya", RawText: &raw}
	elt := edit.TextEditO("root", opt)
	edit.End()

	if x := fmt.Sprint(elt); x != "<input placeholder=\"booya\" type=\"text\" value=\"raw\"/>" {
		t.Error(x)
	}

	// cleanup
	edit.Begin()
	edit.End()
	reportDriverLeaks(t)
}
