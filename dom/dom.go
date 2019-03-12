// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

// Package dom provides basic UX controls in FUSS
package dom

import "strconv"

// Driver represents the interface to be implemented by drivers. This
// allows testing in non-browser environments
type Driver interface {
	NewElement(props Props, children ...Element) Element
}

// NewElement creates a new element using the registered driver.
//
// While the children can be specified here, they can also be modified
// via AddChild/RemoveChild APIs
func NewElement(props Props, children ...Element) Element {
	return driver.NewElement(props, children...)
}

// Element represents a raw DOM element to be implemented by a
// driver
type Element interface {
	// SetProp updates the prop to the provided value
	SetProp(key string, value interface{})

	// Value is the equivalent of HTMLInputElement.value
	Value() string

	// Children returns a readonly slice of children
	Children() []Element

	// RemoveChild remove a child element at the provided index
	RemoveChild(index int)

	// InsertChild inserts a child element at the provided index
	InsertChild(index int, elt Element)

	// Close releases any resources held by this resource
	Close()
}

// Size represents a string, percent or numeric values. If an explicit
// zero value is needed, it is best to use the string form
type Size struct {
	Raw     string
	Percent float32
	Pixels  float32
	Em      float32
	En      float32
}

// String converts Size to a string form
func (s Size) String() string {
	var f float32

	suffix := ""
	switch {
	case s.Percent > 0:
		f, suffix = s.Percent, "%"
	case s.Pixels > 0:
		f, suffix = s.Pixels, "px"
	case s.Em > 0:
		f, suffix = s.Em, "em"
	case s.En > 0:
		f, suffix = s.En, "en"
	}

	if f == 0 {
		return s.Raw
	}

	return strconv.FormatFloat(float64(f), 'f', -1, 32) + suffix
}

// FlexNone should be used for a zero grow/shrink
const FlexNone = -1

// Direction represents a Row or Column direction
type Direction int

// All the valid directions
const (
	Row Direction = iota + 1
	Column
	RowReverse
	ColumnReverse
)

// String returns the string version of Direction
func (d Direction) String() string {
	switch d {
	case Row:
		return "row"
	case Column:
		return "column"
	case RowReverse:
		return "row-reverse"
	case ColumnReverse:
		return "column-reverse"
	}
	return ""
}

// Styles represents a set of CSS Styles
type Styles struct {
	Color                string
	Width, Height        Size
	OverflowX, OverflowY string
	FlexDirection        Direction

	// FlexGrow and FlexShrink should not be set to zero.
	// For actual zero value, use FlexNone instead
	FlexGrow, FlexShrink int
}

// String converts style to "CSS" text
func (s Styles) String() string {
	entries := [][2]string{
		{"color", s.Color},
		{"width", s.Width.String()},
		{"height", s.Height.String()},
		{"overflow-x", s.OverflowX},
		{"overflow-y", s.OverflowY},
	}

	if dir := s.FlexDirection.String(); dir != "" {
		entries = append(entries, [][2]string{
			{"display", "flex"},
			{"flex-direction", dir},
		}...)
	}

	flex := func(i int) string {
		switch {
		case i < 0:
			return "0"
		case i == 0:
			return ""
		default:
			return strconv.FormatInt(int64(i), 10)
		}
	}

	entries = append(entries, [][2]string{
		{"flex-grow", flex(s.FlexGrow)},
		{"flex-shrink", flex(s.FlexShrink)},
	}...)

	result := ""
	for _, pair := range entries {
		if pair[1] == "" {
			continue
		}
		if result != "" {
			result += "; "
		}
		result += pair[0] + ": " + pair[1]
	}

	return result
}

// Props represents the props of an element
type Props struct {
	Styles
	Tag         string
	Checked     bool
	Type        string
	TextContent string
	ID          string
	For         string
	Href        string
	OnChange    *EventHandler
	OnClick     *EventHandler
}

// ToMap returns the map version of props (useful for diffs)
func (p Props) ToMap() map[string]interface{} {
	return map[string]interface{}{
		"ID":          p.ID,
		"For":         p.For,
		"Tag":         p.Tag,
		"Href":        p.Href,
		"Checked":     p.Checked,
		"Type":        p.Type,
		"TextContent": p.TextContent,
		"Styles":      p.Styles,
		"OnChange":    p.OnChange,
		"OnClick":     p.OnClick,
	}
}

// EventHandler is struct to hold a callback function
//
// This is needed simply to make Props be comparable (which makes it
// easier to see if anything has changed)
type EventHandler struct {
	Handle func(Event)
}

// RegisterDriver allows drivers to register their concrete
// implementation
func RegisterDriver(d Driver) (old Driver) {
	old, driver = driver, d
	return old
}

var driver Driver

// Event is not yet implemented
type Event struct{}
