// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package fussy

import "strings"

// Info contains all the info needed to generate code
type Info struct {
	// Generator indicates the raw code which generates this
	Generator  string
	Package    string
	Imports    [][2]string
	Components []ComponentInfo
}

// ComponentInfo holds info related to a component
type ComponentInfo struct {
	Name, Type    string
	Ctor          string
	Args, Results []ArgInfo
	Variadic      bool
	Subs          []SubComponentInfo
}

// SubComponentInfo holds sub-component related info
type SubComponentInfo struct {
	LocalName string
	ComponentInfo
}

// ArgInfo holds func arg related info
type ArgInfo struct {
	Name, Type       string
	IsState          bool
	ImplementsEquals bool
	ImplementsEvents bool
	ImplementsClose  bool
}

// NonContextArgsArgs returns the list of non-context args, including state
func (c *ComponentInfo) NonContextArgsArray() []ArgInfo {
	return c.Args[1:]
}

// EventedStateArgs returns all state args that implement events
func (c *ComponentInfo) EventedStateArgs() []ArgInfo {
	result := []ArgInfo{}
	for kk, a := range c.Args {
		if kk > 0 && a.IsState && a.ImplementsEvents {
			result = append(result, a)
		}
	}
	return result
}

// PublicArgsDecl returns all public args and types
func (c *ComponentInfo) PublicArgsDecl() string {
	result := []string{}
	for kk, a := range c.Args {
		tt := "interface{}"
		if kk > 0 {
			tt = a.Type
		}
		if c.Variadic && kk == len(c.Args)-1 {
			tt = "..." + tt[2:]
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
	for kk, a := range c.Args {
		n := a.Name
		if c.Variadic && kk == len(c.Args)-1 {
			n += "..."
		}
		if !a.IsState {
			result = append(result, n)
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

// PublicArgsArrayEqualsNotNilable returns all non-state args
// implementing Equals
func (c *ComponentInfo) PublicArgsArrayEquals() []ArgInfo {
	result := []ArgInfo{}
	for kk, a := range c.Args {
		if kk > 0 && !a.IsState && a.ImplementsEquals {
			result = append(result, a)
		}
	}
	return result
}

// LastArg returns the last arg
func (c *ComponentInfo) LastArg() ArgInfo {
	return c.Args[len(c.Args)-1]
}

// PublicArgsArrayOther returns all non-state args which don't
// implement equals
func (c *ComponentInfo) PublicArgsArrayOther() []ArgInfo {
	result := []ArgInfo{}
	for kk, a := range c.Args {
		if c.Variadic && kk == len(c.Args)-1 {
			continue
		}
		if kk > 0 && !a.IsState && !a.ImplementsEquals {
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

		if c.Variadic && kk == len(c.Args)-1 {
			name += "..."
		}

		args = append(args, name)
	}

	prefix := ""
	if len(results) > 0 {
		prefix = strings.Join(results, ", ") + "="
	}
	return prefix + c.Name + "(" + strings.Join(args, ", ") + ")"
}
