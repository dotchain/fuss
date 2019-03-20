// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package fussy

import (
	"go/ast"
	"go/importer"
	"go/parser"
	"go/token"
	"go/types"
	"sort"
	"strings"
	"unicode"
)

// ParsePackage parses the provided directory for the named package
func ParseDir(dir, pkg string) (*Info, error) {
	fset := token.NewFileSet()
	pkgs, err := parser.ParseDir(fset, dir, nil, 0)
	if err != nil {
		return nil, err
	}
	p := pkgs[pkg]
	if p == nil {
		return nil, nil
	}

	info := &Info{Package: pkg}

	ids := []string{}
	for id := range p.Imports {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	for _, id := range ids {
		path := p.Imports[id].Decl.(*ast.ImportSpec).Path.Value
		im := [2]string{id, path[1 : len(path)-2]}
		info.Imports = append(info.Imports, im)
	}

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
			}
		}
		return ""
	}

	pp, err := conf.Check("", fset, files, nil)
	if err != nil {
		return nil, err
	}

	s := pp.Scope()
	for _, name := range s.Names() {
		if ci := componentInfo(s, name, true, findFieldType); ci != nil {
			info.Components = append(info.Components, *ci)
		}
	}

	return info, nil
}

func componentInfo(s *types.Scope, name string, subs bool, ff func(string, string) string) *ComponentInfo {
	o := s.Lookup(name)
	if tn, ok := o.(*types.TypeName); ok && tn.IsAlias() {
		return nil
	}

	fn, ok := s.Lookup(name).Type().(*types.Signature)
	if !ok || fn.Recv() != nil {
		return nil
	}

	ci := coreComponentInfo(s, name, fn)
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
		inner := coreComponentInfo(s, ft, field.Type().(*types.Signature))
		if inner == nil {
			return nil
		}
		sub := SubComponentInfo{LocalName: field.Name(), ComponentInfo: *inner}
		ci.Subs = append(ci.Subs, sub)
	}
	return ci
}

func coreComponentInfo(s *types.Scope, name string, fn *types.Signature) *ComponentInfo {
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
	ci := &ComponentInfo{Name: name, Type: fName, Ctor: ctor}
	for kk := 0; kk < fn.Params().Len(); kk++ {
		arg := fn.Params().At(kk)
		ai := ArgInfo{Name: arg.Name(), Type: arg.Type().String()}
		ai.IsState = isStateArg(ai.Name)
		ci.Args = append(ci.Args, ai)
	}

	for kk := 0; kk < fn.Results().Len(); kk++ {
		arg := fn.Results().At(kk)
		ai := ArgInfo{Name: arg.Name(), Type: arg.Type().String()}
		ai.IsState = isStateArg(ai.Name)
		ci.Results = append(ci.Results, ai)
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
