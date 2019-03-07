// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package dom_test

import (
	"fmt"
	"github.com/dotchain/fuss/dom"
	"testing"
)

type setter interface {
	SetValue(v string)
}

func TestCheckboxEdit(t *testing.T) {
	var cb dom.CheckboxEditStruct

	checked := dom.NewBoolStream(true)

	cb.Begin()
	elt := cb.CheckboxEdit("root", dom.Styles{}, checked)
	cb.End()

	// sadly attribute order is not guaranteed
	// TODO: sort them?
	options := map[string]bool{
		"<input checked=\"\" type=\"checkbox\"/>": true,
		"<input type=\"checkbox\" checked=\"\"/>": true,
	}

	if x := fmt.Sprint(elt); !options[x] {
		t.Error(x)
	}

	elt.(setter).SetValue("off")
	if checked.Latest().Value {
		t.Error("SetValue did not take effect")
	}
}
