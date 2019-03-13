// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package dom_test

import (
	"github.com/dotchain/fuss/core"
	"github.com/dotchain/fuss/dom"
	"testing"
)

func TestFocusTracker(t *testing.T) {
	var cache core.Cache

	tracker := dom.NewFocusTrackerStream(dom.FocusTracker{})

	cache.Begin()
	c1 := tracker.Substream(cache, "one")
	c2 := tracker.Substream(cache, 2)
	c3 := tracker.Substream(cache, 3)
	cache.End()

	c1 = c1.Append(nil, true, true)
	if tracker.Latest().Value.Current != "one" {
		t.Error("Tracker didnt shift to one", tracker.Latest().Value.Current)
	}

	c2 = c2.Append(nil, true, true)
	if tracker.Latest().Value.Current != 2 {
		t.Error("Tracker didn't shift to 2", tracker.Latest().Value.Current)
	}

	c1 = c1.Append(nil, false, true)
	if tracker.Latest().Value.Current != 2 {
		t.Error("Tracker falsely merged blur of one", tracker.Latest().Value.Current)
	}

	c2 = c2.Append(nil, false, true)
	if tracker.Latest().Value.Current != nil {
		t.Error("Tracker failed to merged blur of 2", tracker.Latest().Value.Current)
	}

	cache.Begin()
	if x := tracker.Substream(cache, "one"); x != c1 {
		t.Error("Unexpected value")
	}
	if x := tracker.Substream(cache, 2); x != c2 {
		t.Error("Unexpected value")
	}
	if x := tracker.Substream(cache, 3); x != c3 {
		t.Error("Unexpected value")
	}
	cache.End()

	// cleanup
	cache.Begin()
	cache.End()
}
