// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.

package fussy_test

// import "fmt"

import (
	"encoding/json"
	"testing"

	"github.com/dotchain/fuss/fussy/v2"
)

func TestComponents(t *testing.T) {
	// regenerate to make sure input is normalized json
	testFile(t, "generate/components.input.json", "generate/components.input.json", func(input string) (string, error) {
		var info fussy.Info
		if err := json.Unmarshal([]byte(input), &info); err != nil {
			return "", err
		}
		b, err := json.MarshalIndent(info, "", "\t")
		return string(b), err
	})

	testFile(t, "generate/components.input.json", "generate/components.output.go", func(input string) (string, error) {
		var info fussy.Info
		if err := json.Unmarshal([]byte(input), &info); err != nil {
			return "", err
		}
		return fussy.Generate(info), nil
	})
}
