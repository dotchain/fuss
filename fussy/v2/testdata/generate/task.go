// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package task

type TaskViewF func(key interface{}, boova bool, goop *stream, boo ...bool) int

func taskView(key *taskCtx, boova bool, state1 int, goop *stream, boo ...bool) (int, int) {
	return 0, 0
}

// fake stream by simply having Stream and Value fields
type stream struct{ Stream, Value int }

func (x *stream) Equals(o *stream) bool {
	return false
}

type taskCtx struct {
	cb CheckboxF
}

type CheckboxF = func(key interface{}) int

func NewCheckbox() (CheckboxF, func()) {
	return nil, nil
}
