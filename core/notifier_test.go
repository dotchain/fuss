// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package core_test

import (
	"testing"

	"github.com/dotchain/fuss/core"
)

func TestNotifier(t *testing.T) {
	count := 0
	h := &core.Handler{func() { count++ }}
	var n core.Notifier

	// add a dummy handler
	n.On(&core.Handler{func() {}})

	// add a real one and test
	n.On(h)
	n.Notify()
	if count != 1 {
		t.Error("Unexpected", count)
	}

	// add yet another dummy handler and test
	n.On(&core.Handler{func() {}})
	n.Notify()
	if count != 2 {
		t.Error("Unexpected", count)
	}

	// remove and test
	n.Off(h)
	n.Notify()
	if count != 2 {
		t.Error("Unexpected", count)
	}
}
