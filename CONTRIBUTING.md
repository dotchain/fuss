# Contributing to FUSS

FUSS is a project for building functional strongly-typed streams-based
reactive code in Golang.  

The code is mostly idiomatic go.  In addtion, there is a tendency to
write functional code (i.e very low side-effects -- preferring to
return new slices instead of mutating input arg, for example). There
is a lot of immutable types used.

## Documentation

The code is somewhat sparsely documented but pleqse feel free to file
issues for even simple questions.

## Code organization

* The core directory implements a small set of utility libraries that
are expected to change rarely if at all.  Consumers are not expected
to use this library directly

* The dom directory implements the  set of UX primitives that can be
used to build UX apps.  This has both a html (server-side) and a js
(gopherjs-based browser-side) driver in sub-directories.

* The todo directory has an example TODO MVC app.

* The fussy directory has the parser and code generator used within
the framework.

## Building, testing, linting

While standard `go get -u ./...` and `go test ./...` should work, all
pull requests to this project will be tested against ./x/lint.sh and
./x/coverage.sh.

```
go test --coverprofile=cover.out
go tool cover --html=cover.out
```

Linting is done using [gometalinter](https://github.com/alecthomas/gometalinter) but with
a very specific set of lint rules.  Please run `./x/lint.sh` to lint the project.


```
go get -u github.com/alecthomas/gometalinter
gometalinter --install --update
./x/lint.sh
```

## Filing issues

Please feel free to file issues whether it is a simple matter of
trying understand code or project ideas or if it is an actual bug
report.


"There are no stupid questions."


## Developing

Pull requests are welcome and appreciated.
