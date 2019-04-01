// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package controls

import (
	"github.com/dotchain/dot/streams"
	"github.com/dotchain/fuss/dom/v2"
)

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
func filter(deps *filterDeps, selected *streams.S16) dom.Element {
	return deps.run(
		"root",
		dom.Styles{},
		deps.filterOption("all", selected, ShowAll),
		deps.filterOption("active", selected, ShowActive),
		deps.filterOption("done", selected, ShowDone),
	)
}

type FilterFunc = func(key interface{}, selected *streams.S16) dom.Element
type filterDeps struct {
	run          dom.RunFunc
	filterOption filterOptionFunc
}

// filterOption renders a filter option as a focusable which when
// clicked will automatically append the provided key to the selected
// stream.
func filterOption(deps *filterOptionDeps, selected *streams.S16, key string) dom.Element {
	h := &dom.EventHandler{Handle: func(e dom.Event) {
		if e.Value() == "click" {
			selected = selected.Update(key)
		}
	}}

	styles := dom.Styles{Borders: dom.Borders{Color: "lightgrey", Width: dom.Size{Pixels: 1}, Radius: dom.Size{Pixels: 4}}}
	if selected.Value == key {
		styles.Borders.Color = "blue"
	}
	label := filterLabels[key]

	return deps.focusable("root", h, deps.labelView(key, styles, label, ""))
}

type filterOptionFunc = func(key interface{}, selected *streams.S16, s string) dom.Element
type filterOptionDeps struct {
	focusable dom.FocusableFunc
	labelView dom.LabelViewFunc
}

var filterLabels = map[string]string{ShowAll: "All", ShowActive: "Active", ShowDone: "Done"}
