// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

// Package dom provides basic UX controls in FUSS
package dom

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

// Styles represents a set of CSS Styles
type Styles struct {
	Color string
}

// ToCSS converts style to "CSS" text
func (s Styles) ToCSS() string {
	if s.Color == "" {
		return ""
	}

	return "color: " + s.Color
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
	OnChange    *EventHandler
	OnClick     *EventHandler
}

// ToMap returns the map version of props (useful for diffs)
func (p Props) ToMap() map[string]interface{} {
	return map[string]interface{}{
		"ID":          p.ID,
		"For":         p.For,
		"Tag":         p.Tag,
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
