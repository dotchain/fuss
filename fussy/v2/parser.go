// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package fussy

import (
	"bytes"
	"fmt"
	"go/ast"
	"go/format"
	"go/token"
	"go/types"
	"log"
	"sort"
	"strconv"
	"strings"
	"unicode"
)

func newParser(pkg *types.Package, files []*ast.File, fset *token.FileSet) *parse {
	return &parse{Package: pkg, Scope: pkg.Scope(), files: files, fset: fset}
}

type parse struct {
	*types.Package
	*types.Scope
	files   []*ast.File
	fset    *token.FileSet
	imports map[*types.Package]string
	eq      *types.Interface
}

func (p *parse) components() ([]ComponentInfo, [][2]string, error) {
	comps := []ComponentInfo{}

	for _, name := range p.Names() {
		ci, err := p.fullComponent(name)
		if err != nil {
			return nil, nil, err
		}
		if ci != nil {
			comps = append(comps, *ci)
		}
	}

	names := []string{}
	paths := map[string]string{}
	for pkg, name := range p.imports {
		if name != "" {
			names = append(names, name)
			paths[name] = pkg.Path()
		}
	}
	sort.Strings(names)
	imports := [][2]string{}
	for _, name := range names {
		imports = append(imports, [2]string{name, paths[name]})
	}
	return comps, imports, nil
}

func (p *parse) fullComponent(name string) (*ComponentInfo, error) {
	fn, ok := p.Lookup(name).Type().(*types.Signature)
	if !ok || fn.Recv() != nil {
		return nil, nil
	}

	ci, err := p.component(name, fn)
	if ci == nil || err != nil {
		return ci, err
	}

	ci.Subs, err = p.subComponents(name, fn)
	if err != nil {
		log.Println("Skipping", name, err)
		return nil, nil
	}

	return ci, nil
}

func (p *parse) subComponents(name string, fn *types.Signature) ([]SubComponentInfo, error) {
	if fn.Params().Len() == 0 {
		return nil, fmt.Errorf("%s does not have any args", name)
	}

	ptr, ok := fn.Params().At(0).Type().(*types.Pointer)
	if !ok {
		return nil, fmt.Errorf("%s: context should be a pointer type", name)
	}

	structName, ok := ptr.Elem().(*types.Named)
	if !ok {
		return nil, fmt.Errorf("%s: context should point to a named struct", name)
	}

	typ, ok := structName.Underlying().(*types.Struct)
	if !ok {
		return nil, fmt.Errorf("%s: context should point to a named struct", name)
	}

	subs := []SubComponentInfo{}
	for kk := 0; kk < typ.NumFields(); kk++ {
		field := typ.Field(kk)
		ft := p.getFieldType(structName.Obj().Name(), field.Name())
		if !strings.HasSuffix(ft, "Func") {
			return nil, fmt.Errorf("%s has invalid field %s", structName.Obj().Name(), field.Name())
		}
		ft = ft[:len(ft)-4]

		inner, err := p.component(ft, field.Type().(*types.Signature))
		if err != nil {
			return nil, err
		}
		if inner == nil {
			return nil, fmt.Errorf("Could not locate sub-component %sFunc", ft)
		}

		sub := SubComponentInfo{LocalName: field.Name(), ComponentInfo: *inner}
		subs = append(subs, sub)
	}
	return subs, nil
}

func (p *parse) component(name string, fn *types.Signature) (*ComponentInfo, error) {
	if fn.Recv() != nil {
		return nil, nil
	}

	ctor := p.constructor(name)
	if ctor == "" {
		return nil, nil
	}
	fName := strings.Replace(ctor, "New", "", 1) + "Func"

	stateArgs := []ArgInfo{}
	ci := &ComponentInfo{Name: name, Type: fName, Ctor: ctor}
	for kk := 0; kk < fn.Params().Len(); kk++ {
		ci.Args = append(ci.Args, p.argInfo(fn.Params().At(kk)))
		if ci.Args[kk].IsState {
			stateArgs = append(stateArgs, ci.Args[kk])
		}
	}

	seen := 0
	for kk := 0; kk < fn.Results().Len(); kk++ {
		arg := fn.Results().At(kk)
		typs := types.TypeString(arg.Type(), p.qualify)
		ai := ArgInfo{Name: arg.Name(), Type: typs}
		for jj := 0; jj < len(stateArgs); jj++ {
			if stateArgs[jj].Type == ai.Type {
				ai.IsState = true
				ai.Name = stateArgs[jj].Name
				copy(stateArgs[jj:], stateArgs[jj+1:])
				stateArgs = stateArgs[:len(stateArgs)-1]
				break
			}
		}
		if ai.Name == "" {
			ai.Name = p.uniqueName("result", seen)
			seen++
		}
		ci.Results = append(ci.Results, ai)
	}

	if len(stateArgs) != 0 {
		return nil, fmt.Errorf("Unmatched state %s(..%s..)", ci.Name, stateArgs[0].Name)
	}
	return ci, nil
}

func (p *parse) constructor(name string) string {
	if idx := strings.LastIndex(name, "."); idx >= 0 {
		return name[:idx+1] + "New" + name[idx+1:]
	}
	decl := p.Lookup(name + "Func")
	if decl == nil {
		decl = p.Lookup(strings.Title(name + "Func"))
	}
	if decl == nil {
		return ""
	}

	prefix := p.qualify(decl.Pkg())
	if prefix != "" {
		prefix += "."
	}
	name = decl.Name()
	if decl.Exported() {
		return prefix + "New" + name[:len(name)-4]
	}
	return prefix + "new" + name[:len(name)-4]
}

func (p *parse) isStateArg(s string) bool {
	r := []rune(s)
	for len(r) > 0 && unicode.IsDigit(r[len(r)-1]) {
		r = r[:len(r)-1]
	}
	s = string(r)
	return s == "state" || strings.HasSuffix(s, "State")
}

func (p *parse) argInfo(arg *types.Var) ArgInfo {
	name, typ := arg.Name(), arg.Type()
	eq := types.Implements(typ, p.equals())
	isState := p.isStateArg(name)
	typs := types.TypeString(typ, p.qualify)
	if !eq && !types.Comparable(typ) {
		log.Println("args must be comparable or implement equals", name, typs)
	}
	return ArgInfo{Name: name, Type: typs, ImplementsEquals: eq, IsState: isState}
}

func (p *parse) equals() *types.Interface {
	if p.eq != nil {
		return p.eq
	}

	param := func(t types.Type) *types.Var {
		return types.NewParam(token.NoPos, nil, "", t)
	}

	args := types.NewTuple(param(types.NewInterfaceType(nil, nil).Complete()))
	res := types.NewTuple(param(types.Typ[types.Bool]))
	sig := types.NewSignature(nil, args, res, false)
	methods := []*types.Func{types.NewFunc(token.NoPos, nil, "Equals", sig)}
	p.eq = types.NewInterfaceType(methods, nil).Complete()
	return p.eq
}

func (p *parse) qualify(pkg *types.Package) string {
	if p.imports == nil {
		p.imports = map[*types.Package]string{}
		p.imports[p.Package] = ""
	}

	if s, ok := p.imports[pkg]; ok {
		return s
	}

	guess := 0
	for {
		candidate := p.uniqueName(pkg.Name(), guess)
		guess++
		for _, v := range p.imports {
			if v == candidate {
				candidate = ""
				break
			}
		}
		if candidate != "" {
			p.imports[pkg] = candidate
			return candidate
		}
	}
}

func (p *parse) uniqueName(prefix string, count int) string {
	if count == 0 {
		return prefix
	}
	return prefix + strconv.Itoa(count)
}

func (p *parse) getFieldType(structName, fieldName string) string {
	// fetch field type name from decl because the type name is not available
	// via types.Var as it is reduced to underlying type signature
	s := p.findStruct(structName)
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
				if err := format.Node(&b, p.fset, sel); err == nil {
					return b.String()
				}
			}
			return ""
		}
	}
	return ""
}

func (p *parse) findStruct(name string) *ast.StructType {
	for _, f := range p.files {
		for _, decl := range f.Decls {
			gd, ok := decl.(*ast.GenDecl)
			if !ok {
				continue
			}
			if s := p.findStructInDecl(name, gd); s != nil {
				return s
			}
		}
	}
	return nil
}

func (p *parse) findStructInDecl(name string, decl *ast.GenDecl) *ast.StructType {
	for _, spec := range decl.Specs {
		ts, ok := spec.(*ast.TypeSpec)
		if !ok || ts.Name.Name != name {
			continue
		}

		s, _ := ts.Type.(*ast.StructType)
		return s
	}
	return nil
}
