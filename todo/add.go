// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

// Package todo demonstrates a simple todo mvc app built with FUSS
package todo

import (
	"github.com/dotchain/dot/changes"
	"github.com/dotchain/dot/changes/types"
	"github.com/dotchain/dot/streams"
)

func (s *TodoListStream) appendStream() *streams.S16 {
	return &streams.S16{Stream: &appender{s}, Value: ""}
}

type appender struct {
	s *TodoListStream
}

func (a *appender) Append(c changes.Change) streams.Stream {
	switch c := c.(type) {
	case nil:
		return a
	case changes.Replace:
		todo := Todo{ID: newID(), Description: string(c.After.(types.S16))}
		s := a.s.Splice(len(a.s.Value), 0, todo)
		return &appender{s}
	}
	panic("unexpected text stream change")
}

func (a *appender) ReverseAppend(c changes.Change) streams.Stream {
	panic("Not yet implemented")
}

func (a *appender) Next() (streams.Stream, changes.Change) {
	latest := a.s.Latest()
	if latest == a.s {
		return nil, nil
	}
	return &appender{latest}, nil
}

func (a appender) Nextf(key interface{}, fn func()) {
	a.s.Stream.Nextf(key, fn)
}
