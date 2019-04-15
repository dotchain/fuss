// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package dom

import "encoding/base64"

// ImgFunc represents an image
type ImgFunc = func(key interface{}, styles Styles, src string) Element

// img implements a paragraph-like flex "row" component
func img(c *eltDep, styles Styles, src string) Element {
	return c.elt("root", Props{Tag: "img", Styles: styles, Src: src})
}

// DataUrl converts a binary data into a data url
func DataUrl(data []byte, mimeType string) string {
	return "data:" + mimeType + ";base64," + base64.StdEncoding.EncodeToString(data)
}
