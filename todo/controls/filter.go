// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package controls

import "github.com/dotchain/fuss/dom"

// Filter renders a checkbox with a label
func filter(c *filterCtx, done, active *dom.BoolStream) dom.Element {
	doneLabel, activeLabel := "Show Completed", "Show Incomplete"
	if done.Value {
		doneLabel = "Showing Completed"
	}

	if active.Value {
		activeLabel = "Showing Incomplete"
	}

	return c.dom.Run(
		"root",
		dom.Styles{},
		c.dom.CheckboxEdit("c1", dom.Styles{}, done, "done"),
		c.dom.LabelView("l1", dom.Styles{}, doneLabel, "done"),
		c.dom.CheckboxEdit("c2", dom.Styles{}, active, "notDone"),
		c.dom.LabelView("l2", dom.Styles{}, activeLabel, "notDone"),
	)
}
