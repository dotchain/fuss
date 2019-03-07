// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package dom

// CheckboxEdit implements a checkbox control.
func checkboxEdit(c *cbEditCtx, styles Styles, checked *BoolStream) Element {
	var result Element
	result = c.Elt(
		"root",
		Props{
			Tag:     "input",
			Type:    "checkbox",
			Checked: checked.Value,
			Styles:  styles,
			OnChange: &EventHandler{func(_ Event) {
				checked = checked.Append(nil, result.Value() == "on", true)
			}},
		},
	)
	return result
}
