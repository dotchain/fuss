// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package dom

// Run implements a paragraph-like flex "row" component
func run(c *runCtx, styles Styles, cells ...Element) Element {
	styles.FlexDirection = Row
	return c.Elt("root", Props{Styles: styles}, cells...)
}

// Fixed implements a non-shrinkable container
func fixed(c *fixedCtx, styles Styles, cells ...Element) Element {
	styles.FlexShrink = FlexNone
	return c.Elt("root", Props{Styles: styles}, cells...)
}

// Stretch implements a stretchable container
func stretch(c *stretchCtx, styles Styles, cells ...Element) Element {
	styles.FlexGrow = 1
	return c.Elt("root", Props{Styles: styles}, cells...)
}

// VRun implements a list-like flex "column" component
func vrun(c *vrunCtx, styles Styles, cells ...Element) Element {
	styles.FlexDirection = Column
	return c.Elt("root", Props{Styles: styles}, cells...)
}
