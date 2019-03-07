// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package dom_test

import (
	"bytes"
	"github.com/dotchain/fuss/dom"
	"github.com/dotchain/fuss/dom/html"
	nethtml "golang.org/x/net/html"
	"testing"
)

func reportDriverLeaks(t *testing.T) {
	// get the current driver
	old := dom.RegisterDriver(nil)
	dom.RegisterDriver(old)

	resources := old.(html.Driver)
	if count := len(resources.OnChange); count > 0 {
		nodes := []interface{}{}
		for k := range resources.OnChange {
			var buf bytes.Buffer
			if err := nethtml.Render(&buf, k); err != nil {
				panic(err)
			}
			nodes = append(nodes, buf.String())
		}
		t.Fatal("Leaked", count, "nodes\n", nodes)
	}
}
