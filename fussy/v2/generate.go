// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package fussy

import (
	"bytes"
	"fmt"
	"go/format"
	"golang.org/x/tools/imports"
	"strings"
)

// Info contains all the info needed to generate code
type Info struct {
	// Generator indicates the raw code which generates this
	Generator  string
	Package    string
	Imports    [][2]string
	Streams    []StreamInfo
	Components []ComponentInfo
}

// StreamInfo holds the information to generate a single stream type
type StreamInfo struct {
	StreamType       string
	ValueType        string
	Fields           []FieldInfo
	EntryStreamType  string
	EntryConstructor string
}

// Generate generates the code needed to deal with a stream
func (s *StreamInfo) Generate() string {
	var result bytes.Buffer
	must(streamTpl.Execute(&result, s))
	for _, f := range s.Fields {
		var data struct {
			*StreamInfo
			*FieldInfo
		}
		data.StreamInfo = s
		data.FieldInfo = &f
		must(fieldTpl.Execute(&result, data))
	}

	if s.EntryStreamType != "" {
		must(entryTpl.Execute(&result, s))
	}

	return result.String()
}

// FieldInfo holds info on individual substream fields of the base stream
type FieldInfo struct {
	Field            string
	FieldType        string
	FieldStreamType  string
	FieldConstructor string
	FieldSubstream   string
}

// Generate returns the source code generated from the provided info
func Generate(info Info) string {
	var result bytes.Buffer
	must(headerTpl.Execute(&result, info))
	r := result.String()
	for _, s := range info.Streams {
		r += "\n" + s.Generate()
	}

	var comp bytes.Buffer
	must(componentsTpl.Execute(&comp, info))
	r += comp.String()

	p, err := format.Source([]byte(r))
	if err != nil {
		fmt.Println(r)
	}
	must(err)

	p, err = imports.Process("compiled.go", p, nil)
	must(err)

	return string(p)
}

// ParamInfo has info about arguments
type ParamInfo struct {
	Name, Type string
}

// ResultInfo has info about return values
type ResultInfo struct {
	Name, Type string
}

// ArgInfo holds func arg related info
type ArgInfo struct {
	Name, Type string
	IsState    bool
}

// SubComponentInfo holds sub-component related info
type SubComponentInfo struct {
	LocalName string
	ComponentInfo
}

// ComponentInfo holds info related to a component
type ComponentInfo struct {
	Name, Type    string
	Ctor          string
	Args, Results []ArgInfo
	Subs          []SubComponentInfo
}

// NonContextArgsArgs returns the list of non-context args, including state
func (c *ComponentInfo) NonContextArgsArray() []ArgInfo {
	return c.Args[1:]
}

// PublicArgsDecl returns all public args and types
func (c *ComponentInfo) PublicArgsDecl() string {
	result := []string{}
	for kk, a := range c.Args {
		tt := "interface{}"
		if kk > 0 {
			tt = a.Type
		}
		if !a.IsState {
			result = append(result, a.Name+" "+tt)
		}
	}
	return strings.Join(result, ",")
}

// PublicResultsDecl returns all public return values and their types
func (c *ComponentInfo) PublicResultsDecl() string {
	result := []string{}
	for _, a := range c.Results {
		if !a.IsState {
			result = append(result, a.Name+" "+a.Type)
		}
	}
	if len(result) > 0 {
		return "(" + strings.Join(result, ",") + ")"
	}
	return strings.Join(result, ",")
}

// ContextName returns the name of the context arg
func (c *ComponentInfo) ContextName() string {
	return c.Args[0].Name
}

// ContextType returns the name of the context arg
func (c *ComponentInfo) ContextType() string {
	return c.Args[0].Type[1:]
}

// PublicArgs returns a list of all public args
func (c *ComponentInfo) PublicArgs() string {
	result := []string{}
	for _, a := range c.Args {
		if !a.IsState {
			result = append(result, a.Name)
		}
	}
	return strings.Join(result, ",")
}

// LastPublicResults returns all the public results but prefixed with last
func (c *ComponentInfo) LastPublicResults() string {
	result := []string{}
	for _, a := range c.Results {
		if !a.IsState {
			result = append(result, "last"+a.Name)
		}
	}
	return strings.Join(result, ",")
}

// PublicResultsArray returns the non-state resultss
func (c *ComponentInfo) PublicResultsArray() []ArgInfo {
	result := []ArgInfo{}
	for _, a := range c.Results {
		if !a.IsState {
			result = append(result, a)
		}
	}
	return result
}

// PublicArgsArray returns all non-state args
func (c *ComponentInfo) PublicArgsArray() []ArgInfo {
	result := []ArgInfo{}
	for kk, a := range c.Args {
		if kk > 0 && !a.IsState {
			result = append(result, a)
		}
	}
	return result
}

// Invoke builds the "invocation" line
func (c *ComponentInfo) Invoke() string {
	results, args := []string{}, []string{}
	for _, a := range c.Results {
		results = append(results, "last"+a.Name)
	}
	idx := 0
	for kk, a := range c.Args {
		name := a.Name
		if kk == 0 {
			name = name + "Local"
		} else if a.IsState {
			lIdx := 0
			for _, r := range c.Results {
				if !r.IsState {
					continue
				}
				if lIdx == idx {
					idx++
					name = "last" + r.Name
					break
				}
				lIdx++
			}
		}
		args = append(args, name)
	}

	prefix := ""
	if len(results) > 0 {
		prefix = strings.Join(results, ", ") + "="
	}
	return prefix + c.Name + "(" + strings.Join(args, ", ") + ")"
}

func must(err error) {
	if err != nil {
		panic(err)
	}
}
