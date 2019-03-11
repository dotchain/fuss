// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package fussy

import (
	"bytes"
	"go/ast"
	"go/format"
	"go/parser"
	"go/token"
	"io/ioutil"
	"path"
	"sort"
	"strings"
)

// ParseDir is similar to ParseFiles except it looks for all *.go
// files in the provided directory automatically.
func ParseDir(dir string, skipName string) Info {
	entries, err := ioutil.ReadDir(dir)
	must(err)

	files := []string{}
	for _, entry := range entries {
		if n := entry.Name(); strings.HasSuffix(n, ".go") {
			files = append(files, path.Join(dir, n))
		}
	}
	return ParseFiles(files, skipName)
}

// ParseFiles parses the files and returns info suitable for generating code.
func ParseFiles(files []string, skipName string) Info {
	var info Info

	ff := []*ast.File{}
	fset := token.NewFileSet()

	for _, fname := range files {
		if path.Base(fname) == skipName {
			continue
		}

		f, err := parser.ParseFile(fset, fname, nil, parser.ParseComments)
		must(err)
		ff = append(ff, f)
		info.Package = f.Name.Name
	}

	imports := map[string]string{}
	objects := map[string]*ast.Object{}
	comps := map[string]ContextInfo{}

	parseImports(ff, func(k, v string) { imports[v] = k })
	parseObjects(ff, func(k string, v *ast.Object) { objects[k] = v })
	parseComponents(objects, func(k string, v *ast.FuncDecl) { comps[k] = getContextInfo(v) })

	for k, v := range imports {
		info.Imports = append(info.Imports, [2]string{v, k})
	}
	sort.Slice(info.Imports, func(i, j int) bool {
		x, y := info.Imports[i], info.Imports[j]
		if x[0] == y[0] {
			return x[1] < y[1]
		}
		return x[0] < y[0]
	})
	cnames := []string{}
	for k := range comps {
		cnames = append(cnames, k)
	}
	sort.Strings(cnames)
	for _, name := range cnames {
		info.Contexts = append(info.Contexts, comps[name])
	}

	return info
}

func parseImports(ff []*ast.File, fn func(k, v string)) {
	for _, f := range ff {
		for _, im := range f.Imports {
			name := ""
			if im.Name != nil && im.Name.Name != "_" {
				name = im.Name.Name
			}
			v := im.Path.Value[1:]
			fn(name, v[:len(v)-1])
		}
	}
}

func parseObjects(ff []*ast.File, fn func(string, *ast.Object)) {
	for _, f := range ff {
		for k, v := range f.Scope.Objects {
			fn(k, v)
		}
	}
}

func parseComponents(obj map[string]*ast.Object, fn func(string, *ast.FuncDecl)) {
	for k, v := range obj {
		decl, ok := v.Decl.(*ast.FuncDecl)
		if !ok || decl.Recv != nil || decl.Type.Results == nil {
			continue
		}
		params := decl.Type.Params.List
		if len(params) == 0 || len(params[0].Names) == 0 {
			continue
		}
		ctxtType, ok := params[0].Type.(*ast.StarExpr)
		if !ok {
			continue
		}
		ctxtStruct, ok := ctxtType.X.(*ast.Ident)
		if !ok {
			continue
		}

		if _, ok := obj[ctxtStruct.Name]; ok {
			continue
		}

		fn(k, decl)
	}
}

func getContextInfo(decl *ast.FuncDecl) ContextInfo {
	var ci ContextInfo
	ci.Function = decl.Name.Name
	ci.ContextType = decl.Type.Params.List[0].Type.(*ast.StarExpr).X.(*ast.Ident).Name
	fset := token.NewFileSet()
	for _, p := range decl.Type.Params.List {
		var buf bytes.Buffer
		must(format.Node(&buf, fset, p.Type))
		for _, n := range p.Names {
			ci.Params = append(ci.Params, ParamInfo{n.Name, buf.String()})
		}
	}

	for _, p := range decl.Type.Results.List {
		var buf bytes.Buffer
		must(format.Node(&buf, fset, p.Type))
		if len(p.Names) == 0 {
			ci.Results = append(ci.Results, ResultInfo{"", buf.String()})
			continue
		}

		for _, n := range p.Names {
			ci.Results = append(ci.Results, ResultInfo{n.Name, buf.String()})
		}
	}

	comments := []string{}
	if decl.Doc != nil {
		for _, c := range decl.Doc.List {
			text := strings.TrimSpace(c.Text)
			if strings.HasPrefix(text, "//") || strings.HasPrefix(text, "/*") {
				text = strings.TrimSpace(text[2:])
			}
			if text != "" || len(comments) > 0 {
				comments = append(comments, text)
			}
		}
	}

	ci.Component = strings.Title(ci.Function)
	if len(comments) > 0 {
		ci.Component = strings.SplitN(comments[0], " ", 2)[0]
	}
	ci.Method = ci.Component
	ci.Component += "Struct"

	ci.ComponentComments = "// " + ci.Component + " is a cache for " + ci.Method
	if len(comments) > 0 {
		ci.ComponentComments += "\n// " + strings.Join(comments, "\n// ")
	}
	ci.MethodComments = "// " + ci.Method + " - see the type for details"

	v := &fnVisitor{ci.Params[0].Name, map[[2]string]bool{}}
	ast.Walk(v, decl.Body)
	for pair := range v.calls {
		sub := pair[1] + "Struct"
		if pair[0] != "" {
			sub = pair[0] + "." + sub
		}
		ci.Subcomponents = append(ci.Subcomponents, sub)
	}
	sort.Strings(ci.Subcomponents)

	return ci
}

type fnVisitor struct {
	context string
	calls   map[[2]string]bool
}

func (f *fnVisitor) Visit(n ast.Node) ast.Visitor {
	call, ok := n.(*ast.CallExpr)
	if !ok {
		return f
	}

	sel, ok := call.Fun.(*ast.SelectorExpr)
	if !ok {
		return f
	}

	inner := sel.Sel.Name
	if f.isContext(sel.X) {
		f.calls[[2]string{"", inner}] = true
	} else if sel, ok := sel.X.(*ast.SelectorExpr); ok {
		outer := sel.Sel.Name
		if f.isContext(sel.X) {
			f.calls[[2]string{outer, inner}] = true
		}
	}
	return f
}

func (f *fnVisitor) isContext(e ast.Expr) bool {
	if ident, ok := e.(*ast.Ident); ok && ident.Name == f.context {
		return true
	}
	return false
}
