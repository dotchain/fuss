// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

// Package dom provides basic UX controls in FUSS
package dom

//go:generate go run codegen.go
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

// Border represents a single border info
type Border struct {
	Width Size
	Color string
}

// Borders represents all borders
type Borders struct {
	Raw                      string
	Radius                   Size
	Width                    Size
	Color                    string
	Style                    string
	Left, Right, Top, Bottom Border
}

// Margins represents all margins
type Margins struct {
	Raw                      string
	Left, Right, Top, Bottom Size
}

// Padding represents all padding
type Padding struct {
	Raw                      string
	Left, Right, Top, Bottom Size
}

// BoxShadow configures box shadow
type BoxShadow struct {
	OffsetX, OffsetY         Size
	BlurRadius, SpreadRadius Size
	Color                    string
}

// String returns a stringified version of the box shadow
func (b BoxShadow) String() string {
	if b == (BoxShadow{}) {
		return ""
	}
	result := b.OffsetX.String() + " " + b.OffsetY.String() + " "
	result += b.BlurRadius.String() + " " + b.SpreadRadius.String()
	result += " " + b.Color
	return result
}

// BoxShadows implements multiple box shadow elements
type BoxShadows struct {
	B1, B2, B3, B4, B5 BoxShadow
}

// String returns a stringified version of the box shadow
func (b BoxShadows) String() string {
	result := ""
	if x := b.B1.String(); x != "" {
		result = x
	}
	if x := b.B2.String(); x != "" {
		result += " " + x
	}
	if x := b.B3.String(); x != "" {
		result += " " + x
	}
	if x := b.B4.String(); x != "" {
		result += " " + x
	}
	return result
}

// Background configures the background css property
type Background struct {
	Color string
}

// Styles represents a set of CSS Styles
type Styles struct {
	Background           Background
	Color                string
	Width, Height        Size
	OverflowX, OverflowY string
	Borders              Borders
	Margins              Margins
	Padding              Padding
	AlignItems           string // TODO add enum
	TextAlign            string // TODO add enum
	BoxShadows           BoxShadows
	FlexDirection        Direction

	// FlexGrow and FlexShrink should not be set to zero.
	// For actual zero value, use FlexNone instead
	FlexGrow, FlexShrink int
}

// String converts style to "CSS" text
func (s Styles) String() string {
	entries := [][2]string{
		{"align-items", s.AlignItems},
		{"text-align", s.TextAlign},
		{"background-color", s.Background.Color},
		{"color", s.Color},
		{"width", s.Width.String()},
		{"height", s.Height.String()},
		{"overflow-x", s.OverflowX},
		{"overflow-y", s.OverflowY},
		{"border", s.Borders.Raw},
		{"border-radius", s.Borders.Radius.String()},
		{"border-color", s.Borders.Color},
		{"border-style", s.Borders.Style},
		{"border-width", s.Borders.Width.String()},
		{"border-left-color", s.Borders.Left.Color},
		{"border-left-width", s.Borders.Left.Width.String()},
		{"border-right-color", s.Borders.Right.Color},
		{"border-right-width", s.Borders.Right.Width.String()},
		{"border-top-color", s.Borders.Top.Color},
		{"border-top-width", s.Borders.Top.Width.String()},
		{"border-bottom-color", s.Borders.Bottom.Color},
		{"border-bottom-width", s.Borders.Bottom.Width.String()},
		{"margin", s.Margins.Raw},
		{"margin-left", s.Margins.Left.String()},
		{"margin-right", s.Margins.Right.String()},
		{"margin-top", s.Margins.Top.String()},
		{"margin-bottom", s.Margins.Bottom.String()},
		{"padding", s.Padding.Raw},
		{"padding-left", s.Padding.Left.String()},
		{"padding-right", s.Padding.Right.String()},
		{"padding-top", s.Padding.Top.String()},
		{"padding-bottom", s.Padding.Bottom.String()},
		{"box-shadow", s.BoxShadows.String()},
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
	Src         string
	Placeholder string
	OnChange    *EventHandler
	OnClick     *EventHandler
	OnFocus     *EventHandler
	OnInput     *EventHandler
}

// ToMap returns the map version of props (useful for diffs)
func (p Props) ToMap() map[string]interface{} {
	result := map[string]interface{}{
		"ID":          p.ID,
		"For":         p.For,
		"Tag":         p.Tag,
		"Href":        p.Href,
		"Checked":     p.Checked,
		"Placeholder": p.Placeholder,
		"Src":         p.Src,
		"Type":        p.Type,
		"TextContent": p.TextContent,
		"Styles":      p.Styles,
		"OnChange":    p.OnChange,
		"OnClick":     p.OnClick,
		"OnFocus":     p.OnFocus,
		"OnInput":     p.OnInput,
	}
	if p.OnFocus != nil && p.Tag != "input" && p.Tag != "button" {
		result["TabIndex"] = "0"
	}
	return result
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

// Event is to be implemennted by the driver
type Event interface {
	// CreatedEpochNano is the time when the event fired in UnixNano
	EpochNano() int64

	// Value is applicable for input/change events only
	// TODO: migrate this to a ChangeEvent interface
	Value() string
}
