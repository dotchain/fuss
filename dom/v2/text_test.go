// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package dom_test

import (
	"fmt"
	"testing"

	"github.com/dotchain/dot/streams"
	"github.com/dotchain/fuss/dom/html"
	"github.com/dotchain/fuss/dom/v2"
)

func TestTextView(t *testing.T) {
	textView, close := dom.NewTextView()

	elt := textView("root", dom.Styles{Color: "red"}, "Hello")

	if x := fmt.Sprint(elt); x != "<span style=\"color: red\">Hello</span>" {
		t.Error(x)
	}

	// cleanup
	close()
	reportDriverLeaks(t)
}

func TestTextEdit(t *testing.T) {
	textEdit, close := dom.NewTextEdit()

	text := &streams.S16{Stream: streams.New(), Value: "boo"}
	elt := textEdit("root", dom.Styles{}, text)

	if x := fmt.Sprint(elt); x != "<input type=\"text\" value=\"boo\"/>" {
		t.Error(x)
	}

	html.SetValue(elt, "booya")
	if text.Latest().Value != "booya" {
		t.Error("SetValue did not take effect")
	}

	// cleanup
	close()
	reportDriverLeaks(t)
}

func TestTextEditPlaceholder(t *testing.T) {
	textEditO, close := dom.NewTextEditO()

	text := &streams.S16{Stream: streams.New(), Value: "boo"}
	opt := dom.TextEditOptions{Text: text, Placeholder: "booya"}
	elt := textEditO("root", opt)

	if x := fmt.Sprint(elt); x != "<input placeholder=\"booya\" type=\"text\" value=\"boo\"/>" {
		t.Error(x)
	}

	// cleanup
	close()
	reportDriverLeaks(t)
}

func TestTextEditRawText(t *testing.T) {
	textEditO, close := dom.NewTextEditO()

	text := &streams.S16{Stream: streams.New(), Value: "boo"}
	raw := "raw"
	opt := dom.TextEditOptions{Text: text, Placeholder: "booya", RawText: &raw}
	elt := textEditO("root", opt)

	if x := fmt.Sprint(elt); x != "<input placeholder=\"booya\" type=\"text\" value=\"raw\"/>" {
		t.Error(x)
	}

	// cleanup
	close()
	reportDriverLeaks(t)
}
