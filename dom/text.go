// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package dom

import "github.com/dotchain/dot/streams"

// TextViewFunc represeentns a text view control
type TextViewFunc = func(key interface{}, styles Styles, text string) Element

// textView implements a text view control.
func textView(c *eltDep, styles Styles, text string) Element {
	return c.elt("root", Props{Tag: "span", TextContent: text, Styles: styles})
}

type textEditDep struct {
	textEditO TextEditOFunc
}

// TextEdit represents a text edit control.
type TextEditFunc = func(key interface{}, styles Styles, text *streams.S16) Element

// textEdit implements a text edit control.
func textEdit(c *textEditDep, styles Styles, text *streams.S16) Element {
	return c.textEditO("root", TextEditOptions{Styles: styles, Text: text})
}

// TextEditOptions configures a TextEditO control
type TextEditOptions struct {
	Styles
	Placeholder string
	Text        *streams.S16
	RawText     *string
}

// TextEditOFunc is like TextEditFunc but with extended options
type TextEditOFunc = func(key interface{}, opt TextEditOptions) Element

// TextEditO is like TextEdit but with extended options
func textEditO(c *eltDep, opt TextEditOptions) Element {
	text := opt.Text.Value
	if opt.RawText != nil {
		text = *opt.RawText
	}

	return c.elt(
		"root",
		Props{
			Tag:         "input",
			Type:        "text",
			Placeholder: opt.Placeholder,
			TextContent: text,
			Styles:      opt.Styles,
			OnChange: &EventHandler{Handle: func(e Event) {
				opt.Text = opt.Text.Update(e.Value())
			}},
		},
	)
}
