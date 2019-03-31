// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package dom_test

import (
	"fmt"
	"testing"

	"github.com/dotchain/fuss/dom/v2"
)

func TestRun(t *testing.T) {
	run, close := dom.NewRun()
	text1, close1 := dom.NewTextView()
	text2, close2 := dom.NewTextView()

	cell1 := text1(1, dom.Styles{}, "one")
	cell2 := text2(2, dom.Styles{}, "two")

	elt := run("root", dom.Styles{Color: "red"}, cell1, cell2)

	if x := fmt.Sprint(elt); x != "<div style=\"color: red; display: flex; flex-direction: row\"><span>one</span><span>two</span></div>" {
		t.Error(x)
	}

	// cleanup
	close()
	close1()
	close2()
	reportDriverLeaks(t)
}

func TestVRun(t *testing.T) {
	vrun, close := dom.NewVRun()
	text1, close1 := dom.NewTextView()
	text2, close2 := dom.NewTextView()

	cell1 := text1(1, dom.Styles{}, "one")
	cell2 := text2(2, dom.Styles{}, "two")

	elt := vrun("root", dom.Styles{Color: "red"}, cell1, cell2)

	if x := fmt.Sprint(elt); x != "<div style=\"color: red; display: flex; flex-direction: column\"><span>one</span><span>two</span></div>" {
		t.Error(x)
	}

	// cleanup
	close()
	close1()
	close2()
	reportDriverLeaks(t)
}

func TestFixedStretch(t *testing.T) {
	vrun, close := dom.NewVRun()
	fixed1, close1 := dom.NewFixed()
	stretch2, close2 := dom.NewStretch()

	cell1 := fixed1(1, dom.Styles{})
	cell2 := stretch2(2, dom.Styles{})

	elt := vrun("root", dom.Styles{Color: "red"}, cell1, cell2)

	if x := fmt.Sprint(elt); x != "<div style=\"color: red; display: flex; flex-direction: column\"><div style=\"flex-shrink: 0\"></div><div style=\"flex-grow: 1\"></div></div>" {
		t.Error(x)
	}

	// cleanup
	close()
	close1()
	close2()
	reportDriverLeaks(t)
}
