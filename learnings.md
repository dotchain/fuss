# Learnings from FUSS project

1. Code generation/transpilation
    1. Difficult to write transpiler but easy to use
    2. Better transpiler tools/templates would help.
    3. Standard golang rewrite tools do not go far enough.
    4. Common issues: variable name contention, type check errors in generated code
2. Composition of layout and other HTML styles
    1. HTML styles (such as flex-stretch) are on the child element in a container for convenience
    2. This pollutes child elements which may work whether they are "streched" or otherwise.
    3. Ideally, these would be in a  "children layout schema" attached to parents with styles merged at run time but this is awkward.
    4. A lot of layout styles are in this bucket
    5. Virtual DOM with containers simply becoming style properties that get merged would solve this.
3. Strict typing
    1. The strict typing of input streams in the project is quite neat
    2. The weak typing of dom.Element is not great. Unclear how to define inline/block parts that can be put together.  See "layout schema" above -- that may provide a way out.
4. Streams
    1. Streams work great, code is quite readable. Network connection is transparent
    2. The dynamic refresh aspect (particularly with stateful components) works well but feels awkward
    3. Might be better to define each "control" as a dom.Element stream via a Next() function (just like streams themselves).  The only hitch here is that stateful components are diffcult.
    4. It looks like app-state and session-state will be threaded through every where causing most controls to have to be refreshed with any change.  Still, perf doesn't seem bad at all so might be worth it.
4. Stateful components
    1. Stateful components happen more often than expected. Still, most of the current users are because the underlyingn HTML model itself is stateful
    2. An interesting case is "scroll position preservation" (in the presence of updates).  This requires adjsuting scroll position when some child lower down updates. Requires threading a context in the current setup but with a virtual dom, it can be implemented when the virtual dom is reconciled.
