package datum

import (
	"strings"
)

type dummy struct {}
func (d *dummy) fail(c *unknown, x int) int {
	return 0
}

