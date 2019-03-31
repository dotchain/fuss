// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package dom

type FocusableFunc = func(interface{}, *EventHandler, ...Element) Element

// Focusable is a basic control which can receive focus and be
// selected by clicks.
//
// This is different from a checbox or input in that there are no
// specific "values" available and it also does not expose actual
// keyboard events.
//
// Note that there is no programmatic way to focus this element
func focusable(c *eltDep, eh *EventHandler, children ...Element) Element {
	return c.elt("root", Props{OnFocus: eh, OnClick: eh}, children...)
}
