// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package core_test

import (
	"github.com/dotchain/fuss/core"
	"reflect"
	"testing"
)

func TestDiffRotate(t *testing.T) {
	tests := [][3]int{{10, 3, 2}, {10, 3, 20}, {10, -3, 2}, {10, -3, 20}}

	for _, test := range tests {
		count, distance, shoulder := test[0], test[1], test[2]

		size := count + 2*shoulder
		before := make([]int, size)
		after := make([]int, size)
		for kk := range before {
			if kk < shoulder || kk >= shoulder+count {
				before[kk] = size
				after[kk] = size
				size++
			} else {
				before[kk] = kk - shoulder
				after[kk] = (kk - shoulder + count - distance) % count
			}
		}
		ii := &ints{before, after}
		core.Diff(len(ii.before), len(ii.after), ii.eq, ii.insert, ii.remove)
		if !reflect.DeepEqual(ii.before, ii.after) {
			t.Error("Failed", ii.before, ii.after, test)
		}
	}
}

func TestDiffMisc(t *testing.T) {
	ii := &ints{before: []int{1, 2, 3}, after: []int{4, 5, 6}}
	core.Diff(len(ii.before), len(ii.after), ii.eq, ii.insert, ii.remove)
	if !reflect.DeepEqual(ii.before, ii.after) {
		t.Error("Failed", ii.before, ii.after)
	}

	ii = &ints{before: []int{5}, after: []int{4, 5, 6}}
	core.Diff(len(ii.before), len(ii.after), ii.eq, ii.insert, ii.remove)
	if !reflect.DeepEqual(ii.before, ii.after) {
		t.Error("Failed", ii.before, ii.after)
	}

	ii = &ints{after: []int{5}, before: []int{4, 5, 6}}
	core.Diff(len(ii.before), len(ii.after), ii.eq, ii.insert, ii.remove)
	if !reflect.DeepEqual(ii.before, ii.after) {
		t.Error("Failed", ii.before, ii.after)
	}
}

type ints struct {
	before, after []int
}

func (ii *ints) eq(i, j int) bool {
	return ii.before[i] == ii.after[j]
}

func (ii *ints) insert(index, j int) {
	for kk := range ii.before {
		if ii.eq(kk, j) {
			ii.remove(kk)
			break
		}
	}

	result := make([]int, len(ii.before)+1)
	copy(result, ii.before[:index])
	result[index] = ii.after[j]
	copy(result[index+1:], ii.before[index:])
	ii.before = result
}

func (ii *ints) remove(index int) {
	ii.before = append(ii.before[:index:index], ii.before[index+1:]...)
}
