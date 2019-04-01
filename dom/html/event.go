// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package html

import (
	"time"

	"github.com/dotchain/fuss/dom"
)

type event struct {
	value string
	epoch int64
}

func newEvent(e element, name string) dom.Event {
	epoch := time.Now().UnixNano()

	if e.Node.Data != "input" {
		return &event{name, epoch}
	}

	checked := "off"
	var val *string
	inputType := ""
	for _, a := range e.Node.Attr {
		switch a.Key {
		case "checked":
			checked = "on"
		case "value":
			val = &a.Val
		case "type":
			inputType = a.Val
		}
	}

	if inputType == "checkbox" {
		return &event{checked, epoch}
	}

	if val != nil {
		return &event{*val, epoch}
	}

	if e.Node.FirstChild != nil {
		return &event{e.Node.FirstChild.Data, epoch}
	}

	return &event{"", epoch}
}

func (e *event) Value() string {
	return e.value
}

func (e *event) EpochNano() int64 {
	return e.epoch
}
