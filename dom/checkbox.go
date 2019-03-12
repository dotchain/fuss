// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package dom

// CheckboxEdit implements a checkbox control.
func checkboxEdit(c *cbEditCtx, styles Styles, checked *BoolStream, id string) Element {
	return c.Elt(
		"root",
		Props{
			ID:      id,
			Tag:     "input",
			Type:    "checkbox",
			Checked: checked.Value,
			Styles:  styles,
			OnChange: &EventHandler{func(e Event) {
				checked = checked.Append(nil, e.Value() == "on", true)
			}},
		},
	)
}
