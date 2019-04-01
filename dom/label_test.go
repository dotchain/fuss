// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package dom_test

import (
	"fmt"
	"testing"

	"github.com/dotchain/fuss/dom"
)

func TestLabelView(t *testing.T) {
	labelView, close := dom.NewLabelView()

	elt := labelView("root", dom.Styles{Color: "red"}, "description", "cb")

	if x := fmt.Sprint(elt); x != "<label for=\"cb\" style=\"color: red\">description</label>" {
		t.Error(x)
	}

	// cleanup
	close()
	reportDriverLeaks(t)
}
