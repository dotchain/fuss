// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package dom

// LabelView implements a label control.
func labelView(c *labelViewCtx, styles Styles, text, inputID string) Element {
	return c.Elt("root", Props{Tag: "label", For: inputID, Styles: styles, TextContent: text})
}
