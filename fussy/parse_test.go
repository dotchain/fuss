// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package fussy_test

import (
	"encoding/json"
	"github.com/andreyvit/diff"
	"github.com/dotchain/fuss/fussy"
	"strings"
	"testing"
)

func TestParse(t *testing.T) {
	files := []string{"data/test.go", "data/skip.go", "data/test2.go"}
	info := fussy.ParseFiles(files, "skip.go")
	s, _ := json.MarshalIndent(info, "", "\t")
	got := strings.TrimSpace(string(s))
	want := strings.TrimSpace(parseExpected)

	if got != want {
		t.Errorf("Diff:\n%v", diff.LineDiff(want, got))
	}
}

var parseExpected = `
{
	"Package": "datum",
	"Imports": [
		[
			"",
			"sort"
		],
		[
			"",
			"strings"
		],
		[
			"x",
			"github.com/dotchain/dot/changes"
		]
	],
	"Streams": null,
	"Contexts": [
		{
			"ContextType": "unknown4",
			"Function": "succeed",
			"Subcomponents": [
				"SomethingStruct",
				"hello.HelloSomethingStruct"
			],
			"Params": [
				{
					"Name": "c",
					"Type": "*unknown4"
				},
				{
					"Name": "x",
					"Type": "int"
				}
			],
			"Results": [
				{
					"Name": "",
					"Type": "int"
				}
			],
			"Component": "MyFirstSuccessStruct",
			"ComponentComments": "// MyFirstSuccessStruct is a cache for MyFirstSuccess\n// MyFirstSuccess should show up in\n// multiline comments",
			"Method": "MyFirstSuccess",
			"MethodComments": "// MyFirstSuccess - see the type for details"
		},
		{
			"ContextType": "unknown5",
			"Function": "succeed2",
			"Subcomponents": null,
			"Params": [
				{
					"Name": "c",
					"Type": "*unknown5"
				}
			],
			"Results": [
				{
					"Name": "",
					"Type": "int"
				},
				{
					"Name": "",
					"Type": "int"
				}
			],
			"Component": "Succeed2Struct",
			"ComponentComments": "// Succeed2Struct is a cache for Succeed2",
			"Method": "Succeed2",
			"MethodComments": "// Succeed2 - see the type for details"
		},
		{
			"ContextType": "unknown5",
			"Function": "succeed3",
			"Subcomponents": null,
			"Params": [
				{
					"Name": "c",
					"Type": "*unknown5"
				},
				{
					"Name": "x",
					"Type": "int"
				}
			],
			"Results": [
				{
					"Name": "a",
					"Type": "int"
				}
			],
			"Component": "Succeed3Struct",
			"ComponentComments": "// Succeed3Struct is a cache for Succeed3",
			"Method": "Succeed3",
			"MethodComments": "// Succeed3 - see the type for details"
		}
	]
}
`
