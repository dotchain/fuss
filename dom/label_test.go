// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package dom_test

import (
	"fmt"
	"github.com/dotchain/fuss/dom"
	"testing"
)

func TestLabelView(t *testing.T) {
	var l dom.LabelViewStruct

	l.Begin()
	elt := l.LabelView("root", dom.Styles{Color: "red"}, "description", "cb")
	l.End()

	if x := fmt.Sprint(elt); x != "<label for=\"cb\" style=\"color: red\">description</label>" {
		t.Error(x)
	}

	// cleanup
	l.Begin()
	l.End()
	reportDriverLeaks(t)
}
