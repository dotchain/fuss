// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package dom

type AFunc = func(key interface{}, styles Styles, href string, children ...Element) Element

// A implements the simplified anchor tag
func a(c *eltDep, styles Styles, href string, children ...Element) Element {
	return c.elt("root", Props{Tag: "a", Href: href, Styles: styles}, children...)
}
