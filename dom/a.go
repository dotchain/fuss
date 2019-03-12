// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package dom

// A implements the simplified anchor tag
func A(c *aCtx, styles Styles, href string, children ...Element) Element {
	return c.Elt("root", Props{Tag: "a", Href: href, Styles: styles}, children...)
}
