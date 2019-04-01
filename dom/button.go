// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package dom

// ButtonFunc implements a button control.
type ButtonFunc = func(interface{}, Styles, *EventHandler, ...Element) Element

// Button implements a button control.
func button(c *eltDep, styles Styles, onClick *EventHandler, children ...Element) Element {
	return c.elt(
		"root",
		Props{Tag: "button", Styles: styles, OnClick: onClick},
		children...,
	)
}
