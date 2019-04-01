// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package fussy_test

import (
	"flag"
	"io/ioutil"
	"log"
	"path"
	"runtime"
	"testing"

	"github.com/andreyvit/diff"
)

func testFile(t *testing.T, input, golden string, fn func(string) (string, error)) {
	_, caller, _, _ := runtime.Caller(1)

	t.Run(input+"=>"+golden, func(t *testing.T) {
		read := func(s string) string {
			s = path.Join(path.Dir(caller), "testdata/"+s)
			bytes, err := ioutil.ReadFile(s)
			if err != nil {
				t.Fatal("Could not read", s, err)
			}
			return string(bytes)
		}

		got, err := fn(read(input))
		if err != nil {
			t.Fatal("Error", err)
		}

		if *goldenFlag {
			s := path.Join(path.Dir(caller), "testdata/"+golden)
			if err := ioutil.WriteFile(s, []byte(got), 0644); err != nil {
				t.Error("Could not save golden output", s, err)
			}
			log.Println("Saved output to", s)
		} else if expected := read(golden); expected != got {
			t.Error("Unexpected", diff.LineDiff(expected, got))
		}
	})
}

var goldenFlag = flag.Bool("golden", false, "build golden files instead of verifying")
