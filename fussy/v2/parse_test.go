// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package fussy_test

import (
	"encoding/json"
	"github.com/dotchain/fuss/fussy/v2"
	"testing"
)

func TestParse(t *testing.T) {
	skip := []string{"generated.go", "generated_test.go"}
	info, err := fussy.ParseDir("testdata/parse", "datum", skip)
	if err != nil {
		t.Fatal(err)
	}

	testFile(t, "parse/test.go", "parse/info.output.json", func(string) (string, error) {
		s, err := json.MarshalIndent(info, "", "\t")
		if err != nil {
			return "", err
		}
		return string(s), nil
	})

	testFile(t, "parse/test.go", "parse/generated.go", func(string) (string, error) {
		return fussy.Generate(*info), nil
	})

	info, err = fussy.ParseDir("testdata/parse", "datum_test", skip)
	if err != nil {
		t.Fatal(err)
	}

	testFile(t, "parse/test.go", "parse/info_test.output.json", func(string) (string, error) {
		s, err := json.MarshalIndent(info, "", "\t")
		if err != nil {
			return "", err
		}
		return string(s), nil
	})

	testFile(t, "parse/test.go", "parse/generated_test.go", func(string) (string, error) {
		return fussy.Generate(*info), nil
	})

}
