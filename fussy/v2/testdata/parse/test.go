package datum

import "github.com/dotchain/dot/streams"

// ignorable looks like count but first arg is not a pointer
type IgnorableFunc = func(key interface{}, a Array) int

func ignorable(deps none, a Array) int {
	return 0
}

// CountFunc returns the length the provided array
type CountFunc = func(key interface{}, a Array) int

func count(deps *none, a Array) int {
	return len(a)
}

// SumFunc returns the sum of the provided array
type SumFunc = func(key interface{}, a Array) int

func sum(deps *none, a Array) int {
	result := 0
	for _, elt := range a {
		result += elt
	}
	return result
}

// AvgFunc returns the average of the provided array
type AvgFunc = func(key interface{}, a Array) float32

func avg(deps *sumDeps, a Array) float32 {
	return float32(deps.sum(nil, a)) / float32(deps.count(nil, a))
}

type sumDeps struct {
	count CountFunc
	sum   SumFunc
}

// EdgeTriggerFunc returns the number of times it has been rebuilt
type EdgeTriggerFunc = func(key interface{}, input int) (r1, r2 int)

func edgeTrigger(deps *none, state *streams.Bool, input int) (v *streams.Bool, r1, r2 int) {
	return nil, 4, 4
}

// Variadic test
type VariadicFunc = func(key interface{}, args ...int) int

func variadic(deps *none, args ...int) int {
	return 0
}

// Closseable test
type CloserFunc = func(key interface{}) int

func closer(deps *none, closerState closable) (closable, int) {
	return closable(0), 0
}

type closable int

func (c closable) Close() {
}
