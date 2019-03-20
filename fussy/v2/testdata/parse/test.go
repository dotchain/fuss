package datum

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
	sum SumFunc
}
