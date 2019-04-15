// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package dom_test

import (
	"fmt"
	"testing"

	"github.com/dotchain/fuss/dom"
)

func TestImg(t *testing.T) {
	img, closeImg := dom.NewImg()

	data := []byte("boo")
	elt := img("x", dom.Styles{}, dom.DataUrl(data, "image/png"))

	if x := fmt.Sprint(elt); x != `<img src="data:image/png;base64,Ym9v"/>` {
		t.Error(x)
	}

	// cleanup
	closeImg()
	reportDriverLeaks(t)
}
