// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

// Package dom provides basic UX controls in FUSS
package dom

import v2dom "github.com/dotchain/fuss/dom/v2"

// Driver is aliased to v2
type Driver = v2dom.Driver

// NewElement creates a new element using the registered driver.
//
// While the children can be specified here, they can also be modified
// via AddChild/RemoveChild APIs
func NewElement(props Props, children ...Element) Element {
	return driver.NewElement(props, children...)
}

// Element is aliased to v2 element
type Element = v2dom.Element

// Size is aliased to v2 size
type Size = v2dom.Size

// FlexNone should be used for a zero grow/shrink
const FlexNone = -1

// Direction represents a Row or Column direction
type Direction = v2dom.Direction

// All the valid directions
const (
	Row Direction = iota + 1
	Column
	RowReverse
	ColumnReverse
)

// Border represents a single border info
type Border =  v2dom.Border

// Borders represents all borders
type Borders = v2dom.Borders

// Styles represents a set of CSS Styles
type Styles = v2dom.Styles


// Props represents the props of an element
type Props = v2dom.Props

// EventHandler is struct to hold a callback function
//
// This is needed simply to make Props be comparable (which makes it
// easier to see if anything has changed)
type EventHandler = v2dom.EventHandler

// RegisterDriver allows drivers to register their concrete
// implementation
func RegisterDriver(d Driver) Driver {
	var old Driver
	v2dom.RegisterDriver(d)
	old, driver = driver, d
	return old
}

var driver Driver

// Event is to be implemennted by the driver
type Event = v2dom.Event

