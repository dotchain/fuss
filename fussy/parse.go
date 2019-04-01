// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package fussy

import (
	"fmt"
	"go/ast"
	"go/importer"
	"go/parser"
	"go/token"
	"go/types"
	"os"
	"strings"
)

// ParseDir parses the provided directory for the named package
// and returns the set of components associaated
func ParseDir(dir, pkg string, skipFiles []string) (*Info, error) {
	fset := token.NewFileSet()
	filter := func(f os.FileInfo) bool {
		n := f.Name()
		for _, skip := range skipFiles {
			if n == skip {
				return false
			}
		}
		return true
	}

	pkgs, err := parser.ParseDir(fset, dir, filter, parser.ParseComments)
	if err != nil {
		return nil, err
	}

	p := pkgs[pkg]
	if p == nil {
		return nil, fmt.Errorf("Could not find package %s", pkg)
	}

	files := []*ast.File{}
	for _, f := range p.Files {
		files = append(files, f)
	}

	// Not using importer.Default() because of issue:
	//   https://github.com/golang/go/issues/11415
	tracker := &errTracker{}
	conf := types.Config{Importer: importer.ForCompiler(fset, "source", nil), Error: tracker.Track}
	checkedPackage, err := conf.Check("", fset, files, nil)
	if err2 := tracker.Error(); err2 != nil && err != nil {
		return nil, err2
	}

	comps, imports, err := newParser(checkedPackage, files, fset).components()
	if err != nil {
		return nil, err
	}

	return &Info{Package: pkg, Components: comps, Imports: imports}, nil
}

type errTracker struct {
	errors []error
}

func (e *errTracker) Track(err error) {
	s := strings.ToLower(err.Error())
	if !strings.Contains(s, "undeclared name: new") {
		e.errors = append(e.errors, err)
	}
}

func (e *errTracker) Error() error {
	if len(e.errors) == 0 {
		return nil
	}
	return e.errors[0]
}
