// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package fussy

import (
	"bytes"
	"fmt"
	"go/format"

	"golang.org/x/tools/imports"
)

// Generate returns the source code generated from the provided info
func Generate(info Info) string {
	var result bytes.Buffer
	must(headerTpl.Execute(&result, info))
	r := result.String()

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

func must(err error) {
	if err != nil {
		panic(err)
	}
}
