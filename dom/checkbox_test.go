// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package dom_test

import (
	"fmt"
	"testing"

	"github.com/dotchain/dot/streams"
	"github.com/dotchain/fuss/dom"
	"github.com/dotchain/fuss/dom/html"
)

func TestCheckboxEdit(t *testing.T) {
	checkbox, close := dom.NewCheckboxEdit()
	checked := &streams.Bool{Stream: streams.New(), Value: true}

	elt := checkbox("root", dom.Styles{Color: "red"}, checked, "cb")

	if x := fmt.Sprint(elt); x != "<input checked=\"\" id=\"cb\" style=\"color: red\" type=\"checkbox\"/>" {
		t.Error(x)
	}

	html.SetValue(elt, "off")
	if checked.Latest().Value {
		t.Error("SetValue did not take effect")
	}

	// cleanup
	close()
	reportDriverLeaks(t)
}
