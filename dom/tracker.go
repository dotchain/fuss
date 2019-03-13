// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package dom

import "github.com/dotchain/fuss/core"

// FocusTracker holds the selection state for a group of focusables
// controls.
type FocusTracker struct {
	Current interface{}
}

// Substream returns the individual bool stream for a focusable to use.
func (s *FocusTrackerStream) Substream(cache core.Cache, key interface{}) *BoolStream {
	var field *BoolStream

	n := s.Notifier
	handler := &core.Handler{nil}
	if f, h, ok := cache.GetSubstream(n, key); ok {
		field, handler = f.(*BoolStream), h
	} else {
		field = NewBoolStream(false)
		branch := &trackerBranch{s, field, key, false}
		handler.Handle = branch.merge
		field.On(handler)
		s.On(handler)
	}

	handler.Handle()
	field = field.Latest()
	n2 := field.Notifier
	close := func() { n.Off(handler); n2.Off(handler) }
	cache.SetSubstream(n, key, field, handler, close)
	return field
}

type trackerBranch struct {
	parent  *FocusTrackerStream
	child   *BoolStream
	key     interface{}
	merging bool
}

// TODO: merge does not honor chronological ordering between
// different substreams. This can be achived by including a time
// element into both parent and child streams.
func (b *trackerBranch) merge() {
	if b.merging {
		return
	}

	b.merging = true
	b.parent = b.parent.Latest()
	v := b.parent.Value

	for ; b.child.Next != nil; b.child = b.child.Next {
		if !b.child.Next.Value && v.Current != b.key {
			continue
		}
		if b.child.Next.Value {
			v.Current = b.key
		} else {
			v.Current = nil
		}
		b.parent = b.parent.Append(nil, v, true)
	}

	b.merging = false
}
