// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package controls

import (
	"github.com/dotchain/dot/streams"
	"github.com/dotchain/fuss/dom"
)

var empty = ""

// TextReset renders a text input that resets when input is submitted
func textReset(deps *textResetDeps, text *streams.S16, placeholder string) dom.Element {
	opt := dom.TextEditOptions{RawText: &empty, Text: text, Placeholder: placeholder}
	return deps.textEditO(text, opt)
}

type TextResetFunc = func(key interface{}, text *streams.S16, placeholder string) dom.Element
type textResetDeps struct {
	textEditO dom.TextEditOFunc
}
