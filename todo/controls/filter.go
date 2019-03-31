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
func filter(c *filterCtx, selected *dom.TextStream) dom.Element {
	return c.dom.Run(
		"root",
		dom.Styles{},
		c.FilterOption("all", selected, ShowAll),
		c.FilterOption("active", selected, ShowActive),
		c.FilterOption("done", selected, ShowDone),
	)
}

// FilterOption renders a filter option as a focusable which when
// clicked will automatically append the provided key to the selected
// stream.
func filterOption(c *filterOptionCtx, selected *dom.TextStream, key string) dom.Element {
	h := &dom.EventHandler{Handle: func(e dom.Event) {
		if e.Value() == "click" {
			selected = selected.Append(nil, key, true)
		}
	}}

	styles := dom.Styles{Borders: dom.Borders{Color: "lightgrey", Width: dom.Size{Pixels: 1}, Radius: dom.Size{Pixels: 4}}}
	if selected.Value == key {
		styles.Borders.Color = "blue"
	}
	label := filterLabels[key]

	return c.dom.Focusable("root", h, c.dom.LabelView(key, styles, label, ""))
}

var filterLabels = map[string]string{ShowAll: "All", ShowActive: "Active", ShowDone: "Done"}
