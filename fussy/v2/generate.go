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

func must(err error) {
	if err != nil {
		panic(err)
	}
}
