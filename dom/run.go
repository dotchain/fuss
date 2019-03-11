// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package dom

// Run implements a paragraph-like flex "row" component
func run(c *runCtx, styles Styles, cells ...Element) Element {
	styles.FlexDirection = Row
	return c.Elt("root", Props{Styles: styles}, cells...)
}
