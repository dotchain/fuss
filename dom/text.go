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
	Text        *TextStream
	RawText     *string
}

// TextEditO is like TextEdit but with extended options
func textEditO(c *textEditOCtx, opt TextEditOptions) Element {
	text := opt.Text.Value
	if opt.RawText != nil {
		text = *opt.RawText
	}
	return c.Elt(
		"root",
		Props{
			Tag:         "input",
			Type:        "text",
			Placeholder: opt.Placeholder,
			TextContent: text,
			Styles:      opt.Styles,
			OnChange: &EventHandler{func(e Event) {
				opt.Text = opt.Text.Append(nil, e.Value(), true)
			}},
		},
	)
}
