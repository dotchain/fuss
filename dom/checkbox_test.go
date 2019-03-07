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
	elt := cb.CheckboxEdit("root", dom.Styles{Color: "red"}, checked)
	cb.End()

	if x := fmt.Sprint(elt); x != "<input checked=\"\" style=\"color: red\" type=\"checkbox\"/>" {
		t.Error(x)
	}

	elt.(setter).SetValue("off")
	if checked.Latest().Value {
		t.Error("SetValue did not take effect")
	}
}
