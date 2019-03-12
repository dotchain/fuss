// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package controls

import "github.com/dotchain/fuss/dom"

var empty = ""

// TextReset renders a text input that resets when input is submitted
func textReset(c *textResetCtx, text *dom.TextStream, ph string) dom.Element {
	opt := dom.TextEditOptions{RawText: &empty, Text: text, Placeholder: ph}
	return c.dom.TextEditO(text, opt)
}
