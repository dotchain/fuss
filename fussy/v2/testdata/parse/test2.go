package datum

type Array []int
func (a Array) Equals(o interface{}) bool {
	if ox, ok := o.(Array); ok && len(ox) == len(a) {
		for kk := range a {
			if a[kk] != ox[kk] {
				return false
			}
		}
		return true
	}
	return false
}

type none struct{}

