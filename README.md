# Fuss

[![Status](https://travis-ci.com/dotchain/fuss.svg?branch=master)](https://travis-ci.com/dotchain/fuss?branch=master)
[![GoDoc](https://godoc.org/github.com/dotchain/fuss?status.svg)](https://godoc.org/github.com/dotchain/fuss)
[![codecov](https://codecov.io/gh/dotchain/fuss/branch/master/graph/badge.svg)](https://codecov.io/gh/dotchain/fuss)
[![Go Report Card](https://goreportcard.com/badge/github.com/dotchain/fuss)](https://goreportcard.com/report/github.com/dotchain/fuss)

FUSS is an experimental functional/reactive framework using strongly-typed streams.

## Goals

The main goal is to build a reactive  UX framework which:

1. Composes nicely: pure functions are the typical case
2. Uses strong static typing: compiler errors with wrong usage
3. Uses [streams](https://godoc.org/github.com/dotchain/dot/streams) as the basis for time-varying data
4. Very little magic in the framework
5. Framework can co-exist with non-reactive or other implementations of reactive code.

## Contents
1. [Goals](#goals)
2. [TODO MVC Example](#todo-mvc-example)
    1. [Todo and TodoList](#todo-and-todolist)
    2. [Generating the streams types](#generating-the-streams-types)
    3. [The Todo View](#the-todo-view)
    4. [Input](#input)
    5. [The filtered list](#the-filtered-list)
    6. [Change handling and stateful components](#change-handling-and-stateful-components)
    7. [Generating the factory code](#generating-the-factory-code)
    8. [Collaborative demo](#collaborative-demo)
3. [Limitations](#limitations)

## TODO MVC Example

The demo [TODO MVC
app](https://dotchain.github.io/fuss/todo/html/index.html) is built
out of the [todo](https://github.com/dotchain/fuss/tree/master/todo) folder.

### Todo and TodoList

The core data type for the todo app is a simple struct to hold the
todo item and a slice to represent a collection of these:

```golang todo.global

// Todo represents an item in the TODO list.
type Todo struct {
	ID          string
	Complete    bool
	Description string
}

// TodoList represents a collection of todos
type TodoList []Todo

```

### Generating the streams types

The code generation tool
[dotc](https://godoc.org/github.com/dotchain/dot/x/dotc) can be used
to augment the types here with additional methods.  In particular,
much of the UI will use **streams** of these values.

```golang codegen.global
func generateTypes() {
	_, self, _, _ := runtime.Caller(0)
	output := filepath.Join(filepath.Dir(self), "generated1.go")

	info := dotc.Info{
		Package: "todo",
		Structs: []dotc.Struct{{
			Recv: "t",
			Type: "Todo",
			Fields: []dotc.Field{{
				Name: "Complete",
				Key:  "complete",
				Type: "bool",
			}, {
				Name: "Description",
				Key:  "desc",
				Type: "string",
			}},
		}},
		Slices: []dotc.Slice{{
			Recv:     "t",
			Type:     "TodoList",
			ElemType: "Todo",
		}},
	}
	code, err := info.Generate()
	if err != nil {
		panic(err)
	}
	err = ioutil.WriteFile(output, []byte(code), 0644)
	if err != nil {
		panic(err)
	}
}
```

See
[Codegen](https://github.com/dotchain/fuss/blob/master/todo/codegen.go)
where this is used.

The `TodoStream` type exposes the current value via the `Value` field
and supports an `Update()` method to update the value whole-sale. Such
updates do not change the current value but can be thought of as
appending to the sequence of values a particular `Todo` has. The
latest value can be obtained via `TodoStream:Latest()` and callers can
register for notifications on it.

More interestingly, the code snippet above will generate methods on
the stream to fetch sub-streams for, say, the `Complete` field. This
sub-stream holds a simple `bool` value and when it is updated, the
corresponding `todo` itself is updated with that field changed. The
stream also does "merging" --  if the `Complete` and `Description`
fields were modified indepdently, the latest of the `todo` will be
merge of the changes.

The `TodoListStream` similarly exposes a `TodoStream` for each element
in the array and edits to the individual elements correectly get
propagated to the parent.

### The Todo View

The following snippet renders a single todo item:

```golang todo.global
// Todo renders a Todo item
func todo(deps *todoDeps, todoStream *TodoStream) dom.Element {
	return deps.run(
		"root",
		dom.Styles{},
		deps.checkboxEdit("cb", dom.Styles{}, todoStream.Complete(), ""),
		deps.textEdit("textedit", dom.Styles{}, todoStream.Description()),
	)
}

type TodoFunc = func(key interface{}, todoStream *TodoStream) dom.Element
type todoDeps struct {
	run          dom.RunFunc
	checkboxEdit dom.CheckboxEditFunc
	textEdit     dom.TextEditFunc
}
```

Each component has three parts: the core function (`todo(..)`), the
set of dependencies used  by this function (`todoDeps`) and a
signature for how callers can use this function `TodoFunc`.

A few notes:
1. The first argument of the function must be a pointer to the
dependency struct
2. The dependency struct should hold all the other components this one
intends to use.  In particular, the function signatures are named
here.
3. The signature replaces the first arg with a generic "key" (which
will be explained shortly).

The main function itself creates sub-components as needed using  the
dependencies struct. The code-generation framework produces a single
artifact for each compnent -- a factory function that creates
instances of the component:

```golang skip
func NewTodo() (update TodoFunc, close func()) {
    ...
}
```

The idea is that any consumer of the `todo` component would use this
function above to create an instance.  The generated function
implements the logic for creating the dependency functions. In
particular, the dependency functions take a "key" as the first
parameter (with the rest matching the corresponding component). The
generated scaffolding checks if the key was used before and if so
reuses the last instance (calling on its update method). If the key is
new, it calls the factory method of the sub component.

The generated factory function also does simple memoization: if the
args to the update method are same as before, it results the results
from the last round.

### Input

Going back to the example above, the checkbox was provided with a
`streams.Bool` which controls both whether it shows as checked or not
as well as the output from the checkbox.  When the user toggles the
checkbox, the checkbox component updates the provided input  stream by
calling `streams.Bool:Update(newValue)` on it.

The `todo` view does not directly handle this but since the checkbox
stream was created via `todoStream.Complete()` any changes to the
boolean stream end up modifying the corresponding `todoStream`

These changes to the stream do not cause any automatic re-rendering
though. Instead  the are propagated up until some point where the
stream is considered the *state* of a component.  

### The filtered list

The parent of the `todo()` view is a list of todos (filtered by
whether they are active or not based on a filter setting)

```golang todo.global
// FilteredList renders  a list of filtered todos
//
// Individual tasks can be modified underneath.
func filteredList(deps *filteredListDeps, filter *streams.S16, todos *TodoListStream) dom.Element {
	return deps.vRun(
		"root",
		dom.Styles{},
		todos.Value.renderTodo(func(index int, t Todo) dom.Element {
			done := filter.Value == controls.ShowDone
			active := filter.Value == controls.ShowActive
			if t.Complete && active || !t.Complete && done {
				return nil
			}

			return deps.todo(t.ID, todos.Item(index))
		})...,
	)
}

type FilteredListFunc = func(key interface{}, filter *streams.S16, todos *TodoListStream) dom.Element
type filteredListDeps struct {
	vRun dom.VRunFunc
	todo TodoFunc
}
```

This code creates a `VRun` flex-rows container (using `dom.VRun`) but
also takes a stream of TodoList as the arg. It walks through each
element of the TaskList value and creates a child todo component
(assuming the filter conditions were satisfied).

The dependency struct here indicates both sub-components are
needed. The code also uses the task ID as the key when invoking
`deps.todo(t.ID, ...)`.  This ensures that if an item gets shuffled
around, it will be reused still.

### Change handling and stateful components

So far there is no specific code for change handling.  The changes
from checkboxes and textedits simply propagaate upwards but no
automatic re-rendering happens until it hits a *stateful component*. 
A stateful component takes a state parameter as well as returns it. 
The generated factory function automatically rerenders a component
when its state changes.

An example of such a component is the full app itself: the list of
todos are maintained as state (though in a real app, they would be
saved on the server but thats a different demo):

```golang todo.global
// App hosts the todo MVC app
func app(deps *appDeps, state *TodoListStream) (*TodoListStream, dom.Element) {
	if state == nil {
		// TODO: fetch this from the network
		state = &TodoListStream{
			Stream: streams.New(),
			Value: TodoList{
				Todo{"one", true, "First task"},
				Todo{"two", false, "Second task"},
			},
		}
	}

	return state, deps.chrome(
		"root",
		deps.textView("h", dom.Styles{}, "FUSS TODO"),
		deps.listView("root", state),
		deps.a(
			"a",
			dom.Styles{},
			"https://github.com/dotchain/fuss",
			deps.textView("tv", dom.Styles{}, "github"),
		),
	)
}

type AppFunc = func(key interface{}) dom.Element
type appDeps struct {
	textView dom.TextViewFunc
	listView ListViewFunc
	a        dom.AFunc
	chrome   controls.ChromeFunc
}
```

As describe before, the distinguishing marks  of a stateful component
are:

1. It has a parameter that captures the state (these should be named
xyzState).

2. It returns the state back. At a minimum, this is needed for
initialization (state is initially the zero value for its type)

When the checkbox stream is updated, that gets propagated all the way
up to the app where the TodoListStream is the state.  So, the app
component is re-rendered and effectively this causes  the whole
sub-tree to be re-rendered (unless a sub-component has the same args
as before, in which case the previous results are reused).

### Generating the factory code

The factory code can be fairly completely auto-generated with a simple
stub like this:


```golang codegen.global
func generateComponents() {
	_, self, _, _ := runtime.Caller(0)
	output := filepath.Join(filepath.Dir(self), "generated2.go")
	skip := []string{"generated2.go"}
	info, err := fussy.ParseDir(filepath.Dir(self), "todo", skip)
	if err != nil {
		panic(err)
	}
	err = ioutil.WriteFile(output, []byte(fussy.Generate(*info)), 0644)
	if err != nil {
		panic(err)
	}
}
```

See
[Codegen](https://github.com/dotchain/fuss/blob/master/todo/codegen.go)
where this is used.

### Collaborative demo

The example in the
[collab](https://github.com/dotchain/fuss/tree/master/todo/html)
folder can be used to demonstrate a **collaborative** todo list:

Starting the local server:

```sh
$ cd github.com/dotchain/fuss/todo/collab
$ go run server
```

Starting the gopherjs session:

```sh
$ gopherjs serve github.com/dotchain/fuss/todo/collab --http=:8081
```

Now open multiple browser tabs to
[http://localhost:8081](http://localhost:8081) and see that they all
share the same TODO list.

The actual todo list is served from a local file (todo.bolt) and so
the state persists even when the browser session is restarted.

## Limitations

There are a lot of limitations with this still:

1. The `xyzFunc` types must all use named args (as these names are
used within the generated code).  State args should not appear on this
Func type.

2. The dependency function can be named anything as its type is
deduced from the first parameter but the `xyzFunc` declaration should
match the function name.

3. The actual core function (such as `todo` in the example) should
always be unexported.  This is also true for the dependency
structures.  The `xyzFunc` declaration can be exported or private and
the generated `NewXyz()` will mirror this.

4. Memoization works by comparing using `==` with one exception:
variadic types are handled by checking each value instead of the
slice.  Non-comparable types can implement `Equals(other)` methods to
provide custom equals methods.

5. The generated code assumes it lives in the same package.  But the
actual code generation should skip this file (the generation code
snippets in this README file correctly deal with this).

6. The [dotc](https://godoc.org/github.com/dotchain/dot/x/dotc) code
generator needs to be explicitly provided with the type info --  it is
not deduced from the code yet.  This is rather finicky, particularly
if dealing with struct of structs and such as it depends on the
[dot](https://godoc.org/github.com/dotchain/dot) infrastructure.

7. The gopherjs bundle is **huge**.  None of the underlying components
have been optimized in any way for the bundle.
