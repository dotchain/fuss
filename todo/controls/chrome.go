// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package controls

import "github.com/dotchain/fuss/dom"

// Chrome renders the app chrome
func chrome(c *chromeCtx, header dom.Element, body dom.Element, footer dom.Element) dom.Element {
	return c.dom.VRun(
		"root",
		dom.Styles{},
		c.dom.Fixed("h", dom.Styles{}, header),
		c.dom.Stretch("b", dom.Styles{OverflowY: "auto"}, body),
		c.dom.Fixed("f", dom.Styles{}, footer),
	)
}
