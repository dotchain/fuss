// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

// Package todo demonstrates a simple todo mvc app built with FUSS
package todo

import (
	"github.com/dotchain/fuss/core"
	"github.com/dotchain/fuss/dom"
)

func (s *TasksStream) addTaskStream(cache core.Cache) (entry *dom.TextStream) {
	key := "next"
	n := s.Notifier
	handler := &core.Handler{}
	if f, h, ok := cache.GetSubstream(n, key); ok {
		entry, handler = f.(*dom.TextStream), h
	} else {
		entry = dom.NewTextStream("")
		parent, merging := s, false
		handler.Handle = func() {
			if merging {
				return
			}
			merging = true
			parent = parent.Latest()
			result := parent.Value
			for entry.Next != nil {
				entry = entry.Next
				result = append(result, Task{Description: entry.Value, ID: newID()})
			}

			parent = parent.Append(nil, result, true)
			merging = false
		}
		entry.On(handler)
		parent.On(handler)
	}

	entry = entry.Latest()
	n2 := entry.Notifier
	close := func() { n.Off(handler); n2.Off(handler) }
	cache.SetSubstream(n, key, entry, handler, close)

	return entry
}
