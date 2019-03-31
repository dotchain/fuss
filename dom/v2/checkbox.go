// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package dom

import "github.com/dotchain/dot/streams"

// CheckboxEditFunc represents a checkbox control.
type CheckboxEditFunc = func(key interface{}, styles Styles, checked *streams.Bool, id string) Element

// checkboxEdit implements a checkbox control.
func checkboxEdit(c *eltDep, styles Styles, checked *streams.Bool, id string) Element {
	return c.elt(
		"root",
		Props{
			ID:      id,
			Tag:     "input",
			Type:    "checkbox",
			Checked: checked.Value,
			Styles:  styles,
			OnChange: &EventHandler{Handle: func(e Event) {
				checked = checked.Update(e.Value() == "on")
			}},
		},
	)
}
