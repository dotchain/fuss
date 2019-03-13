// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package controls

import "github.com/dotchain/fuss/dom"

const (
	// ShowAll = show both active and done
	ShowAll = "all"

	// ShowActive = show only active
	ShowActive = "active"

	// ShowDone = show only done
	ShowDone = "done"
)

// Filter renders a row of options for "All", "Active" or "Done"
//
// This is reflected in the selected stream (which is both input and output).
func filter(c *filterCtx, selected, focusedState *dom.FocusTrackerStream) (*dom.FocusTrackerStream, dom.Element) {
	if focusedState == nil {
		focusedState = dom.NewFocusTrackerStream(dom.FocusTracker{})
	}

	// get the sub streams
	allF, allS := focusedState.Substream(c.Cache, ShowAll), selected.Substream(c.Cache, ShowAll)
	activeF, activeS := focusedState.Substream(c.Cache, ShowActive), selected.Substream(c.Cache, ShowActive)
	doneF, doneS := focusedState.Substream(c.Cache, ShowDone), selected.Substream(c.Cache, ShowDone)

	regular := dom.Styles{Borders: dom.Borders{Color: "lightgrey", Width: dom.Size{Pixels: 1}, Radius: dom.Size{Pixels: 4}}}
	highlight := regular
	highlight.Borders.Color = "blue"

	all, active, done := regular, regular, regular
	switch selected.Value.Current {
	case ShowAll:
		all = highlight
	case ShowActive:
		active = highlight
	case ShowDone:
		done = highlight
	}

	return focusedState, c.dom.Run(
		"root",
		dom.Styles{},
		c.dom.Focusable("all", allF, allS, c.dom.LabelView("all", all, "All", "")),
		c.dom.Focusable("active", activeF, activeS, c.dom.LabelView("active", active, "Active", "")),
		c.dom.Focusable("done", doneF, doneS, c.dom.LabelView("done", done, "Done", "")),
	)
}
