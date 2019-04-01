// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package core

// Diff generates a sequence of insert/remove calls that
// converts an input array of distinct values to the output array.
//
// The arrays are identified by their count with the methods for
// comparing, inserting and removing.
//
// eq compares a beforeIndex with an afterIndex to see if they
// represent the same item.
//
// insert inserts at the specified index. The second arg is the index
// of the element in the after array to insert into the before array.
//
// remove removes an element from the before array at the specified
// index.
func Diff(before, after int, eq func(i, j int) bool, insert func(i, j int), remove func(i int)) {
	b := make([]int, before)
	a := make([]int, after)
	for kk := range b {
		b[kk] = kk
	}
	for kk := range a {
		a[kk] = kk
	}
	for _, op := range bestDiff(b, a, 0, nil, eq) {
		if op.insert {
			insert(op.at, op.elt)
		} else {
			remove(op.at)
		}
	}
}

type diff struct {
	insert  bool
	elt, at int
}

func bestDiff(before, after []int, offset int, ops []diff, eq func(i, j int) bool) []diff {
	before, after, offset = filterItems(before, after, offset, ops, eq)

	switch {
	case len(before) == 0:
		for _, elt := range after {
			ops = append(ops, diff{true, elt, offset})
			offset++
		}
	case len(after) == 0:
		for _, item := range before {
			found := false
			for _, op := range ops {
				found = found || (op.elt > -1 && eq(item, op.elt))
			}
			if !found {
				ops = append(ops, diff{false, -1, offset})
			}
		}
	default:
		ops = chooseDiff(before, after, offset, ops, eq)
	}

	return ops
}

func filterItems(before, after []int, offset int, ops []diff, eq func(i, j int) bool) (before1, after1 []int, offset1 int) {
outer:
	for len(before) > 0 {
		if len(after) > 0 && eq(before[0], after[0]) {
			offset++
			before, after = before[1:], after[1:]
			continue
		}

		for _, op := range ops {
			if op.insert && eq(before[0], op.elt) {
				before = before[1:]
				continue outer
			}
		}
		break
	}

	return before, after, offset
}

func chooseDiff(before, after []int, offset int, ops []diff, eq func(i, j int) bool) []diff {
	// choice1 = clone of ops + delete first before elt
	choice1 := append(ops, diff{false, -1, offset})
	choice1 = bestDiff(before[1:], after, offset, choice1, eq)

	index := indexOf(before[0], after, eq)
	if index == -1 {
		return choice1
	}

	// choice2 = clone of ops + insert index after elts
	choice2 := append([]diff(nil), ops...)
	for kk := 0; kk < index; kk++ {
		choice2 = append(choice2, diff{true, after[kk], offset + kk})
	}
	choice2 = bestDiff(before[1:], after[index+1:], offset+index+1, choice2, eq)
	if len(choice1) < len(choice2) {
		return choice1
	}
	return choice2
}

func indexOf(elt int, elts []int, eq func(i, j int) bool) int {
	for kk, elt1 := range elts {
		if eq(elt, elt1) {
			return kk
		}
	}
	return -1
}
