// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package dom

// Focusable is a basic control which can receive focus and be
// selected by clicks.
//
// This is different from a checbox or input in that there are no
// specific "values" available and it also does not expose actual
// keyboard events.  The focused stream gets updated whenever focus is
// obtained or lost.
//
// Note that there is no programmatic way to focus this element
func focusable(c *fCtx, focused, selected *BoolStream, children ...Element) Element {
	onFocus := &EventHandler{func(e Event) {
		focused = focused.Append(nil, e.Value() == "focus", true)
	}}
	onClick := &EventHandler{func(e Event) {
		selected = selected.Append(nil, true, true)
	}}
	return c.Elt("root", Props{OnFocus: onFocus, OnClick: onClick}, children...)
}
