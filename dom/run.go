// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package dom

// RunFunc represents a paragraph-like flex "row" component
type RunFunc = func(key interface{}, styles Styles, cells ...Element) Element

// run implements a paragraph-like flex "row" component
func run(c *eltDep, styles Styles, cells ...Element) Element {
	styles.FlexDirection = Row
	return c.elt("root", Props{Styles: styles}, cells...)
}

// FixedFunc represents a non-shrinkable container
type FixedFunc = func(key interface{}, styles Styles, cells ...Element) Element

// fixed implements a non-shrinkable container
func fixed(c *eltDep, styles Styles, cells ...Element) Element {
	styles.FlexShrink = FlexNone
	return c.elt("root", Props{Styles: styles}, cells...)
}

// StretchFunc represents a non-shrinkable container
type StretchFunc = func(key interface{}, styles Styles, cells ...Element) Element

// stretch implements a stretchable container
func stretch(c *eltDep, styles Styles, cells ...Element) Element {
	styles.FlexGrow = 1
	return c.elt("root", Props{Styles: styles}, cells...)
}

// VRunFunc represents a non-shrinkable container
type VRunFunc = func(key interface{}, styles Styles, cells ...Element) Element

// vRun implements a list-like flex "column" component
func vRun(c *eltDep, styles Styles, cells ...Element) Element {
	styles.FlexDirection = Column
	return c.elt("root", Props{Styles: styles}, cells...)
}
