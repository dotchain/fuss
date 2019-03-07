// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package dom

// TextEdit implements a text edit control.
func textEdit(c *textEditCtx, styles Styles, text *TextStream) Element {
	var result Element

	result = c.Elt(
		"root",
		Props{
			Tag:         "input",
			Type:        "text",
			TextContent: text.Value,
			Styles:      styles,
			OnChange: &EventHandler{func(_ Event) {
				text = text.Append(nil, result.Value(), true)
			}},
		},
	)
	return result
}
