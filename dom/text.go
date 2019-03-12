// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package dom

// TextView implements a text view control.
func textView(c *textViewCtx, styles Styles, text string) Element {
	return c.Elt("root", Props{Tag: "span", TextContent: text, Styles: styles})
}

// TextEdit implements a text edit control.
func textEdit(c *textEditCtx, styles Styles, text *TextStream) Element {
	// TODO: make it less expensive to do this type of simple proxying
	return c.TextEditO("root", TextEditOptions{Styles: styles, Text: text})
}

// TextEditOptions configures a TextEditO control
type TextEditOptions struct {
	Styles
	Placeholder string
	Text *TextStream
}

// TextEditO is like TextEdit but with extended options
func textEditO(c *textEditOCtx, opt TextEditOptions) Element {
	var result Element

	result = c.Elt(
		"root",
		Props{
			Tag:         "input",
			Type:        "text",
			Placeholder: opt.Placeholder,
			TextContent: opt.Text.Value,
			Styles:      opt.Styles,
			OnChange: &EventHandler{func(_ Event) {
				opt.Text = opt.Text.Append(nil, result.Value(), true)
			}},
		},
	)
	return result
}
