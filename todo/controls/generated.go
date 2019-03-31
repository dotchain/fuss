// Copyright (C) 2019 rameshvk. All rights reserved.
// Use of this source code is governed by a MIT-style license
// that can be found in the LICENSE file.
//
// Code generated by /Users/vkvk/dev/go/src/github.com/dotchain/fuss/todo/controls/codegen.go. DO NOT EDIT.

package controls

import (
	streams "github.com/dotchain/dot/streams"
	dom "github.com/dotchain/fuss/dom/v2"
)

// NewChrome is the constructor for ChromeFunc
func NewChrome() (update ChromeFunc, closeAll func()) {
	var refresh func()

	var lastheader dom.Element
	var lastbody dom.Element
	var lastfooter dom.Element
	var lastresult dom.Element
	var initialized bool
	vRunFnMap := map[interface{}]dom.VRunFunc{}
	vRunCloseMap := map[interface{}]func(){}
	vRunUsedMap := map[interface{}]bool{}

	fixedFnMap := map[interface{}]dom.FixedFunc{}
	fixedCloseMap := map[interface{}]func(){}
	fixedUsedMap := map[interface{}]bool{}

	stretchFnMap := map[interface{}]dom.StretchFunc{}
	stretchCloseMap := map[interface{}]func(){}
	stretchUsedMap := map[interface{}]bool{}

	depsLocal := &chromeDeps{
		vRun: func(key interface{}, styles dom.Styles, cells ...dom.Element) (result dom.Element) {
			vRunUsedMap[key] = true
			if vRunFnMap[key] == nil {
				vRunFnMap[key], vRunCloseMap[key] = dom.NewVRun()
			}
			return vRunFnMap[key](key, styles, cells...)
		},

		fixed: func(key interface{}, styles dom.Styles, cells ...dom.Element) (result dom.Element) {
			fixedUsedMap[key] = true
			if fixedFnMap[key] == nil {
				fixedFnMap[key], fixedCloseMap[key] = dom.NewFixed()
			}
			return fixedFnMap[key](key, styles, cells...)
		},

		stretch: func(key interface{}, styles dom.Styles, cells ...dom.Element) (result dom.Element) {
			stretchUsedMap[key] = true
			if stretchFnMap[key] == nil {
				stretchFnMap[key], stretchCloseMap[key] = dom.NewStretch()
			}
			return stretchFnMap[key](key, styles, cells...)
		},
	}

	close := func() {
		for key := range vRunCloseMap {
			if !vRunUsedMap[key] {
				vRunCloseMap[key]()
				delete(vRunCloseMap, key)
				delete(vRunFnMap, key)
			}
		}
		vRunUsedMap = map[interface{}]bool{}

		for key := range fixedCloseMap {
			if !fixedUsedMap[key] {
				fixedCloseMap[key]()
				delete(fixedCloseMap, key)
				delete(fixedFnMap, key)
			}
		}
		fixedUsedMap = map[interface{}]bool{}

		for key := range stretchCloseMap {
			if !stretchUsedMap[key] {
				stretchCloseMap[key]()
				delete(stretchCloseMap, key)
				delete(stretchFnMap, key)
			}
		}
		stretchUsedMap = map[interface{}]bool{}
	}

	closeAll = func() {
		close()

	}

	update = func(deps interface{}, header dom.Element, body dom.Element, footer dom.Element) (result dom.Element) {
		refresh = func() {

			lastresult = chrome(depsLocal, header, body, footer)

			close()
		}

		if initialized {
			switch {

			case lastheader != header:
			case lastbody != body:
			case lastfooter != footer:
			default:

				return lastresult
			}
		}
		initialized = true
		lastheader = header
		lastbody = body
		lastfooter = footer
		refresh()
		return lastresult
	}

	return update, closeAll
}

// NewFilter is the constructor for FilterFunc
func NewFilter() (update FilterFunc, closeAll func()) {
	var refresh func()

	var lastselected *streams.S16
	var lastresult dom.Element
	var initialized bool
	runFnMap := map[interface{}]dom.RunFunc{}
	runCloseMap := map[interface{}]func(){}
	runUsedMap := map[interface{}]bool{}

	filterOptionFnMap := map[interface{}]filterOptionFunc{}
	filterOptionCloseMap := map[interface{}]func(){}
	filterOptionUsedMap := map[interface{}]bool{}

	depsLocal := &filterDeps{
		run: func(key interface{}, styles dom.Styles, cells ...dom.Element) (result dom.Element) {
			runUsedMap[key] = true
			if runFnMap[key] == nil {
				runFnMap[key], runCloseMap[key] = dom.NewRun()
			}
			return runFnMap[key](key, styles, cells...)
		},

		filterOption: func(key interface{}, selected *streams.S16, s string) (result dom.Element) {
			filterOptionUsedMap[key] = true
			if filterOptionFnMap[key] == nil {
				filterOptionFnMap[key], filterOptionCloseMap[key] = newfilterOption()
			}
			return filterOptionFnMap[key](key, selected, s)
		},
	}

	close := func() {
		for key := range runCloseMap {
			if !runUsedMap[key] {
				runCloseMap[key]()
				delete(runCloseMap, key)
				delete(runFnMap, key)
			}
		}
		runUsedMap = map[interface{}]bool{}

		for key := range filterOptionCloseMap {
			if !filterOptionUsedMap[key] {
				filterOptionCloseMap[key]()
				delete(filterOptionCloseMap, key)
				delete(filterOptionFnMap, key)
			}
		}
		filterOptionUsedMap = map[interface{}]bool{}
	}

	closeAll = func() {
		close()

	}

	update = func(deps interface{}, selected *streams.S16) (result dom.Element) {
		refresh = func() {

			lastresult = filter(depsLocal, selected)

			close()
		}

		if initialized {
			switch {

			case lastselected != selected:
			default:

				return lastresult
			}
		}
		initialized = true
		lastselected = selected
		refresh()
		return lastresult
	}

	return update, closeAll
}

// newfilterOption is the constructor for filterOptionFunc
func newfilterOption() (update filterOptionFunc, closeAll func()) {
	var refresh func()

	var lastselected *streams.S16
	var lastkey string
	var lastresult dom.Element
	var initialized bool
	focusableFnMap := map[interface{}]dom.FocusableFunc{}
	focusableCloseMap := map[interface{}]func(){}
	focusableUsedMap := map[interface{}]bool{}

	labelViewFnMap := map[interface{}]dom.LabelViewFunc{}
	labelViewCloseMap := map[interface{}]func(){}
	labelViewUsedMap := map[interface{}]bool{}

	depsLocal := &filterOptionDeps{
		focusable: func(key interface{}, eh *dom.EventHandler, children ...dom.Element) (result dom.Element) {
			focusableUsedMap[key] = true
			if focusableFnMap[key] == nil {
				focusableFnMap[key], focusableCloseMap[key] = dom.NewFocusable()
			}
			return focusableFnMap[key](key, eh, children...)
		},

		labelView: func(key interface{}, styles dom.Styles, text string, inputID string) (result dom.Element) {
			labelViewUsedMap[key] = true
			if labelViewFnMap[key] == nil {
				labelViewFnMap[key], labelViewCloseMap[key] = dom.NewLabelView()
			}
			return labelViewFnMap[key](key, styles, text, inputID)
		},
	}

	close := func() {
		for key := range focusableCloseMap {
			if !focusableUsedMap[key] {
				focusableCloseMap[key]()
				delete(focusableCloseMap, key)
				delete(focusableFnMap, key)
			}
		}
		focusableUsedMap = map[interface{}]bool{}

		for key := range labelViewCloseMap {
			if !labelViewUsedMap[key] {
				labelViewCloseMap[key]()
				delete(labelViewCloseMap, key)
				delete(labelViewFnMap, key)
			}
		}
		labelViewUsedMap = map[interface{}]bool{}
	}

	closeAll = func() {
		close()

	}

	update = func(deps interface{}, selected *streams.S16, key string) (result dom.Element) {
		refresh = func() {

			lastresult = filterOption(depsLocal, selected, key)

			close()
		}

		if initialized {
			switch {

			case lastselected != selected:
			case lastkey != key:
			default:

				return lastresult
			}
		}
		initialized = true
		lastselected = selected
		lastkey = key
		refresh()
		return lastresult
	}

	return update, closeAll
}

// NewTextReset is the constructor for TextResetFunc
func NewTextReset() (update TextResetFunc, closeAll func()) {
	var refresh func()

	var lasttext *streams.S16
	var lastplaceholder string
	var lastresult dom.Element
	var initialized bool
	textEditOFnMap := map[interface{}]dom.TextEditOFunc{}
	textEditOCloseMap := map[interface{}]func(){}
	textEditOUsedMap := map[interface{}]bool{}

	depsLocal := &textResetDeps{
		textEditO: func(key interface{}, opt dom.TextEditOptions) (result dom.Element) {
			textEditOUsedMap[key] = true
			if textEditOFnMap[key] == nil {
				textEditOFnMap[key], textEditOCloseMap[key] = dom.NewTextEditO()
			}
			return textEditOFnMap[key](key, opt)
		},
	}

	close := func() {
		for key := range textEditOCloseMap {
			if !textEditOUsedMap[key] {
				textEditOCloseMap[key]()
				delete(textEditOCloseMap, key)
				delete(textEditOFnMap, key)
			}
		}
		textEditOUsedMap = map[interface{}]bool{}
	}

	closeAll = func() {
		close()

	}

	update = func(deps interface{}, text *streams.S16, placeholder string) (result dom.Element) {
		refresh = func() {

			lastresult = textReset(depsLocal, text, placeholder)

			close()
		}

		if initialized {
			switch {

			case lasttext != text:
			case lastplaceholder != placeholder:
			default:

				return lastresult
			}
		}
		initialized = true
		lasttext = text
		lastplaceholder = placeholder
		refresh()
		return lastresult
	}

	return update, closeAll
}
