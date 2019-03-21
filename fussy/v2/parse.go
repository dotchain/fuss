// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package fussy

import (
	"bytes"
	"fmt"
	"go/ast"
	"go/format"
	"go/importer"
	"go/parser"
	"go/token"
	"go/types"
	"log"
	"strings"
	"unicode"
)

// ParsePackage parses the provided directory for the named package
func ParseDir(dir, pkg string) (*Info, error) {
	fset := token.NewFileSet()
	pkgs, err := parser.ParseDir(fset, dir, nil, parser.ParseComments)
	if err != nil {
		return nil, err
	}
	p := pkgs[pkg]
	if p == nil {
		return nil, nil
	}

	info := &Info{Package: pkg}

	// Not using importer.Default() because of issue:
	//   https://github.com/golang/go/issues/11415
	conf := types.Config{Importer: importer.ForCompiler(fset, "source", nil)}
	files := []*ast.File{}
	for _, f := range p.Files {
		files = append(files, f)
	}

	findStruct := func(name string) *ast.StructType {
		for _, f := range files {
			for _, decl := range f.Decls {
				if gd, ok := decl.(*ast.GenDecl); ok {
					for _, spec := range gd.Specs {
						if ts, ok := spec.(*ast.TypeSpec); ok {
							if ts.Name.Name == name {
								s, _ := ts.Type.(*ast.StructType)
								return s
							}
						}
					}
				}
			}
		}
		return nil
	}

	findFieldType := func(structName, fieldName string) string {
		s := findStruct(structName)
		if s == nil {
			return ""
		}
		for _, f := range s.Fields.List {
			if f.Names == nil {
				continue
			}
			for _, name := range f.Names {
				if name.Name != fieldName {
					continue
				}
				if id, ok := f.Type.(*ast.Ident); ok {
					return id.Name
				}
				if sel, ok := f.Type.(*ast.SelectorExpr); ok {
					var b bytes.Buffer
					if err := format.Node(&b, fset, sel); err == nil {
						return b.String()
					}
				}
			}
		}
		return ""
	}

	normalizeType := func(s string) string {
		//  TODO: need to use transitive closure here and possibly cache
		for _, im := range info.Imports {
			path := im[1] + "."
			if !strings.Contains(path, "/") {
				continue
			}

			imported, err := conf.Importer.Import(im[1])
			if err != nil {
				continue
			}

			for idx := strings.Index(s, path); idx != -1; idx = strings.Index(s, path) {
				s = s[:idx] + imported.Name() + "." + s[idx+len(path):]
			}
		}
		return s
	}

	pp, err := conf.Check("", fset, files, nil)
	if err != nil {
		return nil, err
	}

	for _, im := range pp.Imports() {
		info.Imports = append(info.Imports, [2]string{"", im.Path()})
	}

	s := pp.Scope()
	for _, name := range s.Names() {
		if ci := componentInfo(s, name, true, findFieldType, normalizeType); ci != nil {
			info.Components = append(info.Components, *ci)
		}
	}

	return info, nil
}

func componentInfo(s *types.Scope, name string, subs bool, ff func(string, string) string, nt func(string) string) *ComponentInfo {
	o := s.Lookup(name)
	if tn, ok := o.(*types.TypeName); ok && tn.IsAlias() {
		return nil
	}

	fn, ok := s.Lookup(name).Type().(*types.Signature)
	if !ok || fn.Recv() != nil {
		return nil
	}

	ci := coreComponentInfo(s, name, fn, nt)
	if ci == nil || !subs {
		return ci
	}

	ptr, ok := fn.Params().At(0).Type().(*types.Pointer)
	if !ok {
		return nil
	}

	structName, ok := ptr.Elem().(*types.Named)
	if !ok {
		return nil
	}

	ctxType, ok := structName.Underlying().(*types.Struct)
	if !ok {
		return nil
	}

	for kk := 0; kk < ctxType.NumFields(); kk++ {
		field := ctxType.Field(kk)
		ft := ff(structName.Obj().Name(), field.Name())
		if !strings.HasSuffix(ft, "Func") {
			return nil
		}
		ft = ft[:len(ft)-4]
		inner := coreComponentInfo(s, ft, field.Type().(*types.Signature), nt)
		if inner == nil {
			return nil
		}
		sub := SubComponentInfo{LocalName: field.Name(), ComponentInfo: *inner}
		ci.Subs = append(ci.Subs, sub)
	}
	return ci
}

func coreComponentInfo(s *types.Scope, name string, fn *types.Signature, nt func(string) string) *ComponentInfo {
	if fn.Recv() != nil {
		return nil
	}

	fName := name + "Func"
	ctor := ""
	if strings.Contains(name, ".") {
		parts := strings.SplitN(name, ".", 2)
		ctor = parts[0] + ".New" + parts[1]
	} else {
		decl := s.Lookup(fName)
		if decl == nil {
			fName = strings.Title(fName)
			decl = s.Lookup(fName)
		}
		if decl == nil {
			return nil
		}
		if strings.Title(fName) == fName {
			ctor = "New" + fName[:len(fName)-4]
		} else {
			ctor = "new" + fName[:len(fName)-4]
		}
	}

	stateArgs := []ArgInfo{}
	ci := &ComponentInfo{Name: name, Type: fName, Ctor: ctor}
	for kk := 0; kk < fn.Params().Len(); kk++ {
		arg := fn.Params().At(kk)
		ai := ArgInfo{Name: arg.Name(), Type: nt(arg.Type().String())}
		if ai.IsState = isStateArg(ai.Name); ai.IsState {
			stateArgs = append(stateArgs, ai)
		}

		ci.Args = append(ci.Args, ai)
	}

	for kk := 0; kk < fn.Results().Len(); kk++ {
		arg := fn.Results().At(kk)
		ai := ArgInfo{Name: arg.Name(), Type: nt(arg.Type().String())}
		if ai.Name == "" {
			ai.Name = fmt.Sprintf("result%d", kk+1)
		}
		for jj := 0; jj < len(stateArgs); jj++ {
			if stateArgs[jj].Type == ai.Type {
				ai.IsState = true
				copy(stateArgs[jj:], stateArgs[jj+1:])
				stateArgs = stateArgs[:len(stateArgs)-1]
				break
			}
		}
		ci.Results = append(ci.Results, ai)
	}

	if len(stateArgs) != 0 {
		log.Println("Unmatched state", ci.Name, stateArgs[0].Name)
		return nil
	}
	return ci
}

func isStateArg(s string) bool {
	r := []rune(s)
	for len(r) > 0 && unicode.IsDigit(r[len(r)-1]) {
		r = r[:len(r)-1]
	}
	s = string(r)
	return s == "state" || strings.HasSuffix(s, "State")
}
