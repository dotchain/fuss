// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package controls

import "github.com/dotchain/fuss/dom/v2"

// Chrome renders the app chrome
func chrome(deps *chromeDeps, header, body, footer dom.Element) dom.Element {
	return deps.vRun(
		"root",
		dom.Styles{},
		deps.fixed("h", dom.Styles{}, header),
		deps.stretch("b", dom.Styles{OverflowY: "auto"}, body),
		deps.fixed("f", dom.Styles{}, footer),
	)
}

type ChromeFunc = func(key interface{}, header, body, footer dom.Element) dom.Element
type chromeDeps struct {
	vRun    dom.VRunFunc
	fixed   dom.FixedFunc
	stretch dom.StretchFunc
}
