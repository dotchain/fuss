// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package dom

// LabelViewFunc represents a label control.
type LabelViewFunc = func(key interface{}, styles Styles, text, inputID string) Element

// LabelView implements a label control.
func labelView(c *eltDep, styles Styles, text, inputID string) Element {
	return c.elt("root", Props{Tag: "label", For: inputID, Styles: styles, TextContent: text})
}
