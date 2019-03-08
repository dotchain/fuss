package datum

import (
	x "github.com/dotchain/dot/changes"
	"sort"
)

func fail2(c *dummy, x int) int {
	return 0
}

func fail3() {}

func fail4() int {
	return 0
}

func fail5(c *unknown3, x int) {
}

func fail6(c *[]unknown3, x int) int {
}

func fail7(c unknown3, x int) int {
}

// MyFirstSuccess should show up in
// multiline comments
func succeed(c *unknown4, x int) int {
	_ = c.hello.HelloSomething(c.Something())
	_ = c.booya
	return 0
}

func succeed2(c *unknown5) (int, int) {
	return 0, 0
}

func succeed3(c *unknown5, x, y int) (a, b int) {
	_ = someCallExpressionWithoutSelector()
	return 0, 0
}


