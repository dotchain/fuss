// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package dom_test

import (
	"github.com/dotchain/fuss/dom/html"
	"testing"
)

func reportDriverLeaks(t *testing.T) {
	leaks := html.GetCurrentResources()
	if n := len(leaks); n > 0 {
		t.Fatal("Leaked", n, "resources\n", leaks)
	}
}
