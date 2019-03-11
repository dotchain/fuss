// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package dom_test

import (
	"fmt"
	"github.com/dotchain/fuss/dom"
	"testing"
)

func TestStringify(t *testing.T) {
	cases := map[string]fmt.Stringer{
		"something":      dom.Size{Raw: "something"},
		"50.2%":          dom.Size{Percent: 50.2},
		"22px":           dom.Size{Pixels: 22},
		"5.02em":         dom.Size{Em: 5.02},
		"0.1en":          dom.Size{En: 0.1},
		"row":            dom.Row,
		"column":         dom.Column,
		"row-reverse":    dom.RowReverse,
		"column-reverse": dom.ColumnReverse,
		"color: red":     dom.Styles{Color: "red"},
		"width: 5%":      dom.Styles{Width: dom.Size{Percent: 5}},

		"width: 5%; height: 2em": dom.Styles{
			Width:  dom.Size{Percent: 5},
			Height: dom.Size{Em: 2},
		},

		"overflow-x: auto": dom.Styles{OverflowX: "auto"},
		"overflow-y: auto": dom.Styles{OverflowY: "auto"},
		"":                 dom.Styles{FlexGrow: 5},

		"display: flex; flex-direction: row; flex-shrink: 0": dom.Styles{
			FlexDirection: dom.Row,
			FlexShrink:    dom.FlexNone,
		},
		"display: flex; flex-direction: row; flex-grow: 2": dom.Styles{
			FlexDirection: dom.Row,
			FlexGrow:      2,
		},
	}

	for k, v := range cases {
		if k != v.String() {
			t.Errorf("Failed to propery stringfy %#v %v", v, v)
		}
	}
}
