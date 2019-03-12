"use strict";
(function() {

Error.stackTraceLimit = Infinity;

var $global, $module;
if (typeof window !== "undefined") { /* web page */
  $global = window;
} else if (typeof self !== "undefined") { /* web worker */
  $global = self;
} else if (typeof global !== "undefined") { /* Node.js */
  $global = global;
  $global.require = require;
} else { /* others (e.g. Nashorn) */
  $global = this;
}

if ($global === undefined || $global.Array === undefined) {
  throw new Error("no global object found");
}
if (typeof module !== "undefined") {
  $module = module;
}

var $packages = {}, $idCounter = 0;
var $keys = function(m) { return m ? Object.keys(m) : []; };
var $flushConsole = function() {};
var $throwRuntimeError; /* set by package "runtime" */
var $throwNilPointerError = function() { $throwRuntimeError("invalid memory address or nil pointer dereference"); };
var $call = function(fn, rcvr, args) { return fn.apply(rcvr, args); };
var $makeFunc = function(fn) { return function() { return $externalize(fn(this, new ($sliceType($jsObjectPtr))($global.Array.prototype.slice.call(arguments, []))), $emptyInterface); }; };
var $unused = function(v) {};

var $mapArray = function(array, f) {
  var newArray = new array.constructor(array.length);
  for (var i = 0; i < array.length; i++) {
    newArray[i] = f(array[i]);
  }
  return newArray;
};

var $methodVal = function(recv, name) {
  var vals = recv.$methodVals || {};
  recv.$methodVals = vals; /* noop for primitives */
  var f = vals[name];
  if (f !== undefined) {
    return f;
  }
  var method = recv[name];
  f = function() {
    $stackDepthOffset--;
    try {
      return method.apply(recv, arguments);
    } finally {
      $stackDepthOffset++;
    }
  };
  vals[name] = f;
  return f;
};

var $methodExpr = function(typ, name) {
  var method = typ.prototype[name];
  if (method.$expr === undefined) {
    method.$expr = function() {
      $stackDepthOffset--;
      try {
        if (typ.wrapped) {
          arguments[0] = new typ(arguments[0]);
        }
        return Function.call.apply(method, arguments);
      } finally {
        $stackDepthOffset++;
      }
    };
  }
  return method.$expr;
};

var $ifaceMethodExprs = {};
var $ifaceMethodExpr = function(name) {
  var expr = $ifaceMethodExprs["$" + name];
  if (expr === undefined) {
    expr = $ifaceMethodExprs["$" + name] = function() {
      $stackDepthOffset--;
      try {
        return Function.call.apply(arguments[0][name], arguments);
      } finally {
        $stackDepthOffset++;
      }
    };
  }
  return expr;
};

var $subslice = function(slice, low, high, max) {
  if (high === undefined) {
    high = slice.$length;
  }
  if (max === undefined) {
    max = slice.$capacity;
  }
  if (low < 0 || high < low || max < high || high > slice.$capacity || max > slice.$capacity) {
    $throwRuntimeError("slice bounds out of range");
  }
  if (slice === slice.constructor.nil) {
    return slice;
  }
  var s = new slice.constructor(slice.$array);
  s.$offset = slice.$offset + low;
  s.$length = high - low;
  s.$capacity = max - low;
  return s;
};

var $substring = function(str, low, high) {
  if (low < 0 || high < low || high > str.length) {
    $throwRuntimeError("slice bounds out of range");
  }
  return str.substring(low, high);
};

var $sliceToArray = function(slice) {
  if (slice.$array.constructor !== Array) {
    return slice.$array.subarray(slice.$offset, slice.$offset + slice.$length);
  }
  return slice.$array.slice(slice.$offset, slice.$offset + slice.$length);
};

var $decodeRune = function(str, pos) {
  var c0 = str.charCodeAt(pos);

  if (c0 < 0x80) {
    return [c0, 1];
  }

  if (c0 !== c0 || c0 < 0xC0) {
    return [0xFFFD, 1];
  }

  var c1 = str.charCodeAt(pos + 1);
  if (c1 !== c1 || c1 < 0x80 || 0xC0 <= c1) {
    return [0xFFFD, 1];
  }

  if (c0 < 0xE0) {
    var r = (c0 & 0x1F) << 6 | (c1 & 0x3F);
    if (r <= 0x7F) {
      return [0xFFFD, 1];
    }
    return [r, 2];
  }

  var c2 = str.charCodeAt(pos + 2);
  if (c2 !== c2 || c2 < 0x80 || 0xC0 <= c2) {
    return [0xFFFD, 1];
  }

  if (c0 < 0xF0) {
    var r = (c0 & 0x0F) << 12 | (c1 & 0x3F) << 6 | (c2 & 0x3F);
    if (r <= 0x7FF) {
      return [0xFFFD, 1];
    }
    if (0xD800 <= r && r <= 0xDFFF) {
      return [0xFFFD, 1];
    }
    return [r, 3];
  }

  var c3 = str.charCodeAt(pos + 3);
  if (c3 !== c3 || c3 < 0x80 || 0xC0 <= c3) {
    return [0xFFFD, 1];
  }

  if (c0 < 0xF8) {
    var r = (c0 & 0x07) << 18 | (c1 & 0x3F) << 12 | (c2 & 0x3F) << 6 | (c3 & 0x3F);
    if (r <= 0xFFFF || 0x10FFFF < r) {
      return [0xFFFD, 1];
    }
    return [r, 4];
  }

  return [0xFFFD, 1];
};

var $encodeRune = function(r) {
  if (r < 0 || r > 0x10FFFF || (0xD800 <= r && r <= 0xDFFF)) {
    r = 0xFFFD;
  }
  if (r <= 0x7F) {
    return String.fromCharCode(r);
  }
  if (r <= 0x7FF) {
    return String.fromCharCode(0xC0 | r >> 6, 0x80 | (r & 0x3F));
  }
  if (r <= 0xFFFF) {
    return String.fromCharCode(0xE0 | r >> 12, 0x80 | (r >> 6 & 0x3F), 0x80 | (r & 0x3F));
  }
  return String.fromCharCode(0xF0 | r >> 18, 0x80 | (r >> 12 & 0x3F), 0x80 | (r >> 6 & 0x3F), 0x80 | (r & 0x3F));
};

var $stringToBytes = function(str) {
  var array = new Uint8Array(str.length);
  for (var i = 0; i < str.length; i++) {
    array[i] = str.charCodeAt(i);
  }
  return array;
};

var $bytesToString = function(slice) {
  if (slice.$length === 0) {
    return "";
  }
  var str = "";
  for (var i = 0; i < slice.$length; i += 10000) {
    str += String.fromCharCode.apply(undefined, slice.$array.subarray(slice.$offset + i, slice.$offset + Math.min(slice.$length, i + 10000)));
  }
  return str;
};

var $stringToRunes = function(str) {
  var array = new Int32Array(str.length);
  var rune, j = 0;
  for (var i = 0; i < str.length; i += rune[1], j++) {
    rune = $decodeRune(str, i);
    array[j] = rune[0];
  }
  return array.subarray(0, j);
};

var $runesToString = function(slice) {
  if (slice.$length === 0) {
    return "";
  }
  var str = "";
  for (var i = 0; i < slice.$length; i++) {
    str += $encodeRune(slice.$array[slice.$offset + i]);
  }
  return str;
};

var $copyString = function(dst, src) {
  var n = Math.min(src.length, dst.$length);
  for (var i = 0; i < n; i++) {
    dst.$array[dst.$offset + i] = src.charCodeAt(i);
  }
  return n;
};

var $copySlice = function(dst, src) {
  var n = Math.min(src.$length, dst.$length);
  $copyArray(dst.$array, src.$array, dst.$offset, src.$offset, n, dst.constructor.elem);
  return n;
};

var $copyArray = function(dst, src, dstOffset, srcOffset, n, elem) {
  if (n === 0 || (dst === src && dstOffset === srcOffset)) {
    return;
  }

  if (src.subarray) {
    dst.set(src.subarray(srcOffset, srcOffset + n), dstOffset);
    return;
  }

  switch (elem.kind) {
  case $kindArray:
  case $kindStruct:
    if (dst === src && dstOffset > srcOffset) {
      for (var i = n - 1; i >= 0; i--) {
        elem.copy(dst[dstOffset + i], src[srcOffset + i]);
      }
      return;
    }
    for (var i = 0; i < n; i++) {
      elem.copy(dst[dstOffset + i], src[srcOffset + i]);
    }
    return;
  }

  if (dst === src && dstOffset > srcOffset) {
    for (var i = n - 1; i >= 0; i--) {
      dst[dstOffset + i] = src[srcOffset + i];
    }
    return;
  }
  for (var i = 0; i < n; i++) {
    dst[dstOffset + i] = src[srcOffset + i];
  }
};

var $clone = function(src, type) {
  var clone = type.zero();
  type.copy(clone, src);
  return clone;
};

var $pointerOfStructConversion = function(obj, type) {
  if(obj.$proxies === undefined) {
    obj.$proxies = {};
    obj.$proxies[obj.constructor.string] = obj;
  }
  var proxy = obj.$proxies[type.string];
  if (proxy === undefined) {
    var properties = {};
    for (var i = 0; i < type.elem.fields.length; i++) {
      (function(fieldProp) {
        properties[fieldProp] = {
          get: function() { return obj[fieldProp]; },
          set: function(value) { obj[fieldProp] = value; }
        };
      })(type.elem.fields[i].prop);
    }
    proxy = Object.create(type.prototype, properties);
    proxy.$val = proxy;
    obj.$proxies[type.string] = proxy;
    proxy.$proxies = obj.$proxies;
  }
  return proxy;
};

var $append = function(slice) {
  return $internalAppend(slice, arguments, 1, arguments.length - 1);
};

var $appendSlice = function(slice, toAppend) {
  if (toAppend.constructor === String) {
    var bytes = $stringToBytes(toAppend);
    return $internalAppend(slice, bytes, 0, bytes.length);
  }
  return $internalAppend(slice, toAppend.$array, toAppend.$offset, toAppend.$length);
};

var $internalAppend = function(slice, array, offset, length) {
  if (length === 0) {
    return slice;
  }

  var newArray = slice.$array;
  var newOffset = slice.$offset;
  var newLength = slice.$length + length;
  var newCapacity = slice.$capacity;

  if (newLength > newCapacity) {
    newOffset = 0;
    newCapacity = Math.max(newLength, slice.$capacity < 1024 ? slice.$capacity * 2 : Math.floor(slice.$capacity * 5 / 4));

    if (slice.$array.constructor === Array) {
      newArray = slice.$array.slice(slice.$offset, slice.$offset + slice.$length);
      newArray.length = newCapacity;
      var zero = slice.constructor.elem.zero;
      for (var i = slice.$length; i < newCapacity; i++) {
        newArray[i] = zero();
      }
    } else {
      newArray = new slice.$array.constructor(newCapacity);
      newArray.set(slice.$array.subarray(slice.$offset, slice.$offset + slice.$length));
    }
  }

  $copyArray(newArray, array, newOffset + slice.$length, offset, length, slice.constructor.elem);

  var newSlice = new slice.constructor(newArray);
  newSlice.$offset = newOffset;
  newSlice.$length = newLength;
  newSlice.$capacity = newCapacity;
  return newSlice;
};

var $equal = function(a, b, type) {
  if (type === $jsObjectPtr) {
    return a === b;
  }
  switch (type.kind) {
  case $kindComplex64:
  case $kindComplex128:
    return a.$real === b.$real && a.$imag === b.$imag;
  case $kindInt64:
  case $kindUint64:
    return a.$high === b.$high && a.$low === b.$low;
  case $kindArray:
    if (a.length !== b.length) {
      return false;
    }
    for (var i = 0; i < a.length; i++) {
      if (!$equal(a[i], b[i], type.elem)) {
        return false;
      }
    }
    return true;
  case $kindStruct:
    for (var i = 0; i < type.fields.length; i++) {
      var f = type.fields[i];
      if (!$equal(a[f.prop], b[f.prop], f.typ)) {
        return false;
      }
    }
    return true;
  case $kindInterface:
    return $interfaceIsEqual(a, b);
  default:
    return a === b;
  }
};

var $interfaceIsEqual = function(a, b) {
  if (a === $ifaceNil || b === $ifaceNil) {
    return a === b;
  }
  if (a.constructor !== b.constructor) {
    return false;
  }
  if (a.constructor === $jsObjectPtr) {
    return a.object === b.object;
  }
  if (!a.constructor.comparable) {
    $throwRuntimeError("comparing uncomparable type " + a.constructor.string);
  }
  return $equal(a.$val, b.$val, a.constructor);
};

var $min = Math.min;
var $mod = function(x, y) { return x % y; };
var $parseInt = parseInt;
var $parseFloat = function(f) {
  if (f !== undefined && f !== null && f.constructor === Number) {
    return f;
  }
  return parseFloat(f);
};

var $froundBuf = new Float32Array(1);
var $fround = Math.fround || function(f) {
  $froundBuf[0] = f;
  return $froundBuf[0];
};

var $imul = Math.imul || function(a, b) {
  var ah = (a >>> 16) & 0xffff;
  var al = a & 0xffff;
  var bh = (b >>> 16) & 0xffff;
  var bl = b & 0xffff;
  return ((al * bl) + (((ah * bl + al * bh) << 16) >>> 0) >> 0);
};

var $floatKey = function(f) {
  if (f !== f) {
    $idCounter++;
    return "NaN$" + $idCounter;
  }
  return String(f);
};

var $flatten64 = function(x) {
  return x.$high * 4294967296 + x.$low;
};

var $shiftLeft64 = function(x, y) {
  if (y === 0) {
    return x;
  }
  if (y < 32) {
    return new x.constructor(x.$high << y | x.$low >>> (32 - y), (x.$low << y) >>> 0);
  }
  if (y < 64) {
    return new x.constructor(x.$low << (y - 32), 0);
  }
  return new x.constructor(0, 0);
};

var $shiftRightInt64 = function(x, y) {
  if (y === 0) {
    return x;
  }
  if (y < 32) {
    return new x.constructor(x.$high >> y, (x.$low >>> y | x.$high << (32 - y)) >>> 0);
  }
  if (y < 64) {
    return new x.constructor(x.$high >> 31, (x.$high >> (y - 32)) >>> 0);
  }
  if (x.$high < 0) {
    return new x.constructor(-1, 4294967295);
  }
  return new x.constructor(0, 0);
};

var $shiftRightUint64 = function(x, y) {
  if (y === 0) {
    return x;
  }
  if (y < 32) {
    return new x.constructor(x.$high >>> y, (x.$low >>> y | x.$high << (32 - y)) >>> 0);
  }
  if (y < 64) {
    return new x.constructor(0, x.$high >>> (y - 32));
  }
  return new x.constructor(0, 0);
};

var $mul64 = function(x, y) {
  var high = 0, low = 0;
  if ((y.$low & 1) !== 0) {
    high = x.$high;
    low = x.$low;
  }
  for (var i = 1; i < 32; i++) {
    if ((y.$low & 1<<i) !== 0) {
      high += x.$high << i | x.$low >>> (32 - i);
      low += (x.$low << i) >>> 0;
    }
  }
  for (var i = 0; i < 32; i++) {
    if ((y.$high & 1<<i) !== 0) {
      high += x.$low << i;
    }
  }
  return new x.constructor(high, low);
};

var $div64 = function(x, y, returnRemainder) {
  if (y.$high === 0 && y.$low === 0) {
    $throwRuntimeError("integer divide by zero");
  }

  var s = 1;
  var rs = 1;

  var xHigh = x.$high;
  var xLow = x.$low;
  if (xHigh < 0) {
    s = -1;
    rs = -1;
    xHigh = -xHigh;
    if (xLow !== 0) {
      xHigh--;
      xLow = 4294967296 - xLow;
    }
  }

  var yHigh = y.$high;
  var yLow = y.$low;
  if (y.$high < 0) {
    s *= -1;
    yHigh = -yHigh;
    if (yLow !== 0) {
      yHigh--;
      yLow = 4294967296 - yLow;
    }
  }

  var high = 0, low = 0, n = 0;
  while (yHigh < 2147483648 && ((xHigh > yHigh) || (xHigh === yHigh && xLow > yLow))) {
    yHigh = (yHigh << 1 | yLow >>> 31) >>> 0;
    yLow = (yLow << 1) >>> 0;
    n++;
  }
  for (var i = 0; i <= n; i++) {
    high = high << 1 | low >>> 31;
    low = (low << 1) >>> 0;
    if ((xHigh > yHigh) || (xHigh === yHigh && xLow >= yLow)) {
      xHigh = xHigh - yHigh;
      xLow = xLow - yLow;
      if (xLow < 0) {
        xHigh--;
        xLow += 4294967296;
      }
      low++;
      if (low === 4294967296) {
        high++;
        low = 0;
      }
    }
    yLow = (yLow >>> 1 | yHigh << (32 - 1)) >>> 0;
    yHigh = yHigh >>> 1;
  }

  if (returnRemainder) {
    return new x.constructor(xHigh * rs, xLow * rs);
  }
  return new x.constructor(high * s, low * s);
};

var $divComplex = function(n, d) {
  var ninf = n.$real === Infinity || n.$real === -Infinity || n.$imag === Infinity || n.$imag === -Infinity;
  var dinf = d.$real === Infinity || d.$real === -Infinity || d.$imag === Infinity || d.$imag === -Infinity;
  var nnan = !ninf && (n.$real !== n.$real || n.$imag !== n.$imag);
  var dnan = !dinf && (d.$real !== d.$real || d.$imag !== d.$imag);
  if(nnan || dnan) {
    return new n.constructor(NaN, NaN);
  }
  if (ninf && !dinf) {
    return new n.constructor(Infinity, Infinity);
  }
  if (!ninf && dinf) {
    return new n.constructor(0, 0);
  }
  if (d.$real === 0 && d.$imag === 0) {
    if (n.$real === 0 && n.$imag === 0) {
      return new n.constructor(NaN, NaN);
    }
    return new n.constructor(Infinity, Infinity);
  }
  var a = Math.abs(d.$real);
  var b = Math.abs(d.$imag);
  if (a <= b) {
    var ratio = d.$real / d.$imag;
    var denom = d.$real * ratio + d.$imag;
    return new n.constructor((n.$real * ratio + n.$imag) / denom, (n.$imag * ratio - n.$real) / denom);
  }
  var ratio = d.$imag / d.$real;
  var denom = d.$imag * ratio + d.$real;
  return new n.constructor((n.$imag * ratio + n.$real) / denom, (n.$imag - n.$real * ratio) / denom);
};

var $kindBool = 1;
var $kindInt = 2;
var $kindInt8 = 3;
var $kindInt16 = 4;
var $kindInt32 = 5;
var $kindInt64 = 6;
var $kindUint = 7;
var $kindUint8 = 8;
var $kindUint16 = 9;
var $kindUint32 = 10;
var $kindUint64 = 11;
var $kindUintptr = 12;
var $kindFloat32 = 13;
var $kindFloat64 = 14;
var $kindComplex64 = 15;
var $kindComplex128 = 16;
var $kindArray = 17;
var $kindChan = 18;
var $kindFunc = 19;
var $kindInterface = 20;
var $kindMap = 21;
var $kindPtr = 22;
var $kindSlice = 23;
var $kindString = 24;
var $kindStruct = 25;
var $kindUnsafePointer = 26;

var $methodSynthesizers = [];
var $addMethodSynthesizer = function(f) {
  if ($methodSynthesizers === null) {
    f();
    return;
  }
  $methodSynthesizers.push(f);
};
var $synthesizeMethods = function() {
  $methodSynthesizers.forEach(function(f) { f(); });
  $methodSynthesizers = null;
};

var $ifaceKeyFor = function(x) {
  if (x === $ifaceNil) {
    return 'nil';
  }
  var c = x.constructor;
  return c.string + '$' + c.keyFor(x.$val);
};

var $identity = function(x) { return x; };

var $typeIDCounter = 0;

var $idKey = function(x) {
  if (x.$id === undefined) {
    $idCounter++;
    x.$id = $idCounter;
  }
  return String(x.$id);
};

var $newType = function(size, kind, string, named, pkg, exported, constructor) {
  var typ;
  switch(kind) {
  case $kindBool:
  case $kindInt:
  case $kindInt8:
  case $kindInt16:
  case $kindInt32:
  case $kindUint:
  case $kindUint8:
  case $kindUint16:
  case $kindUint32:
  case $kindUintptr:
  case $kindUnsafePointer:
    typ = function(v) { this.$val = v; };
    typ.wrapped = true;
    typ.keyFor = $identity;
    break;

  case $kindString:
    typ = function(v) { this.$val = v; };
    typ.wrapped = true;
    typ.keyFor = function(x) { return "$" + x; };
    break;

  case $kindFloat32:
  case $kindFloat64:
    typ = function(v) { this.$val = v; };
    typ.wrapped = true;
    typ.keyFor = function(x) { return $floatKey(x); };
    break;

  case $kindInt64:
    typ = function(high, low) {
      this.$high = (high + Math.floor(Math.ceil(low) / 4294967296)) >> 0;
      this.$low = low >>> 0;
      this.$val = this;
    };
    typ.keyFor = function(x) { return x.$high + "$" + x.$low; };
    break;

  case $kindUint64:
    typ = function(high, low) {
      this.$high = (high + Math.floor(Math.ceil(low) / 4294967296)) >>> 0;
      this.$low = low >>> 0;
      this.$val = this;
    };
    typ.keyFor = function(x) { return x.$high + "$" + x.$low; };
    break;

  case $kindComplex64:
    typ = function(real, imag) {
      this.$real = $fround(real);
      this.$imag = $fround(imag);
      this.$val = this;
    };
    typ.keyFor = function(x) { return x.$real + "$" + x.$imag; };
    break;

  case $kindComplex128:
    typ = function(real, imag) {
      this.$real = real;
      this.$imag = imag;
      this.$val = this;
    };
    typ.keyFor = function(x) { return x.$real + "$" + x.$imag; };
    break;

  case $kindArray:
    typ = function(v) { this.$val = v; };
    typ.wrapped = true;
    typ.ptr = $newType(4, $kindPtr, "*" + string, false, "", false, function(array) {
      this.$get = function() { return array; };
      this.$set = function(v) { typ.copy(this, v); };
      this.$val = array;
    });
    typ.init = function(elem, len) {
      typ.elem = elem;
      typ.len = len;
      typ.comparable = elem.comparable;
      typ.keyFor = function(x) {
        return Array.prototype.join.call($mapArray(x, function(e) {
          return String(elem.keyFor(e)).replace(/\\/g, "\\\\").replace(/\$/g, "\\$");
        }), "$");
      };
      typ.copy = function(dst, src) {
        $copyArray(dst, src, 0, 0, src.length, elem);
      };
      typ.ptr.init(typ);
      Object.defineProperty(typ.ptr.nil, "nilCheck", { get: $throwNilPointerError });
    };
    break;

  case $kindChan:
    typ = function(v) { this.$val = v; };
    typ.wrapped = true;
    typ.keyFor = $idKey;
    typ.init = function(elem, sendOnly, recvOnly) {
      typ.elem = elem;
      typ.sendOnly = sendOnly;
      typ.recvOnly = recvOnly;
    };
    break;

  case $kindFunc:
    typ = function(v) { this.$val = v; };
    typ.wrapped = true;
    typ.init = function(params, results, variadic) {
      typ.params = params;
      typ.results = results;
      typ.variadic = variadic;
      typ.comparable = false;
    };
    break;

  case $kindInterface:
    typ = { implementedBy: {}, missingMethodFor: {} };
    typ.keyFor = $ifaceKeyFor;
    typ.init = function(methods) {
      typ.methods = methods;
      methods.forEach(function(m) {
        $ifaceNil[m.prop] = $throwNilPointerError;
      });
    };
    break;

  case $kindMap:
    typ = function(v) { this.$val = v; };
    typ.wrapped = true;
    typ.init = function(key, elem) {
      typ.key = key;
      typ.elem = elem;
      typ.comparable = false;
    };
    break;

  case $kindPtr:
    typ = constructor || function(getter, setter, target) {
      this.$get = getter;
      this.$set = setter;
      this.$target = target;
      this.$val = this;
    };
    typ.keyFor = $idKey;
    typ.init = function(elem) {
      typ.elem = elem;
      typ.wrapped = (elem.kind === $kindArray);
      typ.nil = new typ($throwNilPointerError, $throwNilPointerError);
    };
    break;

  case $kindSlice:
    typ = function(array) {
      if (array.constructor !== typ.nativeArray) {
        array = new typ.nativeArray(array);
      }
      this.$array = array;
      this.$offset = 0;
      this.$length = array.length;
      this.$capacity = array.length;
      this.$val = this;
    };
    typ.init = function(elem) {
      typ.elem = elem;
      typ.comparable = false;
      typ.nativeArray = $nativeArray(elem.kind);
      typ.nil = new typ([]);
    };
    break;

  case $kindStruct:
    typ = function(v) { this.$val = v; };
    typ.wrapped = true;
    typ.ptr = $newType(4, $kindPtr, "*" + string, false, pkg, exported, constructor);
    typ.ptr.elem = typ;
    typ.ptr.prototype.$get = function() { return this; };
    typ.ptr.prototype.$set = function(v) { typ.copy(this, v); };
    typ.init = function(pkgPath, fields) {
      typ.pkgPath = pkgPath;
      typ.fields = fields;
      fields.forEach(function(f) {
        if (!f.typ.comparable) {
          typ.comparable = false;
        }
      });
      typ.keyFor = function(x) {
        var val = x.$val;
        return $mapArray(fields, function(f) {
          return String(f.typ.keyFor(val[f.prop])).replace(/\\/g, "\\\\").replace(/\$/g, "\\$");
        }).join("$");
      };
      typ.copy = function(dst, src) {
        for (var i = 0; i < fields.length; i++) {
          var f = fields[i];
          switch (f.typ.kind) {
          case $kindArray:
          case $kindStruct:
            f.typ.copy(dst[f.prop], src[f.prop]);
            continue;
          default:
            dst[f.prop] = src[f.prop];
            continue;
          }
        }
      };
      /* nil value */
      var properties = {};
      fields.forEach(function(f) {
        properties[f.prop] = { get: $throwNilPointerError, set: $throwNilPointerError };
      });
      typ.ptr.nil = Object.create(constructor.prototype, properties);
      typ.ptr.nil.$val = typ.ptr.nil;
      /* methods for embedded fields */
      $addMethodSynthesizer(function() {
        var synthesizeMethod = function(target, m, f) {
          if (target.prototype[m.prop] !== undefined) { return; }
          target.prototype[m.prop] = function() {
            var v = this.$val[f.prop];
            if (f.typ === $jsObjectPtr) {
              v = new $jsObjectPtr(v);
            }
            if (v.$val === undefined) {
              v = new f.typ(v);
            }
            return v[m.prop].apply(v, arguments);
          };
        };
        fields.forEach(function(f) {
          if (f.embedded) {
            $methodSet(f.typ).forEach(function(m) {
              synthesizeMethod(typ, m, f);
              synthesizeMethod(typ.ptr, m, f);
            });
            $methodSet($ptrType(f.typ)).forEach(function(m) {
              synthesizeMethod(typ.ptr, m, f);
            });
          }
        });
      });
    };
    break;

  default:
    $panic(new $String("invalid kind: " + kind));
  }

  switch (kind) {
  case $kindBool:
  case $kindMap:
    typ.zero = function() { return false; };
    break;

  case $kindInt:
  case $kindInt8:
  case $kindInt16:
  case $kindInt32:
  case $kindUint:
  case $kindUint8 :
  case $kindUint16:
  case $kindUint32:
  case $kindUintptr:
  case $kindUnsafePointer:
  case $kindFloat32:
  case $kindFloat64:
    typ.zero = function() { return 0; };
    break;

  case $kindString:
    typ.zero = function() { return ""; };
    break;

  case $kindInt64:
  case $kindUint64:
  case $kindComplex64:
  case $kindComplex128:
    var zero = new typ(0, 0);
    typ.zero = function() { return zero; };
    break;

  case $kindPtr:
  case $kindSlice:
    typ.zero = function() { return typ.nil; };
    break;

  case $kindChan:
    typ.zero = function() { return $chanNil; };
    break;

  case $kindFunc:
    typ.zero = function() { return $throwNilPointerError; };
    break;

  case $kindInterface:
    typ.zero = function() { return $ifaceNil; };
    break;

  case $kindArray:
    typ.zero = function() {
      var arrayClass = $nativeArray(typ.elem.kind);
      if (arrayClass !== Array) {
        return new arrayClass(typ.len);
      }
      var array = new Array(typ.len);
      for (var i = 0; i < typ.len; i++) {
        array[i] = typ.elem.zero();
      }
      return array;
    };
    break;

  case $kindStruct:
    typ.zero = function() { return new typ.ptr(); };
    break;

  default:
    $panic(new $String("invalid kind: " + kind));
  }

  typ.id = $typeIDCounter;
  $typeIDCounter++;
  typ.size = size;
  typ.kind = kind;
  typ.string = string;
  typ.named = named;
  typ.pkg = pkg;
  typ.exported = exported;
  typ.methods = [];
  typ.methodSetCache = null;
  typ.comparable = true;
  return typ;
};

var $methodSet = function(typ) {
  if (typ.methodSetCache !== null) {
    return typ.methodSetCache;
  }
  var base = {};

  var isPtr = (typ.kind === $kindPtr);
  if (isPtr && typ.elem.kind === $kindInterface) {
    typ.methodSetCache = [];
    return [];
  }

  var current = [{typ: isPtr ? typ.elem : typ, indirect: isPtr}];

  var seen = {};

  while (current.length > 0) {
    var next = [];
    var mset = [];

    current.forEach(function(e) {
      if (seen[e.typ.string]) {
        return;
      }
      seen[e.typ.string] = true;

      if (e.typ.named) {
        mset = mset.concat(e.typ.methods);
        if (e.indirect) {
          mset = mset.concat($ptrType(e.typ).methods);
        }
      }

      switch (e.typ.kind) {
      case $kindStruct:
        e.typ.fields.forEach(function(f) {
          if (f.embedded) {
            var fTyp = f.typ;
            var fIsPtr = (fTyp.kind === $kindPtr);
            next.push({typ: fIsPtr ? fTyp.elem : fTyp, indirect: e.indirect || fIsPtr});
          }
        });
        break;

      case $kindInterface:
        mset = mset.concat(e.typ.methods);
        break;
      }
    });

    mset.forEach(function(m) {
      if (base[m.name] === undefined) {
        base[m.name] = m;
      }
    });

    current = next;
  }

  typ.methodSetCache = [];
  Object.keys(base).sort().forEach(function(name) {
    typ.methodSetCache.push(base[name]);
  });
  return typ.methodSetCache;
};

var $Bool          = $newType( 1, $kindBool,          "bool",           true, "", false, null);
var $Int           = $newType( 4, $kindInt,           "int",            true, "", false, null);
var $Int8          = $newType( 1, $kindInt8,          "int8",           true, "", false, null);
var $Int16         = $newType( 2, $kindInt16,         "int16",          true, "", false, null);
var $Int32         = $newType( 4, $kindInt32,         "int32",          true, "", false, null);
var $Int64         = $newType( 8, $kindInt64,         "int64",          true, "", false, null);
var $Uint          = $newType( 4, $kindUint,          "uint",           true, "", false, null);
var $Uint8         = $newType( 1, $kindUint8,         "uint8",          true, "", false, null);
var $Uint16        = $newType( 2, $kindUint16,        "uint16",         true, "", false, null);
var $Uint32        = $newType( 4, $kindUint32,        "uint32",         true, "", false, null);
var $Uint64        = $newType( 8, $kindUint64,        "uint64",         true, "", false, null);
var $Uintptr       = $newType( 4, $kindUintptr,       "uintptr",        true, "", false, null);
var $Float32       = $newType( 4, $kindFloat32,       "float32",        true, "", false, null);
var $Float64       = $newType( 8, $kindFloat64,       "float64",        true, "", false, null);
var $Complex64     = $newType( 8, $kindComplex64,     "complex64",      true, "", false, null);
var $Complex128    = $newType(16, $kindComplex128,    "complex128",     true, "", false, null);
var $String        = $newType( 8, $kindString,        "string",         true, "", false, null);
var $UnsafePointer = $newType( 4, $kindUnsafePointer, "unsafe.Pointer", true, "", false, null);

var $nativeArray = function(elemKind) {
  switch (elemKind) {
  case $kindInt:
    return Int32Array;
  case $kindInt8:
    return Int8Array;
  case $kindInt16:
    return Int16Array;
  case $kindInt32:
    return Int32Array;
  case $kindUint:
    return Uint32Array;
  case $kindUint8:
    return Uint8Array;
  case $kindUint16:
    return Uint16Array;
  case $kindUint32:
    return Uint32Array;
  case $kindUintptr:
    return Uint32Array;
  case $kindFloat32:
    return Float32Array;
  case $kindFloat64:
    return Float64Array;
  default:
    return Array;
  }
};
var $toNativeArray = function(elemKind, array) {
  var nativeArray = $nativeArray(elemKind);
  if (nativeArray === Array) {
    return array;
  }
  return new nativeArray(array);
};
var $arrayTypes = {};
var $arrayType = function(elem, len) {
  var typeKey = elem.id + "$" + len;
  var typ = $arrayTypes[typeKey];
  if (typ === undefined) {
    typ = $newType(12, $kindArray, "[" + len + "]" + elem.string, false, "", false, null);
    $arrayTypes[typeKey] = typ;
    typ.init(elem, len);
  }
  return typ;
};

var $chanType = function(elem, sendOnly, recvOnly) {
  var string = (recvOnly ? "<-" : "") + "chan" + (sendOnly ? "<- " : " ") + elem.string;
  var field = sendOnly ? "SendChan" : (recvOnly ? "RecvChan" : "Chan");
  var typ = elem[field];
  if (typ === undefined) {
    typ = $newType(4, $kindChan, string, false, "", false, null);
    elem[field] = typ;
    typ.init(elem, sendOnly, recvOnly);
  }
  return typ;
};
var $Chan = function(elem, capacity) {
  if (capacity < 0 || capacity > 2147483647) {
    $throwRuntimeError("makechan: size out of range");
  }
  this.$elem = elem;
  this.$capacity = capacity;
  this.$buffer = [];
  this.$sendQueue = [];
  this.$recvQueue = [];
  this.$closed = false;
};
var $chanNil = new $Chan(null, 0);
$chanNil.$sendQueue = $chanNil.$recvQueue = { length: 0, push: function() {}, shift: function() { return undefined; }, indexOf: function() { return -1; } };

var $funcTypes = {};
var $funcType = function(params, results, variadic) {
  var typeKey = $mapArray(params, function(p) { return p.id; }).join(",") + "$" + $mapArray(results, function(r) { return r.id; }).join(",") + "$" + variadic;
  var typ = $funcTypes[typeKey];
  if (typ === undefined) {
    var paramTypes = $mapArray(params, function(p) { return p.string; });
    if (variadic) {
      paramTypes[paramTypes.length - 1] = "..." + paramTypes[paramTypes.length - 1].substr(2);
    }
    var string = "func(" + paramTypes.join(", ") + ")";
    if (results.length === 1) {
      string += " " + results[0].string;
    } else if (results.length > 1) {
      string += " (" + $mapArray(results, function(r) { return r.string; }).join(", ") + ")";
    }
    typ = $newType(4, $kindFunc, string, false, "", false, null);
    $funcTypes[typeKey] = typ;
    typ.init(params, results, variadic);
  }
  return typ;
};

var $interfaceTypes = {};
var $interfaceType = function(methods) {
  var typeKey = $mapArray(methods, function(m) { return m.pkg + "," + m.name + "," + m.typ.id; }).join("$");
  var typ = $interfaceTypes[typeKey];
  if (typ === undefined) {
    var string = "interface {}";
    if (methods.length !== 0) {
      string = "interface { " + $mapArray(methods, function(m) {
        return (m.pkg !== "" ? m.pkg + "." : "") + m.name + m.typ.string.substr(4);
      }).join("; ") + " }";
    }
    typ = $newType(8, $kindInterface, string, false, "", false, null);
    $interfaceTypes[typeKey] = typ;
    typ.init(methods);
  }
  return typ;
};
var $emptyInterface = $interfaceType([]);
var $ifaceNil = {};
var $error = $newType(8, $kindInterface, "error", true, "", false, null);
$error.init([{prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}]);

var $mapTypes = {};
var $mapType = function(key, elem) {
  var typeKey = key.id + "$" + elem.id;
  var typ = $mapTypes[typeKey];
  if (typ === undefined) {
    typ = $newType(4, $kindMap, "map[" + key.string + "]" + elem.string, false, "", false, null);
    $mapTypes[typeKey] = typ;
    typ.init(key, elem);
  }
  return typ;
};
var $makeMap = function(keyForFunc, entries) {
  var m = {};
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    m[keyForFunc(e.k)] = e;
  }
  return m;
};

var $ptrType = function(elem) {
  var typ = elem.ptr;
  if (typ === undefined) {
    typ = $newType(4, $kindPtr, "*" + elem.string, false, "", elem.exported, null);
    elem.ptr = typ;
    typ.init(elem);
  }
  return typ;
};

var $newDataPointer = function(data, constructor) {
  if (constructor.elem.kind === $kindStruct) {
    return data;
  }
  return new constructor(function() { return data; }, function(v) { data = v; });
};

var $indexPtr = function(array, index, constructor) {
  array.$ptr = array.$ptr || {};
  return array.$ptr[index] || (array.$ptr[index] = new constructor(function() { return array[index]; }, function(v) { array[index] = v; }));
};

var $sliceType = function(elem) {
  var typ = elem.slice;
  if (typ === undefined) {
    typ = $newType(12, $kindSlice, "[]" + elem.string, false, "", false, null);
    elem.slice = typ;
    typ.init(elem);
  }
  return typ;
};
var $makeSlice = function(typ, length, capacity) {
  capacity = capacity || length;
  if (length < 0 || length > 2147483647) {
    $throwRuntimeError("makeslice: len out of range");
  }
  if (capacity < 0 || capacity < length || capacity > 2147483647) {
    $throwRuntimeError("makeslice: cap out of range");
  }
  var array = new typ.nativeArray(capacity);
  if (typ.nativeArray === Array) {
    for (var i = 0; i < capacity; i++) {
      array[i] = typ.elem.zero();
    }
  }
  var slice = new typ(array);
  slice.$length = length;
  return slice;
};

var $structTypes = {};
var $structType = function(pkgPath, fields) {
  var typeKey = $mapArray(fields, function(f) { return f.name + "," + f.typ.id + "," + f.tag; }).join("$");
  var typ = $structTypes[typeKey];
  if (typ === undefined) {
    var string = "struct { " + $mapArray(fields, function(f) {
      return f.name + " " + f.typ.string + (f.tag !== "" ? (" \"" + f.tag.replace(/\\/g, "\\\\").replace(/"/g, "\\\"") + "\"") : "");
    }).join("; ") + " }";
    if (fields.length === 0) {
      string = "struct {}";
    }
    typ = $newType(0, $kindStruct, string, false, "", false, function() {
      this.$val = this;
      for (var i = 0; i < fields.length; i++) {
        var f = fields[i];
        var arg = arguments[i];
        this[f.prop] = arg !== undefined ? arg : f.typ.zero();
      }
    });
    $structTypes[typeKey] = typ;
    typ.init(pkgPath, fields);
  }
  return typ;
};

var $assertType = function(value, type, returnTuple) {
  var isInterface = (type.kind === $kindInterface), ok, missingMethod = "";
  if (value === $ifaceNil) {
    ok = false;
  } else if (!isInterface) {
    ok = value.constructor === type;
  } else {
    var valueTypeString = value.constructor.string;
    ok = type.implementedBy[valueTypeString];
    if (ok === undefined) {
      ok = true;
      var valueMethodSet = $methodSet(value.constructor);
      var interfaceMethods = type.methods;
      for (var i = 0; i < interfaceMethods.length; i++) {
        var tm = interfaceMethods[i];
        var found = false;
        for (var j = 0; j < valueMethodSet.length; j++) {
          var vm = valueMethodSet[j];
          if (vm.name === tm.name && vm.pkg === tm.pkg && vm.typ === tm.typ) {
            found = true;
            break;
          }
        }
        if (!found) {
          ok = false;
          type.missingMethodFor[valueTypeString] = tm.name;
          break;
        }
      }
      type.implementedBy[valueTypeString] = ok;
    }
    if (!ok) {
      missingMethod = type.missingMethodFor[valueTypeString];
    }
  }

  if (!ok) {
    if (returnTuple) {
      return [type.zero(), false];
    }
    $panic(new $packages["runtime"].TypeAssertionError.ptr(
      $packages["runtime"]._type.ptr.nil,
      (value === $ifaceNil ? $packages["runtime"]._type.ptr.nil : new $packages["runtime"]._type.ptr(value.constructor.string)),
      new $packages["runtime"]._type.ptr(type.string),
      missingMethod));
  }

  if (!isInterface) {
    value = value.$val;
  }
  if (type === $jsObjectPtr) {
    value = value.object;
  }
  return returnTuple ? [value, true] : value;
};

var $stackDepthOffset = 0;
var $getStackDepth = function() {
  var err = new Error();
  if (err.stack === undefined) {
    return undefined;
  }
  return $stackDepthOffset + err.stack.split("\n").length;
};

var $panicStackDepth = null, $panicValue;
var $callDeferred = function(deferred, jsErr, fromPanic) {
  if (!fromPanic && deferred !== null && deferred.index >= $curGoroutine.deferStack.length) {
    throw jsErr;
  }
  if (jsErr !== null) {
    var newErr = null;
    try {
      $curGoroutine.deferStack.push(deferred);
      $panic(new $jsErrorPtr(jsErr));
    } catch (err) {
      newErr = err;
    }
    $curGoroutine.deferStack.pop();
    $callDeferred(deferred, newErr);
    return;
  }
  if ($curGoroutine.asleep) {
    return;
  }

  $stackDepthOffset--;
  var outerPanicStackDepth = $panicStackDepth;
  var outerPanicValue = $panicValue;

  var localPanicValue = $curGoroutine.panicStack.pop();
  if (localPanicValue !== undefined) {
    $panicStackDepth = $getStackDepth();
    $panicValue = localPanicValue;
  }

  try {
    while (true) {
      if (deferred === null) {
        deferred = $curGoroutine.deferStack[$curGoroutine.deferStack.length - 1];
        if (deferred === undefined) {
          /* The panic reached the top of the stack. Clear it and throw it as a JavaScript error. */
          $panicStackDepth = null;
          if (localPanicValue.Object instanceof Error) {
            throw localPanicValue.Object;
          }
          var msg;
          if (localPanicValue.constructor === $String) {
            msg = localPanicValue.$val;
          } else if (localPanicValue.Error !== undefined) {
            msg = localPanicValue.Error();
          } else if (localPanicValue.String !== undefined) {
            msg = localPanicValue.String();
          } else {
            msg = localPanicValue;
          }
          throw new Error(msg);
        }
      }
      var call = deferred.pop();
      if (call === undefined) {
        $curGoroutine.deferStack.pop();
        if (localPanicValue !== undefined) {
          deferred = null;
          continue;
        }
        return;
      }
      var r = call[0].apply(call[2], call[1]);
      if (r && r.$blk !== undefined) {
        deferred.push([r.$blk, [], r]);
        if (fromPanic) {
          throw null;
        }
        return;
      }

      if (localPanicValue !== undefined && $panicStackDepth === null) {
        throw null; /* error was recovered */
      }
    }
  } finally {
    if (localPanicValue !== undefined) {
      if ($panicStackDepth !== null) {
        $curGoroutine.panicStack.push(localPanicValue);
      }
      $panicStackDepth = outerPanicStackDepth;
      $panicValue = outerPanicValue;
    }
    $stackDepthOffset++;
  }
};

var $panic = function(value) {
  $curGoroutine.panicStack.push(value);
  $callDeferred(null, null, true);
};
var $recover = function() {
  if ($panicStackDepth === null || ($panicStackDepth !== undefined && $panicStackDepth !== $getStackDepth() - 2)) {
    return $ifaceNil;
  }
  $panicStackDepth = null;
  return $panicValue;
};
var $throw = function(err) { throw err; };

var $noGoroutine = { asleep: false, exit: false, deferStack: [], panicStack: [] };
var $curGoroutine = $noGoroutine, $totalGoroutines = 0, $awakeGoroutines = 0, $checkForDeadlock = true;
var $mainFinished = false;
var $go = function(fun, args) {
  $totalGoroutines++;
  $awakeGoroutines++;
  var $goroutine = function() {
    try {
      $curGoroutine = $goroutine;
      var r = fun.apply(undefined, args);
      if (r && r.$blk !== undefined) {
        fun = function() { return r.$blk(); };
        args = [];
        return;
      }
      $goroutine.exit = true;
    } catch (err) {
      if (!$goroutine.exit) {
        throw err;
      }
    } finally {
      $curGoroutine = $noGoroutine;
      if ($goroutine.exit) { /* also set by runtime.Goexit() */
        $totalGoroutines--;
        $goroutine.asleep = true;
      }
      if ($goroutine.asleep) {
        $awakeGoroutines--;
        if (!$mainFinished && $awakeGoroutines === 0 && $checkForDeadlock) {
          console.error("fatal error: all goroutines are asleep - deadlock!");
          if ($global.process !== undefined) {
            $global.process.exit(2);
          }
        }
      }
    }
  };
  $goroutine.asleep = false;
  $goroutine.exit = false;
  $goroutine.deferStack = [];
  $goroutine.panicStack = [];
  $schedule($goroutine);
};

var $scheduled = [];
var $runScheduled = function() {
  try {
    var r;
    while ((r = $scheduled.shift()) !== undefined) {
      r();
    }
  } finally {
    if ($scheduled.length > 0) {
      setTimeout($runScheduled, 0);
    }
  }
};

var $schedule = function(goroutine) {
  if (goroutine.asleep) {
    goroutine.asleep = false;
    $awakeGoroutines++;
  }
  $scheduled.push(goroutine);
  if ($curGoroutine === $noGoroutine) {
    $runScheduled();
  }
};

var $setTimeout = function(f, t) {
  $awakeGoroutines++;
  return setTimeout(function() {
    $awakeGoroutines--;
    f();
  }, t);
};

var $block = function() {
  if ($curGoroutine === $noGoroutine) {
    $throwRuntimeError("cannot block in JavaScript callback, fix by wrapping code in goroutine");
  }
  $curGoroutine.asleep = true;
};

var $send = function(chan, value) {
  if (chan.$closed) {
    $throwRuntimeError("send on closed channel");
  }
  var queuedRecv = chan.$recvQueue.shift();
  if (queuedRecv !== undefined) {
    queuedRecv([value, true]);
    return;
  }
  if (chan.$buffer.length < chan.$capacity) {
    chan.$buffer.push(value);
    return;
  }

  var thisGoroutine = $curGoroutine;
  var closedDuringSend;
  chan.$sendQueue.push(function(closed) {
    closedDuringSend = closed;
    $schedule(thisGoroutine);
    return value;
  });
  $block();
  return {
    $blk: function() {
      if (closedDuringSend) {
        $throwRuntimeError("send on closed channel");
      }
    }
  };
};
var $recv = function(chan) {
  var queuedSend = chan.$sendQueue.shift();
  if (queuedSend !== undefined) {
    chan.$buffer.push(queuedSend(false));
  }
  var bufferedValue = chan.$buffer.shift();
  if (bufferedValue !== undefined) {
    return [bufferedValue, true];
  }
  if (chan.$closed) {
    return [chan.$elem.zero(), false];
  }

  var thisGoroutine = $curGoroutine;
  var f = { $blk: function() { return this.value; } };
  var queueEntry = function(v) {
    f.value = v;
    $schedule(thisGoroutine);
  };
  chan.$recvQueue.push(queueEntry);
  $block();
  return f;
};
var $close = function(chan) {
  if (chan.$closed) {
    $throwRuntimeError("close of closed channel");
  }
  chan.$closed = true;
  while (true) {
    var queuedSend = chan.$sendQueue.shift();
    if (queuedSend === undefined) {
      break;
    }
    queuedSend(true); /* will panic */
  }
  while (true) {
    var queuedRecv = chan.$recvQueue.shift();
    if (queuedRecv === undefined) {
      break;
    }
    queuedRecv([chan.$elem.zero(), false]);
  }
};
var $select = function(comms) {
  var ready = [];
  var selection = -1;
  for (var i = 0; i < comms.length; i++) {
    var comm = comms[i];
    var chan = comm[0];
    switch (comm.length) {
    case 0: /* default */
      selection = i;
      break;
    case 1: /* recv */
      if (chan.$sendQueue.length !== 0 || chan.$buffer.length !== 0 || chan.$closed) {
        ready.push(i);
      }
      break;
    case 2: /* send */
      if (chan.$closed) {
        $throwRuntimeError("send on closed channel");
      }
      if (chan.$recvQueue.length !== 0 || chan.$buffer.length < chan.$capacity) {
        ready.push(i);
      }
      break;
    }
  }

  if (ready.length !== 0) {
    selection = ready[Math.floor(Math.random() * ready.length)];
  }
  if (selection !== -1) {
    var comm = comms[selection];
    switch (comm.length) {
    case 0: /* default */
      return [selection];
    case 1: /* recv */
      return [selection, $recv(comm[0])];
    case 2: /* send */
      $send(comm[0], comm[1]);
      return [selection];
    }
  }

  var entries = [];
  var thisGoroutine = $curGoroutine;
  var f = { $blk: function() { return this.selection; } };
  var removeFromQueues = function() {
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var queue = entry[0];
      var index = queue.indexOf(entry[1]);
      if (index !== -1) {
        queue.splice(index, 1);
      }
    }
  };
  for (var i = 0; i < comms.length; i++) {
    (function(i) {
      var comm = comms[i];
      switch (comm.length) {
      case 1: /* recv */
        var queueEntry = function(value) {
          f.selection = [i, value];
          removeFromQueues();
          $schedule(thisGoroutine);
        };
        entries.push([comm[0].$recvQueue, queueEntry]);
        comm[0].$recvQueue.push(queueEntry);
        break;
      case 2: /* send */
        var queueEntry = function() {
          if (comm[0].$closed) {
            $throwRuntimeError("send on closed channel");
          }
          f.selection = [i];
          removeFromQueues();
          $schedule(thisGoroutine);
          return comm[1];
        };
        entries.push([comm[0].$sendQueue, queueEntry]);
        comm[0].$sendQueue.push(queueEntry);
        break;
      }
    })(i);
  }
  $block();
  return f;
};

var $jsObjectPtr, $jsErrorPtr;

var $needsExternalization = function(t) {
  switch (t.kind) {
    case $kindBool:
    case $kindInt:
    case $kindInt8:
    case $kindInt16:
    case $kindInt32:
    case $kindUint:
    case $kindUint8:
    case $kindUint16:
    case $kindUint32:
    case $kindUintptr:
    case $kindFloat32:
    case $kindFloat64:
      return false;
    default:
      return t !== $jsObjectPtr;
  }
};

var $externalize = function(v, t) {
  if (t === $jsObjectPtr) {
    return v;
  }
  switch (t.kind) {
  case $kindBool:
  case $kindInt:
  case $kindInt8:
  case $kindInt16:
  case $kindInt32:
  case $kindUint:
  case $kindUint8:
  case $kindUint16:
  case $kindUint32:
  case $kindUintptr:
  case $kindFloat32:
  case $kindFloat64:
    return v;
  case $kindInt64:
  case $kindUint64:
    return $flatten64(v);
  case $kindArray:
    if ($needsExternalization(t.elem)) {
      return $mapArray(v, function(e) { return $externalize(e, t.elem); });
    }
    return v;
  case $kindFunc:
    return $externalizeFunction(v, t, false);
  case $kindInterface:
    if (v === $ifaceNil) {
      return null;
    }
    if (v.constructor === $jsObjectPtr) {
      return v.$val.object;
    }
    return $externalize(v.$val, v.constructor);
  case $kindMap:
    var m = {};
    var keys = $keys(v);
    for (var i = 0; i < keys.length; i++) {
      var entry = v[keys[i]];
      m[$externalize(entry.k, t.key)] = $externalize(entry.v, t.elem);
    }
    return m;
  case $kindPtr:
    if (v === t.nil) {
      return null;
    }
    return $externalize(v.$get(), t.elem);
  case $kindSlice:
    if ($needsExternalization(t.elem)) {
      return $mapArray($sliceToArray(v), function(e) { return $externalize(e, t.elem); });
    }
    return $sliceToArray(v);
  case $kindString:
    if ($isASCII(v)) {
      return v;
    }
    var s = "", r;
    for (var i = 0; i < v.length; i += r[1]) {
      r = $decodeRune(v, i);
      var c = r[0];
      if (c > 0xFFFF) {
        var h = Math.floor((c - 0x10000) / 0x400) + 0xD800;
        var l = (c - 0x10000) % 0x400 + 0xDC00;
        s += String.fromCharCode(h, l);
        continue;
      }
      s += String.fromCharCode(c);
    }
    return s;
  case $kindStruct:
    var timePkg = $packages["time"];
    if (timePkg !== undefined && v.constructor === timePkg.Time.ptr) {
      var milli = $div64(v.UnixNano(), new $Int64(0, 1000000));
      return new Date($flatten64(milli));
    }

    var noJsObject = {};
    var searchJsObject = function(v, t) {
      if (t === $jsObjectPtr) {
        return v;
      }
      switch (t.kind) {
      case $kindPtr:
        if (v === t.nil) {
          return noJsObject;
        }
        return searchJsObject(v.$get(), t.elem);
      case $kindStruct:
        var f = t.fields[0];
        return searchJsObject(v[f.prop], f.typ);
      case $kindInterface:
        return searchJsObject(v.$val, v.constructor);
      default:
        return noJsObject;
      }
    };
    var o = searchJsObject(v, t);
    if (o !== noJsObject) {
      return o;
    }

    o = {};
    for (var i = 0; i < t.fields.length; i++) {
      var f = t.fields[i];
      if (!f.exported) {
        continue;
      }
      o[f.name] = $externalize(v[f.prop], f.typ);
    }
    return o;
  }
  $throwRuntimeError("cannot externalize " + t.string);
};

var $externalizeFunction = function(v, t, passThis) {
  if (v === $throwNilPointerError) {
    return null;
  }
  if (v.$externalizeWrapper === undefined) {
    $checkForDeadlock = false;
    v.$externalizeWrapper = function() {
      var args = [];
      for (var i = 0; i < t.params.length; i++) {
        if (t.variadic && i === t.params.length - 1) {
          var vt = t.params[i].elem, varargs = [];
          for (var j = i; j < arguments.length; j++) {
            varargs.push($internalize(arguments[j], vt));
          }
          args.push(new (t.params[i])(varargs));
          break;
        }
        args.push($internalize(arguments[i], t.params[i]));
      }
      var result = v.apply(passThis ? this : undefined, args);
      switch (t.results.length) {
      case 0:
        return;
      case 1:
        return $externalize(result, t.results[0]);
      default:
        for (var i = 0; i < t.results.length; i++) {
          result[i] = $externalize(result[i], t.results[i]);
        }
        return result;
      }
    };
  }
  return v.$externalizeWrapper;
};

var $internalize = function(v, t, recv) {
  if (t === $jsObjectPtr) {
    return v;
  }
  if (t === $jsObjectPtr.elem) {
    $throwRuntimeError("cannot internalize js.Object, use *js.Object instead");
  }
  if (v && v.__internal_object__ !== undefined) {
    return $assertType(v.__internal_object__, t, false);
  }
  var timePkg = $packages["time"];
  if (timePkg !== undefined && t === timePkg.Time) {
    if (!(v !== null && v !== undefined && v.constructor === Date)) {
      $throwRuntimeError("cannot internalize time.Time from " + typeof v + ", must be Date");
    }
    return timePkg.Unix(new $Int64(0, 0), new $Int64(0, v.getTime() * 1000000));
  }
  switch (t.kind) {
  case $kindBool:
    return !!v;
  case $kindInt:
    return parseInt(v);
  case $kindInt8:
    return parseInt(v) << 24 >> 24;
  case $kindInt16:
    return parseInt(v) << 16 >> 16;
  case $kindInt32:
    return parseInt(v) >> 0;
  case $kindUint:
    return parseInt(v);
  case $kindUint8:
    return parseInt(v) << 24 >>> 24;
  case $kindUint16:
    return parseInt(v) << 16 >>> 16;
  case $kindUint32:
  case $kindUintptr:
    return parseInt(v) >>> 0;
  case $kindInt64:
  case $kindUint64:
    return new t(0, v);
  case $kindFloat32:
  case $kindFloat64:
    return parseFloat(v);
  case $kindArray:
    if (v.length !== t.len) {
      $throwRuntimeError("got array with wrong size from JavaScript native");
    }
    return $mapArray(v, function(e) { return $internalize(e, t.elem); });
  case $kindFunc:
    return function() {
      var args = [];
      for (var i = 0; i < t.params.length; i++) {
        if (t.variadic && i === t.params.length - 1) {
          var vt = t.params[i].elem, varargs = arguments[i];
          for (var j = 0; j < varargs.$length; j++) {
            args.push($externalize(varargs.$array[varargs.$offset + j], vt));
          }
          break;
        }
        args.push($externalize(arguments[i], t.params[i]));
      }
      var result = v.apply(recv, args);
      switch (t.results.length) {
      case 0:
        return;
      case 1:
        return $internalize(result, t.results[0]);
      default:
        for (var i = 0; i < t.results.length; i++) {
          result[i] = $internalize(result[i], t.results[i]);
        }
        return result;
      }
    };
  case $kindInterface:
    if (t.methods.length !== 0) {
      $throwRuntimeError("cannot internalize " + t.string);
    }
    if (v === null) {
      return $ifaceNil;
    }
    if (v === undefined) {
      return new $jsObjectPtr(undefined);
    }
    switch (v.constructor) {
    case Int8Array:
      return new ($sliceType($Int8))(v);
    case Int16Array:
      return new ($sliceType($Int16))(v);
    case Int32Array:
      return new ($sliceType($Int))(v);
    case Uint8Array:
      return new ($sliceType($Uint8))(v);
    case Uint16Array:
      return new ($sliceType($Uint16))(v);
    case Uint32Array:
      return new ($sliceType($Uint))(v);
    case Float32Array:
      return new ($sliceType($Float32))(v);
    case Float64Array:
      return new ($sliceType($Float64))(v);
    case Array:
      return $internalize(v, $sliceType($emptyInterface));
    case Boolean:
      return new $Bool(!!v);
    case Date:
      if (timePkg === undefined) {
        /* time package is not present, internalize as &js.Object{Date} so it can be externalized into original Date. */
        return new $jsObjectPtr(v);
      }
      return new timePkg.Time($internalize(v, timePkg.Time));
    case Function:
      var funcType = $funcType([$sliceType($emptyInterface)], [$jsObjectPtr], true);
      return new funcType($internalize(v, funcType));
    case Number:
      return new $Float64(parseFloat(v));
    case String:
      return new $String($internalize(v, $String));
    default:
      if ($global.Node && v instanceof $global.Node) {
        return new $jsObjectPtr(v);
      }
      var mapType = $mapType($String, $emptyInterface);
      return new mapType($internalize(v, mapType));
    }
  case $kindMap:
    var m = {};
    var keys = $keys(v);
    for (var i = 0; i < keys.length; i++) {
      var k = $internalize(keys[i], t.key);
      m[t.key.keyFor(k)] = { k: k, v: $internalize(v[keys[i]], t.elem) };
    }
    return m;
  case $kindPtr:
    if (t.elem.kind === $kindStruct) {
      return $internalize(v, t.elem);
    }
  case $kindSlice:
    return new t($mapArray(v, function(e) { return $internalize(e, t.elem); }));
  case $kindString:
    v = String(v);
    if ($isASCII(v)) {
      return v;
    }
    var s = "";
    var i = 0;
    while (i < v.length) {
      var h = v.charCodeAt(i);
      if (0xD800 <= h && h <= 0xDBFF) {
        var l = v.charCodeAt(i + 1);
        var c = (h - 0xD800) * 0x400 + l - 0xDC00 + 0x10000;
        s += $encodeRune(c);
        i += 2;
        continue;
      }
      s += $encodeRune(h);
      i++;
    }
    return s;
  case $kindStruct:
    var noJsObject = {};
    var searchJsObject = function(t) {
      if (t === $jsObjectPtr) {
        return v;
      }
      if (t === $jsObjectPtr.elem) {
        $throwRuntimeError("cannot internalize js.Object, use *js.Object instead");
      }
      switch (t.kind) {
      case $kindPtr:
        return searchJsObject(t.elem);
      case $kindStruct:
        var f = t.fields[0];
        var o = searchJsObject(f.typ);
        if (o !== noJsObject) {
          var n = new t.ptr();
          n[f.prop] = o;
          return n;
        }
        return noJsObject;
      default:
        return noJsObject;
      }
    };
    var o = searchJsObject(t);
    if (o !== noJsObject) {
      return o;
    }
  }
  $throwRuntimeError("cannot internalize " + t.string);
};

/* $isASCII reports whether string s contains only ASCII characters. */
var $isASCII = function(s) {
  for (var i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) >= 128) {
      return false;
    }
  }
  return true;
};

$packages["github.com/gopherjs/gopherjs/js"] = (function() {
	var $pkg = {}, $init, Object, Error, sliceType, ptrType, ptrType$1, init;
	Object = $pkg.Object = $newType(0, $kindStruct, "js.Object", true, "github.com/gopherjs/gopherjs/js", true, function(object_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.object = null;
			return;
		}
		this.object = object_;
	});
	Error = $pkg.Error = $newType(0, $kindStruct, "js.Error", true, "github.com/gopherjs/gopherjs/js", true, function(Object_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Object = null;
			return;
		}
		this.Object = Object_;
	});
	sliceType = $sliceType($emptyInterface);
	ptrType = $ptrType(Object);
	ptrType$1 = $ptrType(Error);
	Object.ptr.prototype.Get = function(key) {
		var key, o;
		o = this;
		return o.object[$externalize(key, $String)];
	};
	Object.prototype.Get = function(key) { return this.$val.Get(key); };
	Object.ptr.prototype.Set = function(key, value) {
		var key, o, value;
		o = this;
		o.object[$externalize(key, $String)] = $externalize(value, $emptyInterface);
	};
	Object.prototype.Set = function(key, value) { return this.$val.Set(key, value); };
	Object.ptr.prototype.Delete = function(key) {
		var key, o;
		o = this;
		delete o.object[$externalize(key, $String)];
	};
	Object.prototype.Delete = function(key) { return this.$val.Delete(key); };
	Object.ptr.prototype.Length = function() {
		var o;
		o = this;
		return $parseInt(o.object.length);
	};
	Object.prototype.Length = function() { return this.$val.Length(); };
	Object.ptr.prototype.Index = function(i) {
		var i, o;
		o = this;
		return o.object[i];
	};
	Object.prototype.Index = function(i) { return this.$val.Index(i); };
	Object.ptr.prototype.SetIndex = function(i, value) {
		var i, o, value;
		o = this;
		o.object[i] = $externalize(value, $emptyInterface);
	};
	Object.prototype.SetIndex = function(i, value) { return this.$val.SetIndex(i, value); };
	Object.ptr.prototype.Call = function(name, args) {
		var args, name, o, obj;
		o = this;
		return (obj = o.object, obj[$externalize(name, $String)].apply(obj, $externalize(args, sliceType)));
	};
	Object.prototype.Call = function(name, args) { return this.$val.Call(name, args); };
	Object.ptr.prototype.Invoke = function(args) {
		var args, o;
		o = this;
		return o.object.apply(undefined, $externalize(args, sliceType));
	};
	Object.prototype.Invoke = function(args) { return this.$val.Invoke(args); };
	Object.ptr.prototype.New = function(args) {
		var args, o;
		o = this;
		return new ($global.Function.prototype.bind.apply(o.object, [undefined].concat($externalize(args, sliceType))));
	};
	Object.prototype.New = function(args) { return this.$val.New(args); };
	Object.ptr.prototype.Bool = function() {
		var o;
		o = this;
		return !!(o.object);
	};
	Object.prototype.Bool = function() { return this.$val.Bool(); };
	Object.ptr.prototype.String = function() {
		var o;
		o = this;
		return $internalize(o.object, $String);
	};
	Object.prototype.String = function() { return this.$val.String(); };
	Object.ptr.prototype.Int = function() {
		var o;
		o = this;
		return $parseInt(o.object) >> 0;
	};
	Object.prototype.Int = function() { return this.$val.Int(); };
	Object.ptr.prototype.Int64 = function() {
		var o;
		o = this;
		return $internalize(o.object, $Int64);
	};
	Object.prototype.Int64 = function() { return this.$val.Int64(); };
	Object.ptr.prototype.Uint64 = function() {
		var o;
		o = this;
		return $internalize(o.object, $Uint64);
	};
	Object.prototype.Uint64 = function() { return this.$val.Uint64(); };
	Object.ptr.prototype.Float = function() {
		var o;
		o = this;
		return $parseFloat(o.object);
	};
	Object.prototype.Float = function() { return this.$val.Float(); };
	Object.ptr.prototype.Interface = function() {
		var o;
		o = this;
		return $internalize(o.object, $emptyInterface);
	};
	Object.prototype.Interface = function() { return this.$val.Interface(); };
	Object.ptr.prototype.Unsafe = function() {
		var o;
		o = this;
		return o.object;
	};
	Object.prototype.Unsafe = function() { return this.$val.Unsafe(); };
	Error.ptr.prototype.Error = function() {
		var err;
		err = this;
		return "JavaScript error: " + $internalize(err.Object.message, $String);
	};
	Error.prototype.Error = function() { return this.$val.Error(); };
	Error.ptr.prototype.Stack = function() {
		var err;
		err = this;
		return $internalize(err.Object.stack, $String);
	};
	Error.prototype.Stack = function() { return this.$val.Stack(); };
	init = function() {
		var e;
		e = new Error.ptr(null);
		$unused(e);
	};
	ptrType.methods = [{prop: "Get", name: "Get", pkg: "", typ: $funcType([$String], [ptrType], false)}, {prop: "Set", name: "Set", pkg: "", typ: $funcType([$String, $emptyInterface], [], false)}, {prop: "Delete", name: "Delete", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Length", name: "Length", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Index", name: "Index", pkg: "", typ: $funcType([$Int], [ptrType], false)}, {prop: "SetIndex", name: "SetIndex", pkg: "", typ: $funcType([$Int, $emptyInterface], [], false)}, {prop: "Call", name: "Call", pkg: "", typ: $funcType([$String, sliceType], [ptrType], true)}, {prop: "Invoke", name: "Invoke", pkg: "", typ: $funcType([sliceType], [ptrType], true)}, {prop: "New", name: "New", pkg: "", typ: $funcType([sliceType], [ptrType], true)}, {prop: "Bool", name: "Bool", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "String", name: "String", pkg: "", typ: $funcType([], [$String], false)}, {prop: "Int", name: "Int", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Int64", name: "Int64", pkg: "", typ: $funcType([], [$Int64], false)}, {prop: "Uint64", name: "Uint64", pkg: "", typ: $funcType([], [$Uint64], false)}, {prop: "Float", name: "Float", pkg: "", typ: $funcType([], [$Float64], false)}, {prop: "Interface", name: "Interface", pkg: "", typ: $funcType([], [$emptyInterface], false)}, {prop: "Unsafe", name: "Unsafe", pkg: "", typ: $funcType([], [$Uintptr], false)}];
	ptrType$1.methods = [{prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}, {prop: "Stack", name: "Stack", pkg: "", typ: $funcType([], [$String], false)}];
	Object.init("github.com/gopherjs/gopherjs/js", [{prop: "object", name: "object", embedded: false, exported: false, typ: ptrType, tag: ""}]);
	Error.init("", [{prop: "Object", name: "Object", embedded: true, exported: true, typ: ptrType, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		init();
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["internal/cpu"] = (function() {
	var $pkg = {}, $init;
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["internal/bytealg"] = (function() {
	var $pkg = {}, $init, cpu;
	cpu = $packages["internal/cpu"];
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = cpu.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["runtime/internal/sys"] = (function() {
	var $pkg = {}, $init;
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["runtime"] = (function() {
	var $pkg = {}, $init, js, bytealg, sys, _type, TypeAssertionError, errorString, ptrType, ptrType$4, init, GOROOT, Goexit, throw$1;
	js = $packages["github.com/gopherjs/gopherjs/js"];
	bytealg = $packages["internal/bytealg"];
	sys = $packages["runtime/internal/sys"];
	_type = $pkg._type = $newType(0, $kindStruct, "runtime._type", true, "runtime", false, function(str_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.str = "";
			return;
		}
		this.str = str_;
	});
	TypeAssertionError = $pkg.TypeAssertionError = $newType(0, $kindStruct, "runtime.TypeAssertionError", true, "runtime", true, function(_interface_, concrete_, asserted_, missingMethod_) {
		this.$val = this;
		if (arguments.length === 0) {
			this._interface = ptrType.nil;
			this.concrete = ptrType.nil;
			this.asserted = ptrType.nil;
			this.missingMethod = "";
			return;
		}
		this._interface = _interface_;
		this.concrete = concrete_;
		this.asserted = asserted_;
		this.missingMethod = missingMethod_;
	});
	errorString = $pkg.errorString = $newType(8, $kindString, "runtime.errorString", true, "runtime", false, null);
	ptrType = $ptrType(_type);
	ptrType$4 = $ptrType(TypeAssertionError);
	_type.ptr.prototype.string = function() {
		var t;
		t = this;
		return t.str;
	};
	_type.prototype.string = function() { return this.$val.string(); };
	_type.ptr.prototype.pkgpath = function() {
		var t;
		t = this;
		return "";
	};
	_type.prototype.pkgpath = function() { return this.$val.pkgpath(); };
	init = function() {
		var e, jsPkg;
		jsPkg = $packages[$externalize("github.com/gopherjs/gopherjs/js", $String)];
		$jsObjectPtr = jsPkg.Object.ptr;
		$jsErrorPtr = jsPkg.Error.ptr;
		$throwRuntimeError = throw$1;
		e = $ifaceNil;
		e = new TypeAssertionError.ptr(ptrType.nil, ptrType.nil, ptrType.nil, "");
		$unused(e);
	};
	GOROOT = function() {
		var goroot, process;
		process = $global.process;
		if (process === undefined) {
			return "/";
		}
		goroot = process.env.GOROOT;
		if (!(goroot === undefined)) {
			return $internalize(goroot, $String);
		}
		return "/usr/local/go";
	};
	$pkg.GOROOT = GOROOT;
	Goexit = function() {
		$curGoroutine.exit = $externalize(true, $Bool);
		$throw(null);
	};
	$pkg.Goexit = Goexit;
	throw$1 = function(s) {
		var s;
		$panic(new errorString((s)));
	};
	TypeAssertionError.ptr.prototype.RuntimeError = function() {
	};
	TypeAssertionError.prototype.RuntimeError = function() { return this.$val.RuntimeError(); };
	TypeAssertionError.ptr.prototype.Error = function() {
		var as, cs, e, inter, msg;
		e = this;
		inter = "interface";
		if (!(e._interface === ptrType.nil)) {
			inter = e._interface.string();
		}
		as = e.asserted.string();
		if (e.concrete === ptrType.nil) {
			return "interface conversion: " + inter + " is nil, not " + as;
		}
		cs = e.concrete.string();
		if (e.missingMethod === "") {
			msg = "interface conversion: " + inter + " is " + cs + ", not " + as;
			if (cs === as) {
				if (!(e.concrete.pkgpath() === e.asserted.pkgpath())) {
					msg = msg + (" (types from different packages)");
				} else {
					msg = msg + (" (types from different scopes)");
				}
			}
			return msg;
		}
		return "interface conversion: " + cs + " is not " + as + ": missing method " + e.missingMethod;
	};
	TypeAssertionError.prototype.Error = function() { return this.$val.Error(); };
	errorString.prototype.RuntimeError = function() {
		var e;
		e = this.$val;
	};
	$ptrType(errorString).prototype.RuntimeError = function() { return new errorString(this.$get()).RuntimeError(); };
	errorString.prototype.Error = function() {
		var e;
		e = this.$val;
		return "runtime error: " + (e);
	};
	$ptrType(errorString).prototype.Error = function() { return new errorString(this.$get()).Error(); };
	ptrType.methods = [{prop: "string", name: "string", pkg: "runtime", typ: $funcType([], [$String], false)}, {prop: "pkgpath", name: "pkgpath", pkg: "runtime", typ: $funcType([], [$String], false)}];
	ptrType$4.methods = [{prop: "RuntimeError", name: "RuntimeError", pkg: "", typ: $funcType([], [], false)}, {prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}];
	errorString.methods = [{prop: "RuntimeError", name: "RuntimeError", pkg: "", typ: $funcType([], [], false)}, {prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}];
	_type.init("runtime", [{prop: "str", name: "str", embedded: false, exported: false, typ: $String, tag: ""}]);
	TypeAssertionError.init("runtime", [{prop: "_interface", name: "_interface", embedded: false, exported: false, typ: ptrType, tag: ""}, {prop: "concrete", name: "concrete", embedded: false, exported: false, typ: ptrType, tag: ""}, {prop: "asserted", name: "asserted", embedded: false, exported: false, typ: ptrType, tag: ""}, {prop: "missingMethod", name: "missingMethod", embedded: false, exported: false, typ: $String, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = js.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = bytealg.$init(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = sys.$init(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		init();
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["github.com/dotchain/dot/changes"] = (function() {
	var $pkg = {}, $init, Atomic, Change, Custom, Value, Collection, ChangeSet, Context, empty, Move, PathChange, Replace, Splice, sliceType, ptrType, ptrType$1, sliceType$1, ptrType$2, sliceType$2, change, swap, movesToChange;
	Atomic = $pkg.Atomic = $newType(0, $kindStruct, "changes.Atomic", true, "github.com/dotchain/dot/changes", true, function(Value_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Value = $ifaceNil;
			return;
		}
		this.Value = Value_;
	});
	Change = $pkg.Change = $newType(8, $kindInterface, "changes.Change", true, "github.com/dotchain/dot/changes", true, null);
	Custom = $pkg.Custom = $newType(8, $kindInterface, "changes.Custom", true, "github.com/dotchain/dot/changes", true, null);
	Value = $pkg.Value = $newType(8, $kindInterface, "changes.Value", true, "github.com/dotchain/dot/changes", true, null);
	Collection = $pkg.Collection = $newType(8, $kindInterface, "changes.Collection", true, "github.com/dotchain/dot/changes", true, null);
	ChangeSet = $pkg.ChangeSet = $newType(12, $kindSlice, "changes.ChangeSet", true, "github.com/dotchain/dot/changes", true, null);
	Context = $pkg.Context = $newType(8, $kindInterface, "changes.Context", true, "github.com/dotchain/dot/changes", true, null);
	empty = $pkg.empty = $newType(0, $kindStruct, "changes.empty", true, "github.com/dotchain/dot/changes", false, function() {
		this.$val = this;
		if (arguments.length === 0) {
			return;
		}
	});
	Move = $pkg.Move = $newType(0, $kindStruct, "changes.Move", true, "github.com/dotchain/dot/changes", true, function(Offset_, Count_, Distance_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Offset = 0;
			this.Count = 0;
			this.Distance = 0;
			return;
		}
		this.Offset = Offset_;
		this.Count = Count_;
		this.Distance = Distance_;
	});
	PathChange = $pkg.PathChange = $newType(0, $kindStruct, "changes.PathChange", true, "github.com/dotchain/dot/changes", true, function(Path_, Change_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Path = sliceType$2.nil;
			this.Change = $ifaceNil;
			return;
		}
		this.Path = Path_;
		this.Change = Change_;
	});
	Replace = $pkg.Replace = $newType(0, $kindStruct, "changes.Replace", true, "github.com/dotchain/dot/changes", true, function(Before_, After_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Before = $ifaceNil;
			this.After = $ifaceNil;
			return;
		}
		this.Before = Before_;
		this.After = After_;
	});
	Splice = $pkg.Splice = $newType(0, $kindStruct, "changes.Splice", true, "github.com/dotchain/dot/changes", true, function(Offset_, Before_, After_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Offset = 0;
			this.Before = $ifaceNil;
			this.After = $ifaceNil;
			return;
		}
		this.Offset = Offset_;
		this.Before = Before_;
		this.After = After_;
	});
	sliceType = $sliceType(Change);
	ptrType = $ptrType(Replace);
	ptrType$1 = $ptrType(Splice);
	sliceType$1 = $sliceType(Move);
	ptrType$2 = $ptrType(Move);
	sliceType$2 = $sliceType($emptyInterface);
	Atomic.ptr.prototype.Apply = function(ctx, c) {
		var _r, _ref, a, c, c$1, c$2, ctx, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _ref = $f._ref; a = $f.a; c = $f.c; c$1 = $f.c$1; c$2 = $f.c$2; ctx = $f.ctx; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		a = this;
		_ref = c;
		if (_ref === $ifaceNil) {
			c$1 = _ref;
			$s = -1; return new a.constructor.elem(a);
		} else if ($assertType(_ref, Replace, true)[1]) {
			c$2 = $clone(_ref.$val, Replace);
			if (!$clone(c$2, Replace).IsCreate()) {
				$s = -1; return c$2.After;
			}
		}
		_r = $assertType(c, Custom).ApplyTo(ctx, new a.constructor.elem(a)); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Atomic.ptr.prototype.Apply }; } $f._r = _r; $f._ref = _ref; $f.a = a; $f.c = c; $f.c$1 = c$1; $f.c$2 = c$2; $f.ctx = ctx; $f.$s = $s; $f.$r = $r; return $f;
	};
	Atomic.prototype.Apply = function(ctx, c) { return this.$val.Apply(ctx, c); };
	ChangeSet.prototype.Merge = function(other) {
		var _1, _i, _r, _ref, _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tuple, c, cx, elt, idx, other, otherx, results, x, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _1 = $f._1; _i = $f._i; _r = $f._r; _ref = $f._ref; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; _tmp$2 = $f._tmp$2; _tmp$3 = $f._tmp$3; _tmp$4 = $f._tmp$4; _tmp$5 = $f._tmp$5; _tmp$6 = $f._tmp$6; _tmp$7 = $f._tmp$7; _tuple = $f._tuple; c = $f.c; cx = $f.cx; elt = $f.elt; idx = $f.idx; other = $f.other; otherx = $f.otherx; results = $f.results; x = $f.x; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		otherx = $ifaceNil;
		cx = $ifaceNil;
		c = this;
		_tmp = 0;
		_tmp$1 = $makeSlice(sliceType, c.$length);
		idx = _tmp;
		results = _tmp$1;
		_ref = c;
		_i = 0;
		/* while (true) { */ case 1:
			/* if (!(_i < _ref.$length)) { break; } */ if(!(_i < _ref.$length)) { $s = 2; continue; }
			elt = ((_i < 0 || _i >= _ref.$length) ? ($throwRuntimeError("index out of range"), undefined) : _ref.$array[_ref.$offset + _i]);
			/* */ if (!($interfaceIsEqual(elt, $ifaceNil))) { $s = 3; continue; }
			/* */ $s = 4; continue;
			/* if (!($interfaceIsEqual(elt, $ifaceNil))) { */ case 3:
				_r = elt.Merge(other); /* */ $s = 5; case 5: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
				_tuple = _r;
				other = _tuple[0];
				((idx < 0 || idx >= results.$length) ? ($throwRuntimeError("index out of range"), undefined) : results.$array[results.$offset + idx] = _tuple[1]);
				if (!($interfaceIsEqual(((idx < 0 || idx >= results.$length) ? ($throwRuntimeError("index out of range"), undefined) : results.$array[results.$offset + idx]), $ifaceNil))) {
					idx = idx + (1) >> 0;
				}
			/* } */ case 4:
			_i++;
		/* } */ $s = 1; continue; case 2:
		_1 = idx;
		if (_1 === (0)) {
			_tmp$2 = other;
			_tmp$3 = $ifaceNil;
			otherx = _tmp$2;
			cx = _tmp$3;
			$s = -1; return [otherx, cx];
		} else if (_1 === (1)) {
			_tmp$4 = other;
			_tmp$5 = (0 >= results.$length ? ($throwRuntimeError("index out of range"), undefined) : results.$array[results.$offset + 0]);
			otherx = _tmp$4;
			cx = _tmp$5;
			$s = -1; return [otherx, cx];
		}
		_tmp$6 = other;
		_tmp$7 = ((x = $subslice(results, 0, idx), $subslice(new ChangeSet(x.$array), x.$offset, x.$offset + x.$length)));
		otherx = _tmp$6;
		cx = _tmp$7;
		$s = -1; return [otherx, cx];
		/* */ } return; } if ($f === undefined) { $f = { $blk: ChangeSet.prototype.Merge }; } $f._1 = _1; $f._i = _i; $f._r = _r; $f._ref = _ref; $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f._tmp$2 = _tmp$2; $f._tmp$3 = _tmp$3; $f._tmp$4 = _tmp$4; $f._tmp$5 = _tmp$5; $f._tmp$6 = _tmp$6; $f._tmp$7 = _tmp$7; $f._tuple = _tuple; $f.c = c; $f.cx = cx; $f.elt = elt; $f.idx = idx; $f.other = other; $f.otherx = otherx; $f.results = results; $f.x = x; $f.$s = $s; $f.$r = $r; return $f;
	};
	$ptrType(ChangeSet).prototype.Merge = function(other) { return this.$get().Merge(other); };
	ChangeSet.prototype.ReverseMerge = function(other) {
		var _1, _i, _r, _ref, _tmp, _tmp$1, _tmp$10, _tmp$11, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tmp$8, _tmp$9, _tuple, c, cx, elt, idx, l, other, otherx, r, results, x, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _1 = $f._1; _i = $f._i; _r = $f._r; _ref = $f._ref; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; _tmp$10 = $f._tmp$10; _tmp$11 = $f._tmp$11; _tmp$2 = $f._tmp$2; _tmp$3 = $f._tmp$3; _tmp$4 = $f._tmp$4; _tmp$5 = $f._tmp$5; _tmp$6 = $f._tmp$6; _tmp$7 = $f._tmp$7; _tmp$8 = $f._tmp$8; _tmp$9 = $f._tmp$9; _tuple = $f._tuple; c = $f.c; cx = $f.cx; elt = $f.elt; idx = $f.idx; l = $f.l; other = $f.other; otherx = $f.otherx; r = $f.r; results = $f.results; x = $f.x; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		otherx = $ifaceNil;
		cx = $ifaceNil;
		c = this;
		_tmp = 0;
		_tmp$1 = $makeSlice(sliceType, c.$length);
		idx = _tmp;
		results = _tmp$1;
		_ref = c;
		_i = 0;
		/* while (true) { */ case 1:
			/* if (!(_i < _ref.$length)) { break; } */ if(!(_i < _ref.$length)) { $s = 2; continue; }
			elt = ((_i < 0 || _i >= _ref.$length) ? ($throwRuntimeError("index out of range"), undefined) : _ref.$array[_ref.$offset + _i]);
			_tmp$2 = elt;
			_tmp$3 = other;
			l = _tmp$2;
			r = _tmp$3;
			/* */ if (!($interfaceIsEqual(other, $ifaceNil))) { $s = 3; continue; }
			/* */ $s = 4; continue;
			/* if (!($interfaceIsEqual(other, $ifaceNil))) { */ case 3:
				_r = other.Merge(elt); /* */ $s = 5; case 5: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
				_tuple = _r;
				l = _tuple[0];
				r = _tuple[1];
			/* } */ case 4:
			_tmp$4 = l;
			_tmp$5 = r;
			((idx < 0 || idx >= results.$length) ? ($throwRuntimeError("index out of range"), undefined) : results.$array[results.$offset + idx] = _tmp$4);
			other = _tmp$5;
			if (!($interfaceIsEqual(l, $ifaceNil))) {
				idx = idx + (1) >> 0;
			}
			_i++;
		/* } */ $s = 1; continue; case 2:
		_1 = idx;
		if (_1 === (0)) {
			_tmp$6 = other;
			_tmp$7 = $ifaceNil;
			otherx = _tmp$6;
			cx = _tmp$7;
			$s = -1; return [otherx, cx];
		} else if (_1 === (1)) {
			_tmp$8 = other;
			_tmp$9 = (0 >= results.$length ? ($throwRuntimeError("index out of range"), undefined) : results.$array[results.$offset + 0]);
			otherx = _tmp$8;
			cx = _tmp$9;
			$s = -1; return [otherx, cx];
		}
		_tmp$10 = other;
		_tmp$11 = ((x = $subslice(results, 0, idx), $subslice(new ChangeSet(x.$array), x.$offset, x.$offset + x.$length)));
		otherx = _tmp$10;
		cx = _tmp$11;
		$s = -1; return [otherx, cx];
		/* */ } return; } if ($f === undefined) { $f = { $blk: ChangeSet.prototype.ReverseMerge }; } $f._1 = _1; $f._i = _i; $f._r = _r; $f._ref = _ref; $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f._tmp$10 = _tmp$10; $f._tmp$11 = _tmp$11; $f._tmp$2 = _tmp$2; $f._tmp$3 = _tmp$3; $f._tmp$4 = _tmp$4; $f._tmp$5 = _tmp$5; $f._tmp$6 = _tmp$6; $f._tmp$7 = _tmp$7; $f._tmp$8 = _tmp$8; $f._tmp$9 = _tmp$9; $f._tuple = _tuple; $f.c = c; $f.cx = cx; $f.elt = elt; $f.idx = idx; $f.l = l; $f.other = other; $f.otherx = otherx; $f.r = r; $f.results = results; $f.x = x; $f.$s = $s; $f.$r = $r; return $f;
	};
	$ptrType(ChangeSet).prototype.ReverseMerge = function(other) { return this.$get().ReverseMerge(other); };
	ChangeSet.prototype.Revert = function() {
		var _1, _i, _r, _ref, _tmp, _tmp$1, c, elt, idx, kk, results, x, x$1, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _1 = $f._1; _i = $f._i; _r = $f._r; _ref = $f._ref; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; c = $f.c; elt = $f.elt; idx = $f.idx; kk = $f.kk; results = $f.results; x = $f.x; x$1 = $f.x$1; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		c = this;
		_tmp = 0;
		_tmp$1 = $makeSlice(sliceType, c.$length);
		idx = _tmp;
		results = _tmp$1;
		_ref = c;
		_i = 0;
		/* while (true) { */ case 1:
			/* if (!(_i < _ref.$length)) { break; } */ if(!(_i < _ref.$length)) { $s = 2; continue; }
			kk = _i;
			elt = (x = (c.$length - kk >> 0) - 1 >> 0, ((x < 0 || x >= c.$length) ? ($throwRuntimeError("index out of range"), undefined) : c.$array[c.$offset + x]));
			/* */ if (!($interfaceIsEqual(elt, $ifaceNil))) { $s = 3; continue; }
			/* */ $s = 4; continue;
			/* if (!($interfaceIsEqual(elt, $ifaceNil))) { */ case 3:
				_r = elt.Revert(); /* */ $s = 5; case 5: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
				((idx < 0 || idx >= results.$length) ? ($throwRuntimeError("index out of range"), undefined) : results.$array[results.$offset + idx] = _r);
				idx = idx + (1) >> 0;
			/* } */ case 4:
			_i++;
		/* } */ $s = 1; continue; case 2:
		_1 = idx;
		if (_1 === (0)) {
			$s = -1; return $ifaceNil;
		} else if (_1 === (1)) {
			$s = -1; return (0 >= results.$length ? ($throwRuntimeError("index out of range"), undefined) : results.$array[results.$offset + 0]);
		}
		$s = -1; return ((x$1 = $subslice(results, 0, idx), $subslice(new ChangeSet(x$1.$array), x$1.$offset, x$1.$offset + x$1.$length)));
		/* */ } return; } if ($f === undefined) { $f = { $blk: ChangeSet.prototype.Revert }; } $f._1 = _1; $f._i = _i; $f._r = _r; $f._ref = _ref; $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f.c = c; $f.elt = elt; $f.idx = idx; $f.kk = kk; $f.results = results; $f.x = x; $f.x$1 = x$1; $f.$s = $s; $f.$r = $r; return $f;
	};
	$ptrType(ChangeSet).prototype.Revert = function() { return this.$get().Revert(); };
	ChangeSet.prototype.ApplyTo = function(ctx, v) {
		var _i, _r, _ref, c, ctx, cx, v, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _i = $f._i; _r = $f._r; _ref = $f._ref; c = $f.c; ctx = $f.ctx; cx = $f.cx; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		c = this;
		_ref = c;
		_i = 0;
		/* while (true) { */ case 1:
			/* if (!(_i < _ref.$length)) { break; } */ if(!(_i < _ref.$length)) { $s = 2; continue; }
			cx = ((_i < 0 || _i >= _ref.$length) ? ($throwRuntimeError("index out of range"), undefined) : _ref.$array[_ref.$offset + _i]);
			_r = v.Apply(ctx, cx); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			v = _r;
			_i++;
		/* } */ $s = 1; continue; case 2:
		$s = -1; return v;
		/* */ } return; } if ($f === undefined) { $f = { $blk: ChangeSet.prototype.ApplyTo }; } $f._i = _i; $f._r = _r; $f._ref = _ref; $f.c = c; $f.ctx = ctx; $f.cx = cx; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
	};
	$ptrType(ChangeSet).prototype.ApplyTo = function(ctx, v) { return this.$get().ApplyTo(ctx, v); };
	change = function(x, y) {
		var _r, _r$1, x, y, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; x = $f.x; y = $f.y; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_r = x.Change(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_r$1 = y.Change(); /* */ $s = 2; case 2: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		$s = -1; return [_r, _r$1];
		/* */ } return; } if ($f === undefined) { $f = { $blk: change }; } $f._r = _r; $f._r$1 = _r$1; $f.x = x; $f.y = y; $f.$s = $s; $f.$r = $r; return $f;
	};
	swap = function(x, y) {
		var x, y;
		return [y, x];
	};
	empty.ptr.prototype.Apply = function(ctx, c) {
		var _r, _ref, c, c$1, c$2, ctx, e, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _ref = $f._ref; c = $f.c; c$1 = $f.c$1; c$2 = $f.c$2; ctx = $f.ctx; e = $f.e; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		e = this;
		_ref = c;
		if (_ref === $ifaceNil) {
			c$1 = _ref;
			$s = -1; return new e.constructor.elem(e);
		} else if ($assertType(_ref, Replace, true)[1]) {
			c$2 = $clone(_ref.$val, Replace);
			if ($clone(c$2, Replace).IsCreate()) {
				$s = -1; return c$2.After;
			}
		}
		_r = $assertType(c, Custom).ApplyTo(ctx, new e.constructor.elem(e)); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: empty.ptr.prototype.Apply }; } $f._r = _r; $f._ref = _ref; $f.c = c; $f.c$1 = c$1; $f.c$2 = c$2; $f.ctx = ctx; $f.e = e; $f.$s = $s; $f.$r = $r; return $f;
	};
	empty.prototype.Apply = function(ctx, c) { return this.$val.Apply(ctx, c); };
	Move.ptr.prototype.Revert = function() {
		var m, x;
		m = this;
		return (x = new Move.ptr(m.Offset + m.Distance >> 0, m.Count, -m.Distance), new x.constructor.elem(x));
	};
	Move.prototype.Revert = function() { return this.$val.Revert(); };
	Move.ptr.prototype.MergeReplace = function(other) {
		var _r, _tmp, _tmp$1, m, m1, other, other1, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; m = $f.m; m1 = $f.m1; other = $f.other; other1 = $f.other1; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		other = [other];
		other1 = ptrType.nil;
		m1 = ptrType$1.nil;
		m = this;
		_r = other[0].Before.Apply($ifaceNil, new m.constructor.elem(m)); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		other[0].Before = _r;
		_tmp = other[0];
		_tmp$1 = ptrType$1.nil;
		other1 = _tmp;
		m1 = _tmp$1;
		$s = -1; return [other1, m1];
		/* */ } return; } if ($f === undefined) { $f = { $blk: Move.ptr.prototype.MergeReplace }; } $f._r = _r; $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f.m = m; $f.m1 = m1; $f.other = other; $f.other1 = other1; $f.$s = $s; $f.$r = $r; return $f;
	};
	Move.prototype.MergeReplace = function(other) { return this.$val.MergeReplace(other); };
	Move.ptr.prototype.MergeSplice = function(o) {
		var _r, _tuple, m, o, x, y, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _tuple = $f._tuple; m = $f.m; o = $f.o; x = $f.x; y = $f.y; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		m = this;
		_r = $clone(o, Splice).MergeMove($clone(m, Move)); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_tuple = _r;
		x = _tuple[0];
		y = _tuple[1];
		$s = -1; return [y, x];
		/* */ } return; } if ($f === undefined) { $f = { $blk: Move.ptr.prototype.MergeSplice }; } $f._r = _r; $f._tuple = _tuple; $f.m = m; $f.o = o; $f.x = x; $f.y = y; $f.$s = $s; $f.$r = $r; return $f;
	};
	Move.prototype.MergeSplice = function(o) { return this.$val.MergeSplice(o); };
	Move.ptr.prototype.MergeMove = function(o) {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, _tuple, _tuple$1, _tuple$2, _tuple$3, _tuple$4, _tuple$5, _tuple$6, m, mx, o, ox;
		ox = sliceType$1.nil;
		mx = sliceType$1.nil;
		m = this;
		if ($equal(m, o, Move)) {
			_tmp = sliceType$1.nil;
			_tmp$1 = sliceType$1.nil;
			ox = _tmp;
			mx = _tmp$1;
			return [ox, mx];
		}
		if ((m.Distance === 0) || (m.Count === 0) || (o.Distance === 0) || (o.Count === 0)) {
			_tmp$2 = new sliceType$1([$clone(o, Move)]);
			_tmp$3 = new sliceType$1([$clone(m, Move)]);
			ox = _tmp$2;
			mx = _tmp$3;
			return [ox, mx];
		}
		if (m.Offset >= (o.Offset + o.Count >> 0) || o.Offset >= (m.Offset + m.Count >> 0)) {
			_tuple = $clone(m, Move).mergeMoveNoOverlap($clone(o, Move));
			ox = _tuple[0];
			mx = _tuple[1];
			return [ox, mx];
		}
		if (m.Offset <= o.Offset && (m.Offset + m.Count >> 0) >= (o.Offset + o.Count >> 0)) {
			_tuple$1 = $clone(m, Move).mergeMoveContained($clone(o, Move));
			ox = _tuple$1[0];
			mx = _tuple$1[1];
			return [ox, mx];
		}
		if (m.Offset >= o.Offset && (m.Offset + m.Count >> 0) <= (o.Offset + o.Count >> 0)) {
			_tuple$3 = $clone(o, Move).mergeMoveContained($clone(m, Move));
			_tuple$2 = $clone(m, Move).swap(_tuple$3[0], _tuple$3[1]);
			ox = _tuple$2[0];
			mx = _tuple$2[1];
			return [ox, mx];
		}
		if (m.Offset < o.Offset) {
			_tuple$4 = $clone(m, Move).mergeMoveRightOverlap($clone(o, Move));
			ox = _tuple$4[0];
			mx = _tuple$4[1];
			return [ox, mx];
		}
		_tuple$6 = $clone(o, Move).mergeMoveRightOverlap($clone(m, Move));
		_tuple$5 = $clone(m, Move).swap(_tuple$6[0], _tuple$6[1]);
		ox = _tuple$5[0];
		mx = _tuple$5[1];
		return [ox, mx];
	};
	Move.prototype.MergeMove = function(o) { return this.$val.MergeMove(o); };
	Move.ptr.prototype.mergeMoveNoOverlap = function(o) {
		var _tmp, _tmp$1, _tuple, _tuple$1, _tuple$2, _tuple$3, _tuple$4, m, mdest, mx, o, odest, ox;
		ox = sliceType$1.nil;
		mx = sliceType$1.nil;
		m = this;
		_tmp = $clone(m, Move).dest();
		_tmp$1 = $clone(o, Move).dest();
		mdest = _tmp;
		odest = _tmp$1;
		if (!$clone(m, Move).contains(odest) && !$clone(o, Move).contains(mdest)) {
			_tuple = $clone(m, Move).mergeMoveNoOverlapNoDestMixups($clone(o, Move));
			ox = _tuple[0];
			mx = _tuple[1];
			return [ox, mx];
		}
		if ($clone(m, Move).contains(odest) && $clone(o, Move).contains(mdest)) {
			_tuple$1 = $clone(m, Move).mergeMoveNoOverlapMixedDests($clone(o, Move));
			ox = _tuple$1[0];
			mx = _tuple$1[1];
			return [ox, mx];
		}
		if ($clone(o, Move).contains(mdest)) {
			_tuple$3 = $clone(o, Move).mergeMoveNoOverlap($clone(m, Move));
			_tuple$2 = $clone(m, Move).swap(_tuple$3[0], _tuple$3[1]);
			ox = _tuple$2[0];
			mx = _tuple$2[1];
			return [ox, mx];
		}
		_tuple$4 = $clone(m, Move).mergeMoveNoOverlapContainedDest($clone(o, Move));
		ox = _tuple$4[0];
		mx = _tuple$4[1];
		return [ox, mx];
	};
	Move.prototype.mergeMoveNoOverlap = function(o) { return this.$val.mergeMoveNoOverlap(o); };
	Move.ptr.prototype.mergeMoveNoOverlapContainedDest = function(o) {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, m, m1, mdest, mdestNew, mx, o, odest, ox;
		ox = sliceType$1.nil;
		mx = sliceType$1.nil;
		m = this;
		_tmp = $clone(m, Move).dest();
		_tmp$1 = $clone(o, Move).dest();
		mdest = _tmp;
		odest = _tmp$1;
		mdestNew = mdest;
		if (mdest >= odest && mdest <= o.Offset) {
			mdestNew = mdestNew + (o.Count) >> 0;
		} else if (mdest > o.Offset && mdest <= odest) {
			mdestNew = mdestNew - (o.Count) >> 0;
		}
		m1 = $clone(m, Move);
		if (o.Offset <= m.Offset) {
			m1.Offset = m1.Offset - (o.Count) >> 0;
		}
		m1.Count = m.Count + o.Count >> 0;
		if (mdestNew <= m1.Offset) {
			m1.Distance = mdestNew - m1.Offset >> 0;
		} else {
			m1.Distance = (mdestNew - m1.Offset >> 0) - m1.Count >> 0;
		}
		if (o.Offset > m.Offset && o.Offset < mdest) {
			o.Offset = o.Offset - (m.Count) >> 0;
		} else if (o.Offset >= mdest && o.Offset < m.Offset) {
			o.Offset = o.Offset + (m.Count) >> 0;
		}
		odest = odest + (m.Distance) >> 0;
		if (odest <= o.Offset) {
			o.Distance = odest - o.Offset >> 0;
		} else {
			o.Distance = (odest - o.Offset >> 0) - o.Count >> 0;
		}
		_tmp$2 = new sliceType$1([$clone(o, Move)]);
		_tmp$3 = new sliceType$1([$clone(m1, Move)]);
		ox = _tmp$2;
		mx = _tmp$3;
		return [ox, mx];
	};
	Move.prototype.mergeMoveNoOverlapContainedDest = function(o) { return this.$val.mergeMoveNoOverlapContainedDest(o); };
	Move.ptr.prototype.mergeMoveNoOverlapNoDestMixups = function(o) {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, m, m1, mdest, mx, o, o1, odest, ox;
		ox = sliceType$1.nil;
		mx = sliceType$1.nil;
		m = this;
		_tmp = $clone(m, Move).dest();
		_tmp$1 = $clone(o, Move).dest();
		mdest = _tmp;
		odest = _tmp$1;
		o1 = new Move.ptr($clone(m, Move).mapPoint(o.Offset), o.Count, 0);
		Move.copy(o1, $clone(o1, Move).withDest($clone(m, Move).mapPoint(odest)));
		if (odest === mdest) {
			Move.copy(o1, $clone(o1, Move).withDest(m.Offset + m.Distance >> 0));
		}
		m1 = new Move.ptr($clone(o, Move).mapPoint(m.Offset), m.Count, 0);
		Move.copy(m1, $clone(m1, Move).withDest($clone(o, Move).mapPoint(mdest)));
		_tmp$2 = new sliceType$1([$clone(o1, Move)]);
		_tmp$3 = new sliceType$1([$clone(m1, Move)]);
		ox = _tmp$2;
		mx = _tmp$3;
		return [ox, mx];
	};
	Move.prototype.mergeMoveNoOverlapNoDestMixups = function(o) { return this.$val.mergeMoveNoOverlapNoDestMixups(o); };
	Move.ptr.prototype.mergeMoveNoOverlapMixedDests = function(o) {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, distance, m, mdest, mx, o, odest, oleft, oright, ox;
		ox = sliceType$1.nil;
		mx = sliceType$1.nil;
		m = this;
		_tmp = new Move.ptr(0, 0, 0);
		_tmp$1 = new Move.ptr(0, 0, 0);
		oleft = $clone(_tmp, Move);
		oright = $clone(_tmp$1, Move);
		_tmp$2 = $clone(m, Move).dest();
		_tmp$3 = $clone(o, Move).dest();
		mdest = _tmp$2;
		odest = _tmp$3;
		oleft.Count = mdest - o.Offset >> 0;
		oright.Count = o.Count - oleft.Count >> 0;
		oleft.Offset = (m.Offset + m.Distance >> 0) - oleft.Count >> 0;
		oright.Offset = (m.Offset + m.Distance >> 0) + m.Count >> 0;
		oleft.Distance = odest - m.Offset >> 0;
		oright.Distance = (odest - m.Offset >> 0) - m.Count >> 0;
		ox = new sliceType$1([$clone(oleft, Move), $clone(oright, Move)]);
		distance = (o.Offset - m.Offset >> 0) - m.Count >> 0;
		if (distance < 0) {
			distance = -(((m.Offset - o.Offset >> 0) - o.Count >> 0));
		}
		mx = new sliceType$1([new Move.ptr((o.Offset + o.Distance >> 0) - ((odest - m.Offset >> 0)) >> 0, m.Count + o.Count >> 0, distance)]);
		_tmp$4 = ox;
		_tmp$5 = mx;
		ox = _tmp$4;
		mx = _tmp$5;
		return [ox, mx];
	};
	Move.prototype.mergeMoveNoOverlapMixedDests = function(o) { return this.$val.mergeMoveNoOverlapMixedDests(o); };
	Move.ptr.prototype.mergeMoveRightOverlap = function(o) {
		var _tuple, l, m, non, o, overlapSize, overlapUndo, r;
		m = this;
		overlapSize = (m.Offset + m.Count >> 0) - o.Offset >> 0;
		overlapUndo = new Move.ptr(o.Offset + o.Distance >> 0, overlapSize, 0);
		non = new Move.ptr(o.Offset + overlapSize >> 0, o.Count - overlapSize >> 0, 0);
		if (o.Distance > 0) {
			overlapUndo.Distance = -o.Distance;
			non.Distance = o.Distance;
		} else {
			overlapUndo.Distance = (o.Count - overlapSize >> 0) - o.Distance >> 0;
			non.Distance = o.Distance - overlapSize >> 0;
		}
		_tuple = $clone(m, Move).mergeMoveNoOverlap($clone(non, Move));
		l = _tuple[0];
		r = _tuple[1];
		return [l, $appendSlice(new sliceType$1([$clone(overlapUndo, Move)]), r)];
	};
	Move.prototype.mergeMoveRightOverlap = function(o) { return this.$val.mergeMoveRightOverlap(o); };
	Move.ptr.prototype.mergeMoveContained = function(o) {
		var m, mx, mx$1, o, odest, ox;
		m = this;
		odest = $clone(o, Move).dest();
		ox = $clone(o, Move);
		ox.Offset = ox.Offset + (m.Distance) >> 0;
		if (m.Offset <= odest && odest <= (m.Offset + m.Count >> 0)) {
			return [new sliceType$1([$clone(ox, Move)]), new sliceType$1([$clone(m, Move)])];
		}
		if (odest === $clone(m, Move).dest()) {
			Move.copy(ox, $clone(ox, Move).withDest(m.Offset + m.Distance >> 0));
			mx = $clone(m, Move);
			mx.Count = mx.Count - (o.Count) >> 0;
			if (o.Distance < 0) {
				mx.Offset = mx.Offset + (o.Count) >> 0;
			}
			Move.copy(mx, $clone(mx, Move).withDest((o.Offset + o.Count >> 0) + o.Distance >> 0));
			return [new sliceType$1([$clone(ox, Move)]), new sliceType$1([$clone(mx, Move)])];
		}
		Move.copy(ox, $clone(ox, Move).withDest($clone(m, Move).mapPoint(odest)));
		mx$1 = $clone(m, Move);
		mx$1.Offset = $clone(o, Move).mapPoint(m.Offset);
		mx$1.Count = m.Count - o.Count >> 0;
		Move.copy(mx$1, $clone(mx$1, Move).withDest($clone(o, Move).mapPoint($clone(m, Move).dest())));
		return [new sliceType$1([$clone(ox, Move)]), new sliceType$1([$clone(mx$1, Move)])];
	};
	Move.prototype.mergeMoveContained = function(o) { return this.$val.mergeMoveContained(o); };
	Move.ptr.prototype.MapIndex = function(idx) {
		var idx, m;
		m = this;
		if (idx >= (m.Offset + m.Distance >> 0) && idx < m.Offset) {
			return idx + m.Count >> 0;
		} else if (idx >= m.Offset && idx < (m.Offset + m.Count >> 0)) {
			return idx + m.Distance >> 0;
		} else if (idx >= (m.Offset + m.Count >> 0) && idx < ((m.Offset + m.Count >> 0) + m.Distance >> 0)) {
			return idx - m.Count >> 0;
		}
		return idx;
	};
	Move.prototype.MapIndex = function(idx) { return this.$val.MapIndex(idx); };
	Move.ptr.prototype.mapPoint = function(idx) {
		var idx, m;
		m = this;
		if (idx >= (m.Offset + m.Distance >> 0) && idx <= m.Offset) {
			return idx + m.Count >> 0;
		} else if (idx >= (m.Offset + m.Count >> 0) && idx < ((m.Offset + m.Count >> 0) + m.Distance >> 0)) {
			return idx - m.Count >> 0;
		}
		return idx;
	};
	Move.prototype.mapPoint = function(idx) { return this.$val.mapPoint(idx); };
	Move.ptr.prototype.dest = function() {
		var m;
		m = this;
		if (m.Distance < 0) {
			return m.Offset + m.Distance >> 0;
		}
		return (m.Offset + m.Distance >> 0) + m.Count >> 0;
	};
	Move.prototype.dest = function() { return this.$val.dest(); };
	Move.ptr.prototype.withDest = function(dest) {
		var dest, m;
		m = this;
		m.Distance = (dest - m.Offset >> 0) - m.Count >> 0;
		if (m.Distance < 0) {
			m.Distance = dest - m.Offset >> 0;
		}
		return m;
	};
	Move.prototype.withDest = function(dest) { return this.$val.withDest(dest); };
	Move.ptr.prototype.contains = function(idx) {
		var idx, m;
		m = this;
		return idx > m.Offset && idx < (m.Offset + m.Count >> 0);
	};
	Move.prototype.contains = function(idx) { return this.$val.contains(idx); };
	Move.ptr.prototype.swap = function(l, r) {
		var l, m, r;
		m = this;
		return [r, l];
	};
	Move.prototype.swap = function(l, r) { return this.$val.swap(l, r); };
	movesToChange = function(m) {
		var _1, _i, _ref, m, mm, result;
		result = $makeSlice(sliceType, m.$length);
		_ref = m;
		_i = 0;
		while (true) {
			if (!(_i < _ref.$length)) { break; }
			mm = $clone(((_i < 0 || _i >= _ref.$length) ? ($throwRuntimeError("index out of range"), undefined) : _ref.$array[_ref.$offset + _i]), Move);
			if (!((mm.Count === 0)) && !((mm.Distance === 0))) {
				result = $append(result, new mm.constructor.elem(mm));
			}
			_i++;
		}
		_1 = result.$length;
		if (_1 === (0)) {
			return $ifaceNil;
		} else if (_1 === (1)) {
			return (0 >= result.$length ? ($throwRuntimeError("index out of range"), undefined) : result.$array[result.$offset + 0]);
		}
		return ($subslice(new ChangeSet(result.$array), result.$offset, result.$offset + result.$length));
	};
	Move.ptr.prototype.Merge = function(other) {
		var _r, _r$1, _r$2, _r$3, _r$4, _ref, _tmp, _tmp$1, _tmp$2, _tmp$3, _tuple, _tuple$1, _tuple$2, _tuple$3, _tuple$4, _tuple$5, cx, l, m, o, o$1, o$2, o$3, other, otherx, r, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; _r$3 = $f._r$3; _r$4 = $f._r$4; _ref = $f._ref; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; _tmp$2 = $f._tmp$2; _tmp$3 = $f._tmp$3; _tuple = $f._tuple; _tuple$1 = $f._tuple$1; _tuple$2 = $f._tuple$2; _tuple$3 = $f._tuple$3; _tuple$4 = $f._tuple$4; _tuple$5 = $f._tuple$5; cx = $f.cx; l = $f.l; m = $f.m; o = $f.o; o$1 = $f.o$1; o$2 = $f.o$2; o$3 = $f.o$3; other = $f.other; otherx = $f.otherx; r = $f.r; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		otherx = $ifaceNil;
		cx = $ifaceNil;
		m = this;
		if ($interfaceIsEqual(other, $ifaceNil)) {
			_tmp = $ifaceNil;
			_tmp$1 = new m.constructor.elem(m);
			otherx = _tmp;
			cx = _tmp$1;
			$s = -1; return [otherx, cx];
		}
		_ref = other;
		/* */ if ($assertType(_ref, Replace, true)[1]) { $s = 1; continue; }
		/* */ if ($assertType(_ref, Splice, true)[1]) { $s = 2; continue; }
		/* */ if ($assertType(_ref, Move, true)[1]) { $s = 3; continue; }
		/* */ if ($assertType(_ref, Custom, true)[1]) { $s = 4; continue; }
		/* */ $s = 5; continue;
		/* if ($assertType(_ref, Replace, true)[1]) { */ case 1:
			o = $clone(_ref.$val, Replace);
			_r = $clone(m, Move).MergeReplace($clone(o, Replace)); /* */ $s = 6; case 6: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			_tuple$1 = _r;
			_r$1 = change(_tuple$1[0], _tuple$1[1]); /* */ $s = 7; case 7: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
			_tuple = _r$1;
			otherx = _tuple[0];
			cx = _tuple[1];
			$s = -1; return [otherx, cx];
		/* } else if ($assertType(_ref, Splice, true)[1]) { */ case 2:
			o$1 = $clone(_ref.$val, Splice);
			_r$2 = $clone(m, Move).MergeSplice($clone(o$1, Splice)); /* */ $s = 8; case 8: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
			_tuple$2 = _r$2;
			otherx = _tuple$2[0];
			cx = _tuple$2[1];
			$s = -1; return [otherx, cx];
		/* } else if ($assertType(_ref, Move, true)[1]) { */ case 3:
			o$2 = $clone(_ref.$val, Move);
			_tuple$3 = $clone(m, Move).MergeMove($clone(o$2, Move));
			l = _tuple$3[0];
			r = _tuple$3[1];
			_tmp$2 = movesToChange(l);
			_tmp$3 = movesToChange(r);
			otherx = _tmp$2;
			cx = _tmp$3;
			$s = -1; return [otherx, cx];
		/* } else if ($assertType(_ref, Custom, true)[1]) { */ case 4:
			o$3 = _ref;
			_r$3 = o$3.ReverseMerge(new m.constructor.elem(m)); /* */ $s = 9; case 9: if($c) { $c = false; _r$3 = _r$3.$blk(); } if (_r$3 && _r$3.$blk !== undefined) { break s; }
			_tuple$5 = _r$3;
			_r$4 = swap(_tuple$5[0], _tuple$5[1]); /* */ $s = 10; case 10: if($c) { $c = false; _r$4 = _r$4.$blk(); } if (_r$4 && _r$4.$blk !== undefined) { break s; }
			_tuple$4 = _r$4;
			otherx = _tuple$4[0];
			cx = _tuple$4[1];
			$s = -1; return [otherx, cx];
		/* } */ case 5:
		$panic(new $String("Unexpected change"));
		$s = -1; return [otherx, cx];
		/* */ } return; } if ($f === undefined) { $f = { $blk: Move.ptr.prototype.Merge }; } $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f._r$3 = _r$3; $f._r$4 = _r$4; $f._ref = _ref; $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f._tmp$2 = _tmp$2; $f._tmp$3 = _tmp$3; $f._tuple = _tuple; $f._tuple$1 = _tuple$1; $f._tuple$2 = _tuple$2; $f._tuple$3 = _tuple$3; $f._tuple$4 = _tuple$4; $f._tuple$5 = _tuple$5; $f.cx = cx; $f.l = l; $f.m = m; $f.o = o; $f.o$1 = o$1; $f.o$2 = o$2; $f.o$3 = o$3; $f.other = other; $f.otherx = otherx; $f.r = r; $f.$s = $s; $f.$r = $r; return $f;
	};
	Move.prototype.Merge = function(other) { return this.$val.Merge(other); };
	Move.ptr.prototype.Change = function() {
		var m, x;
		m = this;
		if (m === ptrType$2.nil) {
			return $ifaceNil;
		}
		return (x = m, new x.constructor.elem(x));
	};
	Move.prototype.Change = function() { return this.$val.Change(); };
	Move.ptr.prototype.Normalize = function() {
		var m;
		m = this;
		if (m.Distance < 0) {
			return new Move.ptr(m.Offset + m.Distance >> 0, -m.Distance, m.Count);
		}
		return m;
	};
	Move.prototype.Normalize = function() { return this.$val.Normalize(); };
	PathChange.ptr.prototype.Revert = function() {
		var _r, pc, x, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; pc = $f.pc; x = $f.x; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		pc = this;
		if ($interfaceIsEqual(pc.Change, $ifaceNil)) {
			$s = -1; return $ifaceNil;
		}
		_r = pc.Change.Revert(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return (x = new PathChange.ptr(pc.Path, _r), new x.constructor.elem(x));
		/* */ } return; } if ($f === undefined) { $f = { $blk: PathChange.ptr.prototype.Revert }; } $f._r = _r; $f.pc = pc; $f.x = x; $f.$s = $s; $f.$r = $r; return $f;
	};
	PathChange.prototype.Revert = function() { return this.$val.Revert(); };
	PathChange.ptr.prototype.Merge = function(o) {
		var _r, _tuple, o, ok, opc, pc, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _tuple = $f._tuple; o = $f.o; ok = $f.ok; opc = $f.opc; pc = $f.pc; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		pc = this;
		_tuple = $assertType(o, PathChange, true);
		opc = $clone(_tuple[0], PathChange);
		ok = _tuple[1];
		if (!ok) {
			PathChange.copy(opc, new PathChange.ptr(sliceType$2.nil, o));
		}
		_r = $clone(pc, PathChange).mergePathChange($clone(opc, PathChange), false); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: PathChange.ptr.prototype.Merge }; } $f._r = _r; $f._tuple = _tuple; $f.o = o; $f.ok = ok; $f.opc = opc; $f.pc = pc; $f.$s = $s; $f.$r = $r; return $f;
	};
	PathChange.prototype.Merge = function(o) { return this.$val.Merge(o); };
	PathChange.ptr.prototype.ReverseMerge = function(o) {
		var _r, _tuple, o, ok, opc, pc, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _tuple = $f._tuple; o = $f.o; ok = $f.ok; opc = $f.opc; pc = $f.pc; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		pc = this;
		_tuple = $assertType(o, PathChange, true);
		opc = $clone(_tuple[0], PathChange);
		ok = _tuple[1];
		if (!ok) {
			PathChange.copy(opc, new PathChange.ptr(sliceType$2.nil, o));
		}
		_r = $clone(pc, PathChange).mergePathChange($clone(opc, PathChange), true); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: PathChange.ptr.prototype.ReverseMerge }; } $f._r = _r; $f._tuple = _tuple; $f.o = o; $f.ok = ok; $f.opc = opc; $f.pc = pc; $f.$s = $s; $f.$r = $r; return $f;
	};
	PathChange.prototype.ReverseMerge = function(o) { return this.$val.ReverseMerge(o); };
	PathChange.ptr.prototype.ApplyTo = function(ctx, v) {
		var _r, ctx, pc, v, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; ctx = $f.ctx; pc = $f.pc; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		pc = this;
		/* */ if (pc.Path.$length === 0) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (pc.Path.$length === 0) { */ case 1:
			_r = v.Apply(ctx, pc.Change); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			$s = -1; return _r;
		/* } */ case 2:
		$panic(new $String("Unexpected use of PathChange.ApplyTo"));
		$s = -1; return $ifaceNil;
		/* */ } return; } if ($f === undefined) { $f = { $blk: PathChange.ptr.prototype.ApplyTo }; } $f._r = _r; $f.ctx = ctx; $f.pc = pc; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
	};
	PathChange.prototype.ApplyTo = function(ctx, v) { return this.$val.ApplyTo(ctx, v); };
	PathChange.ptr.prototype.mergePathChange = function(o, reverse) {
		var _r, _r$1, _r$2, _r$3, _tuple, o, pc, prefixLen, reverse, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; _r$3 = $f._r$3; _tuple = $f._tuple; o = $f.o; pc = $f.pc; prefixLen = $f.prefixLen; reverse = $f.reverse; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		pc = this;
		prefixLen = $clone(pc, PathChange).commonPrefixLen(pc.Path, o.Path);
			/* */ if (!((pc.Path.$length === prefixLen)) && !((o.Path.$length === prefixLen))) { $s = 2; continue; }
			/* */ if ((pc.Path.$length === prefixLen) && (o.Path.$length === prefixLen)) { $s = 3; continue; }
			/* */ if ((pc.Path.$length === prefixLen)) { $s = 4; continue; }
			/* */ $s = 5; continue;
			/* if (!((pc.Path.$length === prefixLen)) && !((o.Path.$length === prefixLen))) { */ case 2:
				$s = -1; return [new o.constructor.elem(o), new pc.constructor.elem(pc)];
			/* } else if ((pc.Path.$length === prefixLen) && (o.Path.$length === prefixLen)) { */ case 3:
				_r = $clone(pc, PathChange).prefixMerge(pc.Path, pc.Change, o.Change, reverse); /* */ $s = 6; case 6: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
				$s = -1; return _r;
			/* } else if ((pc.Path.$length === prefixLen)) { */ case 4:
				_r$1 = $clone(pc, PathChange).mergeSubPath($clone(o, PathChange), reverse); /* */ $s = 7; case 7: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
				$s = -1; return _r$1;
			/* } */ case 5:
		case 1:
		_r$2 = $clone(o, PathChange).mergeSubPath($clone(pc, PathChange), !reverse); /* */ $s = 8; case 8: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
		_tuple = _r$2;
		_r$3 = swap(_tuple[0], _tuple[1]); /* */ $s = 9; case 9: if($c) { $c = false; _r$3 = _r$3.$blk(); } if (_r$3 && _r$3.$blk !== undefined) { break s; }
		$s = -1; return _r$3;
		/* */ } return; } if ($f === undefined) { $f = { $blk: PathChange.ptr.prototype.mergePathChange }; } $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f._r$3 = _r$3; $f._tuple = _tuple; $f.o = o; $f.pc = pc; $f.prefixLen = prefixLen; $f.reverse = reverse; $f.$s = $s; $f.$r = $r; return $f;
	};
	PathChange.prototype.mergePathChange = function(o, reverse) { return this.$val.mergePathChange(o, reverse); };
	PathChange.ptr.prototype.prefixMerge = function(prefix, l, r, reverse) {
		var _r, _r$1, _r$2, _tuple, _tuple$1, _tuple$2, _tuple$3, l, ok, pc, prefix, r, rev, reverse, x, x$1, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; _tuple = $f._tuple; _tuple$1 = $f._tuple$1; _tuple$2 = $f._tuple$2; _tuple$3 = $f._tuple$3; l = $f.l; ok = $f.ok; pc = $f.pc; prefix = $f.prefix; r = $f.r; rev = $f.rev; reverse = $f.reverse; x = $f.x; x$1 = $f.x$1; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		pc = this;
		_tuple = $assertType(l, Custom, true);
		rev = _tuple[0];
		ok = _tuple[1];
		/* */ if (ok && reverse) { $s = 1; continue; }
		/* */ if (reverse && !($interfaceIsEqual(r, $ifaceNil))) { $s = 2; continue; }
		/* */ if (!($interfaceIsEqual(l, $ifaceNil))) { $s = 3; continue; }
		/* */ $s = 4; continue;
		/* if (ok && reverse) { */ case 1:
			_r = rev.ReverseMerge(r); /* */ $s = 5; case 5: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			_tuple$1 = _r;
			l = _tuple$1[0];
			r = _tuple$1[1];
			$s = 4; continue;
		/* } else if (reverse && !($interfaceIsEqual(r, $ifaceNil))) { */ case 2:
			_r$1 = r.Merge(l); /* */ $s = 6; case 6: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
			_tuple$2 = _r$1;
			r = _tuple$2[0];
			l = _tuple$2[1];
			$s = 4; continue;
		/* } else if (!($interfaceIsEqual(l, $ifaceNil))) { */ case 3:
			_r$2 = l.Merge(r); /* */ $s = 7; case 7: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
			_tuple$3 = _r$2;
			l = _tuple$3[0];
			r = _tuple$3[1];
		/* } */ case 4:
		$s = -1; return [(x = new PathChange.ptr(prefix, l), new x.constructor.elem(x)), (x$1 = new PathChange.ptr(prefix, r), new x$1.constructor.elem(x$1))];
		/* */ } return; } if ($f === undefined) { $f = { $blk: PathChange.ptr.prototype.prefixMerge }; } $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f._tuple = _tuple; $f._tuple$1 = _tuple$1; $f._tuple$2 = _tuple$2; $f._tuple$3 = _tuple$3; $f.l = l; $f.ok = ok; $f.pc = pc; $f.prefix = prefix; $f.r = r; $f.rev = rev; $f.reverse = reverse; $f.x = x; $f.x$1 = x$1; $f.$s = $s; $f.$r = $r; return $f;
	};
	PathChange.prototype.prefixMerge = function(prefix, l, r, reverse) { return this.$val.prefixMerge(prefix, l, r, reverse); };
	PathChange.ptr.prototype.updateSubPathIndex = function(o, idx) {
		var idx, o, path, pc, x, x$1;
		pc = this;
		path = $appendSlice((sliceType$2.nil), o.Path);
		(x = pc.Path.$length, ((x < 0 || x >= path.$length) ? ($throwRuntimeError("index out of range"), undefined) : path.$array[path.$offset + x] = new $Int(idx)));
		return [(x$1 = new PathChange.ptr(path, o.Change), new x$1.constructor.elem(x$1)), new pc.constructor.elem(pc)];
	};
	PathChange.prototype.updateSubPathIndex = function(o, idx) { return this.$val.updateSubPathIndex(o, idx); };
	PathChange.ptr.prototype.mergeSubPath = function(o, reverse) {
		var _r, _r$1, _r$2, _r$3, _r$4, _ref, _tmp, _tmp$1, _tmp$2, _tmp$3, afterSize, beforeSize, change$1, change$2, change$3, change$4, dest, end, idx, idx$1, o, pc, reverse, sub, sub$1, x, x$1, x$2, x$3, x$4, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; _r$3 = $f._r$3; _r$4 = $f._r$4; _ref = $f._ref; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; _tmp$2 = $f._tmp$2; _tmp$3 = $f._tmp$3; afterSize = $f.afterSize; beforeSize = $f.beforeSize; change$1 = $f.change$1; change$2 = $f.change$2; change$3 = $f.change$3; change$4 = $f.change$4; dest = $f.dest; end = $f.end; idx = $f.idx; idx$1 = $f.idx$1; o = $f.o; pc = $f.pc; reverse = $f.reverse; sub = $f.sub; sub$1 = $f.sub$1; x = $f.x; x$1 = $f.x$1; x$2 = $f.x$2; x$3 = $f.x$3; x$4 = $f.x$4; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		pc = this;
		sub = $subslice(o.Path, pc.Path.$length);
		_ref = pc.Change;
		/* */ if (_ref === $ifaceNil) { $s = 1; continue; }
		/* */ if ($assertType(_ref, Replace, true)[1]) { $s = 2; continue; }
		/* */ if ($assertType(_ref, Splice, true)[1]) { $s = 3; continue; }
		/* */ if ($assertType(_ref, Move, true)[1]) { $s = 4; continue; }
		/* */ $s = 5; continue;
		/* if (_ref === $ifaceNil) { */ case 1:
			change$1 = _ref;
			$s = -1; return [new o.constructor.elem(o), $ifaceNil];
		/* } else if ($assertType(_ref, Replace, true)[1]) { */ case 2:
			change$2 = $clone(_ref.$val, Replace);
			_r = change$2.Before.Apply($ifaceNil, (x = new PathChange.ptr(sub, o.Change), new x.constructor.elem(x))); /* */ $s = 6; case 6: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			change$2.Before = _r;
			$s = -1; return [$ifaceNil, (x$1 = new PathChange.ptr(pc.Path, new change$2.constructor.elem(change$2)), new x$1.constructor.elem(x$1))];
		/* } else if ($assertType(_ref, Splice, true)[1]) { */ case 3:
			change$3 = $clone(_ref.$val, Splice);
			idx = $assertType((0 >= sub.$length ? ($throwRuntimeError("index out of range"), undefined) : sub.$array[sub.$offset + 0]), $Int);
			_r$1 = change$3.Before.Count(); /* */ $s = 7; case 7: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
			_tmp = _r$1;
			_r$2 = change$3.After.Count(); /* */ $s = 8; case 8: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
			_tmp$1 = _r$2;
			beforeSize = _tmp;
			afterSize = _tmp$1;
			if (idx < change$3.Offset) {
				$s = -1; return [new o.constructor.elem(o), new pc.constructor.elem(pc)];
			} else if (idx >= (change$3.Offset + beforeSize >> 0)) {
				$s = -1; return $clone(pc, PathChange).updateSubPathIndex($clone(o, PathChange), (idx + afterSize >> 0) - beforeSize >> 0);
			}
			sub$1 = $appendSlice((sliceType$2.nil), sub);
			(0 >= sub$1.$length ? ($throwRuntimeError("index out of range"), undefined) : sub$1.$array[sub$1.$offset + 0] = new $Int((idx - change$3.Offset >> 0)));
			_r$3 = change$3.Before.ApplyCollection($ifaceNil, (x$2 = new PathChange.ptr(sub$1, o.Change), new x$2.constructor.elem(x$2))); /* */ $s = 9; case 9: if($c) { $c = false; _r$3 = _r$3.$blk(); } if (_r$3 && _r$3.$blk !== undefined) { break s; }
			change$3.Before = _r$3;
			$s = -1; return [$ifaceNil, (x$3 = new PathChange.ptr(pc.Path, new change$3.constructor.elem(change$3)), new x$3.constructor.elem(x$3))];
		/* } else if ($assertType(_ref, Move, true)[1]) { */ case 4:
			change$4 = $clone(_ref.$val, Move);
			idx$1 = $assertType((0 >= sub.$length ? ($throwRuntimeError("index out of range"), undefined) : sub.$array[sub.$offset + 0]), $Int);
			_tmp$2 = $clone(change$4, Move).dest();
			_tmp$3 = change$4.Offset + change$4.Count >> 0;
			dest = _tmp$2;
			end = _tmp$3;
			if (idx$1 >= change$4.Offset && idx$1 < end) {
				$s = -1; return $clone(pc, PathChange).updateSubPathIndex($clone(o, PathChange), idx$1 + change$4.Distance >> 0);
			} else if (idx$1 >= dest && idx$1 < change$4.Offset) {
				$s = -1; return $clone(pc, PathChange).updateSubPathIndex($clone(o, PathChange), idx$1 + change$4.Count >> 0);
			} else if (idx$1 >= end && idx$1 < dest) {
				$s = -1; return $clone(pc, PathChange).updateSubPathIndex($clone(o, PathChange), idx$1 - change$4.Count >> 0);
			}
			$s = -1; return [new o.constructor.elem(o), new pc.constructor.elem(pc)];
		/* } */ case 5:
		_r$4 = $clone(pc, PathChange).prefixMerge(pc.Path, pc.Change, (x$4 = new PathChange.ptr(sub, o.Change), new x$4.constructor.elem(x$4)), reverse); /* */ $s = 10; case 10: if($c) { $c = false; _r$4 = _r$4.$blk(); } if (_r$4 && _r$4.$blk !== undefined) { break s; }
		$s = -1; return _r$4;
		/* */ } return; } if ($f === undefined) { $f = { $blk: PathChange.ptr.prototype.mergeSubPath }; } $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f._r$3 = _r$3; $f._r$4 = _r$4; $f._ref = _ref; $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f._tmp$2 = _tmp$2; $f._tmp$3 = _tmp$3; $f.afterSize = afterSize; $f.beforeSize = beforeSize; $f.change$1 = change$1; $f.change$2 = change$2; $f.change$3 = change$3; $f.change$4 = change$4; $f.dest = dest; $f.end = end; $f.idx = idx; $f.idx$1 = idx$1; $f.o = o; $f.pc = pc; $f.reverse = reverse; $f.sub = sub; $f.sub$1 = sub$1; $f.x = x; $f.x$1 = x$1; $f.x$2 = x$2; $f.x$3 = x$3; $f.x$4 = x$4; $f.$s = $s; $f.$r = $r; return $f;
	};
	PathChange.prototype.mergeSubPath = function(o, reverse) { return this.$val.mergeSubPath(o, reverse); };
	PathChange.ptr.prototype.commonPrefixLen = function(a, b) {
		var _i, _ref, _tmp, _tmp$1, a, b, elt, kk, pc;
		pc = this;
		if (a.$length > b.$length) {
			_tmp = b;
			_tmp$1 = a;
			a = _tmp;
			b = _tmp$1;
		}
		_ref = a;
		_i = 0;
		while (true) {
			if (!(_i < _ref.$length)) { break; }
			kk = _i;
			elt = ((_i < 0 || _i >= _ref.$length) ? ($throwRuntimeError("index out of range"), undefined) : _ref.$array[_ref.$offset + _i]);
			if (!($interfaceIsEqual(((kk < 0 || kk >= b.$length) ? ($throwRuntimeError("index out of range"), undefined) : b.$array[b.$offset + kk]), elt))) {
				return kk;
			}
			_i++;
		}
		return a.$length;
	};
	PathChange.prototype.commonPrefixLen = function(a, b) { return this.$val.commonPrefixLen(a, b); };
	Replace.ptr.prototype.Revert = function() {
		var s, x;
		s = this;
		return (x = new Replace.ptr(s.After, s.Before), new x.constructor.elem(x));
	};
	Replace.prototype.Revert = function() { return this.$val.Revert(); };
	Replace.ptr.prototype.MergeReplace = function(other) {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, other, other1, s, s1;
		other1 = ptrType.nil;
		s1 = ptrType.nil;
		s = this;
		if ($clone(s, Replace).IsDelete() && $clone(other, Replace).IsDelete()) {
			_tmp = ptrType.nil;
			_tmp$1 = ptrType.nil;
			other1 = _tmp;
			s1 = _tmp$1;
			return [other1, s1];
		}
		other.Before = s.After;
		_tmp$2 = other;
		_tmp$3 = ptrType.nil;
		other1 = _tmp$2;
		s1 = _tmp$3;
		return [other1, s1];
	};
	Replace.prototype.MergeReplace = function(other) { return this.$val.MergeReplace(other); };
	Replace.ptr.prototype.MergeSplice = function(other) {
		var _r, _tmp, _tmp$1, other, other1, s, s1, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; other = $f.other; other1 = $f.other1; s = $f.s; s1 = $f.s1; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		s = [s];
		other1 = ptrType$1.nil;
		s1 = ptrType.nil;
		s[0] = this;
		_r = s[0].Before.Apply($ifaceNil, new other.constructor.elem(other)); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		s[0].Before = _r;
		_tmp = ptrType$1.nil;
		_tmp$1 = s[0];
		other1 = _tmp;
		s1 = _tmp$1;
		$s = -1; return [other1, s1];
		/* */ } return; } if ($f === undefined) { $f = { $blk: Replace.ptr.prototype.MergeSplice }; } $f._r = _r; $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f.other = other; $f.other1 = other1; $f.s = s; $f.s1 = s1; $f.$s = $s; $f.$r = $r; return $f;
	};
	Replace.prototype.MergeSplice = function(other) { return this.$val.MergeSplice(other); };
	Replace.ptr.prototype.MergeMove = function(other) {
		var _r, _tmp, _tmp$1, other, other1, s, s1, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; other = $f.other; other1 = $f.other1; s = $f.s; s1 = $f.s1; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		s = [s];
		other1 = ptrType$2.nil;
		s1 = ptrType.nil;
		s[0] = this;
		_r = s[0].Before.Apply($ifaceNil, new other.constructor.elem(other)); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		s[0].Before = _r;
		_tmp = ptrType$2.nil;
		_tmp$1 = s[0];
		other1 = _tmp;
		s1 = _tmp$1;
		$s = -1; return [other1, s1];
		/* */ } return; } if ($f === undefined) { $f = { $blk: Replace.ptr.prototype.MergeMove }; } $f._r = _r; $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f.other = other; $f.other1 = other1; $f.s = s; $f.s1 = s1; $f.$s = $s; $f.$r = $r; return $f;
	};
	Replace.prototype.MergeMove = function(other) { return this.$val.MergeMove(other); };
	Replace.ptr.prototype.Merge = function(other) {
		var _r, _r$1, _r$2, _r$3, _r$4, _r$5, _r$6, _ref, _tmp, _tmp$1, _tuple, _tuple$1, _tuple$2, _tuple$3, _tuple$4, _tuple$5, _tuple$6, _tuple$7, cx, o, o$1, o$2, o$3, other, otherx, s, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; _r$3 = $f._r$3; _r$4 = $f._r$4; _r$5 = $f._r$5; _r$6 = $f._r$6; _ref = $f._ref; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; _tuple = $f._tuple; _tuple$1 = $f._tuple$1; _tuple$2 = $f._tuple$2; _tuple$3 = $f._tuple$3; _tuple$4 = $f._tuple$4; _tuple$5 = $f._tuple$5; _tuple$6 = $f._tuple$6; _tuple$7 = $f._tuple$7; cx = $f.cx; o = $f.o; o$1 = $f.o$1; o$2 = $f.o$2; o$3 = $f.o$3; other = $f.other; otherx = $f.otherx; s = $f.s; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		otherx = $ifaceNil;
		cx = $ifaceNil;
		s = this;
		if ($interfaceIsEqual(other, $ifaceNil)) {
			_tmp = $ifaceNil;
			_tmp$1 = new s.constructor.elem(s);
			otherx = _tmp;
			cx = _tmp$1;
			$s = -1; return [otherx, cx];
		}
		_ref = other;
		/* */ if ($assertType(_ref, Replace, true)[1]) { $s = 1; continue; }
		/* */ if ($assertType(_ref, Splice, true)[1]) { $s = 2; continue; }
		/* */ if ($assertType(_ref, Move, true)[1]) { $s = 3; continue; }
		/* */ if ($assertType(_ref, Custom, true)[1]) { $s = 4; continue; }
		/* */ $s = 5; continue;
		/* if ($assertType(_ref, Replace, true)[1]) { */ case 1:
			o = $clone(_ref.$val, Replace);
			_tuple$1 = $clone(s, Replace).MergeReplace($clone(o, Replace));
			_r = change(_tuple$1[0], _tuple$1[1]); /* */ $s = 6; case 6: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			_tuple = _r;
			otherx = _tuple[0];
			cx = _tuple[1];
			$s = -1; return [otherx, cx];
		/* } else if ($assertType(_ref, Splice, true)[1]) { */ case 2:
			o$1 = $clone(_ref.$val, Splice);
			_r$1 = $clone(s, Replace).MergeSplice($clone(o$1, Splice)); /* */ $s = 7; case 7: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
			_tuple$3 = _r$1;
			_r$2 = change(_tuple$3[0], _tuple$3[1]); /* */ $s = 8; case 8: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
			_tuple$2 = _r$2;
			otherx = _tuple$2[0];
			cx = _tuple$2[1];
			$s = -1; return [otherx, cx];
		/* } else if ($assertType(_ref, Move, true)[1]) { */ case 3:
			o$2 = $clone(_ref.$val, Move);
			_r$3 = $clone(s, Replace).MergeMove($clone(o$2, Move)); /* */ $s = 9; case 9: if($c) { $c = false; _r$3 = _r$3.$blk(); } if (_r$3 && _r$3.$blk !== undefined) { break s; }
			_tuple$5 = _r$3;
			_r$4 = change(_tuple$5[0], _tuple$5[1]); /* */ $s = 10; case 10: if($c) { $c = false; _r$4 = _r$4.$blk(); } if (_r$4 && _r$4.$blk !== undefined) { break s; }
			_tuple$4 = _r$4;
			otherx = _tuple$4[0];
			cx = _tuple$4[1];
			$s = -1; return [otherx, cx];
		/* } else if ($assertType(_ref, Custom, true)[1]) { */ case 4:
			o$3 = _ref;
			_r$5 = o$3.ReverseMerge(new s.constructor.elem(s)); /* */ $s = 11; case 11: if($c) { $c = false; _r$5 = _r$5.$blk(); } if (_r$5 && _r$5.$blk !== undefined) { break s; }
			_tuple$7 = _r$5;
			_r$6 = swap(_tuple$7[0], _tuple$7[1]); /* */ $s = 12; case 12: if($c) { $c = false; _r$6 = _r$6.$blk(); } if (_r$6 && _r$6.$blk !== undefined) { break s; }
			_tuple$6 = _r$6;
			otherx = _tuple$6[0];
			cx = _tuple$6[1];
			$s = -1; return [otherx, cx];
		/* } */ case 5:
		$panic(new $String("Unexpected change"));
		$s = -1; return [otherx, cx];
		/* */ } return; } if ($f === undefined) { $f = { $blk: Replace.ptr.prototype.Merge }; } $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f._r$3 = _r$3; $f._r$4 = _r$4; $f._r$5 = _r$5; $f._r$6 = _r$6; $f._ref = _ref; $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f._tuple = _tuple; $f._tuple$1 = _tuple$1; $f._tuple$2 = _tuple$2; $f._tuple$3 = _tuple$3; $f._tuple$4 = _tuple$4; $f._tuple$5 = _tuple$5; $f._tuple$6 = _tuple$6; $f._tuple$7 = _tuple$7; $f.cx = cx; $f.o = o; $f.o$1 = o$1; $f.o$2 = o$2; $f.o$3 = o$3; $f.other = other; $f.otherx = otherx; $f.s = s; $f.$s = $s; $f.$r = $r; return $f;
	};
	Replace.prototype.Merge = function(other) { return this.$val.Merge(other); };
	Replace.ptr.prototype.IsDelete = function() {
		var s;
		s = this;
		return !($interfaceIsEqual(s.Before, new $pkg.Nil.constructor.elem($pkg.Nil))) && $interfaceIsEqual(s.After, new $pkg.Nil.constructor.elem($pkg.Nil));
	};
	Replace.prototype.IsDelete = function() { return this.$val.IsDelete(); };
	Replace.ptr.prototype.IsCreate = function() {
		var s;
		s = this;
		return $interfaceIsEqual(s.Before, new $pkg.Nil.constructor.elem($pkg.Nil)) && !($interfaceIsEqual(s.After, new $pkg.Nil.constructor.elem($pkg.Nil)));
	};
	Replace.prototype.IsCreate = function() { return this.$val.IsCreate(); };
	Replace.ptr.prototype.Change = function() {
		var s, x;
		s = this;
		if (s === ptrType.nil) {
			return $ifaceNil;
		}
		return (x = s, new x.constructor.elem(x));
	};
	Replace.prototype.Change = function() { return this.$val.Change(); };
	Splice.ptr.prototype.Revert = function() {
		var s, x;
		s = this;
		return (x = new Splice.ptr(s.Offset, s.After, s.Before), new x.constructor.elem(x));
	};
	Splice.prototype.Revert = function() { return this.$val.Revert(); };
	Splice.ptr.prototype.MergeReplace = function(other) {
		var _r, _tmp, _tmp$1, other, other1, s, s1, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; other = $f.other; other1 = $f.other1; s = $f.s; s1 = $f.s1; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		other = [other];
		other1 = ptrType.nil;
		s1 = ptrType$1.nil;
		s = this;
		_r = other[0].Before.Apply($ifaceNil, new s.constructor.elem(s)); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		other[0].Before = _r;
		_tmp = other[0];
		_tmp$1 = ptrType$1.nil;
		other1 = _tmp;
		s1 = _tmp$1;
		$s = -1; return [other1, s1];
		/* */ } return; } if ($f === undefined) { $f = { $blk: Splice.ptr.prototype.MergeReplace }; } $f._r = _r; $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f.other = other; $f.other1 = other1; $f.s = s; $f.s1 = s1; $f.$s = $s; $f.$r = $r; return $f;
	};
	Splice.prototype.MergeReplace = function(other) { return this.$val.MergeReplace(other); };
	Splice.ptr.prototype.MergeSplice = function(other) {
		var _r, _r$1, _r$10, _r$11, _r$12, _r$13, _r$14, _r$2, _r$3, _r$4, _r$5, _r$6, _r$7, _r$8, _r$9, _tmp, _tmp$1, _tmp$10, _tmp$11, _tmp$12, _tmp$13, _tmp$14, _tmp$15, _tmp$16, _tmp$17, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tmp$8, _tmp$9, oend, ostart, other, other1, s, s1, send, sliced, sliced$1, sstart, sx, sx$1, x, x$1, x$2, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; _r$10 = $f._r$10; _r$11 = $f._r$11; _r$12 = $f._r$12; _r$13 = $f._r$13; _r$14 = $f._r$14; _r$2 = $f._r$2; _r$3 = $f._r$3; _r$4 = $f._r$4; _r$5 = $f._r$5; _r$6 = $f._r$6; _r$7 = $f._r$7; _r$8 = $f._r$8; _r$9 = $f._r$9; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; _tmp$10 = $f._tmp$10; _tmp$11 = $f._tmp$11; _tmp$12 = $f._tmp$12; _tmp$13 = $f._tmp$13; _tmp$14 = $f._tmp$14; _tmp$15 = $f._tmp$15; _tmp$16 = $f._tmp$16; _tmp$17 = $f._tmp$17; _tmp$2 = $f._tmp$2; _tmp$3 = $f._tmp$3; _tmp$4 = $f._tmp$4; _tmp$5 = $f._tmp$5; _tmp$6 = $f._tmp$6; _tmp$7 = $f._tmp$7; _tmp$8 = $f._tmp$8; _tmp$9 = $f._tmp$9; oend = $f.oend; ostart = $f.ostart; other = $f.other; other1 = $f.other1; s = $f.s; s1 = $f.s1; send = $f.send; sliced = $f.sliced; sliced$1 = $f.sliced$1; sstart = $f.sstart; sx = $f.sx; sx$1 = $f.sx$1; x = $f.x; x$1 = $f.x$1; x$2 = $f.x$2; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		other = [other];
		s = [s];
		sx = [sx];
		sx$1 = [sx$1];
		other1 = ptrType$1.nil;
		s1 = ptrType$1.nil;
		s[0] = this;
		_tmp = s[0].Offset;
		_r = s[0].Before.Count(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_tmp$1 = s[0].Offset + _r >> 0;
		sstart = _tmp;
		send = _tmp$1;
		_tmp$2 = other[0].Offset;
		_r$1 = other[0].Before.Count(); /* */ $s = 2; case 2: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		_tmp$3 = other[0].Offset + _r$1 >> 0;
		ostart = _tmp$2;
		oend = _tmp$3;
			/* */ if (send <= ostart) { $s = 4; continue; }
			/* */ if (sstart >= oend) { $s = 5; continue; }
			/* */ if (sstart < ostart && send < oend) { $s = 6; continue; }
			/* */ if ((sstart === ostart) && send < oend) { $s = 7; continue; }
			/* */ if (sstart <= ostart && send >= oend) { $s = 8; continue; }
			/* */ if (sstart > ostart && send <= oend) { $s = 9; continue; }
			/* */ $s = 10; continue;
			/* if (send <= ostart) { */ case 4:
				_r$2 = s[0].After.Count(); /* */ $s = 12; case 12: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
				other[0].Offset = other[0].Offset + ((_r$2 - ((send - sstart >> 0)) >> 0)) >> 0;
				_tmp$4 = other[0];
				_tmp$5 = s[0];
				other1 = _tmp$4;
				s1 = _tmp$5;
				$s = -1; return [other1, s1];
			/* } else if (sstart >= oend) { */ case 5:
				sx[0] = $clone(s[0], Splice);
				_r$3 = other[0].After.Count(); /* */ $s = 13; case 13: if($c) { $c = false; _r$3 = _r$3.$blk(); } if (_r$3 && _r$3.$blk !== undefined) { break s; }
				sx[0].Offset = sx[0].Offset + ((_r$3 - ((oend - ostart >> 0)) >> 0)) >> 0;
				_tmp$6 = other[0];
				_tmp$7 = sx[0];
				other1 = _tmp$6;
				s1 = _tmp$7;
				$s = -1; return [other1, s1];
			/* } else if (sstart < ostart && send < oend) { */ case 6:
				_r$4 = s[0].After.Count(); /* */ $s = 14; case 14: if($c) { $c = false; _r$4 = _r$4.$blk(); } if (_r$4 && _r$4.$blk !== undefined) { break s; }
				other[0].Offset = sstart + _r$4 >> 0;
				_r$5 = other[0].Before.Slice(send - ostart >> 0, oend - send >> 0); /* */ $s = 15; case 15: if($c) { $c = false; _r$5 = _r$5.$blk(); } if (_r$5 && _r$5.$blk !== undefined) { break s; }
				other[0].Before = _r$5;
				_r$6 = s[0].Before.Slice(0, ostart - sstart >> 0); /* */ $s = 16; case 16: if($c) { $c = false; _r$6 = _r$6.$blk(); } if (_r$6 && _r$6.$blk !== undefined) { break s; }
				s[0].Before = _r$6;
				_tmp$8 = other[0];
				_tmp$9 = s[0];
				other1 = _tmp$8;
				s1 = _tmp$9;
				$s = -1; return [other1, s1];
			/* } else if ((sstart === ostart) && send < oend) { */ case 7:
				_r$7 = other[0].Before.ApplyCollection($ifaceNil, (x = new Splice.ptr(0, s[0].Before, s[0].After), new x.constructor.elem(x))); /* */ $s = 17; case 17: if($c) { $c = false; _r$7 = _r$7.$blk(); } if (_r$7 && _r$7.$blk !== undefined) { break s; }
				other[0].Before = _r$7;
				_tmp$10 = other[0];
				_tmp$11 = ptrType$1.nil;
				other1 = _tmp$10;
				s1 = _tmp$11;
				$s = -1; return [other1, s1];
			/* } else if (sstart <= ostart && send >= oend) { */ case 8:
				_r$8 = s[0].Before.Slice(ostart - sstart >> 0, oend - ostart >> 0); /* */ $s = 18; case 18: if($c) { $c = false; _r$8 = _r$8.$blk(); } if (_r$8 && _r$8.$blk !== undefined) { break s; }
				sliced = _r$8;
				_r$9 = s[0].Before.ApplyCollection($ifaceNil, (x$1 = new Splice.ptr(ostart - sstart >> 0, sliced, other[0].After), new x$1.constructor.elem(x$1))); /* */ $s = 19; case 19: if($c) { $c = false; _r$9 = _r$9.$blk(); } if (_r$9 && _r$9.$blk !== undefined) { break s; }
				s[0].Before = _r$9;
				_tmp$12 = ptrType$1.nil;
				_tmp$13 = s[0];
				other1 = _tmp$12;
				s1 = _tmp$13;
				$s = -1; return [other1, s1];
			/* } else if (sstart > ostart && send <= oend) { */ case 9:
				_r$10 = other[0].Before.Slice(sstart - ostart >> 0, send - sstart >> 0); /* */ $s = 20; case 20: if($c) { $c = false; _r$10 = _r$10.$blk(); } if (_r$10 && _r$10.$blk !== undefined) { break s; }
				sliced$1 = _r$10;
				_r$11 = other[0].Before.ApplyCollection($ifaceNil, (x$2 = new Splice.ptr(sstart - ostart >> 0, sliced$1, s[0].After), new x$2.constructor.elem(x$2))); /* */ $s = 21; case 21: if($c) { $c = false; _r$11 = _r$11.$blk(); } if (_r$11 && _r$11.$blk !== undefined) { break s; }
				other[0].Before = _r$11;
				_tmp$14 = other[0];
				_tmp$15 = ptrType$1.nil;
				other1 = _tmp$14;
				s1 = _tmp$15;
				$s = -1; return [other1, s1];
			/* } else { */ case 10:
				_r$12 = other[0].Before.Slice(0, sstart - ostart >> 0); /* */ $s = 22; case 22: if($c) { $c = false; _r$12 = _r$12.$blk(); } if (_r$12 && _r$12.$blk !== undefined) { break s; }
				other[0].Before = _r$12;
				sx$1[0] = $clone(s[0], Splice);
				_r$13 = other[0].After.Count(); /* */ $s = 23; case 23: if($c) { $c = false; _r$13 = _r$13.$blk(); } if (_r$13 && _r$13.$blk !== undefined) { break s; }
				sx$1[0].Offset = ostart + _r$13 >> 0;
				_r$14 = s[0].Before.Slice(oend - sstart >> 0, send - oend >> 0); /* */ $s = 24; case 24: if($c) { $c = false; _r$14 = _r$14.$blk(); } if (_r$14 && _r$14.$blk !== undefined) { break s; }
				sx$1[0].Before = _r$14;
				_tmp$16 = other[0];
				_tmp$17 = sx$1[0];
				other1 = _tmp$16;
				s1 = _tmp$17;
				$s = -1; return [other1, s1];
			/* } */ case 11:
		case 3:
		$s = -1; return [other1, s1];
		/* */ } return; } if ($f === undefined) { $f = { $blk: Splice.ptr.prototype.MergeSplice }; } $f._r = _r; $f._r$1 = _r$1; $f._r$10 = _r$10; $f._r$11 = _r$11; $f._r$12 = _r$12; $f._r$13 = _r$13; $f._r$14 = _r$14; $f._r$2 = _r$2; $f._r$3 = _r$3; $f._r$4 = _r$4; $f._r$5 = _r$5; $f._r$6 = _r$6; $f._r$7 = _r$7; $f._r$8 = _r$8; $f._r$9 = _r$9; $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f._tmp$10 = _tmp$10; $f._tmp$11 = _tmp$11; $f._tmp$12 = _tmp$12; $f._tmp$13 = _tmp$13; $f._tmp$14 = _tmp$14; $f._tmp$15 = _tmp$15; $f._tmp$16 = _tmp$16; $f._tmp$17 = _tmp$17; $f._tmp$2 = _tmp$2; $f._tmp$3 = _tmp$3; $f._tmp$4 = _tmp$4; $f._tmp$5 = _tmp$5; $f._tmp$6 = _tmp$6; $f._tmp$7 = _tmp$7; $f._tmp$8 = _tmp$8; $f._tmp$9 = _tmp$9; $f.oend = oend; $f.ostart = ostart; $f.other = other; $f.other1 = other1; $f.s = s; $f.s1 = s1; $f.send = send; $f.sliced = sliced; $f.sliced$1 = sliced$1; $f.sstart = sstart; $f.sx = sx; $f.sx$1 = sx$1; $f.x = x; $f.x$1 = x$1; $f.x$2 = x$2; $f.$s = $s; $f.$r = $r; return $f;
	};
	Splice.prototype.MergeSplice = function(other) { return this.$val.MergeSplice(other); };
	Splice.ptr.prototype.MergeMove = function(o) {
		var _r, _r$1, _r$2, _r$3, _r$4, _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tuple, _tuple$1, _tuple$2, _tuple$3, a, beforeSize, left, o, ok, ox, rest, right, s, sx, undo, x, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; _r$3 = $f._r$3; _r$4 = $f._r$4; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; _tmp$2 = $f._tmp$2; _tmp$3 = $f._tmp$3; _tmp$4 = $f._tmp$4; _tmp$5 = $f._tmp$5; _tuple = $f._tuple; _tuple$1 = $f._tuple$1; _tuple$2 = $f._tuple$2; _tuple$3 = $f._tuple$3; a = $f.a; beforeSize = $f.beforeSize; left = $f.left; o = $f.o; ok = $f.ok; ox = $f.ox; rest = $f.rest; right = $f.right; s = $f.s; sx = $f.sx; undo = $f.undo; x = $f.x; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		ox = $ifaceNil;
		sx = $ifaceNil;
		s = this;
		_r = s.Before.Count(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		beforeSize = _r;
		/* */ if (o.Offset >= s.Offset && (o.Offset + o.Count >> 0) <= (s.Offset + beforeSize >> 0)) { $s = 2; continue; }
		/* */ $s = 3; continue;
		/* if (o.Offset >= s.Offset && (o.Offset + o.Count >> 0) <= (s.Offset + beforeSize >> 0)) { */ case 2:
			_r$1 = $clone(s, Splice).mergeContainedMove($clone(o, Move)); /* */ $s = 4; case 4: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
			_tuple = _r$1;
			ox = _tuple[0];
			sx = _tuple[1];
			$s = -1; return [ox, sx];
		/* } */ case 3:
		/* */ if (o.Offset <= s.Offset && (o.Offset + o.Count >> 0) >= (s.Offset + beforeSize >> 0)) { $s = 5; continue; }
		/* */ $s = 6; continue;
		/* if (o.Offset <= s.Offset && (o.Offset + o.Count >> 0) >= (s.Offset + beforeSize >> 0)) { */ case 5:
			_r$2 = s.After.Count(); /* */ $s = 7; case 7: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
			o.Count = o.Count + ((_r$2 - beforeSize >> 0)) >> 0;
			s.Offset = s.Offset + (o.Distance) >> 0;
			_tmp = new o.constructor.elem(o);
			_tmp$1 = new s.constructor.elem(s);
			ox = _tmp;
			sx = _tmp$1;
			$s = -1; return [ox, sx];
		/* } */ case 6:
		/* */ if (o.Offset >= (s.Offset + beforeSize >> 0) || s.Offset >= (o.Offset + o.Count >> 0)) { $s = 8; continue; }
		/* */ $s = 9; continue;
		/* if (o.Offset >= (s.Offset + beforeSize >> 0) || s.Offset >= (o.Offset + o.Count >> 0)) { */ case 8:
			_r$3 = $clone(s, Splice).mergeNonOverlappingMove($clone(o, Move)); /* */ $s = 10; case 10: if($c) { $c = false; _r$3 = _r$3.$blk(); } if (_r$3 && _r$3.$blk !== undefined) { break s; }
			_tuple$1 = _r$3;
			ox = _tuple$1[0];
			sx = _tuple$1[1];
			$s = -1; return [ox, sx];
		/* } */ case 9:
		_tmp$2 = $clone(o, Move);
		_tmp$3 = new Move.ptr(o.Offset + o.Distance >> 0, 0, 0);
		rest = $clone(_tmp$2, Move);
		undo = $clone(_tmp$3, Move);
		if (o.Offset > s.Offset) {
			left = (s.Offset + beforeSize >> 0) - o.Offset >> 0;
			rest.Offset = rest.Offset + (left) >> 0;
			rest.Count = rest.Count - (left) >> 0;
			undo.Count = left;
			if (o.Distance < 0) {
				rest.Distance = rest.Distance - (left) >> 0;
				undo.Distance = (o.Count - left >> 0) - o.Distance >> 0;
			} else {
				undo.Distance = -o.Distance;
			}
		} else {
			right = (o.Offset + o.Count >> 0) - s.Offset >> 0;
			rest.Count = rest.Count - (right) >> 0;
			undo.Count = right;
			undo.Offset = undo.Offset + (rest.Count) >> 0;
			if (o.Distance < 0) {
				undo.Distance = -o.Distance;
			} else {
				rest.Distance = rest.Distance + (right) >> 0;
				undo.Distance = (right - o.Distance >> 0) - o.Count >> 0;
			}
		}
		_r$4 = $clone(s, Splice).mergeNonOverlappingMove($clone(rest, Move)); /* */ $s = 11; case 11: if($c) { $c = false; _r$4 = _r$4.$blk(); } if (_r$4 && _r$4.$blk !== undefined) { break s; }
		_tuple$2 = _r$4;
		ox = _tuple$2[0];
		sx = _tuple$2[1];
		_tuple$3 = $assertType(sx, ChangeSet, true);
		a = _tuple$3[0];
		ok = _tuple$3[1];
		if (ok) {
			sx = ((x = $appendSlice(new sliceType([new undo.constructor.elem(undo)]), $subslice(new sliceType(a.$array), a.$offset, a.$offset + a.$length)), $subslice(new ChangeSet(x.$array), x.$offset, x.$offset + x.$length)));
		} else {
			sx = new ChangeSet([new undo.constructor.elem(undo), sx]);
		}
		_tmp$4 = ox;
		_tmp$5 = sx;
		ox = _tmp$4;
		sx = _tmp$5;
		$s = -1; return [ox, sx];
		/* */ } return; } if ($f === undefined) { $f = { $blk: Splice.ptr.prototype.MergeMove }; } $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f._r$3 = _r$3; $f._r$4 = _r$4; $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f._tmp$2 = _tmp$2; $f._tmp$3 = _tmp$3; $f._tmp$4 = _tmp$4; $f._tmp$5 = _tmp$5; $f._tuple = _tuple; $f._tuple$1 = _tuple$1; $f._tuple$2 = _tuple$2; $f._tuple$3 = _tuple$3; $f.a = a; $f.beforeSize = beforeSize; $f.left = left; $f.o = o; $f.ok = ok; $f.ox = ox; $f.rest = rest; $f.right = right; $f.s = s; $f.sx = sx; $f.undo = undo; $f.x = x; $f.$s = $s; $f.$r = $r; return $f;
	};
	Splice.prototype.MergeMove = function(o) { return this.$val.MergeMove(o); };
	Splice.ptr.prototype.mergeNonOverlappingMove = function(o) {
		var _r, _r$1, _r$2, _r$3, _r$4, _r$5, _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, beforeSize, diff, empty$1, o, odest, ox, right, s, s1, s2, sx, x, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; _r$3 = $f._r$3; _r$4 = $f._r$4; _r$5 = $f._r$5; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; _tmp$2 = $f._tmp$2; _tmp$3 = $f._tmp$3; _tmp$4 = $f._tmp$4; _tmp$5 = $f._tmp$5; beforeSize = $f.beforeSize; diff = $f.diff; empty$1 = $f.empty$1; o = $f.o; odest = $f.odest; ox = $f.ox; right = $f.right; s = $f.s; s1 = $f.s1; s2 = $f.s2; sx = $f.sx; x = $f.x; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		ox = $ifaceNil;
		sx = $ifaceNil;
		s = this;
		_tmp = $clone(o, Move).dest();
		_r = s.Before.Count(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_tmp$1 = _r;
		odest = _tmp;
		beforeSize = _tmp$1;
		_r$1 = s.After.Count(); /* */ $s = 2; case 2: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		diff = _r$1 - beforeSize >> 0;
		/* */ if (odest > s.Offset && odest < (s.Offset + beforeSize >> 0)) { $s = 3; continue; }
		/* */ $s = 4; continue;
		/* if (odest > s.Offset && odest < (s.Offset + beforeSize >> 0)) { */ case 3:
			right = (s.Offset + beforeSize >> 0) - odest >> 0;
			s1 = $clone(s, Splice);
			_r$2 = s.Before.Slice(0, odest - s.Offset >> 0); /* */ $s = 5; case 5: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
			s1.Before = _r$2;
			_r$3 = s.Before.Slice(0, 0); /* */ $s = 6; case 6: if($c) { $c = false; _r$3 = _r$3.$blk(); } if (_r$3 && _r$3.$blk !== undefined) { break s; }
			empty$1 = _r$3;
			s2 = new Splice.ptr((o.Offset + o.Count >> 0) + o.Distance >> 0, empty$1, empty$1);
			_r$4 = s.Before.Slice(odest - s.Offset >> 0, right); /* */ $s = 7; case 7: if($c) { $c = false; _r$4 = _r$4.$blk(); } if (_r$4 && _r$4.$blk !== undefined) { break s; }
			s2.Before = _r$4;
			if (o.Offset < s.Offset) {
				s1.Offset = s1.Offset - (o.Count) >> 0;
				o.Distance = o.Distance + ((right + diff >> 0)) >> 0;
			} else {
				o.Distance = o.Distance + (right) >> 0;
				o.Offset = o.Offset + (diff) >> 0;
			}
			_tmp$2 = new o.constructor.elem(o);
			_tmp$3 = ((x = new sliceType([new s2.constructor.elem(s2), new s1.constructor.elem(s1)]), $subslice(new ChangeSet(x.$array), x.$offset, x.$offset + x.$length)));
			ox = _tmp$2;
			sx = _tmp$3;
			$s = -1; return [ox, sx];
		/* } */ case 4:
		/* */ if (odest <= s.Offset) { $s = 8; continue; }
		_r$5 = s.Before.Count(); /* */ $s = 11; case 11: if($c) { $c = false; _r$5 = _r$5.$blk(); } if (_r$5 && _r$5.$blk !== undefined) { break s; }
		/* */ if (odest >= (s.Offset + _r$5 >> 0)) { $s = 9; continue; }
		/* */ $s = 10; continue;
		/* if (odest <= s.Offset) { */ case 8:
			if (o.Offset > s.Offset) {
				o.Offset = o.Offset + (diff) >> 0;
				o.Distance = o.Distance - (diff) >> 0;
				s.Offset = s.Offset + (o.Count) >> 0;
			}
			$s = 10; continue;
		/* } else if (odest >= (s.Offset + _r$5 >> 0)) { */ case 9:
			if (o.Offset > s.Offset) {
				o.Offset = o.Offset + (diff) >> 0;
			} else {
				o.Distance = o.Distance + (diff) >> 0;
				s.Offset = s.Offset - (o.Count) >> 0;
			}
		/* } */ case 10:
		_tmp$4 = new o.constructor.elem(o);
		_tmp$5 = new s.constructor.elem(s);
		ox = _tmp$4;
		sx = _tmp$5;
		$s = -1; return [ox, sx];
		/* */ } return; } if ($f === undefined) { $f = { $blk: Splice.ptr.prototype.mergeNonOverlappingMove }; } $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f._r$3 = _r$3; $f._r$4 = _r$4; $f._r$5 = _r$5; $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f._tmp$2 = _tmp$2; $f._tmp$3 = _tmp$3; $f._tmp$4 = _tmp$4; $f._tmp$5 = _tmp$5; $f.beforeSize = beforeSize; $f.diff = diff; $f.empty$1 = empty$1; $f.o = o; $f.odest = odest; $f.ox = ox; $f.right = right; $f.s = s; $f.s1 = s1; $f.s2 = s2; $f.sx = sx; $f.x = x; $f.$s = $s; $f.$r = $r; return $f;
	};
	Splice.prototype.mergeNonOverlappingMove = function(o) { return this.$val.mergeNonOverlappingMove(o); };
	Splice.ptr.prototype.mergeContainedMove = function(o) {
		var _r, _r$1, _r$2, _r$3, _r$4, _r$5, _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, beforeSize, empty$1, o, odest, ox, s, sliced, spliced, sx, x, x$1, x$2, x$3, x$4, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; _r$3 = $f._r$3; _r$4 = $f._r$4; _r$5 = $f._r$5; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; _tmp$2 = $f._tmp$2; _tmp$3 = $f._tmp$3; _tmp$4 = $f._tmp$4; _tmp$5 = $f._tmp$5; _tmp$6 = $f._tmp$6; _tmp$7 = $f._tmp$7; beforeSize = $f.beforeSize; empty$1 = $f.empty$1; o = $f.o; odest = $f.odest; ox = $f.ox; s = $f.s; sliced = $f.sliced; spliced = $f.spliced; sx = $f.sx; x = $f.x; x$1 = $f.x$1; x$2 = $f.x$2; x$3 = $f.x$3; x$4 = $f.x$4; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		ox = $ifaceNil;
		sx = $ifaceNil;
		s = this;
		_r = s.Before.Count(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_tmp = _r;
		_tmp$1 = $clone(o, Move).dest();
		beforeSize = _tmp;
		odest = _tmp$1;
		/* */ if (odest >= s.Offset && odest <= (s.Offset + beforeSize >> 0)) { $s = 2; continue; }
		/* */ $s = 3; continue;
		/* if (odest >= s.Offset && odest <= (s.Offset + beforeSize >> 0)) { */ case 2:
			_r$1 = s.Before.ApplyCollection($ifaceNil, (x = new Move.ptr(o.Offset - s.Offset >> 0, o.Count, o.Distance), new x.constructor.elem(x))); /* */ $s = 4; case 4: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
			s.Before = _r$1;
			_tmp$2 = $ifaceNil;
			_tmp$3 = new s.constructor.elem(s);
			ox = _tmp$2;
			sx = _tmp$3;
			$s = -1; return [ox, sx];
		/* } */ case 3:
		_r$2 = s.Before.Slice(o.Offset - s.Offset >> 0, o.Count); /* */ $s = 5; case 5: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
		sliced = _r$2;
		_r$3 = sliced.Slice(0, 0); /* */ $s = 6; case 6: if($c) { $c = false; _r$3 = _r$3.$blk(); } if (_r$3 && _r$3.$blk !== undefined) { break s; }
		empty$1 = _r$3;
		_r$4 = s.Before.ApplyCollection($ifaceNil, (x$1 = new Splice.ptr(o.Offset - s.Offset >> 0, sliced, empty$1), new x$1.constructor.elem(x$1))); /* */ $s = 7; case 7: if($c) { $c = false; _r$4 = _r$4.$blk(); } if (_r$4 && _r$4.$blk !== undefined) { break s; }
		spliced = _r$4;
		if (odest < s.Offset) {
			ox = (x$2 = new Splice.ptr(odest, empty$1, sliced), new x$2.constructor.elem(x$2));
			sx = (x$3 = new Splice.ptr(s.Offset + o.Count >> 0, spliced, s.After), new x$3.constructor.elem(x$3));
			_tmp$4 = ox;
			_tmp$5 = sx;
			ox = _tmp$4;
			sx = _tmp$5;
			$s = -1; return [ox, sx];
		}
		_r$5 = s.After.Count(); /* */ $s = 8; case 8: if($c) { $c = false; _r$5 = _r$5.$blk(); } if (_r$5 && _r$5.$blk !== undefined) { break s; }
		ox = (x$4 = new Splice.ptr((odest + _r$5 >> 0) - beforeSize >> 0, empty$1, sliced), new x$4.constructor.elem(x$4));
		s.Before = spliced;
		_tmp$6 = ox;
		_tmp$7 = new s.constructor.elem(s);
		ox = _tmp$6;
		sx = _tmp$7;
		$s = -1; return [ox, sx];
		/* */ } return; } if ($f === undefined) { $f = { $blk: Splice.ptr.prototype.mergeContainedMove }; } $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f._r$3 = _r$3; $f._r$4 = _r$4; $f._r$5 = _r$5; $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f._tmp$2 = _tmp$2; $f._tmp$3 = _tmp$3; $f._tmp$4 = _tmp$4; $f._tmp$5 = _tmp$5; $f._tmp$6 = _tmp$6; $f._tmp$7 = _tmp$7; $f.beforeSize = beforeSize; $f.empty$1 = empty$1; $f.o = o; $f.odest = odest; $f.ox = ox; $f.s = s; $f.sliced = sliced; $f.spliced = spliced; $f.sx = sx; $f.x = x; $f.x$1 = x$1; $f.x$2 = x$2; $f.x$3 = x$3; $f.x$4 = x$4; $f.$s = $s; $f.$r = $r; return $f;
	};
	Splice.prototype.mergeContainedMove = function(o) { return this.$val.mergeContainedMove(o); };
	Splice.ptr.prototype.Merge = function(other) {
		var _r, _r$1, _r$2, _r$3, _r$4, _r$5, _r$6, _ref, _tmp, _tmp$1, _tuple, _tuple$1, _tuple$2, _tuple$3, _tuple$4, _tuple$5, _tuple$6, cx, o, o$1, o$2, o$3, other, otherx, s, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; _r$3 = $f._r$3; _r$4 = $f._r$4; _r$5 = $f._r$5; _r$6 = $f._r$6; _ref = $f._ref; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; _tuple = $f._tuple; _tuple$1 = $f._tuple$1; _tuple$2 = $f._tuple$2; _tuple$3 = $f._tuple$3; _tuple$4 = $f._tuple$4; _tuple$5 = $f._tuple$5; _tuple$6 = $f._tuple$6; cx = $f.cx; o = $f.o; o$1 = $f.o$1; o$2 = $f.o$2; o$3 = $f.o$3; other = $f.other; otherx = $f.otherx; s = $f.s; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		otherx = $ifaceNil;
		cx = $ifaceNil;
		s = this;
		if ($interfaceIsEqual(other, $ifaceNil)) {
			_tmp = $ifaceNil;
			_tmp$1 = new s.constructor.elem(s);
			otherx = _tmp;
			cx = _tmp$1;
			$s = -1; return [otherx, cx];
		}
		_ref = other;
		/* */ if ($assertType(_ref, Replace, true)[1]) { $s = 1; continue; }
		/* */ if ($assertType(_ref, Splice, true)[1]) { $s = 2; continue; }
		/* */ if ($assertType(_ref, Move, true)[1]) { $s = 3; continue; }
		/* */ if ($assertType(_ref, Custom, true)[1]) { $s = 4; continue; }
		/* */ $s = 5; continue;
		/* if ($assertType(_ref, Replace, true)[1]) { */ case 1:
			o = $clone(_ref.$val, Replace);
			_r = $clone(s, Splice).MergeReplace($clone(o, Replace)); /* */ $s = 6; case 6: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			_tuple$1 = _r;
			_r$1 = change(_tuple$1[0], _tuple$1[1]); /* */ $s = 7; case 7: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
			_tuple = _r$1;
			otherx = _tuple[0];
			cx = _tuple[1];
			$s = -1; return [otherx, cx];
		/* } else if ($assertType(_ref, Splice, true)[1]) { */ case 2:
			o$1 = $clone(_ref.$val, Splice);
			_r$2 = $clone(s, Splice).MergeSplice($clone(o$1, Splice)); /* */ $s = 8; case 8: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
			_tuple$3 = _r$2;
			_r$3 = change(_tuple$3[0], _tuple$3[1]); /* */ $s = 9; case 9: if($c) { $c = false; _r$3 = _r$3.$blk(); } if (_r$3 && _r$3.$blk !== undefined) { break s; }
			_tuple$2 = _r$3;
			otherx = _tuple$2[0];
			cx = _tuple$2[1];
			$s = -1; return [otherx, cx];
		/* } else if ($assertType(_ref, Move, true)[1]) { */ case 3:
			o$2 = $clone(_ref.$val, Move);
			_r$4 = $clone(s, Splice).MergeMove($clone(o$2, Move)); /* */ $s = 10; case 10: if($c) { $c = false; _r$4 = _r$4.$blk(); } if (_r$4 && _r$4.$blk !== undefined) { break s; }
			_tuple$4 = _r$4;
			otherx = _tuple$4[0];
			cx = _tuple$4[1];
			$s = -1; return [otherx, cx];
		/* } else if ($assertType(_ref, Custom, true)[1]) { */ case 4:
			o$3 = _ref;
			_r$5 = o$3.ReverseMerge(new s.constructor.elem(s)); /* */ $s = 11; case 11: if($c) { $c = false; _r$5 = _r$5.$blk(); } if (_r$5 && _r$5.$blk !== undefined) { break s; }
			_tuple$6 = _r$5;
			_r$6 = swap(_tuple$6[0], _tuple$6[1]); /* */ $s = 12; case 12: if($c) { $c = false; _r$6 = _r$6.$blk(); } if (_r$6 && _r$6.$blk !== undefined) { break s; }
			_tuple$5 = _r$6;
			otherx = _tuple$5[0];
			cx = _tuple$5[1];
			$s = -1; return [otherx, cx];
		/* } */ case 5:
		$panic(new $String("Unexpected change"));
		$s = -1; return [otherx, cx];
		/* */ } return; } if ($f === undefined) { $f = { $blk: Splice.ptr.prototype.Merge }; } $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f._r$3 = _r$3; $f._r$4 = _r$4; $f._r$5 = _r$5; $f._r$6 = _r$6; $f._ref = _ref; $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f._tuple = _tuple; $f._tuple$1 = _tuple$1; $f._tuple$2 = _tuple$2; $f._tuple$3 = _tuple$3; $f._tuple$4 = _tuple$4; $f._tuple$5 = _tuple$5; $f._tuple$6 = _tuple$6; $f.cx = cx; $f.o = o; $f.o$1 = o$1; $f.o$2 = o$2; $f.o$3 = o$3; $f.other = other; $f.otherx = otherx; $f.s = s; $f.$s = $s; $f.$r = $r; return $f;
	};
	Splice.prototype.Merge = function(other) { return this.$val.Merge(other); };
	Splice.ptr.prototype.MapIndex = function(idx) {
		var _r, _r$1, _r$2, idx, s, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; idx = $f.idx; s = $f.s; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		s = this;
			/* */ if (idx < s.Offset) { $s = 2; continue; }
			_r = s.Before.Count(); /* */ $s = 5; case 5: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			/* */ if (idx >= (s.Offset + _r >> 0)) { $s = 3; continue; }
			/* */ $s = 4; continue;
			/* if (idx < s.Offset) { */ case 2:
				$s = -1; return [idx, false];
			/* } else if (idx >= (s.Offset + _r >> 0)) { */ case 3:
				_r$1 = s.After.Count(); /* */ $s = 6; case 6: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
				_r$2 = s.Before.Count(); /* */ $s = 7; case 7: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
				$s = -1; return [(idx + _r$1 >> 0) - _r$2 >> 0, false];
			/* } */ case 4:
		case 1:
		$s = -1; return [s.Offset, true];
		/* */ } return; } if ($f === undefined) { $f = { $blk: Splice.ptr.prototype.MapIndex }; } $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f.idx = idx; $f.s = s; $f.$s = $s; $f.$r = $r; return $f;
	};
	Splice.prototype.MapIndex = function(idx) { return this.$val.MapIndex(idx); };
	Splice.ptr.prototype.Change = function() {
		var s, x;
		s = this;
		if (s === ptrType$1.nil) {
			return $ifaceNil;
		}
		return (x = s, new x.constructor.elem(x));
	};
	Splice.prototype.Change = function() { return this.$val.Change(); };
	Atomic.methods = [{prop: "Apply", name: "Apply", pkg: "", typ: $funcType([Context, Change], [Value], false)}];
	ChangeSet.methods = [{prop: "Merge", name: "Merge", pkg: "", typ: $funcType([Change], [Change, Change], false)}, {prop: "ReverseMerge", name: "ReverseMerge", pkg: "", typ: $funcType([Change], [Change, Change], false)}, {prop: "Revert", name: "Revert", pkg: "", typ: $funcType([], [Change], false)}, {prop: "ApplyTo", name: "ApplyTo", pkg: "", typ: $funcType([Context, Value], [Value], false)}];
	empty.methods = [{prop: "Apply", name: "Apply", pkg: "", typ: $funcType([Context, Change], [Value], false)}];
	Move.methods = [{prop: "Revert", name: "Revert", pkg: "", typ: $funcType([], [Change], false)}, {prop: "MergeReplace", name: "MergeReplace", pkg: "", typ: $funcType([Replace], [ptrType, ptrType$1], false)}, {prop: "MergeSplice", name: "MergeSplice", pkg: "", typ: $funcType([Splice], [Change, Change], false)}, {prop: "MergeMove", name: "MergeMove", pkg: "", typ: $funcType([Move], [sliceType$1, sliceType$1], false)}, {prop: "mergeMoveNoOverlap", name: "mergeMoveNoOverlap", pkg: "github.com/dotchain/dot/changes", typ: $funcType([Move], [sliceType$1, sliceType$1], false)}, {prop: "mergeMoveNoOverlapContainedDest", name: "mergeMoveNoOverlapContainedDest", pkg: "github.com/dotchain/dot/changes", typ: $funcType([Move], [sliceType$1, sliceType$1], false)}, {prop: "mergeMoveNoOverlapNoDestMixups", name: "mergeMoveNoOverlapNoDestMixups", pkg: "github.com/dotchain/dot/changes", typ: $funcType([Move], [sliceType$1, sliceType$1], false)}, {prop: "mergeMoveNoOverlapMixedDests", name: "mergeMoveNoOverlapMixedDests", pkg: "github.com/dotchain/dot/changes", typ: $funcType([Move], [sliceType$1, sliceType$1], false)}, {prop: "mergeMoveRightOverlap", name: "mergeMoveRightOverlap", pkg: "github.com/dotchain/dot/changes", typ: $funcType([Move], [sliceType$1, sliceType$1], false)}, {prop: "mergeMoveContained", name: "mergeMoveContained", pkg: "github.com/dotchain/dot/changes", typ: $funcType([Move], [sliceType$1, sliceType$1], false)}, {prop: "MapIndex", name: "MapIndex", pkg: "", typ: $funcType([$Int], [$Int], false)}, {prop: "mapPoint", name: "mapPoint", pkg: "github.com/dotchain/dot/changes", typ: $funcType([$Int], [$Int], false)}, {prop: "dest", name: "dest", pkg: "github.com/dotchain/dot/changes", typ: $funcType([], [$Int], false)}, {prop: "withDest", name: "withDest", pkg: "github.com/dotchain/dot/changes", typ: $funcType([$Int], [Move], false)}, {prop: "contains", name: "contains", pkg: "github.com/dotchain/dot/changes", typ: $funcType([$Int], [$Bool], false)}, {prop: "swap", name: "swap", pkg: "github.com/dotchain/dot/changes", typ: $funcType([sliceType$1, sliceType$1], [sliceType$1, sliceType$1], false)}, {prop: "Merge", name: "Merge", pkg: "", typ: $funcType([Change], [Change, Change], false)}, {prop: "Normalize", name: "Normalize", pkg: "", typ: $funcType([], [Move], false)}];
	ptrType$2.methods = [{prop: "Change", name: "Change", pkg: "", typ: $funcType([], [Change], false)}];
	PathChange.methods = [{prop: "Revert", name: "Revert", pkg: "", typ: $funcType([], [Change], false)}, {prop: "Merge", name: "Merge", pkg: "", typ: $funcType([Change], [Change, Change], false)}, {prop: "ReverseMerge", name: "ReverseMerge", pkg: "", typ: $funcType([Change], [Change, Change], false)}, {prop: "ApplyTo", name: "ApplyTo", pkg: "", typ: $funcType([Context, Value], [Value], false)}, {prop: "mergePathChange", name: "mergePathChange", pkg: "github.com/dotchain/dot/changes", typ: $funcType([PathChange, $Bool], [Change, Change], false)}, {prop: "prefixMerge", name: "prefixMerge", pkg: "github.com/dotchain/dot/changes", typ: $funcType([sliceType$2, Change, Change, $Bool], [Change, Change], false)}, {prop: "updateSubPathIndex", name: "updateSubPathIndex", pkg: "github.com/dotchain/dot/changes", typ: $funcType([PathChange, $Int], [Change, Change], false)}, {prop: "mergeSubPath", name: "mergeSubPath", pkg: "github.com/dotchain/dot/changes", typ: $funcType([PathChange, $Bool], [Change, Change], false)}, {prop: "commonPrefixLen", name: "commonPrefixLen", pkg: "github.com/dotchain/dot/changes", typ: $funcType([sliceType$2, sliceType$2], [$Int], false)}];
	Replace.methods = [{prop: "Revert", name: "Revert", pkg: "", typ: $funcType([], [Change], false)}, {prop: "MergeReplace", name: "MergeReplace", pkg: "", typ: $funcType([Replace], [ptrType, ptrType], false)}, {prop: "MergeSplice", name: "MergeSplice", pkg: "", typ: $funcType([Splice], [ptrType$1, ptrType], false)}, {prop: "MergeMove", name: "MergeMove", pkg: "", typ: $funcType([Move], [ptrType$2, ptrType], false)}, {prop: "Merge", name: "Merge", pkg: "", typ: $funcType([Change], [Change, Change], false)}, {prop: "IsDelete", name: "IsDelete", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "IsCreate", name: "IsCreate", pkg: "", typ: $funcType([], [$Bool], false)}];
	ptrType.methods = [{prop: "Change", name: "Change", pkg: "", typ: $funcType([], [Change], false)}];
	Splice.methods = [{prop: "Revert", name: "Revert", pkg: "", typ: $funcType([], [Change], false)}, {prop: "MergeReplace", name: "MergeReplace", pkg: "", typ: $funcType([Replace], [ptrType, ptrType$1], false)}, {prop: "MergeSplice", name: "MergeSplice", pkg: "", typ: $funcType([Splice], [ptrType$1, ptrType$1], false)}, {prop: "MergeMove", name: "MergeMove", pkg: "", typ: $funcType([Move], [Change, Change], false)}, {prop: "mergeNonOverlappingMove", name: "mergeNonOverlappingMove", pkg: "github.com/dotchain/dot/changes", typ: $funcType([Move], [Change, Change], false)}, {prop: "mergeContainedMove", name: "mergeContainedMove", pkg: "github.com/dotchain/dot/changes", typ: $funcType([Move], [Change, Change], false)}, {prop: "Merge", name: "Merge", pkg: "", typ: $funcType([Change], [Change, Change], false)}, {prop: "MapIndex", name: "MapIndex", pkg: "", typ: $funcType([$Int], [$Int, $Bool], false)}];
	ptrType$1.methods = [{prop: "Change", name: "Change", pkg: "", typ: $funcType([], [Change], false)}];
	Atomic.init("", [{prop: "Value", name: "Value", embedded: false, exported: true, typ: $emptyInterface, tag: ""}]);
	Change.init([{prop: "Merge", name: "Merge", pkg: "", typ: $funcType([Change], [Change, Change], false)}, {prop: "Revert", name: "Revert", pkg: "", typ: $funcType([], [Change], false)}]);
	Custom.init([{prop: "ApplyTo", name: "ApplyTo", pkg: "", typ: $funcType([Context, Value], [Value], false)}, {prop: "Merge", name: "Merge", pkg: "", typ: $funcType([Change], [Change, Change], false)}, {prop: "ReverseMerge", name: "ReverseMerge", pkg: "", typ: $funcType([Change], [Change, Change], false)}, {prop: "Revert", name: "Revert", pkg: "", typ: $funcType([], [Change], false)}]);
	Value.init([{prop: "Apply", name: "Apply", pkg: "", typ: $funcType([Context, Change], [Value], false)}]);
	Collection.init([{prop: "Apply", name: "Apply", pkg: "", typ: $funcType([Context, Change], [Value], false)}, {prop: "ApplyCollection", name: "ApplyCollection", pkg: "", typ: $funcType([Context, Change], [Collection], false)}, {prop: "Count", name: "Count", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Slice", name: "Slice", pkg: "", typ: $funcType([$Int, $Int], [Collection], false)}]);
	ChangeSet.init(Change);
	Context.init([{prop: "Value", name: "Value", pkg: "", typ: $funcType([$emptyInterface], [$emptyInterface], false)}]);
	empty.init("", []);
	Move.init("", [{prop: "Offset", name: "Offset", embedded: false, exported: true, typ: $Int, tag: ""}, {prop: "Count", name: "Count", embedded: false, exported: true, typ: $Int, tag: ""}, {prop: "Distance", name: "Distance", embedded: false, exported: true, typ: $Int, tag: ""}]);
	PathChange.init("", [{prop: "Path", name: "Path", embedded: false, exported: true, typ: sliceType$2, tag: ""}, {prop: "Change", name: "Change", embedded: true, exported: true, typ: Change, tag: ""}]);
	Replace.init("", [{prop: "Before", name: "Before", embedded: false, exported: true, typ: Value, tag: ""}, {prop: "After", name: "After", embedded: false, exported: true, typ: Value, tag: ""}]);
	Splice.init("", [{prop: "Offset", name: "Offset", embedded: false, exported: true, typ: $Int, tag: ""}, {prop: "Before", name: "Before", embedded: false, exported: true, typ: Collection, tag: ""}, {prop: "After", name: "After", embedded: false, exported: true, typ: Collection, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$pkg.Nil = new empty.ptr();
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["github.com/dotchain/fuss/core"] = (function() {
	var $pkg = {}, $init, cacheEntry, Cache, Notifier, Handler, arrayType, ptrType, ptrType$1, sliceType, funcType, ptrType$2, ptrType$3, mapType;
	cacheEntry = $pkg.cacheEntry = $newType(0, $kindStruct, "core.cacheEntry", true, "github.com/dotchain/fuss/core", false, function(stream_, h_, close_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.stream = $ifaceNil;
			this.h = ptrType$1.nil;
			this.close = $throwNilPointerError;
			return;
		}
		this.stream = stream_;
		this.h = h_;
		this.close = close_;
	});
	Cache = $pkg.Cache = $newType(0, $kindStruct, "core.Cache", true, "github.com/dotchain/fuss/core", true, function(old_, current_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.old = false;
			this.current = false;
			return;
		}
		this.old = old_;
		this.current = current_;
	});
	Notifier = $pkg.Notifier = $newType(0, $kindStruct, "core.Notifier", true, "github.com/dotchain/fuss/core", true, function(handlers_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.handlers = sliceType.nil;
			return;
		}
		this.handlers = handlers_;
	});
	Handler = $pkg.Handler = $newType(0, $kindStruct, "core.Handler", true, "github.com/dotchain/fuss/core", true, function(Handle_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Handle = $throwNilPointerError;
			return;
		}
		this.Handle = Handle_;
	});
	arrayType = $arrayType($emptyInterface, 2);
	ptrType = $ptrType(cacheEntry);
	ptrType$1 = $ptrType(Handler);
	sliceType = $sliceType(ptrType$1);
	funcType = $funcType([], [], false);
	ptrType$2 = $ptrType(Notifier);
	ptrType$3 = $ptrType(Cache);
	mapType = $mapType($emptyInterface, ptrType);
	Cache.ptr.prototype.Begin = function() {
		var _tmp, _tmp$1, c;
		c = this;
		_tmp = c.current;
		_tmp$1 = $makeMap($emptyInterface.keyFor, []);
		c.old = _tmp;
		c.current = _tmp$1;
	};
	Cache.prototype.Begin = function() { return this.$val.Begin(); };
	Cache.ptr.prototype.End = function() {
		var _entry, _i, _keys, _ref, c, v, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _entry = $f._entry; _i = $f._i; _keys = $f._keys; _ref = $f._ref; c = $f.c; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		c = this;
		_ref = c.old;
		_i = 0;
		_keys = $keys(_ref);
		/* while (true) { */ case 1:
			/* if (!(_i < _keys.length)) { break; } */ if(!(_i < _keys.length)) { $s = 2; continue; }
			_entry = _ref[_keys[_i]];
			if (_entry === undefined) {
				_i++;
				/* continue; */ $s = 1; continue;
			}
			v = _entry.v;
			$r = v.close(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
			_i++;
		/* } */ $s = 1; continue; case 2:
		c.old = false;
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Cache.ptr.prototype.End }; } $f._entry = _entry; $f._i = _i; $f._keys = _keys; $f._ref = _ref; $f.c = c; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
	};
	Cache.prototype.End = function() { return this.$val.End(); };
	Cache.ptr.prototype.GetSubstream = function(n, key) {
		var _entry, _tuple, c, key, n, ok, v;
		c = this;
		key = new arrayType($toNativeArray($kindInterface, [n, key]));
		_tuple = (_entry = c.old[$emptyInterface.keyFor(key)], _entry !== undefined ? [_entry.v, true] : [ptrType.nil, false]);
		v = _tuple[0];
		ok = _tuple[1];
		if (ok) {
			return [v.stream, v.h, true];
		}
		return [$ifaceNil, ptrType$1.nil, false];
	};
	Cache.prototype.GetSubstream = function(n, key) { return this.$val.GetSubstream(n, key); };
	Cache.ptr.prototype.SetSubstream = function(n, key, v, h, close) {
		var _key, c, close, h, key, n, v;
		c = this;
		key = new arrayType($toNativeArray($kindInterface, [n, key]));
		_key = key; (c.current || $throwRuntimeError("assignment to entry in nil map"))[$emptyInterface.keyFor(_key)] = { k: _key, v: new cacheEntry.ptr(v, h, close) };
		delete c.old[$emptyInterface.keyFor(key)];
	};
	Cache.prototype.SetSubstream = function(n, key, v, h, close) { return this.$val.SetSubstream(n, key, v, h, close); };
	Notifier.ptr.prototype.On = function(h) {
		var h, n;
		n = this;
		n.handlers = $append(n.handlers, h);
	};
	Notifier.prototype.On = function(h) { return this.$val.On(h); };
	Notifier.ptr.prototype.Off = function(h) {
		var _i, _ref, h, handlers, hh, kk, n;
		n = this;
		_ref = n.handlers;
		_i = 0;
		while (true) {
			if (!(_i < _ref.$length)) { break; }
			kk = _i;
			hh = ((_i < 0 || _i >= _ref.$length) ? ($throwRuntimeError("index out of range"), undefined) : _ref.$array[_ref.$offset + _i]);
			if (!(hh === h)) {
				_i++;
				continue;
			}
			handlers = $makeSlice(sliceType, (n.handlers.$length - 1 >> 0));
			$copySlice(handlers, $subslice(n.handlers, 0, kk));
			$copySlice($subslice(handlers, kk), $subslice(n.handlers, (kk + 1 >> 0)));
			n.handlers = handlers;
			_i++;
		}
	};
	Notifier.prototype.Off = function(h) { return this.$val.Off(h); };
	Notifier.ptr.prototype.Notify = function() {
		var _i, _ref, h, n, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _i = $f._i; _ref = $f._ref; h = $f.h; n = $f.n; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		n = this;
		_ref = n.handlers;
		_i = 0;
		/* while (true) { */ case 1:
			/* if (!(_i < _ref.$length)) { break; } */ if(!(_i < _ref.$length)) { $s = 2; continue; }
			h = ((_i < 0 || _i >= _ref.$length) ? ($throwRuntimeError("index out of range"), undefined) : _ref.$array[_ref.$offset + _i]);
			$r = h.Handle(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
			_i++;
		/* } */ $s = 1; continue; case 2:
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Notifier.ptr.prototype.Notify }; } $f._i = _i; $f._ref = _ref; $f.h = h; $f.n = n; $f.$s = $s; $f.$r = $r; return $f;
	};
	Notifier.prototype.Notify = function() { return this.$val.Notify(); };
	ptrType$3.methods = [{prop: "Begin", name: "Begin", pkg: "", typ: $funcType([], [], false)}, {prop: "End", name: "End", pkg: "", typ: $funcType([], [], false)}, {prop: "GetSubstream", name: "GetSubstream", pkg: "", typ: $funcType([ptrType$2, $emptyInterface], [$emptyInterface, ptrType$1, $Bool], false)}, {prop: "SetSubstream", name: "SetSubstream", pkg: "", typ: $funcType([ptrType$2, $emptyInterface, $emptyInterface, ptrType$1, funcType], [], false)}];
	ptrType$2.methods = [{prop: "On", name: "On", pkg: "", typ: $funcType([ptrType$1], [], false)}, {prop: "Off", name: "Off", pkg: "", typ: $funcType([ptrType$1], [], false)}, {prop: "Notify", name: "Notify", pkg: "", typ: $funcType([], [], false)}];
	cacheEntry.init("github.com/dotchain/fuss/core", [{prop: "stream", name: "stream", embedded: false, exported: false, typ: $emptyInterface, tag: ""}, {prop: "h", name: "h", embedded: false, exported: false, typ: ptrType$1, tag: ""}, {prop: "close", name: "close", embedded: false, exported: false, typ: funcType, tag: ""}]);
	Cache.init("github.com/dotchain/fuss/core", [{prop: "old", name: "old", embedded: false, exported: false, typ: mapType, tag: ""}, {prop: "current", name: "current", embedded: false, exported: false, typ: mapType, tag: ""}]);
	Notifier.init("github.com/dotchain/fuss/core", [{prop: "handlers", name: "handlers", embedded: false, exported: false, typ: sliceType, tag: ""}]);
	Handler.init("", [{prop: "Handle", name: "Handle", embedded: false, exported: true, typ: funcType, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["errors"] = (function() {
	var $pkg = {}, $init, errorString, ptrType, New;
	errorString = $pkg.errorString = $newType(0, $kindStruct, "errors.errorString", true, "errors", false, function(s_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.s = "";
			return;
		}
		this.s = s_;
	});
	ptrType = $ptrType(errorString);
	New = function(text) {
		var text;
		return new errorString.ptr(text);
	};
	$pkg.New = New;
	errorString.ptr.prototype.Error = function() {
		var e;
		e = this;
		return e.s;
	};
	errorString.prototype.Error = function() { return this.$val.Error(); };
	ptrType.methods = [{prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}];
	errorString.init("errors", [{prop: "s", name: "s", embedded: false, exported: false, typ: $String, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["math"] = (function() {
	var $pkg = {}, $init, js, arrayType, arrayType$1, arrayType$2, structType, math, buf, init, Float32bits, Float64bits;
	js = $packages["github.com/gopherjs/gopherjs/js"];
	arrayType = $arrayType($Uint32, 2);
	arrayType$1 = $arrayType($Float32, 2);
	arrayType$2 = $arrayType($Float64, 1);
	structType = $structType("math", [{prop: "uint32array", name: "uint32array", embedded: false, exported: false, typ: arrayType, tag: ""}, {prop: "float32array", name: "float32array", embedded: false, exported: false, typ: arrayType$1, tag: ""}, {prop: "float64array", name: "float64array", embedded: false, exported: false, typ: arrayType$2, tag: ""}]);
	init = function() {
		var ab;
		ab = new ($global.ArrayBuffer)(8);
		buf.uint32array = new ($global.Uint32Array)(ab);
		buf.float32array = new ($global.Float32Array)(ab);
		buf.float64array = new ($global.Float64Array)(ab);
	};
	Float32bits = function(f) {
		var f;
		buf.float32array[0] = f;
		return buf.uint32array[0];
	};
	$pkg.Float32bits = Float32bits;
	Float64bits = function(f) {
		var f, x, x$1;
		buf.float64array[0] = f;
		return (x = $shiftLeft64((new $Uint64(0, buf.uint32array[1])), 32), x$1 = (new $Uint64(0, buf.uint32array[0])), new $Uint64(x.$high + x$1.$high, x.$low + x$1.$low));
	};
	$pkg.Float64bits = Float64bits;
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = js.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		buf = new structType.ptr(arrayType.zero(), arrayType$1.zero(), arrayType$2.zero());
		math = $global.Math;
		init();
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["math/bits"] = (function() {
	var $pkg = {}, $init, deBruijn32tab, deBruijn64tab, len8tab, LeadingZeros64, TrailingZeros, TrailingZeros32, TrailingZeros64, Len64;
	LeadingZeros64 = function(x) {
		var x;
		return 64 - Len64(x) >> 0;
	};
	$pkg.LeadingZeros64 = LeadingZeros64;
	TrailingZeros = function(x) {
		var x;
		if (true) {
			return TrailingZeros32(((x >>> 0)));
		}
		return TrailingZeros64((new $Uint64(0, x)));
	};
	$pkg.TrailingZeros = TrailingZeros;
	TrailingZeros32 = function(x) {
		var x, x$1;
		if (x === 0) {
			return 32;
		}
		return (((x$1 = ($imul((((x & (-x >>> 0)) >>> 0)), 125613361) >>> 0) >>> 27 >>> 0, ((x$1 < 0 || x$1 >= deBruijn32tab.length) ? ($throwRuntimeError("index out of range"), undefined) : deBruijn32tab[x$1])) >> 0));
	};
	$pkg.TrailingZeros32 = TrailingZeros32;
	TrailingZeros64 = function(x) {
		var x, x$1, x$2;
		if ((x.$high === 0 && x.$low === 0)) {
			return 64;
		}
		return (((x$1 = $shiftRightUint64($mul64(((x$2 = new $Uint64(-x.$high, -x.$low), new $Uint64(x.$high & x$2.$high, (x.$low & x$2.$low) >>> 0))), new $Uint64(66559345, 3033172745)), 58), (($flatten64(x$1) < 0 || $flatten64(x$1) >= deBruijn64tab.length) ? ($throwRuntimeError("index out of range"), undefined) : deBruijn64tab[$flatten64(x$1)])) >> 0));
	};
	$pkg.TrailingZeros64 = TrailingZeros64;
	Len64 = function(x) {
		var n, x;
		n = 0;
		if ((x.$high > 1 || (x.$high === 1 && x.$low >= 0))) {
			x = $shiftRightUint64(x, (32));
			n = 32;
		}
		if ((x.$high > 0 || (x.$high === 0 && x.$low >= 65536))) {
			x = $shiftRightUint64(x, (16));
			n = n + (16) >> 0;
		}
		if ((x.$high > 0 || (x.$high === 0 && x.$low >= 256))) {
			x = $shiftRightUint64(x, (8));
			n = n + (8) >> 0;
		}
		n = n + (((($flatten64(x) < 0 || $flatten64(x) >= len8tab.length) ? ($throwRuntimeError("index out of range"), undefined) : len8tab[$flatten64(x)]) >> 0)) >> 0;
		return n;
	};
	$pkg.Len64 = Len64;
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		deBruijn32tab = $toNativeArray($kindUint8, [0, 1, 28, 2, 29, 14, 24, 3, 30, 22, 20, 15, 25, 17, 4, 8, 31, 27, 13, 23, 21, 19, 16, 7, 26, 12, 18, 6, 11, 5, 10, 9]);
		deBruijn64tab = $toNativeArray($kindUint8, [0, 1, 56, 2, 57, 49, 28, 3, 61, 58, 42, 50, 38, 29, 17, 4, 62, 47, 59, 36, 45, 43, 51, 22, 53, 39, 33, 30, 24, 18, 12, 5, 63, 55, 48, 27, 60, 41, 37, 16, 46, 35, 44, 21, 52, 32, 23, 11, 54, 26, 40, 15, 34, 20, 31, 10, 25, 14, 19, 9, 13, 8, 7, 6]);
		len8tab = $toNativeArray($kindUint8, [0, 1, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8]);
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["unicode/utf8"] = (function() {
	var $pkg = {}, $init, acceptRange, first, acceptRanges, DecodeRuneInString, RuneLen, EncodeRune;
	acceptRange = $pkg.acceptRange = $newType(0, $kindStruct, "utf8.acceptRange", true, "unicode/utf8", false, function(lo_, hi_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.lo = 0;
			this.hi = 0;
			return;
		}
		this.lo = lo_;
		this.hi = hi_;
	});
	DecodeRuneInString = function(s) {
		var _tmp, _tmp$1, _tmp$10, _tmp$11, _tmp$12, _tmp$13, _tmp$14, _tmp$15, _tmp$16, _tmp$17, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tmp$8, _tmp$9, accept, mask, n, r, s, s0, s1, s2, s3, size, sz, x, x$1;
		r = 0;
		size = 0;
		n = s.length;
		if (n < 1) {
			_tmp = 65533;
			_tmp$1 = 0;
			r = _tmp;
			size = _tmp$1;
			return [r, size];
		}
		s0 = s.charCodeAt(0);
		x = ((s0 < 0 || s0 >= first.length) ? ($throwRuntimeError("index out of range"), undefined) : first[s0]);
		if (x >= 240) {
			mask = (((x >> 0)) << 31 >> 0) >> 31 >> 0;
			_tmp$2 = ((((s.charCodeAt(0) >> 0)) & ~mask) >> 0) | (65533 & mask);
			_tmp$3 = 1;
			r = _tmp$2;
			size = _tmp$3;
			return [r, size];
		}
		sz = (x & 7) >>> 0;
		accept = $clone((x$1 = x >>> 4 << 24 >>> 24, ((x$1 < 0 || x$1 >= acceptRanges.length) ? ($throwRuntimeError("index out of range"), undefined) : acceptRanges[x$1])), acceptRange);
		if (n < ((sz >> 0))) {
			_tmp$4 = 65533;
			_tmp$5 = 1;
			r = _tmp$4;
			size = _tmp$5;
			return [r, size];
		}
		s1 = s.charCodeAt(1);
		if (s1 < accept.lo || accept.hi < s1) {
			_tmp$6 = 65533;
			_tmp$7 = 1;
			r = _tmp$6;
			size = _tmp$7;
			return [r, size];
		}
		if (sz === 2) {
			_tmp$8 = (((((s0 & 31) >>> 0) >> 0)) << 6 >> 0) | ((((s1 & 63) >>> 0) >> 0));
			_tmp$9 = 2;
			r = _tmp$8;
			size = _tmp$9;
			return [r, size];
		}
		s2 = s.charCodeAt(2);
		if (s2 < 128 || 191 < s2) {
			_tmp$10 = 65533;
			_tmp$11 = 1;
			r = _tmp$10;
			size = _tmp$11;
			return [r, size];
		}
		if (sz === 3) {
			_tmp$12 = ((((((s0 & 15) >>> 0) >> 0)) << 12 >> 0) | (((((s1 & 63) >>> 0) >> 0)) << 6 >> 0)) | ((((s2 & 63) >>> 0) >> 0));
			_tmp$13 = 3;
			r = _tmp$12;
			size = _tmp$13;
			return [r, size];
		}
		s3 = s.charCodeAt(3);
		if (s3 < 128 || 191 < s3) {
			_tmp$14 = 65533;
			_tmp$15 = 1;
			r = _tmp$14;
			size = _tmp$15;
			return [r, size];
		}
		_tmp$16 = (((((((s0 & 7) >>> 0) >> 0)) << 18 >> 0) | (((((s1 & 63) >>> 0) >> 0)) << 12 >> 0)) | (((((s2 & 63) >>> 0) >> 0)) << 6 >> 0)) | ((((s3 & 63) >>> 0) >> 0));
		_tmp$17 = 4;
		r = _tmp$16;
		size = _tmp$17;
		return [r, size];
	};
	$pkg.DecodeRuneInString = DecodeRuneInString;
	RuneLen = function(r) {
		var r;
		if (r < 0) {
			return -1;
		} else if (r <= 127) {
			return 1;
		} else if (r <= 2047) {
			return 2;
		} else if (55296 <= r && r <= 57343) {
			return -1;
		} else if (r <= 65535) {
			return 3;
		} else if (r <= 1114111) {
			return 4;
		}
		return -1;
	};
	$pkg.RuneLen = RuneLen;
	EncodeRune = function(p, r) {
		var i, p, r;
		i = ((r >>> 0));
		if (i <= 127) {
			(0 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 0] = ((r << 24 >>> 24)));
			return 1;
		} else if (i <= 2047) {
			$unused((1 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 1]));
			(0 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 0] = ((192 | (((r >> 6 >> 0) << 24 >>> 24))) >>> 0));
			(1 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 1] = ((128 | ((((r << 24 >>> 24)) & 63) >>> 0)) >>> 0));
			return 2;
		} else if ((i > 1114111) || (55296 <= i && i <= 57343)) {
			r = 65533;
			$unused((2 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 2]));
			(0 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 0] = ((224 | (((r >> 12 >> 0) << 24 >>> 24))) >>> 0));
			(1 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 1] = ((128 | (((((r >> 6 >> 0) << 24 >>> 24)) & 63) >>> 0)) >>> 0));
			(2 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 2] = ((128 | ((((r << 24 >>> 24)) & 63) >>> 0)) >>> 0));
			return 3;
		} else if (i <= 65535) {
			$unused((2 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 2]));
			(0 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 0] = ((224 | (((r >> 12 >> 0) << 24 >>> 24))) >>> 0));
			(1 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 1] = ((128 | (((((r >> 6 >> 0) << 24 >>> 24)) & 63) >>> 0)) >>> 0));
			(2 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 2] = ((128 | ((((r << 24 >>> 24)) & 63) >>> 0)) >>> 0));
			return 3;
		} else {
			$unused((3 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 3]));
			(0 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 0] = ((240 | (((r >> 18 >> 0) << 24 >>> 24))) >>> 0));
			(1 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 1] = ((128 | (((((r >> 12 >> 0) << 24 >>> 24)) & 63) >>> 0)) >>> 0));
			(2 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 2] = ((128 | (((((r >> 6 >> 0) << 24 >>> 24)) & 63) >>> 0)) >>> 0));
			(3 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 3] = ((128 | ((((r << 24 >>> 24)) & 63) >>> 0)) >>> 0));
			return 4;
		}
	};
	$pkg.EncodeRune = EncodeRune;
	acceptRange.init("unicode/utf8", [{prop: "lo", name: "lo", embedded: false, exported: false, typ: $Uint8, tag: ""}, {prop: "hi", name: "hi", embedded: false, exported: false, typ: $Uint8, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		first = $toNativeArray($kindUint8, [240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 19, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 35, 3, 3, 52, 4, 4, 4, 68, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241]);
		acceptRanges = $toNativeArray($kindStruct, [new acceptRange.ptr(128, 191), new acceptRange.ptr(160, 191), new acceptRange.ptr(128, 159), new acceptRange.ptr(144, 191), new acceptRange.ptr(128, 143)]);
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["strconv"] = (function() {
	var $pkg = {}, $init, errors, math, bits, utf8, decimal, leftCheat, extFloat, floatInfo, decimalSlice, sliceType$3, arrayType, sliceType$6, arrayType$1, arrayType$2, ptrType$1, arrayType$3, ptrType$2, ptrType$3, ptrType$4, optimize, leftcheats, smallPowersOfTen, powersOfTen, uint64pow10, float32info, float32info$24ptr, float64info, float64info$24ptr, digitZero, trim, rightShift, prefixIsLessThan, leftShift, shouldRoundUp, frexp10Many, adjustLastDigitFixed, adjustLastDigit, FormatFloat, genericFtoa, bigFtoa, formatDigits, roundShortest, fmtE, fmtF, fmtB, min, max, FormatInt, small, formatBits, isPowerOfTwo;
	errors = $packages["errors"];
	math = $packages["math"];
	bits = $packages["math/bits"];
	utf8 = $packages["unicode/utf8"];
	decimal = $pkg.decimal = $newType(0, $kindStruct, "strconv.decimal", true, "strconv", false, function(d_, nd_, dp_, neg_, trunc_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.d = arrayType.zero();
			this.nd = 0;
			this.dp = 0;
			this.neg = false;
			this.trunc = false;
			return;
		}
		this.d = d_;
		this.nd = nd_;
		this.dp = dp_;
		this.neg = neg_;
		this.trunc = trunc_;
	});
	leftCheat = $pkg.leftCheat = $newType(0, $kindStruct, "strconv.leftCheat", true, "strconv", false, function(delta_, cutoff_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.delta = 0;
			this.cutoff = "";
			return;
		}
		this.delta = delta_;
		this.cutoff = cutoff_;
	});
	extFloat = $pkg.extFloat = $newType(0, $kindStruct, "strconv.extFloat", true, "strconv", false, function(mant_, exp_, neg_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.mant = new $Uint64(0, 0);
			this.exp = 0;
			this.neg = false;
			return;
		}
		this.mant = mant_;
		this.exp = exp_;
		this.neg = neg_;
	});
	floatInfo = $pkg.floatInfo = $newType(0, $kindStruct, "strconv.floatInfo", true, "strconv", false, function(mantbits_, expbits_, bias_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.mantbits = 0;
			this.expbits = 0;
			this.bias = 0;
			return;
		}
		this.mantbits = mantbits_;
		this.expbits = expbits_;
		this.bias = bias_;
	});
	decimalSlice = $pkg.decimalSlice = $newType(0, $kindStruct, "strconv.decimalSlice", true, "strconv", false, function(d_, nd_, dp_, neg_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.d = sliceType$6.nil;
			this.nd = 0;
			this.dp = 0;
			this.neg = false;
			return;
		}
		this.d = d_;
		this.nd = nd_;
		this.dp = dp_;
		this.neg = neg_;
	});
	sliceType$3 = $sliceType(leftCheat);
	arrayType = $arrayType($Uint8, 800);
	sliceType$6 = $sliceType($Uint8);
	arrayType$1 = $arrayType($Uint8, 24);
	arrayType$2 = $arrayType($Uint8, 32);
	ptrType$1 = $ptrType(floatInfo);
	arrayType$3 = $arrayType($Uint8, 65);
	ptrType$2 = $ptrType(decimal);
	ptrType$3 = $ptrType(decimalSlice);
	ptrType$4 = $ptrType(extFloat);
	decimal.ptr.prototype.String = function() {
		var a, buf, n, w;
		a = this;
		n = 10 + a.nd >> 0;
		if (a.dp > 0) {
			n = n + (a.dp) >> 0;
		}
		if (a.dp < 0) {
			n = n + (-a.dp) >> 0;
		}
		buf = $makeSlice(sliceType$6, n);
		w = 0;
		if ((a.nd === 0)) {
			return "0";
		} else if (a.dp <= 0) {
			((w < 0 || w >= buf.$length) ? ($throwRuntimeError("index out of range"), undefined) : buf.$array[buf.$offset + w] = 48);
			w = w + (1) >> 0;
			((w < 0 || w >= buf.$length) ? ($throwRuntimeError("index out of range"), undefined) : buf.$array[buf.$offset + w] = 46);
			w = w + (1) >> 0;
			w = w + (digitZero($subslice(buf, w, (w + -a.dp >> 0)))) >> 0;
			w = w + ($copySlice($subslice(buf, w), $subslice(new sliceType$6(a.d), 0, a.nd))) >> 0;
		} else if (a.dp < a.nd) {
			w = w + ($copySlice($subslice(buf, w), $subslice(new sliceType$6(a.d), 0, a.dp))) >> 0;
			((w < 0 || w >= buf.$length) ? ($throwRuntimeError("index out of range"), undefined) : buf.$array[buf.$offset + w] = 46);
			w = w + (1) >> 0;
			w = w + ($copySlice($subslice(buf, w), $subslice(new sliceType$6(a.d), a.dp, a.nd))) >> 0;
		} else {
			w = w + ($copySlice($subslice(buf, w), $subslice(new sliceType$6(a.d), 0, a.nd))) >> 0;
			w = w + (digitZero($subslice(buf, w, ((w + a.dp >> 0) - a.nd >> 0)))) >> 0;
		}
		return ($bytesToString($subslice(buf, 0, w)));
	};
	decimal.prototype.String = function() { return this.$val.String(); };
	digitZero = function(dst) {
		var _i, _ref, dst, i;
		_ref = dst;
		_i = 0;
		while (true) {
			if (!(_i < _ref.$length)) { break; }
			i = _i;
			((i < 0 || i >= dst.$length) ? ($throwRuntimeError("index out of range"), undefined) : dst.$array[dst.$offset + i] = 48);
			_i++;
		}
		return dst.$length;
	};
	trim = function(a) {
		var a, x, x$1;
		while (true) {
			if (!(a.nd > 0 && ((x = a.d, x$1 = a.nd - 1 >> 0, ((x$1 < 0 || x$1 >= x.length) ? ($throwRuntimeError("index out of range"), undefined) : x[x$1])) === 48))) { break; }
			a.nd = a.nd - (1) >> 0;
		}
		if (a.nd === 0) {
			a.dp = 0;
		}
	};
	decimal.ptr.prototype.Assign = function(v) {
		var a, buf, n, v, v1, x, x$1, x$2;
		a = this;
		buf = arrayType$1.zero();
		n = 0;
		while (true) {
			if (!((v.$high > 0 || (v.$high === 0 && v.$low > 0)))) { break; }
			v1 = $div64(v, new $Uint64(0, 10), false);
			v = (x = $mul64(new $Uint64(0, 10), v1), new $Uint64(v.$high - x.$high, v.$low - x.$low));
			((n < 0 || n >= buf.length) ? ($throwRuntimeError("index out of range"), undefined) : buf[n] = ((new $Uint64(v.$high + 0, v.$low + 48).$low << 24 >>> 24)));
			n = n + (1) >> 0;
			v = v1;
		}
		a.nd = 0;
		n = n - (1) >> 0;
		while (true) {
			if (!(n >= 0)) { break; }
			(x$1 = a.d, x$2 = a.nd, ((x$2 < 0 || x$2 >= x$1.length) ? ($throwRuntimeError("index out of range"), undefined) : x$1[x$2] = ((n < 0 || n >= buf.length) ? ($throwRuntimeError("index out of range"), undefined) : buf[n])));
			a.nd = a.nd + (1) >> 0;
			n = n - (1) >> 0;
		}
		a.dp = a.nd;
		trim(a);
	};
	decimal.prototype.Assign = function(v) { return this.$val.Assign(v); };
	rightShift = function(a, k) {
		var a, c, c$1, dig, dig$1, k, mask, n, r, w, x, x$1, x$2, x$3, y, y$1, y$2, y$3, y$4;
		r = 0;
		w = 0;
		n = 0;
		while (true) {
			if (!(((y = k, y < 32 ? (n >>> y) : 0) >>> 0) === 0)) { break; }
			if (r >= a.nd) {
				if (n === 0) {
					a.nd = 0;
					return;
				}
				while (true) {
					if (!(((y$1 = k, y$1 < 32 ? (n >>> y$1) : 0) >>> 0) === 0)) { break; }
					n = n * 10 >>> 0;
					r = r + (1) >> 0;
				}
				break;
			}
			c = (((x = a.d, ((r < 0 || r >= x.length) ? ($throwRuntimeError("index out of range"), undefined) : x[r])) >>> 0));
			n = ((n * 10 >>> 0) + c >>> 0) - 48 >>> 0;
			r = r + (1) >> 0;
		}
		a.dp = a.dp - ((r - 1 >> 0)) >> 0;
		mask = (((y$2 = k, y$2 < 32 ? (1 << y$2) : 0) >>> 0)) - 1 >>> 0;
		while (true) {
			if (!(r < a.nd)) { break; }
			c$1 = (((x$1 = a.d, ((r < 0 || r >= x$1.length) ? ($throwRuntimeError("index out of range"), undefined) : x$1[r])) >>> 0));
			dig = (y$3 = k, y$3 < 32 ? (n >>> y$3) : 0) >>> 0;
			n = (n & (mask)) >>> 0;
			(x$2 = a.d, ((w < 0 || w >= x$2.length) ? ($throwRuntimeError("index out of range"), undefined) : x$2[w] = (((dig + 48 >>> 0) << 24 >>> 24))));
			w = w + (1) >> 0;
			n = ((n * 10 >>> 0) + c$1 >>> 0) - 48 >>> 0;
			r = r + (1) >> 0;
		}
		while (true) {
			if (!(n > 0)) { break; }
			dig$1 = (y$4 = k, y$4 < 32 ? (n >>> y$4) : 0) >>> 0;
			n = (n & (mask)) >>> 0;
			if (w < 800) {
				(x$3 = a.d, ((w < 0 || w >= x$3.length) ? ($throwRuntimeError("index out of range"), undefined) : x$3[w] = (((dig$1 + 48 >>> 0) << 24 >>> 24))));
				w = w + (1) >> 0;
			} else if (dig$1 > 0) {
				a.trunc = true;
			}
			n = n * 10 >>> 0;
		}
		a.nd = w;
		trim(a);
	};
	prefixIsLessThan = function(b, s) {
		var b, i, s;
		i = 0;
		while (true) {
			if (!(i < s.length)) { break; }
			if (i >= b.$length) {
				return true;
			}
			if (!((((i < 0 || i >= b.$length) ? ($throwRuntimeError("index out of range"), undefined) : b.$array[b.$offset + i]) === s.charCodeAt(i)))) {
				return ((i < 0 || i >= b.$length) ? ($throwRuntimeError("index out of range"), undefined) : b.$array[b.$offset + i]) < s.charCodeAt(i);
			}
			i = i + (1) >> 0;
		}
		return false;
	};
	leftShift = function(a, k) {
		var _q, _q$1, a, delta, k, n, quo, quo$1, r, rem, rem$1, w, x, x$1, x$2, y;
		delta = ((k < 0 || k >= leftcheats.$length) ? ($throwRuntimeError("index out of range"), undefined) : leftcheats.$array[leftcheats.$offset + k]).delta;
		if (prefixIsLessThan($subslice(new sliceType$6(a.d), 0, a.nd), ((k < 0 || k >= leftcheats.$length) ? ($throwRuntimeError("index out of range"), undefined) : leftcheats.$array[leftcheats.$offset + k]).cutoff)) {
			delta = delta - (1) >> 0;
		}
		r = a.nd;
		w = a.nd + delta >> 0;
		n = 0;
		r = r - (1) >> 0;
		while (true) {
			if (!(r >= 0)) { break; }
			n = n + (((y = k, y < 32 ? ((((((x = a.d, ((r < 0 || r >= x.length) ? ($throwRuntimeError("index out of range"), undefined) : x[r])) >>> 0)) - 48 >>> 0)) << y) : 0) >>> 0)) >>> 0;
			quo = (_q = n / 10, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >>> 0 : $throwRuntimeError("integer divide by zero"));
			rem = n - (10 * quo >>> 0) >>> 0;
			w = w - (1) >> 0;
			if (w < 800) {
				(x$1 = a.d, ((w < 0 || w >= x$1.length) ? ($throwRuntimeError("index out of range"), undefined) : x$1[w] = (((rem + 48 >>> 0) << 24 >>> 24))));
			} else if (!((rem === 0))) {
				a.trunc = true;
			}
			n = quo;
			r = r - (1) >> 0;
		}
		while (true) {
			if (!(n > 0)) { break; }
			quo$1 = (_q$1 = n / 10, (_q$1 === _q$1 && _q$1 !== 1/0 && _q$1 !== -1/0) ? _q$1 >>> 0 : $throwRuntimeError("integer divide by zero"));
			rem$1 = n - (10 * quo$1 >>> 0) >>> 0;
			w = w - (1) >> 0;
			if (w < 800) {
				(x$2 = a.d, ((w < 0 || w >= x$2.length) ? ($throwRuntimeError("index out of range"), undefined) : x$2[w] = (((rem$1 + 48 >>> 0) << 24 >>> 24))));
			} else if (!((rem$1 === 0))) {
				a.trunc = true;
			}
			n = quo$1;
		}
		a.nd = a.nd + (delta) >> 0;
		if (a.nd >= 800) {
			a.nd = 800;
		}
		a.dp = a.dp + (delta) >> 0;
		trim(a);
	};
	decimal.ptr.prototype.Shift = function(k) {
		var a, k;
		a = this;
		if ((a.nd === 0)) {
		} else if (k > 0) {
			while (true) {
				if (!(k > 28)) { break; }
				leftShift(a, 28);
				k = k - (28) >> 0;
			}
			leftShift(a, ((k >>> 0)));
		} else if (k < 0) {
			while (true) {
				if (!(k < -28)) { break; }
				rightShift(a, 28);
				k = k + (28) >> 0;
			}
			rightShift(a, ((-k >>> 0)));
		}
	};
	decimal.prototype.Shift = function(k) { return this.$val.Shift(k); };
	shouldRoundUp = function(a, nd) {
		var _r, a, nd, x, x$1, x$2, x$3;
		if (nd < 0 || nd >= a.nd) {
			return false;
		}
		if (((x = a.d, ((nd < 0 || nd >= x.length) ? ($throwRuntimeError("index out of range"), undefined) : x[nd])) === 53) && ((nd + 1 >> 0) === a.nd)) {
			if (a.trunc) {
				return true;
			}
			return nd > 0 && !(((_r = (((x$1 = a.d, x$2 = nd - 1 >> 0, ((x$2 < 0 || x$2 >= x$1.length) ? ($throwRuntimeError("index out of range"), undefined) : x$1[x$2])) - 48 << 24 >>> 24)) % 2, _r === _r ? _r : $throwRuntimeError("integer divide by zero")) === 0));
		}
		return (x$3 = a.d, ((nd < 0 || nd >= x$3.length) ? ($throwRuntimeError("index out of range"), undefined) : x$3[nd])) >= 53;
	};
	decimal.ptr.prototype.Round = function(nd) {
		var a, nd;
		a = this;
		if (nd < 0 || nd >= a.nd) {
			return;
		}
		if (shouldRoundUp(a, nd)) {
			a.RoundUp(nd);
		} else {
			a.RoundDown(nd);
		}
	};
	decimal.prototype.Round = function(nd) { return this.$val.Round(nd); };
	decimal.ptr.prototype.RoundDown = function(nd) {
		var a, nd;
		a = this;
		if (nd < 0 || nd >= a.nd) {
			return;
		}
		a.nd = nd;
		trim(a);
	};
	decimal.prototype.RoundDown = function(nd) { return this.$val.RoundDown(nd); };
	decimal.ptr.prototype.RoundUp = function(nd) {
		var a, c, i, nd, x, x$1, x$2;
		a = this;
		if (nd < 0 || nd >= a.nd) {
			return;
		}
		i = nd - 1 >> 0;
		while (true) {
			if (!(i >= 0)) { break; }
			c = (x = a.d, ((i < 0 || i >= x.length) ? ($throwRuntimeError("index out of range"), undefined) : x[i]));
			if (c < 57) {
				(x$2 = a.d, ((i < 0 || i >= x$2.length) ? ($throwRuntimeError("index out of range"), undefined) : x$2[i] = ((x$1 = a.d, ((i < 0 || i >= x$1.length) ? ($throwRuntimeError("index out of range"), undefined) : x$1[i])) + (1) << 24 >>> 24)));
				a.nd = i + 1 >> 0;
				return;
			}
			i = i - (1) >> 0;
		}
		a.d[0] = 49;
		a.nd = 1;
		a.dp = a.dp + (1) >> 0;
	};
	decimal.prototype.RoundUp = function(nd) { return this.$val.RoundUp(nd); };
	decimal.ptr.prototype.RoundedInteger = function() {
		var a, i, n, x, x$1, x$2, x$3;
		a = this;
		if (a.dp > 20) {
			return new $Uint64(4294967295, 4294967295);
		}
		i = 0;
		n = new $Uint64(0, 0);
		i = 0;
		while (true) {
			if (!(i < a.dp && i < a.nd)) { break; }
			n = (x = $mul64(n, new $Uint64(0, 10)), x$1 = (new $Uint64(0, ((x$2 = a.d, ((i < 0 || i >= x$2.length) ? ($throwRuntimeError("index out of range"), undefined) : x$2[i])) - 48 << 24 >>> 24))), new $Uint64(x.$high + x$1.$high, x.$low + x$1.$low));
			i = i + (1) >> 0;
		}
		while (true) {
			if (!(i < a.dp)) { break; }
			n = $mul64(n, (new $Uint64(0, 10)));
			i = i + (1) >> 0;
		}
		if (shouldRoundUp(a, a.dp)) {
			n = (x$3 = new $Uint64(0, 1), new $Uint64(n.$high + x$3.$high, n.$low + x$3.$low));
		}
		return n;
	};
	decimal.prototype.RoundedInteger = function() { return this.$val.RoundedInteger(); };
	extFloat.ptr.prototype.AssignComputeBounds = function(mant, exp, neg, flt) {
		var _tmp, _tmp$1, exp, expBiased, f, flt, lower, mant, neg, upper, x, x$1, x$2, x$3, x$4;
		lower = new extFloat.ptr(new $Uint64(0, 0), 0, false);
		upper = new extFloat.ptr(new $Uint64(0, 0), 0, false);
		f = this;
		f.mant = mant;
		f.exp = exp - ((flt.mantbits >> 0)) >> 0;
		f.neg = neg;
		if (f.exp <= 0 && (x = $shiftLeft64(($shiftRightUint64(mant, ((-f.exp >>> 0)))), ((-f.exp >>> 0))), (mant.$high === x.$high && mant.$low === x.$low))) {
			f.mant = $shiftRightUint64(f.mant, (((-f.exp >>> 0))));
			f.exp = 0;
			_tmp = $clone(f, extFloat);
			_tmp$1 = $clone(f, extFloat);
			extFloat.copy(lower, _tmp);
			extFloat.copy(upper, _tmp$1);
			return [lower, upper];
		}
		expBiased = exp - flt.bias >> 0;
		extFloat.copy(upper, new extFloat.ptr((x$1 = $mul64(new $Uint64(0, 2), f.mant), new $Uint64(x$1.$high + 0, x$1.$low + 1)), f.exp - 1 >> 0, f.neg));
		if (!((x$2 = $shiftLeft64(new $Uint64(0, 1), flt.mantbits), (mant.$high === x$2.$high && mant.$low === x$2.$low))) || (expBiased === 1)) {
			extFloat.copy(lower, new extFloat.ptr((x$3 = $mul64(new $Uint64(0, 2), f.mant), new $Uint64(x$3.$high - 0, x$3.$low - 1)), f.exp - 1 >> 0, f.neg));
		} else {
			extFloat.copy(lower, new extFloat.ptr((x$4 = $mul64(new $Uint64(0, 4), f.mant), new $Uint64(x$4.$high - 0, x$4.$low - 1)), f.exp - 2 >> 0, f.neg));
		}
		return [lower, upper];
	};
	extFloat.prototype.AssignComputeBounds = function(mant, exp, neg, flt) { return this.$val.AssignComputeBounds(mant, exp, neg, flt); };
	extFloat.ptr.prototype.Normalize = function() {
		var f, shift, x;
		f = this;
		if ((x = f.mant, (x.$high === 0 && x.$low === 0))) {
			return 0;
		}
		shift = bits.LeadingZeros64(f.mant);
		f.mant = $shiftLeft64(f.mant, (((shift >>> 0))));
		f.exp = f.exp - (shift) >> 0;
		return ((shift >>> 0));
	};
	extFloat.prototype.Normalize = function() { return this.$val.Normalize(); };
	extFloat.ptr.prototype.Multiply = function(g) {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, cross1, cross2, f, fhi, flo, g, ghi, glo, rem, x, x$1, x$10, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9;
		f = this;
		_tmp = $shiftRightUint64(f.mant, 32);
		_tmp$1 = (new $Uint64(0, ((f.mant.$low >>> 0))));
		fhi = _tmp;
		flo = _tmp$1;
		_tmp$2 = $shiftRightUint64(g.mant, 32);
		_tmp$3 = (new $Uint64(0, ((g.mant.$low >>> 0))));
		ghi = _tmp$2;
		glo = _tmp$3;
		cross1 = $mul64(fhi, glo);
		cross2 = $mul64(flo, ghi);
		f.mant = (x = (x$1 = $mul64(fhi, ghi), x$2 = $shiftRightUint64(cross1, 32), new $Uint64(x$1.$high + x$2.$high, x$1.$low + x$2.$low)), x$3 = $shiftRightUint64(cross2, 32), new $Uint64(x.$high + x$3.$high, x.$low + x$3.$low));
		rem = (x$4 = (x$5 = (new $Uint64(0, ((cross1.$low >>> 0)))), x$6 = (new $Uint64(0, ((cross2.$low >>> 0)))), new $Uint64(x$5.$high + x$6.$high, x$5.$low + x$6.$low)), x$7 = $shiftRightUint64(($mul64(flo, glo)), 32), new $Uint64(x$4.$high + x$7.$high, x$4.$low + x$7.$low));
		rem = (x$8 = new $Uint64(0, 2147483648), new $Uint64(rem.$high + x$8.$high, rem.$low + x$8.$low));
		f.mant = (x$9 = f.mant, x$10 = ($shiftRightUint64(rem, 32)), new $Uint64(x$9.$high + x$10.$high, x$9.$low + x$10.$low));
		f.exp = (f.exp + g.exp >> 0) + 64 >> 0;
	};
	extFloat.prototype.Multiply = function(g) { return this.$val.Multiply(g); };
	extFloat.ptr.prototype.AssignDecimal = function(mantissa, exp10, neg, trunc, flt) {
		var _q, _r, adjExp, denormalExp, errors$1, exp10, extrabits, f, flt, halfway, i, mant_extra, mantissa, neg, ok, shift, trunc, x, x$1, x$10, x$11, x$12, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9, y;
		ok = false;
		f = this;
		errors$1 = 0;
		if (trunc) {
			errors$1 = errors$1 + (4) >> 0;
		}
		f.mant = mantissa;
		f.exp = 0;
		f.neg = neg;
		i = (_q = ((exp10 - -348 >> 0)) / 8, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
		if (exp10 < -348 || i >= 87) {
			ok = false;
			return ok;
		}
		adjExp = (_r = ((exp10 - -348 >> 0)) % 8, _r === _r ? _r : $throwRuntimeError("integer divide by zero"));
		if (adjExp < 19 && (x = (x$1 = 19 - adjExp >> 0, ((x$1 < 0 || x$1 >= uint64pow10.length) ? ($throwRuntimeError("index out of range"), undefined) : uint64pow10[x$1])), (mantissa.$high < x.$high || (mantissa.$high === x.$high && mantissa.$low < x.$low)))) {
			f.mant = $mul64(f.mant, (((adjExp < 0 || adjExp >= uint64pow10.length) ? ($throwRuntimeError("index out of range"), undefined) : uint64pow10[adjExp])));
			f.Normalize();
		} else {
			f.Normalize();
			f.Multiply($clone(((adjExp < 0 || adjExp >= smallPowersOfTen.length) ? ($throwRuntimeError("index out of range"), undefined) : smallPowersOfTen[adjExp]), extFloat));
			errors$1 = errors$1 + (4) >> 0;
		}
		f.Multiply($clone(((i < 0 || i >= powersOfTen.length) ? ($throwRuntimeError("index out of range"), undefined) : powersOfTen[i]), extFloat));
		if (errors$1 > 0) {
			errors$1 = errors$1 + (1) >> 0;
		}
		errors$1 = errors$1 + (4) >> 0;
		shift = f.Normalize();
		errors$1 = (y = (shift), y < 32 ? (errors$1 << y) : 0) >> 0;
		denormalExp = flt.bias - 63 >> 0;
		extrabits = 0;
		if (f.exp <= denormalExp) {
			extrabits = ((63 - flt.mantbits >>> 0) + 1 >>> 0) + (((denormalExp - f.exp >> 0) >>> 0)) >>> 0;
		} else {
			extrabits = 63 - flt.mantbits >>> 0;
		}
		halfway = $shiftLeft64(new $Uint64(0, 1), ((extrabits - 1 >>> 0)));
		mant_extra = (x$2 = f.mant, x$3 = (x$4 = $shiftLeft64(new $Uint64(0, 1), extrabits), new $Uint64(x$4.$high - 0, x$4.$low - 1)), new $Uint64(x$2.$high & x$3.$high, (x$2.$low & x$3.$low) >>> 0));
		if ((x$5 = (x$6 = (new $Int64(halfway.$high, halfway.$low)), x$7 = (new $Int64(0, errors$1)), new $Int64(x$6.$high - x$7.$high, x$6.$low - x$7.$low)), x$8 = (new $Int64(mant_extra.$high, mant_extra.$low)), (x$5.$high < x$8.$high || (x$5.$high === x$8.$high && x$5.$low < x$8.$low))) && (x$9 = (new $Int64(mant_extra.$high, mant_extra.$low)), x$10 = (x$11 = (new $Int64(halfway.$high, halfway.$low)), x$12 = (new $Int64(0, errors$1)), new $Int64(x$11.$high + x$12.$high, x$11.$low + x$12.$low)), (x$9.$high < x$10.$high || (x$9.$high === x$10.$high && x$9.$low < x$10.$low)))) {
			ok = false;
			return ok;
		}
		ok = true;
		return ok;
	};
	extFloat.prototype.AssignDecimal = function(mantissa, exp10, neg, trunc, flt) { return this.$val.AssignDecimal(mantissa, exp10, neg, trunc, flt); };
	extFloat.ptr.prototype.frexp10 = function() {
		var _q, _q$1, _tmp, _tmp$1, approxExp10, exp, exp10, f, i, index;
		exp10 = 0;
		index = 0;
		f = this;
		approxExp10 = (_q = ($imul(((-46 - f.exp >> 0)), 28)) / 93, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
		i = (_q$1 = ((approxExp10 - -348 >> 0)) / 8, (_q$1 === _q$1 && _q$1 !== 1/0 && _q$1 !== -1/0) ? _q$1 >> 0 : $throwRuntimeError("integer divide by zero"));
		Loop:
		while (true) {
			exp = (f.exp + ((i < 0 || i >= powersOfTen.length) ? ($throwRuntimeError("index out of range"), undefined) : powersOfTen[i]).exp >> 0) + 64 >> 0;
			if (exp < -60) {
				i = i + (1) >> 0;
			} else if (exp > -32) {
				i = i - (1) >> 0;
			} else {
				break Loop;
			}
		}
		f.Multiply($clone(((i < 0 || i >= powersOfTen.length) ? ($throwRuntimeError("index out of range"), undefined) : powersOfTen[i]), extFloat));
		_tmp = -((-348 + ($imul(i, 8)) >> 0));
		_tmp$1 = i;
		exp10 = _tmp;
		index = _tmp$1;
		return [exp10, index];
	};
	extFloat.prototype.frexp10 = function() { return this.$val.frexp10(); };
	frexp10Many = function(a, b, c) {
		var _tuple, a, b, c, exp10, i;
		exp10 = 0;
		_tuple = c.frexp10();
		exp10 = _tuple[0];
		i = _tuple[1];
		a.Multiply($clone(((i < 0 || i >= powersOfTen.length) ? ($throwRuntimeError("index out of range"), undefined) : powersOfTen[i]), extFloat));
		b.Multiply($clone(((i < 0 || i >= powersOfTen.length) ? ($throwRuntimeError("index out of range"), undefined) : powersOfTen[i]), extFloat));
		return exp10;
	};
	extFloat.ptr.prototype.FixedDecimal = function(d, n) {
		var $CE$B5, _q, _q$1, _tmp, _tmp$1, _tuple, buf, d, digit, exp10, f, fraction, i, i$1, i$2, integer, integerDigits, n, nd, needed, ok, pos, pow, pow10, rest, shift, v, v1, x, x$1, x$10, x$11, x$12, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9;
		f = this;
		if ((x = f.mant, (x.$high === 0 && x.$low === 0))) {
			d.nd = 0;
			d.dp = 0;
			d.neg = f.neg;
			return true;
		}
		if (n === 0) {
			$panic(new $String("strconv: internal error: extFloat.FixedDecimal called with n == 0"));
		}
		f.Normalize();
		_tuple = f.frexp10();
		exp10 = _tuple[0];
		shift = ((-f.exp >>> 0));
		integer = (($shiftRightUint64(f.mant, shift).$low >>> 0));
		fraction = (x$1 = f.mant, x$2 = $shiftLeft64((new $Uint64(0, integer)), shift), new $Uint64(x$1.$high - x$2.$high, x$1.$low - x$2.$low));
		$CE$B5 = new $Uint64(0, 1);
		needed = n;
		integerDigits = 0;
		pow10 = new $Uint64(0, 1);
		_tmp = 0;
		_tmp$1 = new $Uint64(0, 1);
		i = _tmp;
		pow = _tmp$1;
		while (true) {
			if (!(i < 20)) { break; }
			if ((x$3 = (new $Uint64(0, integer)), (pow.$high > x$3.$high || (pow.$high === x$3.$high && pow.$low > x$3.$low)))) {
				integerDigits = i;
				break;
			}
			pow = $mul64(pow, (new $Uint64(0, 10)));
			i = i + (1) >> 0;
		}
		rest = integer;
		if (integerDigits > needed) {
			pow10 = (x$4 = integerDigits - needed >> 0, ((x$4 < 0 || x$4 >= uint64pow10.length) ? ($throwRuntimeError("index out of range"), undefined) : uint64pow10[x$4]));
			integer = (_q = integer / (((pow10.$low >>> 0))), (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >>> 0 : $throwRuntimeError("integer divide by zero"));
			rest = rest - (($imul(integer, ((pow10.$low >>> 0))) >>> 0)) >>> 0;
		} else {
			rest = 0;
		}
		buf = arrayType$2.zero();
		pos = 32;
		v = integer;
		while (true) {
			if (!(v > 0)) { break; }
			v1 = (_q$1 = v / 10, (_q$1 === _q$1 && _q$1 !== 1/0 && _q$1 !== -1/0) ? _q$1 >>> 0 : $throwRuntimeError("integer divide by zero"));
			v = v - (($imul(10, v1) >>> 0)) >>> 0;
			pos = pos - (1) >> 0;
			((pos < 0 || pos >= buf.length) ? ($throwRuntimeError("index out of range"), undefined) : buf[pos] = (((v + 48 >>> 0) << 24 >>> 24)));
			v = v1;
		}
		i$1 = pos;
		while (true) {
			if (!(i$1 < 32)) { break; }
			(x$5 = d.d, x$6 = i$1 - pos >> 0, ((x$6 < 0 || x$6 >= x$5.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$5.$array[x$5.$offset + x$6] = ((i$1 < 0 || i$1 >= buf.length) ? ($throwRuntimeError("index out of range"), undefined) : buf[i$1])));
			i$1 = i$1 + (1) >> 0;
		}
		nd = 32 - pos >> 0;
		d.nd = nd;
		d.dp = integerDigits + exp10 >> 0;
		needed = needed - (nd) >> 0;
		if (needed > 0) {
			if (!((rest === 0)) || !((pow10.$high === 0 && pow10.$low === 1))) {
				$panic(new $String("strconv: internal error, rest != 0 but needed > 0"));
			}
			while (true) {
				if (!(needed > 0)) { break; }
				fraction = $mul64(fraction, (new $Uint64(0, 10)));
				$CE$B5 = $mul64($CE$B5, (new $Uint64(0, 10)));
				if ((x$7 = $mul64(new $Uint64(0, 2), $CE$B5), x$8 = $shiftLeft64(new $Uint64(0, 1), shift), (x$7.$high > x$8.$high || (x$7.$high === x$8.$high && x$7.$low > x$8.$low)))) {
					return false;
				}
				digit = $shiftRightUint64(fraction, shift);
				(x$9 = d.d, ((nd < 0 || nd >= x$9.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$9.$array[x$9.$offset + nd] = ((new $Uint64(digit.$high + 0, digit.$low + 48).$low << 24 >>> 24))));
				fraction = (x$10 = $shiftLeft64(digit, shift), new $Uint64(fraction.$high - x$10.$high, fraction.$low - x$10.$low));
				nd = nd + (1) >> 0;
				needed = needed - (1) >> 0;
			}
			d.nd = nd;
		}
		ok = adjustLastDigitFixed(d, (x$11 = $shiftLeft64((new $Uint64(0, rest)), shift), new $Uint64(x$11.$high | fraction.$high, (x$11.$low | fraction.$low) >>> 0)), pow10, shift, $CE$B5);
		if (!ok) {
			return false;
		}
		i$2 = d.nd - 1 >> 0;
		while (true) {
			if (!(i$2 >= 0)) { break; }
			if (!(((x$12 = d.d, ((i$2 < 0 || i$2 >= x$12.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$12.$array[x$12.$offset + i$2])) === 48))) {
				d.nd = i$2 + 1 >> 0;
				break;
			}
			i$2 = i$2 - (1) >> 0;
		}
		return true;
	};
	extFloat.prototype.FixedDecimal = function(d, n) { return this.$val.FixedDecimal(d, n); };
	adjustLastDigitFixed = function(d, num, den, shift, $CE$B5) {
		var $CE$B5, d, den, i, num, shift, x, x$1, x$10, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9;
		if ((x = $shiftLeft64(den, shift), (num.$high > x.$high || (num.$high === x.$high && num.$low > x.$low)))) {
			$panic(new $String("strconv: num > den<<shift in adjustLastDigitFixed"));
		}
		if ((x$1 = $mul64(new $Uint64(0, 2), $CE$B5), x$2 = $shiftLeft64(den, shift), (x$1.$high > x$2.$high || (x$1.$high === x$2.$high && x$1.$low > x$2.$low)))) {
			$panic(new $String("strconv: \xCE\xB5 > (den<<shift)/2"));
		}
		if ((x$3 = $mul64(new $Uint64(0, 2), (new $Uint64(num.$high + $CE$B5.$high, num.$low + $CE$B5.$low))), x$4 = $shiftLeft64(den, shift), (x$3.$high < x$4.$high || (x$3.$high === x$4.$high && x$3.$low < x$4.$low)))) {
			return true;
		}
		if ((x$5 = $mul64(new $Uint64(0, 2), (new $Uint64(num.$high - $CE$B5.$high, num.$low - $CE$B5.$low))), x$6 = $shiftLeft64(den, shift), (x$5.$high > x$6.$high || (x$5.$high === x$6.$high && x$5.$low > x$6.$low)))) {
			i = d.nd - 1 >> 0;
			while (true) {
				if (!(i >= 0)) { break; }
				if ((x$7 = d.d, ((i < 0 || i >= x$7.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$7.$array[x$7.$offset + i])) === 57) {
					d.nd = d.nd - (1) >> 0;
				} else {
					break;
				}
				i = i - (1) >> 0;
			}
			if (i < 0) {
				(x$8 = d.d, (0 >= x$8.$length ? ($throwRuntimeError("index out of range"), undefined) : x$8.$array[x$8.$offset + 0] = 49));
				d.nd = 1;
				d.dp = d.dp + (1) >> 0;
			} else {
				(x$10 = d.d, ((i < 0 || i >= x$10.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$10.$array[x$10.$offset + i] = ((x$9 = d.d, ((i < 0 || i >= x$9.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$9.$array[x$9.$offset + i])) + (1) << 24 >>> 24)));
			}
			return true;
		}
		return false;
	};
	extFloat.ptr.prototype.ShortestDecimal = function(d, lower, upper) {
		var _q, _tmp, _tmp$1, _tmp$2, _tmp$3, allowance, buf, currentDiff, d, digit, digit$1, exp10, f, fraction, i, i$1, i$2, integer, integerDigits, lower, multiplier, n, nd, pow, pow$1, shift, targetDiff, upper, v, v1, x, x$1, x$10, x$11, x$12, x$13, x$14, x$15, x$16, x$17, x$18, x$19, x$2, x$20, x$21, x$22, x$23, x$3, x$4, x$5, x$6, x$7, x$8, x$9;
		f = this;
		if ((x = f.mant, (x.$high === 0 && x.$low === 0))) {
			d.nd = 0;
			d.dp = 0;
			d.neg = f.neg;
			return true;
		}
		if ((f.exp === 0) && $equal(lower, f, extFloat) && $equal(lower, upper, extFloat)) {
			buf = arrayType$1.zero();
			n = 23;
			v = f.mant;
			while (true) {
				if (!((v.$high > 0 || (v.$high === 0 && v.$low > 0)))) { break; }
				v1 = $div64(v, new $Uint64(0, 10), false);
				v = (x$1 = $mul64(new $Uint64(0, 10), v1), new $Uint64(v.$high - x$1.$high, v.$low - x$1.$low));
				((n < 0 || n >= buf.length) ? ($throwRuntimeError("index out of range"), undefined) : buf[n] = ((new $Uint64(v.$high + 0, v.$low + 48).$low << 24 >>> 24)));
				n = n - (1) >> 0;
				v = v1;
			}
			nd = (24 - n >> 0) - 1 >> 0;
			i = 0;
			while (true) {
				if (!(i < nd)) { break; }
				(x$3 = d.d, ((i < 0 || i >= x$3.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$3.$array[x$3.$offset + i] = (x$2 = (n + 1 >> 0) + i >> 0, ((x$2 < 0 || x$2 >= buf.length) ? ($throwRuntimeError("index out of range"), undefined) : buf[x$2]))));
				i = i + (1) >> 0;
			}
			_tmp = nd;
			_tmp$1 = nd;
			d.nd = _tmp;
			d.dp = _tmp$1;
			while (true) {
				if (!(d.nd > 0 && ((x$4 = d.d, x$5 = d.nd - 1 >> 0, ((x$5 < 0 || x$5 >= x$4.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$4.$array[x$4.$offset + x$5])) === 48))) { break; }
				d.nd = d.nd - (1) >> 0;
			}
			if (d.nd === 0) {
				d.dp = 0;
			}
			d.neg = f.neg;
			return true;
		}
		upper.Normalize();
		if (f.exp > upper.exp) {
			f.mant = $shiftLeft64(f.mant, ((((f.exp - upper.exp >> 0) >>> 0))));
			f.exp = upper.exp;
		}
		if (lower.exp > upper.exp) {
			lower.mant = $shiftLeft64(lower.mant, ((((lower.exp - upper.exp >> 0) >>> 0))));
			lower.exp = upper.exp;
		}
		exp10 = frexp10Many(lower, f, upper);
		upper.mant = (x$6 = upper.mant, x$7 = new $Uint64(0, 1), new $Uint64(x$6.$high + x$7.$high, x$6.$low + x$7.$low));
		lower.mant = (x$8 = lower.mant, x$9 = new $Uint64(0, 1), new $Uint64(x$8.$high - x$9.$high, x$8.$low - x$9.$low));
		shift = ((-upper.exp >>> 0));
		integer = (($shiftRightUint64(upper.mant, shift).$low >>> 0));
		fraction = (x$10 = upper.mant, x$11 = $shiftLeft64((new $Uint64(0, integer)), shift), new $Uint64(x$10.$high - x$11.$high, x$10.$low - x$11.$low));
		allowance = (x$12 = upper.mant, x$13 = lower.mant, new $Uint64(x$12.$high - x$13.$high, x$12.$low - x$13.$low));
		targetDiff = (x$14 = upper.mant, x$15 = f.mant, new $Uint64(x$14.$high - x$15.$high, x$14.$low - x$15.$low));
		integerDigits = 0;
		_tmp$2 = 0;
		_tmp$3 = new $Uint64(0, 1);
		i$1 = _tmp$2;
		pow = _tmp$3;
		while (true) {
			if (!(i$1 < 20)) { break; }
			if ((x$16 = (new $Uint64(0, integer)), (pow.$high > x$16.$high || (pow.$high === x$16.$high && pow.$low > x$16.$low)))) {
				integerDigits = i$1;
				break;
			}
			pow = $mul64(pow, (new $Uint64(0, 10)));
			i$1 = i$1 + (1) >> 0;
		}
		i$2 = 0;
		while (true) {
			if (!(i$2 < integerDigits)) { break; }
			pow$1 = (x$17 = (integerDigits - i$2 >> 0) - 1 >> 0, ((x$17 < 0 || x$17 >= uint64pow10.length) ? ($throwRuntimeError("index out of range"), undefined) : uint64pow10[x$17]));
			digit = (_q = integer / ((pow$1.$low >>> 0)), (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >>> 0 : $throwRuntimeError("integer divide by zero"));
			(x$18 = d.d, ((i$2 < 0 || i$2 >= x$18.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$18.$array[x$18.$offset + i$2] = (((digit + 48 >>> 0) << 24 >>> 24))));
			integer = integer - (($imul(digit, ((pow$1.$low >>> 0))) >>> 0)) >>> 0;
			currentDiff = (x$19 = $shiftLeft64((new $Uint64(0, integer)), shift), new $Uint64(x$19.$high + fraction.$high, x$19.$low + fraction.$low));
			if ((currentDiff.$high < allowance.$high || (currentDiff.$high === allowance.$high && currentDiff.$low < allowance.$low))) {
				d.nd = i$2 + 1 >> 0;
				d.dp = integerDigits + exp10 >> 0;
				d.neg = f.neg;
				return adjustLastDigit(d, currentDiff, targetDiff, allowance, $shiftLeft64(pow$1, shift), new $Uint64(0, 2));
			}
			i$2 = i$2 + (1) >> 0;
		}
		d.nd = integerDigits;
		d.dp = d.nd + exp10 >> 0;
		d.neg = f.neg;
		digit$1 = 0;
		multiplier = new $Uint64(0, 1);
		while (true) {
			fraction = $mul64(fraction, (new $Uint64(0, 10)));
			multiplier = $mul64(multiplier, (new $Uint64(0, 10)));
			digit$1 = (($shiftRightUint64(fraction, shift).$low >> 0));
			(x$20 = d.d, x$21 = d.nd, ((x$21 < 0 || x$21 >= x$20.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$20.$array[x$20.$offset + x$21] = (((digit$1 + 48 >> 0) << 24 >>> 24))));
			d.nd = d.nd + (1) >> 0;
			fraction = (x$22 = $shiftLeft64((new $Uint64(0, digit$1)), shift), new $Uint64(fraction.$high - x$22.$high, fraction.$low - x$22.$low));
			if ((x$23 = $mul64(allowance, multiplier), (fraction.$high < x$23.$high || (fraction.$high === x$23.$high && fraction.$low < x$23.$low)))) {
				return adjustLastDigit(d, fraction, $mul64(targetDiff, multiplier), $mul64(allowance, multiplier), $shiftLeft64(new $Uint64(0, 1), shift), $mul64(multiplier, new $Uint64(0, 2)));
			}
		}
	};
	extFloat.prototype.ShortestDecimal = function(d, lower, upper) { return this.$val.ShortestDecimal(d, lower, upper); };
	adjustLastDigit = function(d, currentDiff, targetDiff, maxDiff, ulpDecimal, ulpBinary) {
		var _index, currentDiff, d, maxDiff, targetDiff, ulpBinary, ulpDecimal, x, x$1, x$10, x$11, x$12, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9;
		if ((x = $mul64(new $Uint64(0, 2), ulpBinary), (ulpDecimal.$high < x.$high || (ulpDecimal.$high === x.$high && ulpDecimal.$low < x.$low)))) {
			return false;
		}
		while (true) {
			if (!((x$1 = (x$2 = (x$3 = $div64(ulpDecimal, new $Uint64(0, 2), false), new $Uint64(currentDiff.$high + x$3.$high, currentDiff.$low + x$3.$low)), new $Uint64(x$2.$high + ulpBinary.$high, x$2.$low + ulpBinary.$low)), (x$1.$high < targetDiff.$high || (x$1.$high === targetDiff.$high && x$1.$low < targetDiff.$low))))) { break; }
			_index = d.nd - 1 >> 0;
			(x$5 = d.d, ((_index < 0 || _index >= x$5.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$5.$array[x$5.$offset + _index] = ((x$4 = d.d, ((_index < 0 || _index >= x$4.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$4.$array[x$4.$offset + _index])) - (1) << 24 >>> 24)));
			currentDiff = (x$6 = ulpDecimal, new $Uint64(currentDiff.$high + x$6.$high, currentDiff.$low + x$6.$low));
		}
		if ((x$7 = new $Uint64(currentDiff.$high + ulpDecimal.$high, currentDiff.$low + ulpDecimal.$low), x$8 = (x$9 = (x$10 = $div64(ulpDecimal, new $Uint64(0, 2), false), new $Uint64(targetDiff.$high + x$10.$high, targetDiff.$low + x$10.$low)), new $Uint64(x$9.$high + ulpBinary.$high, x$9.$low + ulpBinary.$low)), (x$7.$high < x$8.$high || (x$7.$high === x$8.$high && x$7.$low <= x$8.$low)))) {
			return false;
		}
		if ((currentDiff.$high < ulpBinary.$high || (currentDiff.$high === ulpBinary.$high && currentDiff.$low < ulpBinary.$low)) || (x$11 = new $Uint64(maxDiff.$high - ulpBinary.$high, maxDiff.$low - ulpBinary.$low), (currentDiff.$high > x$11.$high || (currentDiff.$high === x$11.$high && currentDiff.$low > x$11.$low)))) {
			return false;
		}
		if ((d.nd === 1) && ((x$12 = d.d, (0 >= x$12.$length ? ($throwRuntimeError("index out of range"), undefined) : x$12.$array[x$12.$offset + 0])) === 48)) {
			d.nd = 0;
			d.dp = 0;
		}
		return true;
	};
	FormatFloat = function(f, fmt, prec, bitSize) {
		var bitSize, f, fmt, prec;
		return ($bytesToString(genericFtoa($makeSlice(sliceType$6, 0, max(prec + 4 >> 0, 24)), f, fmt, prec, bitSize)));
	};
	$pkg.FormatFloat = FormatFloat;
	genericFtoa = function(dst, val, fmt, prec, bitSize) {
		var _1, _2, _3, _4, _tuple, bitSize, bits$1, buf, buf$1, digits, digs, dst, exp, f, f$1, flt, fmt, lower, mant, neg, ok, prec, s, shortest, upper, val, x, x$1, x$2, x$3, y, y$1;
		bits$1 = new $Uint64(0, 0);
		flt = ptrType$1.nil;
		_1 = bitSize;
		if (_1 === (32)) {
			bits$1 = (new $Uint64(0, math.Float32bits(($fround(val)))));
			flt = float32info;
		} else if (_1 === (64)) {
			bits$1 = math.Float64bits(val);
			flt = float64info;
		} else {
			$panic(new $String("strconv: illegal AppendFloat/FormatFloat bitSize"));
		}
		neg = !((x = $shiftRightUint64(bits$1, ((flt.expbits + flt.mantbits >>> 0))), (x.$high === 0 && x.$low === 0)));
		exp = (($shiftRightUint64(bits$1, flt.mantbits).$low >> 0)) & ((((y = flt.expbits, y < 32 ? (1 << y) : 0) >> 0) - 1 >> 0));
		mant = (x$1 = (x$2 = $shiftLeft64(new $Uint64(0, 1), flt.mantbits), new $Uint64(x$2.$high - 0, x$2.$low - 1)), new $Uint64(bits$1.$high & x$1.$high, (bits$1.$low & x$1.$low) >>> 0));
		_2 = exp;
		if (_2 === ((((y$1 = flt.expbits, y$1 < 32 ? (1 << y$1) : 0) >> 0) - 1 >> 0))) {
			s = "";
			if (!((mant.$high === 0 && mant.$low === 0))) {
				s = "NaN";
			} else if (neg) {
				s = "-Inf";
			} else {
				s = "+Inf";
			}
			return $appendSlice(dst, s);
		} else if (_2 === (0)) {
			exp = exp + (1) >> 0;
		} else {
			mant = (x$3 = $shiftLeft64(new $Uint64(0, 1), flt.mantbits), new $Uint64(mant.$high | x$3.$high, (mant.$low | x$3.$low) >>> 0));
		}
		exp = exp + (flt.bias) >> 0;
		if (fmt === 98) {
			return fmtB(dst, neg, mant, exp, flt);
		}
		if (!optimize) {
			return bigFtoa(dst, prec, fmt, neg, mant, exp, flt);
		}
		digs = new decimalSlice.ptr(sliceType$6.nil, 0, 0, false);
		ok = false;
		shortest = prec < 0;
		if (shortest) {
			f = new extFloat.ptr(new $Uint64(0, 0), 0, false);
			_tuple = f.AssignComputeBounds(mant, exp, neg, flt);
			lower = $clone(_tuple[0], extFloat);
			upper = $clone(_tuple[1], extFloat);
			buf = arrayType$2.zero();
			digs.d = new sliceType$6(buf);
			ok = f.ShortestDecimal(digs, lower, upper);
			if (!ok) {
				return bigFtoa(dst, prec, fmt, neg, mant, exp, flt);
			}
			_3 = fmt;
			if ((_3 === (101)) || (_3 === (69))) {
				prec = max(digs.nd - 1 >> 0, 0);
			} else if (_3 === (102)) {
				prec = max(digs.nd - digs.dp >> 0, 0);
			} else if ((_3 === (103)) || (_3 === (71))) {
				prec = digs.nd;
			}
		} else if (!((fmt === 102))) {
			digits = prec;
			_4 = fmt;
			if ((_4 === (101)) || (_4 === (69))) {
				digits = digits + (1) >> 0;
			} else if ((_4 === (103)) || (_4 === (71))) {
				if (prec === 0) {
					prec = 1;
				}
				digits = prec;
			}
			if (digits <= 15) {
				buf$1 = arrayType$1.zero();
				digs.d = new sliceType$6(buf$1);
				f$1 = new extFloat.ptr(mant, exp - ((flt.mantbits >> 0)) >> 0, neg);
				ok = f$1.FixedDecimal(digs, digits);
			}
		}
		if (!ok) {
			return bigFtoa(dst, prec, fmt, neg, mant, exp, flt);
		}
		return formatDigits(dst, shortest, neg, $clone(digs, decimalSlice), prec, fmt);
	};
	bigFtoa = function(dst, prec, fmt, neg, mant, exp, flt) {
		var _1, _2, d, digs, dst, exp, flt, fmt, mant, neg, prec, shortest;
		d = new decimal.ptr(arrayType.zero(), 0, 0, false, false);
		d.Assign(mant);
		d.Shift(exp - ((flt.mantbits >> 0)) >> 0);
		digs = new decimalSlice.ptr(sliceType$6.nil, 0, 0, false);
		shortest = prec < 0;
		if (shortest) {
			roundShortest(d, mant, exp, flt);
			decimalSlice.copy(digs, new decimalSlice.ptr(new sliceType$6(d.d), d.nd, d.dp, false));
			_1 = fmt;
			if ((_1 === (101)) || (_1 === (69))) {
				prec = digs.nd - 1 >> 0;
			} else if (_1 === (102)) {
				prec = max(digs.nd - digs.dp >> 0, 0);
			} else if ((_1 === (103)) || (_1 === (71))) {
				prec = digs.nd;
			}
		} else {
			_2 = fmt;
			if ((_2 === (101)) || (_2 === (69))) {
				d.Round(prec + 1 >> 0);
			} else if (_2 === (102)) {
				d.Round(d.dp + prec >> 0);
			} else if ((_2 === (103)) || (_2 === (71))) {
				if (prec === 0) {
					prec = 1;
				}
				d.Round(prec);
			}
			decimalSlice.copy(digs, new decimalSlice.ptr(new sliceType$6(d.d), d.nd, d.dp, false));
		}
		return formatDigits(dst, shortest, neg, $clone(digs, decimalSlice), prec, fmt);
	};
	formatDigits = function(dst, shortest, neg, digs, prec, fmt) {
		var _1, digs, dst, eprec, exp, fmt, neg, prec, shortest;
		_1 = fmt;
		if ((_1 === (101)) || (_1 === (69))) {
			return fmtE(dst, neg, $clone(digs, decimalSlice), prec, fmt);
		} else if (_1 === (102)) {
			return fmtF(dst, neg, $clone(digs, decimalSlice), prec);
		} else if ((_1 === (103)) || (_1 === (71))) {
			eprec = prec;
			if (eprec > digs.nd && digs.nd >= digs.dp) {
				eprec = digs.nd;
			}
			if (shortest) {
				eprec = 6;
			}
			exp = digs.dp - 1 >> 0;
			if (exp < -4 || exp >= eprec) {
				if (prec > digs.nd) {
					prec = digs.nd;
				}
				return fmtE(dst, neg, $clone(digs, decimalSlice), prec - 1 >> 0, (fmt + 101 << 24 >>> 24) - 103 << 24 >>> 24);
			}
			if (prec > digs.dp) {
				prec = digs.nd;
			}
			return fmtF(dst, neg, $clone(digs, decimalSlice), max(prec - digs.dp >> 0, 0));
		}
		return $append(dst, 37, fmt);
	};
	roundShortest = function(d, mant, exp, flt) {
		var d, exp, explo, flt, i, inclusive, l, lower, m, mant, mantlo, minexp, okdown, okup, u, upper, x, x$1, x$2, x$3, x$4, x$5, x$6, x$7;
		if ((mant.$high === 0 && mant.$low === 0)) {
			d.nd = 0;
			return;
		}
		minexp = flt.bias + 1 >> 0;
		if (exp > minexp && ($imul(332, ((d.dp - d.nd >> 0)))) >= ($imul(100, ((exp - ((flt.mantbits >> 0)) >> 0))))) {
			return;
		}
		upper = new decimal.ptr(arrayType.zero(), 0, 0, false, false);
		upper.Assign((x = $mul64(mant, new $Uint64(0, 2)), new $Uint64(x.$high + 0, x.$low + 1)));
		upper.Shift((exp - ((flt.mantbits >> 0)) >> 0) - 1 >> 0);
		mantlo = new $Uint64(0, 0);
		explo = 0;
		if ((x$1 = $shiftLeft64(new $Uint64(0, 1), flt.mantbits), (mant.$high > x$1.$high || (mant.$high === x$1.$high && mant.$low > x$1.$low))) || (exp === minexp)) {
			mantlo = new $Uint64(mant.$high - 0, mant.$low - 1);
			explo = exp;
		} else {
			mantlo = (x$2 = $mul64(mant, new $Uint64(0, 2)), new $Uint64(x$2.$high - 0, x$2.$low - 1));
			explo = exp - 1 >> 0;
		}
		lower = new decimal.ptr(arrayType.zero(), 0, 0, false, false);
		lower.Assign((x$3 = $mul64(mantlo, new $Uint64(0, 2)), new $Uint64(x$3.$high + 0, x$3.$low + 1)));
		lower.Shift((explo - ((flt.mantbits >> 0)) >> 0) - 1 >> 0);
		inclusive = (x$4 = $div64(mant, new $Uint64(0, 2), true), (x$4.$high === 0 && x$4.$low === 0));
		i = 0;
		while (true) {
			if (!(i < d.nd)) { break; }
			l = 48;
			if (i < lower.nd) {
				l = (x$5 = lower.d, ((i < 0 || i >= x$5.length) ? ($throwRuntimeError("index out of range"), undefined) : x$5[i]));
			}
			m = (x$6 = d.d, ((i < 0 || i >= x$6.length) ? ($throwRuntimeError("index out of range"), undefined) : x$6[i]));
			u = 48;
			if (i < upper.nd) {
				u = (x$7 = upper.d, ((i < 0 || i >= x$7.length) ? ($throwRuntimeError("index out of range"), undefined) : x$7[i]));
			}
			okdown = !((l === m)) || inclusive && ((i + 1 >> 0) === lower.nd);
			okup = !((m === u)) && (inclusive || (m + 1 << 24 >>> 24) < u || (i + 1 >> 0) < upper.nd);
			if (okdown && okup) {
				d.Round(i + 1 >> 0);
				return;
			} else if (okdown) {
				d.RoundDown(i + 1 >> 0);
				return;
			} else if (okup) {
				d.RoundUp(i + 1 >> 0);
				return;
			}
			i = i + (1) >> 0;
		}
	};
	fmtE = function(dst, neg, d, prec, fmt) {
		var _q, _q$1, _q$2, _r, _r$1, _r$2, ch, d, dst, exp, fmt, i, m, neg, prec, x;
		if (neg) {
			dst = $append(dst, 45);
		}
		ch = 48;
		if (!((d.nd === 0))) {
			ch = (x = d.d, (0 >= x.$length ? ($throwRuntimeError("index out of range"), undefined) : x.$array[x.$offset + 0]));
		}
		dst = $append(dst, ch);
		if (prec > 0) {
			dst = $append(dst, 46);
			i = 1;
			m = min(d.nd, prec + 1 >> 0);
			if (i < m) {
				dst = $appendSlice(dst, $subslice(d.d, i, m));
				i = m;
			}
			while (true) {
				if (!(i <= prec)) { break; }
				dst = $append(dst, 48);
				i = i + (1) >> 0;
			}
		}
		dst = $append(dst, fmt);
		exp = d.dp - 1 >> 0;
		if (d.nd === 0) {
			exp = 0;
		}
		if (exp < 0) {
			ch = 45;
			exp = -exp;
		} else {
			ch = 43;
		}
		dst = $append(dst, ch);
		if (exp < 10) {
			dst = $append(dst, 48, ((exp << 24 >>> 24)) + 48 << 24 >>> 24);
		} else if (exp < 100) {
			dst = $append(dst, (((_q = exp / 10, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")) << 24 >>> 24)) + 48 << 24 >>> 24, (((_r = exp % 10, _r === _r ? _r : $throwRuntimeError("integer divide by zero")) << 24 >>> 24)) + 48 << 24 >>> 24);
		} else {
			dst = $append(dst, (((_q$1 = exp / 100, (_q$1 === _q$1 && _q$1 !== 1/0 && _q$1 !== -1/0) ? _q$1 >> 0 : $throwRuntimeError("integer divide by zero")) << 24 >>> 24)) + 48 << 24 >>> 24, (_r$1 = (((_q$2 = exp / 10, (_q$2 === _q$2 && _q$2 !== 1/0 && _q$2 !== -1/0) ? _q$2 >> 0 : $throwRuntimeError("integer divide by zero")) << 24 >>> 24)) % 10, _r$1 === _r$1 ? _r$1 : $throwRuntimeError("integer divide by zero")) + 48 << 24 >>> 24, (((_r$2 = exp % 10, _r$2 === _r$2 ? _r$2 : $throwRuntimeError("integer divide by zero")) << 24 >>> 24)) + 48 << 24 >>> 24);
		}
		return dst;
	};
	fmtF = function(dst, neg, d, prec) {
		var ch, d, dst, i, j, m, neg, prec, x;
		if (neg) {
			dst = $append(dst, 45);
		}
		if (d.dp > 0) {
			m = min(d.nd, d.dp);
			dst = $appendSlice(dst, $subslice(d.d, 0, m));
			while (true) {
				if (!(m < d.dp)) { break; }
				dst = $append(dst, 48);
				m = m + (1) >> 0;
			}
		} else {
			dst = $append(dst, 48);
		}
		if (prec > 0) {
			dst = $append(dst, 46);
			i = 0;
			while (true) {
				if (!(i < prec)) { break; }
				ch = 48;
				j = d.dp + i >> 0;
				if (0 <= j && j < d.nd) {
					ch = (x = d.d, ((j < 0 || j >= x.$length) ? ($throwRuntimeError("index out of range"), undefined) : x.$array[x.$offset + j]));
				}
				dst = $append(dst, ch);
				i = i + (1) >> 0;
			}
		}
		return dst;
	};
	fmtB = function(dst, neg, mant, exp, flt) {
		var _tuple, _tuple$1, dst, exp, flt, mant, neg;
		if (neg) {
			dst = $append(dst, 45);
		}
		_tuple = formatBits(dst, mant, 10, false, true);
		dst = _tuple[0];
		dst = $append(dst, 112);
		exp = exp - (((flt.mantbits >> 0))) >> 0;
		if (exp >= 0) {
			dst = $append(dst, 43);
		}
		_tuple$1 = formatBits(dst, (new $Uint64(0, exp)), 10, exp < 0, true);
		dst = _tuple$1[0];
		return dst;
	};
	min = function(a, b) {
		var a, b;
		if (a < b) {
			return a;
		}
		return b;
	};
	max = function(a, b) {
		var a, b;
		if (a > b) {
			return a;
		}
		return b;
	};
	FormatInt = function(i, base) {
		var _tuple, base, i, s;
		if (true && (0 < i.$high || (0 === i.$high && 0 <= i.$low)) && (i.$high < 0 || (i.$high === 0 && i.$low < 100)) && (base === 10)) {
			return small((((i.$low + ((i.$high >> 31) * 4294967296)) >> 0)));
		}
		_tuple = formatBits(sliceType$6.nil, (new $Uint64(i.$high, i.$low)), base, (i.$high < 0 || (i.$high === 0 && i.$low < 0)), false);
		s = _tuple[1];
		return s;
	};
	$pkg.FormatInt = FormatInt;
	small = function(i) {
		var i;
		if (i < 10) {
			return $substring("0123456789abcdefghijklmnopqrstuvwxyz", i, (i + 1 >> 0));
		}
		return $substring("00010203040506070809101112131415161718192021222324252627282930313233343536373839404142434445464748495051525354555657585960616263646566676869707172737475767778798081828384858687888990919293949596979899", ($imul(i, 2)), (($imul(i, 2)) + 2 >> 0));
	};
	formatBits = function(dst, u, base, neg, append_) {
		var _q, _q$1, _r, _r$1, a, append_, b, b$1, base, d, dst, i, is, is$1, is$2, j, m, neg, q, q$1, s, shift, u, us, us$1, x, x$1, x$2, x$3, x$4, x$5;
		d = sliceType$6.nil;
		s = "";
		if (base < 2 || base > 36) {
			$panic(new $String("strconv: illegal AppendInt/FormatInt base"));
		}
		a = arrayType$3.zero();
		i = 65;
		if (neg) {
			u = new $Uint64(-u.$high, -u.$low);
		}
		if (base === 10) {
			if (true) {
				while (true) {
					if (!((u.$high > 0 || (u.$high === 0 && u.$low >= 1000000000)))) { break; }
					q = $div64(u, new $Uint64(0, 1000000000), false);
					us = (((x = $mul64(q, new $Uint64(0, 1000000000)), new $Uint64(u.$high - x.$high, u.$low - x.$low)).$low >>> 0));
					j = 4;
					while (true) {
						if (!(j > 0)) { break; }
						is = (_r = us % 100, _r === _r ? _r : $throwRuntimeError("integer divide by zero")) * 2 >>> 0;
						us = (_q = us / (100), (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >>> 0 : $throwRuntimeError("integer divide by zero"));
						i = i - (2) >> 0;
						(x$1 = i + 1 >> 0, ((x$1 < 0 || x$1 >= a.length) ? ($throwRuntimeError("index out of range"), undefined) : a[x$1] = "00010203040506070809101112131415161718192021222324252627282930313233343536373839404142434445464748495051525354555657585960616263646566676869707172737475767778798081828384858687888990919293949596979899".charCodeAt((is + 1 >>> 0))));
						(x$2 = i + 0 >> 0, ((x$2 < 0 || x$2 >= a.length) ? ($throwRuntimeError("index out of range"), undefined) : a[x$2] = "00010203040506070809101112131415161718192021222324252627282930313233343536373839404142434445464748495051525354555657585960616263646566676869707172737475767778798081828384858687888990919293949596979899".charCodeAt((is + 0 >>> 0))));
						j = j - (1) >> 0;
					}
					i = i - (1) >> 0;
					((i < 0 || i >= a.length) ? ($throwRuntimeError("index out of range"), undefined) : a[i] = "00010203040506070809101112131415161718192021222324252627282930313233343536373839404142434445464748495051525354555657585960616263646566676869707172737475767778798081828384858687888990919293949596979899".charCodeAt(((us * 2 >>> 0) + 1 >>> 0)));
					u = q;
				}
			}
			us$1 = ((u.$low >>> 0));
			while (true) {
				if (!(us$1 >= 100)) { break; }
				is$1 = (_r$1 = us$1 % 100, _r$1 === _r$1 ? _r$1 : $throwRuntimeError("integer divide by zero")) * 2 >>> 0;
				us$1 = (_q$1 = us$1 / (100), (_q$1 === _q$1 && _q$1 !== 1/0 && _q$1 !== -1/0) ? _q$1 >>> 0 : $throwRuntimeError("integer divide by zero"));
				i = i - (2) >> 0;
				(x$3 = i + 1 >> 0, ((x$3 < 0 || x$3 >= a.length) ? ($throwRuntimeError("index out of range"), undefined) : a[x$3] = "00010203040506070809101112131415161718192021222324252627282930313233343536373839404142434445464748495051525354555657585960616263646566676869707172737475767778798081828384858687888990919293949596979899".charCodeAt((is$1 + 1 >>> 0))));
				(x$4 = i + 0 >> 0, ((x$4 < 0 || x$4 >= a.length) ? ($throwRuntimeError("index out of range"), undefined) : a[x$4] = "00010203040506070809101112131415161718192021222324252627282930313233343536373839404142434445464748495051525354555657585960616263646566676869707172737475767778798081828384858687888990919293949596979899".charCodeAt((is$1 + 0 >>> 0))));
			}
			is$2 = us$1 * 2 >>> 0;
			i = i - (1) >> 0;
			((i < 0 || i >= a.length) ? ($throwRuntimeError("index out of range"), undefined) : a[i] = "00010203040506070809101112131415161718192021222324252627282930313233343536373839404142434445464748495051525354555657585960616263646566676869707172737475767778798081828384858687888990919293949596979899".charCodeAt((is$2 + 1 >>> 0)));
			if (us$1 >= 10) {
				i = i - (1) >> 0;
				((i < 0 || i >= a.length) ? ($throwRuntimeError("index out of range"), undefined) : a[i] = "00010203040506070809101112131415161718192021222324252627282930313233343536373839404142434445464748495051525354555657585960616263646566676869707172737475767778798081828384858687888990919293949596979899".charCodeAt(is$2));
			}
		} else if (isPowerOfTwo(base)) {
			shift = (((bits.TrailingZeros(((base >>> 0))) >>> 0)) & 31) >>> 0;
			b = (new $Uint64(0, base));
			m = ((base >>> 0)) - 1 >>> 0;
			while (true) {
				if (!((u.$high > b.$high || (u.$high === b.$high && u.$low >= b.$low)))) { break; }
				i = i - (1) >> 0;
				((i < 0 || i >= a.length) ? ($throwRuntimeError("index out of range"), undefined) : a[i] = "0123456789abcdefghijklmnopqrstuvwxyz".charCodeAt(((((u.$low >>> 0)) & m) >>> 0)));
				u = $shiftRightUint64(u, (shift));
			}
			i = i - (1) >> 0;
			((i < 0 || i >= a.length) ? ($throwRuntimeError("index out of range"), undefined) : a[i] = "0123456789abcdefghijklmnopqrstuvwxyz".charCodeAt(((u.$low >>> 0))));
		} else {
			b$1 = (new $Uint64(0, base));
			while (true) {
				if (!((u.$high > b$1.$high || (u.$high === b$1.$high && u.$low >= b$1.$low)))) { break; }
				i = i - (1) >> 0;
				q$1 = $div64(u, b$1, false);
				((i < 0 || i >= a.length) ? ($throwRuntimeError("index out of range"), undefined) : a[i] = "0123456789abcdefghijklmnopqrstuvwxyz".charCodeAt((((x$5 = $mul64(q$1, b$1), new $Uint64(u.$high - x$5.$high, u.$low - x$5.$low)).$low >>> 0))));
				u = q$1;
			}
			i = i - (1) >> 0;
			((i < 0 || i >= a.length) ? ($throwRuntimeError("index out of range"), undefined) : a[i] = "0123456789abcdefghijklmnopqrstuvwxyz".charCodeAt(((u.$low >>> 0))));
		}
		if (neg) {
			i = i - (1) >> 0;
			((i < 0 || i >= a.length) ? ($throwRuntimeError("index out of range"), undefined) : a[i] = 45);
		}
		if (append_) {
			d = $appendSlice(dst, $subslice(new sliceType$6(a), i));
			return [d, s];
		}
		s = ($bytesToString($subslice(new sliceType$6(a), i)));
		return [d, s];
	};
	isPowerOfTwo = function(x) {
		var x;
		return (x & ((x - 1 >> 0))) === 0;
	};
	ptrType$2.methods = [{prop: "set", name: "set", pkg: "strconv", typ: $funcType([$String], [$Bool], false)}, {prop: "floatBits", name: "floatBits", pkg: "strconv", typ: $funcType([ptrType$1], [$Uint64, $Bool], false)}, {prop: "String", name: "String", pkg: "", typ: $funcType([], [$String], false)}, {prop: "Assign", name: "Assign", pkg: "", typ: $funcType([$Uint64], [], false)}, {prop: "Shift", name: "Shift", pkg: "", typ: $funcType([$Int], [], false)}, {prop: "Round", name: "Round", pkg: "", typ: $funcType([$Int], [], false)}, {prop: "RoundDown", name: "RoundDown", pkg: "", typ: $funcType([$Int], [], false)}, {prop: "RoundUp", name: "RoundUp", pkg: "", typ: $funcType([$Int], [], false)}, {prop: "RoundedInteger", name: "RoundedInteger", pkg: "", typ: $funcType([], [$Uint64], false)}];
	ptrType$4.methods = [{prop: "floatBits", name: "floatBits", pkg: "strconv", typ: $funcType([ptrType$1], [$Uint64, $Bool], false)}, {prop: "AssignComputeBounds", name: "AssignComputeBounds", pkg: "", typ: $funcType([$Uint64, $Int, $Bool, ptrType$1], [extFloat, extFloat], false)}, {prop: "Normalize", name: "Normalize", pkg: "", typ: $funcType([], [$Uint], false)}, {prop: "Multiply", name: "Multiply", pkg: "", typ: $funcType([extFloat], [], false)}, {prop: "AssignDecimal", name: "AssignDecimal", pkg: "", typ: $funcType([$Uint64, $Int, $Bool, $Bool, ptrType$1], [$Bool], false)}, {prop: "frexp10", name: "frexp10", pkg: "strconv", typ: $funcType([], [$Int, $Int], false)}, {prop: "FixedDecimal", name: "FixedDecimal", pkg: "", typ: $funcType([ptrType$3, $Int], [$Bool], false)}, {prop: "ShortestDecimal", name: "ShortestDecimal", pkg: "", typ: $funcType([ptrType$3, ptrType$4, ptrType$4], [$Bool], false)}];
	decimal.init("strconv", [{prop: "d", name: "d", embedded: false, exported: false, typ: arrayType, tag: ""}, {prop: "nd", name: "nd", embedded: false, exported: false, typ: $Int, tag: ""}, {prop: "dp", name: "dp", embedded: false, exported: false, typ: $Int, tag: ""}, {prop: "neg", name: "neg", embedded: false, exported: false, typ: $Bool, tag: ""}, {prop: "trunc", name: "trunc", embedded: false, exported: false, typ: $Bool, tag: ""}]);
	leftCheat.init("strconv", [{prop: "delta", name: "delta", embedded: false, exported: false, typ: $Int, tag: ""}, {prop: "cutoff", name: "cutoff", embedded: false, exported: false, typ: $String, tag: ""}]);
	extFloat.init("strconv", [{prop: "mant", name: "mant", embedded: false, exported: false, typ: $Uint64, tag: ""}, {prop: "exp", name: "exp", embedded: false, exported: false, typ: $Int, tag: ""}, {prop: "neg", name: "neg", embedded: false, exported: false, typ: $Bool, tag: ""}]);
	floatInfo.init("strconv", [{prop: "mantbits", name: "mantbits", embedded: false, exported: false, typ: $Uint, tag: ""}, {prop: "expbits", name: "expbits", embedded: false, exported: false, typ: $Uint, tag: ""}, {prop: "bias", name: "bias", embedded: false, exported: false, typ: $Int, tag: ""}]);
	decimalSlice.init("strconv", [{prop: "d", name: "d", embedded: false, exported: false, typ: sliceType$6, tag: ""}, {prop: "nd", name: "nd", embedded: false, exported: false, typ: $Int, tag: ""}, {prop: "dp", name: "dp", embedded: false, exported: false, typ: $Int, tag: ""}, {prop: "neg", name: "neg", embedded: false, exported: false, typ: $Bool, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = errors.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = math.$init(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = bits.$init(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = utf8.$init(); /* */ $s = 4; case 4: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		optimize = true;
		$pkg.ErrRange = errors.New("value out of range");
		$pkg.ErrSyntax = errors.New("invalid syntax");
		leftcheats = new sliceType$3([new leftCheat.ptr(0, ""), new leftCheat.ptr(1, "5"), new leftCheat.ptr(1, "25"), new leftCheat.ptr(1, "125"), new leftCheat.ptr(2, "625"), new leftCheat.ptr(2, "3125"), new leftCheat.ptr(2, "15625"), new leftCheat.ptr(3, "78125"), new leftCheat.ptr(3, "390625"), new leftCheat.ptr(3, "1953125"), new leftCheat.ptr(4, "9765625"), new leftCheat.ptr(4, "48828125"), new leftCheat.ptr(4, "244140625"), new leftCheat.ptr(4, "1220703125"), new leftCheat.ptr(5, "6103515625"), new leftCheat.ptr(5, "30517578125"), new leftCheat.ptr(5, "152587890625"), new leftCheat.ptr(6, "762939453125"), new leftCheat.ptr(6, "3814697265625"), new leftCheat.ptr(6, "19073486328125"), new leftCheat.ptr(7, "95367431640625"), new leftCheat.ptr(7, "476837158203125"), new leftCheat.ptr(7, "2384185791015625"), new leftCheat.ptr(7, "11920928955078125"), new leftCheat.ptr(8, "59604644775390625"), new leftCheat.ptr(8, "298023223876953125"), new leftCheat.ptr(8, "1490116119384765625"), new leftCheat.ptr(9, "7450580596923828125"), new leftCheat.ptr(9, "37252902984619140625"), new leftCheat.ptr(9, "186264514923095703125"), new leftCheat.ptr(10, "931322574615478515625"), new leftCheat.ptr(10, "4656612873077392578125"), new leftCheat.ptr(10, "23283064365386962890625"), new leftCheat.ptr(10, "116415321826934814453125"), new leftCheat.ptr(11, "582076609134674072265625"), new leftCheat.ptr(11, "2910383045673370361328125"), new leftCheat.ptr(11, "14551915228366851806640625"), new leftCheat.ptr(12, "72759576141834259033203125"), new leftCheat.ptr(12, "363797880709171295166015625"), new leftCheat.ptr(12, "1818989403545856475830078125"), new leftCheat.ptr(13, "9094947017729282379150390625"), new leftCheat.ptr(13, "45474735088646411895751953125"), new leftCheat.ptr(13, "227373675443232059478759765625"), new leftCheat.ptr(13, "1136868377216160297393798828125"), new leftCheat.ptr(14, "5684341886080801486968994140625"), new leftCheat.ptr(14, "28421709430404007434844970703125"), new leftCheat.ptr(14, "142108547152020037174224853515625"), new leftCheat.ptr(15, "710542735760100185871124267578125"), new leftCheat.ptr(15, "3552713678800500929355621337890625"), new leftCheat.ptr(15, "17763568394002504646778106689453125"), new leftCheat.ptr(16, "88817841970012523233890533447265625"), new leftCheat.ptr(16, "444089209850062616169452667236328125"), new leftCheat.ptr(16, "2220446049250313080847263336181640625"), new leftCheat.ptr(16, "11102230246251565404236316680908203125"), new leftCheat.ptr(17, "55511151231257827021181583404541015625"), new leftCheat.ptr(17, "277555756156289135105907917022705078125"), new leftCheat.ptr(17, "1387778780781445675529539585113525390625"), new leftCheat.ptr(18, "6938893903907228377647697925567626953125"), new leftCheat.ptr(18, "34694469519536141888238489627838134765625"), new leftCheat.ptr(18, "173472347597680709441192448139190673828125"), new leftCheat.ptr(19, "867361737988403547205962240695953369140625")]);
		smallPowersOfTen = $toNativeArray($kindStruct, [new extFloat.ptr(new $Uint64(2147483648, 0), -63, false), new extFloat.ptr(new $Uint64(2684354560, 0), -60, false), new extFloat.ptr(new $Uint64(3355443200, 0), -57, false), new extFloat.ptr(new $Uint64(4194304000, 0), -54, false), new extFloat.ptr(new $Uint64(2621440000, 0), -50, false), new extFloat.ptr(new $Uint64(3276800000, 0), -47, false), new extFloat.ptr(new $Uint64(4096000000, 0), -44, false), new extFloat.ptr(new $Uint64(2560000000, 0), -40, false)]);
		powersOfTen = $toNativeArray($kindStruct, [new extFloat.ptr(new $Uint64(4203730336, 136053384), -1220, false), new extFloat.ptr(new $Uint64(3132023167, 2722021238), -1193, false), new extFloat.ptr(new $Uint64(2333539104, 810921078), -1166, false), new extFloat.ptr(new $Uint64(3477244234, 1573795306), -1140, false), new extFloat.ptr(new $Uint64(2590748842, 1432697645), -1113, false), new extFloat.ptr(new $Uint64(3860516611, 1025131999), -1087, false), new extFloat.ptr(new $Uint64(2876309015, 3348809418), -1060, false), new extFloat.ptr(new $Uint64(4286034428, 3200048207), -1034, false), new extFloat.ptr(new $Uint64(3193344495, 1097586188), -1007, false), new extFloat.ptr(new $Uint64(2379227053, 2424306748), -980, false), new extFloat.ptr(new $Uint64(3545324584, 827693699), -954, false), new extFloat.ptr(new $Uint64(2641472655, 2913388981), -927, false), new extFloat.ptr(new $Uint64(3936100983, 602835915), -901, false), new extFloat.ptr(new $Uint64(2932623761, 1081627501), -874, false), new extFloat.ptr(new $Uint64(2184974969, 1572261463), -847, false), new extFloat.ptr(new $Uint64(3255866422, 1308317239), -821, false), new extFloat.ptr(new $Uint64(2425809519, 944281679), -794, false), new extFloat.ptr(new $Uint64(3614737867, 629291719), -768, false), new extFloat.ptr(new $Uint64(2693189581, 2545915892), -741, false), new extFloat.ptr(new $Uint64(4013165208, 388672741), -715, false), new extFloat.ptr(new $Uint64(2990041083, 708162190), -688, false), new extFloat.ptr(new $Uint64(2227754207, 3536207675), -661, false), new extFloat.ptr(new $Uint64(3319612455, 450088378), -635, false), new extFloat.ptr(new $Uint64(2473304014, 3139815830), -608, false), new extFloat.ptr(new $Uint64(3685510180, 2103616900), -582, false), new extFloat.ptr(new $Uint64(2745919064, 224385782), -555, false), new extFloat.ptr(new $Uint64(4091738259, 3737383206), -529, false), new extFloat.ptr(new $Uint64(3048582568, 2868871352), -502, false), new extFloat.ptr(new $Uint64(2271371013, 1820084875), -475, false), new extFloat.ptr(new $Uint64(3384606560, 885076051), -449, false), new extFloat.ptr(new $Uint64(2521728396, 2444895829), -422, false), new extFloat.ptr(new $Uint64(3757668132, 1881767613), -396, false), new extFloat.ptr(new $Uint64(2799680927, 3102062735), -369, false), new extFloat.ptr(new $Uint64(4171849679, 2289335700), -343, false), new extFloat.ptr(new $Uint64(3108270227, 2410191823), -316, false), new extFloat.ptr(new $Uint64(2315841784, 3205436779), -289, false), new extFloat.ptr(new $Uint64(3450873173, 1697722806), -263, false), new extFloat.ptr(new $Uint64(2571100870, 3497754540), -236, false), new extFloat.ptr(new $Uint64(3831238852, 707476230), -210, false), new extFloat.ptr(new $Uint64(2854495385, 1769181907), -183, false), new extFloat.ptr(new $Uint64(4253529586, 2197867022), -157, false), new extFloat.ptr(new $Uint64(3169126500, 2450594539), -130, false), new extFloat.ptr(new $Uint64(2361183241, 1867548876), -103, false), new extFloat.ptr(new $Uint64(3518437208, 3793315116), -77, false), new extFloat.ptr(new $Uint64(2621440000, 0), -50, false), new extFloat.ptr(new $Uint64(3906250000, 0), -24, false), new extFloat.ptr(new $Uint64(2910383045, 2892103680), 3, false), new extFloat.ptr(new $Uint64(2168404344, 4170451332), 30, false), new extFloat.ptr(new $Uint64(3231174267, 3372684723), 56, false), new extFloat.ptr(new $Uint64(2407412430, 2078956656), 83, false), new extFloat.ptr(new $Uint64(3587324068, 2884206696), 109, false), new extFloat.ptr(new $Uint64(2672764710, 395977285), 136, false), new extFloat.ptr(new $Uint64(3982729777, 3569679143), 162, false), new extFloat.ptr(new $Uint64(2967364920, 2361961896), 189, false), new extFloat.ptr(new $Uint64(2210859150, 447440347), 216, false), new extFloat.ptr(new $Uint64(3294436857, 1114709402), 242, false), new extFloat.ptr(new $Uint64(2454546732, 2786846552), 269, false), new extFloat.ptr(new $Uint64(3657559652, 443583978), 295, false), new extFloat.ptr(new $Uint64(2725094297, 2599384906), 322, false), new extFloat.ptr(new $Uint64(4060706939, 3028118405), 348, false), new extFloat.ptr(new $Uint64(3025462433, 2044532855), 375, false), new extFloat.ptr(new $Uint64(2254145170, 1536935362), 402, false), new extFloat.ptr(new $Uint64(3358938053, 3365297469), 428, false), new extFloat.ptr(new $Uint64(2502603868, 4204241075), 455, false), new extFloat.ptr(new $Uint64(3729170365, 2577424355), 481, false), new extFloat.ptr(new $Uint64(2778448436, 3677981733), 508, false), new extFloat.ptr(new $Uint64(4140210802, 2744688476), 534, false), new extFloat.ptr(new $Uint64(3084697427, 1424604878), 561, false), new extFloat.ptr(new $Uint64(2298278679, 4062331362), 588, false), new extFloat.ptr(new $Uint64(3424702107, 3546052773), 614, false), new extFloat.ptr(new $Uint64(2551601907, 2065781727), 641, false), new extFloat.ptr(new $Uint64(3802183132, 2535403578), 667, false), new extFloat.ptr(new $Uint64(2832847187, 1558426518), 694, false), new extFloat.ptr(new $Uint64(4221271257, 2762425404), 720, false), new extFloat.ptr(new $Uint64(3145092172, 2812560400), 747, false), new extFloat.ptr(new $Uint64(2343276271, 3057687578), 774, false), new extFloat.ptr(new $Uint64(3491753744, 2790753324), 800, false), new extFloat.ptr(new $Uint64(2601559269, 3918606633), 827, false), new extFloat.ptr(new $Uint64(3876625403, 2711358621), 853, false), new extFloat.ptr(new $Uint64(2888311001, 1648096297), 880, false), new extFloat.ptr(new $Uint64(2151959390, 2057817989), 907, false), new extFloat.ptr(new $Uint64(3206669376, 61660461), 933, false), new extFloat.ptr(new $Uint64(2389154863, 1581580175), 960, false), new extFloat.ptr(new $Uint64(3560118173, 2626467905), 986, false), new extFloat.ptr(new $Uint64(2652494738, 3034782633), 1013, false), new extFloat.ptr(new $Uint64(3952525166, 3135207385), 1039, false), new extFloat.ptr(new $Uint64(2944860731, 2616258155), 1066, false)]);
		uint64pow10 = $toNativeArray($kindUint64, [new $Uint64(0, 1), new $Uint64(0, 10), new $Uint64(0, 100), new $Uint64(0, 1000), new $Uint64(0, 10000), new $Uint64(0, 100000), new $Uint64(0, 1000000), new $Uint64(0, 10000000), new $Uint64(0, 100000000), new $Uint64(0, 1000000000), new $Uint64(2, 1410065408), new $Uint64(23, 1215752192), new $Uint64(232, 3567587328), new $Uint64(2328, 1316134912), new $Uint64(23283, 276447232), new $Uint64(232830, 2764472320), new $Uint64(2328306, 1874919424), new $Uint64(23283064, 1569325056), new $Uint64(232830643, 2808348672), new $Uint64(2328306436, 2313682944)]);
		float32info = new floatInfo.ptr(23, 8, -127);
		float64info = new floatInfo.ptr(52, 11, -1023);
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["github.com/dotchain/fuss/dom"] = (function() {
	var $pkg = {}, $init, changes, core, strconv, Element, Size, Direction, Styles, Props, EventHandler, Event, nodeStream, diff, node, BoolStream, TextStream, aCtx, AStruct, cbEditCtx, CheckboxEditStruct, nodeCtx, EltStruct, fixedCtx, FixedStruct, labelViewCtx, LabelViewStruct, runCtx, RunStruct, stretchCtx, StretchStruct, textEditCtx, TextEditStruct, textEditOCtx, TextEditOStruct, textViewCtx, TextViewStruct, vrunCtx, VRunStruct, TextEditOptions, ptrType, sliceType, arrayType, sliceType$1, ptrType$1, ptrType$2, ptrType$3, sliceType$2, sliceType$3, ptrType$4, ptrType$5, ptrType$6, structType, ptrType$8, structType$2, ptrType$9, structType$3, ptrType$10, structType$4, ptrType$11, structType$5, ptrType$12, ptrType$13, ptrType$14, structType$6, ptrType$15, structType$7, ptrType$16, structType$8, ptrType$17, mapType, funcType, ptrType$18, funcType$1, ptrType$19, mapType$1, ptrType$21, mapType$3, ptrType$22, mapType$4, ptrType$23, mapType$5, ptrType$24, mapType$6, ptrType$25, mapType$7, ptrType$26, mapType$8, ptrType$27, mapType$9, ptrType$28, mapType$10, ptrType$29, mapType$11, ptrType$30, mapType$12, driver, A, checkboxEdit, NewElement, RegisterDriver, elt, NewBoolStream, NewTextStream, labelView, run, fixed, stretch, vrun, textView, textEdit, textEditO;
	changes = $packages["github.com/dotchain/dot/changes"];
	core = $packages["github.com/dotchain/fuss/core"];
	strconv = $packages["strconv"];
	Element = $pkg.Element = $newType(8, $kindInterface, "dom.Element", true, "github.com/dotchain/fuss/dom", true, null);
	Size = $pkg.Size = $newType(0, $kindStruct, "dom.Size", true, "github.com/dotchain/fuss/dom", true, function(Raw_, Percent_, Pixels_, Em_, En_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Raw = "";
			this.Percent = 0;
			this.Pixels = 0;
			this.Em = 0;
			this.En = 0;
			return;
		}
		this.Raw = Raw_;
		this.Percent = Percent_;
		this.Pixels = Pixels_;
		this.Em = Em_;
		this.En = En_;
	});
	Direction = $pkg.Direction = $newType(4, $kindInt, "dom.Direction", true, "github.com/dotchain/fuss/dom", true, null);
	Styles = $pkg.Styles = $newType(0, $kindStruct, "dom.Styles", true, "github.com/dotchain/fuss/dom", true, function(Color_, Width_, Height_, OverflowX_, OverflowY_, FlexDirection_, FlexGrow_, FlexShrink_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Color = "";
			this.Width = new Size.ptr("", 0, 0, 0, 0);
			this.Height = new Size.ptr("", 0, 0, 0, 0);
			this.OverflowX = "";
			this.OverflowY = "";
			this.FlexDirection = 0;
			this.FlexGrow = 0;
			this.FlexShrink = 0;
			return;
		}
		this.Color = Color_;
		this.Width = Width_;
		this.Height = Height_;
		this.OverflowX = OverflowX_;
		this.OverflowY = OverflowY_;
		this.FlexDirection = FlexDirection_;
		this.FlexGrow = FlexGrow_;
		this.FlexShrink = FlexShrink_;
	});
	Props = $pkg.Props = $newType(0, $kindStruct, "dom.Props", true, "github.com/dotchain/fuss/dom", true, function(Styles_, Tag_, Checked_, Type_, TextContent_, ID_, For_, Href_, Placeholder_, OnChange_, OnClick_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Styles = new Styles.ptr("", new Size.ptr("", 0, 0, 0, 0), new Size.ptr("", 0, 0, 0, 0), "", "", 0, 0, 0);
			this.Tag = "";
			this.Checked = false;
			this.Type = "";
			this.TextContent = "";
			this.ID = "";
			this.For = "";
			this.Href = "";
			this.Placeholder = "";
			this.OnChange = ptrType.nil;
			this.OnClick = ptrType.nil;
			return;
		}
		this.Styles = Styles_;
		this.Tag = Tag_;
		this.Checked = Checked_;
		this.Type = Type_;
		this.TextContent = TextContent_;
		this.ID = ID_;
		this.For = For_;
		this.Href = Href_;
		this.Placeholder = Placeholder_;
		this.OnChange = OnChange_;
		this.OnClick = OnClick_;
	});
	EventHandler = $pkg.EventHandler = $newType(0, $kindStruct, "dom.EventHandler", true, "github.com/dotchain/fuss/dom", true, function(Handle_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Handle = $throwNilPointerError;
			return;
		}
		this.Handle = Handle_;
	});
	Event = $pkg.Event = $newType(0, $kindStruct, "dom.Event", true, "github.com/dotchain/fuss/dom", true, function() {
		this.$val = this;
		if (arguments.length === 0) {
			return;
		}
	});
	nodeStream = $pkg.nodeStream = $newType(0, $kindStruct, "dom.nodeStream", true, "github.com/dotchain/fuss/dom", false, function(Notifier_, node_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Notifier = ptrType$2.nil;
			this.node = new node.ptr($ifaceNil, new Props.ptr(new Styles.ptr("", new Size.ptr("", 0, 0, 0, 0), new Size.ptr("", 0, 0, 0, 0), "", "", 0, 0, 0), "", false, "", "", "", "", "", "", ptrType.nil, ptrType.nil));
			return;
		}
		this.Notifier = Notifier_;
		this.node = node_;
	});
	diff = $pkg.diff = $newType(0, $kindStruct, "dom.diff", true, "github.com/dotchain/fuss/dom", false, function(insert_, elt_, index_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.insert = false;
			this.elt = $ifaceNil;
			this.index = 0;
			return;
		}
		this.insert = insert_;
		this.elt = elt_;
		this.index = index_;
	});
	node = $pkg.node = $newType(0, $kindStruct, "dom.node", true, "github.com/dotchain/fuss/dom", false, function(root_, props_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.root = $ifaceNil;
			this.props = new Props.ptr(new Styles.ptr("", new Size.ptr("", 0, 0, 0, 0), new Size.ptr("", 0, 0, 0, 0), "", "", 0, 0, 0), "", false, "", "", "", "", "", "", ptrType.nil, ptrType.nil);
			return;
		}
		this.root = root_;
		this.props = props_;
	});
	BoolStream = $pkg.BoolStream = $newType(0, $kindStruct, "dom.BoolStream", true, "github.com/dotchain/fuss/dom", true, function(Notifier_, Value_, Change_, Next_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Notifier = ptrType$2.nil;
			this.Value = false;
			this.Change = $ifaceNil;
			this.Next = ptrType$4.nil;
			return;
		}
		this.Notifier = Notifier_;
		this.Value = Value_;
		this.Change = Change_;
		this.Next = Next_;
	});
	TextStream = $pkg.TextStream = $newType(0, $kindStruct, "dom.TextStream", true, "github.com/dotchain/fuss/dom", true, function(Notifier_, Value_, Change_, Next_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Notifier = ptrType$2.nil;
			this.Value = "";
			this.Change = $ifaceNil;
			this.Next = ptrType$5.nil;
			return;
		}
		this.Notifier = Notifier_;
		this.Value = Value_;
		this.Change = Change_;
		this.Next = Next_;
	});
	aCtx = $pkg.aCtx = $newType(0, $kindStruct, "dom.aCtx", true, "github.com/dotchain/fuss/dom", false, function(Cache_, finalizer_, EltStruct_, initialized_, stateHandler_, memoized_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Cache = new core.Cache.ptr(false, false);
			this.finalizer = $throwNilPointerError;
			this.EltStruct = new EltStruct.ptr(false, false);
			this.initialized = false;
			this.stateHandler = new core.Handler.ptr($throwNilPointerError);
			this.memoized = new structType.ptr(sliceType.nil, "", $ifaceNil, new Styles.ptr("", new Size.ptr("", 0, 0, 0, 0), new Size.ptr("", 0, 0, 0, 0), "", "", 0, 0, 0));
			return;
		}
		this.Cache = Cache_;
		this.finalizer = finalizer_;
		this.EltStruct = EltStruct_;
		this.initialized = initialized_;
		this.stateHandler = stateHandler_;
		this.memoized = memoized_;
	});
	AStruct = $pkg.AStruct = $newType(0, $kindStruct, "dom.AStruct", true, "github.com/dotchain/fuss/dom", true, function(old_, current_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.old = false;
			this.current = false;
			return;
		}
		this.old = old_;
		this.current = current_;
	});
	cbEditCtx = $pkg.cbEditCtx = $newType(0, $kindStruct, "dom.cbEditCtx", true, "github.com/dotchain/fuss/dom", false, function(Cache_, finalizer_, EltStruct_, initialized_, stateHandler_, memoized_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Cache = new core.Cache.ptr(false, false);
			this.finalizer = $throwNilPointerError;
			this.EltStruct = new EltStruct.ptr(false, false);
			this.initialized = false;
			this.stateHandler = new core.Handler.ptr($throwNilPointerError);
			this.memoized = new structType$2.ptr(ptrType$4.nil, "", $ifaceNil, new Styles.ptr("", new Size.ptr("", 0, 0, 0, 0), new Size.ptr("", 0, 0, 0, 0), "", "", 0, 0, 0));
			return;
		}
		this.Cache = Cache_;
		this.finalizer = finalizer_;
		this.EltStruct = EltStruct_;
		this.initialized = initialized_;
		this.stateHandler = stateHandler_;
		this.memoized = memoized_;
	});
	CheckboxEditStruct = $pkg.CheckboxEditStruct = $newType(0, $kindStruct, "dom.CheckboxEditStruct", true, "github.com/dotchain/fuss/dom", true, function(old_, current_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.old = false;
			this.current = false;
			return;
		}
		this.old = old_;
		this.current = current_;
	});
	nodeCtx = $pkg.nodeCtx = $newType(0, $kindStruct, "dom.nodeCtx", true, "github.com/dotchain/fuss/dom", false, function(Cache_, finalizer_, initialized_, stateHandler_, memoized_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Cache = new core.Cache.ptr(false, false);
			this.finalizer = $throwNilPointerError;
			this.initialized = false;
			this.stateHandler = new core.Handler.ptr($throwNilPointerError);
			this.memoized = new structType$3.ptr(sliceType.nil, ptrType$1.nil, new Props.ptr(new Styles.ptr("", new Size.ptr("", 0, 0, 0, 0), new Size.ptr("", 0, 0, 0, 0), "", "", 0, 0, 0), "", false, "", "", "", "", "", "", ptrType.nil, ptrType.nil), ptrType$1.nil, $ifaceNil);
			return;
		}
		this.Cache = Cache_;
		this.finalizer = finalizer_;
		this.initialized = initialized_;
		this.stateHandler = stateHandler_;
		this.memoized = memoized_;
	});
	EltStruct = $pkg.EltStruct = $newType(0, $kindStruct, "dom.EltStruct", true, "github.com/dotchain/fuss/dom", true, function(old_, current_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.old = false;
			this.current = false;
			return;
		}
		this.old = old_;
		this.current = current_;
	});
	fixedCtx = $pkg.fixedCtx = $newType(0, $kindStruct, "dom.fixedCtx", true, "github.com/dotchain/fuss/dom", false, function(Cache_, finalizer_, EltStruct_, initialized_, stateHandler_, memoized_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Cache = new core.Cache.ptr(false, false);
			this.finalizer = $throwNilPointerError;
			this.EltStruct = new EltStruct.ptr(false, false);
			this.initialized = false;
			this.stateHandler = new core.Handler.ptr($throwNilPointerError);
			this.memoized = new structType$4.ptr(sliceType.nil, $ifaceNil, new Styles.ptr("", new Size.ptr("", 0, 0, 0, 0), new Size.ptr("", 0, 0, 0, 0), "", "", 0, 0, 0));
			return;
		}
		this.Cache = Cache_;
		this.finalizer = finalizer_;
		this.EltStruct = EltStruct_;
		this.initialized = initialized_;
		this.stateHandler = stateHandler_;
		this.memoized = memoized_;
	});
	FixedStruct = $pkg.FixedStruct = $newType(0, $kindStruct, "dom.FixedStruct", true, "github.com/dotchain/fuss/dom", true, function(old_, current_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.old = false;
			this.current = false;
			return;
		}
		this.old = old_;
		this.current = current_;
	});
	labelViewCtx = $pkg.labelViewCtx = $newType(0, $kindStruct, "dom.labelViewCtx", true, "github.com/dotchain/fuss/dom", false, function(Cache_, finalizer_, EltStruct_, initialized_, stateHandler_, memoized_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Cache = new core.Cache.ptr(false, false);
			this.finalizer = $throwNilPointerError;
			this.EltStruct = new EltStruct.ptr(false, false);
			this.initialized = false;
			this.stateHandler = new core.Handler.ptr($throwNilPointerError);
			this.memoized = new structType$5.ptr("", $ifaceNil, new Styles.ptr("", new Size.ptr("", 0, 0, 0, 0), new Size.ptr("", 0, 0, 0, 0), "", "", 0, 0, 0), "");
			return;
		}
		this.Cache = Cache_;
		this.finalizer = finalizer_;
		this.EltStruct = EltStruct_;
		this.initialized = initialized_;
		this.stateHandler = stateHandler_;
		this.memoized = memoized_;
	});
	LabelViewStruct = $pkg.LabelViewStruct = $newType(0, $kindStruct, "dom.LabelViewStruct", true, "github.com/dotchain/fuss/dom", true, function(old_, current_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.old = false;
			this.current = false;
			return;
		}
		this.old = old_;
		this.current = current_;
	});
	runCtx = $pkg.runCtx = $newType(0, $kindStruct, "dom.runCtx", true, "github.com/dotchain/fuss/dom", false, function(Cache_, finalizer_, EltStruct_, initialized_, stateHandler_, memoized_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Cache = new core.Cache.ptr(false, false);
			this.finalizer = $throwNilPointerError;
			this.EltStruct = new EltStruct.ptr(false, false);
			this.initialized = false;
			this.stateHandler = new core.Handler.ptr($throwNilPointerError);
			this.memoized = new structType$4.ptr(sliceType.nil, $ifaceNil, new Styles.ptr("", new Size.ptr("", 0, 0, 0, 0), new Size.ptr("", 0, 0, 0, 0), "", "", 0, 0, 0));
			return;
		}
		this.Cache = Cache_;
		this.finalizer = finalizer_;
		this.EltStruct = EltStruct_;
		this.initialized = initialized_;
		this.stateHandler = stateHandler_;
		this.memoized = memoized_;
	});
	RunStruct = $pkg.RunStruct = $newType(0, $kindStruct, "dom.RunStruct", true, "github.com/dotchain/fuss/dom", true, function(old_, current_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.old = false;
			this.current = false;
			return;
		}
		this.old = old_;
		this.current = current_;
	});
	stretchCtx = $pkg.stretchCtx = $newType(0, $kindStruct, "dom.stretchCtx", true, "github.com/dotchain/fuss/dom", false, function(Cache_, finalizer_, EltStruct_, initialized_, stateHandler_, memoized_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Cache = new core.Cache.ptr(false, false);
			this.finalizer = $throwNilPointerError;
			this.EltStruct = new EltStruct.ptr(false, false);
			this.initialized = false;
			this.stateHandler = new core.Handler.ptr($throwNilPointerError);
			this.memoized = new structType$4.ptr(sliceType.nil, $ifaceNil, new Styles.ptr("", new Size.ptr("", 0, 0, 0, 0), new Size.ptr("", 0, 0, 0, 0), "", "", 0, 0, 0));
			return;
		}
		this.Cache = Cache_;
		this.finalizer = finalizer_;
		this.EltStruct = EltStruct_;
		this.initialized = initialized_;
		this.stateHandler = stateHandler_;
		this.memoized = memoized_;
	});
	StretchStruct = $pkg.StretchStruct = $newType(0, $kindStruct, "dom.StretchStruct", true, "github.com/dotchain/fuss/dom", true, function(old_, current_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.old = false;
			this.current = false;
			return;
		}
		this.old = old_;
		this.current = current_;
	});
	textEditCtx = $pkg.textEditCtx = $newType(0, $kindStruct, "dom.textEditCtx", true, "github.com/dotchain/fuss/dom", false, function(Cache_, finalizer_, TextEditOStruct_, initialized_, stateHandler_, memoized_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Cache = new core.Cache.ptr(false, false);
			this.finalizer = $throwNilPointerError;
			this.TextEditOStruct = new TextEditOStruct.ptr(false, false);
			this.initialized = false;
			this.stateHandler = new core.Handler.ptr($throwNilPointerError);
			this.memoized = new structType$6.ptr($ifaceNil, new Styles.ptr("", new Size.ptr("", 0, 0, 0, 0), new Size.ptr("", 0, 0, 0, 0), "", "", 0, 0, 0), ptrType$5.nil);
			return;
		}
		this.Cache = Cache_;
		this.finalizer = finalizer_;
		this.TextEditOStruct = TextEditOStruct_;
		this.initialized = initialized_;
		this.stateHandler = stateHandler_;
		this.memoized = memoized_;
	});
	TextEditStruct = $pkg.TextEditStruct = $newType(0, $kindStruct, "dom.TextEditStruct", true, "github.com/dotchain/fuss/dom", true, function(old_, current_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.old = false;
			this.current = false;
			return;
		}
		this.old = old_;
		this.current = current_;
	});
	textEditOCtx = $pkg.textEditOCtx = $newType(0, $kindStruct, "dom.textEditOCtx", true, "github.com/dotchain/fuss/dom", false, function(Cache_, finalizer_, EltStruct_, initialized_, stateHandler_, memoized_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Cache = new core.Cache.ptr(false, false);
			this.finalizer = $throwNilPointerError;
			this.EltStruct = new EltStruct.ptr(false, false);
			this.initialized = false;
			this.stateHandler = new core.Handler.ptr($throwNilPointerError);
			this.memoized = new structType$7.ptr(new TextEditOptions.ptr(new Styles.ptr("", new Size.ptr("", 0, 0, 0, 0), new Size.ptr("", 0, 0, 0, 0), "", "", 0, 0, 0), "", ptrType$5.nil), $ifaceNil);
			return;
		}
		this.Cache = Cache_;
		this.finalizer = finalizer_;
		this.EltStruct = EltStruct_;
		this.initialized = initialized_;
		this.stateHandler = stateHandler_;
		this.memoized = memoized_;
	});
	TextEditOStruct = $pkg.TextEditOStruct = $newType(0, $kindStruct, "dom.TextEditOStruct", true, "github.com/dotchain/fuss/dom", true, function(old_, current_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.old = false;
			this.current = false;
			return;
		}
		this.old = old_;
		this.current = current_;
	});
	textViewCtx = $pkg.textViewCtx = $newType(0, $kindStruct, "dom.textViewCtx", true, "github.com/dotchain/fuss/dom", false, function(Cache_, finalizer_, EltStruct_, initialized_, stateHandler_, memoized_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Cache = new core.Cache.ptr(false, false);
			this.finalizer = $throwNilPointerError;
			this.EltStruct = new EltStruct.ptr(false, false);
			this.initialized = false;
			this.stateHandler = new core.Handler.ptr($throwNilPointerError);
			this.memoized = new structType$8.ptr($ifaceNil, new Styles.ptr("", new Size.ptr("", 0, 0, 0, 0), new Size.ptr("", 0, 0, 0, 0), "", "", 0, 0, 0), "");
			return;
		}
		this.Cache = Cache_;
		this.finalizer = finalizer_;
		this.EltStruct = EltStruct_;
		this.initialized = initialized_;
		this.stateHandler = stateHandler_;
		this.memoized = memoized_;
	});
	TextViewStruct = $pkg.TextViewStruct = $newType(0, $kindStruct, "dom.TextViewStruct", true, "github.com/dotchain/fuss/dom", true, function(old_, current_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.old = false;
			this.current = false;
			return;
		}
		this.old = old_;
		this.current = current_;
	});
	vrunCtx = $pkg.vrunCtx = $newType(0, $kindStruct, "dom.vrunCtx", true, "github.com/dotchain/fuss/dom", false, function(Cache_, finalizer_, EltStruct_, initialized_, stateHandler_, memoized_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Cache = new core.Cache.ptr(false, false);
			this.finalizer = $throwNilPointerError;
			this.EltStruct = new EltStruct.ptr(false, false);
			this.initialized = false;
			this.stateHandler = new core.Handler.ptr($throwNilPointerError);
			this.memoized = new structType$4.ptr(sliceType.nil, $ifaceNil, new Styles.ptr("", new Size.ptr("", 0, 0, 0, 0), new Size.ptr("", 0, 0, 0, 0), "", "", 0, 0, 0));
			return;
		}
		this.Cache = Cache_;
		this.finalizer = finalizer_;
		this.EltStruct = EltStruct_;
		this.initialized = initialized_;
		this.stateHandler = stateHandler_;
		this.memoized = memoized_;
	});
	VRunStruct = $pkg.VRunStruct = $newType(0, $kindStruct, "dom.VRunStruct", true, "github.com/dotchain/fuss/dom", true, function(old_, current_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.old = false;
			this.current = false;
			return;
		}
		this.old = old_;
		this.current = current_;
	});
	TextEditOptions = $pkg.TextEditOptions = $newType(0, $kindStruct, "dom.TextEditOptions", true, "github.com/dotchain/fuss/dom", true, function(Styles_, Placeholder_, Text_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Styles = new Styles.ptr("", new Size.ptr("", 0, 0, 0, 0), new Size.ptr("", 0, 0, 0, 0), "", "", 0, 0, 0);
			this.Placeholder = "";
			this.Text = ptrType$5.nil;
			return;
		}
		this.Styles = Styles_;
		this.Placeholder = Placeholder_;
		this.Text = Text_;
	});
	ptrType = $ptrType(EventHandler);
	sliceType = $sliceType(Element);
	arrayType = $arrayType($String, 2);
	sliceType$1 = $sliceType(arrayType);
	ptrType$1 = $ptrType(nodeStream);
	ptrType$2 = $ptrType(core.Notifier);
	ptrType$3 = $ptrType(core.Handler);
	sliceType$2 = $sliceType(ptrType$3);
	sliceType$3 = $sliceType(diff);
	ptrType$4 = $ptrType(BoolStream);
	ptrType$5 = $ptrType(TextStream);
	ptrType$6 = $ptrType(aCtx);
	structType = $structType("github.com/dotchain/fuss/dom", [{prop: "children", name: "children", embedded: false, exported: false, typ: sliceType, tag: ""}, {prop: "href", name: "href", embedded: false, exported: false, typ: $String, tag: ""}, {prop: "result1", name: "result1", embedded: false, exported: false, typ: Element, tag: ""}, {prop: "styles", name: "styles", embedded: false, exported: false, typ: Styles, tag: ""}]);
	ptrType$8 = $ptrType(cbEditCtx);
	structType$2 = $structType("github.com/dotchain/fuss/dom", [{prop: "checked", name: "checked", embedded: false, exported: false, typ: ptrType$4, tag: ""}, {prop: "id", name: "id", embedded: false, exported: false, typ: $String, tag: ""}, {prop: "result1", name: "result1", embedded: false, exported: false, typ: Element, tag: ""}, {prop: "styles", name: "styles", embedded: false, exported: false, typ: Styles, tag: ""}]);
	ptrType$9 = $ptrType(nodeCtx);
	structType$3 = $structType("github.com/dotchain/fuss/dom", [{prop: "children", name: "children", embedded: false, exported: false, typ: sliceType, tag: ""}, {prop: "lastState", name: "lastState", embedded: false, exported: false, typ: ptrType$1, tag: ""}, {prop: "props", name: "props", embedded: false, exported: false, typ: Props, tag: ""}, {prop: "result1", name: "result1", embedded: false, exported: false, typ: ptrType$1, tag: ""}, {prop: "result2", name: "result2", embedded: false, exported: false, typ: Element, tag: ""}]);
	ptrType$10 = $ptrType(fixedCtx);
	structType$4 = $structType("github.com/dotchain/fuss/dom", [{prop: "cells", name: "cells", embedded: false, exported: false, typ: sliceType, tag: ""}, {prop: "result1", name: "result1", embedded: false, exported: false, typ: Element, tag: ""}, {prop: "styles", name: "styles", embedded: false, exported: false, typ: Styles, tag: ""}]);
	ptrType$11 = $ptrType(labelViewCtx);
	structType$5 = $structType("github.com/dotchain/fuss/dom", [{prop: "inputID", name: "inputID", embedded: false, exported: false, typ: $String, tag: ""}, {prop: "result1", name: "result1", embedded: false, exported: false, typ: Element, tag: ""}, {prop: "styles", name: "styles", embedded: false, exported: false, typ: Styles, tag: ""}, {prop: "text", name: "text", embedded: false, exported: false, typ: $String, tag: ""}]);
	ptrType$12 = $ptrType(runCtx);
	ptrType$13 = $ptrType(stretchCtx);
	ptrType$14 = $ptrType(textEditCtx);
	structType$6 = $structType("github.com/dotchain/fuss/dom", [{prop: "result1", name: "result1", embedded: false, exported: false, typ: Element, tag: ""}, {prop: "styles", name: "styles", embedded: false, exported: false, typ: Styles, tag: ""}, {prop: "text", name: "text", embedded: false, exported: false, typ: ptrType$5, tag: ""}]);
	ptrType$15 = $ptrType(textEditOCtx);
	structType$7 = $structType("github.com/dotchain/fuss/dom", [{prop: "opt", name: "opt", embedded: false, exported: false, typ: TextEditOptions, tag: ""}, {prop: "result1", name: "result1", embedded: false, exported: false, typ: Element, tag: ""}]);
	ptrType$16 = $ptrType(textViewCtx);
	structType$8 = $structType("github.com/dotchain/fuss/dom", [{prop: "result1", name: "result1", embedded: false, exported: false, typ: Element, tag: ""}, {prop: "styles", name: "styles", embedded: false, exported: false, typ: Styles, tag: ""}, {prop: "text", name: "text", embedded: false, exported: false, typ: $String, tag: ""}]);
	ptrType$17 = $ptrType(vrunCtx);
	mapType = $mapType($String, $emptyInterface);
	funcType = $funcType([Event], [], false);
	ptrType$18 = $ptrType(node);
	funcType$1 = $funcType([], [], false);
	ptrType$19 = $ptrType(AStruct);
	mapType$1 = $mapType($emptyInterface, ptrType$6);
	ptrType$21 = $ptrType(CheckboxEditStruct);
	mapType$3 = $mapType($emptyInterface, ptrType$8);
	ptrType$22 = $ptrType(EltStruct);
	mapType$4 = $mapType($emptyInterface, ptrType$9);
	ptrType$23 = $ptrType(FixedStruct);
	mapType$5 = $mapType($emptyInterface, ptrType$10);
	ptrType$24 = $ptrType(LabelViewStruct);
	mapType$6 = $mapType($emptyInterface, ptrType$11);
	ptrType$25 = $ptrType(RunStruct);
	mapType$7 = $mapType($emptyInterface, ptrType$12);
	ptrType$26 = $ptrType(StretchStruct);
	mapType$8 = $mapType($emptyInterface, ptrType$13);
	ptrType$27 = $ptrType(TextEditStruct);
	mapType$9 = $mapType($emptyInterface, ptrType$14);
	ptrType$28 = $ptrType(TextEditOStruct);
	mapType$10 = $mapType($emptyInterface, ptrType$15);
	ptrType$29 = $ptrType(TextViewStruct);
	mapType$11 = $mapType($emptyInterface, ptrType$16);
	ptrType$30 = $ptrType(VRunStruct);
	mapType$12 = $mapType($emptyInterface, ptrType$17);
	A = function(c, styles, href, children) {
		var _r, c, children, href, styles, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; c = $f.c; children = $f.children; href = $f.href; styles = $f.styles; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_r = c.EltStruct.Elt(new $String("root"), new Props.ptr($clone(styles, Styles), "a", false, "", "", "", "", href, "", ptrType.nil, ptrType.nil), children); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: A }; } $f._r = _r; $f.c = c; $f.children = children; $f.href = href; $f.styles = styles; $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.A = A;
	checkboxEdit = function(c, styles, checked, id) {
		var _r, c, checked, id, result, styles, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; c = $f.c; checked = $f.checked; id = $f.id; result = $f.result; styles = $f.styles; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		checked = [checked];
		result = [result];
		result[0] = $ifaceNil;
		_r = c.EltStruct.Elt(new $String("root"), new Props.ptr($clone(styles, Styles), "input", checked[0].Value, "checkbox", "", id, "", "", "", new EventHandler.ptr((function(checked, result) { return function $b(param) {
			var _arg, _arg$1, _r, _r$1, param, $s, $r;
			/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _arg = $f._arg; _arg$1 = $f._arg$1; _r = $f._r; _r$1 = $f._r$1; param = $f.param; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
			_arg = $ifaceNil;
			_r = result[0].Value(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			_arg$1 = _r === "on";
			_r$1 = checked[0].Append(_arg, _arg$1, true); /* */ $s = 2; case 2: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
			checked[0] = _r$1;
			$s = -1; return;
			/* */ } return; } if ($f === undefined) { $f = { $blk: $b }; } $f._arg = _arg; $f._arg$1 = _arg$1; $f._r = _r; $f._r$1 = _r$1; $f.param = param; $f.$s = $s; $f.$r = $r; return $f;
		}; })(checked, result)), ptrType.nil), new sliceType([])); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		result[0] = _r;
		$s = -1; return result[0];
		/* */ } return; } if ($f === undefined) { $f = { $blk: checkboxEdit }; } $f._r = _r; $f.c = c; $f.checked = checked; $f.id = id; $f.result = result; $f.styles = styles; $f.$s = $s; $f.$r = $r; return $f;
	};
	NewElement = function(props, children) {
		var _r, children, props, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; children = $f.children; props = $f.props; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_r = driver.NewElement($clone(props, Props), children); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: NewElement }; } $f._r = _r; $f.children = children; $f.props = props; $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.NewElement = NewElement;
	Size.ptr.prototype.String = function() {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, f, s, suffix;
		s = this;
		f = 0;
		suffix = "";
		if (s.Percent > 0) {
			_tmp = s.Percent;
			_tmp$1 = "%";
			f = _tmp;
			suffix = _tmp$1;
		} else if (s.Pixels > 0) {
			_tmp$2 = s.Pixels;
			_tmp$3 = "px";
			f = _tmp$2;
			suffix = _tmp$3;
		} else if (s.Em > 0) {
			_tmp$4 = s.Em;
			_tmp$5 = "em";
			f = _tmp$4;
			suffix = _tmp$5;
		} else if (s.En > 0) {
			_tmp$6 = s.En;
			_tmp$7 = "en";
			f = _tmp$6;
			suffix = _tmp$7;
		}
		if (f === 0) {
			return s.Raw;
		}
		return strconv.FormatFloat((f), 102, -1, 32) + suffix;
	};
	Size.prototype.String = function() { return this.$val.String(); };
	Direction.prototype.String = function() {
		var _1, d;
		d = this.$val;
		_1 = d;
		if (_1 === (1)) {
			return "row";
		} else if (_1 === (2)) {
			return "column";
		} else if (_1 === (3)) {
			return "row-reverse";
		} else if (_1 === (4)) {
			return "column-reverse";
		}
		return "";
	};
	$ptrType(Direction).prototype.String = function() { return new Direction(this.$get()).String(); };
	Styles.ptr.prototype.String = function() {
		var _arg, _arg$1, _i, _r, _r$1, _ref, dir, entries, flex, pair, result, s, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _arg = $f._arg; _arg$1 = $f._arg$1; _i = $f._i; _r = $f._r; _r$1 = $f._r$1; _ref = $f._ref; dir = $f.dir; entries = $f.entries; flex = $f.flex; pair = $f.pair; result = $f.result; s = $f.s; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		s = this;
		entries = new sliceType$1([$toNativeArray($kindString, ["color", s.Color]), $toNativeArray($kindString, ["width", $clone(s.Width, Size).String()]), $toNativeArray($kindString, ["height", $clone(s.Height, Size).String()]), $toNativeArray($kindString, ["overflow-x", s.OverflowX]), $toNativeArray($kindString, ["overflow-y", s.OverflowY])]);
		dir = new Direction(s.FlexDirection).String();
		if (!(dir === "")) {
			entries = $appendSlice(entries, new sliceType$1([$toNativeArray($kindString, ["display", "flex"]), $toNativeArray($kindString, ["flex-direction", dir])]));
		}
		flex = (function(i) {
			var i;
			if (i < 0) {
				return "0";
			} else if ((i === 0)) {
				return "";
			} else {
				return strconv.FormatInt((new $Int64(0, i)), 10);
			}
		});
		_arg = entries;
		_r = flex(s.FlexGrow); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_r$1 = flex(s.FlexShrink); /* */ $s = 2; case 2: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		_arg$1 = new sliceType$1([$toNativeArray($kindString, ["flex-grow", _r]), $toNativeArray($kindString, ["flex-shrink", _r$1])]);
		entries = $appendSlice(_arg, _arg$1);
		result = "";
		_ref = entries;
		_i = 0;
		while (true) {
			if (!(_i < _ref.$length)) { break; }
			pair = $clone(((_i < 0 || _i >= _ref.$length) ? ($throwRuntimeError("index out of range"), undefined) : _ref.$array[_ref.$offset + _i]), arrayType);
			if (pair[1] === "") {
				_i++;
				continue;
			}
			if (!(result === "")) {
				result = result + ("; ");
			}
			result = result + (pair[0] + ": " + pair[1]);
			_i++;
		}
		$s = -1; return result;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Styles.ptr.prototype.String }; } $f._arg = _arg; $f._arg$1 = _arg$1; $f._i = _i; $f._r = _r; $f._r$1 = _r$1; $f._ref = _ref; $f.dir = dir; $f.entries = entries; $f.flex = flex; $f.pair = pair; $f.result = result; $f.s = s; $f.$s = $s; $f.$r = $r; return $f;
	};
	Styles.prototype.String = function() { return this.$val.String(); };
	Props.ptr.prototype.ToMap = function() {
		var p, x;
		p = this;
		return $makeMap($String.keyFor, [{ k: "ID", v: new $String(p.ID) }, { k: "For", v: new $String(p.For) }, { k: "Tag", v: new $String(p.Tag) }, { k: "Href", v: new $String(p.Href) }, { k: "Checked", v: new $Bool(p.Checked) }, { k: "Placeholder", v: new $String(p.Placeholder) }, { k: "Type", v: new $String(p.Type) }, { k: "TextContent", v: new $String(p.TextContent) }, { k: "Styles", v: (x = p.Styles, new x.constructor.elem(x)) }, { k: "OnChange", v: p.OnChange }, { k: "OnClick", v: p.OnClick }]);
	};
	Props.prototype.ToMap = function() { return this.$val.ToMap(); };
	RegisterDriver = function(d) {
		var _tmp, _tmp$1, d, old;
		old = $ifaceNil;
		_tmp = driver;
		_tmp$1 = d;
		old = _tmp;
		driver = _tmp$1;
		old = old;
		return old;
	};
	$pkg.RegisterDriver = RegisterDriver;
	nodeStream.ptr.prototype.Latest = function() {
		var n;
		n = this;
		return n;
	};
	nodeStream.prototype.Latest = function() { return this.$val.Latest(); };
	elt = function(c, lastState, props, children) {
		var _r, c, children, elt$1, lastState, props, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; c = $f.c; children = $f.children; elt$1 = $f.elt$1; lastState = $f.lastState; props = $f.props; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		if (lastState === ptrType$1.nil) {
			lastState = new nodeStream.ptr(new core.Notifier.ptr(sliceType$2.nil), new node.ptr($ifaceNil, new Props.ptr(new Styles.ptr("", new Size.ptr("", 0, 0, 0, 0), new Size.ptr("", 0, 0, 0, 0), "", "", 0, 0, 0), "", false, "", "", "", "", "", "", ptrType.nil, ptrType.nil)));
		}
		_r = lastState.node.reconcile($clone(props, Props), children); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		elt$1 = _r;
		c.finalizer = $methodVal(elt$1, "Close");
		$s = -1; return [lastState, elt$1];
		/* */ } return; } if ($f === undefined) { $f = { $blk: elt }; } $f._r = _r; $f.c = c; $f.children = children; $f.elt$1 = elt$1; $f.lastState = lastState; $f.props = props; $f.$s = $s; $f.$r = $r; return $f;
	};
	node.ptr.prototype.reconcile = function(props, children) {
		var _entry, _entry$1, _i, _keys, _r, _ref, _tmp, _tmp$1, after, before, children, e, k, props, v, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _entry = $f._entry; _entry$1 = $f._entry$1; _i = $f._i; _keys = $f._keys; _r = $f._r; _ref = $f._ref; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; after = $f.after; before = $f.before; children = $f.children; e = $f.e; k = $f.k; props = $f.props; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		e = this;
		children = e.filterNil(children);
		if (children.$length > 0) {
			props.TextContent = "";
		}
		/* */ if ($interfaceIsEqual(e.root, $ifaceNil)) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if ($interfaceIsEqual(e.root, $ifaceNil)) { */ case 1:
			_r = NewElement($clone(props, Props), children); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			e.root = _r;
			Props.copy(e.props, props);
			$s = -1; return e.root;
		/* } */ case 2:
		/* */ if (!($equal(e.props, props, Props))) { $s = 4; continue; }
		/* */ $s = 5; continue;
		/* if (!($equal(e.props, props, Props))) { */ case 4:
			_tmp = $clone(e.props, Props).ToMap();
			_tmp$1 = $clone(props, Props).ToMap();
			before = _tmp;
			after = _tmp$1;
			Props.copy(e.props, props);
			_ref = after;
			_i = 0;
			_keys = $keys(_ref);
			/* while (true) { */ case 6:
				/* if (!(_i < _keys.length)) { break; } */ if(!(_i < _keys.length)) { $s = 7; continue; }
				_entry = _ref[_keys[_i]];
				if (_entry === undefined) {
					_i++;
					/* continue; */ $s = 6; continue;
				}
				k = _entry.k;
				v = _entry.v;
				/* */ if (!($interfaceIsEqual((_entry$1 = before[$String.keyFor(k)], _entry$1 !== undefined ? _entry$1.v : $ifaceNil), v))) { $s = 8; continue; }
				/* */ $s = 9; continue;
				/* if (!($interfaceIsEqual((_entry$1 = before[$String.keyFor(k)], _entry$1 !== undefined ? _entry$1.v : $ifaceNil), v))) { */ case 8:
					$r = e.root.SetProp(k, v); /* */ $s = 10; case 10: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
				/* } */ case 9:
				_i++;
			/* } */ $s = 6; continue; case 7:
		/* } */ case 5:
		$r = e.updateChildren(children); /* */ $s = 11; case 11: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$s = -1; return e.root;
		/* */ } return; } if ($f === undefined) { $f = { $blk: node.ptr.prototype.reconcile }; } $f._entry = _entry; $f._entry$1 = _entry$1; $f._i = _i; $f._keys = _keys; $f._r = _r; $f._ref = _ref; $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f.after = after; $f.before = before; $f.children = children; $f.e = e; $f.k = k; $f.props = props; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
	};
	node.prototype.reconcile = function(props, children) { return this.$val.reconcile(props, children); };
	node.ptr.prototype.filterNil = function(children) {
		var _i, _ref, children, e, elt$1, result;
		e = this;
		result = $subslice(children, 0, 0);
		_ref = children;
		_i = 0;
		while (true) {
			if (!(_i < _ref.$length)) { break; }
			elt$1 = ((_i < 0 || _i >= _ref.$length) ? ($throwRuntimeError("index out of range"), undefined) : _ref.$array[_ref.$offset + _i]);
			if (!($interfaceIsEqual(elt$1, $ifaceNil))) {
				result = $append(result, elt$1);
			}
			_i++;
		}
		return result;
	};
	node.prototype.filterNil = function(children) { return this.$val.filterNil(children); };
	node.ptr.prototype.updateChildren = function(after) {
		var _i, _r, _r$1, _ref, after, e, op, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _i = $f._i; _r = $f._r; _r$1 = $f._r$1; _ref = $f._ref; after = $f.after; e = $f.e; op = $f.op; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		e = this;
		_r = e.root.Children(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_r$1 = e.bestDiff(_r, after, 0, sliceType$3.nil); /* */ $s = 2; case 2: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		_ref = _r$1;
		_i = 0;
		/* while (true) { */ case 3:
			/* if (!(_i < _ref.$length)) { break; } */ if(!(_i < _ref.$length)) { $s = 4; continue; }
			op = $clone(((_i < 0 || _i >= _ref.$length) ? ($throwRuntimeError("index out of range"), undefined) : _ref.$array[_ref.$offset + _i]), diff);
			/* */ if (op.insert) { $s = 5; continue; }
			/* */ $s = 6; continue;
			/* if (op.insert) { */ case 5:
				$r = e.root.InsertChild(op.index, op.elt); /* */ $s = 8; case 8: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
				$s = 7; continue;
			/* } else { */ case 6:
				$r = e.root.RemoveChild(op.index); /* */ $s = 9; case 9: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
			/* } */ case 7:
			_i++;
		/* } */ $s = 3; continue; case 4:
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: node.ptr.prototype.updateChildren }; } $f._i = _i; $f._r = _r; $f._r$1 = _r$1; $f._ref = _ref; $f.after = after; $f.e = e; $f.op = op; $f.$s = $s; $f.$r = $r; return $f;
	};
	node.prototype.updateChildren = function(after) { return this.$val.updateChildren(after); };
	node.ptr.prototype.bestDiff = function(before, after, offset, ops) {
		var _i, _i$1, _i$2, _ref, _ref$1, _ref$2, _tmp, _tmp$1, after, before, e, elt$1, found, item, offset, op, ops;
		e = this;
		while (true) {
			if (!(before.$length > 0 && after.$length > 0 && $interfaceIsEqual((0 >= before.$length ? ($throwRuntimeError("index out of range"), undefined) : before.$array[before.$offset + 0]), (0 >= after.$length ? ($throwRuntimeError("index out of range"), undefined) : after.$array[after.$offset + 0])))) { break; }
			offset = offset + (1) >> 0;
			_tmp = $subslice(before, 1);
			_tmp$1 = $subslice(after, 1);
			before = _tmp;
			after = _tmp$1;
		}
		if ((before.$length === 0)) {
			_ref = after;
			_i = 0;
			while (true) {
				if (!(_i < _ref.$length)) { break; }
				elt$1 = ((_i < 0 || _i >= _ref.$length) ? ($throwRuntimeError("index out of range"), undefined) : _ref.$array[_ref.$offset + _i]);
				ops = $append(ops, new diff.ptr(true, elt$1, offset));
				offset = offset + (1) >> 0;
				_i++;
			}
		} else if ((after.$length === 0)) {
			_ref$1 = before;
			_i$1 = 0;
			while (true) {
				if (!(_i$1 < _ref$1.$length)) { break; }
				item = ((_i$1 < 0 || _i$1 >= _ref$1.$length) ? ($throwRuntimeError("index out of range"), undefined) : _ref$1.$array[_ref$1.$offset + _i$1]);
				found = false;
				_ref$2 = ops;
				_i$2 = 0;
				while (true) {
					if (!(_i$2 < _ref$2.$length)) { break; }
					op = $clone(((_i$2 < 0 || _i$2 >= _ref$2.$length) ? ($throwRuntimeError("index out of range"), undefined) : _ref$2.$array[_ref$2.$offset + _i$2]), diff);
					found = found || $interfaceIsEqual(op.elt, item);
					_i$2++;
				}
				if (!found) {
					ops = $append(ops, new diff.ptr(false, $ifaceNil, offset));
				}
				_i$1++;
			}
		} else {
			ops = e.chooseDiff(before, after, offset, ops);
		}
		return ops;
	};
	node.prototype.bestDiff = function(before, after, offset, ops) { return this.$val.bestDiff(before, after, offset, ops); };
	node.ptr.prototype.chooseDiff = function(before, after, offset, ops) {
		var _i, _ref, after, before, choice1, choice2, e, index, kk, offset, op, ops;
		e = this;
		if (before.$length > 0 && ops.$length > 0) {
			_ref = ops;
			_i = 0;
			while (true) {
				if (!(_i < _ref.$length)) { break; }
				op = $clone(((_i < 0 || _i >= _ref.$length) ? ($throwRuntimeError("index out of range"), undefined) : _ref.$array[_ref.$offset + _i]), diff);
				if (op.insert && $interfaceIsEqual(op.elt, (0 >= before.$length ? ($throwRuntimeError("index out of range"), undefined) : before.$array[before.$offset + 0]))) {
					return e.bestDiff($subslice(before, 1), after, offset, ops);
				}
				_i++;
			}
		}
		choice1 = $append(ops, new diff.ptr(false, $ifaceNil, offset));
		choice1 = e.bestDiff($subslice(before, 1), after, offset, choice1);
		index = e.indexOf((0 >= before.$length ? ($throwRuntimeError("index out of range"), undefined) : before.$array[before.$offset + 0]), after);
		if (index === -1) {
			return choice1;
		}
		choice2 = $appendSlice((sliceType$3.nil), ops);
		kk = 0;
		while (true) {
			if (!(kk < (index + 1 >> 0))) { break; }
			choice2 = $append(choice2, new diff.ptr(true, ((kk < 0 || kk >= after.$length) ? ($throwRuntimeError("index out of range"), undefined) : after.$array[after.$offset + kk]), offset + kk >> 0));
			kk = kk + (1) >> 0;
		}
		choice2 = e.bestDiff(before, $subslice(after, (index + 1 >> 0)), (offset + index >> 0) + 1 >> 0, choice2);
		if (choice1.$length < choice2.$length) {
			return choice1;
		}
		return choice2;
	};
	node.prototype.chooseDiff = function(before, after, offset, ops) { return this.$val.chooseDiff(before, after, offset, ops); };
	node.ptr.prototype.indexOf = function(elt$1, elts) {
		var _i, _ref, e, elt$1, elt1, elts, kk;
		e = this;
		_ref = elts;
		_i = 0;
		while (true) {
			if (!(_i < _ref.$length)) { break; }
			kk = _i;
			elt1 = ((_i < 0 || _i >= _ref.$length) ? ($throwRuntimeError("index out of range"), undefined) : _ref.$array[_ref.$offset + _i]);
			if ($interfaceIsEqual(elt1, elt$1)) {
				return kk;
			}
			_i++;
		}
		return -1;
	};
	node.prototype.indexOf = function(elt$1, elts) { return this.$val.indexOf(elt$1, elts); };
	NewBoolStream = function(value) {
		var value;
		return new BoolStream.ptr(new core.Notifier.ptr(sliceType$2.nil), value, $ifaceNil, ptrType$4.nil);
	};
	$pkg.NewBoolStream = NewBoolStream;
	BoolStream.ptr.prototype.Latest = function() {
		var s;
		s = this;
		while (true) {
			if (!(!(s.Next === ptrType$4.nil))) { break; }
			s = s.Next;
		}
		return s;
	};
	BoolStream.prototype.Latest = function() { return this.$val.Latest(); };
	BoolStream.ptr.prototype.Append = function(c, value, isLocal) {
		var _r, _r$1, _r$2, _tmp, _tmp$1, _tmp$2, _tmp$3, _tuple, _tuple$1, after, afterChange, before, c, isLocal, result, s, v, value, x, x$1, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; _tmp$2 = $f._tmp$2; _tmp$3 = $f._tmp$3; _tuple = $f._tuple; _tuple$1 = $f._tuple$1; after = $f.after; afterChange = $f.afterChange; before = $f.before; c = $f.c; isLocal = $f.isLocal; result = $f.result; s = $f.s; v = $f.v; value = $f.value; x = $f.x; x$1 = $f.x$1; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		s = this;
		if ($interfaceIsEqual(c, $ifaceNil)) {
			c = (x = new changes.Replace.ptr(s.wrapValue(new $Bool(s.Value)), s.wrapValue(new $Bool(value))), new x.constructor.elem(x));
		}
		result = new BoolStream.ptr(s.Notifier, value, $ifaceNil, ptrType$4.nil);
		before = s;
		v = (x$1 = new changes.Atomic.ptr(new $Bool(value)), new x$1.constructor.elem(x$1));
		after = result;
		/* while (true) { */ case 1:
			/* if (!(!(before.Next === ptrType$4.nil))) { break; } */ if(!(!(before.Next === ptrType$4.nil))) { $s = 2; continue; }
			afterChange = $ifaceNil;
			/* */ if (isLocal) { $s = 3; continue; }
			/* */ $s = 4; continue;
			/* if (isLocal) { */ case 3:
				_r = before.Change.Merge(c); /* */ $s = 6; case 6: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
				_tuple = _r;
				c = _tuple[0];
				afterChange = _tuple[1];
				$s = 5; continue;
			/* } else { */ case 4:
				_r$1 = c.Merge(before.Change); /* */ $s = 7; case 7: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
				_tuple$1 = _r$1;
				afterChange = _tuple$1[0];
				c = _tuple$1[1];
			/* } */ case 5:
			if ($interfaceIsEqual(c, $ifaceNil)) {
				_tmp = afterChange;
				_tmp$1 = before.Next;
				after.Change = _tmp;
				after.Next = _tmp$1;
				$s = -1; return result;
			}
			/* */ if ($interfaceIsEqual(afterChange, $ifaceNil)) { $s = 8; continue; }
			/* */ $s = 9; continue;
			/* if ($interfaceIsEqual(afterChange, $ifaceNil)) { */ case 8:
				before = before.Next;
				/* continue; */ $s = 1; continue;
			/* } */ case 9:
			_r$2 = v.Apply($ifaceNil, afterChange); /* */ $s = 10; case 10: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
			v = _r$2;
			after.Change = afterChange;
			after.Next = new BoolStream.ptr(s.Notifier, s.unwrapValue(v), $ifaceNil, ptrType$4.nil);
			after = after.Next;
			before = before.Next;
		/* } */ $s = 1; continue; case 2:
		_tmp$2 = c;
		_tmp$3 = after;
		before.Change = _tmp$2;
		before.Next = _tmp$3;
		$r = s.Notifier.Notify(); /* */ $s = 11; case 11: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$s = -1; return result;
		/* */ } return; } if ($f === undefined) { $f = { $blk: BoolStream.ptr.prototype.Append }; } $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f._tmp$2 = _tmp$2; $f._tmp$3 = _tmp$3; $f._tuple = _tuple; $f._tuple$1 = _tuple$1; $f.after = after; $f.afterChange = afterChange; $f.before = before; $f.c = c; $f.isLocal = isLocal; $f.result = result; $f.s = s; $f.v = v; $f.value = value; $f.x = x; $f.x$1 = x$1; $f.$s = $s; $f.$r = $r; return $f;
	};
	BoolStream.prototype.Append = function(c, value, isLocal) { return this.$val.Append(c, value, isLocal); };
	BoolStream.ptr.prototype.wrapValue = function(i) {
		var _tuple, i, ok, s, x, x$1;
		s = this;
		_tuple = $assertType(i, changes.Value, true);
		x = _tuple[0];
		ok = _tuple[1];
		if (ok) {
			return x;
		}
		return (x$1 = new changes.Atomic.ptr(i), new x$1.constructor.elem(x$1));
	};
	BoolStream.prototype.wrapValue = function(i) { return this.$val.wrapValue(i); };
	BoolStream.ptr.prototype.unwrapValue = function(v) {
		var _tuple, ok, s, v, x;
		s = this;
		_tuple = $assertType($assertType(v, $emptyInterface), $Bool, true);
		x = _tuple[0];
		ok = _tuple[1];
		if (ok) {
			return x;
		}
		return $assertType($assertType(v, changes.Atomic).Value, $Bool);
	};
	BoolStream.prototype.unwrapValue = function(v) { return this.$val.unwrapValue(v); };
	NewTextStream = function(value) {
		var value;
		return new TextStream.ptr(new core.Notifier.ptr(sliceType$2.nil), value, $ifaceNil, ptrType$5.nil);
	};
	$pkg.NewTextStream = NewTextStream;
	TextStream.ptr.prototype.Latest = function() {
		var s;
		s = this;
		while (true) {
			if (!(!(s.Next === ptrType$5.nil))) { break; }
			s = s.Next;
		}
		return s;
	};
	TextStream.prototype.Latest = function() { return this.$val.Latest(); };
	TextStream.ptr.prototype.Append = function(c, value, isLocal) {
		var _r, _r$1, _r$2, _tmp, _tmp$1, _tmp$2, _tmp$3, _tuple, _tuple$1, after, afterChange, before, c, isLocal, result, s, v, value, x, x$1, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; _tmp$2 = $f._tmp$2; _tmp$3 = $f._tmp$3; _tuple = $f._tuple; _tuple$1 = $f._tuple$1; after = $f.after; afterChange = $f.afterChange; before = $f.before; c = $f.c; isLocal = $f.isLocal; result = $f.result; s = $f.s; v = $f.v; value = $f.value; x = $f.x; x$1 = $f.x$1; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		s = this;
		if ($interfaceIsEqual(c, $ifaceNil)) {
			c = (x = new changes.Replace.ptr(s.wrapValue(new $String(s.Value)), s.wrapValue(new $String(value))), new x.constructor.elem(x));
		}
		result = new TextStream.ptr(s.Notifier, value, $ifaceNil, ptrType$5.nil);
		before = s;
		v = (x$1 = new changes.Atomic.ptr(new $String(value)), new x$1.constructor.elem(x$1));
		after = result;
		/* while (true) { */ case 1:
			/* if (!(!(before.Next === ptrType$5.nil))) { break; } */ if(!(!(before.Next === ptrType$5.nil))) { $s = 2; continue; }
			afterChange = $ifaceNil;
			/* */ if (isLocal) { $s = 3; continue; }
			/* */ $s = 4; continue;
			/* if (isLocal) { */ case 3:
				_r = before.Change.Merge(c); /* */ $s = 6; case 6: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
				_tuple = _r;
				c = _tuple[0];
				afterChange = _tuple[1];
				$s = 5; continue;
			/* } else { */ case 4:
				_r$1 = c.Merge(before.Change); /* */ $s = 7; case 7: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
				_tuple$1 = _r$1;
				afterChange = _tuple$1[0];
				c = _tuple$1[1];
			/* } */ case 5:
			if ($interfaceIsEqual(c, $ifaceNil)) {
				_tmp = afterChange;
				_tmp$1 = before.Next;
				after.Change = _tmp;
				after.Next = _tmp$1;
				$s = -1; return result;
			}
			/* */ if ($interfaceIsEqual(afterChange, $ifaceNil)) { $s = 8; continue; }
			/* */ $s = 9; continue;
			/* if ($interfaceIsEqual(afterChange, $ifaceNil)) { */ case 8:
				before = before.Next;
				/* continue; */ $s = 1; continue;
			/* } */ case 9:
			_r$2 = v.Apply($ifaceNil, afterChange); /* */ $s = 10; case 10: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
			v = _r$2;
			after.Change = afterChange;
			after.Next = new TextStream.ptr(s.Notifier, s.unwrapValue(v), $ifaceNil, ptrType$5.nil);
			after = after.Next;
			before = before.Next;
		/* } */ $s = 1; continue; case 2:
		_tmp$2 = c;
		_tmp$3 = after;
		before.Change = _tmp$2;
		before.Next = _tmp$3;
		$r = s.Notifier.Notify(); /* */ $s = 11; case 11: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$s = -1; return result;
		/* */ } return; } if ($f === undefined) { $f = { $blk: TextStream.ptr.prototype.Append }; } $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f._tmp$2 = _tmp$2; $f._tmp$3 = _tmp$3; $f._tuple = _tuple; $f._tuple$1 = _tuple$1; $f.after = after; $f.afterChange = afterChange; $f.before = before; $f.c = c; $f.isLocal = isLocal; $f.result = result; $f.s = s; $f.v = v; $f.value = value; $f.x = x; $f.x$1 = x$1; $f.$s = $s; $f.$r = $r; return $f;
	};
	TextStream.prototype.Append = function(c, value, isLocal) { return this.$val.Append(c, value, isLocal); };
	TextStream.ptr.prototype.wrapValue = function(i) {
		var _tuple, i, ok, s, x, x$1;
		s = this;
		_tuple = $assertType(i, changes.Value, true);
		x = _tuple[0];
		ok = _tuple[1];
		if (ok) {
			return x;
		}
		return (x$1 = new changes.Atomic.ptr(i), new x$1.constructor.elem(x$1));
	};
	TextStream.prototype.wrapValue = function(i) { return this.$val.wrapValue(i); };
	TextStream.ptr.prototype.unwrapValue = function(v) {
		var _tuple, ok, s, v, x;
		s = this;
		_tuple = $assertType($assertType(v, $emptyInterface), $String, true);
		x = _tuple[0];
		ok = _tuple[1];
		if (ok) {
			return x;
		}
		return $assertType($assertType(v, changes.Atomic).Value, $String);
	};
	TextStream.prototype.unwrapValue = function(v) { return this.$val.unwrapValue(v); };
	aCtx.ptr.prototype.areArgsSame = function(styles, href, children) {
		var _i, _ref, c, children, childrenIdx, href, styles, x;
		c = this;
		if (!($equal(styles, c.memoized.styles, Styles))) {
			return false;
		}
		if (!(href === c.memoized.href)) {
			return false;
		}
		if (!((children.$length === c.memoized.children.$length))) {
			return false;
		}
		_ref = children;
		_i = 0;
		while (true) {
			if (!(_i < _ref.$length)) { break; }
			childrenIdx = _i;
			if (!($interfaceIsEqual(((childrenIdx < 0 || childrenIdx >= children.$length) ? ($throwRuntimeError("index out of range"), undefined) : children.$array[children.$offset + childrenIdx]), (x = c.memoized.children, ((childrenIdx < 0 || childrenIdx >= x.$length) ? ($throwRuntimeError("index out of range"), undefined) : x.$array[x.$offset + childrenIdx]))))) {
				return false;
			}
			_i++;
		}
		return true;
	};
	aCtx.prototype.areArgsSame = function(styles, href, children) { return this.$val.areArgsSame(styles, href, children); };
	aCtx.ptr.prototype.refreshIfNeeded = function(styles, href, children) {
		var _r, c, children, href, result1, styles, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; c = $f.c; children = $f.children; href = $f.href; result1 = $f.result1; styles = $f.styles; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		result1 = $ifaceNil;
		c = this;
		/* */ if (!c.initialized || !c.areArgsSame($clone(styles, Styles), href, children)) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (!c.initialized || !c.areArgsSame($clone(styles, Styles), href, children)) { */ case 1:
			_r = c.refresh($clone(styles, Styles), href, children); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			result1 = _r;
			$s = -1; return result1;
		/* } */ case 2:
		result1 = c.memoized.result1;
		$s = -1; return result1;
		/* */ } return; } if ($f === undefined) { $f = { $blk: aCtx.ptr.prototype.refreshIfNeeded }; } $f._r = _r; $f.c = c; $f.children = children; $f.href = href; $f.result1 = result1; $f.styles = styles; $f.$s = $s; $f.$r = $r; return $f;
	};
	aCtx.prototype.refreshIfNeeded = function(styles, href, children) { return this.$val.refreshIfNeeded(styles, href, children); };
	aCtx.ptr.prototype.refresh = function(styles, href, children) {
		var _r, _tmp, _tmp$1, _tmp$2, c, children, href, result1, styles, $s, $deferred, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; _tmp$2 = $f._tmp$2; c = $f.c; children = $f.children; href = $f.href; result1 = $f.result1; styles = $f.styles; $s = $f.$s; $deferred = $f.$deferred; $r = $f.$r; } var $err = null; try { s: while (true) { switch ($s) { case 0: $deferred = []; $deferred.index = $curGoroutine.deferStack.length; $curGoroutine.deferStack.push($deferred);
		c = [c];
		children = [children];
		href = [href];
		styles = [styles];
		result1 = $ifaceNil;
		c[0] = this;
		c[0].initialized = true;
		c[0].stateHandler.Handle = (function(c, children, href, styles) { return function $b() {
			var _r, $s, $r;
			/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
			_r = c[0].refresh($clone(styles[0], Styles), href[0], children[0]); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			_r;
			$s = -1; return;
			/* */ } return; } if ($f === undefined) { $f = { $blk: $b }; } $f._r = _r; $f.$s = $s; $f.$r = $r; return $f;
		}; })(c, children, href, styles);
		_tmp = $clone(styles[0], Styles);
		_tmp$1 = href[0];
		_tmp$2 = children[0];
		Styles.copy(c[0].memoized.styles, _tmp);
		c[0].memoized.href = _tmp$1;
		c[0].memoized.children = _tmp$2;
		c[0].Cache.Begin();
		$deferred.push([$methodVal(c[0].Cache, "End"), []]);
		c[0].EltStruct.Begin();
		$deferred.push([$methodVal(c[0].EltStruct, "End"), []]);
		_r = A(c[0], $clone(styles[0], Styles), href[0], children[0]); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		c[0].memoized.result1 = _r;
		result1 = c[0].memoized.result1;
		$s = -1; return result1;
		/* */ } return; } } catch(err) { $err = err; $s = -1; } finally { $callDeferred($deferred, $err); if (!$curGoroutine.asleep) { return  result1; } if($curGoroutine.asleep) { if ($f === undefined) { $f = { $blk: aCtx.ptr.prototype.refresh }; } $f._r = _r; $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f._tmp$2 = _tmp$2; $f.c = c; $f.children = children; $f.href = href; $f.result1 = result1; $f.styles = styles; $f.$s = $s; $f.$deferred = $deferred; $f.$r = $r; return $f; } }
	};
	aCtx.prototype.refresh = function(styles, href, children) { return this.$val.refresh(styles, href, children); };
	aCtx.ptr.prototype.close = function() {
		var c, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; c = $f.c; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		c = this;
		c.Cache.Begin();
		$r = c.Cache.End(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		c.EltStruct.Begin();
		$r = c.EltStruct.End(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* */ if (!(c.finalizer === $throwNilPointerError)) { $s = 3; continue; }
		/* */ $s = 4; continue;
		/* if (!(c.finalizer === $throwNilPointerError)) { */ case 3:
			$r = c.finalizer(); /* */ $s = 5; case 5: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* } */ case 4:
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: aCtx.ptr.prototype.close }; } $f.c = c; $f.$s = $s; $f.$r = $r; return $f;
	};
	aCtx.prototype.close = function() { return this.$val.close(); };
	AStruct.ptr.prototype.Begin = function() {
		var _tmp, _tmp$1, c;
		c = this;
		_tmp = c.current;
		_tmp$1 = $makeMap($emptyInterface.keyFor, []);
		c.old = _tmp;
		c.current = _tmp$1;
	};
	AStruct.prototype.Begin = function() { return this.$val.Begin(); };
	AStruct.ptr.prototype.End = function() {
		var _entry, _i, _keys, _ref, c, ctx, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _entry = $f._entry; _i = $f._i; _keys = $f._keys; _ref = $f._ref; c = $f.c; ctx = $f.ctx; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		c = this;
		_ref = c.old;
		_i = 0;
		_keys = $keys(_ref);
		/* while (true) { */ case 1:
			/* if (!(_i < _keys.length)) { break; } */ if(!(_i < _keys.length)) { $s = 2; continue; }
			_entry = _ref[_keys[_i]];
			if (_entry === undefined) {
				_i++;
				/* continue; */ $s = 1; continue;
			}
			ctx = _entry.v;
			$r = ctx.close(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
			_i++;
		/* } */ $s = 1; continue; case 2:
		c.old = false;
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: AStruct.ptr.prototype.End }; } $f._entry = _entry; $f._i = _i; $f._keys = _keys; $f._ref = _ref; $f.c = c; $f.ctx = ctx; $f.$s = $s; $f.$r = $r; return $f;
	};
	AStruct.prototype.End = function() { return this.$val.End(); };
	AStruct.ptr.prototype.A = function(cKey, styles, href, children) {
		var _entry, _key, _r, _tuple, c, cKey, cOld, children, href, ok, result1, styles, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _entry = $f._entry; _key = $f._key; _r = $f._r; _tuple = $f._tuple; c = $f.c; cKey = $f.cKey; cOld = $f.cOld; children = $f.children; href = $f.href; ok = $f.ok; result1 = $f.result1; styles = $f.styles; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		result1 = $ifaceNil;
		c = this;
		_tuple = (_entry = c.old[$emptyInterface.keyFor(cKey)], _entry !== undefined ? [_entry.v, true] : [ptrType$6.nil, false]);
		cOld = _tuple[0];
		ok = _tuple[1];
		if (ok) {
			delete c.old[$emptyInterface.keyFor(cKey)];
		} else {
			cOld = new aCtx.ptr(new core.Cache.ptr(false, false), $throwNilPointerError, new EltStruct.ptr(false, false), false, new core.Handler.ptr($throwNilPointerError), new structType.ptr(sliceType.nil, "", $ifaceNil, new Styles.ptr("", new Size.ptr("", 0, 0, 0, 0), new Size.ptr("", 0, 0, 0, 0), "", "", 0, 0, 0)));
		}
		_key = cKey; (c.current || $throwRuntimeError("assignment to entry in nil map"))[$emptyInterface.keyFor(_key)] = { k: _key, v: cOld };
		_r = cOld.refreshIfNeeded($clone(styles, Styles), href, children); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		result1 = _r;
		$s = -1; return result1;
		/* */ } return; } if ($f === undefined) { $f = { $blk: AStruct.ptr.prototype.A }; } $f._entry = _entry; $f._key = _key; $f._r = _r; $f._tuple = _tuple; $f.c = c; $f.cKey = cKey; $f.cOld = cOld; $f.children = children; $f.href = href; $f.ok = ok; $f.result1 = result1; $f.styles = styles; $f.$s = $s; $f.$r = $r; return $f;
	};
	AStruct.prototype.A = function(cKey, styles, href, children) { return this.$val.A(cKey, styles, href, children); };
	cbEditCtx.ptr.prototype.areArgsSame = function(styles, checked, id) {
		var c, checked, id, styles;
		c = this;
		if (!($equal(styles, c.memoized.styles, Styles))) {
			return false;
		}
		if (!(checked === c.memoized.checked)) {
			return false;
		}
		return id === c.memoized.id;
	};
	cbEditCtx.prototype.areArgsSame = function(styles, checked, id) { return this.$val.areArgsSame(styles, checked, id); };
	cbEditCtx.ptr.prototype.refreshIfNeeded = function(styles, checked, id) {
		var _r, c, checked, id, result1, styles, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; c = $f.c; checked = $f.checked; id = $f.id; result1 = $f.result1; styles = $f.styles; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		result1 = $ifaceNil;
		c = this;
		/* */ if (!c.initialized || !c.areArgsSame($clone(styles, Styles), checked, id)) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (!c.initialized || !c.areArgsSame($clone(styles, Styles), checked, id)) { */ case 1:
			_r = c.refresh($clone(styles, Styles), checked, id); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			result1 = _r;
			$s = -1; return result1;
		/* } */ case 2:
		result1 = c.memoized.result1;
		$s = -1; return result1;
		/* */ } return; } if ($f === undefined) { $f = { $blk: cbEditCtx.ptr.prototype.refreshIfNeeded }; } $f._r = _r; $f.c = c; $f.checked = checked; $f.id = id; $f.result1 = result1; $f.styles = styles; $f.$s = $s; $f.$r = $r; return $f;
	};
	cbEditCtx.prototype.refreshIfNeeded = function(styles, checked, id) { return this.$val.refreshIfNeeded(styles, checked, id); };
	cbEditCtx.ptr.prototype.refresh = function(styles, checked, id) {
		var _r, _tmp, _tmp$1, _tmp$2, c, checked, id, result1, styles, $s, $deferred, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; _tmp$2 = $f._tmp$2; c = $f.c; checked = $f.checked; id = $f.id; result1 = $f.result1; styles = $f.styles; $s = $f.$s; $deferred = $f.$deferred; $r = $f.$r; } var $err = null; try { s: while (true) { switch ($s) { case 0: $deferred = []; $deferred.index = $curGoroutine.deferStack.length; $curGoroutine.deferStack.push($deferred);
		c = [c];
		checked = [checked];
		id = [id];
		styles = [styles];
		result1 = $ifaceNil;
		c[0] = this;
		c[0].initialized = true;
		c[0].stateHandler.Handle = (function(c, checked, id, styles) { return function $b() {
			var _r, $s, $r;
			/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
			_r = c[0].refresh($clone(styles[0], Styles), checked[0], id[0]); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			_r;
			$s = -1; return;
			/* */ } return; } if ($f === undefined) { $f = { $blk: $b }; } $f._r = _r; $f.$s = $s; $f.$r = $r; return $f;
		}; })(c, checked, id, styles);
		_tmp = $clone(styles[0], Styles);
		_tmp$1 = checked[0];
		_tmp$2 = id[0];
		Styles.copy(c[0].memoized.styles, _tmp);
		c[0].memoized.checked = _tmp$1;
		c[0].memoized.id = _tmp$2;
		c[0].Cache.Begin();
		$deferred.push([$methodVal(c[0].Cache, "End"), []]);
		c[0].EltStruct.Begin();
		$deferred.push([$methodVal(c[0].EltStruct, "End"), []]);
		_r = checkboxEdit(c[0], $clone(styles[0], Styles), checked[0], id[0]); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		c[0].memoized.result1 = _r;
		result1 = c[0].memoized.result1;
		$s = -1; return result1;
		/* */ } return; } } catch(err) { $err = err; $s = -1; } finally { $callDeferred($deferred, $err); if (!$curGoroutine.asleep) { return  result1; } if($curGoroutine.asleep) { if ($f === undefined) { $f = { $blk: cbEditCtx.ptr.prototype.refresh }; } $f._r = _r; $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f._tmp$2 = _tmp$2; $f.c = c; $f.checked = checked; $f.id = id; $f.result1 = result1; $f.styles = styles; $f.$s = $s; $f.$deferred = $deferred; $f.$r = $r; return $f; } }
	};
	cbEditCtx.prototype.refresh = function(styles, checked, id) { return this.$val.refresh(styles, checked, id); };
	cbEditCtx.ptr.prototype.close = function() {
		var c, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; c = $f.c; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		c = this;
		c.Cache.Begin();
		$r = c.Cache.End(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		c.EltStruct.Begin();
		$r = c.EltStruct.End(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* */ if (!(c.finalizer === $throwNilPointerError)) { $s = 3; continue; }
		/* */ $s = 4; continue;
		/* if (!(c.finalizer === $throwNilPointerError)) { */ case 3:
			$r = c.finalizer(); /* */ $s = 5; case 5: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* } */ case 4:
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: cbEditCtx.ptr.prototype.close }; } $f.c = c; $f.$s = $s; $f.$r = $r; return $f;
	};
	cbEditCtx.prototype.close = function() { return this.$val.close(); };
	CheckboxEditStruct.ptr.prototype.Begin = function() {
		var _tmp, _tmp$1, c;
		c = this;
		_tmp = c.current;
		_tmp$1 = $makeMap($emptyInterface.keyFor, []);
		c.old = _tmp;
		c.current = _tmp$1;
	};
	CheckboxEditStruct.prototype.Begin = function() { return this.$val.Begin(); };
	CheckboxEditStruct.ptr.prototype.End = function() {
		var _entry, _i, _keys, _ref, c, ctx, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _entry = $f._entry; _i = $f._i; _keys = $f._keys; _ref = $f._ref; c = $f.c; ctx = $f.ctx; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		c = this;
		_ref = c.old;
		_i = 0;
		_keys = $keys(_ref);
		/* while (true) { */ case 1:
			/* if (!(_i < _keys.length)) { break; } */ if(!(_i < _keys.length)) { $s = 2; continue; }
			_entry = _ref[_keys[_i]];
			if (_entry === undefined) {
				_i++;
				/* continue; */ $s = 1; continue;
			}
			ctx = _entry.v;
			$r = ctx.close(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
			_i++;
		/* } */ $s = 1; continue; case 2:
		c.old = false;
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: CheckboxEditStruct.ptr.prototype.End }; } $f._entry = _entry; $f._i = _i; $f._keys = _keys; $f._ref = _ref; $f.c = c; $f.ctx = ctx; $f.$s = $s; $f.$r = $r; return $f;
	};
	CheckboxEditStruct.prototype.End = function() { return this.$val.End(); };
	CheckboxEditStruct.ptr.prototype.CheckboxEdit = function(cKey, styles, checked, id) {
		var _entry, _key, _r, _tuple, c, cKey, cOld, checked, id, ok, result1, styles, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _entry = $f._entry; _key = $f._key; _r = $f._r; _tuple = $f._tuple; c = $f.c; cKey = $f.cKey; cOld = $f.cOld; checked = $f.checked; id = $f.id; ok = $f.ok; result1 = $f.result1; styles = $f.styles; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		result1 = $ifaceNil;
		c = this;
		_tuple = (_entry = c.old[$emptyInterface.keyFor(cKey)], _entry !== undefined ? [_entry.v, true] : [ptrType$8.nil, false]);
		cOld = _tuple[0];
		ok = _tuple[1];
		if (ok) {
			delete c.old[$emptyInterface.keyFor(cKey)];
		} else {
			cOld = new cbEditCtx.ptr(new core.Cache.ptr(false, false), $throwNilPointerError, new EltStruct.ptr(false, false), false, new core.Handler.ptr($throwNilPointerError), new structType$2.ptr(ptrType$4.nil, "", $ifaceNil, new Styles.ptr("", new Size.ptr("", 0, 0, 0, 0), new Size.ptr("", 0, 0, 0, 0), "", "", 0, 0, 0)));
		}
		_key = cKey; (c.current || $throwRuntimeError("assignment to entry in nil map"))[$emptyInterface.keyFor(_key)] = { k: _key, v: cOld };
		_r = cOld.refreshIfNeeded($clone(styles, Styles), checked, id); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		result1 = _r;
		$s = -1; return result1;
		/* */ } return; } if ($f === undefined) { $f = { $blk: CheckboxEditStruct.ptr.prototype.CheckboxEdit }; } $f._entry = _entry; $f._key = _key; $f._r = _r; $f._tuple = _tuple; $f.c = c; $f.cKey = cKey; $f.cOld = cOld; $f.checked = checked; $f.id = id; $f.ok = ok; $f.result1 = result1; $f.styles = styles; $f.$s = $s; $f.$r = $r; return $f;
	};
	CheckboxEditStruct.prototype.CheckboxEdit = function(cKey, styles, checked, id) { return this.$val.CheckboxEdit(cKey, styles, checked, id); };
	nodeCtx.ptr.prototype.areArgsSame = function(props, children) {
		var _i, _ref, c, children, childrenIdx, props, x;
		c = this;
		if (!($equal(props, c.memoized.props, Props))) {
			return false;
		}
		if (!((children.$length === c.memoized.children.$length))) {
			return false;
		}
		_ref = children;
		_i = 0;
		while (true) {
			if (!(_i < _ref.$length)) { break; }
			childrenIdx = _i;
			if (!($interfaceIsEqual(((childrenIdx < 0 || childrenIdx >= children.$length) ? ($throwRuntimeError("index out of range"), undefined) : children.$array[children.$offset + childrenIdx]), (x = c.memoized.children, ((childrenIdx < 0 || childrenIdx >= x.$length) ? ($throwRuntimeError("index out of range"), undefined) : x.$array[x.$offset + childrenIdx]))))) {
				return false;
			}
			_i++;
		}
		return true;
	};
	nodeCtx.prototype.areArgsSame = function(props, children) { return this.$val.areArgsSame(props, children); };
	nodeCtx.ptr.prototype.refreshIfNeeded = function(props, children) {
		var _r, c, children, props, result2, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; c = $f.c; children = $f.children; props = $f.props; result2 = $f.result2; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		result2 = $ifaceNil;
		c = this;
		/* */ if (!c.initialized || !c.areArgsSame($clone(props, Props), children)) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (!c.initialized || !c.areArgsSame($clone(props, Props), children)) { */ case 1:
			_r = c.refresh($clone(props, Props), children); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			result2 = _r;
			$s = -1; return result2;
		/* } */ case 2:
		result2 = c.memoized.result2;
		$s = -1; return result2;
		/* */ } return; } if ($f === undefined) { $f = { $blk: nodeCtx.ptr.prototype.refreshIfNeeded }; } $f._r = _r; $f.c = c; $f.children = children; $f.props = props; $f.result2 = result2; $f.$s = $s; $f.$r = $r; return $f;
	};
	nodeCtx.prototype.refreshIfNeeded = function(props, children) { return this.$val.refreshIfNeeded(props, children); };
	nodeCtx.ptr.prototype.refresh = function(props, children) {
		var _r, _tmp, _tmp$1, _tuple, c, children, props, result2, $s, $deferred, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; _tuple = $f._tuple; c = $f.c; children = $f.children; props = $f.props; result2 = $f.result2; $s = $f.$s; $deferred = $f.$deferred; $r = $f.$r; } var $err = null; try { s: while (true) { switch ($s) { case 0: $deferred = []; $deferred.index = $curGoroutine.deferStack.length; $curGoroutine.deferStack.push($deferred);
		c = [c];
		children = [children];
		props = [props];
		result2 = $ifaceNil;
		c[0] = this;
		c[0].initialized = true;
		c[0].stateHandler.Handle = (function(c, children, props) { return function $b() {
			var _r, $s, $r;
			/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
			_r = c[0].refresh($clone(props[0], Props), children[0]); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			_r;
			$s = -1; return;
			/* */ } return; } if ($f === undefined) { $f = { $blk: $b }; } $f._r = _r; $f.$s = $s; $f.$r = $r; return $f;
		}; })(c, children, props);
		if (!(c[0].memoized.lastState === ptrType$1.nil)) {
			c[0].memoized.lastState = c[0].memoized.lastState.Latest();
		}
		_tmp = $clone(props[0], Props);
		_tmp$1 = children[0];
		Props.copy(c[0].memoized.props, _tmp);
		c[0].memoized.children = _tmp$1;
		c[0].Cache.Begin();
		$deferred.push([$methodVal(c[0].Cache, "End"), []]);
		_r = elt(c[0], c[0].memoized.lastState, $clone(props[0], Props), children[0]); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_tuple = _r;
		c[0].memoized.result1 = _tuple[0];
		c[0].memoized.result2 = _tuple[1];
		if (!(c[0].memoized.lastState === c[0].memoized.result1)) {
			if (!(c[0].memoized.lastState === ptrType$1.nil)) {
				c[0].memoized.lastState.Notifier.Off(c[0].stateHandler);
			}
			if (!(c[0].memoized.result1 === ptrType$1.nil)) {
				c[0].memoized.result1.Notifier.On(c[0].stateHandler);
			}
			c[0].memoized.lastState = c[0].memoized.result1;
		}
		result2 = c[0].memoized.result2;
		$s = -1; return result2;
		/* */ } return; } } catch(err) { $err = err; $s = -1; } finally { $callDeferred($deferred, $err); if (!$curGoroutine.asleep) { return  result2; } if($curGoroutine.asleep) { if ($f === undefined) { $f = { $blk: nodeCtx.ptr.prototype.refresh }; } $f._r = _r; $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f._tuple = _tuple; $f.c = c; $f.children = children; $f.props = props; $f.result2 = result2; $f.$s = $s; $f.$deferred = $deferred; $f.$r = $r; return $f; } }
	};
	nodeCtx.prototype.refresh = function(props, children) { return this.$val.refresh(props, children); };
	nodeCtx.ptr.prototype.close = function() {
		var c, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; c = $f.c; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		c = this;
		c.Cache.Begin();
		$r = c.Cache.End(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		if (!(c.memoized.result1 === ptrType$1.nil)) {
			c.memoized.result1.Notifier.Off(c.stateHandler);
		}
		/* */ if (!(c.finalizer === $throwNilPointerError)) { $s = 2; continue; }
		/* */ $s = 3; continue;
		/* if (!(c.finalizer === $throwNilPointerError)) { */ case 2:
			$r = c.finalizer(); /* */ $s = 4; case 4: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* } */ case 3:
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: nodeCtx.ptr.prototype.close }; } $f.c = c; $f.$s = $s; $f.$r = $r; return $f;
	};
	nodeCtx.prototype.close = function() { return this.$val.close(); };
	EltStruct.ptr.prototype.Begin = function() {
		var _tmp, _tmp$1, c;
		c = this;
		_tmp = c.current;
		_tmp$1 = $makeMap($emptyInterface.keyFor, []);
		c.old = _tmp;
		c.current = _tmp$1;
	};
	EltStruct.prototype.Begin = function() { return this.$val.Begin(); };
	EltStruct.ptr.prototype.End = function() {
		var _entry, _i, _keys, _ref, c, ctx, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _entry = $f._entry; _i = $f._i; _keys = $f._keys; _ref = $f._ref; c = $f.c; ctx = $f.ctx; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		c = this;
		_ref = c.old;
		_i = 0;
		_keys = $keys(_ref);
		/* while (true) { */ case 1:
			/* if (!(_i < _keys.length)) { break; } */ if(!(_i < _keys.length)) { $s = 2; continue; }
			_entry = _ref[_keys[_i]];
			if (_entry === undefined) {
				_i++;
				/* continue; */ $s = 1; continue;
			}
			ctx = _entry.v;
			$r = ctx.close(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
			_i++;
		/* } */ $s = 1; continue; case 2:
		c.old = false;
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: EltStruct.ptr.prototype.End }; } $f._entry = _entry; $f._i = _i; $f._keys = _keys; $f._ref = _ref; $f.c = c; $f.ctx = ctx; $f.$s = $s; $f.$r = $r; return $f;
	};
	EltStruct.prototype.End = function() { return this.$val.End(); };
	EltStruct.ptr.prototype.Elt = function(cKey, props, children) {
		var _entry, _key, _r, _tuple, c, cKey, cOld, children, ok, props, result2, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _entry = $f._entry; _key = $f._key; _r = $f._r; _tuple = $f._tuple; c = $f.c; cKey = $f.cKey; cOld = $f.cOld; children = $f.children; ok = $f.ok; props = $f.props; result2 = $f.result2; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		result2 = $ifaceNil;
		c = this;
		_tuple = (_entry = c.old[$emptyInterface.keyFor(cKey)], _entry !== undefined ? [_entry.v, true] : [ptrType$9.nil, false]);
		cOld = _tuple[0];
		ok = _tuple[1];
		if (ok) {
			delete c.old[$emptyInterface.keyFor(cKey)];
		} else {
			cOld = new nodeCtx.ptr(new core.Cache.ptr(false, false), $throwNilPointerError, false, new core.Handler.ptr($throwNilPointerError), new structType$3.ptr(sliceType.nil, ptrType$1.nil, new Props.ptr(new Styles.ptr("", new Size.ptr("", 0, 0, 0, 0), new Size.ptr("", 0, 0, 0, 0), "", "", 0, 0, 0), "", false, "", "", "", "", "", "", ptrType.nil, ptrType.nil), ptrType$1.nil, $ifaceNil));
		}
		_key = cKey; (c.current || $throwRuntimeError("assignment to entry in nil map"))[$emptyInterface.keyFor(_key)] = { k: _key, v: cOld };
		_r = cOld.refreshIfNeeded($clone(props, Props), children); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		result2 = _r;
		$s = -1; return result2;
		/* */ } return; } if ($f === undefined) { $f = { $blk: EltStruct.ptr.prototype.Elt }; } $f._entry = _entry; $f._key = _key; $f._r = _r; $f._tuple = _tuple; $f.c = c; $f.cKey = cKey; $f.cOld = cOld; $f.children = children; $f.ok = ok; $f.props = props; $f.result2 = result2; $f.$s = $s; $f.$r = $r; return $f;
	};
	EltStruct.prototype.Elt = function(cKey, props, children) { return this.$val.Elt(cKey, props, children); };
	fixedCtx.ptr.prototype.areArgsSame = function(styles, cells) {
		var _i, _ref, c, cells, cellsIdx, styles, x;
		c = this;
		if (!($equal(styles, c.memoized.styles, Styles))) {
			return false;
		}
		if (!((cells.$length === c.memoized.cells.$length))) {
			return false;
		}
		_ref = cells;
		_i = 0;
		while (true) {
			if (!(_i < _ref.$length)) { break; }
			cellsIdx = _i;
			if (!($interfaceIsEqual(((cellsIdx < 0 || cellsIdx >= cells.$length) ? ($throwRuntimeError("index out of range"), undefined) : cells.$array[cells.$offset + cellsIdx]), (x = c.memoized.cells, ((cellsIdx < 0 || cellsIdx >= x.$length) ? ($throwRuntimeError("index out of range"), undefined) : x.$array[x.$offset + cellsIdx]))))) {
				return false;
			}
			_i++;
		}
		return true;
	};
	fixedCtx.prototype.areArgsSame = function(styles, cells) { return this.$val.areArgsSame(styles, cells); };
	fixedCtx.ptr.prototype.refreshIfNeeded = function(styles, cells) {
		var _r, c, cells, result1, styles, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; c = $f.c; cells = $f.cells; result1 = $f.result1; styles = $f.styles; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		result1 = $ifaceNil;
		c = this;
		/* */ if (!c.initialized || !c.areArgsSame($clone(styles, Styles), cells)) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (!c.initialized || !c.areArgsSame($clone(styles, Styles), cells)) { */ case 1:
			_r = c.refresh($clone(styles, Styles), cells); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			result1 = _r;
			$s = -1; return result1;
		/* } */ case 2:
		result1 = c.memoized.result1;
		$s = -1; return result1;
		/* */ } return; } if ($f === undefined) { $f = { $blk: fixedCtx.ptr.prototype.refreshIfNeeded }; } $f._r = _r; $f.c = c; $f.cells = cells; $f.result1 = result1; $f.styles = styles; $f.$s = $s; $f.$r = $r; return $f;
	};
	fixedCtx.prototype.refreshIfNeeded = function(styles, cells) { return this.$val.refreshIfNeeded(styles, cells); };
	fixedCtx.ptr.prototype.refresh = function(styles, cells) {
		var _r, _tmp, _tmp$1, c, cells, result1, styles, $s, $deferred, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; c = $f.c; cells = $f.cells; result1 = $f.result1; styles = $f.styles; $s = $f.$s; $deferred = $f.$deferred; $r = $f.$r; } var $err = null; try { s: while (true) { switch ($s) { case 0: $deferred = []; $deferred.index = $curGoroutine.deferStack.length; $curGoroutine.deferStack.push($deferred);
		c = [c];
		cells = [cells];
		styles = [styles];
		result1 = $ifaceNil;
		c[0] = this;
		c[0].initialized = true;
		c[0].stateHandler.Handle = (function(c, cells, styles) { return function $b() {
			var _r, $s, $r;
			/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
			_r = c[0].refresh($clone(styles[0], Styles), cells[0]); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			_r;
			$s = -1; return;
			/* */ } return; } if ($f === undefined) { $f = { $blk: $b }; } $f._r = _r; $f.$s = $s; $f.$r = $r; return $f;
		}; })(c, cells, styles);
		_tmp = $clone(styles[0], Styles);
		_tmp$1 = cells[0];
		Styles.copy(c[0].memoized.styles, _tmp);
		c[0].memoized.cells = _tmp$1;
		c[0].Cache.Begin();
		$deferred.push([$methodVal(c[0].Cache, "End"), []]);
		c[0].EltStruct.Begin();
		$deferred.push([$methodVal(c[0].EltStruct, "End"), []]);
		_r = fixed(c[0], $clone(styles[0], Styles), cells[0]); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		c[0].memoized.result1 = _r;
		result1 = c[0].memoized.result1;
		$s = -1; return result1;
		/* */ } return; } } catch(err) { $err = err; $s = -1; } finally { $callDeferred($deferred, $err); if (!$curGoroutine.asleep) { return  result1; } if($curGoroutine.asleep) { if ($f === undefined) { $f = { $blk: fixedCtx.ptr.prototype.refresh }; } $f._r = _r; $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f.c = c; $f.cells = cells; $f.result1 = result1; $f.styles = styles; $f.$s = $s; $f.$deferred = $deferred; $f.$r = $r; return $f; } }
	};
	fixedCtx.prototype.refresh = function(styles, cells) { return this.$val.refresh(styles, cells); };
	fixedCtx.ptr.prototype.close = function() {
		var c, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; c = $f.c; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		c = this;
		c.Cache.Begin();
		$r = c.Cache.End(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		c.EltStruct.Begin();
		$r = c.EltStruct.End(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* */ if (!(c.finalizer === $throwNilPointerError)) { $s = 3; continue; }
		/* */ $s = 4; continue;
		/* if (!(c.finalizer === $throwNilPointerError)) { */ case 3:
			$r = c.finalizer(); /* */ $s = 5; case 5: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* } */ case 4:
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: fixedCtx.ptr.prototype.close }; } $f.c = c; $f.$s = $s; $f.$r = $r; return $f;
	};
	fixedCtx.prototype.close = function() { return this.$val.close(); };
	FixedStruct.ptr.prototype.Begin = function() {
		var _tmp, _tmp$1, c;
		c = this;
		_tmp = c.current;
		_tmp$1 = $makeMap($emptyInterface.keyFor, []);
		c.old = _tmp;
		c.current = _tmp$1;
	};
	FixedStruct.prototype.Begin = function() { return this.$val.Begin(); };
	FixedStruct.ptr.prototype.End = function() {
		var _entry, _i, _keys, _ref, c, ctx, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _entry = $f._entry; _i = $f._i; _keys = $f._keys; _ref = $f._ref; c = $f.c; ctx = $f.ctx; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		c = this;
		_ref = c.old;
		_i = 0;
		_keys = $keys(_ref);
		/* while (true) { */ case 1:
			/* if (!(_i < _keys.length)) { break; } */ if(!(_i < _keys.length)) { $s = 2; continue; }
			_entry = _ref[_keys[_i]];
			if (_entry === undefined) {
				_i++;
				/* continue; */ $s = 1; continue;
			}
			ctx = _entry.v;
			$r = ctx.close(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
			_i++;
		/* } */ $s = 1; continue; case 2:
		c.old = false;
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: FixedStruct.ptr.prototype.End }; } $f._entry = _entry; $f._i = _i; $f._keys = _keys; $f._ref = _ref; $f.c = c; $f.ctx = ctx; $f.$s = $s; $f.$r = $r; return $f;
	};
	FixedStruct.prototype.End = function() { return this.$val.End(); };
	FixedStruct.ptr.prototype.Fixed = function(cKey, styles, cells) {
		var _entry, _key, _r, _tuple, c, cKey, cOld, cells, ok, result1, styles, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _entry = $f._entry; _key = $f._key; _r = $f._r; _tuple = $f._tuple; c = $f.c; cKey = $f.cKey; cOld = $f.cOld; cells = $f.cells; ok = $f.ok; result1 = $f.result1; styles = $f.styles; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		result1 = $ifaceNil;
		c = this;
		_tuple = (_entry = c.old[$emptyInterface.keyFor(cKey)], _entry !== undefined ? [_entry.v, true] : [ptrType$10.nil, false]);
		cOld = _tuple[0];
		ok = _tuple[1];
		if (ok) {
			delete c.old[$emptyInterface.keyFor(cKey)];
		} else {
			cOld = new fixedCtx.ptr(new core.Cache.ptr(false, false), $throwNilPointerError, new EltStruct.ptr(false, false), false, new core.Handler.ptr($throwNilPointerError), new structType$4.ptr(sliceType.nil, $ifaceNil, new Styles.ptr("", new Size.ptr("", 0, 0, 0, 0), new Size.ptr("", 0, 0, 0, 0), "", "", 0, 0, 0)));
		}
		_key = cKey; (c.current || $throwRuntimeError("assignment to entry in nil map"))[$emptyInterface.keyFor(_key)] = { k: _key, v: cOld };
		_r = cOld.refreshIfNeeded($clone(styles, Styles), cells); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		result1 = _r;
		$s = -1; return result1;
		/* */ } return; } if ($f === undefined) { $f = { $blk: FixedStruct.ptr.prototype.Fixed }; } $f._entry = _entry; $f._key = _key; $f._r = _r; $f._tuple = _tuple; $f.c = c; $f.cKey = cKey; $f.cOld = cOld; $f.cells = cells; $f.ok = ok; $f.result1 = result1; $f.styles = styles; $f.$s = $s; $f.$r = $r; return $f;
	};
	FixedStruct.prototype.Fixed = function(cKey, styles, cells) { return this.$val.Fixed(cKey, styles, cells); };
	labelViewCtx.ptr.prototype.areArgsSame = function(styles, text, inputID) {
		var c, inputID, styles, text;
		c = this;
		if (!($equal(styles, c.memoized.styles, Styles))) {
			return false;
		}
		if (!(text === c.memoized.text)) {
			return false;
		}
		return inputID === c.memoized.inputID;
	};
	labelViewCtx.prototype.areArgsSame = function(styles, text, inputID) { return this.$val.areArgsSame(styles, text, inputID); };
	labelViewCtx.ptr.prototype.refreshIfNeeded = function(styles, text, inputID) {
		var _r, c, inputID, result1, styles, text, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; c = $f.c; inputID = $f.inputID; result1 = $f.result1; styles = $f.styles; text = $f.text; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		result1 = $ifaceNil;
		c = this;
		/* */ if (!c.initialized || !c.areArgsSame($clone(styles, Styles), text, inputID)) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (!c.initialized || !c.areArgsSame($clone(styles, Styles), text, inputID)) { */ case 1:
			_r = c.refresh($clone(styles, Styles), text, inputID); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			result1 = _r;
			$s = -1; return result1;
		/* } */ case 2:
		result1 = c.memoized.result1;
		$s = -1; return result1;
		/* */ } return; } if ($f === undefined) { $f = { $blk: labelViewCtx.ptr.prototype.refreshIfNeeded }; } $f._r = _r; $f.c = c; $f.inputID = inputID; $f.result1 = result1; $f.styles = styles; $f.text = text; $f.$s = $s; $f.$r = $r; return $f;
	};
	labelViewCtx.prototype.refreshIfNeeded = function(styles, text, inputID) { return this.$val.refreshIfNeeded(styles, text, inputID); };
	labelViewCtx.ptr.prototype.refresh = function(styles, text, inputID) {
		var _r, _tmp, _tmp$1, _tmp$2, c, inputID, result1, styles, text, $s, $deferred, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; _tmp$2 = $f._tmp$2; c = $f.c; inputID = $f.inputID; result1 = $f.result1; styles = $f.styles; text = $f.text; $s = $f.$s; $deferred = $f.$deferred; $r = $f.$r; } var $err = null; try { s: while (true) { switch ($s) { case 0: $deferred = []; $deferred.index = $curGoroutine.deferStack.length; $curGoroutine.deferStack.push($deferred);
		c = [c];
		inputID = [inputID];
		styles = [styles];
		text = [text];
		result1 = $ifaceNil;
		c[0] = this;
		c[0].initialized = true;
		c[0].stateHandler.Handle = (function(c, inputID, styles, text) { return function $b() {
			var _r, $s, $r;
			/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
			_r = c[0].refresh($clone(styles[0], Styles), text[0], inputID[0]); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			_r;
			$s = -1; return;
			/* */ } return; } if ($f === undefined) { $f = { $blk: $b }; } $f._r = _r; $f.$s = $s; $f.$r = $r; return $f;
		}; })(c, inputID, styles, text);
		_tmp = $clone(styles[0], Styles);
		_tmp$1 = text[0];
		_tmp$2 = inputID[0];
		Styles.copy(c[0].memoized.styles, _tmp);
		c[0].memoized.text = _tmp$1;
		c[0].memoized.inputID = _tmp$2;
		c[0].Cache.Begin();
		$deferred.push([$methodVal(c[0].Cache, "End"), []]);
		c[0].EltStruct.Begin();
		$deferred.push([$methodVal(c[0].EltStruct, "End"), []]);
		_r = labelView(c[0], $clone(styles[0], Styles), text[0], inputID[0]); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		c[0].memoized.result1 = _r;
		result1 = c[0].memoized.result1;
		$s = -1; return result1;
		/* */ } return; } } catch(err) { $err = err; $s = -1; } finally { $callDeferred($deferred, $err); if (!$curGoroutine.asleep) { return  result1; } if($curGoroutine.asleep) { if ($f === undefined) { $f = { $blk: labelViewCtx.ptr.prototype.refresh }; } $f._r = _r; $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f._tmp$2 = _tmp$2; $f.c = c; $f.inputID = inputID; $f.result1 = result1; $f.styles = styles; $f.text = text; $f.$s = $s; $f.$deferred = $deferred; $f.$r = $r; return $f; } }
	};
	labelViewCtx.prototype.refresh = function(styles, text, inputID) { return this.$val.refresh(styles, text, inputID); };
	labelViewCtx.ptr.prototype.close = function() {
		var c, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; c = $f.c; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		c = this;
		c.Cache.Begin();
		$r = c.Cache.End(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		c.EltStruct.Begin();
		$r = c.EltStruct.End(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* */ if (!(c.finalizer === $throwNilPointerError)) { $s = 3; continue; }
		/* */ $s = 4; continue;
		/* if (!(c.finalizer === $throwNilPointerError)) { */ case 3:
			$r = c.finalizer(); /* */ $s = 5; case 5: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* } */ case 4:
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: labelViewCtx.ptr.prototype.close }; } $f.c = c; $f.$s = $s; $f.$r = $r; return $f;
	};
	labelViewCtx.prototype.close = function() { return this.$val.close(); };
	LabelViewStruct.ptr.prototype.Begin = function() {
		var _tmp, _tmp$1, c;
		c = this;
		_tmp = c.current;
		_tmp$1 = $makeMap($emptyInterface.keyFor, []);
		c.old = _tmp;
		c.current = _tmp$1;
	};
	LabelViewStruct.prototype.Begin = function() { return this.$val.Begin(); };
	LabelViewStruct.ptr.prototype.End = function() {
		var _entry, _i, _keys, _ref, c, ctx, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _entry = $f._entry; _i = $f._i; _keys = $f._keys; _ref = $f._ref; c = $f.c; ctx = $f.ctx; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		c = this;
		_ref = c.old;
		_i = 0;
		_keys = $keys(_ref);
		/* while (true) { */ case 1:
			/* if (!(_i < _keys.length)) { break; } */ if(!(_i < _keys.length)) { $s = 2; continue; }
			_entry = _ref[_keys[_i]];
			if (_entry === undefined) {
				_i++;
				/* continue; */ $s = 1; continue;
			}
			ctx = _entry.v;
			$r = ctx.close(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
			_i++;
		/* } */ $s = 1; continue; case 2:
		c.old = false;
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: LabelViewStruct.ptr.prototype.End }; } $f._entry = _entry; $f._i = _i; $f._keys = _keys; $f._ref = _ref; $f.c = c; $f.ctx = ctx; $f.$s = $s; $f.$r = $r; return $f;
	};
	LabelViewStruct.prototype.End = function() { return this.$val.End(); };
	LabelViewStruct.ptr.prototype.LabelView = function(cKey, styles, text, inputID) {
		var _entry, _key, _r, _tuple, c, cKey, cOld, inputID, ok, result1, styles, text, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _entry = $f._entry; _key = $f._key; _r = $f._r; _tuple = $f._tuple; c = $f.c; cKey = $f.cKey; cOld = $f.cOld; inputID = $f.inputID; ok = $f.ok; result1 = $f.result1; styles = $f.styles; text = $f.text; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		result1 = $ifaceNil;
		c = this;
		_tuple = (_entry = c.old[$emptyInterface.keyFor(cKey)], _entry !== undefined ? [_entry.v, true] : [ptrType$11.nil, false]);
		cOld = _tuple[0];
		ok = _tuple[1];
		if (ok) {
			delete c.old[$emptyInterface.keyFor(cKey)];
		} else {
			cOld = new labelViewCtx.ptr(new core.Cache.ptr(false, false), $throwNilPointerError, new EltStruct.ptr(false, false), false, new core.Handler.ptr($throwNilPointerError), new structType$5.ptr("", $ifaceNil, new Styles.ptr("", new Size.ptr("", 0, 0, 0, 0), new Size.ptr("", 0, 0, 0, 0), "", "", 0, 0, 0), ""));
		}
		_key = cKey; (c.current || $throwRuntimeError("assignment to entry in nil map"))[$emptyInterface.keyFor(_key)] = { k: _key, v: cOld };
		_r = cOld.refreshIfNeeded($clone(styles, Styles), text, inputID); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		result1 = _r;
		$s = -1; return result1;
		/* */ } return; } if ($f === undefined) { $f = { $blk: LabelViewStruct.ptr.prototype.LabelView }; } $f._entry = _entry; $f._key = _key; $f._r = _r; $f._tuple = _tuple; $f.c = c; $f.cKey = cKey; $f.cOld = cOld; $f.inputID = inputID; $f.ok = ok; $f.result1 = result1; $f.styles = styles; $f.text = text; $f.$s = $s; $f.$r = $r; return $f;
	};
	LabelViewStruct.prototype.LabelView = function(cKey, styles, text, inputID) { return this.$val.LabelView(cKey, styles, text, inputID); };
	runCtx.ptr.prototype.areArgsSame = function(styles, cells) {
		var _i, _ref, c, cells, cellsIdx, styles, x;
		c = this;
		if (!($equal(styles, c.memoized.styles, Styles))) {
			return false;
		}
		if (!((cells.$length === c.memoized.cells.$length))) {
			return false;
		}
		_ref = cells;
		_i = 0;
		while (true) {
			if (!(_i < _ref.$length)) { break; }
			cellsIdx = _i;
			if (!($interfaceIsEqual(((cellsIdx < 0 || cellsIdx >= cells.$length) ? ($throwRuntimeError("index out of range"), undefined) : cells.$array[cells.$offset + cellsIdx]), (x = c.memoized.cells, ((cellsIdx < 0 || cellsIdx >= x.$length) ? ($throwRuntimeError("index out of range"), undefined) : x.$array[x.$offset + cellsIdx]))))) {
				return false;
			}
			_i++;
		}
		return true;
	};
	runCtx.prototype.areArgsSame = function(styles, cells) { return this.$val.areArgsSame(styles, cells); };
	runCtx.ptr.prototype.refreshIfNeeded = function(styles, cells) {
		var _r, c, cells, result1, styles, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; c = $f.c; cells = $f.cells; result1 = $f.result1; styles = $f.styles; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		result1 = $ifaceNil;
		c = this;
		/* */ if (!c.initialized || !c.areArgsSame($clone(styles, Styles), cells)) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (!c.initialized || !c.areArgsSame($clone(styles, Styles), cells)) { */ case 1:
			_r = c.refresh($clone(styles, Styles), cells); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			result1 = _r;
			$s = -1; return result1;
		/* } */ case 2:
		result1 = c.memoized.result1;
		$s = -1; return result1;
		/* */ } return; } if ($f === undefined) { $f = { $blk: runCtx.ptr.prototype.refreshIfNeeded }; } $f._r = _r; $f.c = c; $f.cells = cells; $f.result1 = result1; $f.styles = styles; $f.$s = $s; $f.$r = $r; return $f;
	};
	runCtx.prototype.refreshIfNeeded = function(styles, cells) { return this.$val.refreshIfNeeded(styles, cells); };
	runCtx.ptr.prototype.refresh = function(styles, cells) {
		var _r, _tmp, _tmp$1, c, cells, result1, styles, $s, $deferred, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; c = $f.c; cells = $f.cells; result1 = $f.result1; styles = $f.styles; $s = $f.$s; $deferred = $f.$deferred; $r = $f.$r; } var $err = null; try { s: while (true) { switch ($s) { case 0: $deferred = []; $deferred.index = $curGoroutine.deferStack.length; $curGoroutine.deferStack.push($deferred);
		c = [c];
		cells = [cells];
		styles = [styles];
		result1 = $ifaceNil;
		c[0] = this;
		c[0].initialized = true;
		c[0].stateHandler.Handle = (function(c, cells, styles) { return function $b() {
			var _r, $s, $r;
			/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
			_r = c[0].refresh($clone(styles[0], Styles), cells[0]); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			_r;
			$s = -1; return;
			/* */ } return; } if ($f === undefined) { $f = { $blk: $b }; } $f._r = _r; $f.$s = $s; $f.$r = $r; return $f;
		}; })(c, cells, styles);
		_tmp = $clone(styles[0], Styles);
		_tmp$1 = cells[0];
		Styles.copy(c[0].memoized.styles, _tmp);
		c[0].memoized.cells = _tmp$1;
		c[0].Cache.Begin();
		$deferred.push([$methodVal(c[0].Cache, "End"), []]);
		c[0].EltStruct.Begin();
		$deferred.push([$methodVal(c[0].EltStruct, "End"), []]);
		_r = run(c[0], $clone(styles[0], Styles), cells[0]); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		c[0].memoized.result1 = _r;
		result1 = c[0].memoized.result1;
		$s = -1; return result1;
		/* */ } return; } } catch(err) { $err = err; $s = -1; } finally { $callDeferred($deferred, $err); if (!$curGoroutine.asleep) { return  result1; } if($curGoroutine.asleep) { if ($f === undefined) { $f = { $blk: runCtx.ptr.prototype.refresh }; } $f._r = _r; $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f.c = c; $f.cells = cells; $f.result1 = result1; $f.styles = styles; $f.$s = $s; $f.$deferred = $deferred; $f.$r = $r; return $f; } }
	};
	runCtx.prototype.refresh = function(styles, cells) { return this.$val.refresh(styles, cells); };
	runCtx.ptr.prototype.close = function() {
		var c, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; c = $f.c; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		c = this;
		c.Cache.Begin();
		$r = c.Cache.End(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		c.EltStruct.Begin();
		$r = c.EltStruct.End(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* */ if (!(c.finalizer === $throwNilPointerError)) { $s = 3; continue; }
		/* */ $s = 4; continue;
		/* if (!(c.finalizer === $throwNilPointerError)) { */ case 3:
			$r = c.finalizer(); /* */ $s = 5; case 5: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* } */ case 4:
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: runCtx.ptr.prototype.close }; } $f.c = c; $f.$s = $s; $f.$r = $r; return $f;
	};
	runCtx.prototype.close = function() { return this.$val.close(); };
	RunStruct.ptr.prototype.Begin = function() {
		var _tmp, _tmp$1, c;
		c = this;
		_tmp = c.current;
		_tmp$1 = $makeMap($emptyInterface.keyFor, []);
		c.old = _tmp;
		c.current = _tmp$1;
	};
	RunStruct.prototype.Begin = function() { return this.$val.Begin(); };
	RunStruct.ptr.prototype.End = function() {
		var _entry, _i, _keys, _ref, c, ctx, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _entry = $f._entry; _i = $f._i; _keys = $f._keys; _ref = $f._ref; c = $f.c; ctx = $f.ctx; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		c = this;
		_ref = c.old;
		_i = 0;
		_keys = $keys(_ref);
		/* while (true) { */ case 1:
			/* if (!(_i < _keys.length)) { break; } */ if(!(_i < _keys.length)) { $s = 2; continue; }
			_entry = _ref[_keys[_i]];
			if (_entry === undefined) {
				_i++;
				/* continue; */ $s = 1; continue;
			}
			ctx = _entry.v;
			$r = ctx.close(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
			_i++;
		/* } */ $s = 1; continue; case 2:
		c.old = false;
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: RunStruct.ptr.prototype.End }; } $f._entry = _entry; $f._i = _i; $f._keys = _keys; $f._ref = _ref; $f.c = c; $f.ctx = ctx; $f.$s = $s; $f.$r = $r; return $f;
	};
	RunStruct.prototype.End = function() { return this.$val.End(); };
	RunStruct.ptr.prototype.Run = function(cKey, styles, cells) {
		var _entry, _key, _r, _tuple, c, cKey, cOld, cells, ok, result1, styles, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _entry = $f._entry; _key = $f._key; _r = $f._r; _tuple = $f._tuple; c = $f.c; cKey = $f.cKey; cOld = $f.cOld; cells = $f.cells; ok = $f.ok; result1 = $f.result1; styles = $f.styles; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		result1 = $ifaceNil;
		c = this;
		_tuple = (_entry = c.old[$emptyInterface.keyFor(cKey)], _entry !== undefined ? [_entry.v, true] : [ptrType$12.nil, false]);
		cOld = _tuple[0];
		ok = _tuple[1];
		if (ok) {
			delete c.old[$emptyInterface.keyFor(cKey)];
		} else {
			cOld = new runCtx.ptr(new core.Cache.ptr(false, false), $throwNilPointerError, new EltStruct.ptr(false, false), false, new core.Handler.ptr($throwNilPointerError), new structType$4.ptr(sliceType.nil, $ifaceNil, new Styles.ptr("", new Size.ptr("", 0, 0, 0, 0), new Size.ptr("", 0, 0, 0, 0), "", "", 0, 0, 0)));
		}
		_key = cKey; (c.current || $throwRuntimeError("assignment to entry in nil map"))[$emptyInterface.keyFor(_key)] = { k: _key, v: cOld };
		_r = cOld.refreshIfNeeded($clone(styles, Styles), cells); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		result1 = _r;
		$s = -1; return result1;
		/* */ } return; } if ($f === undefined) { $f = { $blk: RunStruct.ptr.prototype.Run }; } $f._entry = _entry; $f._key = _key; $f._r = _r; $f._tuple = _tuple; $f.c = c; $f.cKey = cKey; $f.cOld = cOld; $f.cells = cells; $f.ok = ok; $f.result1 = result1; $f.styles = styles; $f.$s = $s; $f.$r = $r; return $f;
	};
	RunStruct.prototype.Run = function(cKey, styles, cells) { return this.$val.Run(cKey, styles, cells); };
	stretchCtx.ptr.prototype.areArgsSame = function(styles, cells) {
		var _i, _ref, c, cells, cellsIdx, styles, x;
		c = this;
		if (!($equal(styles, c.memoized.styles, Styles))) {
			return false;
		}
		if (!((cells.$length === c.memoized.cells.$length))) {
			return false;
		}
		_ref = cells;
		_i = 0;
		while (true) {
			if (!(_i < _ref.$length)) { break; }
			cellsIdx = _i;
			if (!($interfaceIsEqual(((cellsIdx < 0 || cellsIdx >= cells.$length) ? ($throwRuntimeError("index out of range"), undefined) : cells.$array[cells.$offset + cellsIdx]), (x = c.memoized.cells, ((cellsIdx < 0 || cellsIdx >= x.$length) ? ($throwRuntimeError("index out of range"), undefined) : x.$array[x.$offset + cellsIdx]))))) {
				return false;
			}
			_i++;
		}
		return true;
	};
	stretchCtx.prototype.areArgsSame = function(styles, cells) { return this.$val.areArgsSame(styles, cells); };
	stretchCtx.ptr.prototype.refreshIfNeeded = function(styles, cells) {
		var _r, c, cells, result1, styles, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; c = $f.c; cells = $f.cells; result1 = $f.result1; styles = $f.styles; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		result1 = $ifaceNil;
		c = this;
		/* */ if (!c.initialized || !c.areArgsSame($clone(styles, Styles), cells)) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (!c.initialized || !c.areArgsSame($clone(styles, Styles), cells)) { */ case 1:
			_r = c.refresh($clone(styles, Styles), cells); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			result1 = _r;
			$s = -1; return result1;
		/* } */ case 2:
		result1 = c.memoized.result1;
		$s = -1; return result1;
		/* */ } return; } if ($f === undefined) { $f = { $blk: stretchCtx.ptr.prototype.refreshIfNeeded }; } $f._r = _r; $f.c = c; $f.cells = cells; $f.result1 = result1; $f.styles = styles; $f.$s = $s; $f.$r = $r; return $f;
	};
	stretchCtx.prototype.refreshIfNeeded = function(styles, cells) { return this.$val.refreshIfNeeded(styles, cells); };
	stretchCtx.ptr.prototype.refresh = function(styles, cells) {
		var _r, _tmp, _tmp$1, c, cells, result1, styles, $s, $deferred, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; c = $f.c; cells = $f.cells; result1 = $f.result1; styles = $f.styles; $s = $f.$s; $deferred = $f.$deferred; $r = $f.$r; } var $err = null; try { s: while (true) { switch ($s) { case 0: $deferred = []; $deferred.index = $curGoroutine.deferStack.length; $curGoroutine.deferStack.push($deferred);
		c = [c];
		cells = [cells];
		styles = [styles];
		result1 = $ifaceNil;
		c[0] = this;
		c[0].initialized = true;
		c[0].stateHandler.Handle = (function(c, cells, styles) { return function $b() {
			var _r, $s, $r;
			/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
			_r = c[0].refresh($clone(styles[0], Styles), cells[0]); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			_r;
			$s = -1; return;
			/* */ } return; } if ($f === undefined) { $f = { $blk: $b }; } $f._r = _r; $f.$s = $s; $f.$r = $r; return $f;
		}; })(c, cells, styles);
		_tmp = $clone(styles[0], Styles);
		_tmp$1 = cells[0];
		Styles.copy(c[0].memoized.styles, _tmp);
		c[0].memoized.cells = _tmp$1;
		c[0].Cache.Begin();
		$deferred.push([$methodVal(c[0].Cache, "End"), []]);
		c[0].EltStruct.Begin();
		$deferred.push([$methodVal(c[0].EltStruct, "End"), []]);
		_r = stretch(c[0], $clone(styles[0], Styles), cells[0]); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		c[0].memoized.result1 = _r;
		result1 = c[0].memoized.result1;
		$s = -1; return result1;
		/* */ } return; } } catch(err) { $err = err; $s = -1; } finally { $callDeferred($deferred, $err); if (!$curGoroutine.asleep) { return  result1; } if($curGoroutine.asleep) { if ($f === undefined) { $f = { $blk: stretchCtx.ptr.prototype.refresh }; } $f._r = _r; $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f.c = c; $f.cells = cells; $f.result1 = result1; $f.styles = styles; $f.$s = $s; $f.$deferred = $deferred; $f.$r = $r; return $f; } }
	};
	stretchCtx.prototype.refresh = function(styles, cells) { return this.$val.refresh(styles, cells); };
	stretchCtx.ptr.prototype.close = function() {
		var c, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; c = $f.c; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		c = this;
		c.Cache.Begin();
		$r = c.Cache.End(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		c.EltStruct.Begin();
		$r = c.EltStruct.End(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* */ if (!(c.finalizer === $throwNilPointerError)) { $s = 3; continue; }
		/* */ $s = 4; continue;
		/* if (!(c.finalizer === $throwNilPointerError)) { */ case 3:
			$r = c.finalizer(); /* */ $s = 5; case 5: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* } */ case 4:
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: stretchCtx.ptr.prototype.close }; } $f.c = c; $f.$s = $s; $f.$r = $r; return $f;
	};
	stretchCtx.prototype.close = function() { return this.$val.close(); };
	StretchStruct.ptr.prototype.Begin = function() {
		var _tmp, _tmp$1, c;
		c = this;
		_tmp = c.current;
		_tmp$1 = $makeMap($emptyInterface.keyFor, []);
		c.old = _tmp;
		c.current = _tmp$1;
	};
	StretchStruct.prototype.Begin = function() { return this.$val.Begin(); };
	StretchStruct.ptr.prototype.End = function() {
		var _entry, _i, _keys, _ref, c, ctx, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _entry = $f._entry; _i = $f._i; _keys = $f._keys; _ref = $f._ref; c = $f.c; ctx = $f.ctx; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		c = this;
		_ref = c.old;
		_i = 0;
		_keys = $keys(_ref);
		/* while (true) { */ case 1:
			/* if (!(_i < _keys.length)) { break; } */ if(!(_i < _keys.length)) { $s = 2; continue; }
			_entry = _ref[_keys[_i]];
			if (_entry === undefined) {
				_i++;
				/* continue; */ $s = 1; continue;
			}
			ctx = _entry.v;
			$r = ctx.close(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
			_i++;
		/* } */ $s = 1; continue; case 2:
		c.old = false;
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: StretchStruct.ptr.prototype.End }; } $f._entry = _entry; $f._i = _i; $f._keys = _keys; $f._ref = _ref; $f.c = c; $f.ctx = ctx; $f.$s = $s; $f.$r = $r; return $f;
	};
	StretchStruct.prototype.End = function() { return this.$val.End(); };
	StretchStruct.ptr.prototype.Stretch = function(cKey, styles, cells) {
		var _entry, _key, _r, _tuple, c, cKey, cOld, cells, ok, result1, styles, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _entry = $f._entry; _key = $f._key; _r = $f._r; _tuple = $f._tuple; c = $f.c; cKey = $f.cKey; cOld = $f.cOld; cells = $f.cells; ok = $f.ok; result1 = $f.result1; styles = $f.styles; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		result1 = $ifaceNil;
		c = this;
		_tuple = (_entry = c.old[$emptyInterface.keyFor(cKey)], _entry !== undefined ? [_entry.v, true] : [ptrType$13.nil, false]);
		cOld = _tuple[0];
		ok = _tuple[1];
		if (ok) {
			delete c.old[$emptyInterface.keyFor(cKey)];
		} else {
			cOld = new stretchCtx.ptr(new core.Cache.ptr(false, false), $throwNilPointerError, new EltStruct.ptr(false, false), false, new core.Handler.ptr($throwNilPointerError), new structType$4.ptr(sliceType.nil, $ifaceNil, new Styles.ptr("", new Size.ptr("", 0, 0, 0, 0), new Size.ptr("", 0, 0, 0, 0), "", "", 0, 0, 0)));
		}
		_key = cKey; (c.current || $throwRuntimeError("assignment to entry in nil map"))[$emptyInterface.keyFor(_key)] = { k: _key, v: cOld };
		_r = cOld.refreshIfNeeded($clone(styles, Styles), cells); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		result1 = _r;
		$s = -1; return result1;
		/* */ } return; } if ($f === undefined) { $f = { $blk: StretchStruct.ptr.prototype.Stretch }; } $f._entry = _entry; $f._key = _key; $f._r = _r; $f._tuple = _tuple; $f.c = c; $f.cKey = cKey; $f.cOld = cOld; $f.cells = cells; $f.ok = ok; $f.result1 = result1; $f.styles = styles; $f.$s = $s; $f.$r = $r; return $f;
	};
	StretchStruct.prototype.Stretch = function(cKey, styles, cells) { return this.$val.Stretch(cKey, styles, cells); };
	textEditCtx.ptr.prototype.areArgsSame = function(styles, text) {
		var c, styles, text;
		c = this;
		if (!($equal(styles, c.memoized.styles, Styles))) {
			return false;
		}
		return text === c.memoized.text;
	};
	textEditCtx.prototype.areArgsSame = function(styles, text) { return this.$val.areArgsSame(styles, text); };
	textEditCtx.ptr.prototype.refreshIfNeeded = function(styles, text) {
		var _r, c, result1, styles, text, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; c = $f.c; result1 = $f.result1; styles = $f.styles; text = $f.text; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		result1 = $ifaceNil;
		c = this;
		/* */ if (!c.initialized || !c.areArgsSame($clone(styles, Styles), text)) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (!c.initialized || !c.areArgsSame($clone(styles, Styles), text)) { */ case 1:
			_r = c.refresh($clone(styles, Styles), text); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			result1 = _r;
			$s = -1; return result1;
		/* } */ case 2:
		result1 = c.memoized.result1;
		$s = -1; return result1;
		/* */ } return; } if ($f === undefined) { $f = { $blk: textEditCtx.ptr.prototype.refreshIfNeeded }; } $f._r = _r; $f.c = c; $f.result1 = result1; $f.styles = styles; $f.text = text; $f.$s = $s; $f.$r = $r; return $f;
	};
	textEditCtx.prototype.refreshIfNeeded = function(styles, text) { return this.$val.refreshIfNeeded(styles, text); };
	textEditCtx.ptr.prototype.refresh = function(styles, text) {
		var _r, _tmp, _tmp$1, c, result1, styles, text, $s, $deferred, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; c = $f.c; result1 = $f.result1; styles = $f.styles; text = $f.text; $s = $f.$s; $deferred = $f.$deferred; $r = $f.$r; } var $err = null; try { s: while (true) { switch ($s) { case 0: $deferred = []; $deferred.index = $curGoroutine.deferStack.length; $curGoroutine.deferStack.push($deferred);
		c = [c];
		styles = [styles];
		text = [text];
		result1 = $ifaceNil;
		c[0] = this;
		c[0].initialized = true;
		c[0].stateHandler.Handle = (function(c, styles, text) { return function $b() {
			var _r, $s, $r;
			/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
			_r = c[0].refresh($clone(styles[0], Styles), text[0]); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			_r;
			$s = -1; return;
			/* */ } return; } if ($f === undefined) { $f = { $blk: $b }; } $f._r = _r; $f.$s = $s; $f.$r = $r; return $f;
		}; })(c, styles, text);
		_tmp = $clone(styles[0], Styles);
		_tmp$1 = text[0];
		Styles.copy(c[0].memoized.styles, _tmp);
		c[0].memoized.text = _tmp$1;
		c[0].Cache.Begin();
		$deferred.push([$methodVal(c[0].Cache, "End"), []]);
		c[0].TextEditOStruct.Begin();
		$deferred.push([$methodVal(c[0].TextEditOStruct, "End"), []]);
		_r = textEdit(c[0], $clone(styles[0], Styles), text[0]); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		c[0].memoized.result1 = _r;
		result1 = c[0].memoized.result1;
		$s = -1; return result1;
		/* */ } return; } } catch(err) { $err = err; $s = -1; } finally { $callDeferred($deferred, $err); if (!$curGoroutine.asleep) { return  result1; } if($curGoroutine.asleep) { if ($f === undefined) { $f = { $blk: textEditCtx.ptr.prototype.refresh }; } $f._r = _r; $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f.c = c; $f.result1 = result1; $f.styles = styles; $f.text = text; $f.$s = $s; $f.$deferred = $deferred; $f.$r = $r; return $f; } }
	};
	textEditCtx.prototype.refresh = function(styles, text) { return this.$val.refresh(styles, text); };
	textEditCtx.ptr.prototype.close = function() {
		var c, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; c = $f.c; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		c = this;
		c.Cache.Begin();
		$r = c.Cache.End(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		c.TextEditOStruct.Begin();
		$r = c.TextEditOStruct.End(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* */ if (!(c.finalizer === $throwNilPointerError)) { $s = 3; continue; }
		/* */ $s = 4; continue;
		/* if (!(c.finalizer === $throwNilPointerError)) { */ case 3:
			$r = c.finalizer(); /* */ $s = 5; case 5: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* } */ case 4:
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: textEditCtx.ptr.prototype.close }; } $f.c = c; $f.$s = $s; $f.$r = $r; return $f;
	};
	textEditCtx.prototype.close = function() { return this.$val.close(); };
	TextEditStruct.ptr.prototype.Begin = function() {
		var _tmp, _tmp$1, c;
		c = this;
		_tmp = c.current;
		_tmp$1 = $makeMap($emptyInterface.keyFor, []);
		c.old = _tmp;
		c.current = _tmp$1;
	};
	TextEditStruct.prototype.Begin = function() { return this.$val.Begin(); };
	TextEditStruct.ptr.prototype.End = function() {
		var _entry, _i, _keys, _ref, c, ctx, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _entry = $f._entry; _i = $f._i; _keys = $f._keys; _ref = $f._ref; c = $f.c; ctx = $f.ctx; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		c = this;
		_ref = c.old;
		_i = 0;
		_keys = $keys(_ref);
		/* while (true) { */ case 1:
			/* if (!(_i < _keys.length)) { break; } */ if(!(_i < _keys.length)) { $s = 2; continue; }
			_entry = _ref[_keys[_i]];
			if (_entry === undefined) {
				_i++;
				/* continue; */ $s = 1; continue;
			}
			ctx = _entry.v;
			$r = ctx.close(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
			_i++;
		/* } */ $s = 1; continue; case 2:
		c.old = false;
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: TextEditStruct.ptr.prototype.End }; } $f._entry = _entry; $f._i = _i; $f._keys = _keys; $f._ref = _ref; $f.c = c; $f.ctx = ctx; $f.$s = $s; $f.$r = $r; return $f;
	};
	TextEditStruct.prototype.End = function() { return this.$val.End(); };
	TextEditStruct.ptr.prototype.TextEdit = function(cKey, styles, text) {
		var _entry, _key, _r, _tuple, c, cKey, cOld, ok, result1, styles, text, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _entry = $f._entry; _key = $f._key; _r = $f._r; _tuple = $f._tuple; c = $f.c; cKey = $f.cKey; cOld = $f.cOld; ok = $f.ok; result1 = $f.result1; styles = $f.styles; text = $f.text; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		result1 = $ifaceNil;
		c = this;
		_tuple = (_entry = c.old[$emptyInterface.keyFor(cKey)], _entry !== undefined ? [_entry.v, true] : [ptrType$14.nil, false]);
		cOld = _tuple[0];
		ok = _tuple[1];
		if (ok) {
			delete c.old[$emptyInterface.keyFor(cKey)];
		} else {
			cOld = new textEditCtx.ptr(new core.Cache.ptr(false, false), $throwNilPointerError, new TextEditOStruct.ptr(false, false), false, new core.Handler.ptr($throwNilPointerError), new structType$6.ptr($ifaceNil, new Styles.ptr("", new Size.ptr("", 0, 0, 0, 0), new Size.ptr("", 0, 0, 0, 0), "", "", 0, 0, 0), ptrType$5.nil));
		}
		_key = cKey; (c.current || $throwRuntimeError("assignment to entry in nil map"))[$emptyInterface.keyFor(_key)] = { k: _key, v: cOld };
		_r = cOld.refreshIfNeeded($clone(styles, Styles), text); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		result1 = _r;
		$s = -1; return result1;
		/* */ } return; } if ($f === undefined) { $f = { $blk: TextEditStruct.ptr.prototype.TextEdit }; } $f._entry = _entry; $f._key = _key; $f._r = _r; $f._tuple = _tuple; $f.c = c; $f.cKey = cKey; $f.cOld = cOld; $f.ok = ok; $f.result1 = result1; $f.styles = styles; $f.text = text; $f.$s = $s; $f.$r = $r; return $f;
	};
	TextEditStruct.prototype.TextEdit = function(cKey, styles, text) { return this.$val.TextEdit(cKey, styles, text); };
	textEditOCtx.ptr.prototype.areArgsSame = function(opt) {
		var c, opt;
		c = this;
		return $equal(opt, c.memoized.opt, TextEditOptions);
	};
	textEditOCtx.prototype.areArgsSame = function(opt) { return this.$val.areArgsSame(opt); };
	textEditOCtx.ptr.prototype.refreshIfNeeded = function(opt) {
		var _r, c, opt, result1, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; c = $f.c; opt = $f.opt; result1 = $f.result1; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		result1 = $ifaceNil;
		c = this;
		/* */ if (!c.initialized || !c.areArgsSame($clone(opt, TextEditOptions))) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (!c.initialized || !c.areArgsSame($clone(opt, TextEditOptions))) { */ case 1:
			_r = c.refresh($clone(opt, TextEditOptions)); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			result1 = _r;
			$s = -1; return result1;
		/* } */ case 2:
		result1 = c.memoized.result1;
		$s = -1; return result1;
		/* */ } return; } if ($f === undefined) { $f = { $blk: textEditOCtx.ptr.prototype.refreshIfNeeded }; } $f._r = _r; $f.c = c; $f.opt = opt; $f.result1 = result1; $f.$s = $s; $f.$r = $r; return $f;
	};
	textEditOCtx.prototype.refreshIfNeeded = function(opt) { return this.$val.refreshIfNeeded(opt); };
	textEditOCtx.ptr.prototype.refresh = function(opt) {
		var _r, c, opt, result1, $s, $deferred, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; c = $f.c; opt = $f.opt; result1 = $f.result1; $s = $f.$s; $deferred = $f.$deferred; $r = $f.$r; } var $err = null; try { s: while (true) { switch ($s) { case 0: $deferred = []; $deferred.index = $curGoroutine.deferStack.length; $curGoroutine.deferStack.push($deferred);
		c = [c];
		opt = [opt];
		result1 = $ifaceNil;
		c[0] = this;
		c[0].initialized = true;
		c[0].stateHandler.Handle = (function(c, opt) { return function $b() {
			var _r, $s, $r;
			/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
			_r = c[0].refresh($clone(opt[0], TextEditOptions)); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			_r;
			$s = -1; return;
			/* */ } return; } if ($f === undefined) { $f = { $blk: $b }; } $f._r = _r; $f.$s = $s; $f.$r = $r; return $f;
		}; })(c, opt);
		TextEditOptions.copy(c[0].memoized.opt, opt[0]);
		c[0].Cache.Begin();
		$deferred.push([$methodVal(c[0].Cache, "End"), []]);
		c[0].EltStruct.Begin();
		$deferred.push([$methodVal(c[0].EltStruct, "End"), []]);
		_r = textEditO(c[0], $clone(opt[0], TextEditOptions)); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		c[0].memoized.result1 = _r;
		result1 = c[0].memoized.result1;
		$s = -1; return result1;
		/* */ } return; } } catch(err) { $err = err; $s = -1; } finally { $callDeferred($deferred, $err); if (!$curGoroutine.asleep) { return  result1; } if($curGoroutine.asleep) { if ($f === undefined) { $f = { $blk: textEditOCtx.ptr.prototype.refresh }; } $f._r = _r; $f.c = c; $f.opt = opt; $f.result1 = result1; $f.$s = $s; $f.$deferred = $deferred; $f.$r = $r; return $f; } }
	};
	textEditOCtx.prototype.refresh = function(opt) { return this.$val.refresh(opt); };
	textEditOCtx.ptr.prototype.close = function() {
		var c, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; c = $f.c; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		c = this;
		c.Cache.Begin();
		$r = c.Cache.End(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		c.EltStruct.Begin();
		$r = c.EltStruct.End(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* */ if (!(c.finalizer === $throwNilPointerError)) { $s = 3; continue; }
		/* */ $s = 4; continue;
		/* if (!(c.finalizer === $throwNilPointerError)) { */ case 3:
			$r = c.finalizer(); /* */ $s = 5; case 5: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* } */ case 4:
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: textEditOCtx.ptr.prototype.close }; } $f.c = c; $f.$s = $s; $f.$r = $r; return $f;
	};
	textEditOCtx.prototype.close = function() { return this.$val.close(); };
	TextEditOStruct.ptr.prototype.Begin = function() {
		var _tmp, _tmp$1, c;
		c = this;
		_tmp = c.current;
		_tmp$1 = $makeMap($emptyInterface.keyFor, []);
		c.old = _tmp;
		c.current = _tmp$1;
	};
	TextEditOStruct.prototype.Begin = function() { return this.$val.Begin(); };
	TextEditOStruct.ptr.prototype.End = function() {
		var _entry, _i, _keys, _ref, c, ctx, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _entry = $f._entry; _i = $f._i; _keys = $f._keys; _ref = $f._ref; c = $f.c; ctx = $f.ctx; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		c = this;
		_ref = c.old;
		_i = 0;
		_keys = $keys(_ref);
		/* while (true) { */ case 1:
			/* if (!(_i < _keys.length)) { break; } */ if(!(_i < _keys.length)) { $s = 2; continue; }
			_entry = _ref[_keys[_i]];
			if (_entry === undefined) {
				_i++;
				/* continue; */ $s = 1; continue;
			}
			ctx = _entry.v;
			$r = ctx.close(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
			_i++;
		/* } */ $s = 1; continue; case 2:
		c.old = false;
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: TextEditOStruct.ptr.prototype.End }; } $f._entry = _entry; $f._i = _i; $f._keys = _keys; $f._ref = _ref; $f.c = c; $f.ctx = ctx; $f.$s = $s; $f.$r = $r; return $f;
	};
	TextEditOStruct.prototype.End = function() { return this.$val.End(); };
	TextEditOStruct.ptr.prototype.TextEditO = function(cKey, opt) {
		var _entry, _key, _r, _tuple, c, cKey, cOld, ok, opt, result1, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _entry = $f._entry; _key = $f._key; _r = $f._r; _tuple = $f._tuple; c = $f.c; cKey = $f.cKey; cOld = $f.cOld; ok = $f.ok; opt = $f.opt; result1 = $f.result1; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		result1 = $ifaceNil;
		c = this;
		_tuple = (_entry = c.old[$emptyInterface.keyFor(cKey)], _entry !== undefined ? [_entry.v, true] : [ptrType$15.nil, false]);
		cOld = _tuple[0];
		ok = _tuple[1];
		if (ok) {
			delete c.old[$emptyInterface.keyFor(cKey)];
		} else {
			cOld = new textEditOCtx.ptr(new core.Cache.ptr(false, false), $throwNilPointerError, new EltStruct.ptr(false, false), false, new core.Handler.ptr($throwNilPointerError), new structType$7.ptr(new TextEditOptions.ptr(new Styles.ptr("", new Size.ptr("", 0, 0, 0, 0), new Size.ptr("", 0, 0, 0, 0), "", "", 0, 0, 0), "", ptrType$5.nil), $ifaceNil));
		}
		_key = cKey; (c.current || $throwRuntimeError("assignment to entry in nil map"))[$emptyInterface.keyFor(_key)] = { k: _key, v: cOld };
		_r = cOld.refreshIfNeeded($clone(opt, TextEditOptions)); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		result1 = _r;
		$s = -1; return result1;
		/* */ } return; } if ($f === undefined) { $f = { $blk: TextEditOStruct.ptr.prototype.TextEditO }; } $f._entry = _entry; $f._key = _key; $f._r = _r; $f._tuple = _tuple; $f.c = c; $f.cKey = cKey; $f.cOld = cOld; $f.ok = ok; $f.opt = opt; $f.result1 = result1; $f.$s = $s; $f.$r = $r; return $f;
	};
	TextEditOStruct.prototype.TextEditO = function(cKey, opt) { return this.$val.TextEditO(cKey, opt); };
	textViewCtx.ptr.prototype.areArgsSame = function(styles, text) {
		var c, styles, text;
		c = this;
		if (!($equal(styles, c.memoized.styles, Styles))) {
			return false;
		}
		return text === c.memoized.text;
	};
	textViewCtx.prototype.areArgsSame = function(styles, text) { return this.$val.areArgsSame(styles, text); };
	textViewCtx.ptr.prototype.refreshIfNeeded = function(styles, text) {
		var _r, c, result1, styles, text, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; c = $f.c; result1 = $f.result1; styles = $f.styles; text = $f.text; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		result1 = $ifaceNil;
		c = this;
		/* */ if (!c.initialized || !c.areArgsSame($clone(styles, Styles), text)) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (!c.initialized || !c.areArgsSame($clone(styles, Styles), text)) { */ case 1:
			_r = c.refresh($clone(styles, Styles), text); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			result1 = _r;
			$s = -1; return result1;
		/* } */ case 2:
		result1 = c.memoized.result1;
		$s = -1; return result1;
		/* */ } return; } if ($f === undefined) { $f = { $blk: textViewCtx.ptr.prototype.refreshIfNeeded }; } $f._r = _r; $f.c = c; $f.result1 = result1; $f.styles = styles; $f.text = text; $f.$s = $s; $f.$r = $r; return $f;
	};
	textViewCtx.prototype.refreshIfNeeded = function(styles, text) { return this.$val.refreshIfNeeded(styles, text); };
	textViewCtx.ptr.prototype.refresh = function(styles, text) {
		var _r, _tmp, _tmp$1, c, result1, styles, text, $s, $deferred, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; c = $f.c; result1 = $f.result1; styles = $f.styles; text = $f.text; $s = $f.$s; $deferred = $f.$deferred; $r = $f.$r; } var $err = null; try { s: while (true) { switch ($s) { case 0: $deferred = []; $deferred.index = $curGoroutine.deferStack.length; $curGoroutine.deferStack.push($deferred);
		c = [c];
		styles = [styles];
		text = [text];
		result1 = $ifaceNil;
		c[0] = this;
		c[0].initialized = true;
		c[0].stateHandler.Handle = (function(c, styles, text) { return function $b() {
			var _r, $s, $r;
			/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
			_r = c[0].refresh($clone(styles[0], Styles), text[0]); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			_r;
			$s = -1; return;
			/* */ } return; } if ($f === undefined) { $f = { $blk: $b }; } $f._r = _r; $f.$s = $s; $f.$r = $r; return $f;
		}; })(c, styles, text);
		_tmp = $clone(styles[0], Styles);
		_tmp$1 = text[0];
		Styles.copy(c[0].memoized.styles, _tmp);
		c[0].memoized.text = _tmp$1;
		c[0].Cache.Begin();
		$deferred.push([$methodVal(c[0].Cache, "End"), []]);
		c[0].EltStruct.Begin();
		$deferred.push([$methodVal(c[0].EltStruct, "End"), []]);
		_r = textView(c[0], $clone(styles[0], Styles), text[0]); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		c[0].memoized.result1 = _r;
		result1 = c[0].memoized.result1;
		$s = -1; return result1;
		/* */ } return; } } catch(err) { $err = err; $s = -1; } finally { $callDeferred($deferred, $err); if (!$curGoroutine.asleep) { return  result1; } if($curGoroutine.asleep) { if ($f === undefined) { $f = { $blk: textViewCtx.ptr.prototype.refresh }; } $f._r = _r; $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f.c = c; $f.result1 = result1; $f.styles = styles; $f.text = text; $f.$s = $s; $f.$deferred = $deferred; $f.$r = $r; return $f; } }
	};
	textViewCtx.prototype.refresh = function(styles, text) { return this.$val.refresh(styles, text); };
	textViewCtx.ptr.prototype.close = function() {
		var c, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; c = $f.c; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		c = this;
		c.Cache.Begin();
		$r = c.Cache.End(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		c.EltStruct.Begin();
		$r = c.EltStruct.End(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* */ if (!(c.finalizer === $throwNilPointerError)) { $s = 3; continue; }
		/* */ $s = 4; continue;
		/* if (!(c.finalizer === $throwNilPointerError)) { */ case 3:
			$r = c.finalizer(); /* */ $s = 5; case 5: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* } */ case 4:
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: textViewCtx.ptr.prototype.close }; } $f.c = c; $f.$s = $s; $f.$r = $r; return $f;
	};
	textViewCtx.prototype.close = function() { return this.$val.close(); };
	TextViewStruct.ptr.prototype.Begin = function() {
		var _tmp, _tmp$1, c;
		c = this;
		_tmp = c.current;
		_tmp$1 = $makeMap($emptyInterface.keyFor, []);
		c.old = _tmp;
		c.current = _tmp$1;
	};
	TextViewStruct.prototype.Begin = function() { return this.$val.Begin(); };
	TextViewStruct.ptr.prototype.End = function() {
		var _entry, _i, _keys, _ref, c, ctx, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _entry = $f._entry; _i = $f._i; _keys = $f._keys; _ref = $f._ref; c = $f.c; ctx = $f.ctx; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		c = this;
		_ref = c.old;
		_i = 0;
		_keys = $keys(_ref);
		/* while (true) { */ case 1:
			/* if (!(_i < _keys.length)) { break; } */ if(!(_i < _keys.length)) { $s = 2; continue; }
			_entry = _ref[_keys[_i]];
			if (_entry === undefined) {
				_i++;
				/* continue; */ $s = 1; continue;
			}
			ctx = _entry.v;
			$r = ctx.close(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
			_i++;
		/* } */ $s = 1; continue; case 2:
		c.old = false;
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: TextViewStruct.ptr.prototype.End }; } $f._entry = _entry; $f._i = _i; $f._keys = _keys; $f._ref = _ref; $f.c = c; $f.ctx = ctx; $f.$s = $s; $f.$r = $r; return $f;
	};
	TextViewStruct.prototype.End = function() { return this.$val.End(); };
	TextViewStruct.ptr.prototype.TextView = function(cKey, styles, text) {
		var _entry, _key, _r, _tuple, c, cKey, cOld, ok, result1, styles, text, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _entry = $f._entry; _key = $f._key; _r = $f._r; _tuple = $f._tuple; c = $f.c; cKey = $f.cKey; cOld = $f.cOld; ok = $f.ok; result1 = $f.result1; styles = $f.styles; text = $f.text; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		result1 = $ifaceNil;
		c = this;
		_tuple = (_entry = c.old[$emptyInterface.keyFor(cKey)], _entry !== undefined ? [_entry.v, true] : [ptrType$16.nil, false]);
		cOld = _tuple[0];
		ok = _tuple[1];
		if (ok) {
			delete c.old[$emptyInterface.keyFor(cKey)];
		} else {
			cOld = new textViewCtx.ptr(new core.Cache.ptr(false, false), $throwNilPointerError, new EltStruct.ptr(false, false), false, new core.Handler.ptr($throwNilPointerError), new structType$8.ptr($ifaceNil, new Styles.ptr("", new Size.ptr("", 0, 0, 0, 0), new Size.ptr("", 0, 0, 0, 0), "", "", 0, 0, 0), ""));
		}
		_key = cKey; (c.current || $throwRuntimeError("assignment to entry in nil map"))[$emptyInterface.keyFor(_key)] = { k: _key, v: cOld };
		_r = cOld.refreshIfNeeded($clone(styles, Styles), text); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		result1 = _r;
		$s = -1; return result1;
		/* */ } return; } if ($f === undefined) { $f = { $blk: TextViewStruct.ptr.prototype.TextView }; } $f._entry = _entry; $f._key = _key; $f._r = _r; $f._tuple = _tuple; $f.c = c; $f.cKey = cKey; $f.cOld = cOld; $f.ok = ok; $f.result1 = result1; $f.styles = styles; $f.text = text; $f.$s = $s; $f.$r = $r; return $f;
	};
	TextViewStruct.prototype.TextView = function(cKey, styles, text) { return this.$val.TextView(cKey, styles, text); };
	vrunCtx.ptr.prototype.areArgsSame = function(styles, cells) {
		var _i, _ref, c, cells, cellsIdx, styles, x;
		c = this;
		if (!($equal(styles, c.memoized.styles, Styles))) {
			return false;
		}
		if (!((cells.$length === c.memoized.cells.$length))) {
			return false;
		}
		_ref = cells;
		_i = 0;
		while (true) {
			if (!(_i < _ref.$length)) { break; }
			cellsIdx = _i;
			if (!($interfaceIsEqual(((cellsIdx < 0 || cellsIdx >= cells.$length) ? ($throwRuntimeError("index out of range"), undefined) : cells.$array[cells.$offset + cellsIdx]), (x = c.memoized.cells, ((cellsIdx < 0 || cellsIdx >= x.$length) ? ($throwRuntimeError("index out of range"), undefined) : x.$array[x.$offset + cellsIdx]))))) {
				return false;
			}
			_i++;
		}
		return true;
	};
	vrunCtx.prototype.areArgsSame = function(styles, cells) { return this.$val.areArgsSame(styles, cells); };
	vrunCtx.ptr.prototype.refreshIfNeeded = function(styles, cells) {
		var _r, c, cells, result1, styles, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; c = $f.c; cells = $f.cells; result1 = $f.result1; styles = $f.styles; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		result1 = $ifaceNil;
		c = this;
		/* */ if (!c.initialized || !c.areArgsSame($clone(styles, Styles), cells)) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (!c.initialized || !c.areArgsSame($clone(styles, Styles), cells)) { */ case 1:
			_r = c.refresh($clone(styles, Styles), cells); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			result1 = _r;
			$s = -1; return result1;
		/* } */ case 2:
		result1 = c.memoized.result1;
		$s = -1; return result1;
		/* */ } return; } if ($f === undefined) { $f = { $blk: vrunCtx.ptr.prototype.refreshIfNeeded }; } $f._r = _r; $f.c = c; $f.cells = cells; $f.result1 = result1; $f.styles = styles; $f.$s = $s; $f.$r = $r; return $f;
	};
	vrunCtx.prototype.refreshIfNeeded = function(styles, cells) { return this.$val.refreshIfNeeded(styles, cells); };
	vrunCtx.ptr.prototype.refresh = function(styles, cells) {
		var _r, _tmp, _tmp$1, c, cells, result1, styles, $s, $deferred, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; c = $f.c; cells = $f.cells; result1 = $f.result1; styles = $f.styles; $s = $f.$s; $deferred = $f.$deferred; $r = $f.$r; } var $err = null; try { s: while (true) { switch ($s) { case 0: $deferred = []; $deferred.index = $curGoroutine.deferStack.length; $curGoroutine.deferStack.push($deferred);
		c = [c];
		cells = [cells];
		styles = [styles];
		result1 = $ifaceNil;
		c[0] = this;
		c[0].initialized = true;
		c[0].stateHandler.Handle = (function(c, cells, styles) { return function $b() {
			var _r, $s, $r;
			/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
			_r = c[0].refresh($clone(styles[0], Styles), cells[0]); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			_r;
			$s = -1; return;
			/* */ } return; } if ($f === undefined) { $f = { $blk: $b }; } $f._r = _r; $f.$s = $s; $f.$r = $r; return $f;
		}; })(c, cells, styles);
		_tmp = $clone(styles[0], Styles);
		_tmp$1 = cells[0];
		Styles.copy(c[0].memoized.styles, _tmp);
		c[0].memoized.cells = _tmp$1;
		c[0].Cache.Begin();
		$deferred.push([$methodVal(c[0].Cache, "End"), []]);
		c[0].EltStruct.Begin();
		$deferred.push([$methodVal(c[0].EltStruct, "End"), []]);
		_r = vrun(c[0], $clone(styles[0], Styles), cells[0]); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		c[0].memoized.result1 = _r;
		result1 = c[0].memoized.result1;
		$s = -1; return result1;
		/* */ } return; } } catch(err) { $err = err; $s = -1; } finally { $callDeferred($deferred, $err); if (!$curGoroutine.asleep) { return  result1; } if($curGoroutine.asleep) { if ($f === undefined) { $f = { $blk: vrunCtx.ptr.prototype.refresh }; } $f._r = _r; $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f.c = c; $f.cells = cells; $f.result1 = result1; $f.styles = styles; $f.$s = $s; $f.$deferred = $deferred; $f.$r = $r; return $f; } }
	};
	vrunCtx.prototype.refresh = function(styles, cells) { return this.$val.refresh(styles, cells); };
	vrunCtx.ptr.prototype.close = function() {
		var c, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; c = $f.c; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		c = this;
		c.Cache.Begin();
		$r = c.Cache.End(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		c.EltStruct.Begin();
		$r = c.EltStruct.End(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* */ if (!(c.finalizer === $throwNilPointerError)) { $s = 3; continue; }
		/* */ $s = 4; continue;
		/* if (!(c.finalizer === $throwNilPointerError)) { */ case 3:
			$r = c.finalizer(); /* */ $s = 5; case 5: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* } */ case 4:
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: vrunCtx.ptr.prototype.close }; } $f.c = c; $f.$s = $s; $f.$r = $r; return $f;
	};
	vrunCtx.prototype.close = function() { return this.$val.close(); };
	VRunStruct.ptr.prototype.Begin = function() {
		var _tmp, _tmp$1, c;
		c = this;
		_tmp = c.current;
		_tmp$1 = $makeMap($emptyInterface.keyFor, []);
		c.old = _tmp;
		c.current = _tmp$1;
	};
	VRunStruct.prototype.Begin = function() { return this.$val.Begin(); };
	VRunStruct.ptr.prototype.End = function() {
		var _entry, _i, _keys, _ref, c, ctx, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _entry = $f._entry; _i = $f._i; _keys = $f._keys; _ref = $f._ref; c = $f.c; ctx = $f.ctx; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		c = this;
		_ref = c.old;
		_i = 0;
		_keys = $keys(_ref);
		/* while (true) { */ case 1:
			/* if (!(_i < _keys.length)) { break; } */ if(!(_i < _keys.length)) { $s = 2; continue; }
			_entry = _ref[_keys[_i]];
			if (_entry === undefined) {
				_i++;
				/* continue; */ $s = 1; continue;
			}
			ctx = _entry.v;
			$r = ctx.close(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
			_i++;
		/* } */ $s = 1; continue; case 2:
		c.old = false;
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: VRunStruct.ptr.prototype.End }; } $f._entry = _entry; $f._i = _i; $f._keys = _keys; $f._ref = _ref; $f.c = c; $f.ctx = ctx; $f.$s = $s; $f.$r = $r; return $f;
	};
	VRunStruct.prototype.End = function() { return this.$val.End(); };
	VRunStruct.ptr.prototype.VRun = function(cKey, styles, cells) {
		var _entry, _key, _r, _tuple, c, cKey, cOld, cells, ok, result1, styles, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _entry = $f._entry; _key = $f._key; _r = $f._r; _tuple = $f._tuple; c = $f.c; cKey = $f.cKey; cOld = $f.cOld; cells = $f.cells; ok = $f.ok; result1 = $f.result1; styles = $f.styles; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		result1 = $ifaceNil;
		c = this;
		_tuple = (_entry = c.old[$emptyInterface.keyFor(cKey)], _entry !== undefined ? [_entry.v, true] : [ptrType$17.nil, false]);
		cOld = _tuple[0];
		ok = _tuple[1];
		if (ok) {
			delete c.old[$emptyInterface.keyFor(cKey)];
		} else {
			cOld = new vrunCtx.ptr(new core.Cache.ptr(false, false), $throwNilPointerError, new EltStruct.ptr(false, false), false, new core.Handler.ptr($throwNilPointerError), new structType$4.ptr(sliceType.nil, $ifaceNil, new Styles.ptr("", new Size.ptr("", 0, 0, 0, 0), new Size.ptr("", 0, 0, 0, 0), "", "", 0, 0, 0)));
		}
		_key = cKey; (c.current || $throwRuntimeError("assignment to entry in nil map"))[$emptyInterface.keyFor(_key)] = { k: _key, v: cOld };
		_r = cOld.refreshIfNeeded($clone(styles, Styles), cells); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		result1 = _r;
		$s = -1; return result1;
		/* */ } return; } if ($f === undefined) { $f = { $blk: VRunStruct.ptr.prototype.VRun }; } $f._entry = _entry; $f._key = _key; $f._r = _r; $f._tuple = _tuple; $f.c = c; $f.cKey = cKey; $f.cOld = cOld; $f.cells = cells; $f.ok = ok; $f.result1 = result1; $f.styles = styles; $f.$s = $s; $f.$r = $r; return $f;
	};
	VRunStruct.prototype.VRun = function(cKey, styles, cells) { return this.$val.VRun(cKey, styles, cells); };
	labelView = function(c, styles, text, inputID) {
		var _r, c, inputID, styles, text, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; c = $f.c; inputID = $f.inputID; styles = $f.styles; text = $f.text; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_r = c.EltStruct.Elt(new $String("root"), new Props.ptr($clone(styles, Styles), "label", false, "", text, "", inputID, "", "", ptrType.nil, ptrType.nil), new sliceType([])); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: labelView }; } $f._r = _r; $f.c = c; $f.inputID = inputID; $f.styles = styles; $f.text = text; $f.$s = $s; $f.$r = $r; return $f;
	};
	run = function(c, styles, cells) {
		var _r, c, cells, styles, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; c = $f.c; cells = $f.cells; styles = $f.styles; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		styles.FlexDirection = 1;
		_r = c.EltStruct.Elt(new $String("root"), new Props.ptr($clone(styles, Styles), "", false, "", "", "", "", "", "", ptrType.nil, ptrType.nil), cells); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: run }; } $f._r = _r; $f.c = c; $f.cells = cells; $f.styles = styles; $f.$s = $s; $f.$r = $r; return $f;
	};
	fixed = function(c, styles, cells) {
		var _r, c, cells, styles, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; c = $f.c; cells = $f.cells; styles = $f.styles; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		styles.FlexShrink = -1;
		_r = c.EltStruct.Elt(new $String("root"), new Props.ptr($clone(styles, Styles), "", false, "", "", "", "", "", "", ptrType.nil, ptrType.nil), cells); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: fixed }; } $f._r = _r; $f.c = c; $f.cells = cells; $f.styles = styles; $f.$s = $s; $f.$r = $r; return $f;
	};
	stretch = function(c, styles, cells) {
		var _r, c, cells, styles, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; c = $f.c; cells = $f.cells; styles = $f.styles; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		styles.FlexGrow = 1;
		_r = c.EltStruct.Elt(new $String("root"), new Props.ptr($clone(styles, Styles), "", false, "", "", "", "", "", "", ptrType.nil, ptrType.nil), cells); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: stretch }; } $f._r = _r; $f.c = c; $f.cells = cells; $f.styles = styles; $f.$s = $s; $f.$r = $r; return $f;
	};
	vrun = function(c, styles, cells) {
		var _r, c, cells, styles, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; c = $f.c; cells = $f.cells; styles = $f.styles; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		styles.FlexDirection = 2;
		_r = c.EltStruct.Elt(new $String("root"), new Props.ptr($clone(styles, Styles), "", false, "", "", "", "", "", "", ptrType.nil, ptrType.nil), cells); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: vrun }; } $f._r = _r; $f.c = c; $f.cells = cells; $f.styles = styles; $f.$s = $s; $f.$r = $r; return $f;
	};
	textView = function(c, styles, text) {
		var _r, c, styles, text, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; c = $f.c; styles = $f.styles; text = $f.text; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_r = c.EltStruct.Elt(new $String("root"), new Props.ptr($clone(styles, Styles), "span", false, "", text, "", "", "", "", ptrType.nil, ptrType.nil), new sliceType([])); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: textView }; } $f._r = _r; $f.c = c; $f.styles = styles; $f.text = text; $f.$s = $s; $f.$r = $r; return $f;
	};
	textEdit = function(c, styles, text) {
		var _r, c, styles, text, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; c = $f.c; styles = $f.styles; text = $f.text; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_r = c.TextEditOStruct.TextEditO(new $String("root"), new TextEditOptions.ptr($clone(styles, Styles), "", text)); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: textEdit }; } $f._r = _r; $f.c = c; $f.styles = styles; $f.text = text; $f.$s = $s; $f.$r = $r; return $f;
	};
	textEditO = function(c, opt) {
		var _r, c, opt, result, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; c = $f.c; opt = $f.opt; result = $f.result; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		opt = [opt];
		result = [result];
		result[0] = $ifaceNil;
		_r = c.EltStruct.Elt(new $String("root"), new Props.ptr($clone(opt[0].Styles, Styles), "input", false, "text", opt[0].Text.Value, "", "", "", opt[0].Placeholder, new EventHandler.ptr((function(opt, result) { return function $b(param) {
			var _arg, _arg$1, _r, _r$1, param, $s, $r;
			/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _arg = $f._arg; _arg$1 = $f._arg$1; _r = $f._r; _r$1 = $f._r$1; param = $f.param; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
			_arg = $ifaceNil;
			_r = result[0].Value(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			_arg$1 = _r;
			_r$1 = opt[0].Text.Append(_arg, _arg$1, true); /* */ $s = 2; case 2: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
			opt[0].Text = _r$1;
			$s = -1; return;
			/* */ } return; } if ($f === undefined) { $f = { $blk: $b }; } $f._arg = _arg; $f._arg$1 = _arg$1; $f._r = _r; $f._r$1 = _r$1; $f.param = param; $f.$s = $s; $f.$r = $r; return $f;
		}; })(opt, result)), ptrType.nil), new sliceType([])); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		result[0] = _r;
		$s = -1; return result[0];
		/* */ } return; } if ($f === undefined) { $f = { $blk: textEditO }; } $f._r = _r; $f.c = c; $f.opt = opt; $f.result = result; $f.$s = $s; $f.$r = $r; return $f;
	};
	Size.methods = [{prop: "String", name: "String", pkg: "", typ: $funcType([], [$String], false)}];
	Direction.methods = [{prop: "String", name: "String", pkg: "", typ: $funcType([], [$String], false)}];
	Styles.methods = [{prop: "String", name: "String", pkg: "", typ: $funcType([], [$String], false)}];
	Props.methods = [{prop: "ToMap", name: "ToMap", pkg: "", typ: $funcType([], [mapType], false)}];
	ptrType$1.methods = [{prop: "Latest", name: "Latest", pkg: "", typ: $funcType([], [ptrType$1], false)}];
	ptrType$18.methods = [{prop: "reconcile", name: "reconcile", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([Props, sliceType], [Element], false)}, {prop: "filterNil", name: "filterNil", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([sliceType], [sliceType], false)}, {prop: "updateChildren", name: "updateChildren", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([sliceType], [], false)}, {prop: "bestDiff", name: "bestDiff", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([sliceType, sliceType, $Int, sliceType$3], [sliceType$3], false)}, {prop: "chooseDiff", name: "chooseDiff", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([sliceType, sliceType, $Int, sliceType$3], [sliceType$3], false)}, {prop: "indexOf", name: "indexOf", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([Element, sliceType], [$Int], false)}];
	ptrType$4.methods = [{prop: "Latest", name: "Latest", pkg: "", typ: $funcType([], [ptrType$4], false)}, {prop: "Append", name: "Append", pkg: "", typ: $funcType([changes.Change, $Bool, $Bool], [ptrType$4], false)}, {prop: "wrapValue", name: "wrapValue", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([$emptyInterface], [changes.Value], false)}, {prop: "unwrapValue", name: "unwrapValue", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([changes.Value], [$Bool], false)}];
	ptrType$5.methods = [{prop: "Latest", name: "Latest", pkg: "", typ: $funcType([], [ptrType$5], false)}, {prop: "Append", name: "Append", pkg: "", typ: $funcType([changes.Change, $String, $Bool], [ptrType$5], false)}, {prop: "wrapValue", name: "wrapValue", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([$emptyInterface], [changes.Value], false)}, {prop: "unwrapValue", name: "unwrapValue", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([changes.Value], [$String], false)}];
	ptrType$6.methods = [{prop: "areArgsSame", name: "areArgsSame", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([Styles, $String, sliceType], [$Bool], false)}, {prop: "refreshIfNeeded", name: "refreshIfNeeded", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([Styles, $String, sliceType], [Element], false)}, {prop: "refresh", name: "refresh", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([Styles, $String, sliceType], [Element], false)}, {prop: "close", name: "close", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([], [], false)}];
	ptrType$19.methods = [{prop: "Begin", name: "Begin", pkg: "", typ: $funcType([], [], false)}, {prop: "End", name: "End", pkg: "", typ: $funcType([], [], false)}, {prop: "A", name: "A", pkg: "", typ: $funcType([$emptyInterface, Styles, $String, sliceType], [Element], true)}];
	ptrType$8.methods = [{prop: "areArgsSame", name: "areArgsSame", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([Styles, ptrType$4, $String], [$Bool], false)}, {prop: "refreshIfNeeded", name: "refreshIfNeeded", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([Styles, ptrType$4, $String], [Element], false)}, {prop: "refresh", name: "refresh", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([Styles, ptrType$4, $String], [Element], false)}, {prop: "close", name: "close", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([], [], false)}];
	ptrType$21.methods = [{prop: "Begin", name: "Begin", pkg: "", typ: $funcType([], [], false)}, {prop: "End", name: "End", pkg: "", typ: $funcType([], [], false)}, {prop: "CheckboxEdit", name: "CheckboxEdit", pkg: "", typ: $funcType([$emptyInterface, Styles, ptrType$4, $String], [Element], false)}];
	ptrType$9.methods = [{prop: "areArgsSame", name: "areArgsSame", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([Props, sliceType], [$Bool], false)}, {prop: "refreshIfNeeded", name: "refreshIfNeeded", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([Props, sliceType], [Element], false)}, {prop: "refresh", name: "refresh", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([Props, sliceType], [Element], false)}, {prop: "close", name: "close", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([], [], false)}];
	ptrType$22.methods = [{prop: "Begin", name: "Begin", pkg: "", typ: $funcType([], [], false)}, {prop: "End", name: "End", pkg: "", typ: $funcType([], [], false)}, {prop: "Elt", name: "Elt", pkg: "", typ: $funcType([$emptyInterface, Props, sliceType], [Element], true)}];
	ptrType$10.methods = [{prop: "areArgsSame", name: "areArgsSame", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([Styles, sliceType], [$Bool], false)}, {prop: "refreshIfNeeded", name: "refreshIfNeeded", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([Styles, sliceType], [Element], false)}, {prop: "refresh", name: "refresh", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([Styles, sliceType], [Element], false)}, {prop: "close", name: "close", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([], [], false)}];
	ptrType$23.methods = [{prop: "Begin", name: "Begin", pkg: "", typ: $funcType([], [], false)}, {prop: "End", name: "End", pkg: "", typ: $funcType([], [], false)}, {prop: "Fixed", name: "Fixed", pkg: "", typ: $funcType([$emptyInterface, Styles, sliceType], [Element], true)}];
	ptrType$11.methods = [{prop: "areArgsSame", name: "areArgsSame", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([Styles, $String, $String], [$Bool], false)}, {prop: "refreshIfNeeded", name: "refreshIfNeeded", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([Styles, $String, $String], [Element], false)}, {prop: "refresh", name: "refresh", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([Styles, $String, $String], [Element], false)}, {prop: "close", name: "close", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([], [], false)}];
	ptrType$24.methods = [{prop: "Begin", name: "Begin", pkg: "", typ: $funcType([], [], false)}, {prop: "End", name: "End", pkg: "", typ: $funcType([], [], false)}, {prop: "LabelView", name: "LabelView", pkg: "", typ: $funcType([$emptyInterface, Styles, $String, $String], [Element], false)}];
	ptrType$12.methods = [{prop: "areArgsSame", name: "areArgsSame", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([Styles, sliceType], [$Bool], false)}, {prop: "refreshIfNeeded", name: "refreshIfNeeded", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([Styles, sliceType], [Element], false)}, {prop: "refresh", name: "refresh", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([Styles, sliceType], [Element], false)}, {prop: "close", name: "close", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([], [], false)}];
	ptrType$25.methods = [{prop: "Begin", name: "Begin", pkg: "", typ: $funcType([], [], false)}, {prop: "End", name: "End", pkg: "", typ: $funcType([], [], false)}, {prop: "Run", name: "Run", pkg: "", typ: $funcType([$emptyInterface, Styles, sliceType], [Element], true)}];
	ptrType$13.methods = [{prop: "areArgsSame", name: "areArgsSame", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([Styles, sliceType], [$Bool], false)}, {prop: "refreshIfNeeded", name: "refreshIfNeeded", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([Styles, sliceType], [Element], false)}, {prop: "refresh", name: "refresh", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([Styles, sliceType], [Element], false)}, {prop: "close", name: "close", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([], [], false)}];
	ptrType$26.methods = [{prop: "Begin", name: "Begin", pkg: "", typ: $funcType([], [], false)}, {prop: "End", name: "End", pkg: "", typ: $funcType([], [], false)}, {prop: "Stretch", name: "Stretch", pkg: "", typ: $funcType([$emptyInterface, Styles, sliceType], [Element], true)}];
	ptrType$14.methods = [{prop: "areArgsSame", name: "areArgsSame", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([Styles, ptrType$5], [$Bool], false)}, {prop: "refreshIfNeeded", name: "refreshIfNeeded", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([Styles, ptrType$5], [Element], false)}, {prop: "refresh", name: "refresh", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([Styles, ptrType$5], [Element], false)}, {prop: "close", name: "close", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([], [], false)}];
	ptrType$27.methods = [{prop: "Begin", name: "Begin", pkg: "", typ: $funcType([], [], false)}, {prop: "End", name: "End", pkg: "", typ: $funcType([], [], false)}, {prop: "TextEdit", name: "TextEdit", pkg: "", typ: $funcType([$emptyInterface, Styles, ptrType$5], [Element], false)}];
	ptrType$15.methods = [{prop: "areArgsSame", name: "areArgsSame", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([TextEditOptions], [$Bool], false)}, {prop: "refreshIfNeeded", name: "refreshIfNeeded", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([TextEditOptions], [Element], false)}, {prop: "refresh", name: "refresh", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([TextEditOptions], [Element], false)}, {prop: "close", name: "close", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([], [], false)}];
	ptrType$28.methods = [{prop: "Begin", name: "Begin", pkg: "", typ: $funcType([], [], false)}, {prop: "End", name: "End", pkg: "", typ: $funcType([], [], false)}, {prop: "TextEditO", name: "TextEditO", pkg: "", typ: $funcType([$emptyInterface, TextEditOptions], [Element], false)}];
	ptrType$16.methods = [{prop: "areArgsSame", name: "areArgsSame", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([Styles, $String], [$Bool], false)}, {prop: "refreshIfNeeded", name: "refreshIfNeeded", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([Styles, $String], [Element], false)}, {prop: "refresh", name: "refresh", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([Styles, $String], [Element], false)}, {prop: "close", name: "close", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([], [], false)}];
	ptrType$29.methods = [{prop: "Begin", name: "Begin", pkg: "", typ: $funcType([], [], false)}, {prop: "End", name: "End", pkg: "", typ: $funcType([], [], false)}, {prop: "TextView", name: "TextView", pkg: "", typ: $funcType([$emptyInterface, Styles, $String], [Element], false)}];
	ptrType$17.methods = [{prop: "areArgsSame", name: "areArgsSame", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([Styles, sliceType], [$Bool], false)}, {prop: "refreshIfNeeded", name: "refreshIfNeeded", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([Styles, sliceType], [Element], false)}, {prop: "refresh", name: "refresh", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([Styles, sliceType], [Element], false)}, {prop: "close", name: "close", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([], [], false)}];
	ptrType$30.methods = [{prop: "Begin", name: "Begin", pkg: "", typ: $funcType([], [], false)}, {prop: "End", name: "End", pkg: "", typ: $funcType([], [], false)}, {prop: "VRun", name: "VRun", pkg: "", typ: $funcType([$emptyInterface, Styles, sliceType], [Element], true)}];
	Element.init([{prop: "Children", name: "Children", pkg: "", typ: $funcType([], [sliceType], false)}, {prop: "Close", name: "Close", pkg: "", typ: $funcType([], [], false)}, {prop: "InsertChild", name: "InsertChild", pkg: "", typ: $funcType([$Int, Element], [], false)}, {prop: "RemoveChild", name: "RemoveChild", pkg: "", typ: $funcType([$Int], [], false)}, {prop: "SetProp", name: "SetProp", pkg: "", typ: $funcType([$String, $emptyInterface], [], false)}, {prop: "Value", name: "Value", pkg: "", typ: $funcType([], [$String], false)}]);
	Size.init("", [{prop: "Raw", name: "Raw", embedded: false, exported: true, typ: $String, tag: ""}, {prop: "Percent", name: "Percent", embedded: false, exported: true, typ: $Float32, tag: ""}, {prop: "Pixels", name: "Pixels", embedded: false, exported: true, typ: $Float32, tag: ""}, {prop: "Em", name: "Em", embedded: false, exported: true, typ: $Float32, tag: ""}, {prop: "En", name: "En", embedded: false, exported: true, typ: $Float32, tag: ""}]);
	Styles.init("", [{prop: "Color", name: "Color", embedded: false, exported: true, typ: $String, tag: ""}, {prop: "Width", name: "Width", embedded: false, exported: true, typ: Size, tag: ""}, {prop: "Height", name: "Height", embedded: false, exported: true, typ: Size, tag: ""}, {prop: "OverflowX", name: "OverflowX", embedded: false, exported: true, typ: $String, tag: ""}, {prop: "OverflowY", name: "OverflowY", embedded: false, exported: true, typ: $String, tag: ""}, {prop: "FlexDirection", name: "FlexDirection", embedded: false, exported: true, typ: Direction, tag: ""}, {prop: "FlexGrow", name: "FlexGrow", embedded: false, exported: true, typ: $Int, tag: ""}, {prop: "FlexShrink", name: "FlexShrink", embedded: false, exported: true, typ: $Int, tag: ""}]);
	Props.init("", [{prop: "Styles", name: "Styles", embedded: true, exported: true, typ: Styles, tag: ""}, {prop: "Tag", name: "Tag", embedded: false, exported: true, typ: $String, tag: ""}, {prop: "Checked", name: "Checked", embedded: false, exported: true, typ: $Bool, tag: ""}, {prop: "Type", name: "Type", embedded: false, exported: true, typ: $String, tag: ""}, {prop: "TextContent", name: "TextContent", embedded: false, exported: true, typ: $String, tag: ""}, {prop: "ID", name: "ID", embedded: false, exported: true, typ: $String, tag: ""}, {prop: "For", name: "For", embedded: false, exported: true, typ: $String, tag: ""}, {prop: "Href", name: "Href", embedded: false, exported: true, typ: $String, tag: ""}, {prop: "Placeholder", name: "Placeholder", embedded: false, exported: true, typ: $String, tag: ""}, {prop: "OnChange", name: "OnChange", embedded: false, exported: true, typ: ptrType, tag: ""}, {prop: "OnClick", name: "OnClick", embedded: false, exported: true, typ: ptrType, tag: ""}]);
	EventHandler.init("", [{prop: "Handle", name: "Handle", embedded: false, exported: true, typ: funcType, tag: ""}]);
	Event.init("", []);
	nodeStream.init("github.com/dotchain/fuss/dom", [{prop: "Notifier", name: "Notifier", embedded: true, exported: true, typ: ptrType$2, tag: ""}, {prop: "node", name: "node", embedded: true, exported: false, typ: node, tag: ""}]);
	diff.init("github.com/dotchain/fuss/dom", [{prop: "insert", name: "insert", embedded: false, exported: false, typ: $Bool, tag: ""}, {prop: "elt", name: "elt", embedded: false, exported: false, typ: Element, tag: ""}, {prop: "index", name: "index", embedded: false, exported: false, typ: $Int, tag: ""}]);
	node.init("github.com/dotchain/fuss/dom", [{prop: "root", name: "root", embedded: false, exported: false, typ: Element, tag: ""}, {prop: "props", name: "props", embedded: false, exported: false, typ: Props, tag: ""}]);
	BoolStream.init("", [{prop: "Notifier", name: "Notifier", embedded: true, exported: true, typ: ptrType$2, tag: ""}, {prop: "Value", name: "Value", embedded: false, exported: true, typ: $Bool, tag: ""}, {prop: "Change", name: "Change", embedded: false, exported: true, typ: changes.Change, tag: ""}, {prop: "Next", name: "Next", embedded: false, exported: true, typ: ptrType$4, tag: ""}]);
	TextStream.init("", [{prop: "Notifier", name: "Notifier", embedded: true, exported: true, typ: ptrType$2, tag: ""}, {prop: "Value", name: "Value", embedded: false, exported: true, typ: $String, tag: ""}, {prop: "Change", name: "Change", embedded: false, exported: true, typ: changes.Change, tag: ""}, {prop: "Next", name: "Next", embedded: false, exported: true, typ: ptrType$5, tag: ""}]);
	aCtx.init("github.com/dotchain/fuss/dom", [{prop: "Cache", name: "Cache", embedded: true, exported: true, typ: core.Cache, tag: ""}, {prop: "finalizer", name: "finalizer", embedded: false, exported: false, typ: funcType$1, tag: ""}, {prop: "EltStruct", name: "EltStruct", embedded: true, exported: true, typ: EltStruct, tag: ""}, {prop: "initialized", name: "initialized", embedded: false, exported: false, typ: $Bool, tag: ""}, {prop: "stateHandler", name: "stateHandler", embedded: false, exported: false, typ: core.Handler, tag: ""}, {prop: "memoized", name: "memoized", embedded: false, exported: false, typ: structType, tag: ""}]);
	AStruct.init("github.com/dotchain/fuss/dom", [{prop: "old", name: "old", embedded: false, exported: false, typ: mapType$1, tag: ""}, {prop: "current", name: "current", embedded: false, exported: false, typ: mapType$1, tag: ""}]);
	cbEditCtx.init("github.com/dotchain/fuss/dom", [{prop: "Cache", name: "Cache", embedded: true, exported: true, typ: core.Cache, tag: ""}, {prop: "finalizer", name: "finalizer", embedded: false, exported: false, typ: funcType$1, tag: ""}, {prop: "EltStruct", name: "EltStruct", embedded: true, exported: true, typ: EltStruct, tag: ""}, {prop: "initialized", name: "initialized", embedded: false, exported: false, typ: $Bool, tag: ""}, {prop: "stateHandler", name: "stateHandler", embedded: false, exported: false, typ: core.Handler, tag: ""}, {prop: "memoized", name: "memoized", embedded: false, exported: false, typ: structType$2, tag: ""}]);
	CheckboxEditStruct.init("github.com/dotchain/fuss/dom", [{prop: "old", name: "old", embedded: false, exported: false, typ: mapType$3, tag: ""}, {prop: "current", name: "current", embedded: false, exported: false, typ: mapType$3, tag: ""}]);
	nodeCtx.init("github.com/dotchain/fuss/dom", [{prop: "Cache", name: "Cache", embedded: true, exported: true, typ: core.Cache, tag: ""}, {prop: "finalizer", name: "finalizer", embedded: false, exported: false, typ: funcType$1, tag: ""}, {prop: "initialized", name: "initialized", embedded: false, exported: false, typ: $Bool, tag: ""}, {prop: "stateHandler", name: "stateHandler", embedded: false, exported: false, typ: core.Handler, tag: ""}, {prop: "memoized", name: "memoized", embedded: false, exported: false, typ: structType$3, tag: ""}]);
	EltStruct.init("github.com/dotchain/fuss/dom", [{prop: "old", name: "old", embedded: false, exported: false, typ: mapType$4, tag: ""}, {prop: "current", name: "current", embedded: false, exported: false, typ: mapType$4, tag: ""}]);
	fixedCtx.init("github.com/dotchain/fuss/dom", [{prop: "Cache", name: "Cache", embedded: true, exported: true, typ: core.Cache, tag: ""}, {prop: "finalizer", name: "finalizer", embedded: false, exported: false, typ: funcType$1, tag: ""}, {prop: "EltStruct", name: "EltStruct", embedded: true, exported: true, typ: EltStruct, tag: ""}, {prop: "initialized", name: "initialized", embedded: false, exported: false, typ: $Bool, tag: ""}, {prop: "stateHandler", name: "stateHandler", embedded: false, exported: false, typ: core.Handler, tag: ""}, {prop: "memoized", name: "memoized", embedded: false, exported: false, typ: structType$4, tag: ""}]);
	FixedStruct.init("github.com/dotchain/fuss/dom", [{prop: "old", name: "old", embedded: false, exported: false, typ: mapType$5, tag: ""}, {prop: "current", name: "current", embedded: false, exported: false, typ: mapType$5, tag: ""}]);
	labelViewCtx.init("github.com/dotchain/fuss/dom", [{prop: "Cache", name: "Cache", embedded: true, exported: true, typ: core.Cache, tag: ""}, {prop: "finalizer", name: "finalizer", embedded: false, exported: false, typ: funcType$1, tag: ""}, {prop: "EltStruct", name: "EltStruct", embedded: true, exported: true, typ: EltStruct, tag: ""}, {prop: "initialized", name: "initialized", embedded: false, exported: false, typ: $Bool, tag: ""}, {prop: "stateHandler", name: "stateHandler", embedded: false, exported: false, typ: core.Handler, tag: ""}, {prop: "memoized", name: "memoized", embedded: false, exported: false, typ: structType$5, tag: ""}]);
	LabelViewStruct.init("github.com/dotchain/fuss/dom", [{prop: "old", name: "old", embedded: false, exported: false, typ: mapType$6, tag: ""}, {prop: "current", name: "current", embedded: false, exported: false, typ: mapType$6, tag: ""}]);
	runCtx.init("github.com/dotchain/fuss/dom", [{prop: "Cache", name: "Cache", embedded: true, exported: true, typ: core.Cache, tag: ""}, {prop: "finalizer", name: "finalizer", embedded: false, exported: false, typ: funcType$1, tag: ""}, {prop: "EltStruct", name: "EltStruct", embedded: true, exported: true, typ: EltStruct, tag: ""}, {prop: "initialized", name: "initialized", embedded: false, exported: false, typ: $Bool, tag: ""}, {prop: "stateHandler", name: "stateHandler", embedded: false, exported: false, typ: core.Handler, tag: ""}, {prop: "memoized", name: "memoized", embedded: false, exported: false, typ: structType$4, tag: ""}]);
	RunStruct.init("github.com/dotchain/fuss/dom", [{prop: "old", name: "old", embedded: false, exported: false, typ: mapType$7, tag: ""}, {prop: "current", name: "current", embedded: false, exported: false, typ: mapType$7, tag: ""}]);
	stretchCtx.init("github.com/dotchain/fuss/dom", [{prop: "Cache", name: "Cache", embedded: true, exported: true, typ: core.Cache, tag: ""}, {prop: "finalizer", name: "finalizer", embedded: false, exported: false, typ: funcType$1, tag: ""}, {prop: "EltStruct", name: "EltStruct", embedded: true, exported: true, typ: EltStruct, tag: ""}, {prop: "initialized", name: "initialized", embedded: false, exported: false, typ: $Bool, tag: ""}, {prop: "stateHandler", name: "stateHandler", embedded: false, exported: false, typ: core.Handler, tag: ""}, {prop: "memoized", name: "memoized", embedded: false, exported: false, typ: structType$4, tag: ""}]);
	StretchStruct.init("github.com/dotchain/fuss/dom", [{prop: "old", name: "old", embedded: false, exported: false, typ: mapType$8, tag: ""}, {prop: "current", name: "current", embedded: false, exported: false, typ: mapType$8, tag: ""}]);
	textEditCtx.init("github.com/dotchain/fuss/dom", [{prop: "Cache", name: "Cache", embedded: true, exported: true, typ: core.Cache, tag: ""}, {prop: "finalizer", name: "finalizer", embedded: false, exported: false, typ: funcType$1, tag: ""}, {prop: "TextEditOStruct", name: "TextEditOStruct", embedded: true, exported: true, typ: TextEditOStruct, tag: ""}, {prop: "initialized", name: "initialized", embedded: false, exported: false, typ: $Bool, tag: ""}, {prop: "stateHandler", name: "stateHandler", embedded: false, exported: false, typ: core.Handler, tag: ""}, {prop: "memoized", name: "memoized", embedded: false, exported: false, typ: structType$6, tag: ""}]);
	TextEditStruct.init("github.com/dotchain/fuss/dom", [{prop: "old", name: "old", embedded: false, exported: false, typ: mapType$9, tag: ""}, {prop: "current", name: "current", embedded: false, exported: false, typ: mapType$9, tag: ""}]);
	textEditOCtx.init("github.com/dotchain/fuss/dom", [{prop: "Cache", name: "Cache", embedded: true, exported: true, typ: core.Cache, tag: ""}, {prop: "finalizer", name: "finalizer", embedded: false, exported: false, typ: funcType$1, tag: ""}, {prop: "EltStruct", name: "EltStruct", embedded: true, exported: true, typ: EltStruct, tag: ""}, {prop: "initialized", name: "initialized", embedded: false, exported: false, typ: $Bool, tag: ""}, {prop: "stateHandler", name: "stateHandler", embedded: false, exported: false, typ: core.Handler, tag: ""}, {prop: "memoized", name: "memoized", embedded: false, exported: false, typ: structType$7, tag: ""}]);
	TextEditOStruct.init("github.com/dotchain/fuss/dom", [{prop: "old", name: "old", embedded: false, exported: false, typ: mapType$10, tag: ""}, {prop: "current", name: "current", embedded: false, exported: false, typ: mapType$10, tag: ""}]);
	textViewCtx.init("github.com/dotchain/fuss/dom", [{prop: "Cache", name: "Cache", embedded: true, exported: true, typ: core.Cache, tag: ""}, {prop: "finalizer", name: "finalizer", embedded: false, exported: false, typ: funcType$1, tag: ""}, {prop: "EltStruct", name: "EltStruct", embedded: true, exported: true, typ: EltStruct, tag: ""}, {prop: "initialized", name: "initialized", embedded: false, exported: false, typ: $Bool, tag: ""}, {prop: "stateHandler", name: "stateHandler", embedded: false, exported: false, typ: core.Handler, tag: ""}, {prop: "memoized", name: "memoized", embedded: false, exported: false, typ: structType$8, tag: ""}]);
	TextViewStruct.init("github.com/dotchain/fuss/dom", [{prop: "old", name: "old", embedded: false, exported: false, typ: mapType$11, tag: ""}, {prop: "current", name: "current", embedded: false, exported: false, typ: mapType$11, tag: ""}]);
	vrunCtx.init("github.com/dotchain/fuss/dom", [{prop: "Cache", name: "Cache", embedded: true, exported: true, typ: core.Cache, tag: ""}, {prop: "finalizer", name: "finalizer", embedded: false, exported: false, typ: funcType$1, tag: ""}, {prop: "EltStruct", name: "EltStruct", embedded: true, exported: true, typ: EltStruct, tag: ""}, {prop: "initialized", name: "initialized", embedded: false, exported: false, typ: $Bool, tag: ""}, {prop: "stateHandler", name: "stateHandler", embedded: false, exported: false, typ: core.Handler, tag: ""}, {prop: "memoized", name: "memoized", embedded: false, exported: false, typ: structType$4, tag: ""}]);
	VRunStruct.init("github.com/dotchain/fuss/dom", [{prop: "old", name: "old", embedded: false, exported: false, typ: mapType$12, tag: ""}, {prop: "current", name: "current", embedded: false, exported: false, typ: mapType$12, tag: ""}]);
	TextEditOptions.init("", [{prop: "Styles", name: "Styles", embedded: true, exported: true, typ: Styles, tag: ""}, {prop: "Placeholder", name: "Placeholder", embedded: false, exported: true, typ: $String, tag: ""}, {prop: "Text", name: "Text", embedded: false, exported: true, typ: ptrType$5, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = changes.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = core.$init(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = strconv.$init(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		driver = $ifaceNil;
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["internal/race"] = (function() {
	var $pkg = {}, $init, Acquire, Release;
	Acquire = function(addr) {
		var addr;
	};
	$pkg.Acquire = Acquire;
	Release = function(addr) {
		var addr;
	};
	$pkg.Release = Release;
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["sync/atomic"] = (function() {
	var $pkg = {}, $init, js, CompareAndSwapInt32, AddInt32;
	js = $packages["github.com/gopherjs/gopherjs/js"];
	CompareAndSwapInt32 = function(addr, old, new$1) {
		var addr, new$1, old;
		if (addr.$get() === old) {
			addr.$set(new$1);
			return true;
		}
		return false;
	};
	$pkg.CompareAndSwapInt32 = CompareAndSwapInt32;
	AddInt32 = function(addr, delta) {
		var addr, delta, new$1;
		new$1 = addr.$get() + delta >> 0;
		addr.$set(new$1);
		return new$1;
	};
	$pkg.AddInt32 = AddInt32;
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = js.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["sync"] = (function() {
	var $pkg = {}, $init, js, race, runtime, atomic, Pool, Mutex, poolLocalInternal, poolLocal, notifyList, ptrType, sliceType, ptrType$1, chanType, sliceType$1, ptrType$6, ptrType$7, sliceType$4, funcType, ptrType$16, arrayType$2, semWaiters, semAwoken, expunged, allPools, runtime_registerPoolCleanup, runtime_SemacquireMutex, runtime_Semrelease, runtime_notifyListCheck, runtime_canSpin, runtime_nanotime, throw$1, poolCleanup, init, indexLocal, init$1, runtime_doSpin;
	js = $packages["github.com/gopherjs/gopherjs/js"];
	race = $packages["internal/race"];
	runtime = $packages["runtime"];
	atomic = $packages["sync/atomic"];
	Pool = $pkg.Pool = $newType(0, $kindStruct, "sync.Pool", true, "sync", true, function(local_, localSize_, store_, New_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.local = 0;
			this.localSize = 0;
			this.store = sliceType$4.nil;
			this.New = $throwNilPointerError;
			return;
		}
		this.local = local_;
		this.localSize = localSize_;
		this.store = store_;
		this.New = New_;
	});
	Mutex = $pkg.Mutex = $newType(0, $kindStruct, "sync.Mutex", true, "sync", true, function(state_, sema_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.state = 0;
			this.sema = 0;
			return;
		}
		this.state = state_;
		this.sema = sema_;
	});
	poolLocalInternal = $pkg.poolLocalInternal = $newType(0, $kindStruct, "sync.poolLocalInternal", true, "sync", false, function(private$0_, shared_, Mutex_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.private$0 = $ifaceNil;
			this.shared = sliceType$4.nil;
			this.Mutex = new Mutex.ptr(0, 0);
			return;
		}
		this.private$0 = private$0_;
		this.shared = shared_;
		this.Mutex = Mutex_;
	});
	poolLocal = $pkg.poolLocal = $newType(0, $kindStruct, "sync.poolLocal", true, "sync", false, function(poolLocalInternal_, pad_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.poolLocalInternal = new poolLocalInternal.ptr($ifaceNil, sliceType$4.nil, new Mutex.ptr(0, 0));
			this.pad = arrayType$2.zero();
			return;
		}
		this.poolLocalInternal = poolLocalInternal_;
		this.pad = pad_;
	});
	notifyList = $pkg.notifyList = $newType(0, $kindStruct, "sync.notifyList", true, "sync", false, function(wait_, notify_, lock_, head_, tail_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.wait = 0;
			this.notify = 0;
			this.lock = 0;
			this.head = 0;
			this.tail = 0;
			return;
		}
		this.wait = wait_;
		this.notify = notify_;
		this.lock = lock_;
		this.head = head_;
		this.tail = tail_;
	});
	ptrType = $ptrType(Pool);
	sliceType = $sliceType(ptrType);
	ptrType$1 = $ptrType($Uint32);
	chanType = $chanType($Bool, false, false);
	sliceType$1 = $sliceType(chanType);
	ptrType$6 = $ptrType($Int32);
	ptrType$7 = $ptrType(poolLocal);
	sliceType$4 = $sliceType($emptyInterface);
	funcType = $funcType([], [$emptyInterface], false);
	ptrType$16 = $ptrType(Mutex);
	arrayType$2 = $arrayType($Uint8, 100);
	Pool.ptr.prototype.Get = function() {
		var _r, p, x, x$1, x$2, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; p = $f.p; x = $f.x; x$1 = $f.x$1; x$2 = $f.x$2; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		p = this;
		/* */ if (p.store.$length === 0) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (p.store.$length === 0) { */ case 1:
			/* */ if (!(p.New === $throwNilPointerError)) { $s = 3; continue; }
			/* */ $s = 4; continue;
			/* if (!(p.New === $throwNilPointerError)) { */ case 3:
				_r = p.New(); /* */ $s = 5; case 5: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
				$s = -1; return _r;
			/* } */ case 4:
			$s = -1; return $ifaceNil;
		/* } */ case 2:
		x$2 = (x = p.store, x$1 = p.store.$length - 1 >> 0, ((x$1 < 0 || x$1 >= x.$length) ? ($throwRuntimeError("index out of range"), undefined) : x.$array[x.$offset + x$1]));
		p.store = $subslice(p.store, 0, (p.store.$length - 1 >> 0));
		$s = -1; return x$2;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Pool.ptr.prototype.Get }; } $f._r = _r; $f.p = p; $f.x = x; $f.x$1 = x$1; $f.x$2 = x$2; $f.$s = $s; $f.$r = $r; return $f;
	};
	Pool.prototype.Get = function() { return this.$val.Get(); };
	Pool.ptr.prototype.Put = function(x) {
		var p, x;
		p = this;
		if ($interfaceIsEqual(x, $ifaceNil)) {
			return;
		}
		p.store = $append(p.store, x);
	};
	Pool.prototype.Put = function(x) { return this.$val.Put(x); };
	runtime_registerPoolCleanup = function(cleanup) {
		var cleanup;
	};
	runtime_SemacquireMutex = function(s, lifo) {
		var _entry, _entry$1, _entry$2, _entry$3, _entry$4, _key, _key$1, _key$2, _r, ch, lifo, s, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _entry = $f._entry; _entry$1 = $f._entry$1; _entry$2 = $f._entry$2; _entry$3 = $f._entry$3; _entry$4 = $f._entry$4; _key = $f._key; _key$1 = $f._key$1; _key$2 = $f._key$2; _r = $f._r; ch = $f.ch; lifo = $f.lifo; s = $f.s; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		/* */ if (((s.$get() - (_entry = semAwoken[ptrType$1.keyFor(s)], _entry !== undefined ? _entry.v : 0) >>> 0)) === 0) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (((s.$get() - (_entry = semAwoken[ptrType$1.keyFor(s)], _entry !== undefined ? _entry.v : 0) >>> 0)) === 0) { */ case 1:
			ch = new $Chan($Bool, 0);
			if (lifo) {
				_key = s; (semWaiters || $throwRuntimeError("assignment to entry in nil map"))[ptrType$1.keyFor(_key)] = { k: _key, v: $appendSlice(new sliceType$1([ch]), (_entry$1 = semWaiters[ptrType$1.keyFor(s)], _entry$1 !== undefined ? _entry$1.v : sliceType$1.nil)) };
			} else {
				_key$1 = s; (semWaiters || $throwRuntimeError("assignment to entry in nil map"))[ptrType$1.keyFor(_key$1)] = { k: _key$1, v: $append((_entry$2 = semWaiters[ptrType$1.keyFor(s)], _entry$2 !== undefined ? _entry$2.v : sliceType$1.nil), ch) };
			}
			_r = $recv(ch); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			_r[0];
			_key$2 = s; (semAwoken || $throwRuntimeError("assignment to entry in nil map"))[ptrType$1.keyFor(_key$2)] = { k: _key$2, v: (_entry$3 = semAwoken[ptrType$1.keyFor(s)], _entry$3 !== undefined ? _entry$3.v : 0) - (1) >>> 0 };
			if ((_entry$4 = semAwoken[ptrType$1.keyFor(s)], _entry$4 !== undefined ? _entry$4.v : 0) === 0) {
				delete semAwoken[ptrType$1.keyFor(s)];
			}
		/* } */ case 2:
		s.$set(s.$get() - (1) >>> 0);
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: runtime_SemacquireMutex }; } $f._entry = _entry; $f._entry$1 = _entry$1; $f._entry$2 = _entry$2; $f._entry$3 = _entry$3; $f._entry$4 = _entry$4; $f._key = _key; $f._key$1 = _key$1; $f._key$2 = _key$2; $f._r = _r; $f.ch = ch; $f.lifo = lifo; $f.s = s; $f.$s = $s; $f.$r = $r; return $f;
	};
	runtime_Semrelease = function(s, handoff) {
		var _entry, _entry$1, _key, _key$1, ch, handoff, s, w, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _entry = $f._entry; _entry$1 = $f._entry$1; _key = $f._key; _key$1 = $f._key$1; ch = $f.ch; handoff = $f.handoff; s = $f.s; w = $f.w; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		s.$set(s.$get() + (1) >>> 0);
		w = (_entry = semWaiters[ptrType$1.keyFor(s)], _entry !== undefined ? _entry.v : sliceType$1.nil);
		if (w.$length === 0) {
			$s = -1; return;
		}
		ch = (0 >= w.$length ? ($throwRuntimeError("index out of range"), undefined) : w.$array[w.$offset + 0]);
		w = $subslice(w, 1);
		_key = s; (semWaiters || $throwRuntimeError("assignment to entry in nil map"))[ptrType$1.keyFor(_key)] = { k: _key, v: w };
		if (w.$length === 0) {
			delete semWaiters[ptrType$1.keyFor(s)];
		}
		_key$1 = s; (semAwoken || $throwRuntimeError("assignment to entry in nil map"))[ptrType$1.keyFor(_key$1)] = { k: _key$1, v: (_entry$1 = semAwoken[ptrType$1.keyFor(s)], _entry$1 !== undefined ? _entry$1.v : 0) + (1) >>> 0 };
		$r = $send(ch, true); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: runtime_Semrelease }; } $f._entry = _entry; $f._entry$1 = _entry$1; $f._key = _key; $f._key$1 = _key$1; $f.ch = ch; $f.handoff = handoff; $f.s = s; $f.w = w; $f.$s = $s; $f.$r = $r; return $f;
	};
	runtime_notifyListCheck = function(size) {
		var size;
	};
	runtime_canSpin = function(i) {
		var i;
		return false;
	};
	runtime_nanotime = function() {
		return $mul64($internalize(new ($global.Date)().getTime(), $Int64), new $Int64(0, 1000000));
	};
	throw$1 = function(s) {
		var s;
		$throwRuntimeError($externalize(s, $String));
	};
	Mutex.ptr.prototype.Lock = function() {
		var awoke, delta, iter, m, new$1, old, queueLifo, starving, waitStartTime, x, x$1, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; awoke = $f.awoke; delta = $f.delta; iter = $f.iter; m = $f.m; new$1 = $f.new$1; old = $f.old; queueLifo = $f.queueLifo; starving = $f.starving; waitStartTime = $f.waitStartTime; x = $f.x; x$1 = $f.x$1; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		m = this;
		if (atomic.CompareAndSwapInt32((m.$ptr_state || (m.$ptr_state = new ptrType$6(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m))), 0, 1)) {
			if (false) {
				race.Acquire((m));
			}
			$s = -1; return;
		}
		waitStartTime = new $Int64(0, 0);
		starving = false;
		awoke = false;
		iter = 0;
		old = m.state;
		/* while (true) { */ case 1:
			/* */ if (((old & 5) === 1) && runtime_canSpin(iter)) { $s = 3; continue; }
			/* */ $s = 4; continue;
			/* if (((old & 5) === 1) && runtime_canSpin(iter)) { */ case 3:
				if (!awoke && ((old & 2) === 0) && !(((old >> 3 >> 0) === 0)) && atomic.CompareAndSwapInt32((m.$ptr_state || (m.$ptr_state = new ptrType$6(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m))), old, old | 2)) {
					awoke = true;
				}
				runtime_doSpin();
				iter = iter + (1) >> 0;
				old = m.state;
				/* continue; */ $s = 1; continue;
			/* } */ case 4:
			new$1 = old;
			if ((old & 4) === 0) {
				new$1 = new$1 | (1);
			}
			if (!(((old & 5) === 0))) {
				new$1 = new$1 + (8) >> 0;
			}
			if (starving && !(((old & 1) === 0))) {
				new$1 = new$1 | (4);
			}
			if (awoke) {
				if ((new$1 & 2) === 0) {
					throw$1("sync: inconsistent mutex state");
				}
				new$1 = (new$1 & ~(2)) >> 0;
			}
			/* */ if (atomic.CompareAndSwapInt32((m.$ptr_state || (m.$ptr_state = new ptrType$6(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m))), old, new$1)) { $s = 5; continue; }
			/* */ $s = 6; continue;
			/* if (atomic.CompareAndSwapInt32((m.$ptr_state || (m.$ptr_state = new ptrType$6(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m))), old, new$1)) { */ case 5:
				if ((old & 5) === 0) {
					/* break; */ $s = 2; continue;
				}
				queueLifo = !((waitStartTime.$high === 0 && waitStartTime.$low === 0));
				if ((waitStartTime.$high === 0 && waitStartTime.$low === 0)) {
					waitStartTime = runtime_nanotime();
				}
				$r = runtime_SemacquireMutex((m.$ptr_sema || (m.$ptr_sema = new ptrType$1(function() { return this.$target.sema; }, function($v) { this.$target.sema = $v; }, m))), queueLifo); /* */ $s = 8; case 8: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
				starving = starving || (x = (x$1 = runtime_nanotime(), new $Int64(x$1.$high - waitStartTime.$high, x$1.$low - waitStartTime.$low)), (x.$high > 0 || (x.$high === 0 && x.$low > 1000000)));
				old = m.state;
				if (!(((old & 4) === 0))) {
					if (!(((old & 3) === 0)) || ((old >> 3 >> 0) === 0)) {
						throw$1("sync: inconsistent mutex state");
					}
					delta = -7;
					if (!starving || ((old >> 3 >> 0) === 1)) {
						delta = delta - (4) >> 0;
					}
					atomic.AddInt32((m.$ptr_state || (m.$ptr_state = new ptrType$6(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m))), delta);
					/* break; */ $s = 2; continue;
				}
				awoke = true;
				iter = 0;
				$s = 7; continue;
			/* } else { */ case 6:
				old = m.state;
			/* } */ case 7:
		/* } */ $s = 1; continue; case 2:
		if (false) {
			race.Acquire((m));
		}
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Mutex.ptr.prototype.Lock }; } $f.awoke = awoke; $f.delta = delta; $f.iter = iter; $f.m = m; $f.new$1 = new$1; $f.old = old; $f.queueLifo = queueLifo; $f.starving = starving; $f.waitStartTime = waitStartTime; $f.x = x; $f.x$1 = x$1; $f.$s = $s; $f.$r = $r; return $f;
	};
	Mutex.prototype.Lock = function() { return this.$val.Lock(); };
	Mutex.ptr.prototype.Unlock = function() {
		var m, new$1, old, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; m = $f.m; new$1 = $f.new$1; old = $f.old; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		m = this;
		if (false) {
			$unused(m.state);
			race.Release((m));
		}
		new$1 = atomic.AddInt32((m.$ptr_state || (m.$ptr_state = new ptrType$6(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m))), -1);
		if ((((new$1 + 1 >> 0)) & 1) === 0) {
			throw$1("sync: unlock of unlocked mutex");
		}
		/* */ if ((new$1 & 4) === 0) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if ((new$1 & 4) === 0) { */ case 1:
			old = new$1;
			/* while (true) { */ case 4:
				if (((old >> 3 >> 0) === 0) || !(((old & 7) === 0))) {
					$s = -1; return;
				}
				new$1 = ((old - 8 >> 0)) | 2;
				/* */ if (atomic.CompareAndSwapInt32((m.$ptr_state || (m.$ptr_state = new ptrType$6(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m))), old, new$1)) { $s = 6; continue; }
				/* */ $s = 7; continue;
				/* if (atomic.CompareAndSwapInt32((m.$ptr_state || (m.$ptr_state = new ptrType$6(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m))), old, new$1)) { */ case 6:
					$r = runtime_Semrelease((m.$ptr_sema || (m.$ptr_sema = new ptrType$1(function() { return this.$target.sema; }, function($v) { this.$target.sema = $v; }, m))), false); /* */ $s = 8; case 8: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
					$s = -1; return;
				/* } */ case 7:
				old = m.state;
			/* } */ $s = 4; continue; case 5:
			$s = 3; continue;
		/* } else { */ case 2:
			$r = runtime_Semrelease((m.$ptr_sema || (m.$ptr_sema = new ptrType$1(function() { return this.$target.sema; }, function($v) { this.$target.sema = $v; }, m))), true); /* */ $s = 9; case 9: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* } */ case 3:
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Mutex.ptr.prototype.Unlock }; } $f.m = m; $f.new$1 = new$1; $f.old = old; $f.$s = $s; $f.$r = $r; return $f;
	};
	Mutex.prototype.Unlock = function() { return this.$val.Unlock(); };
	poolCleanup = function() {
		var _i, _i$1, _ref, _ref$1, i, i$1, j, l, p, x;
		_ref = allPools;
		_i = 0;
		while (true) {
			if (!(_i < _ref.$length)) { break; }
			i = _i;
			p = ((_i < 0 || _i >= _ref.$length) ? ($throwRuntimeError("index out of range"), undefined) : _ref.$array[_ref.$offset + _i]);
			((i < 0 || i >= allPools.$length) ? ($throwRuntimeError("index out of range"), undefined) : allPools.$array[allPools.$offset + i] = ptrType.nil);
			i$1 = 0;
			while (true) {
				if (!(i$1 < ((p.localSize >> 0)))) { break; }
				l = indexLocal(p.local, i$1);
				l.poolLocalInternal.private$0 = $ifaceNil;
				_ref$1 = l.poolLocalInternal.shared;
				_i$1 = 0;
				while (true) {
					if (!(_i$1 < _ref$1.$length)) { break; }
					j = _i$1;
					(x = l.poolLocalInternal.shared, ((j < 0 || j >= x.$length) ? ($throwRuntimeError("index out of range"), undefined) : x.$array[x.$offset + j] = $ifaceNil));
					_i$1++;
				}
				l.poolLocalInternal.shared = sliceType$4.nil;
				i$1 = i$1 + (1) >> 0;
			}
			p.local = 0;
			p.localSize = 0;
			_i++;
		}
		allPools = new sliceType([]);
	};
	init = function() {
		runtime_registerPoolCleanup(poolCleanup);
	};
	indexLocal = function(l, i) {
		var i, l, lp;
		lp = (((l) + ($imul(((i >>> 0)), 128) >>> 0) >>> 0));
		return ($pointerOfStructConversion(lp, ptrType$7));
	};
	init$1 = function() {
		var n;
		n = new notifyList.ptr(0, 0, 0, 0, 0);
		runtime_notifyListCheck(20);
	};
	runtime_doSpin = function() {
		$throwRuntimeError("native function not implemented: sync.runtime_doSpin");
	};
	ptrType.methods = [{prop: "Get", name: "Get", pkg: "", typ: $funcType([], [$emptyInterface], false)}, {prop: "Put", name: "Put", pkg: "", typ: $funcType([$emptyInterface], [], false)}, {prop: "getSlow", name: "getSlow", pkg: "sync", typ: $funcType([], [$emptyInterface], false)}, {prop: "pin", name: "pin", pkg: "sync", typ: $funcType([], [ptrType$7], false)}, {prop: "pinSlow", name: "pinSlow", pkg: "sync", typ: $funcType([], [ptrType$7], false)}];
	ptrType$16.methods = [{prop: "Lock", name: "Lock", pkg: "", typ: $funcType([], [], false)}, {prop: "Unlock", name: "Unlock", pkg: "", typ: $funcType([], [], false)}];
	Pool.init("sync", [{prop: "local", name: "local", embedded: false, exported: false, typ: $UnsafePointer, tag: ""}, {prop: "localSize", name: "localSize", embedded: false, exported: false, typ: $Uintptr, tag: ""}, {prop: "store", name: "store", embedded: false, exported: false, typ: sliceType$4, tag: ""}, {prop: "New", name: "New", embedded: false, exported: true, typ: funcType, tag: ""}]);
	Mutex.init("sync", [{prop: "state", name: "state", embedded: false, exported: false, typ: $Int32, tag: ""}, {prop: "sema", name: "sema", embedded: false, exported: false, typ: $Uint32, tag: ""}]);
	poolLocalInternal.init("sync", [{prop: "private$0", name: "private", embedded: false, exported: false, typ: $emptyInterface, tag: ""}, {prop: "shared", name: "shared", embedded: false, exported: false, typ: sliceType$4, tag: ""}, {prop: "Mutex", name: "Mutex", embedded: true, exported: true, typ: Mutex, tag: ""}]);
	poolLocal.init("sync", [{prop: "poolLocalInternal", name: "poolLocalInternal", embedded: true, exported: false, typ: poolLocalInternal, tag: ""}, {prop: "pad", name: "pad", embedded: false, exported: false, typ: arrayType$2, tag: ""}]);
	notifyList.init("sync", [{prop: "wait", name: "wait", embedded: false, exported: false, typ: $Uint32, tag: ""}, {prop: "notify", name: "notify", embedded: false, exported: false, typ: $Uint32, tag: ""}, {prop: "lock", name: "lock", embedded: false, exported: false, typ: $Uintptr, tag: ""}, {prop: "head", name: "head", embedded: false, exported: false, typ: $UnsafePointer, tag: ""}, {prop: "tail", name: "tail", embedded: false, exported: false, typ: $UnsafePointer, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = js.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = race.$init(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = runtime.$init(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = atomic.$init(); /* */ $s = 4; case 4: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		allPools = sliceType.nil;
		semWaiters = {};
		semAwoken = {};
		expunged = (new Uint8Array(8));
		init();
		init$1();
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["io"] = (function() {
	var $pkg = {}, $init, errors, sync, atomic, errWhence, errOffset;
	errors = $packages["errors"];
	sync = $packages["sync"];
	atomic = $packages["sync/atomic"];
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = errors.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = sync.$init(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = atomic.$init(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$pkg.ErrShortWrite = errors.New("short write");
		$pkg.ErrShortBuffer = errors.New("short buffer");
		$pkg.EOF = errors.New("EOF");
		$pkg.ErrUnexpectedEOF = errors.New("unexpected EOF");
		$pkg.ErrNoProgress = errors.New("multiple Read calls return no data or error");
		errWhence = errors.New("Seek: invalid whence");
		errOffset = errors.New("Seek: invalid offset");
		$pkg.ErrClosedPipe = errors.New("io: read/write on closed pipe");
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["unicode"] = (function() {
	var $pkg = {}, $init, CaseRange, d, arrayType, sliceType$3, _CaseRanges, to, To, ToLower;
	CaseRange = $pkg.CaseRange = $newType(0, $kindStruct, "unicode.CaseRange", true, "unicode", true, function(Lo_, Hi_, Delta_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Lo = 0;
			this.Hi = 0;
			this.Delta = arrayType.zero();
			return;
		}
		this.Lo = Lo_;
		this.Hi = Hi_;
		this.Delta = Delta_;
	});
	d = $pkg.d = $newType(12, $kindArray, "unicode.d", true, "unicode", false, null);
	arrayType = $arrayType($Int32, 3);
	sliceType$3 = $sliceType(CaseRange);
	to = function(_case, r, caseRange) {
		var _case, _q, _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, caseRange, cr, delta, foundMapping, hi, lo, m, mappedRune, r, x;
		mappedRune = 0;
		foundMapping = false;
		if (_case < 0 || 3 <= _case) {
			_tmp = 65533;
			_tmp$1 = false;
			mappedRune = _tmp;
			foundMapping = _tmp$1;
			return [mappedRune, foundMapping];
		}
		lo = 0;
		hi = caseRange.$length;
		while (true) {
			if (!(lo < hi)) { break; }
			m = lo + (_q = ((hi - lo >> 0)) / 2, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")) >> 0;
			cr = ((m < 0 || m >= caseRange.$length) ? ($throwRuntimeError("index out of range"), undefined) : caseRange.$array[caseRange.$offset + m]);
			if (((cr.Lo >> 0)) <= r && r <= ((cr.Hi >> 0))) {
				delta = ((x = cr.Delta, ((_case < 0 || _case >= x.length) ? ($throwRuntimeError("index out of range"), undefined) : x[_case])));
				if (delta > 1114111) {
					_tmp$2 = ((cr.Lo >> 0)) + ((((((r - ((cr.Lo >> 0)) >> 0)) & ~1) >> 0) | (((_case & 1) >> 0)))) >> 0;
					_tmp$3 = true;
					mappedRune = _tmp$2;
					foundMapping = _tmp$3;
					return [mappedRune, foundMapping];
				}
				_tmp$4 = r + delta >> 0;
				_tmp$5 = true;
				mappedRune = _tmp$4;
				foundMapping = _tmp$5;
				return [mappedRune, foundMapping];
			}
			if (r < ((cr.Lo >> 0))) {
				hi = m;
			} else {
				lo = m + 1 >> 0;
			}
		}
		_tmp$6 = r;
		_tmp$7 = false;
		mappedRune = _tmp$6;
		foundMapping = _tmp$7;
		return [mappedRune, foundMapping];
	};
	To = function(_case, r) {
		var _case, _tuple, r;
		_tuple = to(_case, r, $pkg.CaseRanges);
		r = _tuple[0];
		return r;
	};
	$pkg.To = To;
	ToLower = function(r) {
		var r;
		if (r <= 127) {
			if (65 <= r && r <= 90) {
				r = r + (32) >> 0;
			}
			return r;
		}
		return To(1, r);
	};
	$pkg.ToLower = ToLower;
	CaseRange.init("", [{prop: "Lo", name: "Lo", embedded: false, exported: true, typ: $Uint32, tag: ""}, {prop: "Hi", name: "Hi", embedded: false, exported: true, typ: $Uint32, tag: ""}, {prop: "Delta", name: "Delta", embedded: false, exported: true, typ: d, tag: ""}]);
	d.init($Int32, 3);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_CaseRanges = new sliceType$3([new CaseRange.ptr(65, 90, $toNativeArray($kindInt32, [0, 32, 0])), new CaseRange.ptr(97, 122, $toNativeArray($kindInt32, [-32, 0, -32])), new CaseRange.ptr(181, 181, $toNativeArray($kindInt32, [743, 0, 743])), new CaseRange.ptr(192, 214, $toNativeArray($kindInt32, [0, 32, 0])), new CaseRange.ptr(216, 222, $toNativeArray($kindInt32, [0, 32, 0])), new CaseRange.ptr(224, 246, $toNativeArray($kindInt32, [-32, 0, -32])), new CaseRange.ptr(248, 254, $toNativeArray($kindInt32, [-32, 0, -32])), new CaseRange.ptr(255, 255, $toNativeArray($kindInt32, [121, 0, 121])), new CaseRange.ptr(256, 303, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(304, 304, $toNativeArray($kindInt32, [0, -199, 0])), new CaseRange.ptr(305, 305, $toNativeArray($kindInt32, [-232, 0, -232])), new CaseRange.ptr(306, 311, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(313, 328, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(330, 375, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(376, 376, $toNativeArray($kindInt32, [0, -121, 0])), new CaseRange.ptr(377, 382, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(383, 383, $toNativeArray($kindInt32, [-300, 0, -300])), new CaseRange.ptr(384, 384, $toNativeArray($kindInt32, [195, 0, 195])), new CaseRange.ptr(385, 385, $toNativeArray($kindInt32, [0, 210, 0])), new CaseRange.ptr(386, 389, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(390, 390, $toNativeArray($kindInt32, [0, 206, 0])), new CaseRange.ptr(391, 392, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(393, 394, $toNativeArray($kindInt32, [0, 205, 0])), new CaseRange.ptr(395, 396, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(398, 398, $toNativeArray($kindInt32, [0, 79, 0])), new CaseRange.ptr(399, 399, $toNativeArray($kindInt32, [0, 202, 0])), new CaseRange.ptr(400, 400, $toNativeArray($kindInt32, [0, 203, 0])), new CaseRange.ptr(401, 402, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(403, 403, $toNativeArray($kindInt32, [0, 205, 0])), new CaseRange.ptr(404, 404, $toNativeArray($kindInt32, [0, 207, 0])), new CaseRange.ptr(405, 405, $toNativeArray($kindInt32, [97, 0, 97])), new CaseRange.ptr(406, 406, $toNativeArray($kindInt32, [0, 211, 0])), new CaseRange.ptr(407, 407, $toNativeArray($kindInt32, [0, 209, 0])), new CaseRange.ptr(408, 409, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(410, 410, $toNativeArray($kindInt32, [163, 0, 163])), new CaseRange.ptr(412, 412, $toNativeArray($kindInt32, [0, 211, 0])), new CaseRange.ptr(413, 413, $toNativeArray($kindInt32, [0, 213, 0])), new CaseRange.ptr(414, 414, $toNativeArray($kindInt32, [130, 0, 130])), new CaseRange.ptr(415, 415, $toNativeArray($kindInt32, [0, 214, 0])), new CaseRange.ptr(416, 421, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(422, 422, $toNativeArray($kindInt32, [0, 218, 0])), new CaseRange.ptr(423, 424, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(425, 425, $toNativeArray($kindInt32, [0, 218, 0])), new CaseRange.ptr(428, 429, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(430, 430, $toNativeArray($kindInt32, [0, 218, 0])), new CaseRange.ptr(431, 432, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(433, 434, $toNativeArray($kindInt32, [0, 217, 0])), new CaseRange.ptr(435, 438, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(439, 439, $toNativeArray($kindInt32, [0, 219, 0])), new CaseRange.ptr(440, 441, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(444, 445, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(447, 447, $toNativeArray($kindInt32, [56, 0, 56])), new CaseRange.ptr(452, 452, $toNativeArray($kindInt32, [0, 2, 1])), new CaseRange.ptr(453, 453, $toNativeArray($kindInt32, [-1, 1, 0])), new CaseRange.ptr(454, 454, $toNativeArray($kindInt32, [-2, 0, -1])), new CaseRange.ptr(455, 455, $toNativeArray($kindInt32, [0, 2, 1])), new CaseRange.ptr(456, 456, $toNativeArray($kindInt32, [-1, 1, 0])), new CaseRange.ptr(457, 457, $toNativeArray($kindInt32, [-2, 0, -1])), new CaseRange.ptr(458, 458, $toNativeArray($kindInt32, [0, 2, 1])), new CaseRange.ptr(459, 459, $toNativeArray($kindInt32, [-1, 1, 0])), new CaseRange.ptr(460, 460, $toNativeArray($kindInt32, [-2, 0, -1])), new CaseRange.ptr(461, 476, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(477, 477, $toNativeArray($kindInt32, [-79, 0, -79])), new CaseRange.ptr(478, 495, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(497, 497, $toNativeArray($kindInt32, [0, 2, 1])), new CaseRange.ptr(498, 498, $toNativeArray($kindInt32, [-1, 1, 0])), new CaseRange.ptr(499, 499, $toNativeArray($kindInt32, [-2, 0, -1])), new CaseRange.ptr(500, 501, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(502, 502, $toNativeArray($kindInt32, [0, -97, 0])), new CaseRange.ptr(503, 503, $toNativeArray($kindInt32, [0, -56, 0])), new CaseRange.ptr(504, 543, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(544, 544, $toNativeArray($kindInt32, [0, -130, 0])), new CaseRange.ptr(546, 563, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(570, 570, $toNativeArray($kindInt32, [0, 10795, 0])), new CaseRange.ptr(571, 572, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(573, 573, $toNativeArray($kindInt32, [0, -163, 0])), new CaseRange.ptr(574, 574, $toNativeArray($kindInt32, [0, 10792, 0])), new CaseRange.ptr(575, 576, $toNativeArray($kindInt32, [10815, 0, 10815])), new CaseRange.ptr(577, 578, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(579, 579, $toNativeArray($kindInt32, [0, -195, 0])), new CaseRange.ptr(580, 580, $toNativeArray($kindInt32, [0, 69, 0])), new CaseRange.ptr(581, 581, $toNativeArray($kindInt32, [0, 71, 0])), new CaseRange.ptr(582, 591, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(592, 592, $toNativeArray($kindInt32, [10783, 0, 10783])), new CaseRange.ptr(593, 593, $toNativeArray($kindInt32, [10780, 0, 10780])), new CaseRange.ptr(594, 594, $toNativeArray($kindInt32, [10782, 0, 10782])), new CaseRange.ptr(595, 595, $toNativeArray($kindInt32, [-210, 0, -210])), new CaseRange.ptr(596, 596, $toNativeArray($kindInt32, [-206, 0, -206])), new CaseRange.ptr(598, 599, $toNativeArray($kindInt32, [-205, 0, -205])), new CaseRange.ptr(601, 601, $toNativeArray($kindInt32, [-202, 0, -202])), new CaseRange.ptr(603, 603, $toNativeArray($kindInt32, [-203, 0, -203])), new CaseRange.ptr(604, 604, $toNativeArray($kindInt32, [42319, 0, 42319])), new CaseRange.ptr(608, 608, $toNativeArray($kindInt32, [-205, 0, -205])), new CaseRange.ptr(609, 609, $toNativeArray($kindInt32, [42315, 0, 42315])), new CaseRange.ptr(611, 611, $toNativeArray($kindInt32, [-207, 0, -207])), new CaseRange.ptr(613, 613, $toNativeArray($kindInt32, [42280, 0, 42280])), new CaseRange.ptr(614, 614, $toNativeArray($kindInt32, [42308, 0, 42308])), new CaseRange.ptr(616, 616, $toNativeArray($kindInt32, [-209, 0, -209])), new CaseRange.ptr(617, 617, $toNativeArray($kindInt32, [-211, 0, -211])), new CaseRange.ptr(618, 618, $toNativeArray($kindInt32, [42308, 0, 42308])), new CaseRange.ptr(619, 619, $toNativeArray($kindInt32, [10743, 0, 10743])), new CaseRange.ptr(620, 620, $toNativeArray($kindInt32, [42305, 0, 42305])), new CaseRange.ptr(623, 623, $toNativeArray($kindInt32, [-211, 0, -211])), new CaseRange.ptr(625, 625, $toNativeArray($kindInt32, [10749, 0, 10749])), new CaseRange.ptr(626, 626, $toNativeArray($kindInt32, [-213, 0, -213])), new CaseRange.ptr(629, 629, $toNativeArray($kindInt32, [-214, 0, -214])), new CaseRange.ptr(637, 637, $toNativeArray($kindInt32, [10727, 0, 10727])), new CaseRange.ptr(640, 640, $toNativeArray($kindInt32, [-218, 0, -218])), new CaseRange.ptr(643, 643, $toNativeArray($kindInt32, [-218, 0, -218])), new CaseRange.ptr(647, 647, $toNativeArray($kindInt32, [42282, 0, 42282])), new CaseRange.ptr(648, 648, $toNativeArray($kindInt32, [-218, 0, -218])), new CaseRange.ptr(649, 649, $toNativeArray($kindInt32, [-69, 0, -69])), new CaseRange.ptr(650, 651, $toNativeArray($kindInt32, [-217, 0, -217])), new CaseRange.ptr(652, 652, $toNativeArray($kindInt32, [-71, 0, -71])), new CaseRange.ptr(658, 658, $toNativeArray($kindInt32, [-219, 0, -219])), new CaseRange.ptr(669, 669, $toNativeArray($kindInt32, [42261, 0, 42261])), new CaseRange.ptr(670, 670, $toNativeArray($kindInt32, [42258, 0, 42258])), new CaseRange.ptr(837, 837, $toNativeArray($kindInt32, [84, 0, 84])), new CaseRange.ptr(880, 883, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(886, 887, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(891, 893, $toNativeArray($kindInt32, [130, 0, 130])), new CaseRange.ptr(895, 895, $toNativeArray($kindInt32, [0, 116, 0])), new CaseRange.ptr(902, 902, $toNativeArray($kindInt32, [0, 38, 0])), new CaseRange.ptr(904, 906, $toNativeArray($kindInt32, [0, 37, 0])), new CaseRange.ptr(908, 908, $toNativeArray($kindInt32, [0, 64, 0])), new CaseRange.ptr(910, 911, $toNativeArray($kindInt32, [0, 63, 0])), new CaseRange.ptr(913, 929, $toNativeArray($kindInt32, [0, 32, 0])), new CaseRange.ptr(931, 939, $toNativeArray($kindInt32, [0, 32, 0])), new CaseRange.ptr(940, 940, $toNativeArray($kindInt32, [-38, 0, -38])), new CaseRange.ptr(941, 943, $toNativeArray($kindInt32, [-37, 0, -37])), new CaseRange.ptr(945, 961, $toNativeArray($kindInt32, [-32, 0, -32])), new CaseRange.ptr(962, 962, $toNativeArray($kindInt32, [-31, 0, -31])), new CaseRange.ptr(963, 971, $toNativeArray($kindInt32, [-32, 0, -32])), new CaseRange.ptr(972, 972, $toNativeArray($kindInt32, [-64, 0, -64])), new CaseRange.ptr(973, 974, $toNativeArray($kindInt32, [-63, 0, -63])), new CaseRange.ptr(975, 975, $toNativeArray($kindInt32, [0, 8, 0])), new CaseRange.ptr(976, 976, $toNativeArray($kindInt32, [-62, 0, -62])), new CaseRange.ptr(977, 977, $toNativeArray($kindInt32, [-57, 0, -57])), new CaseRange.ptr(981, 981, $toNativeArray($kindInt32, [-47, 0, -47])), new CaseRange.ptr(982, 982, $toNativeArray($kindInt32, [-54, 0, -54])), new CaseRange.ptr(983, 983, $toNativeArray($kindInt32, [-8, 0, -8])), new CaseRange.ptr(984, 1007, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(1008, 1008, $toNativeArray($kindInt32, [-86, 0, -86])), new CaseRange.ptr(1009, 1009, $toNativeArray($kindInt32, [-80, 0, -80])), new CaseRange.ptr(1010, 1010, $toNativeArray($kindInt32, [7, 0, 7])), new CaseRange.ptr(1011, 1011, $toNativeArray($kindInt32, [-116, 0, -116])), new CaseRange.ptr(1012, 1012, $toNativeArray($kindInt32, [0, -60, 0])), new CaseRange.ptr(1013, 1013, $toNativeArray($kindInt32, [-96, 0, -96])), new CaseRange.ptr(1015, 1016, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(1017, 1017, $toNativeArray($kindInt32, [0, -7, 0])), new CaseRange.ptr(1018, 1019, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(1021, 1023, $toNativeArray($kindInt32, [0, -130, 0])), new CaseRange.ptr(1024, 1039, $toNativeArray($kindInt32, [0, 80, 0])), new CaseRange.ptr(1040, 1071, $toNativeArray($kindInt32, [0, 32, 0])), new CaseRange.ptr(1072, 1103, $toNativeArray($kindInt32, [-32, 0, -32])), new CaseRange.ptr(1104, 1119, $toNativeArray($kindInt32, [-80, 0, -80])), new CaseRange.ptr(1120, 1153, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(1162, 1215, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(1216, 1216, $toNativeArray($kindInt32, [0, 15, 0])), new CaseRange.ptr(1217, 1230, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(1231, 1231, $toNativeArray($kindInt32, [-15, 0, -15])), new CaseRange.ptr(1232, 1327, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(1329, 1366, $toNativeArray($kindInt32, [0, 48, 0])), new CaseRange.ptr(1377, 1414, $toNativeArray($kindInt32, [-48, 0, -48])), new CaseRange.ptr(4256, 4293, $toNativeArray($kindInt32, [0, 7264, 0])), new CaseRange.ptr(4295, 4295, $toNativeArray($kindInt32, [0, 7264, 0])), new CaseRange.ptr(4301, 4301, $toNativeArray($kindInt32, [0, 7264, 0])), new CaseRange.ptr(5024, 5103, $toNativeArray($kindInt32, [0, 38864, 0])), new CaseRange.ptr(5104, 5109, $toNativeArray($kindInt32, [0, 8, 0])), new CaseRange.ptr(5112, 5117, $toNativeArray($kindInt32, [-8, 0, -8])), new CaseRange.ptr(7296, 7296, $toNativeArray($kindInt32, [-6254, 0, -6254])), new CaseRange.ptr(7297, 7297, $toNativeArray($kindInt32, [-6253, 0, -6253])), new CaseRange.ptr(7298, 7298, $toNativeArray($kindInt32, [-6244, 0, -6244])), new CaseRange.ptr(7299, 7300, $toNativeArray($kindInt32, [-6242, 0, -6242])), new CaseRange.ptr(7301, 7301, $toNativeArray($kindInt32, [-6243, 0, -6243])), new CaseRange.ptr(7302, 7302, $toNativeArray($kindInt32, [-6236, 0, -6236])), new CaseRange.ptr(7303, 7303, $toNativeArray($kindInt32, [-6181, 0, -6181])), new CaseRange.ptr(7304, 7304, $toNativeArray($kindInt32, [35266, 0, 35266])), new CaseRange.ptr(7545, 7545, $toNativeArray($kindInt32, [35332, 0, 35332])), new CaseRange.ptr(7549, 7549, $toNativeArray($kindInt32, [3814, 0, 3814])), new CaseRange.ptr(7680, 7829, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(7835, 7835, $toNativeArray($kindInt32, [-59, 0, -59])), new CaseRange.ptr(7838, 7838, $toNativeArray($kindInt32, [0, -7615, 0])), new CaseRange.ptr(7840, 7935, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(7936, 7943, $toNativeArray($kindInt32, [8, 0, 8])), new CaseRange.ptr(7944, 7951, $toNativeArray($kindInt32, [0, -8, 0])), new CaseRange.ptr(7952, 7957, $toNativeArray($kindInt32, [8, 0, 8])), new CaseRange.ptr(7960, 7965, $toNativeArray($kindInt32, [0, -8, 0])), new CaseRange.ptr(7968, 7975, $toNativeArray($kindInt32, [8, 0, 8])), new CaseRange.ptr(7976, 7983, $toNativeArray($kindInt32, [0, -8, 0])), new CaseRange.ptr(7984, 7991, $toNativeArray($kindInt32, [8, 0, 8])), new CaseRange.ptr(7992, 7999, $toNativeArray($kindInt32, [0, -8, 0])), new CaseRange.ptr(8000, 8005, $toNativeArray($kindInt32, [8, 0, 8])), new CaseRange.ptr(8008, 8013, $toNativeArray($kindInt32, [0, -8, 0])), new CaseRange.ptr(8017, 8017, $toNativeArray($kindInt32, [8, 0, 8])), new CaseRange.ptr(8019, 8019, $toNativeArray($kindInt32, [8, 0, 8])), new CaseRange.ptr(8021, 8021, $toNativeArray($kindInt32, [8, 0, 8])), new CaseRange.ptr(8023, 8023, $toNativeArray($kindInt32, [8, 0, 8])), new CaseRange.ptr(8025, 8025, $toNativeArray($kindInt32, [0, -8, 0])), new CaseRange.ptr(8027, 8027, $toNativeArray($kindInt32, [0, -8, 0])), new CaseRange.ptr(8029, 8029, $toNativeArray($kindInt32, [0, -8, 0])), new CaseRange.ptr(8031, 8031, $toNativeArray($kindInt32, [0, -8, 0])), new CaseRange.ptr(8032, 8039, $toNativeArray($kindInt32, [8, 0, 8])), new CaseRange.ptr(8040, 8047, $toNativeArray($kindInt32, [0, -8, 0])), new CaseRange.ptr(8048, 8049, $toNativeArray($kindInt32, [74, 0, 74])), new CaseRange.ptr(8050, 8053, $toNativeArray($kindInt32, [86, 0, 86])), new CaseRange.ptr(8054, 8055, $toNativeArray($kindInt32, [100, 0, 100])), new CaseRange.ptr(8056, 8057, $toNativeArray($kindInt32, [128, 0, 128])), new CaseRange.ptr(8058, 8059, $toNativeArray($kindInt32, [112, 0, 112])), new CaseRange.ptr(8060, 8061, $toNativeArray($kindInt32, [126, 0, 126])), new CaseRange.ptr(8064, 8071, $toNativeArray($kindInt32, [8, 0, 8])), new CaseRange.ptr(8072, 8079, $toNativeArray($kindInt32, [0, -8, 0])), new CaseRange.ptr(8080, 8087, $toNativeArray($kindInt32, [8, 0, 8])), new CaseRange.ptr(8088, 8095, $toNativeArray($kindInt32, [0, -8, 0])), new CaseRange.ptr(8096, 8103, $toNativeArray($kindInt32, [8, 0, 8])), new CaseRange.ptr(8104, 8111, $toNativeArray($kindInt32, [0, -8, 0])), new CaseRange.ptr(8112, 8113, $toNativeArray($kindInt32, [8, 0, 8])), new CaseRange.ptr(8115, 8115, $toNativeArray($kindInt32, [9, 0, 9])), new CaseRange.ptr(8120, 8121, $toNativeArray($kindInt32, [0, -8, 0])), new CaseRange.ptr(8122, 8123, $toNativeArray($kindInt32, [0, -74, 0])), new CaseRange.ptr(8124, 8124, $toNativeArray($kindInt32, [0, -9, 0])), new CaseRange.ptr(8126, 8126, $toNativeArray($kindInt32, [-7205, 0, -7205])), new CaseRange.ptr(8131, 8131, $toNativeArray($kindInt32, [9, 0, 9])), new CaseRange.ptr(8136, 8139, $toNativeArray($kindInt32, [0, -86, 0])), new CaseRange.ptr(8140, 8140, $toNativeArray($kindInt32, [0, -9, 0])), new CaseRange.ptr(8144, 8145, $toNativeArray($kindInt32, [8, 0, 8])), new CaseRange.ptr(8152, 8153, $toNativeArray($kindInt32, [0, -8, 0])), new CaseRange.ptr(8154, 8155, $toNativeArray($kindInt32, [0, -100, 0])), new CaseRange.ptr(8160, 8161, $toNativeArray($kindInt32, [8, 0, 8])), new CaseRange.ptr(8165, 8165, $toNativeArray($kindInt32, [7, 0, 7])), new CaseRange.ptr(8168, 8169, $toNativeArray($kindInt32, [0, -8, 0])), new CaseRange.ptr(8170, 8171, $toNativeArray($kindInt32, [0, -112, 0])), new CaseRange.ptr(8172, 8172, $toNativeArray($kindInt32, [0, -7, 0])), new CaseRange.ptr(8179, 8179, $toNativeArray($kindInt32, [9, 0, 9])), new CaseRange.ptr(8184, 8185, $toNativeArray($kindInt32, [0, -128, 0])), new CaseRange.ptr(8186, 8187, $toNativeArray($kindInt32, [0, -126, 0])), new CaseRange.ptr(8188, 8188, $toNativeArray($kindInt32, [0, -9, 0])), new CaseRange.ptr(8486, 8486, $toNativeArray($kindInt32, [0, -7517, 0])), new CaseRange.ptr(8490, 8490, $toNativeArray($kindInt32, [0, -8383, 0])), new CaseRange.ptr(8491, 8491, $toNativeArray($kindInt32, [0, -8262, 0])), new CaseRange.ptr(8498, 8498, $toNativeArray($kindInt32, [0, 28, 0])), new CaseRange.ptr(8526, 8526, $toNativeArray($kindInt32, [-28, 0, -28])), new CaseRange.ptr(8544, 8559, $toNativeArray($kindInt32, [0, 16, 0])), new CaseRange.ptr(8560, 8575, $toNativeArray($kindInt32, [-16, 0, -16])), new CaseRange.ptr(8579, 8580, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(9398, 9423, $toNativeArray($kindInt32, [0, 26, 0])), new CaseRange.ptr(9424, 9449, $toNativeArray($kindInt32, [-26, 0, -26])), new CaseRange.ptr(11264, 11310, $toNativeArray($kindInt32, [0, 48, 0])), new CaseRange.ptr(11312, 11358, $toNativeArray($kindInt32, [-48, 0, -48])), new CaseRange.ptr(11360, 11361, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(11362, 11362, $toNativeArray($kindInt32, [0, -10743, 0])), new CaseRange.ptr(11363, 11363, $toNativeArray($kindInt32, [0, -3814, 0])), new CaseRange.ptr(11364, 11364, $toNativeArray($kindInt32, [0, -10727, 0])), new CaseRange.ptr(11365, 11365, $toNativeArray($kindInt32, [-10795, 0, -10795])), new CaseRange.ptr(11366, 11366, $toNativeArray($kindInt32, [-10792, 0, -10792])), new CaseRange.ptr(11367, 11372, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(11373, 11373, $toNativeArray($kindInt32, [0, -10780, 0])), new CaseRange.ptr(11374, 11374, $toNativeArray($kindInt32, [0, -10749, 0])), new CaseRange.ptr(11375, 11375, $toNativeArray($kindInt32, [0, -10783, 0])), new CaseRange.ptr(11376, 11376, $toNativeArray($kindInt32, [0, -10782, 0])), new CaseRange.ptr(11378, 11379, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(11381, 11382, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(11390, 11391, $toNativeArray($kindInt32, [0, -10815, 0])), new CaseRange.ptr(11392, 11491, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(11499, 11502, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(11506, 11507, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(11520, 11557, $toNativeArray($kindInt32, [-7264, 0, -7264])), new CaseRange.ptr(11559, 11559, $toNativeArray($kindInt32, [-7264, 0, -7264])), new CaseRange.ptr(11565, 11565, $toNativeArray($kindInt32, [-7264, 0, -7264])), new CaseRange.ptr(42560, 42605, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(42624, 42651, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(42786, 42799, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(42802, 42863, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(42873, 42876, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(42877, 42877, $toNativeArray($kindInt32, [0, -35332, 0])), new CaseRange.ptr(42878, 42887, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(42891, 42892, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(42893, 42893, $toNativeArray($kindInt32, [0, -42280, 0])), new CaseRange.ptr(42896, 42899, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(42902, 42921, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(42922, 42922, $toNativeArray($kindInt32, [0, -42308, 0])), new CaseRange.ptr(42923, 42923, $toNativeArray($kindInt32, [0, -42319, 0])), new CaseRange.ptr(42924, 42924, $toNativeArray($kindInt32, [0, -42315, 0])), new CaseRange.ptr(42925, 42925, $toNativeArray($kindInt32, [0, -42305, 0])), new CaseRange.ptr(42926, 42926, $toNativeArray($kindInt32, [0, -42308, 0])), new CaseRange.ptr(42928, 42928, $toNativeArray($kindInt32, [0, -42258, 0])), new CaseRange.ptr(42929, 42929, $toNativeArray($kindInt32, [0, -42282, 0])), new CaseRange.ptr(42930, 42930, $toNativeArray($kindInt32, [0, -42261, 0])), new CaseRange.ptr(42931, 42931, $toNativeArray($kindInt32, [0, 928, 0])), new CaseRange.ptr(42932, 42935, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(43859, 43859, $toNativeArray($kindInt32, [-928, 0, -928])), new CaseRange.ptr(43888, 43967, $toNativeArray($kindInt32, [-38864, 0, -38864])), new CaseRange.ptr(65313, 65338, $toNativeArray($kindInt32, [0, 32, 0])), new CaseRange.ptr(65345, 65370, $toNativeArray($kindInt32, [-32, 0, -32])), new CaseRange.ptr(66560, 66599, $toNativeArray($kindInt32, [0, 40, 0])), new CaseRange.ptr(66600, 66639, $toNativeArray($kindInt32, [-40, 0, -40])), new CaseRange.ptr(66736, 66771, $toNativeArray($kindInt32, [0, 40, 0])), new CaseRange.ptr(66776, 66811, $toNativeArray($kindInt32, [-40, 0, -40])), new CaseRange.ptr(68736, 68786, $toNativeArray($kindInt32, [0, 64, 0])), new CaseRange.ptr(68800, 68850, $toNativeArray($kindInt32, [-64, 0, -64])), new CaseRange.ptr(71840, 71871, $toNativeArray($kindInt32, [0, 32, 0])), new CaseRange.ptr(71872, 71903, $toNativeArray($kindInt32, [-32, 0, -32])), new CaseRange.ptr(125184, 125217, $toNativeArray($kindInt32, [0, 34, 0])), new CaseRange.ptr(125218, 125251, $toNativeArray($kindInt32, [-34, 0, -34]))]);
		$pkg.CaseRanges = _CaseRanges;
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["strings"] = (function() {
	var $pkg = {}, $init, errors, js, bytealg, io, unicode, utf8, sliceType, Map, ToLower;
	errors = $packages["errors"];
	js = $packages["github.com/gopherjs/gopherjs/js"];
	bytealg = $packages["internal/bytealg"];
	io = $packages["io"];
	unicode = $packages["unicode"];
	utf8 = $packages["unicode/utf8"];
	sliceType = $sliceType($Uint8);
	Map = function(mapping, s) {
		var _i, _i$1, _r, _r$1, _ref, _ref$1, _rune, _rune$1, _tuple, b, c, c$1, i, mapping, nb, nbytes, r, r$1, s, w, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _i = $f._i; _i$1 = $f._i$1; _r = $f._r; _r$1 = $f._r$1; _ref = $f._ref; _ref$1 = $f._ref$1; _rune = $f._rune; _rune$1 = $f._rune$1; _tuple = $f._tuple; b = $f.b; c = $f.c; c$1 = $f.c$1; i = $f.i; mapping = $f.mapping; nb = $f.nb; nbytes = $f.nbytes; r = $f.r; r$1 = $f.r$1; s = $f.s; w = $f.w; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		b = sliceType.nil;
		nbytes = 0;
		_ref = s;
		_i = 0;
		/* while (true) { */ case 1:
			/* if (!(_i < _ref.length)) { break; } */ if(!(_i < _ref.length)) { $s = 2; continue; }
			_rune = $decodeRune(_ref, _i);
			i = _i;
			c = _rune[0];
			_r = mapping(c); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			r = _r;
			if (r === c) {
				_i += _rune[1];
				/* continue; */ $s = 1; continue;
			}
			b = $makeSlice(sliceType, (s.length + 4 >> 0));
			nbytes = $copyString(b, $substring(s, 0, i));
			if (r >= 0) {
				if (r < 128) {
					((nbytes < 0 || nbytes >= b.$length) ? ($throwRuntimeError("index out of range"), undefined) : b.$array[b.$offset + nbytes] = ((r << 24 >>> 24)));
					nbytes = nbytes + (1) >> 0;
				} else {
					nbytes = nbytes + (utf8.EncodeRune($subslice(b, nbytes), r)) >> 0;
				}
			}
			if (c === 65533) {
				_tuple = utf8.DecodeRuneInString($substring(s, i));
				w = _tuple[1];
				i = i + (w) >> 0;
			} else {
				i = i + (utf8.RuneLen(c)) >> 0;
			}
			s = $substring(s, i);
			/* break; */ $s = 2; continue;
		/* } */ $s = 1; continue; case 2:
		if (b === sliceType.nil) {
			$s = -1; return s;
		}
		_ref$1 = s;
		_i$1 = 0;
		/* while (true) { */ case 4:
			/* if (!(_i$1 < _ref$1.length)) { break; } */ if(!(_i$1 < _ref$1.length)) { $s = 5; continue; }
			_rune$1 = $decodeRune(_ref$1, _i$1);
			c$1 = _rune$1[0];
			_r$1 = mapping(c$1); /* */ $s = 6; case 6: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
			r$1 = _r$1;
			if ((0 <= r$1 && r$1 < 128) && nbytes < b.$length) {
				((nbytes < 0 || nbytes >= b.$length) ? ($throwRuntimeError("index out of range"), undefined) : b.$array[b.$offset + nbytes] = ((r$1 << 24 >>> 24)));
				nbytes = nbytes + (1) >> 0;
				_i$1 += _rune$1[1];
				/* continue; */ $s = 4; continue;
			}
			if (r$1 >= 0) {
				if ((nbytes + 4 >> 0) >= b.$length) {
					nb = $makeSlice(sliceType, ($imul(2, b.$length)));
					$copySlice(nb, $subslice(b, 0, nbytes));
					b = nb;
				}
				nbytes = nbytes + (utf8.EncodeRune($subslice(b, nbytes), r$1)) >> 0;
			}
			_i$1 += _rune$1[1];
		/* } */ $s = 4; continue; case 5:
		$s = -1; return ($bytesToString($subslice(b, 0, nbytes)));
		/* */ } return; } if ($f === undefined) { $f = { $blk: Map }; } $f._i = _i; $f._i$1 = _i$1; $f._r = _r; $f._r$1 = _r$1; $f._ref = _ref; $f._ref$1 = _ref$1; $f._rune = _rune; $f._rune$1 = _rune$1; $f._tuple = _tuple; $f.b = b; $f.c = c; $f.c$1 = c$1; $f.i = i; $f.mapping = mapping; $f.nb = nb; $f.nbytes = nbytes; $f.r = r; $f.r$1 = r$1; $f.s = s; $f.w = w; $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.Map = Map;
	ToLower = function(s) {
		var _r, _tmp, _tmp$1, b, c, c$1, hasUpper, i, i$1, isASCII, s, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; b = $f.b; c = $f.c; c$1 = $f.c$1; hasUpper = $f.hasUpper; i = $f.i; i$1 = $f.i$1; isASCII = $f.isASCII; s = $f.s; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_tmp = true;
		_tmp$1 = false;
		isASCII = _tmp;
		hasUpper = _tmp$1;
		i = 0;
		while (true) {
			if (!(i < s.length)) { break; }
			c = s.charCodeAt(i);
			if (c >= 128) {
				isASCII = false;
				break;
			}
			hasUpper = hasUpper || (c >= 65 && c <= 90);
			i = i + (1) >> 0;
		}
		if (isASCII) {
			if (!hasUpper) {
				$s = -1; return s;
			}
			b = $makeSlice(sliceType, s.length);
			i$1 = 0;
			while (true) {
				if (!(i$1 < s.length)) { break; }
				c$1 = s.charCodeAt(i$1);
				if (c$1 >= 65 && c$1 <= 90) {
					c$1 = c$1 + (32) << 24 >>> 24;
				}
				((i$1 < 0 || i$1 >= b.$length) ? ($throwRuntimeError("index out of range"), undefined) : b.$array[b.$offset + i$1] = c$1);
				i$1 = i$1 + (1) >> 0;
			}
			$s = -1; return ($bytesToString(b));
		}
		_r = Map(unicode.ToLower, s); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: ToLower }; } $f._r = _r; $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f.b = b; $f.c = c; $f.c$1 = c$1; $f.hasUpper = hasUpper; $f.i = i; $f.i$1 = i$1; $f.isASCII = isASCII; $f.s = s; $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.ToLower = ToLower;
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = errors.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = js.$init(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = bytealg.$init(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = io.$init(); /* */ $s = 4; case 4: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = unicode.$init(); /* */ $s = 5; case 5: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = utf8.$init(); /* */ $s = 6; case 6: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["github.com/dotchain/fuss/dom/js"] = (function() {
	var $pkg = {}, $init, dom, js, strings, driver, cbInfo, element, ptrType, sliceType, ptrType$1, ptrType$2, ptrType$3, mapType, funcType, init, get, listener, QuerySelector;
	dom = $packages["github.com/dotchain/fuss/dom"];
	js = $packages["github.com/gopherjs/gopherjs/js"];
	strings = $packages["strings"];
	driver = $pkg.driver = $newType(0, $kindStruct, "js.driver", true, "github.com/dotchain/fuss/dom/js", false, function(events_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.events = false;
			return;
		}
		this.events = events_;
	});
	cbInfo = $pkg.cbInfo = $newType(0, $kindStruct, "js.cbInfo", true, "github.com/dotchain/fuss/dom/js", false, function(EventHandler_, listener_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.EventHandler = ptrType.nil;
			this.listener = $throwNilPointerError;
			return;
		}
		this.EventHandler = EventHandler_;
		this.listener = listener_;
	});
	element = $pkg.element = $newType(0, $kindStruct, "js.element", true, "github.com/dotchain/fuss/dom/js", false, function(n_, d_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.n = null;
			this.d = ptrType$2.nil;
			return;
		}
		this.n = n_;
		this.d = d_;
	});
	ptrType = $ptrType(dom.EventHandler);
	sliceType = $sliceType(dom.Element);
	ptrType$1 = $ptrType(cbInfo);
	ptrType$2 = $ptrType(driver);
	ptrType$3 = $ptrType(js.Object);
	mapType = $mapType($String, ptrType$3);
	funcType = $funcType([ptrType$3], [], false);
	init = function() {
		var events, x;
		events = $makeMap($String.keyFor, [{ k: "change", v: new ($global.Map)() }, { k: "click", v: new ($global.Map)() }]);
		dom.RegisterDriver((x = new driver.ptr(events), new x.constructor.elem(x)));
	};
	driver.ptr.prototype.NewElement = function(props, children) {
		var _entry, _i, _i$1, _keys, _r, _ref, _ref$1, child, children, d, elt, k, kk, props, tag, v, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _entry = $f._entry; _i = $f._i; _i$1 = $f._i$1; _keys = $f._keys; _r = $f._r; _ref = $f._ref; _ref$1 = $f._ref$1; child = $f.child; children = $f.children; d = $f.d; elt = $f.elt; k = $f.k; kk = $f.kk; props = $f.props; tag = $f.tag; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		d = [d];
		d[0] = this;
		_r = strings.ToLower(props.Tag); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		tag = _r;
		if (tag === "") {
			tag = "div";
		}
		elt = new element.ptr($global.document.createElement($externalize(tag, $String)), d[0]);
		_ref = $clone(props, dom.Props).ToMap();
		_i = 0;
		_keys = $keys(_ref);
		/* while (true) { */ case 2:
			/* if (!(_i < _keys.length)) { break; } */ if(!(_i < _keys.length)) { $s = 3; continue; }
			_entry = _ref[_keys[_i]];
			if (_entry === undefined) {
				_i++;
				/* continue; */ $s = 2; continue;
			}
			k = _entry.k;
			v = _entry.v;
			$r = $clone(elt, element).SetProp(k, v); /* */ $s = 4; case 4: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
			_i++;
		/* } */ $s = 2; continue; case 3:
		_ref$1 = children;
		_i$1 = 0;
		while (true) {
			if (!(_i$1 < _ref$1.$length)) { break; }
			kk = _i$1;
			child = ((_i$1 < 0 || _i$1 >= _ref$1.$length) ? ($throwRuntimeError("index out of range"), undefined) : _ref$1.$array[_ref$1.$offset + _i$1]);
			$clone(elt, element).InsertChild(kk, child);
			_i$1++;
		}
		$s = -1; return new elt.constructor.elem(elt);
		/* */ } return; } if ($f === undefined) { $f = { $blk: driver.ptr.prototype.NewElement }; } $f._entry = _entry; $f._i = _i; $f._i$1 = _i$1; $f._keys = _keys; $f._r = _r; $f._ref = _ref; $f._ref$1 = _ref$1; $f.child = child; $f.children = children; $f.d = d; $f.elt = elt; $f.k = k; $f.kk = kk; $f.props = props; $f.tag = tag; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
	};
	driver.prototype.NewElement = function(props, children) { return this.$val.NewElement(props, children); };
	element.ptr.prototype.SetProp = function(key, value) {
		var _1, _arg, _r, _r$1, _r$2, _r$3, _r$4, e, key, tag, value, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _1 = $f._1; _arg = $f._arg; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; _r$3 = $f._r$3; _r$4 = $f._r$4; e = $f.e; key = $f.key; tag = $f.tag; value = $f.value; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		e = this;
			_1 = key;
			/* */ if (_1 === ("Tag")) { $s = 2; continue; }
			/* */ if (_1 === ("Checked")) { $s = 3; continue; }
			/* */ if (_1 === ("Type") || _1 === ("ID") || _1 === ("For") || _1 === ("Href") || _1 === ("Placeholder")) { $s = 4; continue; }
			/* */ if (_1 === ("TextContent")) { $s = 5; continue; }
			/* */ if (_1 === ("Styles")) { $s = 6; continue; }
			/* */ if (_1 === ("OnChange")) { $s = 7; continue; }
			/* */ if (_1 === ("OnClick")) { $s = 8; continue; }
			/* */ $s = 9; continue;
			/* if (_1 === ("Tag")) { */ case 2:
				_r = strings.ToLower($assertType(value, $String)); /* */ $s = 11; case 11: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
				tag = _r;
				if (tag === "") {
					tag = "div";
				}
				_r$1 = strings.ToLower($internalize(e.n.tagName, $String)); /* */ $s = 14; case 14: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
				/* */ if (!(tag === _r$1)) { $s = 12; continue; }
				/* */ $s = 13; continue;
				/* if (!(tag === _r$1)) { */ case 12:
					$panic(new $String("Cannot change the tag of an element: " + tag));
				/* } */ case 13:
				$s = 10; continue;
			/* } else if (_1 === ("Checked")) { */ case 3:
				e.n.checked = $externalize($assertType(value, $Bool), $Bool);
				$s = 10; continue;
			/* } else if (_1 === ("Type") || _1 === ("ID") || _1 === ("For") || _1 === ("Href") || _1 === ("Placeholder")) { */ case 4:
				_r$2 = strings.ToLower(key); /* */ $s = 15; case 15: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
				$r = $clone(e, element).setAttr(_r$2, $assertType(value, $String)); /* */ $s = 16; case 16: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
				$s = 10; continue;
			/* } else if (_1 === ("TextContent")) { */ case 5:
				_r$3 = strings.ToLower($internalize(e.n.tagName, $String)); /* */ $s = 20; case 20: if($c) { $c = false; _r$3 = _r$3.$blk(); } if (_r$3 && _r$3.$blk !== undefined) { break s; }
				/* */ if (_r$3 === "input") { $s = 17; continue; }
				/* */ $s = 18; continue;
				/* if (_r$3 === "input") { */ case 17:
					e.n.value = $externalize($assertType(value, $String), $String);
					$s = 19; continue;
				/* } else { */ case 18:
					e.n.textContent = $externalize($assertType(value, $String), $String);
				/* } */ case 19:
				$s = 10; continue;
			/* } else if (_1 === ("Styles")) { */ case 6:
				_r$4 = $clone($assertType(value, dom.Styles), dom.Styles).String(); /* */ $s = 21; case 21: if($c) { $c = false; _r$4 = _r$4.$blk(); } if (_r$4 && _r$4.$blk !== undefined) { break s; }
				_arg = _r$4;
				$r = $clone(e, element).setAttr("style", _arg); /* */ $s = 22; case 22: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
				$s = 10; continue;
			/* } else if (_1 === ("OnChange")) { */ case 7:
				$clone(e, element).onEvent("change", $assertType(value, ptrType));
				$s = 10; continue;
			/* } else if (_1 === ("OnClick")) { */ case 8:
				$clone(e, element).onEvent("click", $assertType(value, ptrType));
				$s = 10; continue;
			/* } else { */ case 9:
				$panic(new $String("Unknown key: " + key));
			/* } */ case 10:
		case 1:
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: element.ptr.prototype.SetProp }; } $f._1 = _1; $f._arg = _arg; $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f._r$3 = _r$3; $f._r$4 = _r$4; $f.e = e; $f.key = key; $f.tag = tag; $f.value = value; $f.$s = $s; $f.$r = $r; return $f;
	};
	element.prototype.SetProp = function(key, value) { return this.$val.SetProp(key, value); };
	element.ptr.prototype.setAttr = function(key, val) {
		var e, key, val;
		e = this;
		if (!(val === "")) {
			e.n.setAttribute($externalize(key, $String), $externalize(val, $String));
		} else {
			e.n.removeAttribute($externalize(key, $String));
		}
	};
	element.prototype.setAttr = function(key, val) { return this.$val.setAttr(key, val); };
	element.ptr.prototype.onEvent = function(key, h) {
		var _entry, _tuple, dict, e, h, info, key, listener$1, ok;
		e = this;
		dict = (_entry = e.d.events[$String.keyFor(key)], _entry !== undefined ? _entry.v : null);
		_tuple = get(dict, e.n);
		info = _tuple[0];
		ok = _tuple[1];
		if (!ok && !(h === ptrType.nil)) {
			listener$1 = listener(e.n, dict);
			e.n.addEventListener($externalize(key, $String), listener$1, $externalize(false, $Bool));
			dict.set(e.n, new cbInfo.ptr(h, listener$1));
		} else if (ok && h === ptrType.nil) {
			dict.delete(e.n);
			e.n.removeEventListener($externalize(key, $String), info.listener);
		} else if (ok && !(h === ptrType.nil)) {
			info.EventHandler = h;
		}
	};
	element.prototype.onEvent = function(key, h) { return this.$val.onEvent(key, h); };
	element.ptr.prototype.Value = function() {
		var _entry, _r, e, isCheckbox, isInput, m, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _entry = $f._entry; _r = $f._r; e = $f.e; isCheckbox = $f.isCheckbox; isInput = $f.isInput; m = $f.m; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		e = this;
		_r = strings.ToLower($internalize(e.n.tagName, $String)); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		isInput = _r === "input";
		isCheckbox = $internalize(e.n.type, $String) === "checkbox";
		if (isInput && isCheckbox) {
			m = $makeMap($Bool.keyFor, [{ k: true, v: "on" }, { k: false, v: "off" }]);
			$s = -1; return (_entry = m[$Bool.keyFor(!!(e.n.checked))], _entry !== undefined ? _entry.v : "");
		}
		$s = -1; return $internalize(e.n.value, $String);
		/* */ } return; } if ($f === undefined) { $f = { $blk: element.ptr.prototype.Value }; } $f._entry = _entry; $f._r = _r; $f.e = e; $f.isCheckbox = isCheckbox; $f.isInput = isInput; $f.m = m; $f.$s = $s; $f.$r = $r; return $f;
	};
	element.prototype.Value = function() { return this.$val.Value(); };
	element.ptr.prototype.SetValue = function(s) {
		var e, s;
		e = this;
		e.n.value = $externalize(s, $String);
	};
	element.prototype.SetValue = function(s) { return this.$val.SetValue(s); };
	element.ptr.prototype.Children = function() {
		var e, n, result, x, x$1;
		e = this;
		x = e.n.firstChild;
		if (!(x === null) && (($parseInt(x.nodeType) >> 0) === 3)) {
			return sliceType.nil;
		}
		result = new sliceType([]);
		n = e.n.firstChild;
		while (true) {
			if (!(!(n === null))) { break; }
			result = $append(result, (x$1 = new element.ptr(n, e.d), new x$1.constructor.elem(x$1)));
			n = n.nextSibling;
		}
		return result;
	};
	element.prototype.Children = function() { return this.$val.Children(); };
	element.ptr.prototype.RemoveChild = function(index) {
		var e, index, kk, n;
		e = this;
		n = e.n.firstChild;
		kk = 0;
		while (true) {
			if (!(kk < index)) { break; }
			n = n.nextSibling;
			kk = kk + (1) >> 0;
		}
		e.n.removeChild(n);
	};
	element.prototype.RemoveChild = function(index) { return this.$val.RemoveChild(index); };
	element.ptr.prototype.InsertChild = function(index, elt) {
		var e, elt, index, kk, n, n$1;
		e = this;
		n = $assertType(elt, element).n;
		if (n.parentElement === e.n) {
			e.n.removeChild(n);
		}
		n$1 = e.n.firstChild;
		kk = 0;
		while (true) {
			if (!(kk < index)) { break; }
			n$1 = n$1.nextSibling;
			kk = kk + (1) >> 0;
		}
		if (!(n$1 === null)) {
			e.n.insertBefore($assertType(elt, element).n, n$1);
		} else {
			e.n.appendChild($assertType(elt, element).n);
		}
	};
	element.prototype.InsertChild = function(index, elt) { return this.$val.InsertChild(index, elt); };
	element.ptr.prototype.Close = function() {
		var _entry, _i, _keys, _ref, e, k;
		e = this;
		_ref = e.d.events;
		_i = 0;
		_keys = $keys(_ref);
		while (true) {
			if (!(_i < _keys.length)) { break; }
			_entry = _ref[_keys[_i]];
			if (_entry === undefined) {
				_i++;
				continue;
			}
			k = _entry.k;
			$clone(e, element).onEvent(k, ptrType.nil);
			_i++;
		}
	};
	element.prototype.Close = function() { return this.$val.Close(); };
	get = function(m, key) {
		var jso, key, m, ok;
		ok = !!(m.has(key));
		if (!ok) {
			return [ptrType$1.nil, false];
		}
		jso = m.get(key);
		return [($pointerOfStructConversion((jso), ptrType$1)), true];
	};
	listener = function(n, dict) {
		var dict, n;
		return (function $b(param) {
			var _tuple, info, ok, param, $s, $r;
			/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _tuple = $f._tuple; info = $f.info; ok = $f.ok; param = $f.param; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
			_tuple = get(dict, n);
			info = _tuple[0];
			ok = _tuple[1];
			/* */ if (ok) { $s = 1; continue; }
			/* */ $s = 2; continue;
			/* if (ok) { */ case 1:
				$r = info.EventHandler.Handle(new dom.Event.ptr()); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
			/* } */ case 2:
			$s = -1; return;
			/* */ } return; } if ($f === undefined) { $f = { $blk: $b }; } $f._tuple = _tuple; $f.info = info; $f.ok = ok; $f.param = param; $f.$s = $s; $f.$r = $r; return $f;
		});
	};
	QuerySelector = function(s) {
		var s, x;
		return (x = new element.ptr($global.document.querySelector($externalize(s, $String)), ptrType$2.nil), new x.constructor.elem(x));
	};
	$pkg.QuerySelector = QuerySelector;
	driver.methods = [{prop: "NewElement", name: "NewElement", pkg: "", typ: $funcType([dom.Props, sliceType], [dom.Element], true)}];
	element.methods = [{prop: "SetProp", name: "SetProp", pkg: "", typ: $funcType([$String, $emptyInterface], [], false)}, {prop: "setAttr", name: "setAttr", pkg: "github.com/dotchain/fuss/dom/js", typ: $funcType([$String, $String], [], false)}, {prop: "onEvent", name: "onEvent", pkg: "github.com/dotchain/fuss/dom/js", typ: $funcType([$String, ptrType], [], false)}, {prop: "Value", name: "Value", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetValue", name: "SetValue", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Children", name: "Children", pkg: "", typ: $funcType([], [sliceType], false)}, {prop: "RemoveChild", name: "RemoveChild", pkg: "", typ: $funcType([$Int], [], false)}, {prop: "InsertChild", name: "InsertChild", pkg: "", typ: $funcType([$Int, dom.Element], [], false)}, {prop: "Close", name: "Close", pkg: "", typ: $funcType([], [], false)}];
	driver.init("github.com/dotchain/fuss/dom/js", [{prop: "events", name: "events", embedded: false, exported: false, typ: mapType, tag: ""}]);
	cbInfo.init("github.com/dotchain/fuss/dom/js", [{prop: "EventHandler", name: "EventHandler", embedded: true, exported: true, typ: ptrType, tag: ""}, {prop: "listener", name: "listener", embedded: false, exported: false, typ: funcType, tag: ""}]);
	element.init("github.com/dotchain/fuss/dom/js", [{prop: "n", name: "n", embedded: false, exported: false, typ: ptrType$3, tag: ""}, {prop: "d", name: "d", embedded: false, exported: false, typ: ptrType$2, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = dom.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = js.$init(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = strings.$init(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		init();
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["github.com/dotchain/dot/refs"] = (function() {
	var $pkg = {}, $init, changes, PathMerger, MergeResult, sliceType, ptrType, sliceType$1, Merge, mergeMove, mergeSplice;
	changes = $packages["github.com/dotchain/dot/changes"];
	PathMerger = $pkg.PathMerger = $newType(8, $kindInterface, "refs.PathMerger", true, "github.com/dotchain/dot/refs", true, null);
	MergeResult = $pkg.MergeResult = $newType(0, $kindStruct, "refs.MergeResult", true, "github.com/dotchain/dot/refs", true, function(P_, Scoped_, Affected_, Unaffected_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.P = sliceType.nil;
			this.Scoped = $ifaceNil;
			this.Affected = $ifaceNil;
			this.Unaffected = $ifaceNil;
			return;
		}
		this.P = P_;
		this.Scoped = Scoped_;
		this.Affected = Affected_;
		this.Unaffected = Unaffected_;
	});
	sliceType = $sliceType($emptyInterface);
	ptrType = $ptrType(MergeResult);
	sliceType$1 = $sliceType(changes.Change);
	Merge = function(p, c) {
		var _i, _r, _r$1, _r$2, _r$3, _r$4, _r$5, _ref, _ref$1, c, c$1, c$2, c$3, c$4, c$5, c$6, cx, idx, p, result, unaff, x, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _i = $f._i; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; _r$3 = $f._r$3; _r$4 = $f._r$4; _r$5 = $f._r$5; _ref = $f._ref; _ref$1 = $f._ref$1; c = $f.c; c$1 = $f.c$1; c$2 = $f.c$2; c$3 = $f.c$3; c$4 = $f.c$4; c$5 = $f.c$5; c$6 = $f.c$6; cx = $f.cx; idx = $f.idx; p = $f.p; result = $f.result; unaff = $f.unaff; x = $f.x; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		if (p.$length === 0) {
			$s = -1; return new MergeResult.ptr(sliceType.nil, c, c, $ifaceNil);
		}
		_ref = c;
		/* */ if ($assertType(_ref, changes.Replace, true)[1]) { $s = 1; continue; }
		/* */ if ($assertType(_ref, changes.Splice, true)[1]) { $s = 2; continue; }
		/* */ if ($assertType(_ref, changes.Move, true)[1]) { $s = 3; continue; }
		/* */ if ($assertType(_ref, changes.PathChange, true)[1]) { $s = 4; continue; }
		/* */ if ($assertType(_ref, changes.ChangeSet, true)[1]) { $s = 5; continue; }
		/* */ if ($assertType(_ref, PathMerger, true)[1]) { $s = 6; continue; }
		/* */ $s = 7; continue;
		/* if ($assertType(_ref, changes.Replace, true)[1]) { */ case 1:
			c$1 = $clone(_ref.$val, changes.Replace);
			$s = -1; return ptrType.nil;
		/* } else if ($assertType(_ref, changes.Splice, true)[1]) { */ case 2:
			c$2 = $clone(_ref.$val, changes.Splice);
			_r = mergeSplice(p, $clone(c$2, changes.Splice)); /* */ $s = 8; case 8: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			$s = -1; return _r;
		/* } else if ($assertType(_ref, changes.Move, true)[1]) { */ case 3:
			c$3 = $clone(_ref.$val, changes.Move);
			$s = -1; return mergeMove(p, $clone(c$3, changes.Move));
		/* } else if ($assertType(_ref, changes.PathChange, true)[1]) { */ case 4:
			c$4 = $clone(_ref.$val, changes.PathChange);
			idx = 0;
			/* while (true) { */ case 9:
				/* if (!(p.$length > idx && c$4.Path.$length > idx)) { break; } */ if(!(p.$length > idx && c$4.Path.$length > idx)) { $s = 10; continue; }
				if ($interfaceIsEqual(((idx < 0 || idx >= p.$length) ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + idx]), (x = c$4.Path, ((idx < 0 || idx >= x.$length) ? ($throwRuntimeError("index out of range"), undefined) : x.$array[x.$offset + idx])))) {
					idx = idx + (1) >> 0;
					/* continue; */ $s = 9; continue;
				}
				$s = -1; return new MergeResult.ptr(p, $ifaceNil, $ifaceNil, new c$4.constructor.elem(c$4));
			/* } */ $s = 9; continue; case 10:
			if (p.$length === idx) {
				unaff = $clone(c$4, changes.PathChange);
				c$4.Path = $subslice(c$4.Path, idx);
				$s = -1; return new MergeResult.ptr(p, new c$4.constructor.elem(c$4), new unaff.constructor.elem(unaff), $ifaceNil);
			}
			_r$1 = Merge($subslice(p, idx), c$4.Change); /* */ $s = 11; case 11: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
			_r$2 = _r$1.addPathPrefix($subslice(p, 0, idx)); /* */ $s = 12; case 12: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
			$s = -1; return _r$2;
		/* } else if ($assertType(_ref, changes.ChangeSet, true)[1]) { */ case 5:
			c$5 = _ref.$val;
			result = new MergeResult.ptr(p, $ifaceNil, $ifaceNil, $ifaceNil);
			_ref$1 = c$5;
			_i = 0;
			/* while (true) { */ case 13:
				/* if (!(_i < _ref$1.$length)) { break; } */ if(!(_i < _ref$1.$length)) { $s = 14; continue; }
				cx = ((_i < 0 || _i >= _ref$1.$length) ? ($throwRuntimeError("index out of range"), undefined) : _ref$1.$array[_ref$1.$offset + _i]);
				_r$3 = Merge(result.P, cx); /* */ $s = 15; case 15: if($c) { $c = false; _r$3 = _r$3.$blk(); } if (_r$3 && _r$3.$blk !== undefined) { break s; }
				_r$4 = result.join(_r$3); /* */ $s = 16; case 16: if($c) { $c = false; _r$4 = _r$4.$blk(); } if (_r$4 && _r$4.$blk !== undefined) { break s; }
				result = _r$4;
				if (result === ptrType.nil) {
					$s = -1; return ptrType.nil;
				}
				_i++;
			/* } */ $s = 13; continue; case 14:
			$s = -1; return result;
		/* } else if ($assertType(_ref, PathMerger, true)[1]) { */ case 6:
			c$6 = _ref;
			_r$5 = c$6.MergePath(p); /* */ $s = 17; case 17: if($c) { $c = false; _r$5 = _r$5.$blk(); } if (_r$5 && _r$5.$blk !== undefined) { break s; }
			$s = -1; return _r$5;
		/* } */ case 7:
		$s = -1; return new MergeResult.ptr(p, $ifaceNil, $ifaceNil, c);
		/* */ } return; } if ($f === undefined) { $f = { $blk: Merge }; } $f._i = _i; $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f._r$3 = _r$3; $f._r$4 = _r$4; $f._r$5 = _r$5; $f._ref = _ref; $f._ref$1 = _ref$1; $f.c = c; $f.c$1 = c$1; $f.c$2 = c$2; $f.c$3 = c$3; $f.c$4 = c$4; $f.c$5 = c$5; $f.c$6 = c$6; $f.cx = cx; $f.idx = idx; $f.p = p; $f.result = result; $f.unaff = unaff; $f.x = x; $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.Merge = Merge;
	mergeMove = function(p, c) {
		var c, idx, p;
		idx = $clone(c, changes.Move).MapIndex($assertType((0 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 0]), $Int));
		return new MergeResult.ptr($appendSlice(new sliceType([new $Int(idx)]), $subslice(p, 1)), $ifaceNil, $ifaceNil, new c.constructor.elem(c));
	};
	mergeSplice = function(p, c) {
		var _r, _tuple, c, idx, ok, p, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _tuple = $f._tuple; c = $f.c; idx = $f.idx; ok = $f.ok; p = $f.p; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_r = $clone(c, changes.Splice).MapIndex($assertType((0 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 0]), $Int)); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_tuple = _r;
		idx = _tuple[0];
		ok = _tuple[1];
		if (ok) {
			$s = -1; return ptrType.nil;
		}
		$s = -1; return new MergeResult.ptr($appendSlice(new sliceType([new $Int(idx)]), $subslice(p, 1)), $ifaceNil, $ifaceNil, new c.constructor.elem(c));
		/* */ } return; } if ($f === undefined) { $f = { $blk: mergeSplice }; } $f._r = _r; $f._tuple = _tuple; $f.c = c; $f.idx = idx; $f.ok = ok; $f.p = p; $f.$s = $s; $f.$r = $r; return $f;
	};
	MergeResult.ptr.prototype.join = function(o) {
		var o, p;
		p = this;
		if (o === ptrType.nil) {
			return ptrType.nil;
		}
		p.P = o.P;
		p.Scoped = p.joinChanges(p.Scoped, o.Scoped);
		p.Affected = p.joinChanges(p.Affected, o.Affected);
		p.Unaffected = p.joinChanges(p.Unaffected, o.Unaffected);
		return p;
	};
	MergeResult.prototype.join = function(o) { return this.$val.join(o); };
	MergeResult.ptr.prototype.joinChanges = function(c1, c2) {
		var _tuple, _tuple$1, _tuple$2, c1, c1x, c2, c2x, c2x$1, ok, ok$1, ok$2, p;
		p = this;
		if ($interfaceIsEqual(c1, $ifaceNil)) {
			return c2;
		} else if ($interfaceIsEqual(c2, $ifaceNil)) {
			return c1;
		}
		_tuple = $assertType(c1, changes.ChangeSet, true);
		c1x = _tuple[0];
		ok = _tuple[1];
		if (ok) {
			_tuple$1 = $assertType(c2, changes.ChangeSet, true);
			c2x = _tuple$1[0];
			ok$1 = _tuple$1[1];
			if (ok$1) {
				return $appendSlice(c1x, $subslice(new sliceType$1(c2x.$array), c2x.$offset, c2x.$offset + c2x.$length));
			}
			return $append(c1x, c2);
		}
		_tuple$2 = $assertType(c2, changes.ChangeSet, true);
		c2x$1 = _tuple$2[0];
		ok$2 = _tuple$2[1];
		if (ok$2) {
			return $appendSlice(new changes.ChangeSet([c1]), $subslice(new sliceType$1(c2x$1.$array), c2x$1.$offset, c2x$1.$offset + c2x$1.$length));
		}
		return new changes.ChangeSet([c1, c2]);
	};
	MergeResult.prototype.joinChanges = function(c1, c2) { return this.$val.joinChanges(c1, c2); };
	MergeResult.ptr.prototype.Prefix = function(other) {
		var other, p;
		p = this;
		if (!(p === ptrType.nil)) {
			p.P = $appendSlice($appendSlice((sliceType.nil), other), p.P);
			p.Affected = p.pc(other, p.Affected);
			p.Unaffected = p.pc(other, p.Unaffected);
		}
		return p;
	};
	MergeResult.prototype.Prefix = function(other) { return this.$val.Prefix(other); };
	MergeResult.ptr.prototype.addPathPrefix = function(other) {
		var other, p;
		p = this;
		return p.Prefix(other);
	};
	MergeResult.prototype.addPathPrefix = function(other) { return this.$val.addPathPrefix(other); };
	MergeResult.ptr.prototype.pc = function(path, c) {
		var c, p, path, x;
		p = this;
		if ($interfaceIsEqual(c, $ifaceNil)) {
			return $ifaceNil;
		}
		return (x = new changes.PathChange.ptr(path, c), new x.constructor.elem(x));
	};
	MergeResult.prototype.pc = function(path, c) { return this.$val.pc(path, c); };
	ptrType.methods = [{prop: "join", name: "join", pkg: "github.com/dotchain/dot/refs", typ: $funcType([ptrType], [ptrType], false)}, {prop: "joinChanges", name: "joinChanges", pkg: "github.com/dotchain/dot/refs", typ: $funcType([changes.Change, changes.Change], [changes.Change], false)}, {prop: "Prefix", name: "Prefix", pkg: "", typ: $funcType([sliceType], [ptrType], false)}, {prop: "addPathPrefix", name: "addPathPrefix", pkg: "github.com/dotchain/dot/refs", typ: $funcType([sliceType], [ptrType], false)}, {prop: "pc", name: "pc", pkg: "github.com/dotchain/dot/refs", typ: $funcType([sliceType, changes.Change], [changes.Change], false)}];
	PathMerger.init([{prop: "MergePath", name: "MergePath", pkg: "", typ: $funcType([sliceType], [ptrType], false)}]);
	MergeResult.init("", [{prop: "P", name: "P", embedded: false, exported: true, typ: sliceType, tag: ""}, {prop: "Scoped", name: "Scoped", embedded: false, exported: true, typ: changes.Change, tag: ""}, {prop: "Affected", name: "Affected", embedded: false, exported: true, typ: changes.Change, tag: ""}, {prop: "Unaffected", name: "Unaffected", embedded: false, exported: true, typ: changes.Change, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = changes.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["github.com/dotchain/fuss/todo/controls"] = (function() {
	var $pkg = {}, $init, core, dom, chromeCtx, ChromeStruct, filterCtx, FilterStruct, sliceType, ptrType, structType, structType$1, ptrType$1, structType$2, ptrType$2, structType$3, funcType, ptrType$3, mapType, ptrType$4, mapType$1, chrome, filter;
	core = $packages["github.com/dotchain/fuss/core"];
	dom = $packages["github.com/dotchain/fuss/dom"];
	chromeCtx = $pkg.chromeCtx = $newType(0, $kindStruct, "controls.chromeCtx", true, "github.com/dotchain/fuss/todo/controls", false, function(Cache_, finalizer_, initialized_, stateHandler_, dom_, memoized_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Cache = new core.Cache.ptr(false, false);
			this.finalizer = $throwNilPointerError;
			this.initialized = false;
			this.stateHandler = new core.Handler.ptr($throwNilPointerError);
			this.dom = new structType.ptr(new dom.FixedStruct.ptr(false, false), new dom.StretchStruct.ptr(false, false), new dom.VRunStruct.ptr(false, false));
			this.memoized = new structType$1.ptr($ifaceNil, $ifaceNil, $ifaceNil, $ifaceNil);
			return;
		}
		this.Cache = Cache_;
		this.finalizer = finalizer_;
		this.initialized = initialized_;
		this.stateHandler = stateHandler_;
		this.dom = dom_;
		this.memoized = memoized_;
	});
	ChromeStruct = $pkg.ChromeStruct = $newType(0, $kindStruct, "controls.ChromeStruct", true, "github.com/dotchain/fuss/todo/controls", true, function(old_, current_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.old = false;
			this.current = false;
			return;
		}
		this.old = old_;
		this.current = current_;
	});
	filterCtx = $pkg.filterCtx = $newType(0, $kindStruct, "controls.filterCtx", true, "github.com/dotchain/fuss/todo/controls", false, function(Cache_, finalizer_, initialized_, stateHandler_, dom_, memoized_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Cache = new core.Cache.ptr(false, false);
			this.finalizer = $throwNilPointerError;
			this.initialized = false;
			this.stateHandler = new core.Handler.ptr($throwNilPointerError);
			this.dom = new structType$2.ptr(new dom.CheckboxEditStruct.ptr(false, false), new dom.LabelViewStruct.ptr(false, false), new dom.RunStruct.ptr(false, false));
			this.memoized = new structType$3.ptr(ptrType$2.nil, ptrType$2.nil, $ifaceNil);
			return;
		}
		this.Cache = Cache_;
		this.finalizer = finalizer_;
		this.initialized = initialized_;
		this.stateHandler = stateHandler_;
		this.dom = dom_;
		this.memoized = memoized_;
	});
	FilterStruct = $pkg.FilterStruct = $newType(0, $kindStruct, "controls.FilterStruct", true, "github.com/dotchain/fuss/todo/controls", true, function(old_, current_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.old = false;
			this.current = false;
			return;
		}
		this.old = old_;
		this.current = current_;
	});
	sliceType = $sliceType(dom.Element);
	ptrType = $ptrType(chromeCtx);
	structType = $structType("", [{prop: "FixedStruct", name: "FixedStruct", embedded: true, exported: true, typ: dom.FixedStruct, tag: ""}, {prop: "StretchStruct", name: "StretchStruct", embedded: true, exported: true, typ: dom.StretchStruct, tag: ""}, {prop: "VRunStruct", name: "VRunStruct", embedded: true, exported: true, typ: dom.VRunStruct, tag: ""}]);
	structType$1 = $structType("github.com/dotchain/fuss/todo/controls", [{prop: "body", name: "body", embedded: false, exported: false, typ: dom.Element, tag: ""}, {prop: "footer", name: "footer", embedded: false, exported: false, typ: dom.Element, tag: ""}, {prop: "header", name: "header", embedded: false, exported: false, typ: dom.Element, tag: ""}, {prop: "result1", name: "result1", embedded: false, exported: false, typ: dom.Element, tag: ""}]);
	ptrType$1 = $ptrType(filterCtx);
	structType$2 = $structType("", [{prop: "CheckboxEditStruct", name: "CheckboxEditStruct", embedded: true, exported: true, typ: dom.CheckboxEditStruct, tag: ""}, {prop: "LabelViewStruct", name: "LabelViewStruct", embedded: true, exported: true, typ: dom.LabelViewStruct, tag: ""}, {prop: "RunStruct", name: "RunStruct", embedded: true, exported: true, typ: dom.RunStruct, tag: ""}]);
	ptrType$2 = $ptrType(dom.BoolStream);
	structType$3 = $structType("github.com/dotchain/fuss/todo/controls", [{prop: "active", name: "active", embedded: false, exported: false, typ: ptrType$2, tag: ""}, {prop: "done", name: "done", embedded: false, exported: false, typ: ptrType$2, tag: ""}, {prop: "result1", name: "result1", embedded: false, exported: false, typ: dom.Element, tag: ""}]);
	funcType = $funcType([], [], false);
	ptrType$3 = $ptrType(ChromeStruct);
	mapType = $mapType($emptyInterface, ptrType);
	ptrType$4 = $ptrType(FilterStruct);
	mapType$1 = $mapType($emptyInterface, ptrType$1);
	chrome = function(c, header, body, footer) {
		var _arg, _arg$1, _arg$2, _arg$3, _r, _r$1, _r$2, _r$3, body, c, footer, header, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _arg = $f._arg; _arg$1 = $f._arg$1; _arg$2 = $f._arg$2; _arg$3 = $f._arg$3; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; _r$3 = $f._r$3; body = $f.body; c = $f.c; footer = $f.footer; header = $f.header; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_arg = new dom.Styles.ptr("", new dom.Size.ptr("", 0, 0, 0, 0), new dom.Size.ptr("", 0, 0, 0, 0), "", "", 0, 0, 0);
		_r = c.dom.FixedStruct.Fixed(new $String("h"), new dom.Styles.ptr("", new dom.Size.ptr("", 0, 0, 0, 0), new dom.Size.ptr("", 0, 0, 0, 0), "", "", 0, 0, 0), new sliceType([header])); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_arg$1 = _r;
		_r$1 = c.dom.StretchStruct.Stretch(new $String("b"), new dom.Styles.ptr("", new dom.Size.ptr("", 0, 0, 0, 0), new dom.Size.ptr("", 0, 0, 0, 0), "", "auto", 0, 0, 0), new sliceType([body])); /* */ $s = 2; case 2: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		_arg$2 = _r$1;
		_r$2 = c.dom.FixedStruct.Fixed(new $String("f"), new dom.Styles.ptr("", new dom.Size.ptr("", 0, 0, 0, 0), new dom.Size.ptr("", 0, 0, 0, 0), "", "", 0, 0, 0), new sliceType([footer])); /* */ $s = 3; case 3: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
		_arg$3 = _r$2;
		_r$3 = c.dom.VRunStruct.VRun(new $String("root"), _arg, new sliceType([_arg$1, _arg$2, _arg$3])); /* */ $s = 4; case 4: if($c) { $c = false; _r$3 = _r$3.$blk(); } if (_r$3 && _r$3.$blk !== undefined) { break s; }
		$s = -1; return _r$3;
		/* */ } return; } if ($f === undefined) { $f = { $blk: chrome }; } $f._arg = _arg; $f._arg$1 = _arg$1; $f._arg$2 = _arg$2; $f._arg$3 = _arg$3; $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f._r$3 = _r$3; $f.body = body; $f.c = c; $f.footer = footer; $f.header = header; $f.$s = $s; $f.$r = $r; return $f;
	};
	filter = function(c, done, active) {
		var _arg, _arg$1, _arg$2, _arg$3, _arg$4, _r, _r$1, _r$2, _r$3, _r$4, _tmp, _tmp$1, active, activeLabel, c, done, doneLabel, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _arg = $f._arg; _arg$1 = $f._arg$1; _arg$2 = $f._arg$2; _arg$3 = $f._arg$3; _arg$4 = $f._arg$4; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; _r$3 = $f._r$3; _r$4 = $f._r$4; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; active = $f.active; activeLabel = $f.activeLabel; c = $f.c; done = $f.done; doneLabel = $f.doneLabel; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_tmp = "Show Completed";
		_tmp$1 = "Show Incomplete";
		doneLabel = _tmp;
		activeLabel = _tmp$1;
		if (done.Value) {
			doneLabel = "Showing Completed";
		}
		if (active.Value) {
			activeLabel = "Showing Incomplete";
		}
		_arg = new dom.Styles.ptr("", new dom.Size.ptr("", 0, 0, 0, 0), new dom.Size.ptr("", 0, 0, 0, 0), "", "", 0, 0, 0);
		_r = c.dom.CheckboxEditStruct.CheckboxEdit(new $String("c1"), new dom.Styles.ptr("", new dom.Size.ptr("", 0, 0, 0, 0), new dom.Size.ptr("", 0, 0, 0, 0), "", "", 0, 0, 0), done, "done"); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_arg$1 = _r;
		_r$1 = c.dom.LabelViewStruct.LabelView(new $String("l1"), new dom.Styles.ptr("", new dom.Size.ptr("", 0, 0, 0, 0), new dom.Size.ptr("", 0, 0, 0, 0), "", "", 0, 0, 0), doneLabel, "done"); /* */ $s = 2; case 2: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		_arg$2 = _r$1;
		_r$2 = c.dom.CheckboxEditStruct.CheckboxEdit(new $String("c2"), new dom.Styles.ptr("", new dom.Size.ptr("", 0, 0, 0, 0), new dom.Size.ptr("", 0, 0, 0, 0), "", "", 0, 0, 0), active, "notDone"); /* */ $s = 3; case 3: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
		_arg$3 = _r$2;
		_r$3 = c.dom.LabelViewStruct.LabelView(new $String("l2"), new dom.Styles.ptr("", new dom.Size.ptr("", 0, 0, 0, 0), new dom.Size.ptr("", 0, 0, 0, 0), "", "", 0, 0, 0), activeLabel, "notDone"); /* */ $s = 4; case 4: if($c) { $c = false; _r$3 = _r$3.$blk(); } if (_r$3 && _r$3.$blk !== undefined) { break s; }
		_arg$4 = _r$3;
		_r$4 = c.dom.RunStruct.Run(new $String("root"), _arg, new sliceType([_arg$1, _arg$2, _arg$3, _arg$4])); /* */ $s = 5; case 5: if($c) { $c = false; _r$4 = _r$4.$blk(); } if (_r$4 && _r$4.$blk !== undefined) { break s; }
		$s = -1; return _r$4;
		/* */ } return; } if ($f === undefined) { $f = { $blk: filter }; } $f._arg = _arg; $f._arg$1 = _arg$1; $f._arg$2 = _arg$2; $f._arg$3 = _arg$3; $f._arg$4 = _arg$4; $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f._r$3 = _r$3; $f._r$4 = _r$4; $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f.active = active; $f.activeLabel = activeLabel; $f.c = c; $f.done = done; $f.doneLabel = doneLabel; $f.$s = $s; $f.$r = $r; return $f;
	};
	chromeCtx.ptr.prototype.areArgsSame = function(header, body, footer) {
		var body, c, footer, header;
		c = this;
		if (!($interfaceIsEqual(header, c.memoized.header))) {
			return false;
		}
		if (!($interfaceIsEqual(body, c.memoized.body))) {
			return false;
		}
		return $interfaceIsEqual(footer, c.memoized.footer);
	};
	chromeCtx.prototype.areArgsSame = function(header, body, footer) { return this.$val.areArgsSame(header, body, footer); };
	chromeCtx.ptr.prototype.refreshIfNeeded = function(header, body, footer) {
		var _r, body, c, footer, header, result1, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; body = $f.body; c = $f.c; footer = $f.footer; header = $f.header; result1 = $f.result1; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		result1 = $ifaceNil;
		c = this;
		/* */ if (!c.initialized || !c.areArgsSame(header, body, footer)) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (!c.initialized || !c.areArgsSame(header, body, footer)) { */ case 1:
			_r = c.refresh(header, body, footer); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			result1 = _r;
			$s = -1; return result1;
		/* } */ case 2:
		result1 = c.memoized.result1;
		$s = -1; return result1;
		/* */ } return; } if ($f === undefined) { $f = { $blk: chromeCtx.ptr.prototype.refreshIfNeeded }; } $f._r = _r; $f.body = body; $f.c = c; $f.footer = footer; $f.header = header; $f.result1 = result1; $f.$s = $s; $f.$r = $r; return $f;
	};
	chromeCtx.prototype.refreshIfNeeded = function(header, body, footer) { return this.$val.refreshIfNeeded(header, body, footer); };
	chromeCtx.ptr.prototype.refresh = function(header, body, footer) {
		var _r, _tmp, _tmp$1, _tmp$2, body, c, footer, header, result1, $s, $deferred, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; _tmp$2 = $f._tmp$2; body = $f.body; c = $f.c; footer = $f.footer; header = $f.header; result1 = $f.result1; $s = $f.$s; $deferred = $f.$deferred; $r = $f.$r; } var $err = null; try { s: while (true) { switch ($s) { case 0: $deferred = []; $deferred.index = $curGoroutine.deferStack.length; $curGoroutine.deferStack.push($deferred);
		body = [body];
		c = [c];
		footer = [footer];
		header = [header];
		result1 = $ifaceNil;
		c[0] = this;
		c[0].initialized = true;
		c[0].stateHandler.Handle = (function(body, c, footer, header) { return function $b() {
			var _r, $s, $r;
			/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
			_r = c[0].refresh(header[0], body[0], footer[0]); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			_r;
			$s = -1; return;
			/* */ } return; } if ($f === undefined) { $f = { $blk: $b }; } $f._r = _r; $f.$s = $s; $f.$r = $r; return $f;
		}; })(body, c, footer, header);
		_tmp = header[0];
		_tmp$1 = body[0];
		_tmp$2 = footer[0];
		c[0].memoized.header = _tmp;
		c[0].memoized.body = _tmp$1;
		c[0].memoized.footer = _tmp$2;
		c[0].Cache.Begin();
		$deferred.push([$methodVal(c[0].Cache, "End"), []]);
		c[0].dom.FixedStruct.Begin();
		$deferred.push([$methodVal(c[0].dom.FixedStruct, "End"), []]);
		c[0].dom.StretchStruct.Begin();
		$deferred.push([$methodVal(c[0].dom.StretchStruct, "End"), []]);
		c[0].dom.VRunStruct.Begin();
		$deferred.push([$methodVal(c[0].dom.VRunStruct, "End"), []]);
		_r = chrome(c[0], header[0], body[0], footer[0]); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		c[0].memoized.result1 = _r;
		result1 = c[0].memoized.result1;
		$s = -1; return result1;
		/* */ } return; } } catch(err) { $err = err; $s = -1; } finally { $callDeferred($deferred, $err); if (!$curGoroutine.asleep) { return  result1; } if($curGoroutine.asleep) { if ($f === undefined) { $f = { $blk: chromeCtx.ptr.prototype.refresh }; } $f._r = _r; $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f._tmp$2 = _tmp$2; $f.body = body; $f.c = c; $f.footer = footer; $f.header = header; $f.result1 = result1; $f.$s = $s; $f.$deferred = $deferred; $f.$r = $r; return $f; } }
	};
	chromeCtx.prototype.refresh = function(header, body, footer) { return this.$val.refresh(header, body, footer); };
	chromeCtx.ptr.prototype.close = function() {
		var c, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; c = $f.c; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		c = this;
		c.Cache.Begin();
		$r = c.Cache.End(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		c.dom.FixedStruct.Begin();
		$r = c.dom.FixedStruct.End(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		c.dom.StretchStruct.Begin();
		$r = c.dom.StretchStruct.End(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		c.dom.VRunStruct.Begin();
		$r = c.dom.VRunStruct.End(); /* */ $s = 4; case 4: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* */ if (!(c.finalizer === $throwNilPointerError)) { $s = 5; continue; }
		/* */ $s = 6; continue;
		/* if (!(c.finalizer === $throwNilPointerError)) { */ case 5:
			$r = c.finalizer(); /* */ $s = 7; case 7: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* } */ case 6:
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: chromeCtx.ptr.prototype.close }; } $f.c = c; $f.$s = $s; $f.$r = $r; return $f;
	};
	chromeCtx.prototype.close = function() { return this.$val.close(); };
	ChromeStruct.ptr.prototype.Begin = function() {
		var _tmp, _tmp$1, c;
		c = this;
		_tmp = c.current;
		_tmp$1 = $makeMap($emptyInterface.keyFor, []);
		c.old = _tmp;
		c.current = _tmp$1;
	};
	ChromeStruct.prototype.Begin = function() { return this.$val.Begin(); };
	ChromeStruct.ptr.prototype.End = function() {
		var _entry, _i, _keys, _ref, c, ctx, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _entry = $f._entry; _i = $f._i; _keys = $f._keys; _ref = $f._ref; c = $f.c; ctx = $f.ctx; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		c = this;
		_ref = c.old;
		_i = 0;
		_keys = $keys(_ref);
		/* while (true) { */ case 1:
			/* if (!(_i < _keys.length)) { break; } */ if(!(_i < _keys.length)) { $s = 2; continue; }
			_entry = _ref[_keys[_i]];
			if (_entry === undefined) {
				_i++;
				/* continue; */ $s = 1; continue;
			}
			ctx = _entry.v;
			$r = ctx.close(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
			_i++;
		/* } */ $s = 1; continue; case 2:
		c.old = false;
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: ChromeStruct.ptr.prototype.End }; } $f._entry = _entry; $f._i = _i; $f._keys = _keys; $f._ref = _ref; $f.c = c; $f.ctx = ctx; $f.$s = $s; $f.$r = $r; return $f;
	};
	ChromeStruct.prototype.End = function() { return this.$val.End(); };
	ChromeStruct.ptr.prototype.Chrome = function(cKey, header, body, footer) {
		var _entry, _key, _r, _tuple, body, c, cKey, cOld, footer, header, ok, result1, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _entry = $f._entry; _key = $f._key; _r = $f._r; _tuple = $f._tuple; body = $f.body; c = $f.c; cKey = $f.cKey; cOld = $f.cOld; footer = $f.footer; header = $f.header; ok = $f.ok; result1 = $f.result1; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		result1 = $ifaceNil;
		c = this;
		_tuple = (_entry = c.old[$emptyInterface.keyFor(cKey)], _entry !== undefined ? [_entry.v, true] : [ptrType.nil, false]);
		cOld = _tuple[0];
		ok = _tuple[1];
		if (ok) {
			delete c.old[$emptyInterface.keyFor(cKey)];
		} else {
			cOld = new chromeCtx.ptr(new core.Cache.ptr(false, false), $throwNilPointerError, false, new core.Handler.ptr($throwNilPointerError), new structType.ptr(new dom.FixedStruct.ptr(false, false), new dom.StretchStruct.ptr(false, false), new dom.VRunStruct.ptr(false, false)), new structType$1.ptr($ifaceNil, $ifaceNil, $ifaceNil, $ifaceNil));
		}
		_key = cKey; (c.current || $throwRuntimeError("assignment to entry in nil map"))[$emptyInterface.keyFor(_key)] = { k: _key, v: cOld };
		_r = cOld.refreshIfNeeded(header, body, footer); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		result1 = _r;
		$s = -1; return result1;
		/* */ } return; } if ($f === undefined) { $f = { $blk: ChromeStruct.ptr.prototype.Chrome }; } $f._entry = _entry; $f._key = _key; $f._r = _r; $f._tuple = _tuple; $f.body = body; $f.c = c; $f.cKey = cKey; $f.cOld = cOld; $f.footer = footer; $f.header = header; $f.ok = ok; $f.result1 = result1; $f.$s = $s; $f.$r = $r; return $f;
	};
	ChromeStruct.prototype.Chrome = function(cKey, header, body, footer) { return this.$val.Chrome(cKey, header, body, footer); };
	filterCtx.ptr.prototype.areArgsSame = function(done, active) {
		var active, c, done;
		c = this;
		if (!(done === c.memoized.done)) {
			return false;
		}
		return active === c.memoized.active;
	};
	filterCtx.prototype.areArgsSame = function(done, active) { return this.$val.areArgsSame(done, active); };
	filterCtx.ptr.prototype.refreshIfNeeded = function(done, active) {
		var _r, active, c, done, result1, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; active = $f.active; c = $f.c; done = $f.done; result1 = $f.result1; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		result1 = $ifaceNil;
		c = this;
		/* */ if (!c.initialized || !c.areArgsSame(done, active)) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (!c.initialized || !c.areArgsSame(done, active)) { */ case 1:
			_r = c.refresh(done, active); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			result1 = _r;
			$s = -1; return result1;
		/* } */ case 2:
		result1 = c.memoized.result1;
		$s = -1; return result1;
		/* */ } return; } if ($f === undefined) { $f = { $blk: filterCtx.ptr.prototype.refreshIfNeeded }; } $f._r = _r; $f.active = active; $f.c = c; $f.done = done; $f.result1 = result1; $f.$s = $s; $f.$r = $r; return $f;
	};
	filterCtx.prototype.refreshIfNeeded = function(done, active) { return this.$val.refreshIfNeeded(done, active); };
	filterCtx.ptr.prototype.refresh = function(done, active) {
		var _r, _tmp, _tmp$1, active, c, done, result1, $s, $deferred, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; active = $f.active; c = $f.c; done = $f.done; result1 = $f.result1; $s = $f.$s; $deferred = $f.$deferred; $r = $f.$r; } var $err = null; try { s: while (true) { switch ($s) { case 0: $deferred = []; $deferred.index = $curGoroutine.deferStack.length; $curGoroutine.deferStack.push($deferred);
		active = [active];
		c = [c];
		done = [done];
		result1 = $ifaceNil;
		c[0] = this;
		c[0].initialized = true;
		c[0].stateHandler.Handle = (function(active, c, done) { return function $b() {
			var _r, $s, $r;
			/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
			_r = c[0].refresh(done[0], active[0]); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			_r;
			$s = -1; return;
			/* */ } return; } if ($f === undefined) { $f = { $blk: $b }; } $f._r = _r; $f.$s = $s; $f.$r = $r; return $f;
		}; })(active, c, done);
		_tmp = done[0];
		_tmp$1 = active[0];
		c[0].memoized.done = _tmp;
		c[0].memoized.active = _tmp$1;
		c[0].Cache.Begin();
		$deferred.push([$methodVal(c[0].Cache, "End"), []]);
		c[0].dom.CheckboxEditStruct.Begin();
		$deferred.push([$methodVal(c[0].dom.CheckboxEditStruct, "End"), []]);
		c[0].dom.LabelViewStruct.Begin();
		$deferred.push([$methodVal(c[0].dom.LabelViewStruct, "End"), []]);
		c[0].dom.RunStruct.Begin();
		$deferred.push([$methodVal(c[0].dom.RunStruct, "End"), []]);
		_r = filter(c[0], done[0], active[0]); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		c[0].memoized.result1 = _r;
		result1 = c[0].memoized.result1;
		$s = -1; return result1;
		/* */ } return; } } catch(err) { $err = err; $s = -1; } finally { $callDeferred($deferred, $err); if (!$curGoroutine.asleep) { return  result1; } if($curGoroutine.asleep) { if ($f === undefined) { $f = { $blk: filterCtx.ptr.prototype.refresh }; } $f._r = _r; $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f.active = active; $f.c = c; $f.done = done; $f.result1 = result1; $f.$s = $s; $f.$deferred = $deferred; $f.$r = $r; return $f; } }
	};
	filterCtx.prototype.refresh = function(done, active) { return this.$val.refresh(done, active); };
	filterCtx.ptr.prototype.close = function() {
		var c, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; c = $f.c; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		c = this;
		c.Cache.Begin();
		$r = c.Cache.End(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		c.dom.CheckboxEditStruct.Begin();
		$r = c.dom.CheckboxEditStruct.End(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		c.dom.LabelViewStruct.Begin();
		$r = c.dom.LabelViewStruct.End(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		c.dom.RunStruct.Begin();
		$r = c.dom.RunStruct.End(); /* */ $s = 4; case 4: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* */ if (!(c.finalizer === $throwNilPointerError)) { $s = 5; continue; }
		/* */ $s = 6; continue;
		/* if (!(c.finalizer === $throwNilPointerError)) { */ case 5:
			$r = c.finalizer(); /* */ $s = 7; case 7: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* } */ case 6:
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: filterCtx.ptr.prototype.close }; } $f.c = c; $f.$s = $s; $f.$r = $r; return $f;
	};
	filterCtx.prototype.close = function() { return this.$val.close(); };
	FilterStruct.ptr.prototype.Begin = function() {
		var _tmp, _tmp$1, c;
		c = this;
		_tmp = c.current;
		_tmp$1 = $makeMap($emptyInterface.keyFor, []);
		c.old = _tmp;
		c.current = _tmp$1;
	};
	FilterStruct.prototype.Begin = function() { return this.$val.Begin(); };
	FilterStruct.ptr.prototype.End = function() {
		var _entry, _i, _keys, _ref, c, ctx, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _entry = $f._entry; _i = $f._i; _keys = $f._keys; _ref = $f._ref; c = $f.c; ctx = $f.ctx; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		c = this;
		_ref = c.old;
		_i = 0;
		_keys = $keys(_ref);
		/* while (true) { */ case 1:
			/* if (!(_i < _keys.length)) { break; } */ if(!(_i < _keys.length)) { $s = 2; continue; }
			_entry = _ref[_keys[_i]];
			if (_entry === undefined) {
				_i++;
				/* continue; */ $s = 1; continue;
			}
			ctx = _entry.v;
			$r = ctx.close(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
			_i++;
		/* } */ $s = 1; continue; case 2:
		c.old = false;
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: FilterStruct.ptr.prototype.End }; } $f._entry = _entry; $f._i = _i; $f._keys = _keys; $f._ref = _ref; $f.c = c; $f.ctx = ctx; $f.$s = $s; $f.$r = $r; return $f;
	};
	FilterStruct.prototype.End = function() { return this.$val.End(); };
	FilterStruct.ptr.prototype.Filter = function(cKey, done, active) {
		var _entry, _key, _r, _tuple, active, c, cKey, cOld, done, ok, result1, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _entry = $f._entry; _key = $f._key; _r = $f._r; _tuple = $f._tuple; active = $f.active; c = $f.c; cKey = $f.cKey; cOld = $f.cOld; done = $f.done; ok = $f.ok; result1 = $f.result1; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		result1 = $ifaceNil;
		c = this;
		_tuple = (_entry = c.old[$emptyInterface.keyFor(cKey)], _entry !== undefined ? [_entry.v, true] : [ptrType$1.nil, false]);
		cOld = _tuple[0];
		ok = _tuple[1];
		if (ok) {
			delete c.old[$emptyInterface.keyFor(cKey)];
		} else {
			cOld = new filterCtx.ptr(new core.Cache.ptr(false, false), $throwNilPointerError, false, new core.Handler.ptr($throwNilPointerError), new structType$2.ptr(new dom.CheckboxEditStruct.ptr(false, false), new dom.LabelViewStruct.ptr(false, false), new dom.RunStruct.ptr(false, false)), new structType$3.ptr(ptrType$2.nil, ptrType$2.nil, $ifaceNil));
		}
		_key = cKey; (c.current || $throwRuntimeError("assignment to entry in nil map"))[$emptyInterface.keyFor(_key)] = { k: _key, v: cOld };
		_r = cOld.refreshIfNeeded(done, active); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		result1 = _r;
		$s = -1; return result1;
		/* */ } return; } if ($f === undefined) { $f = { $blk: FilterStruct.ptr.prototype.Filter }; } $f._entry = _entry; $f._key = _key; $f._r = _r; $f._tuple = _tuple; $f.active = active; $f.c = c; $f.cKey = cKey; $f.cOld = cOld; $f.done = done; $f.ok = ok; $f.result1 = result1; $f.$s = $s; $f.$r = $r; return $f;
	};
	FilterStruct.prototype.Filter = function(cKey, done, active) { return this.$val.Filter(cKey, done, active); };
	ptrType.methods = [{prop: "areArgsSame", name: "areArgsSame", pkg: "github.com/dotchain/fuss/todo/controls", typ: $funcType([dom.Element, dom.Element, dom.Element], [$Bool], false)}, {prop: "refreshIfNeeded", name: "refreshIfNeeded", pkg: "github.com/dotchain/fuss/todo/controls", typ: $funcType([dom.Element, dom.Element, dom.Element], [dom.Element], false)}, {prop: "refresh", name: "refresh", pkg: "github.com/dotchain/fuss/todo/controls", typ: $funcType([dom.Element, dom.Element, dom.Element], [dom.Element], false)}, {prop: "close", name: "close", pkg: "github.com/dotchain/fuss/todo/controls", typ: $funcType([], [], false)}];
	ptrType$3.methods = [{prop: "Begin", name: "Begin", pkg: "", typ: $funcType([], [], false)}, {prop: "End", name: "End", pkg: "", typ: $funcType([], [], false)}, {prop: "Chrome", name: "Chrome", pkg: "", typ: $funcType([$emptyInterface, dom.Element, dom.Element, dom.Element], [dom.Element], false)}];
	ptrType$1.methods = [{prop: "areArgsSame", name: "areArgsSame", pkg: "github.com/dotchain/fuss/todo/controls", typ: $funcType([ptrType$2, ptrType$2], [$Bool], false)}, {prop: "refreshIfNeeded", name: "refreshIfNeeded", pkg: "github.com/dotchain/fuss/todo/controls", typ: $funcType([ptrType$2, ptrType$2], [dom.Element], false)}, {prop: "refresh", name: "refresh", pkg: "github.com/dotchain/fuss/todo/controls", typ: $funcType([ptrType$2, ptrType$2], [dom.Element], false)}, {prop: "close", name: "close", pkg: "github.com/dotchain/fuss/todo/controls", typ: $funcType([], [], false)}];
	ptrType$4.methods = [{prop: "Begin", name: "Begin", pkg: "", typ: $funcType([], [], false)}, {prop: "End", name: "End", pkg: "", typ: $funcType([], [], false)}, {prop: "Filter", name: "Filter", pkg: "", typ: $funcType([$emptyInterface, ptrType$2, ptrType$2], [dom.Element], false)}];
	chromeCtx.init("github.com/dotchain/fuss/todo/controls", [{prop: "Cache", name: "Cache", embedded: true, exported: true, typ: core.Cache, tag: ""}, {prop: "finalizer", name: "finalizer", embedded: false, exported: false, typ: funcType, tag: ""}, {prop: "initialized", name: "initialized", embedded: false, exported: false, typ: $Bool, tag: ""}, {prop: "stateHandler", name: "stateHandler", embedded: false, exported: false, typ: core.Handler, tag: ""}, {prop: "dom", name: "dom", embedded: false, exported: false, typ: structType, tag: ""}, {prop: "memoized", name: "memoized", embedded: false, exported: false, typ: structType$1, tag: ""}]);
	ChromeStruct.init("github.com/dotchain/fuss/todo/controls", [{prop: "old", name: "old", embedded: false, exported: false, typ: mapType, tag: ""}, {prop: "current", name: "current", embedded: false, exported: false, typ: mapType, tag: ""}]);
	filterCtx.init("github.com/dotchain/fuss/todo/controls", [{prop: "Cache", name: "Cache", embedded: true, exported: true, typ: core.Cache, tag: ""}, {prop: "finalizer", name: "finalizer", embedded: false, exported: false, typ: funcType, tag: ""}, {prop: "initialized", name: "initialized", embedded: false, exported: false, typ: $Bool, tag: ""}, {prop: "stateHandler", name: "stateHandler", embedded: false, exported: false, typ: core.Handler, tag: ""}, {prop: "dom", name: "dom", embedded: false, exported: false, typ: structType$2, tag: ""}, {prop: "memoized", name: "memoized", embedded: false, exported: false, typ: structType$3, tag: ""}]);
	FilterStruct.init("github.com/dotchain/fuss/todo/controls", [{prop: "old", name: "old", embedded: false, exported: false, typ: mapType$1, tag: ""}, {prop: "current", name: "current", embedded: false, exported: false, typ: mapType$1, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = core.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = dom.$init(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["github.com/gopherjs/gopherjs/nosync"] = (function() {
	var $pkg = {}, $init, Once, funcType$1, ptrType$4;
	Once = $pkg.Once = $newType(0, $kindStruct, "nosync.Once", true, "github.com/gopherjs/gopherjs/nosync", true, function(doing_, done_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.doing = false;
			this.done = false;
			return;
		}
		this.doing = doing_;
		this.done = done_;
	});
	funcType$1 = $funcType([], [], false);
	ptrType$4 = $ptrType(Once);
	Once.ptr.prototype.Do = function(f) {
		var f, o, $s, $deferred, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; f = $f.f; o = $f.o; $s = $f.$s; $deferred = $f.$deferred; $r = $f.$r; } var $err = null; try { s: while (true) { switch ($s) { case 0: $deferred = []; $deferred.index = $curGoroutine.deferStack.length; $curGoroutine.deferStack.push($deferred);
		o = [o];
		o[0] = this;
		if (o[0].done) {
			$s = -1; return;
		}
		if (o[0].doing) {
			$panic(new $String("nosync: Do called within f"));
		}
		o[0].doing = true;
		$deferred.push([(function(o) { return function() {
			o[0].doing = false;
			o[0].done = true;
		}; })(o), []]);
		$r = f(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$s = -1; return;
		/* */ } return; } } catch(err) { $err = err; $s = -1; } finally { $callDeferred($deferred, $err); if($curGoroutine.asleep) { if ($f === undefined) { $f = { $blk: Once.ptr.prototype.Do }; } $f.f = f; $f.o = o; $f.$s = $s; $f.$deferred = $deferred; $f.$r = $r; return $f; } }
	};
	Once.prototype.Do = function(f) { return this.$val.Do(f); };
	ptrType$4.methods = [{prop: "Do", name: "Do", pkg: "", typ: $funcType([funcType$1], [], false)}];
	Once.init("github.com/gopherjs/gopherjs/nosync", [{prop: "doing", name: "doing", embedded: false, exported: false, typ: $Bool, tag: ""}, {prop: "done", name: "done", embedded: false, exported: false, typ: $Bool, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["syscall"] = (function() {
	var $pkg = {}, $init, errors, js, race, runtime, sync, mmapper, Errno, sliceType, sliceType$1, ptrType$2, arrayType$10, structType, ptrType$27, mapType, funcType$2, funcType$3, warningPrinted, lineBuffer, syscallModule, alreadyTriedToLoad, minusOne, envs, freebsdConfArch, minRoutingSockaddrLen, mapper, errEAGAIN, errEINVAL, errENOENT, errors$1, init, printWarning, printToConsole, indexByte, runtime_envs, syscall, Syscall, Syscall6, rsaAlignOf, itoa, uitoa, errnoErr, mmap, munmap;
	errors = $packages["errors"];
	js = $packages["github.com/gopherjs/gopherjs/js"];
	race = $packages["internal/race"];
	runtime = $packages["runtime"];
	sync = $packages["sync"];
	mmapper = $pkg.mmapper = $newType(0, $kindStruct, "syscall.mmapper", true, "syscall", false, function(Mutex_, active_, mmap_, munmap_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Mutex = new sync.Mutex.ptr(0, 0);
			this.active = false;
			this.mmap = $throwNilPointerError;
			this.munmap = $throwNilPointerError;
			return;
		}
		this.Mutex = Mutex_;
		this.active = active_;
		this.mmap = mmap_;
		this.munmap = munmap_;
	});
	Errno = $pkg.Errno = $newType(4, $kindUintptr, "syscall.Errno", true, "syscall", true, null);
	sliceType = $sliceType($Uint8);
	sliceType$1 = $sliceType($String);
	ptrType$2 = $ptrType($Uint8);
	arrayType$10 = $arrayType($Uint8, 32);
	structType = $structType("syscall", [{prop: "addr", name: "addr", embedded: false, exported: false, typ: $Uintptr, tag: ""}, {prop: "len", name: "len", embedded: false, exported: false, typ: $Int, tag: ""}, {prop: "cap", name: "cap", embedded: false, exported: false, typ: $Int, tag: ""}]);
	ptrType$27 = $ptrType(mmapper);
	mapType = $mapType(ptrType$2, sliceType);
	funcType$2 = $funcType([$Uintptr, $Uintptr, $Int, $Int, $Int, $Int64], [$Uintptr, $error], false);
	funcType$3 = $funcType([$Uintptr, $Uintptr], [$error], false);
	init = function() {
		$flushConsole = (function() {
			if (!((lineBuffer.$length === 0))) {
				$global.console.log($externalize(($bytesToString(lineBuffer)), $String));
				lineBuffer = sliceType.nil;
			}
		});
	};
	printWarning = function() {
		if (!warningPrinted) {
			$global.console.error($externalize("warning: system calls not available, see https://github.com/gopherjs/gopherjs/blob/master/doc/syscalls.md", $String));
		}
		warningPrinted = true;
	};
	printToConsole = function(b) {
		var b, goPrintToConsole, i;
		goPrintToConsole = $global.goPrintToConsole;
		if (!(goPrintToConsole === undefined)) {
			goPrintToConsole(b);
			return;
		}
		lineBuffer = $appendSlice(lineBuffer, b);
		while (true) {
			i = indexByte(lineBuffer, 10);
			if (i === -1) {
				break;
			}
			$global.console.log($externalize(($bytesToString($subslice(lineBuffer, 0, i))), $String));
			lineBuffer = $subslice(lineBuffer, (i + 1 >> 0));
		}
	};
	indexByte = function(s, c) {
		var _i, _ref, b, c, i, s;
		_ref = s;
		_i = 0;
		while (true) {
			if (!(_i < _ref.$length)) { break; }
			i = _i;
			b = ((_i < 0 || _i >= _ref.$length) ? ($throwRuntimeError("index out of range"), undefined) : _ref.$array[_ref.$offset + _i]);
			if (b === c) {
				return i;
			}
			_i++;
		}
		return -1;
	};
	runtime_envs = function() {
		var envkeys, envs$1, i, jsEnv, key, process;
		process = $global.process;
		if (process === undefined) {
			return sliceType$1.nil;
		}
		jsEnv = process.env;
		envkeys = $global.Object.keys(jsEnv);
		envs$1 = $makeSlice(sliceType$1, $parseInt(envkeys.length));
		i = 0;
		while (true) {
			if (!(i < $parseInt(envkeys.length))) { break; }
			key = $internalize(envkeys[i], $String);
			((i < 0 || i >= envs$1.$length) ? ($throwRuntimeError("index out of range"), undefined) : envs$1.$array[envs$1.$offset + i] = key + "=" + $internalize(jsEnv[$externalize(key, $String)], $String));
			i = i + (1) >> 0;
		}
		return envs$1;
	};
	syscall = function(name) {
		var name, require, $deferred;
		/* */ var $err = null; try { $deferred = []; $deferred.index = $curGoroutine.deferStack.length; $curGoroutine.deferStack.push($deferred);
		$deferred.push([(function() {
			$recover();
		}), []]);
		if (syscallModule === null) {
			if (alreadyTriedToLoad) {
				return null;
			}
			alreadyTriedToLoad = true;
			require = $global.require;
			if (require === undefined) {
				$panic(new $String(""));
			}
			syscallModule = require($externalize("syscall", $String));
		}
		return syscallModule[$externalize(name, $String)];
		/* */ } catch(err) { $err = err; return null; } finally { $callDeferred($deferred, $err); }
	};
	Syscall = function(trap, a1, a2, a3) {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tmp$8, a1, a2, a3, array, err, f, r, r1, r2, slice, trap;
		r1 = 0;
		r2 = 0;
		err = 0;
		f = syscall("Syscall");
		if (!(f === null)) {
			r = f(trap, a1, a2, a3);
			_tmp = ((($parseInt(r[0]) >> 0) >>> 0));
			_tmp$1 = ((($parseInt(r[1]) >> 0) >>> 0));
			_tmp$2 = ((($parseInt(r[2]) >> 0) >>> 0));
			r1 = _tmp;
			r2 = _tmp$1;
			err = _tmp$2;
			return [r1, r2, err];
		}
		if ((trap === 4) && ((a1 === 1) || (a1 === 2))) {
			array = a2;
			slice = $makeSlice(sliceType, $parseInt(array.length));
			slice.$array = array;
			printToConsole(slice);
			_tmp$3 = (($parseInt(array.length) >>> 0));
			_tmp$4 = 0;
			_tmp$5 = 0;
			r1 = _tmp$3;
			r2 = _tmp$4;
			err = _tmp$5;
			return [r1, r2, err];
		}
		if (trap === 1) {
			runtime.Goexit();
		}
		printWarning();
		_tmp$6 = ((minusOne >>> 0));
		_tmp$7 = 0;
		_tmp$8 = 13;
		r1 = _tmp$6;
		r2 = _tmp$7;
		err = _tmp$8;
		return [r1, r2, err];
	};
	$pkg.Syscall = Syscall;
	Syscall6 = function(trap, a1, a2, a3, a4, a5, a6) {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, a1, a2, a3, a4, a5, a6, err, f, r, r1, r2, trap;
		r1 = 0;
		r2 = 0;
		err = 0;
		f = syscall("Syscall6");
		if (!(f === null)) {
			r = f(trap, a1, a2, a3, a4, a5, a6);
			_tmp = ((($parseInt(r[0]) >> 0) >>> 0));
			_tmp$1 = ((($parseInt(r[1]) >> 0) >>> 0));
			_tmp$2 = ((($parseInt(r[2]) >> 0) >>> 0));
			r1 = _tmp;
			r2 = _tmp$1;
			err = _tmp$2;
			return [r1, r2, err];
		}
		if (!((trap === 202))) {
			printWarning();
		}
		_tmp$3 = ((minusOne >>> 0));
		_tmp$4 = 0;
		_tmp$5 = 13;
		r1 = _tmp$3;
		r2 = _tmp$4;
		err = _tmp$5;
		return [r1, r2, err];
	};
	$pkg.Syscall6 = Syscall6;
	rsaAlignOf = function(salen) {
		var salen, salign;
		salign = 8;
		if (true) {
			salign = 4;
		} else if (false) {
			salign = 8;
		} else if (false) {
			if (freebsdConfArch === "amd64") {
				salign = 8;
			}
		}
		if (salen === 0) {
			return salign;
		}
		return (((salen + salign >> 0) - 1 >> 0)) & (~((salign - 1 >> 0)) >> 0);
	};
	itoa = function(val) {
		var val;
		if (val < 0) {
			return "-" + uitoa(((-val >>> 0)));
		}
		return uitoa(((val >>> 0)));
	};
	uitoa = function(val) {
		var _q, _r, buf, i, val;
		buf = arrayType$10.zero();
		i = 31;
		while (true) {
			if (!(val >= 10)) { break; }
			((i < 0 || i >= buf.length) ? ($throwRuntimeError("index out of range"), undefined) : buf[i] = ((((_r = val % 10, _r === _r ? _r : $throwRuntimeError("integer divide by zero")) + 48 >>> 0) << 24 >>> 24)));
			i = i - (1) >> 0;
			val = (_q = val / (10), (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >>> 0 : $throwRuntimeError("integer divide by zero"));
		}
		((i < 0 || i >= buf.length) ? ($throwRuntimeError("index out of range"), undefined) : buf[i] = (((val + 48 >>> 0) << 24 >>> 24)));
		return ($bytesToString($subslice(new sliceType(buf), i)));
	};
	mmapper.ptr.prototype.Mmap = function(fd, offset, length, prot, flags) {
		var _key, _r, _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tuple, addr, b, data, err, errno, fd, flags, length, m, offset, p, prot, sl, $s, $deferred, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _key = $f._key; _r = $f._r; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; _tmp$2 = $f._tmp$2; _tmp$3 = $f._tmp$3; _tmp$4 = $f._tmp$4; _tmp$5 = $f._tmp$5; _tuple = $f._tuple; addr = $f.addr; b = $f.b; data = $f.data; err = $f.err; errno = $f.errno; fd = $f.fd; flags = $f.flags; length = $f.length; m = $f.m; offset = $f.offset; p = $f.p; prot = $f.prot; sl = $f.sl; $s = $f.$s; $deferred = $f.$deferred; $r = $f.$r; } var $err = null; try { s: while (true) { switch ($s) { case 0: $deferred = []; $deferred.index = $curGoroutine.deferStack.length; $curGoroutine.deferStack.push($deferred);
		sl = [sl];
		data = sliceType.nil;
		err = $ifaceNil;
		m = this;
		if (length <= 0) {
			_tmp = sliceType.nil;
			_tmp$1 = new Errno(22);
			data = _tmp;
			err = _tmp$1;
			$s = -1; return [data, err];
		}
		_r = m.mmap(0, ((length >>> 0)), prot, flags, fd, offset); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_tuple = _r;
		addr = _tuple[0];
		errno = _tuple[1];
		if (!($interfaceIsEqual(errno, $ifaceNil))) {
			_tmp$2 = sliceType.nil;
			_tmp$3 = errno;
			data = _tmp$2;
			err = _tmp$3;
			$s = -1; return [data, err];
		}
		sl[0] = new structType.ptr(addr, length, length);
		b = sl[0];
		p = $indexPtr(b.$array, b.$offset + (b.$capacity - 1 >> 0), ptrType$2);
		$r = m.Mutex.Lock(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$deferred.push([$methodVal(m.Mutex, "Unlock"), []]);
		_key = p; (m.active || $throwRuntimeError("assignment to entry in nil map"))[ptrType$2.keyFor(_key)] = { k: _key, v: b };
		_tmp$4 = b;
		_tmp$5 = $ifaceNil;
		data = _tmp$4;
		err = _tmp$5;
		$s = -1; return [data, err];
		/* */ } return; } } catch(err) { $err = err; $s = -1; } finally { $callDeferred($deferred, $err); if (!$curGoroutine.asleep) { return  [data, err]; } if($curGoroutine.asleep) { if ($f === undefined) { $f = { $blk: mmapper.ptr.prototype.Mmap }; } $f._key = _key; $f._r = _r; $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f._tmp$2 = _tmp$2; $f._tmp$3 = _tmp$3; $f._tmp$4 = _tmp$4; $f._tmp$5 = _tmp$5; $f._tuple = _tuple; $f.addr = addr; $f.b = b; $f.data = data; $f.err = err; $f.errno = errno; $f.fd = fd; $f.flags = flags; $f.length = length; $f.m = m; $f.offset = offset; $f.p = p; $f.prot = prot; $f.sl = sl; $f.$s = $s; $f.$deferred = $deferred; $f.$r = $r; return $f; } }
	};
	mmapper.prototype.Mmap = function(fd, offset, length, prot, flags) { return this.$val.Mmap(fd, offset, length, prot, flags); };
	mmapper.ptr.prototype.Munmap = function(data) {
		var _entry, _r, b, data, err, errno, m, p, $s, $deferred, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _entry = $f._entry; _r = $f._r; b = $f.b; data = $f.data; err = $f.err; errno = $f.errno; m = $f.m; p = $f.p; $s = $f.$s; $deferred = $f.$deferred; $r = $f.$r; } var $err = null; try { s: while (true) { switch ($s) { case 0: $deferred = []; $deferred.index = $curGoroutine.deferStack.length; $curGoroutine.deferStack.push($deferred);
		err = $ifaceNil;
		m = this;
		if ((data.$length === 0) || !((data.$length === data.$capacity))) {
			err = new Errno(22);
			$s = -1; return err;
		}
		p = $indexPtr(data.$array, data.$offset + (data.$capacity - 1 >> 0), ptrType$2);
		$r = m.Mutex.Lock(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$deferred.push([$methodVal(m.Mutex, "Unlock"), []]);
		b = (_entry = m.active[ptrType$2.keyFor(p)], _entry !== undefined ? _entry.v : sliceType.nil);
		if (b === sliceType.nil || !($indexPtr(b.$array, b.$offset + 0, ptrType$2) === $indexPtr(data.$array, data.$offset + 0, ptrType$2))) {
			err = new Errno(22);
			$s = -1; return err;
		}
		_r = m.munmap((($sliceToArray(b))), ((b.$length >>> 0))); /* */ $s = 2; case 2: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		errno = _r;
		if (!($interfaceIsEqual(errno, $ifaceNil))) {
			err = errno;
			$s = -1; return err;
		}
		delete m.active[ptrType$2.keyFor(p)];
		err = $ifaceNil;
		$s = -1; return err;
		/* */ } return; } } catch(err) { $err = err; $s = -1; } finally { $callDeferred($deferred, $err); if (!$curGoroutine.asleep) { return  err; } if($curGoroutine.asleep) { if ($f === undefined) { $f = { $blk: mmapper.ptr.prototype.Munmap }; } $f._entry = _entry; $f._r = _r; $f.b = b; $f.data = data; $f.err = err; $f.errno = errno; $f.m = m; $f.p = p; $f.$s = $s; $f.$deferred = $deferred; $f.$r = $r; return $f; } }
	};
	mmapper.prototype.Munmap = function(data) { return this.$val.Munmap(data); };
	Errno.prototype.Error = function() {
		var e, s;
		e = this.$val;
		if (0 <= ((e >> 0)) && ((e >> 0)) < 106) {
			s = ((e < 0 || e >= errors$1.length) ? ($throwRuntimeError("index out of range"), undefined) : errors$1[e]);
			if (!(s === "")) {
				return s;
			}
		}
		return "errno " + itoa(((e >> 0)));
	};
	$ptrType(Errno).prototype.Error = function() { return new Errno(this.$get()).Error(); };
	Errno.prototype.Temporary = function() {
		var e;
		e = this.$val;
		return (e === 4) || (e === 24) || new Errno(e).Timeout();
	};
	$ptrType(Errno).prototype.Temporary = function() { return new Errno(this.$get()).Temporary(); };
	Errno.prototype.Timeout = function() {
		var e;
		e = this.$val;
		return (e === 35) || (e === 35) || (e === 60);
	};
	$ptrType(Errno).prototype.Timeout = function() { return new Errno(this.$get()).Timeout(); };
	errnoErr = function(e) {
		var _1, e;
		_1 = e;
		if (_1 === (0)) {
			return $ifaceNil;
		} else if (_1 === (35)) {
			return errEAGAIN;
		} else if (_1 === (22)) {
			return errEINVAL;
		} else if (_1 === (2)) {
			return errENOENT;
		}
		return new Errno(e);
	};
	mmap = function(addr, length, prot, flag, fd, pos) {
		var _tuple, addr, e1, err, fd, flag, length, pos, prot, r0, ret;
		ret = 0;
		err = $ifaceNil;
		_tuple = Syscall6(197, (addr), (length), ((prot >>> 0)), ((flag >>> 0)), ((fd >>> 0)), ((pos.$low >>> 0)));
		r0 = _tuple[0];
		e1 = _tuple[2];
		ret = (r0);
		if (!((e1 === 0))) {
			err = errnoErr(e1);
		}
		return [ret, err];
	};
	munmap = function(addr, length) {
		var _tuple, addr, e1, err, length;
		err = $ifaceNil;
		_tuple = Syscall(73, (addr), (length), 0);
		e1 = _tuple[2];
		if (!((e1 === 0))) {
			err = errnoErr(e1);
		}
		return err;
	};
	ptrType$27.methods = [{prop: "Mmap", name: "Mmap", pkg: "", typ: $funcType([$Int, $Int64, $Int, $Int, $Int], [sliceType, $error], false)}, {prop: "Munmap", name: "Munmap", pkg: "", typ: $funcType([sliceType], [$error], false)}];
	Errno.methods = [{prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}, {prop: "Temporary", name: "Temporary", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "Timeout", name: "Timeout", pkg: "", typ: $funcType([], [$Bool], false)}];
	mmapper.init("syscall", [{prop: "Mutex", name: "Mutex", embedded: true, exported: true, typ: sync.Mutex, tag: ""}, {prop: "active", name: "active", embedded: false, exported: false, typ: mapType, tag: ""}, {prop: "mmap", name: "mmap", embedded: false, exported: false, typ: funcType$2, tag: ""}, {prop: "munmap", name: "munmap", embedded: false, exported: false, typ: funcType$3, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = errors.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = js.$init(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = race.$init(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = runtime.$init(); /* */ $s = 4; case 4: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = sync.$init(); /* */ $s = 5; case 5: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		lineBuffer = sliceType.nil;
		syscallModule = null;
		freebsdConfArch = "";
		warningPrinted = false;
		alreadyTriedToLoad = false;
		minusOne = -1;
		envs = runtime_envs();
		errEAGAIN = new Errno(35);
		errEINVAL = new Errno(22);
		errENOENT = new Errno(2);
		errors$1 = $toNativeArray($kindString, ["", "operation not permitted", "no such file or directory", "no such process", "interrupted system call", "input/output error", "device not configured", "argument list too long", "exec format error", "bad file descriptor", "no child processes", "resource deadlock avoided", "cannot allocate memory", "permission denied", "bad address", "block device required", "resource busy", "file exists", "cross-device link", "operation not supported by device", "not a directory", "is a directory", "invalid argument", "too many open files in system", "too many open files", "inappropriate ioctl for device", "text file busy", "file too large", "no space left on device", "illegal seek", "read-only file system", "too many links", "broken pipe", "numerical argument out of domain", "result too large", "resource temporarily unavailable", "operation now in progress", "operation already in progress", "socket operation on non-socket", "destination address required", "message too long", "protocol wrong type for socket", "protocol not available", "protocol not supported", "socket type not supported", "operation not supported", "protocol family not supported", "address family not supported by protocol family", "address already in use", "can't assign requested address", "network is down", "network is unreachable", "network dropped connection on reset", "software caused connection abort", "connection reset by peer", "no buffer space available", "socket is already connected", "socket is not connected", "can't send after socket shutdown", "too many references: can't splice", "operation timed out", "connection refused", "too many levels of symbolic links", "file name too long", "host is down", "no route to host", "directory not empty", "too many processes", "too many users", "disc quota exceeded", "stale NFS file handle", "too many levels of remote in path", "RPC struct is bad", "RPC version wrong", "RPC prog. not avail", "program version wrong", "bad procedure for program", "no locks available", "function not implemented", "inappropriate file type or format", "authentication error", "need authenticator", "device power is off", "device error", "value too large to be stored in data type", "bad executable (or shared library)", "bad CPU type in executable", "shared library version mismatch", "malformed Mach-o file", "operation canceled", "identifier removed", "no message of desired type", "illegal byte sequence", "attribute not found", "bad message", "EMULTIHOP (Reserved)", "no message available on STREAM", "ENOLINK (Reserved)", "no STREAM resources", "not a STREAM", "protocol error", "STREAM ioctl timeout", "operation not supported on socket", "policy not found", "state not recoverable", "previous owner died"]);
		mapper = new mmapper.ptr(new sync.Mutex.ptr(0, 0), {}, mmap, munmap);
		minRoutingSockaddrLen = rsaAlignOf(0);
		init();
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["time"] = (function() {
	var $pkg = {}, $init, errors, js, nosync, runtime, syscall, ParseError, Time, Month, Weekday, Duration, Location, zone, zoneTrans, sliceType, sliceType$1, ptrType, sliceType$2, arrayType, sliceType$3, arrayType$1, arrayType$2, ptrType$2, arrayType$3, ptrType$4, ptrType$7, zoneSources, std0x, longDayNames, shortDayNames, shortMonthNames, longMonthNames, atoiError, errBad, errLeadingInt, months, days, daysBefore, utcLoc, utcLoc$24ptr, localLoc, localLoc$24ptr, localOnce, errLocation, badData, init, initLocal, runtimeNano, now, indexByte, startsWithLowerCase, nextStdChunk, match, lookup, appendInt, atoi, formatNano, quote, isDigit, getnum, cutspace, skip, Parse, parse, parseTimeZone, parseGMT, parseSignedOffset, parseNanoseconds, leadingInt, absWeekday, absClock, fmtFrac, fmtInt, lessThanHalf, absDate, daysIn, Now, unixTime, Unix, isLeap, norm, Date, div, FixedZone;
	errors = $packages["errors"];
	js = $packages["github.com/gopherjs/gopherjs/js"];
	nosync = $packages["github.com/gopherjs/gopherjs/nosync"];
	runtime = $packages["runtime"];
	syscall = $packages["syscall"];
	ParseError = $pkg.ParseError = $newType(0, $kindStruct, "time.ParseError", true, "time", true, function(Layout_, Value_, LayoutElem_, ValueElem_, Message_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Layout = "";
			this.Value = "";
			this.LayoutElem = "";
			this.ValueElem = "";
			this.Message = "";
			return;
		}
		this.Layout = Layout_;
		this.Value = Value_;
		this.LayoutElem = LayoutElem_;
		this.ValueElem = ValueElem_;
		this.Message = Message_;
	});
	Time = $pkg.Time = $newType(0, $kindStruct, "time.Time", true, "time", true, function(wall_, ext_, loc_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.wall = new $Uint64(0, 0);
			this.ext = new $Int64(0, 0);
			this.loc = ptrType$2.nil;
			return;
		}
		this.wall = wall_;
		this.ext = ext_;
		this.loc = loc_;
	});
	Month = $pkg.Month = $newType(4, $kindInt, "time.Month", true, "time", true, null);
	Weekday = $pkg.Weekday = $newType(4, $kindInt, "time.Weekday", true, "time", true, null);
	Duration = $pkg.Duration = $newType(8, $kindInt64, "time.Duration", true, "time", true, null);
	Location = $pkg.Location = $newType(0, $kindStruct, "time.Location", true, "time", true, function(name_, zone_, tx_, cacheStart_, cacheEnd_, cacheZone_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.name = "";
			this.zone = sliceType.nil;
			this.tx = sliceType$1.nil;
			this.cacheStart = new $Int64(0, 0);
			this.cacheEnd = new $Int64(0, 0);
			this.cacheZone = ptrType.nil;
			return;
		}
		this.name = name_;
		this.zone = zone_;
		this.tx = tx_;
		this.cacheStart = cacheStart_;
		this.cacheEnd = cacheEnd_;
		this.cacheZone = cacheZone_;
	});
	zone = $pkg.zone = $newType(0, $kindStruct, "time.zone", true, "time", false, function(name_, offset_, isDST_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.name = "";
			this.offset = 0;
			this.isDST = false;
			return;
		}
		this.name = name_;
		this.offset = offset_;
		this.isDST = isDST_;
	});
	zoneTrans = $pkg.zoneTrans = $newType(0, $kindStruct, "time.zoneTrans", true, "time", false, function(when_, index_, isstd_, isutc_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.when = new $Int64(0, 0);
			this.index = 0;
			this.isstd = false;
			this.isutc = false;
			return;
		}
		this.when = when_;
		this.index = index_;
		this.isstd = isstd_;
		this.isutc = isutc_;
	});
	sliceType = $sliceType(zone);
	sliceType$1 = $sliceType(zoneTrans);
	ptrType = $ptrType(zone);
	sliceType$2 = $sliceType($String);
	arrayType = $arrayType($Uint8, 20);
	sliceType$3 = $sliceType($Uint8);
	arrayType$1 = $arrayType($Uint8, 9);
	arrayType$2 = $arrayType($Uint8, 64);
	ptrType$2 = $ptrType(Location);
	arrayType$3 = $arrayType($Uint8, 32);
	ptrType$4 = $ptrType(ParseError);
	ptrType$7 = $ptrType(Time);
	init = function() {
		$unused(Unix(new $Int64(0, 0), new $Int64(0, 0)));
	};
	initLocal = function() {
		var d, i, j, s;
		d = new ($global.Date)();
		s = $internalize(d, $String);
		i = indexByte(s, 40);
		j = indexByte(s, 41);
		if ((i === -1) || (j === -1)) {
			localLoc.name = "UTC";
			return;
		}
		localLoc.name = $substring(s, (i + 1 >> 0), j);
		localLoc.zone = new sliceType([new zone.ptr(localLoc.name, $imul(($parseInt(d.getTimezoneOffset()) >> 0), -60), false)]);
	};
	runtimeNano = function() {
		return $mul64($internalize(new ($global.Date)().getTime(), $Int64), new $Int64(0, 1000000));
	};
	now = function() {
		var _tmp, _tmp$1, _tmp$2, mono, n, nsec, sec, x;
		sec = new $Int64(0, 0);
		nsec = 0;
		mono = new $Int64(0, 0);
		n = runtimeNano();
		_tmp = $div64(n, new $Int64(0, 1000000000), false);
		_tmp$1 = (((x = $div64(n, new $Int64(0, 1000000000), true), x.$low + ((x.$high >> 31) * 4294967296)) >> 0));
		_tmp$2 = n;
		sec = _tmp;
		nsec = _tmp$1;
		mono = _tmp$2;
		return [sec, nsec, mono];
	};
	indexByte = function(s, c) {
		var c, s;
		return $parseInt(s.indexOf($global.String.fromCharCode(c))) >> 0;
	};
	startsWithLowerCase = function(str) {
		var c, str;
		if (str.length === 0) {
			return false;
		}
		c = str.charCodeAt(0);
		return 97 <= c && c <= 122;
	};
	nextStdChunk = function(layout) {
		var _1, _tmp, _tmp$1, _tmp$10, _tmp$11, _tmp$12, _tmp$13, _tmp$14, _tmp$15, _tmp$16, _tmp$17, _tmp$18, _tmp$19, _tmp$2, _tmp$20, _tmp$21, _tmp$22, _tmp$23, _tmp$24, _tmp$25, _tmp$26, _tmp$27, _tmp$28, _tmp$29, _tmp$3, _tmp$30, _tmp$31, _tmp$32, _tmp$33, _tmp$34, _tmp$35, _tmp$36, _tmp$37, _tmp$38, _tmp$39, _tmp$4, _tmp$40, _tmp$41, _tmp$42, _tmp$43, _tmp$44, _tmp$45, _tmp$46, _tmp$47, _tmp$48, _tmp$49, _tmp$5, _tmp$50, _tmp$51, _tmp$52, _tmp$53, _tmp$54, _tmp$55, _tmp$56, _tmp$57, _tmp$58, _tmp$59, _tmp$6, _tmp$60, _tmp$61, _tmp$62, _tmp$63, _tmp$64, _tmp$65, _tmp$66, _tmp$67, _tmp$68, _tmp$69, _tmp$7, _tmp$70, _tmp$71, _tmp$72, _tmp$73, _tmp$74, _tmp$75, _tmp$76, _tmp$77, _tmp$78, _tmp$79, _tmp$8, _tmp$80, _tmp$81, _tmp$82, _tmp$83, _tmp$84, _tmp$85, _tmp$86, _tmp$9, c, ch, i, j, layout, prefix, std, std$1, suffix, x;
		prefix = "";
		std = 0;
		suffix = "";
		i = 0;
		while (true) {
			if (!(i < layout.length)) { break; }
			c = ((layout.charCodeAt(i) >> 0));
			_1 = c;
			if (_1 === (74)) {
				if (layout.length >= (i + 3 >> 0) && $substring(layout, i, (i + 3 >> 0)) === "Jan") {
					if (layout.length >= (i + 7 >> 0) && $substring(layout, i, (i + 7 >> 0)) === "January") {
						_tmp = $substring(layout, 0, i);
						_tmp$1 = 257;
						_tmp$2 = $substring(layout, (i + 7 >> 0));
						prefix = _tmp;
						std = _tmp$1;
						suffix = _tmp$2;
						return [prefix, std, suffix];
					}
					if (!startsWithLowerCase($substring(layout, (i + 3 >> 0)))) {
						_tmp$3 = $substring(layout, 0, i);
						_tmp$4 = 258;
						_tmp$5 = $substring(layout, (i + 3 >> 0));
						prefix = _tmp$3;
						std = _tmp$4;
						suffix = _tmp$5;
						return [prefix, std, suffix];
					}
				}
			} else if (_1 === (77)) {
				if (layout.length >= (i + 3 >> 0)) {
					if ($substring(layout, i, (i + 3 >> 0)) === "Mon") {
						if (layout.length >= (i + 6 >> 0) && $substring(layout, i, (i + 6 >> 0)) === "Monday") {
							_tmp$6 = $substring(layout, 0, i);
							_tmp$7 = 261;
							_tmp$8 = $substring(layout, (i + 6 >> 0));
							prefix = _tmp$6;
							std = _tmp$7;
							suffix = _tmp$8;
							return [prefix, std, suffix];
						}
						if (!startsWithLowerCase($substring(layout, (i + 3 >> 0)))) {
							_tmp$9 = $substring(layout, 0, i);
							_tmp$10 = 262;
							_tmp$11 = $substring(layout, (i + 3 >> 0));
							prefix = _tmp$9;
							std = _tmp$10;
							suffix = _tmp$11;
							return [prefix, std, suffix];
						}
					}
					if ($substring(layout, i, (i + 3 >> 0)) === "MST") {
						_tmp$12 = $substring(layout, 0, i);
						_tmp$13 = 21;
						_tmp$14 = $substring(layout, (i + 3 >> 0));
						prefix = _tmp$12;
						std = _tmp$13;
						suffix = _tmp$14;
						return [prefix, std, suffix];
					}
				}
			} else if (_1 === (48)) {
				if (layout.length >= (i + 2 >> 0) && 49 <= layout.charCodeAt((i + 1 >> 0)) && layout.charCodeAt((i + 1 >> 0)) <= 54) {
					_tmp$15 = $substring(layout, 0, i);
					_tmp$16 = (x = layout.charCodeAt((i + 1 >> 0)) - 49 << 24 >>> 24, ((x < 0 || x >= std0x.length) ? ($throwRuntimeError("index out of range"), undefined) : std0x[x]));
					_tmp$17 = $substring(layout, (i + 2 >> 0));
					prefix = _tmp$15;
					std = _tmp$16;
					suffix = _tmp$17;
					return [prefix, std, suffix];
				}
			} else if (_1 === (49)) {
				if (layout.length >= (i + 2 >> 0) && (layout.charCodeAt((i + 1 >> 0)) === 53)) {
					_tmp$18 = $substring(layout, 0, i);
					_tmp$19 = 522;
					_tmp$20 = $substring(layout, (i + 2 >> 0));
					prefix = _tmp$18;
					std = _tmp$19;
					suffix = _tmp$20;
					return [prefix, std, suffix];
				}
				_tmp$21 = $substring(layout, 0, i);
				_tmp$22 = 259;
				_tmp$23 = $substring(layout, (i + 1 >> 0));
				prefix = _tmp$21;
				std = _tmp$22;
				suffix = _tmp$23;
				return [prefix, std, suffix];
			} else if (_1 === (50)) {
				if (layout.length >= (i + 4 >> 0) && $substring(layout, i, (i + 4 >> 0)) === "2006") {
					_tmp$24 = $substring(layout, 0, i);
					_tmp$25 = 273;
					_tmp$26 = $substring(layout, (i + 4 >> 0));
					prefix = _tmp$24;
					std = _tmp$25;
					suffix = _tmp$26;
					return [prefix, std, suffix];
				}
				_tmp$27 = $substring(layout, 0, i);
				_tmp$28 = 263;
				_tmp$29 = $substring(layout, (i + 1 >> 0));
				prefix = _tmp$27;
				std = _tmp$28;
				suffix = _tmp$29;
				return [prefix, std, suffix];
			} else if (_1 === (95)) {
				if (layout.length >= (i + 2 >> 0) && (layout.charCodeAt((i + 1 >> 0)) === 50)) {
					if (layout.length >= (i + 5 >> 0) && $substring(layout, (i + 1 >> 0), (i + 5 >> 0)) === "2006") {
						_tmp$30 = $substring(layout, 0, (i + 1 >> 0));
						_tmp$31 = 273;
						_tmp$32 = $substring(layout, (i + 5 >> 0));
						prefix = _tmp$30;
						std = _tmp$31;
						suffix = _tmp$32;
						return [prefix, std, suffix];
					}
					_tmp$33 = $substring(layout, 0, i);
					_tmp$34 = 264;
					_tmp$35 = $substring(layout, (i + 2 >> 0));
					prefix = _tmp$33;
					std = _tmp$34;
					suffix = _tmp$35;
					return [prefix, std, suffix];
				}
			} else if (_1 === (51)) {
				_tmp$36 = $substring(layout, 0, i);
				_tmp$37 = 523;
				_tmp$38 = $substring(layout, (i + 1 >> 0));
				prefix = _tmp$36;
				std = _tmp$37;
				suffix = _tmp$38;
				return [prefix, std, suffix];
			} else if (_1 === (52)) {
				_tmp$39 = $substring(layout, 0, i);
				_tmp$40 = 525;
				_tmp$41 = $substring(layout, (i + 1 >> 0));
				prefix = _tmp$39;
				std = _tmp$40;
				suffix = _tmp$41;
				return [prefix, std, suffix];
			} else if (_1 === (53)) {
				_tmp$42 = $substring(layout, 0, i);
				_tmp$43 = 527;
				_tmp$44 = $substring(layout, (i + 1 >> 0));
				prefix = _tmp$42;
				std = _tmp$43;
				suffix = _tmp$44;
				return [prefix, std, suffix];
			} else if (_1 === (80)) {
				if (layout.length >= (i + 2 >> 0) && (layout.charCodeAt((i + 1 >> 0)) === 77)) {
					_tmp$45 = $substring(layout, 0, i);
					_tmp$46 = 531;
					_tmp$47 = $substring(layout, (i + 2 >> 0));
					prefix = _tmp$45;
					std = _tmp$46;
					suffix = _tmp$47;
					return [prefix, std, suffix];
				}
			} else if (_1 === (112)) {
				if (layout.length >= (i + 2 >> 0) && (layout.charCodeAt((i + 1 >> 0)) === 109)) {
					_tmp$48 = $substring(layout, 0, i);
					_tmp$49 = 532;
					_tmp$50 = $substring(layout, (i + 2 >> 0));
					prefix = _tmp$48;
					std = _tmp$49;
					suffix = _tmp$50;
					return [prefix, std, suffix];
				}
			} else if (_1 === (45)) {
				if (layout.length >= (i + 7 >> 0) && $substring(layout, i, (i + 7 >> 0)) === "-070000") {
					_tmp$51 = $substring(layout, 0, i);
					_tmp$52 = 28;
					_tmp$53 = $substring(layout, (i + 7 >> 0));
					prefix = _tmp$51;
					std = _tmp$52;
					suffix = _tmp$53;
					return [prefix, std, suffix];
				}
				if (layout.length >= (i + 9 >> 0) && $substring(layout, i, (i + 9 >> 0)) === "-07:00:00") {
					_tmp$54 = $substring(layout, 0, i);
					_tmp$55 = 31;
					_tmp$56 = $substring(layout, (i + 9 >> 0));
					prefix = _tmp$54;
					std = _tmp$55;
					suffix = _tmp$56;
					return [prefix, std, suffix];
				}
				if (layout.length >= (i + 5 >> 0) && $substring(layout, i, (i + 5 >> 0)) === "-0700") {
					_tmp$57 = $substring(layout, 0, i);
					_tmp$58 = 27;
					_tmp$59 = $substring(layout, (i + 5 >> 0));
					prefix = _tmp$57;
					std = _tmp$58;
					suffix = _tmp$59;
					return [prefix, std, suffix];
				}
				if (layout.length >= (i + 6 >> 0) && $substring(layout, i, (i + 6 >> 0)) === "-07:00") {
					_tmp$60 = $substring(layout, 0, i);
					_tmp$61 = 30;
					_tmp$62 = $substring(layout, (i + 6 >> 0));
					prefix = _tmp$60;
					std = _tmp$61;
					suffix = _tmp$62;
					return [prefix, std, suffix];
				}
				if (layout.length >= (i + 3 >> 0) && $substring(layout, i, (i + 3 >> 0)) === "-07") {
					_tmp$63 = $substring(layout, 0, i);
					_tmp$64 = 29;
					_tmp$65 = $substring(layout, (i + 3 >> 0));
					prefix = _tmp$63;
					std = _tmp$64;
					suffix = _tmp$65;
					return [prefix, std, suffix];
				}
			} else if (_1 === (90)) {
				if (layout.length >= (i + 7 >> 0) && $substring(layout, i, (i + 7 >> 0)) === "Z070000") {
					_tmp$66 = $substring(layout, 0, i);
					_tmp$67 = 23;
					_tmp$68 = $substring(layout, (i + 7 >> 0));
					prefix = _tmp$66;
					std = _tmp$67;
					suffix = _tmp$68;
					return [prefix, std, suffix];
				}
				if (layout.length >= (i + 9 >> 0) && $substring(layout, i, (i + 9 >> 0)) === "Z07:00:00") {
					_tmp$69 = $substring(layout, 0, i);
					_tmp$70 = 26;
					_tmp$71 = $substring(layout, (i + 9 >> 0));
					prefix = _tmp$69;
					std = _tmp$70;
					suffix = _tmp$71;
					return [prefix, std, suffix];
				}
				if (layout.length >= (i + 5 >> 0) && $substring(layout, i, (i + 5 >> 0)) === "Z0700") {
					_tmp$72 = $substring(layout, 0, i);
					_tmp$73 = 22;
					_tmp$74 = $substring(layout, (i + 5 >> 0));
					prefix = _tmp$72;
					std = _tmp$73;
					suffix = _tmp$74;
					return [prefix, std, suffix];
				}
				if (layout.length >= (i + 6 >> 0) && $substring(layout, i, (i + 6 >> 0)) === "Z07:00") {
					_tmp$75 = $substring(layout, 0, i);
					_tmp$76 = 25;
					_tmp$77 = $substring(layout, (i + 6 >> 0));
					prefix = _tmp$75;
					std = _tmp$76;
					suffix = _tmp$77;
					return [prefix, std, suffix];
				}
				if (layout.length >= (i + 3 >> 0) && $substring(layout, i, (i + 3 >> 0)) === "Z07") {
					_tmp$78 = $substring(layout, 0, i);
					_tmp$79 = 24;
					_tmp$80 = $substring(layout, (i + 3 >> 0));
					prefix = _tmp$78;
					std = _tmp$79;
					suffix = _tmp$80;
					return [prefix, std, suffix];
				}
			} else if (_1 === (46)) {
				if ((i + 1 >> 0) < layout.length && ((layout.charCodeAt((i + 1 >> 0)) === 48) || (layout.charCodeAt((i + 1 >> 0)) === 57))) {
					ch = layout.charCodeAt((i + 1 >> 0));
					j = i + 1 >> 0;
					while (true) {
						if (!(j < layout.length && (layout.charCodeAt(j) === ch))) { break; }
						j = j + (1) >> 0;
					}
					if (!isDigit(layout, j)) {
						std$1 = 32;
						if (layout.charCodeAt((i + 1 >> 0)) === 57) {
							std$1 = 33;
						}
						std$1 = std$1 | ((((j - ((i + 1 >> 0)) >> 0)) << 16 >> 0));
						_tmp$81 = $substring(layout, 0, i);
						_tmp$82 = std$1;
						_tmp$83 = $substring(layout, j);
						prefix = _tmp$81;
						std = _tmp$82;
						suffix = _tmp$83;
						return [prefix, std, suffix];
					}
				}
			}
			i = i + (1) >> 0;
		}
		_tmp$84 = layout;
		_tmp$85 = 0;
		_tmp$86 = "";
		prefix = _tmp$84;
		std = _tmp$85;
		suffix = _tmp$86;
		return [prefix, std, suffix];
	};
	match = function(s1, s2) {
		var c1, c2, i, s1, s2;
		i = 0;
		while (true) {
			if (!(i < s1.length)) { break; }
			c1 = s1.charCodeAt(i);
			c2 = s2.charCodeAt(i);
			if (!((c1 === c2))) {
				c1 = (c1 | (32)) >>> 0;
				c2 = (c2 | (32)) >>> 0;
				if (!((c1 === c2)) || c1 < 97 || c1 > 122) {
					return false;
				}
			}
			i = i + (1) >> 0;
		}
		return true;
	};
	lookup = function(tab, val) {
		var _i, _ref, i, tab, v, val;
		_ref = tab;
		_i = 0;
		while (true) {
			if (!(_i < _ref.$length)) { break; }
			i = _i;
			v = ((_i < 0 || _i >= _ref.$length) ? ($throwRuntimeError("index out of range"), undefined) : _ref.$array[_ref.$offset + _i]);
			if (val.length >= v.length && match($substring(val, 0, v.length), v)) {
				return [i, $substring(val, v.length), $ifaceNil];
			}
			_i++;
		}
		return [-1, val, errBad];
	};
	appendInt = function(b, x, width) {
		var _q, b, buf, i, q, u, w, width, x;
		u = ((x >>> 0));
		if (x < 0) {
			b = $append(b, 45);
			u = ((-x >>> 0));
		}
		buf = arrayType.zero();
		i = 20;
		while (true) {
			if (!(u >= 10)) { break; }
			i = i - (1) >> 0;
			q = (_q = u / 10, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >>> 0 : $throwRuntimeError("integer divide by zero"));
			((i < 0 || i >= buf.length) ? ($throwRuntimeError("index out of range"), undefined) : buf[i] = ((((48 + u >>> 0) - (q * 10 >>> 0) >>> 0) << 24 >>> 24)));
			u = q;
		}
		i = i - (1) >> 0;
		((i < 0 || i >= buf.length) ? ($throwRuntimeError("index out of range"), undefined) : buf[i] = (((48 + u >>> 0) << 24 >>> 24)));
		w = 20 - i >> 0;
		while (true) {
			if (!(w < width)) { break; }
			b = $append(b, 48);
			w = w + (1) >> 0;
		}
		return $appendSlice(b, $subslice(new sliceType$3(buf), i));
	};
	atoi = function(s) {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, _tuple, err, neg, q, rem, s, x;
		x = 0;
		err = $ifaceNil;
		neg = false;
		if (!(s === "") && ((s.charCodeAt(0) === 45) || (s.charCodeAt(0) === 43))) {
			neg = s.charCodeAt(0) === 45;
			s = $substring(s, 1);
		}
		_tuple = leadingInt(s);
		q = _tuple[0];
		rem = _tuple[1];
		err = _tuple[2];
		x = (((q.$low + ((q.$high >> 31) * 4294967296)) >> 0));
		if (!($interfaceIsEqual(err, $ifaceNil)) || !(rem === "")) {
			_tmp = 0;
			_tmp$1 = atoiError;
			x = _tmp;
			err = _tmp$1;
			return [x, err];
		}
		if (neg) {
			x = -x;
		}
		_tmp$2 = x;
		_tmp$3 = $ifaceNil;
		x = _tmp$2;
		err = _tmp$3;
		return [x, err];
	};
	formatNano = function(b, nanosec, n, trim) {
		var _q, _r, b, buf, n, nanosec, start, trim, u, x;
		u = nanosec;
		buf = arrayType$1.zero();
		start = 9;
		while (true) {
			if (!(start > 0)) { break; }
			start = start - (1) >> 0;
			((start < 0 || start >= buf.length) ? ($throwRuntimeError("index out of range"), undefined) : buf[start] = ((((_r = u % 10, _r === _r ? _r : $throwRuntimeError("integer divide by zero")) + 48 >>> 0) << 24 >>> 24)));
			u = (_q = u / (10), (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >>> 0 : $throwRuntimeError("integer divide by zero"));
		}
		if (n > 9) {
			n = 9;
		}
		if (trim) {
			while (true) {
				if (!(n > 0 && ((x = n - 1 >> 0, ((x < 0 || x >= buf.length) ? ($throwRuntimeError("index out of range"), undefined) : buf[x])) === 48))) { break; }
				n = n - (1) >> 0;
			}
			if (n === 0) {
				return b;
			}
		}
		b = $append(b, 46);
		return $appendSlice(b, $subslice(new sliceType$3(buf), 0, n));
	};
	Time.ptr.prototype.String = function() {
		var _r, _tmp, _tmp$1, _tmp$2, _tmp$3, buf, m0, m1, m2, s, sign, t, wid, x, x$1, x$2, x$3, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; _tmp$2 = $f._tmp$2; _tmp$3 = $f._tmp$3; buf = $f.buf; m0 = $f.m0; m1 = $f.m1; m2 = $f.m2; s = $f.s; sign = $f.sign; t = $f.t; wid = $f.wid; x = $f.x; x$1 = $f.x$1; x$2 = $f.x$2; x$3 = $f.x$3; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
		_r = $clone(t, Time).Format("2006-01-02 15:04:05.999999999 -0700 MST"); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		s = _r;
		if (!((x = (x$1 = t.wall, new $Uint64(x$1.$high & 2147483648, (x$1.$low & 0) >>> 0)), (x.$high === 0 && x.$low === 0)))) {
			m2 = ((x$2 = t.ext, new $Uint64(x$2.$high, x$2.$low)));
			sign = 43;
			if ((x$3 = t.ext, (x$3.$high < 0 || (x$3.$high === 0 && x$3.$low < 0)))) {
				sign = 45;
				m2 = new $Uint64(-m2.$high, -m2.$low);
			}
			_tmp = $div64(m2, new $Uint64(0, 1000000000), false);
			_tmp$1 = $div64(m2, new $Uint64(0, 1000000000), true);
			m1 = _tmp;
			m2 = _tmp$1;
			_tmp$2 = $div64(m1, new $Uint64(0, 1000000000), false);
			_tmp$3 = $div64(m1, new $Uint64(0, 1000000000), true);
			m0 = _tmp$2;
			m1 = _tmp$3;
			buf = sliceType$3.nil;
			buf = $appendSlice(buf, " m=");
			buf = $append(buf, sign);
			wid = 0;
			if (!((m0.$high === 0 && m0.$low === 0))) {
				buf = appendInt(buf, ((m0.$low >> 0)), 0);
				wid = 9;
			}
			buf = appendInt(buf, ((m1.$low >> 0)), wid);
			buf = $append(buf, 46);
			buf = appendInt(buf, ((m2.$low >> 0)), 9);
			s = s + (($bytesToString(buf)));
		}
		$s = -1; return s;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.String }; } $f._r = _r; $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f._tmp$2 = _tmp$2; $f._tmp$3 = _tmp$3; $f.buf = buf; $f.m0 = m0; $f.m1 = m1; $f.m2 = m2; $f.s = s; $f.sign = sign; $f.t = t; $f.wid = wid; $f.x = x; $f.x$1 = x$1; $f.x$2 = x$2; $f.x$3 = x$3; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.String = function() { return this.$val.String(); };
	Time.ptr.prototype.Format = function(layout) {
		var _r, b, buf, layout, max, t, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; b = $f.b; buf = $f.buf; layout = $f.layout; max = $f.max; t = $f.t; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
		b = sliceType$3.nil;
		max = layout.length + 10 >> 0;
		if (max < 64) {
			buf = arrayType$2.zero();
			b = $subslice(new sliceType$3(buf), 0, 0);
		} else {
			b = $makeSlice(sliceType$3, 0, max);
		}
		_r = $clone(t, Time).AppendFormat(b, layout); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		b = _r;
		$s = -1; return ($bytesToString(b));
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.Format }; } $f._r = _r; $f.b = b; $f.buf = buf; $f.layout = layout; $f.max = max; $f.t = t; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.Format = function(layout) { return this.$val.Format(layout); };
	Time.ptr.prototype.AppendFormat = function(b, layout) {
		var _1, _q, _q$1, _q$2, _q$3, _r, _r$1, _r$2, _r$3, _r$4, _r$5, _r$6, _tuple, _tuple$1, _tuple$2, _tuple$3, abs, absoffset, b, day, hour, hr, hr$1, layout, m, min, month, name, offset, prefix, s, sec, std, suffix, t, y, year, zone$1, zone$2, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _1 = $f._1; _q = $f._q; _q$1 = $f._q$1; _q$2 = $f._q$2; _q$3 = $f._q$3; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; _r$3 = $f._r$3; _r$4 = $f._r$4; _r$5 = $f._r$5; _r$6 = $f._r$6; _tuple = $f._tuple; _tuple$1 = $f._tuple$1; _tuple$2 = $f._tuple$2; _tuple$3 = $f._tuple$3; abs = $f.abs; absoffset = $f.absoffset; b = $f.b; day = $f.day; hour = $f.hour; hr = $f.hr; hr$1 = $f.hr$1; layout = $f.layout; m = $f.m; min = $f.min; month = $f.month; name = $f.name; offset = $f.offset; prefix = $f.prefix; s = $f.s; sec = $f.sec; std = $f.std; suffix = $f.suffix; t = $f.t; y = $f.y; year = $f.year; zone$1 = $f.zone$1; zone$2 = $f.zone$2; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
		_r = $clone(t, Time).locabs(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_tuple = _r;
		name = _tuple[0];
		offset = _tuple[1];
		abs = _tuple[2];
		year = -1;
		month = 0;
		day = 0;
		hour = -1;
		min = 0;
		sec = 0;
		while (true) {
			if (!(!(layout === ""))) { break; }
			_tuple$1 = nextStdChunk(layout);
			prefix = _tuple$1[0];
			std = _tuple$1[1];
			suffix = _tuple$1[2];
			if (!(prefix === "")) {
				b = $appendSlice(b, prefix);
			}
			if (std === 0) {
				break;
			}
			layout = suffix;
			if (year < 0 && !(((std & 256) === 0))) {
				_tuple$2 = absDate(abs, true);
				year = _tuple$2[0];
				month = _tuple$2[1];
				day = _tuple$2[2];
			}
			if (hour < 0 && !(((std & 512) === 0))) {
				_tuple$3 = absClock(abs);
				hour = _tuple$3[0];
				min = _tuple$3[1];
				sec = _tuple$3[2];
			}
			switch (0) { default:
				_1 = std & 65535;
				if (_1 === (274)) {
					y = year;
					if (y < 0) {
						y = -y;
					}
					b = appendInt(b, (_r$1 = y % 100, _r$1 === _r$1 ? _r$1 : $throwRuntimeError("integer divide by zero")), 2);
				} else if (_1 === (273)) {
					b = appendInt(b, year, 4);
				} else if (_1 === (258)) {
					b = $appendSlice(b, $substring(new Month(month).String(), 0, 3));
				} else if (_1 === (257)) {
					m = new Month(month).String();
					b = $appendSlice(b, m);
				} else if (_1 === (259)) {
					b = appendInt(b, ((month >> 0)), 0);
				} else if (_1 === (260)) {
					b = appendInt(b, ((month >> 0)), 2);
				} else if (_1 === (262)) {
					b = $appendSlice(b, $substring(new Weekday(absWeekday(abs)).String(), 0, 3));
				} else if (_1 === (261)) {
					s = new Weekday(absWeekday(abs)).String();
					b = $appendSlice(b, s);
				} else if (_1 === (263)) {
					b = appendInt(b, day, 0);
				} else if (_1 === (264)) {
					if (day < 10) {
						b = $append(b, 32);
					}
					b = appendInt(b, day, 0);
				} else if (_1 === (265)) {
					b = appendInt(b, day, 2);
				} else if (_1 === (522)) {
					b = appendInt(b, hour, 2);
				} else if (_1 === (523)) {
					hr = (_r$2 = hour % 12, _r$2 === _r$2 ? _r$2 : $throwRuntimeError("integer divide by zero"));
					if (hr === 0) {
						hr = 12;
					}
					b = appendInt(b, hr, 0);
				} else if (_1 === (524)) {
					hr$1 = (_r$3 = hour % 12, _r$3 === _r$3 ? _r$3 : $throwRuntimeError("integer divide by zero"));
					if (hr$1 === 0) {
						hr$1 = 12;
					}
					b = appendInt(b, hr$1, 2);
				} else if (_1 === (525)) {
					b = appendInt(b, min, 0);
				} else if (_1 === (526)) {
					b = appendInt(b, min, 2);
				} else if (_1 === (527)) {
					b = appendInt(b, sec, 0);
				} else if (_1 === (528)) {
					b = appendInt(b, sec, 2);
				} else if (_1 === (531)) {
					if (hour >= 12) {
						b = $appendSlice(b, "PM");
					} else {
						b = $appendSlice(b, "AM");
					}
				} else if (_1 === (532)) {
					if (hour >= 12) {
						b = $appendSlice(b, "pm");
					} else {
						b = $appendSlice(b, "am");
					}
				} else if ((_1 === (22)) || (_1 === (25)) || (_1 === (23)) || (_1 === (24)) || (_1 === (26)) || (_1 === (27)) || (_1 === (30)) || (_1 === (28)) || (_1 === (29)) || (_1 === (31))) {
					if ((offset === 0) && ((std === 22) || (std === 25) || (std === 23) || (std === 24) || (std === 26))) {
						b = $append(b, 90);
						break;
					}
					zone$1 = (_q = offset / 60, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
					absoffset = offset;
					if (zone$1 < 0) {
						b = $append(b, 45);
						zone$1 = -zone$1;
						absoffset = -absoffset;
					} else {
						b = $append(b, 43);
					}
					b = appendInt(b, (_q$1 = zone$1 / 60, (_q$1 === _q$1 && _q$1 !== 1/0 && _q$1 !== -1/0) ? _q$1 >> 0 : $throwRuntimeError("integer divide by zero")), 2);
					if ((std === 25) || (std === 30) || (std === 26) || (std === 31)) {
						b = $append(b, 58);
					}
					if (!((std === 29)) && !((std === 24))) {
						b = appendInt(b, (_r$4 = zone$1 % 60, _r$4 === _r$4 ? _r$4 : $throwRuntimeError("integer divide by zero")), 2);
					}
					if ((std === 23) || (std === 28) || (std === 31) || (std === 26)) {
						if ((std === 31) || (std === 26)) {
							b = $append(b, 58);
						}
						b = appendInt(b, (_r$5 = absoffset % 60, _r$5 === _r$5 ? _r$5 : $throwRuntimeError("integer divide by zero")), 2);
					}
				} else if (_1 === (21)) {
					if (!(name === "")) {
						b = $appendSlice(b, name);
						break;
					}
					zone$2 = (_q$2 = offset / 60, (_q$2 === _q$2 && _q$2 !== 1/0 && _q$2 !== -1/0) ? _q$2 >> 0 : $throwRuntimeError("integer divide by zero"));
					if (zone$2 < 0) {
						b = $append(b, 45);
						zone$2 = -zone$2;
					} else {
						b = $append(b, 43);
					}
					b = appendInt(b, (_q$3 = zone$2 / 60, (_q$3 === _q$3 && _q$3 !== 1/0 && _q$3 !== -1/0) ? _q$3 >> 0 : $throwRuntimeError("integer divide by zero")), 2);
					b = appendInt(b, (_r$6 = zone$2 % 60, _r$6 === _r$6 ? _r$6 : $throwRuntimeError("integer divide by zero")), 2);
				} else if ((_1 === (32)) || (_1 === (33))) {
					b = formatNano(b, (($clone(t, Time).Nanosecond() >>> 0)), std >> 16 >> 0, (std & 65535) === 33);
				}
			}
		}
		$s = -1; return b;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.AppendFormat }; } $f._1 = _1; $f._q = _q; $f._q$1 = _q$1; $f._q$2 = _q$2; $f._q$3 = _q$3; $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f._r$3 = _r$3; $f._r$4 = _r$4; $f._r$5 = _r$5; $f._r$6 = _r$6; $f._tuple = _tuple; $f._tuple$1 = _tuple$1; $f._tuple$2 = _tuple$2; $f._tuple$3 = _tuple$3; $f.abs = abs; $f.absoffset = absoffset; $f.b = b; $f.day = day; $f.hour = hour; $f.hr = hr; $f.hr$1 = hr$1; $f.layout = layout; $f.m = m; $f.min = min; $f.month = month; $f.name = name; $f.offset = offset; $f.prefix = prefix; $f.s = s; $f.sec = sec; $f.std = std; $f.suffix = suffix; $f.t = t; $f.y = y; $f.year = year; $f.zone$1 = zone$1; $f.zone$2 = zone$2; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.AppendFormat = function(b, layout) { return this.$val.AppendFormat(b, layout); };
	quote = function(s) {
		var s;
		return "\"" + s + "\"";
	};
	ParseError.ptr.prototype.Error = function() {
		var e;
		e = this;
		if (e.Message === "") {
			return "parsing time " + quote(e.Value) + " as " + quote(e.Layout) + ": cannot parse " + quote(e.ValueElem) + " as " + quote(e.LayoutElem);
		}
		return "parsing time " + quote(e.Value) + e.Message;
	};
	ParseError.prototype.Error = function() { return this.$val.Error(); };
	isDigit = function(s, i) {
		var c, i, s;
		if (s.length <= i) {
			return false;
		}
		c = s.charCodeAt(i);
		return 48 <= c && c <= 57;
	};
	getnum = function(s, fixed) {
		var fixed, s;
		if (!isDigit(s, 0)) {
			return [0, s, errBad];
		}
		if (!isDigit(s, 1)) {
			if (fixed) {
				return [0, s, errBad];
			}
			return [(((s.charCodeAt(0) - 48 << 24 >>> 24) >> 0)), $substring(s, 1), $ifaceNil];
		}
		return [($imul((((s.charCodeAt(0) - 48 << 24 >>> 24) >> 0)), 10)) + (((s.charCodeAt(1) - 48 << 24 >>> 24) >> 0)) >> 0, $substring(s, 2), $ifaceNil];
	};
	cutspace = function(s) {
		var s;
		while (true) {
			if (!(s.length > 0 && (s.charCodeAt(0) === 32))) { break; }
			s = $substring(s, 1);
		}
		return s;
	};
	skip = function(value, prefix) {
		var prefix, value;
		while (true) {
			if (!(prefix.length > 0)) { break; }
			if (prefix.charCodeAt(0) === 32) {
				if (value.length > 0 && !((value.charCodeAt(0) === 32))) {
					return [value, errBad];
				}
				prefix = cutspace(prefix);
				value = cutspace(value);
				continue;
			}
			if ((value.length === 0) || !((value.charCodeAt(0) === prefix.charCodeAt(0)))) {
				return [value, errBad];
			}
			prefix = $substring(prefix, 1);
			value = $substring(value, 1);
		}
		return [value, $ifaceNil];
	};
	Parse = function(layout, value) {
		var _r, layout, value, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; layout = $f.layout; value = $f.value; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_r = parse(layout, value, $pkg.UTC, $pkg.Local); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Parse }; } $f._r = _r; $f.layout = layout; $f.value = value; $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.Parse = Parse;
	parse = function(layout, value, defaultLocation, local) {
		var _1, _2, _3, _4, _r, _r$1, _r$2, _r$3, _r$4, _r$5, _tmp, _tmp$1, _tmp$10, _tmp$11, _tmp$12, _tmp$13, _tmp$14, _tmp$15, _tmp$16, _tmp$17, _tmp$18, _tmp$19, _tmp$2, _tmp$20, _tmp$21, _tmp$22, _tmp$23, _tmp$24, _tmp$25, _tmp$26, _tmp$27, _tmp$28, _tmp$29, _tmp$3, _tmp$30, _tmp$31, _tmp$32, _tmp$33, _tmp$34, _tmp$35, _tmp$36, _tmp$37, _tmp$38, _tmp$39, _tmp$4, _tmp$40, _tmp$41, _tmp$42, _tmp$43, _tmp$5, _tmp$6, _tmp$7, _tmp$8, _tmp$9, _tuple, _tuple$1, _tuple$10, _tuple$11, _tuple$12, _tuple$13, _tuple$14, _tuple$15, _tuple$16, _tuple$17, _tuple$18, _tuple$19, _tuple$2, _tuple$20, _tuple$21, _tuple$22, _tuple$23, _tuple$24, _tuple$3, _tuple$4, _tuple$5, _tuple$6, _tuple$7, _tuple$8, _tuple$9, alayout, amSet, avalue, day, defaultLocation, err, hour, hour$1, hr, i, layout, local, min, min$1, mm, month, n, n$1, name, ndigit, nsec, offset, offset$1, ok, ok$1, p, pmSet, prefix, rangeErrString, sec, seconds, sign, ss, std, stdstr, suffix, t, t$1, value, x, x$1, year, z, zoneName, zoneOffset, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _1 = $f._1; _2 = $f._2; _3 = $f._3; _4 = $f._4; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; _r$3 = $f._r$3; _r$4 = $f._r$4; _r$5 = $f._r$5; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; _tmp$10 = $f._tmp$10; _tmp$11 = $f._tmp$11; _tmp$12 = $f._tmp$12; _tmp$13 = $f._tmp$13; _tmp$14 = $f._tmp$14; _tmp$15 = $f._tmp$15; _tmp$16 = $f._tmp$16; _tmp$17 = $f._tmp$17; _tmp$18 = $f._tmp$18; _tmp$19 = $f._tmp$19; _tmp$2 = $f._tmp$2; _tmp$20 = $f._tmp$20; _tmp$21 = $f._tmp$21; _tmp$22 = $f._tmp$22; _tmp$23 = $f._tmp$23; _tmp$24 = $f._tmp$24; _tmp$25 = $f._tmp$25; _tmp$26 = $f._tmp$26; _tmp$27 = $f._tmp$27; _tmp$28 = $f._tmp$28; _tmp$29 = $f._tmp$29; _tmp$3 = $f._tmp$3; _tmp$30 = $f._tmp$30; _tmp$31 = $f._tmp$31; _tmp$32 = $f._tmp$32; _tmp$33 = $f._tmp$33; _tmp$34 = $f._tmp$34; _tmp$35 = $f._tmp$35; _tmp$36 = $f._tmp$36; _tmp$37 = $f._tmp$37; _tmp$38 = $f._tmp$38; _tmp$39 = $f._tmp$39; _tmp$4 = $f._tmp$4; _tmp$40 = $f._tmp$40; _tmp$41 = $f._tmp$41; _tmp$42 = $f._tmp$42; _tmp$43 = $f._tmp$43; _tmp$5 = $f._tmp$5; _tmp$6 = $f._tmp$6; _tmp$7 = $f._tmp$7; _tmp$8 = $f._tmp$8; _tmp$9 = $f._tmp$9; _tuple = $f._tuple; _tuple$1 = $f._tuple$1; _tuple$10 = $f._tuple$10; _tuple$11 = $f._tuple$11; _tuple$12 = $f._tuple$12; _tuple$13 = $f._tuple$13; _tuple$14 = $f._tuple$14; _tuple$15 = $f._tuple$15; _tuple$16 = $f._tuple$16; _tuple$17 = $f._tuple$17; _tuple$18 = $f._tuple$18; _tuple$19 = $f._tuple$19; _tuple$2 = $f._tuple$2; _tuple$20 = $f._tuple$20; _tuple$21 = $f._tuple$21; _tuple$22 = $f._tuple$22; _tuple$23 = $f._tuple$23; _tuple$24 = $f._tuple$24; _tuple$3 = $f._tuple$3; _tuple$4 = $f._tuple$4; _tuple$5 = $f._tuple$5; _tuple$6 = $f._tuple$6; _tuple$7 = $f._tuple$7; _tuple$8 = $f._tuple$8; _tuple$9 = $f._tuple$9; alayout = $f.alayout; amSet = $f.amSet; avalue = $f.avalue; day = $f.day; defaultLocation = $f.defaultLocation; err = $f.err; hour = $f.hour; hour$1 = $f.hour$1; hr = $f.hr; i = $f.i; layout = $f.layout; local = $f.local; min = $f.min; min$1 = $f.min$1; mm = $f.mm; month = $f.month; n = $f.n; n$1 = $f.n$1; name = $f.name; ndigit = $f.ndigit; nsec = $f.nsec; offset = $f.offset; offset$1 = $f.offset$1; ok = $f.ok; ok$1 = $f.ok$1; p = $f.p; pmSet = $f.pmSet; prefix = $f.prefix; rangeErrString = $f.rangeErrString; sec = $f.sec; seconds = $f.seconds; sign = $f.sign; ss = $f.ss; std = $f.std; stdstr = $f.stdstr; suffix = $f.suffix; t = $f.t; t$1 = $f.t$1; value = $f.value; x = $f.x; x$1 = $f.x$1; year = $f.year; z = $f.z; zoneName = $f.zoneName; zoneOffset = $f.zoneOffset; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_tmp = layout;
		_tmp$1 = value;
		alayout = _tmp;
		avalue = _tmp$1;
		rangeErrString = "";
		amSet = false;
		pmSet = false;
		year = 0;
		month = 1;
		day = 1;
		hour = 0;
		min = 0;
		sec = 0;
		nsec = 0;
		z = ptrType$2.nil;
		zoneOffset = -1;
		zoneName = "";
		while (true) {
			err = $ifaceNil;
			_tuple = nextStdChunk(layout);
			prefix = _tuple[0];
			std = _tuple[1];
			suffix = _tuple[2];
			stdstr = $substring(layout, prefix.length, (layout.length - suffix.length >> 0));
			_tuple$1 = skip(value, prefix);
			value = _tuple$1[0];
			err = _tuple$1[1];
			if (!($interfaceIsEqual(err, $ifaceNil))) {
				$s = -1; return [new Time.ptr(new $Uint64(0, 0), new $Int64(0, 0), ptrType$2.nil), new ParseError.ptr(alayout, avalue, prefix, value, "")];
			}
			if (std === 0) {
				if (!((value.length === 0))) {
					$s = -1; return [new Time.ptr(new $Uint64(0, 0), new $Int64(0, 0), ptrType$2.nil), new ParseError.ptr(alayout, avalue, "", value, ": extra text: " + value)];
				}
				break;
			}
			layout = suffix;
			p = "";
			switch (0) { default:
				_1 = std & 65535;
				if (_1 === (274)) {
					if (value.length < 2) {
						err = errBad;
						break;
					}
					_tmp$2 = $substring(value, 0, 2);
					_tmp$3 = $substring(value, 2);
					p = _tmp$2;
					value = _tmp$3;
					_tuple$2 = atoi(p);
					year = _tuple$2[0];
					err = _tuple$2[1];
					if (year >= 69) {
						year = year + (1900) >> 0;
					} else {
						year = year + (2000) >> 0;
					}
				} else if (_1 === (273)) {
					if (value.length < 4 || !isDigit(value, 0)) {
						err = errBad;
						break;
					}
					_tmp$4 = $substring(value, 0, 4);
					_tmp$5 = $substring(value, 4);
					p = _tmp$4;
					value = _tmp$5;
					_tuple$3 = atoi(p);
					year = _tuple$3[0];
					err = _tuple$3[1];
				} else if (_1 === (258)) {
					_tuple$4 = lookup(shortMonthNames, value);
					month = _tuple$4[0];
					value = _tuple$4[1];
					err = _tuple$4[2];
					month = month + (1) >> 0;
				} else if (_1 === (257)) {
					_tuple$5 = lookup(longMonthNames, value);
					month = _tuple$5[0];
					value = _tuple$5[1];
					err = _tuple$5[2];
					month = month + (1) >> 0;
				} else if ((_1 === (259)) || (_1 === (260))) {
					_tuple$6 = getnum(value, std === 260);
					month = _tuple$6[0];
					value = _tuple$6[1];
					err = _tuple$6[2];
					if (month <= 0 || 12 < month) {
						rangeErrString = "month";
					}
				} else if (_1 === (262)) {
					_tuple$7 = lookup(shortDayNames, value);
					value = _tuple$7[1];
					err = _tuple$7[2];
				} else if (_1 === (261)) {
					_tuple$8 = lookup(longDayNames, value);
					value = _tuple$8[1];
					err = _tuple$8[2];
				} else if ((_1 === (263)) || (_1 === (264)) || (_1 === (265))) {
					if ((std === 264) && value.length > 0 && (value.charCodeAt(0) === 32)) {
						value = $substring(value, 1);
					}
					_tuple$9 = getnum(value, std === 265);
					day = _tuple$9[0];
					value = _tuple$9[1];
					err = _tuple$9[2];
					if (day < 0) {
						rangeErrString = "day";
					}
				} else if (_1 === (522)) {
					_tuple$10 = getnum(value, false);
					hour = _tuple$10[0];
					value = _tuple$10[1];
					err = _tuple$10[2];
					if (hour < 0 || 24 <= hour) {
						rangeErrString = "hour";
					}
				} else if ((_1 === (523)) || (_1 === (524))) {
					_tuple$11 = getnum(value, std === 524);
					hour = _tuple$11[0];
					value = _tuple$11[1];
					err = _tuple$11[2];
					if (hour < 0 || 12 < hour) {
						rangeErrString = "hour";
					}
				} else if ((_1 === (525)) || (_1 === (526))) {
					_tuple$12 = getnum(value, std === 526);
					min = _tuple$12[0];
					value = _tuple$12[1];
					err = _tuple$12[2];
					if (min < 0 || 60 <= min) {
						rangeErrString = "minute";
					}
				} else if ((_1 === (527)) || (_1 === (528))) {
					_tuple$13 = getnum(value, std === 528);
					sec = _tuple$13[0];
					value = _tuple$13[1];
					err = _tuple$13[2];
					if (sec < 0 || 60 <= sec) {
						rangeErrString = "second";
						break;
					}
					if (value.length >= 2 && (value.charCodeAt(0) === 46) && isDigit(value, 1)) {
						_tuple$14 = nextStdChunk(layout);
						std = _tuple$14[1];
						std = std & (65535);
						if ((std === 32) || (std === 33)) {
							break;
						}
						n = 2;
						while (true) {
							if (!(n < value.length && isDigit(value, n))) { break; }
							n = n + (1) >> 0;
						}
						_tuple$15 = parseNanoseconds(value, n);
						nsec = _tuple$15[0];
						rangeErrString = _tuple$15[1];
						err = _tuple$15[2];
						value = $substring(value, n);
					}
				} else if (_1 === (531)) {
					if (value.length < 2) {
						err = errBad;
						break;
					}
					_tmp$6 = $substring(value, 0, 2);
					_tmp$7 = $substring(value, 2);
					p = _tmp$6;
					value = _tmp$7;
					_2 = p;
					if (_2 === ("PM")) {
						pmSet = true;
					} else if (_2 === ("AM")) {
						amSet = true;
					} else {
						err = errBad;
					}
				} else if (_1 === (532)) {
					if (value.length < 2) {
						err = errBad;
						break;
					}
					_tmp$8 = $substring(value, 0, 2);
					_tmp$9 = $substring(value, 2);
					p = _tmp$8;
					value = _tmp$9;
					_3 = p;
					if (_3 === ("pm")) {
						pmSet = true;
					} else if (_3 === ("am")) {
						amSet = true;
					} else {
						err = errBad;
					}
				} else if ((_1 === (22)) || (_1 === (25)) || (_1 === (23)) || (_1 === (24)) || (_1 === (26)) || (_1 === (27)) || (_1 === (29)) || (_1 === (30)) || (_1 === (28)) || (_1 === (31))) {
					if (((std === 22) || (std === 24) || (std === 25)) && value.length >= 1 && (value.charCodeAt(0) === 90)) {
						value = $substring(value, 1);
						z = $pkg.UTC;
						break;
					}
					_tmp$10 = "";
					_tmp$11 = "";
					_tmp$12 = "";
					_tmp$13 = "";
					sign = _tmp$10;
					hour$1 = _tmp$11;
					min$1 = _tmp$12;
					seconds = _tmp$13;
					if ((std === 25) || (std === 30)) {
						if (value.length < 6) {
							err = errBad;
							break;
						}
						if (!((value.charCodeAt(3) === 58))) {
							err = errBad;
							break;
						}
						_tmp$14 = $substring(value, 0, 1);
						_tmp$15 = $substring(value, 1, 3);
						_tmp$16 = $substring(value, 4, 6);
						_tmp$17 = "00";
						_tmp$18 = $substring(value, 6);
						sign = _tmp$14;
						hour$1 = _tmp$15;
						min$1 = _tmp$16;
						seconds = _tmp$17;
						value = _tmp$18;
					} else if ((std === 29) || (std === 24)) {
						if (value.length < 3) {
							err = errBad;
							break;
						}
						_tmp$19 = $substring(value, 0, 1);
						_tmp$20 = $substring(value, 1, 3);
						_tmp$21 = "00";
						_tmp$22 = "00";
						_tmp$23 = $substring(value, 3);
						sign = _tmp$19;
						hour$1 = _tmp$20;
						min$1 = _tmp$21;
						seconds = _tmp$22;
						value = _tmp$23;
					} else if ((std === 26) || (std === 31)) {
						if (value.length < 9) {
							err = errBad;
							break;
						}
						if (!((value.charCodeAt(3) === 58)) || !((value.charCodeAt(6) === 58))) {
							err = errBad;
							break;
						}
						_tmp$24 = $substring(value, 0, 1);
						_tmp$25 = $substring(value, 1, 3);
						_tmp$26 = $substring(value, 4, 6);
						_tmp$27 = $substring(value, 7, 9);
						_tmp$28 = $substring(value, 9);
						sign = _tmp$24;
						hour$1 = _tmp$25;
						min$1 = _tmp$26;
						seconds = _tmp$27;
						value = _tmp$28;
					} else if ((std === 23) || (std === 28)) {
						if (value.length < 7) {
							err = errBad;
							break;
						}
						_tmp$29 = $substring(value, 0, 1);
						_tmp$30 = $substring(value, 1, 3);
						_tmp$31 = $substring(value, 3, 5);
						_tmp$32 = $substring(value, 5, 7);
						_tmp$33 = $substring(value, 7);
						sign = _tmp$29;
						hour$1 = _tmp$30;
						min$1 = _tmp$31;
						seconds = _tmp$32;
						value = _tmp$33;
					} else {
						if (value.length < 5) {
							err = errBad;
							break;
						}
						_tmp$34 = $substring(value, 0, 1);
						_tmp$35 = $substring(value, 1, 3);
						_tmp$36 = $substring(value, 3, 5);
						_tmp$37 = "00";
						_tmp$38 = $substring(value, 5);
						sign = _tmp$34;
						hour$1 = _tmp$35;
						min$1 = _tmp$36;
						seconds = _tmp$37;
						value = _tmp$38;
					}
					_tmp$39 = 0;
					_tmp$40 = 0;
					_tmp$41 = 0;
					hr = _tmp$39;
					mm = _tmp$40;
					ss = _tmp$41;
					_tuple$16 = atoi(hour$1);
					hr = _tuple$16[0];
					err = _tuple$16[1];
					if ($interfaceIsEqual(err, $ifaceNil)) {
						_tuple$17 = atoi(min$1);
						mm = _tuple$17[0];
						err = _tuple$17[1];
					}
					if ($interfaceIsEqual(err, $ifaceNil)) {
						_tuple$18 = atoi(seconds);
						ss = _tuple$18[0];
						err = _tuple$18[1];
					}
					zoneOffset = ($imul(((($imul(hr, 60)) + mm >> 0)), 60)) + ss >> 0;
					_4 = sign.charCodeAt(0);
					if (_4 === (43)) {
					} else if (_4 === (45)) {
						zoneOffset = -zoneOffset;
					} else {
						err = errBad;
					}
				} else if (_1 === (21)) {
					if (value.length >= 3 && $substring(value, 0, 3) === "UTC") {
						z = $pkg.UTC;
						value = $substring(value, 3);
						break;
					}
					_tuple$19 = parseTimeZone(value);
					n$1 = _tuple$19[0];
					ok = _tuple$19[1];
					if (!ok) {
						err = errBad;
						break;
					}
					_tmp$42 = $substring(value, 0, n$1);
					_tmp$43 = $substring(value, n$1);
					zoneName = _tmp$42;
					value = _tmp$43;
				} else if (_1 === (32)) {
					ndigit = 1 + ((std >> 16 >> 0)) >> 0;
					if (value.length < ndigit) {
						err = errBad;
						break;
					}
					_tuple$20 = parseNanoseconds(value, ndigit);
					nsec = _tuple$20[0];
					rangeErrString = _tuple$20[1];
					err = _tuple$20[2];
					value = $substring(value, ndigit);
				} else if (_1 === (33)) {
					if (value.length < 2 || !((value.charCodeAt(0) === 46)) || value.charCodeAt(1) < 48 || 57 < value.charCodeAt(1)) {
						break;
					}
					i = 0;
					while (true) {
						if (!(i < 9 && (i + 1 >> 0) < value.length && 48 <= value.charCodeAt((i + 1 >> 0)) && value.charCodeAt((i + 1 >> 0)) <= 57)) { break; }
						i = i + (1) >> 0;
					}
					_tuple$21 = parseNanoseconds(value, 1 + i >> 0);
					nsec = _tuple$21[0];
					rangeErrString = _tuple$21[1];
					err = _tuple$21[2];
					value = $substring(value, (1 + i >> 0));
				}
			}
			if (!(rangeErrString === "")) {
				$s = -1; return [new Time.ptr(new $Uint64(0, 0), new $Int64(0, 0), ptrType$2.nil), new ParseError.ptr(alayout, avalue, stdstr, value, ": " + rangeErrString + " out of range")];
			}
			if (!($interfaceIsEqual(err, $ifaceNil))) {
				$s = -1; return [new Time.ptr(new $Uint64(0, 0), new $Int64(0, 0), ptrType$2.nil), new ParseError.ptr(alayout, avalue, stdstr, value, "")];
			}
		}
		if (pmSet && hour < 12) {
			hour = hour + (12) >> 0;
		} else if (amSet && (hour === 12)) {
			hour = 0;
		}
		if (day < 1 || day > daysIn(((month >> 0)), year)) {
			$s = -1; return [new Time.ptr(new $Uint64(0, 0), new $Int64(0, 0), ptrType$2.nil), new ParseError.ptr(alayout, avalue, "", value, ": day out of range")];
		}
		/* */ if (!(z === ptrType$2.nil)) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (!(z === ptrType$2.nil)) { */ case 1:
			_r = Date(year, ((month >> 0)), day, hour, min, sec, nsec, z); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			$s = -1; return [_r, $ifaceNil];
		/* } */ case 2:
		/* */ if (!((zoneOffset === -1))) { $s = 4; continue; }
		/* */ $s = 5; continue;
		/* if (!((zoneOffset === -1))) { */ case 4:
			_r$1 = Date(year, ((month >> 0)), day, hour, min, sec, nsec, $pkg.UTC); /* */ $s = 6; case 6: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
			t = $clone(_r$1, Time);
			t.addSec((x = (new $Int64(0, zoneOffset)), new $Int64(-x.$high, -x.$low)));
			_r$2 = local.lookup(t.unixSec()); /* */ $s = 7; case 7: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
			_tuple$22 = _r$2;
			name = _tuple$22[0];
			offset = _tuple$22[1];
			if ((offset === zoneOffset) && (zoneName === "" || name === zoneName)) {
				t.setLoc(local);
				$s = -1; return [t, $ifaceNil];
			}
			t.setLoc(FixedZone(zoneName, zoneOffset));
			$s = -1; return [t, $ifaceNil];
		/* } */ case 5:
		/* */ if (!(zoneName === "")) { $s = 8; continue; }
		/* */ $s = 9; continue;
		/* if (!(zoneName === "")) { */ case 8:
			_r$3 = Date(year, ((month >> 0)), day, hour, min, sec, nsec, $pkg.UTC); /* */ $s = 10; case 10: if($c) { $c = false; _r$3 = _r$3.$blk(); } if (_r$3 && _r$3.$blk !== undefined) { break s; }
			t$1 = $clone(_r$3, Time);
			_r$4 = local.lookupName(zoneName, t$1.unixSec()); /* */ $s = 11; case 11: if($c) { $c = false; _r$4 = _r$4.$blk(); } if (_r$4 && _r$4.$blk !== undefined) { break s; }
			_tuple$23 = _r$4;
			offset$1 = _tuple$23[0];
			ok$1 = _tuple$23[1];
			if (ok$1) {
				t$1.addSec((x$1 = (new $Int64(0, offset$1)), new $Int64(-x$1.$high, -x$1.$low)));
				t$1.setLoc(local);
				$s = -1; return [t$1, $ifaceNil];
			}
			if (zoneName.length > 3 && $substring(zoneName, 0, 3) === "GMT") {
				_tuple$24 = atoi($substring(zoneName, 3));
				offset$1 = _tuple$24[0];
				offset$1 = $imul(offset$1, (3600));
			}
			t$1.setLoc(FixedZone(zoneName, offset$1));
			$s = -1; return [t$1, $ifaceNil];
		/* } */ case 9:
		_r$5 = Date(year, ((month >> 0)), day, hour, min, sec, nsec, defaultLocation); /* */ $s = 12; case 12: if($c) { $c = false; _r$5 = _r$5.$blk(); } if (_r$5 && _r$5.$blk !== undefined) { break s; }
		$s = -1; return [_r$5, $ifaceNil];
		/* */ } return; } if ($f === undefined) { $f = { $blk: parse }; } $f._1 = _1; $f._2 = _2; $f._3 = _3; $f._4 = _4; $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f._r$3 = _r$3; $f._r$4 = _r$4; $f._r$5 = _r$5; $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f._tmp$10 = _tmp$10; $f._tmp$11 = _tmp$11; $f._tmp$12 = _tmp$12; $f._tmp$13 = _tmp$13; $f._tmp$14 = _tmp$14; $f._tmp$15 = _tmp$15; $f._tmp$16 = _tmp$16; $f._tmp$17 = _tmp$17; $f._tmp$18 = _tmp$18; $f._tmp$19 = _tmp$19; $f._tmp$2 = _tmp$2; $f._tmp$20 = _tmp$20; $f._tmp$21 = _tmp$21; $f._tmp$22 = _tmp$22; $f._tmp$23 = _tmp$23; $f._tmp$24 = _tmp$24; $f._tmp$25 = _tmp$25; $f._tmp$26 = _tmp$26; $f._tmp$27 = _tmp$27; $f._tmp$28 = _tmp$28; $f._tmp$29 = _tmp$29; $f._tmp$3 = _tmp$3; $f._tmp$30 = _tmp$30; $f._tmp$31 = _tmp$31; $f._tmp$32 = _tmp$32; $f._tmp$33 = _tmp$33; $f._tmp$34 = _tmp$34; $f._tmp$35 = _tmp$35; $f._tmp$36 = _tmp$36; $f._tmp$37 = _tmp$37; $f._tmp$38 = _tmp$38; $f._tmp$39 = _tmp$39; $f._tmp$4 = _tmp$4; $f._tmp$40 = _tmp$40; $f._tmp$41 = _tmp$41; $f._tmp$42 = _tmp$42; $f._tmp$43 = _tmp$43; $f._tmp$5 = _tmp$5; $f._tmp$6 = _tmp$6; $f._tmp$7 = _tmp$7; $f._tmp$8 = _tmp$8; $f._tmp$9 = _tmp$9; $f._tuple = _tuple; $f._tuple$1 = _tuple$1; $f._tuple$10 = _tuple$10; $f._tuple$11 = _tuple$11; $f._tuple$12 = _tuple$12; $f._tuple$13 = _tuple$13; $f._tuple$14 = _tuple$14; $f._tuple$15 = _tuple$15; $f._tuple$16 = _tuple$16; $f._tuple$17 = _tuple$17; $f._tuple$18 = _tuple$18; $f._tuple$19 = _tuple$19; $f._tuple$2 = _tuple$2; $f._tuple$20 = _tuple$20; $f._tuple$21 = _tuple$21; $f._tuple$22 = _tuple$22; $f._tuple$23 = _tuple$23; $f._tuple$24 = _tuple$24; $f._tuple$3 = _tuple$3; $f._tuple$4 = _tuple$4; $f._tuple$5 = _tuple$5; $f._tuple$6 = _tuple$6; $f._tuple$7 = _tuple$7; $f._tuple$8 = _tuple$8; $f._tuple$9 = _tuple$9; $f.alayout = alayout; $f.amSet = amSet; $f.avalue = avalue; $f.day = day; $f.defaultLocation = defaultLocation; $f.err = err; $f.hour = hour; $f.hour$1 = hour$1; $f.hr = hr; $f.i = i; $f.layout = layout; $f.local = local; $f.min = min; $f.min$1 = min$1; $f.mm = mm; $f.month = month; $f.n = n; $f.n$1 = n$1; $f.name = name; $f.ndigit = ndigit; $f.nsec = nsec; $f.offset = offset; $f.offset$1 = offset$1; $f.ok = ok; $f.ok$1 = ok$1; $f.p = p; $f.pmSet = pmSet; $f.prefix = prefix; $f.rangeErrString = rangeErrString; $f.sec = sec; $f.seconds = seconds; $f.sign = sign; $f.ss = ss; $f.std = std; $f.stdstr = stdstr; $f.suffix = suffix; $f.t = t; $f.t$1 = t$1; $f.value = value; $f.x = x; $f.x$1 = x$1; $f.year = year; $f.z = z; $f.zoneName = zoneName; $f.zoneOffset = zoneOffset; $f.$s = $s; $f.$r = $r; return $f;
	};
	parseTimeZone = function(value) {
		var _1, _tmp, _tmp$1, _tmp$10, _tmp$11, _tmp$12, _tmp$13, _tmp$14, _tmp$15, _tmp$16, _tmp$17, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tmp$8, _tmp$9, c, length, nUpper, ok, value;
		length = 0;
		ok = false;
		if (value.length < 3) {
			_tmp = 0;
			_tmp$1 = false;
			length = _tmp;
			ok = _tmp$1;
			return [length, ok];
		}
		if (value.length >= 4 && ($substring(value, 0, 4) === "ChST" || $substring(value, 0, 4) === "MeST")) {
			_tmp$2 = 4;
			_tmp$3 = true;
			length = _tmp$2;
			ok = _tmp$3;
			return [length, ok];
		}
		if ($substring(value, 0, 3) === "GMT") {
			length = parseGMT(value);
			_tmp$4 = length;
			_tmp$5 = true;
			length = _tmp$4;
			ok = _tmp$5;
			return [length, ok];
		}
		if ((value.charCodeAt(0) === 43) || (value.charCodeAt(0) === 45)) {
			length = parseSignedOffset(value);
			_tmp$6 = length;
			_tmp$7 = true;
			length = _tmp$6;
			ok = _tmp$7;
			return [length, ok];
		}
		nUpper = 0;
		nUpper = 0;
		while (true) {
			if (!(nUpper < 6)) { break; }
			if (nUpper >= value.length) {
				break;
			}
			c = value.charCodeAt(nUpper);
			if (c < 65 || 90 < c) {
				break;
			}
			nUpper = nUpper + (1) >> 0;
		}
		_1 = nUpper;
		if ((_1 === (0)) || (_1 === (1)) || (_1 === (2)) || (_1 === (6))) {
			_tmp$8 = 0;
			_tmp$9 = false;
			length = _tmp$8;
			ok = _tmp$9;
			return [length, ok];
		} else if (_1 === (5)) {
			if (value.charCodeAt(4) === 84) {
				_tmp$10 = 5;
				_tmp$11 = true;
				length = _tmp$10;
				ok = _tmp$11;
				return [length, ok];
			}
		} else if (_1 === (4)) {
			if ((value.charCodeAt(3) === 84) || $substring(value, 0, 4) === "WITA") {
				_tmp$12 = 4;
				_tmp$13 = true;
				length = _tmp$12;
				ok = _tmp$13;
				return [length, ok];
			}
		} else if (_1 === (3)) {
			_tmp$14 = 3;
			_tmp$15 = true;
			length = _tmp$14;
			ok = _tmp$15;
			return [length, ok];
		}
		_tmp$16 = 0;
		_tmp$17 = false;
		length = _tmp$16;
		ok = _tmp$17;
		return [length, ok];
	};
	parseGMT = function(value) {
		var value;
		value = $substring(value, 3);
		if (value.length === 0) {
			return 3;
		}
		return 3 + parseSignedOffset(value) >> 0;
	};
	parseSignedOffset = function(value) {
		var _tuple, err, rem, sign, value, x;
		sign = value.charCodeAt(0);
		if (!((sign === 45)) && !((sign === 43))) {
			return 0;
		}
		_tuple = leadingInt($substring(value, 1));
		x = _tuple[0];
		rem = _tuple[1];
		err = _tuple[2];
		if (!($interfaceIsEqual(err, $ifaceNil))) {
			return 0;
		}
		if (sign === 45) {
			x = new $Int64(-x.$high, -x.$low);
		}
		if ((x.$high === 0 && x.$low === 0) || (x.$high < -1 || (x.$high === -1 && x.$low < 4294967282)) || (0 < x.$high || (0 === x.$high && 12 < x.$low))) {
			return 0;
		}
		return value.length - rem.length >> 0;
	};
	parseNanoseconds = function(value, nbytes) {
		var _tuple, err, i, nbytes, ns, rangeErrString, scaleDigits, value;
		ns = 0;
		rangeErrString = "";
		err = $ifaceNil;
		if (!((value.charCodeAt(0) === 46))) {
			err = errBad;
			return [ns, rangeErrString, err];
		}
		_tuple = atoi($substring(value, 1, nbytes));
		ns = _tuple[0];
		err = _tuple[1];
		if (!($interfaceIsEqual(err, $ifaceNil))) {
			return [ns, rangeErrString, err];
		}
		if (ns < 0 || 1000000000 <= ns) {
			rangeErrString = "fractional second";
			return [ns, rangeErrString, err];
		}
		scaleDigits = 10 - nbytes >> 0;
		i = 0;
		while (true) {
			if (!(i < scaleDigits)) { break; }
			ns = $imul(ns, (10));
			i = i + (1) >> 0;
		}
		return [ns, rangeErrString, err];
	};
	leadingInt = function(s) {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tmp$8, c, err, i, rem, s, x, x$1, x$2, x$3;
		x = new $Int64(0, 0);
		rem = "";
		err = $ifaceNil;
		i = 0;
		while (true) {
			if (!(i < s.length)) { break; }
			c = s.charCodeAt(i);
			if (c < 48 || c > 57) {
				break;
			}
			if ((x.$high > 214748364 || (x.$high === 214748364 && x.$low > 3435973836))) {
				_tmp = new $Int64(0, 0);
				_tmp$1 = "";
				_tmp$2 = errLeadingInt;
				x = _tmp;
				rem = _tmp$1;
				err = _tmp$2;
				return [x, rem, err];
			}
			x = (x$1 = (x$2 = $mul64(x, new $Int64(0, 10)), x$3 = (new $Int64(0, c)), new $Int64(x$2.$high + x$3.$high, x$2.$low + x$3.$low)), new $Int64(x$1.$high - 0, x$1.$low - 48));
			if ((x.$high < 0 || (x.$high === 0 && x.$low < 0))) {
				_tmp$3 = new $Int64(0, 0);
				_tmp$4 = "";
				_tmp$5 = errLeadingInt;
				x = _tmp$3;
				rem = _tmp$4;
				err = _tmp$5;
				return [x, rem, err];
			}
			i = i + (1) >> 0;
		}
		_tmp$6 = x;
		_tmp$7 = $substring(s, i);
		_tmp$8 = $ifaceNil;
		x = _tmp$6;
		rem = _tmp$7;
		err = _tmp$8;
		return [x, rem, err];
	};
	Time.ptr.prototype.nsec = function() {
		var t, x;
		t = this;
		return (((x = t.wall, new $Uint64(x.$high & 0, (x.$low & 1073741823) >>> 0)).$low >> 0));
	};
	Time.prototype.nsec = function() { return this.$val.nsec(); };
	Time.ptr.prototype.sec = function() {
		var t, x, x$1, x$2, x$3;
		t = this;
		if (!((x = (x$1 = t.wall, new $Uint64(x$1.$high & 2147483648, (x$1.$low & 0) >>> 0)), (x.$high === 0 && x.$low === 0)))) {
			return (x$2 = ((x$3 = $shiftRightUint64($shiftLeft64(t.wall, 1), 31), new $Int64(x$3.$high, x$3.$low))), new $Int64(13 + x$2.$high, 3618733952 + x$2.$low));
		}
		return t.ext;
	};
	Time.prototype.sec = function() { return this.$val.sec(); };
	Time.ptr.prototype.unixSec = function() {
		var t, x;
		t = this;
		return (x = t.sec(), new $Int64(x.$high + -15, x.$low + 2288912640));
	};
	Time.prototype.unixSec = function() { return this.$val.unixSec(); };
	Time.ptr.prototype.addSec = function(d) {
		var d, dsec, sec, t, x, x$1, x$2, x$3, x$4, x$5, x$6, x$7, x$8;
		t = this;
		if (!((x = (x$1 = t.wall, new $Uint64(x$1.$high & 2147483648, (x$1.$low & 0) >>> 0)), (x.$high === 0 && x.$low === 0)))) {
			sec = ((x$2 = $shiftRightUint64($shiftLeft64(t.wall, 1), 31), new $Int64(x$2.$high, x$2.$low)));
			dsec = new $Int64(sec.$high + d.$high, sec.$low + d.$low);
			if ((0 < dsec.$high || (0 === dsec.$high && 0 <= dsec.$low)) && (dsec.$high < 1 || (dsec.$high === 1 && dsec.$low <= 4294967295))) {
				t.wall = (x$3 = (x$4 = (x$5 = t.wall, new $Uint64(x$5.$high & 0, (x$5.$low & 1073741823) >>> 0)), x$6 = $shiftLeft64((new $Uint64(dsec.$high, dsec.$low)), 30), new $Uint64(x$4.$high | x$6.$high, (x$4.$low | x$6.$low) >>> 0)), new $Uint64(x$3.$high | 2147483648, (x$3.$low | 0) >>> 0));
				return;
			}
			t.stripMono();
		}
		t.ext = (x$7 = t.ext, x$8 = d, new $Int64(x$7.$high + x$8.$high, x$7.$low + x$8.$low));
	};
	Time.prototype.addSec = function(d) { return this.$val.addSec(d); };
	Time.ptr.prototype.setLoc = function(loc) {
		var loc, t;
		t = this;
		if (loc === utcLoc) {
			loc = ptrType$2.nil;
		}
		t.stripMono();
		t.loc = loc;
	};
	Time.prototype.setLoc = function(loc) { return this.$val.setLoc(loc); };
	Time.ptr.prototype.stripMono = function() {
		var t, x, x$1, x$2, x$3;
		t = this;
		if (!((x = (x$1 = t.wall, new $Uint64(x$1.$high & 2147483648, (x$1.$low & 0) >>> 0)), (x.$high === 0 && x.$low === 0)))) {
			t.ext = t.sec();
			t.wall = (x$2 = t.wall, x$3 = new $Uint64(0, 1073741823), new $Uint64(x$2.$high & x$3.$high, (x$2.$low & x$3.$low) >>> 0));
		}
	};
	Time.prototype.stripMono = function() { return this.$val.stripMono(); };
	Time.ptr.prototype.After = function(u) {
		var t, ts, u, us, x, x$1, x$2, x$3, x$4, x$5;
		t = this;
		if (!((x = (x$1 = (x$2 = t.wall, x$3 = u.wall, new $Uint64(x$2.$high & x$3.$high, (x$2.$low & x$3.$low) >>> 0)), new $Uint64(x$1.$high & 2147483648, (x$1.$low & 0) >>> 0)), (x.$high === 0 && x.$low === 0)))) {
			return (x$4 = t.ext, x$5 = u.ext, (x$4.$high > x$5.$high || (x$4.$high === x$5.$high && x$4.$low > x$5.$low)));
		}
		ts = t.sec();
		us = u.sec();
		return (ts.$high > us.$high || (ts.$high === us.$high && ts.$low > us.$low)) || (ts.$high === us.$high && ts.$low === us.$low) && t.nsec() > u.nsec();
	};
	Time.prototype.After = function(u) { return this.$val.After(u); };
	Time.ptr.prototype.Before = function(u) {
		var t, u, x, x$1, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9;
		t = this;
		if (!((x = (x$1 = (x$2 = t.wall, x$3 = u.wall, new $Uint64(x$2.$high & x$3.$high, (x$2.$low & x$3.$low) >>> 0)), new $Uint64(x$1.$high & 2147483648, (x$1.$low & 0) >>> 0)), (x.$high === 0 && x.$low === 0)))) {
			return (x$4 = t.ext, x$5 = u.ext, (x$4.$high < x$5.$high || (x$4.$high === x$5.$high && x$4.$low < x$5.$low)));
		}
		return (x$6 = t.sec(), x$7 = u.sec(), (x$6.$high < x$7.$high || (x$6.$high === x$7.$high && x$6.$low < x$7.$low))) || (x$8 = t.sec(), x$9 = u.sec(), (x$8.$high === x$9.$high && x$8.$low === x$9.$low)) && t.nsec() < u.nsec();
	};
	Time.prototype.Before = function(u) { return this.$val.Before(u); };
	Time.ptr.prototype.Equal = function(u) {
		var t, u, x, x$1, x$2, x$3, x$4, x$5, x$6, x$7;
		t = this;
		if (!((x = (x$1 = (x$2 = t.wall, x$3 = u.wall, new $Uint64(x$2.$high & x$3.$high, (x$2.$low & x$3.$low) >>> 0)), new $Uint64(x$1.$high & 2147483648, (x$1.$low & 0) >>> 0)), (x.$high === 0 && x.$low === 0)))) {
			return (x$4 = t.ext, x$5 = u.ext, (x$4.$high === x$5.$high && x$4.$low === x$5.$low));
		}
		return (x$6 = t.sec(), x$7 = u.sec(), (x$6.$high === x$7.$high && x$6.$low === x$7.$low)) && (t.nsec() === u.nsec());
	};
	Time.prototype.Equal = function(u) { return this.$val.Equal(u); };
	Month.prototype.String = function() {
		var buf, m, n, x;
		m = this.$val;
		if (1 <= m && m <= 12) {
			return (x = m - 1 >> 0, ((x < 0 || x >= months.length) ? ($throwRuntimeError("index out of range"), undefined) : months[x]));
		}
		buf = $makeSlice(sliceType$3, 20);
		n = fmtInt(buf, (new $Uint64(0, m)));
		return "%!Month(" + ($bytesToString($subslice(buf, n))) + ")";
	};
	$ptrType(Month).prototype.String = function() { return new Month(this.$get()).String(); };
	Weekday.prototype.String = function() {
		var buf, d, n;
		d = this.$val;
		if (0 <= d && d <= 6) {
			return ((d < 0 || d >= days.length) ? ($throwRuntimeError("index out of range"), undefined) : days[d]);
		}
		buf = $makeSlice(sliceType$3, 20);
		n = fmtInt(buf, (new $Uint64(0, d)));
		return "%!Weekday(" + ($bytesToString($subslice(buf, n))) + ")";
	};
	$ptrType(Weekday).prototype.String = function() { return new Weekday(this.$get()).String(); };
	Time.ptr.prototype.IsZero = function() {
		var t, x;
		t = this;
		return (x = t.sec(), (x.$high === 0 && x.$low === 0)) && (t.nsec() === 0);
	};
	Time.prototype.IsZero = function() { return this.$val.IsZero(); };
	Time.ptr.prototype.abs = function() {
		var _r, _r$1, _tuple, l, offset, sec, t, x, x$1, x$2, x$3, x$4, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; _tuple = $f._tuple; l = $f.l; offset = $f.offset; sec = $f.sec; t = $f.t; x = $f.x; x$1 = $f.x$1; x$2 = $f.x$2; x$3 = $f.x$3; x$4 = $f.x$4; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
		l = t.loc;
		/* */ if (l === ptrType$2.nil || l === localLoc) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (l === ptrType$2.nil || l === localLoc) { */ case 1:
			_r = l.get(); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			l = _r;
		/* } */ case 2:
		sec = t.unixSec();
		/* */ if (!(l === utcLoc)) { $s = 4; continue; }
		/* */ $s = 5; continue;
		/* if (!(l === utcLoc)) { */ case 4:
			/* */ if (!(l.cacheZone === ptrType.nil) && (x = l.cacheStart, (x.$high < sec.$high || (x.$high === sec.$high && x.$low <= sec.$low))) && (x$1 = l.cacheEnd, (sec.$high < x$1.$high || (sec.$high === x$1.$high && sec.$low < x$1.$low)))) { $s = 6; continue; }
			/* */ $s = 7; continue;
			/* if (!(l.cacheZone === ptrType.nil) && (x = l.cacheStart, (x.$high < sec.$high || (x.$high === sec.$high && x.$low <= sec.$low))) && (x$1 = l.cacheEnd, (sec.$high < x$1.$high || (sec.$high === x$1.$high && sec.$low < x$1.$low)))) { */ case 6:
				sec = (x$2 = (new $Int64(0, l.cacheZone.offset)), new $Int64(sec.$high + x$2.$high, sec.$low + x$2.$low));
				$s = 8; continue;
			/* } else { */ case 7:
				_r$1 = l.lookup(sec); /* */ $s = 9; case 9: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
				_tuple = _r$1;
				offset = _tuple[1];
				sec = (x$3 = (new $Int64(0, offset)), new $Int64(sec.$high + x$3.$high, sec.$low + x$3.$low));
			/* } */ case 8:
		/* } */ case 5:
		$s = -1; return ((x$4 = new $Int64(sec.$high + 2147483646, sec.$low + 450480384), new $Uint64(x$4.$high, x$4.$low)));
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.abs }; } $f._r = _r; $f._r$1 = _r$1; $f._tuple = _tuple; $f.l = l; $f.offset = offset; $f.sec = sec; $f.t = t; $f.x = x; $f.x$1 = x$1; $f.x$2 = x$2; $f.x$3 = x$3; $f.x$4 = x$4; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.abs = function() { return this.$val.abs(); };
	Time.ptr.prototype.locabs = function() {
		var _r, _r$1, _tuple, abs, l, name, offset, sec, t, x, x$1, x$2, x$3, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; _tuple = $f._tuple; abs = $f.abs; l = $f.l; name = $f.name; offset = $f.offset; sec = $f.sec; t = $f.t; x = $f.x; x$1 = $f.x$1; x$2 = $f.x$2; x$3 = $f.x$3; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		name = "";
		offset = 0;
		abs = new $Uint64(0, 0);
		t = this;
		l = t.loc;
		/* */ if (l === ptrType$2.nil || l === localLoc) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (l === ptrType$2.nil || l === localLoc) { */ case 1:
			_r = l.get(); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			l = _r;
		/* } */ case 2:
		sec = t.unixSec();
		/* */ if (!(l === utcLoc)) { $s = 4; continue; }
		/* */ $s = 5; continue;
		/* if (!(l === utcLoc)) { */ case 4:
			/* */ if (!(l.cacheZone === ptrType.nil) && (x = l.cacheStart, (x.$high < sec.$high || (x.$high === sec.$high && x.$low <= sec.$low))) && (x$1 = l.cacheEnd, (sec.$high < x$1.$high || (sec.$high === x$1.$high && sec.$low < x$1.$low)))) { $s = 7; continue; }
			/* */ $s = 8; continue;
			/* if (!(l.cacheZone === ptrType.nil) && (x = l.cacheStart, (x.$high < sec.$high || (x.$high === sec.$high && x.$low <= sec.$low))) && (x$1 = l.cacheEnd, (sec.$high < x$1.$high || (sec.$high === x$1.$high && sec.$low < x$1.$low)))) { */ case 7:
				name = l.cacheZone.name;
				offset = l.cacheZone.offset;
				$s = 9; continue;
			/* } else { */ case 8:
				_r$1 = l.lookup(sec); /* */ $s = 10; case 10: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
				_tuple = _r$1;
				name = _tuple[0];
				offset = _tuple[1];
			/* } */ case 9:
			sec = (x$2 = (new $Int64(0, offset)), new $Int64(sec.$high + x$2.$high, sec.$low + x$2.$low));
			$s = 6; continue;
		/* } else { */ case 5:
			name = "UTC";
		/* } */ case 6:
		abs = ((x$3 = new $Int64(sec.$high + 2147483646, sec.$low + 450480384), new $Uint64(x$3.$high, x$3.$low)));
		$s = -1; return [name, offset, abs];
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.locabs }; } $f._r = _r; $f._r$1 = _r$1; $f._tuple = _tuple; $f.abs = abs; $f.l = l; $f.name = name; $f.offset = offset; $f.sec = sec; $f.t = t; $f.x = x; $f.x$1 = x$1; $f.x$2 = x$2; $f.x$3 = x$3; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.locabs = function() { return this.$val.locabs(); };
	Time.ptr.prototype.Date = function() {
		var _r, _tuple, day, month, t, year, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _tuple = $f._tuple; day = $f.day; month = $f.month; t = $f.t; year = $f.year; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		year = 0;
		month = 0;
		day = 0;
		t = this;
		_r = $clone(t, Time).date(true); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_tuple = _r;
		year = _tuple[0];
		month = _tuple[1];
		day = _tuple[2];
		$s = -1; return [year, month, day];
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.Date }; } $f._r = _r; $f._tuple = _tuple; $f.day = day; $f.month = month; $f.t = t; $f.year = year; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.Date = function() { return this.$val.Date(); };
	Time.ptr.prototype.Year = function() {
		var _r, _tuple, t, year, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _tuple = $f._tuple; t = $f.t; year = $f.year; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
		_r = $clone(t, Time).date(false); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_tuple = _r;
		year = _tuple[0];
		$s = -1; return year;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.Year }; } $f._r = _r; $f._tuple = _tuple; $f.t = t; $f.year = year; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.Year = function() { return this.$val.Year(); };
	Time.ptr.prototype.Month = function() {
		var _r, _tuple, month, t, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _tuple = $f._tuple; month = $f.month; t = $f.t; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
		_r = $clone(t, Time).date(true); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_tuple = _r;
		month = _tuple[1];
		$s = -1; return month;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.Month }; } $f._r = _r; $f._tuple = _tuple; $f.month = month; $f.t = t; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.Month = function() { return this.$val.Month(); };
	Time.ptr.prototype.Day = function() {
		var _r, _tuple, day, t, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _tuple = $f._tuple; day = $f.day; t = $f.t; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
		_r = $clone(t, Time).date(true); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_tuple = _r;
		day = _tuple[2];
		$s = -1; return day;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.Day }; } $f._r = _r; $f._tuple = _tuple; $f.day = day; $f.t = t; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.Day = function() { return this.$val.Day(); };
	Time.ptr.prototype.Weekday = function() {
		var _r, _r$1, t, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; t = $f.t; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
		_r = $clone(t, Time).abs(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_r$1 = absWeekday(_r); /* */ $s = 2; case 2: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		$s = -1; return _r$1;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.Weekday }; } $f._r = _r; $f._r$1 = _r$1; $f.t = t; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.Weekday = function() { return this.$val.Weekday(); };
	absWeekday = function(abs) {
		var _q, abs, sec;
		sec = $div64((new $Uint64(abs.$high + 0, abs.$low + 86400)), new $Uint64(0, 604800), true);
		return (((_q = ((sec.$low >> 0)) / 86400, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")) >> 0));
	};
	Time.ptr.prototype.ISOWeek = function() {
		var _q, _r, _r$1, _r$2, _r$3, _r$4, _tuple, day, dec31wday, jan1wday, month, t, wday, week, yday, year, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _q = $f._q; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; _r$3 = $f._r$3; _r$4 = $f._r$4; _tuple = $f._tuple; day = $f.day; dec31wday = $f.dec31wday; jan1wday = $f.jan1wday; month = $f.month; t = $f.t; wday = $f.wday; week = $f.week; yday = $f.yday; year = $f.year; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		year = 0;
		week = 0;
		t = this;
		_r = $clone(t, Time).date(true); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_tuple = _r;
		year = _tuple[0];
		month = _tuple[1];
		day = _tuple[2];
		yday = _tuple[3];
		_r$2 = $clone(t, Time).Weekday(); /* */ $s = 2; case 2: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
		wday = (_r$1 = (((_r$2 + 6 >> 0) >> 0)) % 7, _r$1 === _r$1 ? _r$1 : $throwRuntimeError("integer divide by zero"));
		week = (_q = (((yday - wday >> 0) + 7 >> 0)) / 7, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
		jan1wday = (_r$3 = (((wday - yday >> 0) + 371 >> 0)) % 7, _r$3 === _r$3 ? _r$3 : $throwRuntimeError("integer divide by zero"));
		if (1 <= jan1wday && jan1wday <= 3) {
			week = week + (1) >> 0;
		}
		if (week === 0) {
			year = year - (1) >> 0;
			week = 52;
			if ((jan1wday === 4) || ((jan1wday === 5) && isLeap(year))) {
				week = week + (1) >> 0;
			}
		}
		if ((month === 12) && day >= 29 && wday < 3) {
			dec31wday = (_r$4 = (((wday + 31 >> 0) - day >> 0)) % 7, _r$4 === _r$4 ? _r$4 : $throwRuntimeError("integer divide by zero"));
			if (0 <= dec31wday && dec31wday <= 2) {
				year = year + (1) >> 0;
				week = 1;
			}
		}
		$s = -1; return [year, week];
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.ISOWeek }; } $f._q = _q; $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f._r$3 = _r$3; $f._r$4 = _r$4; $f._tuple = _tuple; $f.day = day; $f.dec31wday = dec31wday; $f.jan1wday = jan1wday; $f.month = month; $f.t = t; $f.wday = wday; $f.week = week; $f.yday = yday; $f.year = year; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.ISOWeek = function() { return this.$val.ISOWeek(); };
	Time.ptr.prototype.Clock = function() {
		var _r, _r$1, _tuple, hour, min, sec, t, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; _tuple = $f._tuple; hour = $f.hour; min = $f.min; sec = $f.sec; t = $f.t; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		hour = 0;
		min = 0;
		sec = 0;
		t = this;
		_r = $clone(t, Time).abs(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_r$1 = absClock(_r); /* */ $s = 2; case 2: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		_tuple = _r$1;
		hour = _tuple[0];
		min = _tuple[1];
		sec = _tuple[2];
		$s = -1; return [hour, min, sec];
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.Clock }; } $f._r = _r; $f._r$1 = _r$1; $f._tuple = _tuple; $f.hour = hour; $f.min = min; $f.sec = sec; $f.t = t; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.Clock = function() { return this.$val.Clock(); };
	absClock = function(abs) {
		var _q, _q$1, abs, hour, min, sec;
		hour = 0;
		min = 0;
		sec = 0;
		sec = (($div64(abs, new $Uint64(0, 86400), true).$low >> 0));
		hour = (_q = sec / 3600, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
		sec = sec - (($imul(hour, 3600))) >> 0;
		min = (_q$1 = sec / 60, (_q$1 === _q$1 && _q$1 !== 1/0 && _q$1 !== -1/0) ? _q$1 >> 0 : $throwRuntimeError("integer divide by zero"));
		sec = sec - (($imul(min, 60))) >> 0;
		return [hour, min, sec];
	};
	Time.ptr.prototype.Hour = function() {
		var _q, _r, t, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _q = $f._q; _r = $f._r; t = $f.t; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
		_r = $clone(t, Time).abs(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return (_q = (($div64(_r, new $Uint64(0, 86400), true).$low >> 0)) / 3600, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.Hour }; } $f._q = _q; $f._r = _r; $f.t = t; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.Hour = function() { return this.$val.Hour(); };
	Time.ptr.prototype.Minute = function() {
		var _q, _r, t, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _q = $f._q; _r = $f._r; t = $f.t; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
		_r = $clone(t, Time).abs(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return (_q = (($div64(_r, new $Uint64(0, 3600), true).$low >> 0)) / 60, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.Minute }; } $f._q = _q; $f._r = _r; $f.t = t; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.Minute = function() { return this.$val.Minute(); };
	Time.ptr.prototype.Second = function() {
		var _r, t, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; t = $f.t; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
		_r = $clone(t, Time).abs(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return (($div64(_r, new $Uint64(0, 60), true).$low >> 0));
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.Second }; } $f._r = _r; $f.t = t; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.Second = function() { return this.$val.Second(); };
	Time.ptr.prototype.Nanosecond = function() {
		var t;
		t = this;
		return ((t.nsec() >> 0));
	};
	Time.prototype.Nanosecond = function() { return this.$val.Nanosecond(); };
	Time.ptr.prototype.YearDay = function() {
		var _r, _tuple, t, yday, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _tuple = $f._tuple; t = $f.t; yday = $f.yday; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
		_r = $clone(t, Time).date(false); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_tuple = _r;
		yday = _tuple[3];
		$s = -1; return yday + 1 >> 0;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.YearDay }; } $f._r = _r; $f._tuple = _tuple; $f.t = t; $f.yday = yday; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.YearDay = function() { return this.$val.YearDay(); };
	Duration.prototype.String = function() {
		var _tuple, _tuple$1, buf, d, neg, prec, u, w;
		d = this;
		buf = arrayType$3.zero();
		w = 32;
		u = (new $Uint64(d.$high, d.$low));
		neg = (d.$high < 0 || (d.$high === 0 && d.$low < 0));
		if (neg) {
			u = new $Uint64(-u.$high, -u.$low);
		}
		if ((u.$high < 0 || (u.$high === 0 && u.$low < 1000000000))) {
			prec = 0;
			w = w - (1) >> 0;
			((w < 0 || w >= buf.length) ? ($throwRuntimeError("index out of range"), undefined) : buf[w] = 115);
			w = w - (1) >> 0;
			if ((u.$high === 0 && u.$low === 0)) {
				return "0s";
			} else if ((u.$high < 0 || (u.$high === 0 && u.$low < 1000))) {
				prec = 0;
				((w < 0 || w >= buf.length) ? ($throwRuntimeError("index out of range"), undefined) : buf[w] = 110);
			} else if ((u.$high < 0 || (u.$high === 0 && u.$low < 1000000))) {
				prec = 3;
				w = w - (1) >> 0;
				$copyString($subslice(new sliceType$3(buf), w), "\xC2\xB5");
			} else {
				prec = 6;
				((w < 0 || w >= buf.length) ? ($throwRuntimeError("index out of range"), undefined) : buf[w] = 109);
			}
			_tuple = fmtFrac($subslice(new sliceType$3(buf), 0, w), u, prec);
			w = _tuple[0];
			u = _tuple[1];
			w = fmtInt($subslice(new sliceType$3(buf), 0, w), u);
		} else {
			w = w - (1) >> 0;
			((w < 0 || w >= buf.length) ? ($throwRuntimeError("index out of range"), undefined) : buf[w] = 115);
			_tuple$1 = fmtFrac($subslice(new sliceType$3(buf), 0, w), u, 9);
			w = _tuple$1[0];
			u = _tuple$1[1];
			w = fmtInt($subslice(new sliceType$3(buf), 0, w), $div64(u, new $Uint64(0, 60), true));
			u = $div64(u, (new $Uint64(0, 60)), false);
			if ((u.$high > 0 || (u.$high === 0 && u.$low > 0))) {
				w = w - (1) >> 0;
				((w < 0 || w >= buf.length) ? ($throwRuntimeError("index out of range"), undefined) : buf[w] = 109);
				w = fmtInt($subslice(new sliceType$3(buf), 0, w), $div64(u, new $Uint64(0, 60), true));
				u = $div64(u, (new $Uint64(0, 60)), false);
				if ((u.$high > 0 || (u.$high === 0 && u.$low > 0))) {
					w = w - (1) >> 0;
					((w < 0 || w >= buf.length) ? ($throwRuntimeError("index out of range"), undefined) : buf[w] = 104);
					w = fmtInt($subslice(new sliceType$3(buf), 0, w), u);
				}
			}
		}
		if (neg) {
			w = w - (1) >> 0;
			((w < 0 || w >= buf.length) ? ($throwRuntimeError("index out of range"), undefined) : buf[w] = 45);
		}
		return ($bytesToString($subslice(new sliceType$3(buf), w)));
	};
	$ptrType(Duration).prototype.String = function() { return this.$get().String(); };
	fmtFrac = function(buf, v, prec) {
		var _tmp, _tmp$1, buf, digit, i, nv, nw, prec, print, v, w;
		nw = 0;
		nv = new $Uint64(0, 0);
		w = buf.$length;
		print = false;
		i = 0;
		while (true) {
			if (!(i < prec)) { break; }
			digit = $div64(v, new $Uint64(0, 10), true);
			print = print || !((digit.$high === 0 && digit.$low === 0));
			if (print) {
				w = w - (1) >> 0;
				((w < 0 || w >= buf.$length) ? ($throwRuntimeError("index out of range"), undefined) : buf.$array[buf.$offset + w] = (((digit.$low << 24 >>> 24)) + 48 << 24 >>> 24));
			}
			v = $div64(v, (new $Uint64(0, 10)), false);
			i = i + (1) >> 0;
		}
		if (print) {
			w = w - (1) >> 0;
			((w < 0 || w >= buf.$length) ? ($throwRuntimeError("index out of range"), undefined) : buf.$array[buf.$offset + w] = 46);
		}
		_tmp = w;
		_tmp$1 = v;
		nw = _tmp;
		nv = _tmp$1;
		return [nw, nv];
	};
	fmtInt = function(buf, v) {
		var buf, v, w;
		w = buf.$length;
		if ((v.$high === 0 && v.$low === 0)) {
			w = w - (1) >> 0;
			((w < 0 || w >= buf.$length) ? ($throwRuntimeError("index out of range"), undefined) : buf.$array[buf.$offset + w] = 48);
		} else {
			while (true) {
				if (!((v.$high > 0 || (v.$high === 0 && v.$low > 0)))) { break; }
				w = w - (1) >> 0;
				((w < 0 || w >= buf.$length) ? ($throwRuntimeError("index out of range"), undefined) : buf.$array[buf.$offset + w] = ((($div64(v, new $Uint64(0, 10), true).$low << 24 >>> 24)) + 48 << 24 >>> 24));
				v = $div64(v, (new $Uint64(0, 10)), false);
			}
		}
		return w;
	};
	Duration.prototype.Nanoseconds = function() {
		var d;
		d = this;
		return (new $Int64(d.$high, d.$low));
	};
	$ptrType(Duration).prototype.Nanoseconds = function() { return this.$get().Nanoseconds(); };
	Duration.prototype.Seconds = function() {
		var d, nsec, sec;
		d = this;
		sec = $div64(d, new Duration(0, 1000000000), false);
		nsec = $div64(d, new Duration(0, 1000000000), true);
		return ($flatten64(sec)) + ($flatten64(nsec)) / 1e+09;
	};
	$ptrType(Duration).prototype.Seconds = function() { return this.$get().Seconds(); };
	Duration.prototype.Minutes = function() {
		var d, min, nsec;
		d = this;
		min = $div64(d, new Duration(13, 4165425152), false);
		nsec = $div64(d, new Duration(13, 4165425152), true);
		return ($flatten64(min)) + ($flatten64(nsec)) / 6e+10;
	};
	$ptrType(Duration).prototype.Minutes = function() { return this.$get().Minutes(); };
	Duration.prototype.Hours = function() {
		var d, hour, nsec;
		d = this;
		hour = $div64(d, new Duration(838, 817405952), false);
		nsec = $div64(d, new Duration(838, 817405952), true);
		return ($flatten64(hour)) + ($flatten64(nsec)) / 3.6e+12;
	};
	$ptrType(Duration).prototype.Hours = function() { return this.$get().Hours(); };
	Duration.prototype.Truncate = function(m) {
		var d, m, x;
		d = this;
		if ((m.$high < 0 || (m.$high === 0 && m.$low <= 0))) {
			return d;
		}
		return (x = $div64(d, m, true), new Duration(d.$high - x.$high, d.$low - x.$low));
	};
	$ptrType(Duration).prototype.Truncate = function(m) { return this.$get().Truncate(m); };
	lessThanHalf = function(x, y) {
		var x, x$1, x$2, x$3, x$4, y;
		return (x$1 = (x$2 = (new $Uint64(x.$high, x.$low)), x$3 = (new $Uint64(x.$high, x.$low)), new $Uint64(x$2.$high + x$3.$high, x$2.$low + x$3.$low)), x$4 = (new $Uint64(y.$high, y.$low)), (x$1.$high < x$4.$high || (x$1.$high === x$4.$high && x$1.$low < x$4.$low)));
	};
	Duration.prototype.Round = function(m) {
		var d, d1, d1$1, m, r, x, x$1;
		d = this;
		if ((m.$high < 0 || (m.$high === 0 && m.$low <= 0))) {
			return d;
		}
		r = $div64(d, m, true);
		if ((d.$high < 0 || (d.$high === 0 && d.$low < 0))) {
			r = new Duration(-r.$high, -r.$low);
			if (lessThanHalf(r, m)) {
				return new Duration(d.$high + r.$high, d.$low + r.$low);
			}
			d1 = (x = new Duration(d.$high - m.$high, d.$low - m.$low), new Duration(x.$high + r.$high, x.$low + r.$low));
			if ((d1.$high < d.$high || (d1.$high === d.$high && d1.$low < d.$low))) {
				return d1;
			}
			return new Duration(-2147483648, 0);
		}
		if (lessThanHalf(r, m)) {
			return new Duration(d.$high - r.$high, d.$low - r.$low);
		}
		d1$1 = (x$1 = new Duration(d.$high + m.$high, d.$low + m.$low), new Duration(x$1.$high - r.$high, x$1.$low - r.$low));
		if ((d1$1.$high > d.$high || (d1$1.$high === d.$high && d1$1.$low > d.$low))) {
			return d1$1;
		}
		return new Duration(2147483647, 4294967295);
	};
	$ptrType(Duration).prototype.Round = function(m) { return this.$get().Round(m); };
	Time.ptr.prototype.Add = function(d) {
		var d, dsec, nsec, t, te, x, x$1, x$10, x$11, x$12, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9;
		t = this;
		dsec = ((x = $div64(d, new Duration(0, 1000000000), false), new $Int64(x.$high, x.$low)));
		nsec = t.nsec() + (((x$1 = $div64(d, new Duration(0, 1000000000), true), x$1.$low + ((x$1.$high >> 31) * 4294967296)) >> 0)) >> 0;
		if (nsec >= 1000000000) {
			dsec = (x$2 = new $Int64(0, 1), new $Int64(dsec.$high + x$2.$high, dsec.$low + x$2.$low));
			nsec = nsec - (1000000000) >> 0;
		} else if (nsec < 0) {
			dsec = (x$3 = new $Int64(0, 1), new $Int64(dsec.$high - x$3.$high, dsec.$low - x$3.$low));
			nsec = nsec + (1000000000) >> 0;
		}
		t.wall = (x$4 = (x$5 = t.wall, new $Uint64(x$5.$high & ~0, (x$5.$low & ~1073741823) >>> 0)), x$6 = (new $Uint64(0, nsec)), new $Uint64(x$4.$high | x$6.$high, (x$4.$low | x$6.$low) >>> 0));
		t.addSec(dsec);
		if (!((x$7 = (x$8 = t.wall, new $Uint64(x$8.$high & 2147483648, (x$8.$low & 0) >>> 0)), (x$7.$high === 0 && x$7.$low === 0)))) {
			te = (x$9 = t.ext, x$10 = (new $Int64(d.$high, d.$low)), new $Int64(x$9.$high + x$10.$high, x$9.$low + x$10.$low));
			if ((d.$high < 0 || (d.$high === 0 && d.$low < 0)) && (x$11 = t.ext, (te.$high > x$11.$high || (te.$high === x$11.$high && te.$low > x$11.$low))) || (d.$high > 0 || (d.$high === 0 && d.$low > 0)) && (x$12 = t.ext, (te.$high < x$12.$high || (te.$high === x$12.$high && te.$low < x$12.$low)))) {
				t.stripMono();
			} else {
				t.ext = te;
			}
		}
		return t;
	};
	Time.prototype.Add = function(d) { return this.$val.Add(d); };
	Time.ptr.prototype.Sub = function(u) {
		var d, d$1, t, te, u, ue, x, x$1, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9;
		t = this;
		if (!((x = (x$1 = (x$2 = t.wall, x$3 = u.wall, new $Uint64(x$2.$high & x$3.$high, (x$2.$low & x$3.$low) >>> 0)), new $Uint64(x$1.$high & 2147483648, (x$1.$low & 0) >>> 0)), (x.$high === 0 && x.$low === 0)))) {
			te = t.ext;
			ue = u.ext;
			d = ((x$4 = new $Int64(te.$high - ue.$high, te.$low - ue.$low), new Duration(x$4.$high, x$4.$low)));
			if ((d.$high < 0 || (d.$high === 0 && d.$low < 0)) && (te.$high > ue.$high || (te.$high === ue.$high && te.$low > ue.$low))) {
				return new Duration(2147483647, 4294967295);
			}
			if ((d.$high > 0 || (d.$high === 0 && d.$low > 0)) && (te.$high < ue.$high || (te.$high === ue.$high && te.$low < ue.$low))) {
				return new Duration(-2147483648, 0);
			}
			return d;
		}
		d$1 = (x$5 = $mul64(((x$6 = (x$7 = t.sec(), x$8 = u.sec(), new $Int64(x$7.$high - x$8.$high, x$7.$low - x$8.$low)), new Duration(x$6.$high, x$6.$low))), new Duration(0, 1000000000)), x$9 = (new Duration(0, (t.nsec() - u.nsec() >> 0))), new Duration(x$5.$high + x$9.$high, x$5.$low + x$9.$low));
		if ($clone($clone(u, Time).Add(d$1), Time).Equal($clone(t, Time))) {
			return d$1;
		} else if ($clone(t, Time).Before($clone(u, Time))) {
			return new Duration(-2147483648, 0);
		} else {
			return new Duration(2147483647, 4294967295);
		}
	};
	Time.prototype.Sub = function(u) { return this.$val.Sub(u); };
	Time.ptr.prototype.AddDate = function(years, months$1, days$1) {
		var _r, _r$1, _r$2, _tuple, _tuple$1, day, days$1, hour, min, month, months$1, sec, t, year, years, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; _tuple = $f._tuple; _tuple$1 = $f._tuple$1; day = $f.day; days$1 = $f.days$1; hour = $f.hour; min = $f.min; month = $f.month; months$1 = $f.months$1; sec = $f.sec; t = $f.t; year = $f.year; years = $f.years; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
		_r = $clone(t, Time).Date(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_tuple = _r;
		year = _tuple[0];
		month = _tuple[1];
		day = _tuple[2];
		_r$1 = $clone(t, Time).Clock(); /* */ $s = 2; case 2: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		_tuple$1 = _r$1;
		hour = _tuple$1[0];
		min = _tuple$1[1];
		sec = _tuple$1[2];
		_r$2 = Date(year + years >> 0, month + ((months$1 >> 0)) >> 0, day + days$1 >> 0, hour, min, sec, ((t.nsec() >> 0)), $clone(t, Time).Location()); /* */ $s = 3; case 3: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
		$s = -1; return _r$2;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.AddDate }; } $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f._tuple = _tuple; $f._tuple$1 = _tuple$1; $f.day = day; $f.days$1 = days$1; $f.hour = hour; $f.min = min; $f.month = month; $f.months$1 = months$1; $f.sec = sec; $f.t = t; $f.year = year; $f.years = years; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.AddDate = function(years, months$1, days$1) { return this.$val.AddDate(years, months$1, days$1); };
	Time.ptr.prototype.date = function(full) {
		var _r, _r$1, _tuple, day, full, month, t, yday, year, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; _tuple = $f._tuple; day = $f.day; full = $f.full; month = $f.month; t = $f.t; yday = $f.yday; year = $f.year; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		year = 0;
		month = 0;
		day = 0;
		yday = 0;
		t = this;
		_r = $clone(t, Time).abs(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_r$1 = absDate(_r, full); /* */ $s = 2; case 2: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		_tuple = _r$1;
		year = _tuple[0];
		month = _tuple[1];
		day = _tuple[2];
		yday = _tuple[3];
		$s = -1; return [year, month, day, yday];
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.date }; } $f._r = _r; $f._r$1 = _r$1; $f._tuple = _tuple; $f.day = day; $f.full = full; $f.month = month; $f.t = t; $f.yday = yday; $f.year = year; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.date = function(full) { return this.$val.date(full); };
	absDate = function(abs, full) {
		var _q, abs, begin, d, day, end, full, month, n, x, x$1, x$10, x$11, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9, y, yday, year;
		year = 0;
		month = 0;
		day = 0;
		yday = 0;
		d = $div64(abs, new $Uint64(0, 86400), false);
		n = $div64(d, new $Uint64(0, 146097), false);
		y = $mul64(new $Uint64(0, 400), n);
		d = (x = $mul64(new $Uint64(0, 146097), n), new $Uint64(d.$high - x.$high, d.$low - x.$low));
		n = $div64(d, new $Uint64(0, 36524), false);
		n = (x$1 = $shiftRightUint64(n, 2), new $Uint64(n.$high - x$1.$high, n.$low - x$1.$low));
		y = (x$2 = $mul64(new $Uint64(0, 100), n), new $Uint64(y.$high + x$2.$high, y.$low + x$2.$low));
		d = (x$3 = $mul64(new $Uint64(0, 36524), n), new $Uint64(d.$high - x$3.$high, d.$low - x$3.$low));
		n = $div64(d, new $Uint64(0, 1461), false);
		y = (x$4 = $mul64(new $Uint64(0, 4), n), new $Uint64(y.$high + x$4.$high, y.$low + x$4.$low));
		d = (x$5 = $mul64(new $Uint64(0, 1461), n), new $Uint64(d.$high - x$5.$high, d.$low - x$5.$low));
		n = $div64(d, new $Uint64(0, 365), false);
		n = (x$6 = $shiftRightUint64(n, 2), new $Uint64(n.$high - x$6.$high, n.$low - x$6.$low));
		y = (x$7 = n, new $Uint64(y.$high + x$7.$high, y.$low + x$7.$low));
		d = (x$8 = $mul64(new $Uint64(0, 365), n), new $Uint64(d.$high - x$8.$high, d.$low - x$8.$low));
		year = (((x$9 = (x$10 = (new $Int64(y.$high, y.$low)), new $Int64(x$10.$high + -69, x$10.$low + 4075721025)), x$9.$low + ((x$9.$high >> 31) * 4294967296)) >> 0));
		yday = ((d.$low >> 0));
		if (!full) {
			return [year, month, day, yday];
		}
		day = yday;
		if (isLeap(year)) {
			if (day > 59) {
				day = day - (1) >> 0;
			} else if ((day === 59)) {
				month = 2;
				day = 29;
				return [year, month, day, yday];
			}
		}
		month = (((_q = day / 31, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")) >> 0));
		end = (((x$11 = month + 1 >> 0, ((x$11 < 0 || x$11 >= daysBefore.length) ? ($throwRuntimeError("index out of range"), undefined) : daysBefore[x$11])) >> 0));
		begin = 0;
		if (day >= end) {
			month = month + (1) >> 0;
			begin = end;
		} else {
			begin = ((((month < 0 || month >= daysBefore.length) ? ($throwRuntimeError("index out of range"), undefined) : daysBefore[month]) >> 0));
		}
		month = month + (1) >> 0;
		day = (day - begin >> 0) + 1 >> 0;
		return [year, month, day, yday];
	};
	daysIn = function(m, year) {
		var m, x, year;
		if ((m === 2) && isLeap(year)) {
			return 29;
		}
		return (((((m < 0 || m >= daysBefore.length) ? ($throwRuntimeError("index out of range"), undefined) : daysBefore[m]) - (x = m - 1 >> 0, ((x < 0 || x >= daysBefore.length) ? ($throwRuntimeError("index out of range"), undefined) : daysBefore[x])) >> 0) >> 0));
	};
	Now = function() {
		var _tuple, mono, nsec, sec, x, x$1, x$2, x$3, x$4;
		_tuple = now();
		sec = _tuple[0];
		nsec = _tuple[1];
		mono = _tuple[2];
		sec = (x = new $Int64(0, 2682288000), new $Int64(sec.$high + x.$high, sec.$low + x.$low));
		if (!((x$1 = $shiftRightUint64((new $Uint64(sec.$high, sec.$low)), 33), (x$1.$high === 0 && x$1.$low === 0)))) {
			return new Time.ptr((new $Uint64(0, nsec)), new $Int64(sec.$high + 13, sec.$low + 3618733952), $pkg.Local);
		}
		return new Time.ptr((x$2 = (x$3 = $shiftLeft64((new $Uint64(sec.$high, sec.$low)), 30), new $Uint64(2147483648 | x$3.$high, (0 | x$3.$low) >>> 0)), x$4 = (new $Uint64(0, nsec)), new $Uint64(x$2.$high | x$4.$high, (x$2.$low | x$4.$low) >>> 0)), mono, $pkg.Local);
	};
	$pkg.Now = Now;
	unixTime = function(sec, nsec) {
		var nsec, sec;
		return new Time.ptr((new $Uint64(0, nsec)), new $Int64(sec.$high + 14, sec.$low + 2006054656), $pkg.Local);
	};
	Time.ptr.prototype.UTC = function() {
		var t;
		t = this;
		t.setLoc(utcLoc);
		return t;
	};
	Time.prototype.UTC = function() { return this.$val.UTC(); };
	Time.ptr.prototype.Local = function() {
		var t;
		t = this;
		t.setLoc($pkg.Local);
		return t;
	};
	Time.prototype.Local = function() { return this.$val.Local(); };
	Time.ptr.prototype.In = function(loc) {
		var loc, t;
		t = this;
		if (loc === ptrType$2.nil) {
			$panic(new $String("time: missing Location in call to Time.In"));
		}
		t.setLoc(loc);
		return t;
	};
	Time.prototype.In = function(loc) { return this.$val.In(loc); };
	Time.ptr.prototype.Location = function() {
		var l, t;
		t = this;
		l = t.loc;
		if (l === ptrType$2.nil) {
			l = $pkg.UTC;
		}
		return l;
	};
	Time.prototype.Location = function() { return this.$val.Location(); };
	Time.ptr.prototype.Zone = function() {
		var _r, _tuple, name, offset, t, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _tuple = $f._tuple; name = $f.name; offset = $f.offset; t = $f.t; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		name = "";
		offset = 0;
		t = this;
		_r = t.loc.lookup(t.unixSec()); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_tuple = _r;
		name = _tuple[0];
		offset = _tuple[1];
		$s = -1; return [name, offset];
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.Zone }; } $f._r = _r; $f._tuple = _tuple; $f.name = name; $f.offset = offset; $f.t = t; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.Zone = function() { return this.$val.Zone(); };
	Time.ptr.prototype.Unix = function() {
		var t;
		t = this;
		return t.unixSec();
	};
	Time.prototype.Unix = function() { return this.$val.Unix(); };
	Time.ptr.prototype.UnixNano = function() {
		var t, x, x$1;
		t = this;
		return (x = $mul64((t.unixSec()), new $Int64(0, 1000000000)), x$1 = (new $Int64(0, t.nsec())), new $Int64(x.$high + x$1.$high, x.$low + x$1.$low));
	};
	Time.prototype.UnixNano = function() { return this.$val.UnixNano(); };
	Time.ptr.prototype.MarshalBinary = function() {
		var _q, _r, _r$1, _tuple, enc, nsec, offset, offsetMin, sec, t, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _q = $f._q; _r = $f._r; _r$1 = $f._r$1; _tuple = $f._tuple; enc = $f.enc; nsec = $f.nsec; offset = $f.offset; offsetMin = $f.offsetMin; sec = $f.sec; t = $f.t; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
		offsetMin = 0;
		/* */ if ($clone(t, Time).Location() === $pkg.UTC) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if ($clone(t, Time).Location() === $pkg.UTC) { */ case 1:
			offsetMin = -1;
			$s = 3; continue;
		/* } else { */ case 2:
			_r = $clone(t, Time).Zone(); /* */ $s = 4; case 4: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			_tuple = _r;
			offset = _tuple[1];
			if (!(((_r$1 = offset % 60, _r$1 === _r$1 ? _r$1 : $throwRuntimeError("integer divide by zero")) === 0))) {
				$s = -1; return [sliceType$3.nil, errors.New("Time.MarshalBinary: zone offset has fractional minute")];
			}
			offset = (_q = offset / (60), (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
			if (offset < -32768 || (offset === -1) || offset > 32767) {
				$s = -1; return [sliceType$3.nil, errors.New("Time.MarshalBinary: unexpected zone offset")];
			}
			offsetMin = ((offset << 16 >> 16));
		/* } */ case 3:
		sec = t.sec();
		nsec = t.nsec();
		enc = new sliceType$3([1, (($shiftRightInt64(sec, 56).$low << 24 >>> 24)), (($shiftRightInt64(sec, 48).$low << 24 >>> 24)), (($shiftRightInt64(sec, 40).$low << 24 >>> 24)), (($shiftRightInt64(sec, 32).$low << 24 >>> 24)), (($shiftRightInt64(sec, 24).$low << 24 >>> 24)), (($shiftRightInt64(sec, 16).$low << 24 >>> 24)), (($shiftRightInt64(sec, 8).$low << 24 >>> 24)), ((sec.$low << 24 >>> 24)), (((nsec >> 24 >> 0) << 24 >>> 24)), (((nsec >> 16 >> 0) << 24 >>> 24)), (((nsec >> 8 >> 0) << 24 >>> 24)), ((nsec << 24 >>> 24)), (((offsetMin >> 8 << 16 >> 16) << 24 >>> 24)), ((offsetMin << 24 >>> 24))]);
		$s = -1; return [enc, $ifaceNil];
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.MarshalBinary }; } $f._q = _q; $f._r = _r; $f._r$1 = _r$1; $f._tuple = _tuple; $f.enc = enc; $f.nsec = nsec; $f.offset = offset; $f.offsetMin = offsetMin; $f.sec = sec; $f.t = t; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.MarshalBinary = function() { return this.$val.MarshalBinary(); };
	Time.ptr.prototype.UnmarshalBinary = function(data) {
		var _r, _tuple, buf, data, localoff, nsec, offset, sec, t, x, x$1, x$10, x$11, x$12, x$13, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _tuple = $f._tuple; buf = $f.buf; data = $f.data; localoff = $f.localoff; nsec = $f.nsec; offset = $f.offset; sec = $f.sec; t = $f.t; x = $f.x; x$1 = $f.x$1; x$10 = $f.x$10; x$11 = $f.x$11; x$12 = $f.x$12; x$13 = $f.x$13; x$2 = $f.x$2; x$3 = $f.x$3; x$4 = $f.x$4; x$5 = $f.x$5; x$6 = $f.x$6; x$7 = $f.x$7; x$8 = $f.x$8; x$9 = $f.x$9; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
		buf = data;
		if (buf.$length === 0) {
			$s = -1; return errors.New("Time.UnmarshalBinary: no data");
		}
		if (!(((0 >= buf.$length ? ($throwRuntimeError("index out of range"), undefined) : buf.$array[buf.$offset + 0]) === 1))) {
			$s = -1; return errors.New("Time.UnmarshalBinary: unsupported version");
		}
		if (!((buf.$length === 15))) {
			$s = -1; return errors.New("Time.UnmarshalBinary: invalid length");
		}
		buf = $subslice(buf, 1);
		sec = (x = (x$1 = (x$2 = (x$3 = (x$4 = (x$5 = (x$6 = (new $Int64(0, (7 >= buf.$length ? ($throwRuntimeError("index out of range"), undefined) : buf.$array[buf.$offset + 7]))), x$7 = $shiftLeft64((new $Int64(0, (6 >= buf.$length ? ($throwRuntimeError("index out of range"), undefined) : buf.$array[buf.$offset + 6]))), 8), new $Int64(x$6.$high | x$7.$high, (x$6.$low | x$7.$low) >>> 0)), x$8 = $shiftLeft64((new $Int64(0, (5 >= buf.$length ? ($throwRuntimeError("index out of range"), undefined) : buf.$array[buf.$offset + 5]))), 16), new $Int64(x$5.$high | x$8.$high, (x$5.$low | x$8.$low) >>> 0)), x$9 = $shiftLeft64((new $Int64(0, (4 >= buf.$length ? ($throwRuntimeError("index out of range"), undefined) : buf.$array[buf.$offset + 4]))), 24), new $Int64(x$4.$high | x$9.$high, (x$4.$low | x$9.$low) >>> 0)), x$10 = $shiftLeft64((new $Int64(0, (3 >= buf.$length ? ($throwRuntimeError("index out of range"), undefined) : buf.$array[buf.$offset + 3]))), 32), new $Int64(x$3.$high | x$10.$high, (x$3.$low | x$10.$low) >>> 0)), x$11 = $shiftLeft64((new $Int64(0, (2 >= buf.$length ? ($throwRuntimeError("index out of range"), undefined) : buf.$array[buf.$offset + 2]))), 40), new $Int64(x$2.$high | x$11.$high, (x$2.$low | x$11.$low) >>> 0)), x$12 = $shiftLeft64((new $Int64(0, (1 >= buf.$length ? ($throwRuntimeError("index out of range"), undefined) : buf.$array[buf.$offset + 1]))), 48), new $Int64(x$1.$high | x$12.$high, (x$1.$low | x$12.$low) >>> 0)), x$13 = $shiftLeft64((new $Int64(0, (0 >= buf.$length ? ($throwRuntimeError("index out of range"), undefined) : buf.$array[buf.$offset + 0]))), 56), new $Int64(x.$high | x$13.$high, (x.$low | x$13.$low) >>> 0));
		buf = $subslice(buf, 8);
		nsec = (((((3 >= buf.$length ? ($throwRuntimeError("index out of range"), undefined) : buf.$array[buf.$offset + 3]) >> 0)) | ((((2 >= buf.$length ? ($throwRuntimeError("index out of range"), undefined) : buf.$array[buf.$offset + 2]) >> 0)) << 8 >> 0)) | ((((1 >= buf.$length ? ($throwRuntimeError("index out of range"), undefined) : buf.$array[buf.$offset + 1]) >> 0)) << 16 >> 0)) | ((((0 >= buf.$length ? ($throwRuntimeError("index out of range"), undefined) : buf.$array[buf.$offset + 0]) >> 0)) << 24 >> 0);
		buf = $subslice(buf, 4);
		offset = $imul(((((((1 >= buf.$length ? ($throwRuntimeError("index out of range"), undefined) : buf.$array[buf.$offset + 1]) << 16 >> 16)) | ((((0 >= buf.$length ? ($throwRuntimeError("index out of range"), undefined) : buf.$array[buf.$offset + 0]) << 16 >> 16)) << 8 << 16 >> 16)) >> 0)), 60);
		Time.copy(t, new Time.ptr(new $Uint64(0, 0), new $Int64(0, 0), ptrType$2.nil));
		t.wall = (new $Uint64(0, nsec));
		t.ext = sec;
		/* */ if (offset === -60) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (offset === -60) { */ case 1:
			t.setLoc(utcLoc);
			$s = 3; continue;
		/* } else { */ case 2:
			_r = $pkg.Local.lookup(t.unixSec()); /* */ $s = 4; case 4: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			_tuple = _r;
			localoff = _tuple[1];
			if (offset === localoff) {
				t.setLoc($pkg.Local);
			} else {
				t.setLoc(FixedZone("", offset));
			}
		/* } */ case 3:
		$s = -1; return $ifaceNil;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.UnmarshalBinary }; } $f._r = _r; $f._tuple = _tuple; $f.buf = buf; $f.data = data; $f.localoff = localoff; $f.nsec = nsec; $f.offset = offset; $f.sec = sec; $f.t = t; $f.x = x; $f.x$1 = x$1; $f.x$10 = x$10; $f.x$11 = x$11; $f.x$12 = x$12; $f.x$13 = x$13; $f.x$2 = x$2; $f.x$3 = x$3; $f.x$4 = x$4; $f.x$5 = x$5; $f.x$6 = x$6; $f.x$7 = x$7; $f.x$8 = x$8; $f.x$9 = x$9; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.UnmarshalBinary = function(data) { return this.$val.UnmarshalBinary(data); };
	Time.ptr.prototype.GobEncode = function() {
		var _r, t, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; t = $f.t; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
		_r = $clone(t, Time).MarshalBinary(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.GobEncode }; } $f._r = _r; $f.t = t; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.GobEncode = function() { return this.$val.GobEncode(); };
	Time.ptr.prototype.GobDecode = function(data) {
		var _r, data, t, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; data = $f.data; t = $f.t; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
		_r = t.UnmarshalBinary(data); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.GobDecode }; } $f._r = _r; $f.data = data; $f.t = t; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.GobDecode = function(data) { return this.$val.GobDecode(data); };
	Time.ptr.prototype.MarshalJSON = function() {
		var _r, _r$1, b, t, y, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; b = $f.b; t = $f.t; y = $f.y; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
		_r = $clone(t, Time).Year(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		y = _r;
		if (y < 0 || y >= 10000) {
			$s = -1; return [sliceType$3.nil, errors.New("Time.MarshalJSON: year outside of range [0,9999]")];
		}
		b = $makeSlice(sliceType$3, 0, 37);
		b = $append(b, 34);
		_r$1 = $clone(t, Time).AppendFormat(b, "2006-01-02T15:04:05.999999999Z07:00"); /* */ $s = 2; case 2: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		b = _r$1;
		b = $append(b, 34);
		$s = -1; return [b, $ifaceNil];
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.MarshalJSON }; } $f._r = _r; $f._r$1 = _r$1; $f.b = b; $f.t = t; $f.y = y; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.MarshalJSON = function() { return this.$val.MarshalJSON(); };
	Time.ptr.prototype.UnmarshalJSON = function(data) {
		var _r, _tuple, data, err, t, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _tuple = $f._tuple; data = $f.data; err = $f.err; t = $f.t; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
		if (($bytesToString(data)) === "null") {
			$s = -1; return $ifaceNil;
		}
		err = $ifaceNil;
		_r = Parse("\"2006-01-02T15:04:05Z07:00\"", ($bytesToString(data))); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_tuple = _r;
		Time.copy(t, _tuple[0]);
		err = _tuple[1];
		$s = -1; return err;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.UnmarshalJSON }; } $f._r = _r; $f._tuple = _tuple; $f.data = data; $f.err = err; $f.t = t; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.UnmarshalJSON = function(data) { return this.$val.UnmarshalJSON(data); };
	Time.ptr.prototype.MarshalText = function() {
		var _r, _r$1, b, t, y, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; b = $f.b; t = $f.t; y = $f.y; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
		_r = $clone(t, Time).Year(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		y = _r;
		if (y < 0 || y >= 10000) {
			$s = -1; return [sliceType$3.nil, errors.New("Time.MarshalText: year outside of range [0,9999]")];
		}
		b = $makeSlice(sliceType$3, 0, 35);
		_r$1 = $clone(t, Time).AppendFormat(b, "2006-01-02T15:04:05.999999999Z07:00"); /* */ $s = 2; case 2: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		$s = -1; return [_r$1, $ifaceNil];
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.MarshalText }; } $f._r = _r; $f._r$1 = _r$1; $f.b = b; $f.t = t; $f.y = y; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.MarshalText = function() { return this.$val.MarshalText(); };
	Time.ptr.prototype.UnmarshalText = function(data) {
		var _r, _tuple, data, err, t, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _tuple = $f._tuple; data = $f.data; err = $f.err; t = $f.t; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
		err = $ifaceNil;
		_r = Parse("2006-01-02T15:04:05Z07:00", ($bytesToString(data))); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_tuple = _r;
		Time.copy(t, _tuple[0]);
		err = _tuple[1];
		$s = -1; return err;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Time.ptr.prototype.UnmarshalText }; } $f._r = _r; $f._tuple = _tuple; $f.data = data; $f.err = err; $f.t = t; $f.$s = $s; $f.$r = $r; return $f;
	};
	Time.prototype.UnmarshalText = function(data) { return this.$val.UnmarshalText(data); };
	Unix = function(sec, nsec) {
		var n, nsec, sec, x, x$1, x$2, x$3;
		if ((nsec.$high < 0 || (nsec.$high === 0 && nsec.$low < 0)) || (nsec.$high > 0 || (nsec.$high === 0 && nsec.$low >= 1000000000))) {
			n = $div64(nsec, new $Int64(0, 1000000000), false);
			sec = (x = n, new $Int64(sec.$high + x.$high, sec.$low + x.$low));
			nsec = (x$1 = $mul64(n, new $Int64(0, 1000000000)), new $Int64(nsec.$high - x$1.$high, nsec.$low - x$1.$low));
			if ((nsec.$high < 0 || (nsec.$high === 0 && nsec.$low < 0))) {
				nsec = (x$2 = new $Int64(0, 1000000000), new $Int64(nsec.$high + x$2.$high, nsec.$low + x$2.$low));
				sec = (x$3 = new $Int64(0, 1), new $Int64(sec.$high - x$3.$high, sec.$low - x$3.$low));
			}
		}
		return unixTime(sec, (((nsec.$low + ((nsec.$high >> 31) * 4294967296)) >> 0)));
	};
	$pkg.Unix = Unix;
	isLeap = function(year) {
		var _r, _r$1, _r$2, year;
		return ((_r = year % 4, _r === _r ? _r : $throwRuntimeError("integer divide by zero")) === 0) && (!(((_r$1 = year % 100, _r$1 === _r$1 ? _r$1 : $throwRuntimeError("integer divide by zero")) === 0)) || ((_r$2 = year % 400, _r$2 === _r$2 ? _r$2 : $throwRuntimeError("integer divide by zero")) === 0));
	};
	norm = function(hi, lo, base) {
		var _q, _q$1, _tmp, _tmp$1, base, hi, lo, n, n$1, nhi, nlo;
		nhi = 0;
		nlo = 0;
		if (lo < 0) {
			n = (_q = ((-lo - 1 >> 0)) / base, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")) + 1 >> 0;
			hi = hi - (n) >> 0;
			lo = lo + (($imul(n, base))) >> 0;
		}
		if (lo >= base) {
			n$1 = (_q$1 = lo / base, (_q$1 === _q$1 && _q$1 !== 1/0 && _q$1 !== -1/0) ? _q$1 >> 0 : $throwRuntimeError("integer divide by zero"));
			hi = hi + (n$1) >> 0;
			lo = lo - (($imul(n$1, base))) >> 0;
		}
		_tmp = hi;
		_tmp$1 = lo;
		nhi = _tmp;
		nlo = _tmp$1;
		return [nhi, nlo];
	};
	Date = function(year, month, day, hour, min, sec, nsec, loc) {
		var _r, _r$1, _r$2, _tuple, _tuple$1, _tuple$2, _tuple$3, _tuple$4, _tuple$5, _tuple$6, _tuple$7, abs, d, day, end, hour, loc, m, min, month, n, nsec, offset, sec, start, t, unix, utc, x, x$1, x$10, x$11, x$12, x$13, x$14, x$15, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9, y, year, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; _tuple = $f._tuple; _tuple$1 = $f._tuple$1; _tuple$2 = $f._tuple$2; _tuple$3 = $f._tuple$3; _tuple$4 = $f._tuple$4; _tuple$5 = $f._tuple$5; _tuple$6 = $f._tuple$6; _tuple$7 = $f._tuple$7; abs = $f.abs; d = $f.d; day = $f.day; end = $f.end; hour = $f.hour; loc = $f.loc; m = $f.m; min = $f.min; month = $f.month; n = $f.n; nsec = $f.nsec; offset = $f.offset; sec = $f.sec; start = $f.start; t = $f.t; unix = $f.unix; utc = $f.utc; x = $f.x; x$1 = $f.x$1; x$10 = $f.x$10; x$11 = $f.x$11; x$12 = $f.x$12; x$13 = $f.x$13; x$14 = $f.x$14; x$15 = $f.x$15; x$2 = $f.x$2; x$3 = $f.x$3; x$4 = $f.x$4; x$5 = $f.x$5; x$6 = $f.x$6; x$7 = $f.x$7; x$8 = $f.x$8; x$9 = $f.x$9; y = $f.y; year = $f.year; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		if (loc === ptrType$2.nil) {
			$panic(new $String("time: missing Location in call to Date"));
		}
		m = ((month >> 0)) - 1 >> 0;
		_tuple = norm(year, m, 12);
		year = _tuple[0];
		m = _tuple[1];
		month = ((m >> 0)) + 1 >> 0;
		_tuple$1 = norm(sec, nsec, 1000000000);
		sec = _tuple$1[0];
		nsec = _tuple$1[1];
		_tuple$2 = norm(min, sec, 60);
		min = _tuple$2[0];
		sec = _tuple$2[1];
		_tuple$3 = norm(hour, min, 60);
		hour = _tuple$3[0];
		min = _tuple$3[1];
		_tuple$4 = norm(day, hour, 24);
		day = _tuple$4[0];
		hour = _tuple$4[1];
		y = ((x = (x$1 = (new $Int64(0, year)), new $Int64(x$1.$high - -69, x$1.$low - 4075721025)), new $Uint64(x.$high, x.$low)));
		n = $div64(y, new $Uint64(0, 400), false);
		y = (x$2 = $mul64(new $Uint64(0, 400), n), new $Uint64(y.$high - x$2.$high, y.$low - x$2.$low));
		d = $mul64(new $Uint64(0, 146097), n);
		n = $div64(y, new $Uint64(0, 100), false);
		y = (x$3 = $mul64(new $Uint64(0, 100), n), new $Uint64(y.$high - x$3.$high, y.$low - x$3.$low));
		d = (x$4 = $mul64(new $Uint64(0, 36524), n), new $Uint64(d.$high + x$4.$high, d.$low + x$4.$low));
		n = $div64(y, new $Uint64(0, 4), false);
		y = (x$5 = $mul64(new $Uint64(0, 4), n), new $Uint64(y.$high - x$5.$high, y.$low - x$5.$low));
		d = (x$6 = $mul64(new $Uint64(0, 1461), n), new $Uint64(d.$high + x$6.$high, d.$low + x$6.$low));
		n = y;
		d = (x$7 = $mul64(new $Uint64(0, 365), n), new $Uint64(d.$high + x$7.$high, d.$low + x$7.$low));
		d = (x$8 = (new $Uint64(0, (x$9 = month - 1 >> 0, ((x$9 < 0 || x$9 >= daysBefore.length) ? ($throwRuntimeError("index out of range"), undefined) : daysBefore[x$9])))), new $Uint64(d.$high + x$8.$high, d.$low + x$8.$low));
		if (isLeap(year) && month >= 3) {
			d = (x$10 = new $Uint64(0, 1), new $Uint64(d.$high + x$10.$high, d.$low + x$10.$low));
		}
		d = (x$11 = (new $Uint64(0, (day - 1 >> 0))), new $Uint64(d.$high + x$11.$high, d.$low + x$11.$low));
		abs = $mul64(d, new $Uint64(0, 86400));
		abs = (x$12 = (new $Uint64(0, ((($imul(hour, 3600)) + ($imul(min, 60)) >> 0) + sec >> 0))), new $Uint64(abs.$high + x$12.$high, abs.$low + x$12.$low));
		unix = (x$13 = (new $Int64(abs.$high, abs.$low)), new $Int64(x$13.$high + -2147483647, x$13.$low + 3844486912));
		_r = loc.lookup(unix); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_tuple$5 = _r;
		offset = _tuple$5[1];
		start = _tuple$5[2];
		end = _tuple$5[3];
		/* */ if (!((offset === 0))) { $s = 2; continue; }
		/* */ $s = 3; continue;
		/* if (!((offset === 0))) { */ case 2:
				utc = (x$14 = (new $Int64(0, offset)), new $Int64(unix.$high - x$14.$high, unix.$low - x$14.$low));
				/* */ if ((utc.$high < start.$high || (utc.$high === start.$high && utc.$low < start.$low))) { $s = 5; continue; }
				/* */ if ((utc.$high > end.$high || (utc.$high === end.$high && utc.$low >= end.$low))) { $s = 6; continue; }
				/* */ $s = 7; continue;
				/* if ((utc.$high < start.$high || (utc.$high === start.$high && utc.$low < start.$low))) { */ case 5:
					_r$1 = loc.lookup(new $Int64(start.$high - 0, start.$low - 1)); /* */ $s = 8; case 8: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
					_tuple$6 = _r$1;
					offset = _tuple$6[1];
					$s = 7; continue;
				/* } else if ((utc.$high > end.$high || (utc.$high === end.$high && utc.$low >= end.$low))) { */ case 6:
					_r$2 = loc.lookup(end); /* */ $s = 9; case 9: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
					_tuple$7 = _r$2;
					offset = _tuple$7[1];
				/* } */ case 7:
			case 4:
			unix = (x$15 = (new $Int64(0, offset)), new $Int64(unix.$high - x$15.$high, unix.$low - x$15.$low));
		/* } */ case 3:
		t = $clone(unixTime(unix, ((nsec >> 0))), Time);
		t.setLoc(loc);
		$s = -1; return t;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Date }; } $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f._tuple = _tuple; $f._tuple$1 = _tuple$1; $f._tuple$2 = _tuple$2; $f._tuple$3 = _tuple$3; $f._tuple$4 = _tuple$4; $f._tuple$5 = _tuple$5; $f._tuple$6 = _tuple$6; $f._tuple$7 = _tuple$7; $f.abs = abs; $f.d = d; $f.day = day; $f.end = end; $f.hour = hour; $f.loc = loc; $f.m = m; $f.min = min; $f.month = month; $f.n = n; $f.nsec = nsec; $f.offset = offset; $f.sec = sec; $f.start = start; $f.t = t; $f.unix = unix; $f.utc = utc; $f.x = x; $f.x$1 = x$1; $f.x$10 = x$10; $f.x$11 = x$11; $f.x$12 = x$12; $f.x$13 = x$13; $f.x$14 = x$14; $f.x$15 = x$15; $f.x$2 = x$2; $f.x$3 = x$3; $f.x$4 = x$4; $f.x$5 = x$5; $f.x$6 = x$6; $f.x$7 = x$7; $f.x$8 = x$8; $f.x$9 = x$9; $f.y = y; $f.year = year; $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.Date = Date;
	Time.ptr.prototype.Truncate = function(d) {
		var _tuple, d, r, t;
		t = this;
		t.stripMono();
		if ((d.$high < 0 || (d.$high === 0 && d.$low <= 0))) {
			return t;
		}
		_tuple = div($clone(t, Time), d);
		r = _tuple[1];
		return $clone(t, Time).Add(new Duration(-r.$high, -r.$low));
	};
	Time.prototype.Truncate = function(d) { return this.$val.Truncate(d); };
	Time.ptr.prototype.Round = function(d) {
		var _tuple, d, r, t;
		t = this;
		t.stripMono();
		if ((d.$high < 0 || (d.$high === 0 && d.$low <= 0))) {
			return t;
		}
		_tuple = div($clone(t, Time), d);
		r = _tuple[1];
		if (lessThanHalf(r, d)) {
			return $clone(t, Time).Add(new Duration(-r.$high, -r.$low));
		}
		return $clone(t, Time).Add(new Duration(d.$high - r.$high, d.$low - r.$low));
	};
	Time.prototype.Round = function(d) { return this.$val.Round(d); };
	div = function(t, d) {
		var _q, _r, _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, d, d0, d1, d1$1, neg, nsec, qmod2, r, sec, sec$1, t, tmp, u0, u0x, u1, x, x$1, x$10, x$11, x$12, x$13, x$14, x$15, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9;
		qmod2 = 0;
		r = new Duration(0, 0);
		neg = false;
		nsec = t.nsec();
		sec = t.sec();
		if ((sec.$high < 0 || (sec.$high === 0 && sec.$low < 0))) {
			neg = true;
			sec = new $Int64(-sec.$high, -sec.$low);
			nsec = -nsec;
			if (nsec < 0) {
				nsec = nsec + (1000000000) >> 0;
				sec = (x = new $Int64(0, 1), new $Int64(sec.$high - x.$high, sec.$low - x.$low));
			}
		}
		if ((d.$high < 0 || (d.$high === 0 && d.$low < 1000000000)) && (x$1 = $div64(new Duration(0, 1000000000), (new Duration(d.$high + d.$high, d.$low + d.$low)), true), (x$1.$high === 0 && x$1.$low === 0))) {
			qmod2 = (((_q = nsec / (((d.$low + ((d.$high >> 31) * 4294967296)) >> 0)), (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")) >> 0)) & 1;
			r = (new Duration(0, (_r = nsec % (((d.$low + ((d.$high >> 31) * 4294967296)) >> 0)), _r === _r ? _r : $throwRuntimeError("integer divide by zero"))));
		} else if ((x$2 = $div64(d, new Duration(0, 1000000000), true), (x$2.$high === 0 && x$2.$low === 0))) {
			d1 = ((x$3 = $div64(d, new Duration(0, 1000000000), false), new $Int64(x$3.$high, x$3.$low)));
			qmod2 = (((x$4 = $div64(sec, d1, false), x$4.$low + ((x$4.$high >> 31) * 4294967296)) >> 0)) & 1;
			r = (x$5 = $mul64(((x$6 = $div64(sec, d1, true), new Duration(x$6.$high, x$6.$low))), new Duration(0, 1000000000)), x$7 = (new Duration(0, nsec)), new Duration(x$5.$high + x$7.$high, x$5.$low + x$7.$low));
		} else {
			sec$1 = (new $Uint64(sec.$high, sec.$low));
			tmp = $mul64(($shiftRightUint64(sec$1, 32)), new $Uint64(0, 1000000000));
			u1 = $shiftRightUint64(tmp, 32);
			u0 = $shiftLeft64(tmp, 32);
			tmp = $mul64((new $Uint64(sec$1.$high & 0, (sec$1.$low & 4294967295) >>> 0)), new $Uint64(0, 1000000000));
			_tmp = u0;
			_tmp$1 = new $Uint64(u0.$high + tmp.$high, u0.$low + tmp.$low);
			u0x = _tmp;
			u0 = _tmp$1;
			if ((u0.$high < u0x.$high || (u0.$high === u0x.$high && u0.$low < u0x.$low))) {
				u1 = (x$8 = new $Uint64(0, 1), new $Uint64(u1.$high + x$8.$high, u1.$low + x$8.$low));
			}
			_tmp$2 = u0;
			_tmp$3 = (x$9 = (new $Uint64(0, nsec)), new $Uint64(u0.$high + x$9.$high, u0.$low + x$9.$low));
			u0x = _tmp$2;
			u0 = _tmp$3;
			if ((u0.$high < u0x.$high || (u0.$high === u0x.$high && u0.$low < u0x.$low))) {
				u1 = (x$10 = new $Uint64(0, 1), new $Uint64(u1.$high + x$10.$high, u1.$low + x$10.$low));
			}
			d1$1 = (new $Uint64(d.$high, d.$low));
			while (true) {
				if (!(!((x$11 = $shiftRightUint64(d1$1, 63), (x$11.$high === 0 && x$11.$low === 1))))) { break; }
				d1$1 = $shiftLeft64(d1$1, (1));
			}
			d0 = new $Uint64(0, 0);
			while (true) {
				qmod2 = 0;
				if ((u1.$high > d1$1.$high || (u1.$high === d1$1.$high && u1.$low > d1$1.$low)) || (u1.$high === d1$1.$high && u1.$low === d1$1.$low) && (u0.$high > d0.$high || (u0.$high === d0.$high && u0.$low >= d0.$low))) {
					qmod2 = 1;
					_tmp$4 = u0;
					_tmp$5 = new $Uint64(u0.$high - d0.$high, u0.$low - d0.$low);
					u0x = _tmp$4;
					u0 = _tmp$5;
					if ((u0.$high > u0x.$high || (u0.$high === u0x.$high && u0.$low > u0x.$low))) {
						u1 = (x$12 = new $Uint64(0, 1), new $Uint64(u1.$high - x$12.$high, u1.$low - x$12.$low));
					}
					u1 = (x$13 = d1$1, new $Uint64(u1.$high - x$13.$high, u1.$low - x$13.$low));
				}
				if ((d1$1.$high === 0 && d1$1.$low === 0) && (x$14 = (new $Uint64(d.$high, d.$low)), (d0.$high === x$14.$high && d0.$low === x$14.$low))) {
					break;
				}
				d0 = $shiftRightUint64(d0, (1));
				d0 = (x$15 = $shiftLeft64((new $Uint64(d1$1.$high & 0, (d1$1.$low & 1) >>> 0)), 63), new $Uint64(d0.$high | x$15.$high, (d0.$low | x$15.$low) >>> 0));
				d1$1 = $shiftRightUint64(d1$1, (1));
			}
			r = (new Duration(u0.$high, u0.$low));
		}
		if (neg && !((r.$high === 0 && r.$low === 0))) {
			qmod2 = (qmod2 ^ (1)) >> 0;
			r = new Duration(d.$high - r.$high, d.$low - r.$low);
		}
		return [qmod2, r];
	};
	Location.ptr.prototype.get = function() {
		var l, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; l = $f.l; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		l = this;
		if (l === ptrType$2.nil) {
			$s = -1; return utcLoc;
		}
		/* */ if (l === localLoc) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (l === localLoc) { */ case 1:
			$r = localOnce.Do(initLocal); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* } */ case 2:
		$s = -1; return l;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Location.ptr.prototype.get }; } $f.l = l; $f.$s = $s; $f.$r = $r; return $f;
	};
	Location.prototype.get = function() { return this.$val.get(); };
	Location.ptr.prototype.String = function() {
		var _r, l, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; l = $f.l; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		l = this;
		_r = l.get(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r.name;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Location.ptr.prototype.String }; } $f._r = _r; $f.l = l; $f.$s = $s; $f.$r = $r; return $f;
	};
	Location.prototype.String = function() { return this.$val.String(); };
	FixedZone = function(name, offset) {
		var l, name, offset, x;
		l = new Location.ptr(name, new sliceType([new zone.ptr(name, offset, false)]), new sliceType$1([new zoneTrans.ptr(new $Int64(-2147483648, 0), 0, false, false)]), new $Int64(-2147483648, 0), new $Int64(2147483647, 4294967295), ptrType.nil);
		l.cacheZone = (x = l.zone, (0 >= x.$length ? ($throwRuntimeError("index out of range"), undefined) : x.$array[x.$offset + 0]));
		return l;
	};
	$pkg.FixedZone = FixedZone;
	Location.ptr.prototype.lookup = function(sec) {
		var _q, _r, end, hi, l, lim, lo, m, name, offset, sec, start, tx, x, x$1, x$2, x$3, x$4, x$5, x$6, x$7, x$8, zone$1, zone$2, zone$3, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _q = $f._q; _r = $f._r; end = $f.end; hi = $f.hi; l = $f.l; lim = $f.lim; lo = $f.lo; m = $f.m; name = $f.name; offset = $f.offset; sec = $f.sec; start = $f.start; tx = $f.tx; x = $f.x; x$1 = $f.x$1; x$2 = $f.x$2; x$3 = $f.x$3; x$4 = $f.x$4; x$5 = $f.x$5; x$6 = $f.x$6; x$7 = $f.x$7; x$8 = $f.x$8; zone$1 = $f.zone$1; zone$2 = $f.zone$2; zone$3 = $f.zone$3; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		name = "";
		offset = 0;
		start = new $Int64(0, 0);
		end = new $Int64(0, 0);
		l = this;
		_r = l.get(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		l = _r;
		if (l.zone.$length === 0) {
			name = "UTC";
			offset = 0;
			start = new $Int64(-2147483648, 0);
			end = new $Int64(2147483647, 4294967295);
			$s = -1; return [name, offset, start, end];
		}
		zone$1 = l.cacheZone;
		if (!(zone$1 === ptrType.nil) && (x = l.cacheStart, (x.$high < sec.$high || (x.$high === sec.$high && x.$low <= sec.$low))) && (x$1 = l.cacheEnd, (sec.$high < x$1.$high || (sec.$high === x$1.$high && sec.$low < x$1.$low)))) {
			name = zone$1.name;
			offset = zone$1.offset;
			start = l.cacheStart;
			end = l.cacheEnd;
			$s = -1; return [name, offset, start, end];
		}
		if ((l.tx.$length === 0) || (x$2 = (x$3 = l.tx, (0 >= x$3.$length ? ($throwRuntimeError("index out of range"), undefined) : x$3.$array[x$3.$offset + 0])).when, (sec.$high < x$2.$high || (sec.$high === x$2.$high && sec.$low < x$2.$low)))) {
			zone$2 = (x$4 = l.zone, x$5 = l.lookupFirstZone(), ((x$5 < 0 || x$5 >= x$4.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$4.$array[x$4.$offset + x$5]));
			name = zone$2.name;
			offset = zone$2.offset;
			start = new $Int64(-2147483648, 0);
			if (l.tx.$length > 0) {
				end = (x$6 = l.tx, (0 >= x$6.$length ? ($throwRuntimeError("index out of range"), undefined) : x$6.$array[x$6.$offset + 0])).when;
			} else {
				end = new $Int64(2147483647, 4294967295);
			}
			$s = -1; return [name, offset, start, end];
		}
		tx = l.tx;
		end = new $Int64(2147483647, 4294967295);
		lo = 0;
		hi = tx.$length;
		while (true) {
			if (!((hi - lo >> 0) > 1)) { break; }
			m = lo + (_q = ((hi - lo >> 0)) / 2, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")) >> 0;
			lim = ((m < 0 || m >= tx.$length) ? ($throwRuntimeError("index out of range"), undefined) : tx.$array[tx.$offset + m]).when;
			if ((sec.$high < lim.$high || (sec.$high === lim.$high && sec.$low < lim.$low))) {
				end = lim;
				hi = m;
			} else {
				lo = m;
			}
		}
		zone$3 = (x$7 = l.zone, x$8 = ((lo < 0 || lo >= tx.$length) ? ($throwRuntimeError("index out of range"), undefined) : tx.$array[tx.$offset + lo]).index, ((x$8 < 0 || x$8 >= x$7.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$7.$array[x$7.$offset + x$8]));
		name = zone$3.name;
		offset = zone$3.offset;
		start = ((lo < 0 || lo >= tx.$length) ? ($throwRuntimeError("index out of range"), undefined) : tx.$array[tx.$offset + lo]).when;
		$s = -1; return [name, offset, start, end];
		/* */ } return; } if ($f === undefined) { $f = { $blk: Location.ptr.prototype.lookup }; } $f._q = _q; $f._r = _r; $f.end = end; $f.hi = hi; $f.l = l; $f.lim = lim; $f.lo = lo; $f.m = m; $f.name = name; $f.offset = offset; $f.sec = sec; $f.start = start; $f.tx = tx; $f.x = x; $f.x$1 = x$1; $f.x$2 = x$2; $f.x$3 = x$3; $f.x$4 = x$4; $f.x$5 = x$5; $f.x$6 = x$6; $f.x$7 = x$7; $f.x$8 = x$8; $f.zone$1 = zone$1; $f.zone$2 = zone$2; $f.zone$3 = zone$3; $f.$s = $s; $f.$r = $r; return $f;
	};
	Location.prototype.lookup = function(sec) { return this.$val.lookup(sec); };
	Location.ptr.prototype.lookupFirstZone = function() {
		var _i, _ref, l, x, x$1, x$2, x$3, x$4, x$5, zi, zi$1;
		l = this;
		if (!l.firstZoneUsed()) {
			return 0;
		}
		if (l.tx.$length > 0 && (x = l.zone, x$1 = (x$2 = l.tx, (0 >= x$2.$length ? ($throwRuntimeError("index out of range"), undefined) : x$2.$array[x$2.$offset + 0])).index, ((x$1 < 0 || x$1 >= x.$length) ? ($throwRuntimeError("index out of range"), undefined) : x.$array[x.$offset + x$1])).isDST) {
			zi = (((x$3 = l.tx, (0 >= x$3.$length ? ($throwRuntimeError("index out of range"), undefined) : x$3.$array[x$3.$offset + 0])).index >> 0)) - 1 >> 0;
			while (true) {
				if (!(zi >= 0)) { break; }
				if (!(x$4 = l.zone, ((zi < 0 || zi >= x$4.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$4.$array[x$4.$offset + zi])).isDST) {
					return zi;
				}
				zi = zi - (1) >> 0;
			}
		}
		_ref = l.zone;
		_i = 0;
		while (true) {
			if (!(_i < _ref.$length)) { break; }
			zi$1 = _i;
			if (!(x$5 = l.zone, ((zi$1 < 0 || zi$1 >= x$5.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$5.$array[x$5.$offset + zi$1])).isDST) {
				return zi$1;
			}
			_i++;
		}
		return 0;
	};
	Location.prototype.lookupFirstZone = function() { return this.$val.lookupFirstZone(); };
	Location.ptr.prototype.firstZoneUsed = function() {
		var _i, _ref, l, tx;
		l = this;
		_ref = l.tx;
		_i = 0;
		while (true) {
			if (!(_i < _ref.$length)) { break; }
			tx = $clone(((_i < 0 || _i >= _ref.$length) ? ($throwRuntimeError("index out of range"), undefined) : _ref.$array[_ref.$offset + _i]), zoneTrans);
			if (tx.index === 0) {
				return true;
			}
			_i++;
		}
		return false;
	};
	Location.prototype.firstZoneUsed = function() { return this.$val.firstZoneUsed(); };
	Location.ptr.prototype.lookupName = function(name, unix) {
		var _i, _i$1, _r, _r$1, _ref, _ref$1, _tmp, _tmp$1, _tmp$2, _tmp$3, _tuple, i, i$1, l, nam, name, offset, offset$1, ok, unix, x, x$1, x$2, zone$1, zone$2, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _i = $f._i; _i$1 = $f._i$1; _r = $f._r; _r$1 = $f._r$1; _ref = $f._ref; _ref$1 = $f._ref$1; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; _tmp$2 = $f._tmp$2; _tmp$3 = $f._tmp$3; _tuple = $f._tuple; i = $f.i; i$1 = $f.i$1; l = $f.l; nam = $f.nam; name = $f.name; offset = $f.offset; offset$1 = $f.offset$1; ok = $f.ok; unix = $f.unix; x = $f.x; x$1 = $f.x$1; x$2 = $f.x$2; zone$1 = $f.zone$1; zone$2 = $f.zone$2; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		offset = 0;
		ok = false;
		l = this;
		_r = l.get(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		l = _r;
		_ref = l.zone;
		_i = 0;
		/* while (true) { */ case 2:
			/* if (!(_i < _ref.$length)) { break; } */ if(!(_i < _ref.$length)) { $s = 3; continue; }
			i = _i;
			zone$1 = (x = l.zone, ((i < 0 || i >= x.$length) ? ($throwRuntimeError("index out of range"), undefined) : x.$array[x.$offset + i]));
			/* */ if (zone$1.name === name) { $s = 4; continue; }
			/* */ $s = 5; continue;
			/* if (zone$1.name === name) { */ case 4:
				_r$1 = l.lookup((x$1 = (new $Int64(0, zone$1.offset)), new $Int64(unix.$high - x$1.$high, unix.$low - x$1.$low))); /* */ $s = 6; case 6: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
				_tuple = _r$1;
				nam = _tuple[0];
				offset$1 = _tuple[1];
				if (nam === zone$1.name) {
					_tmp = offset$1;
					_tmp$1 = true;
					offset = _tmp;
					ok = _tmp$1;
					$s = -1; return [offset, ok];
				}
			/* } */ case 5:
			_i++;
		/* } */ $s = 2; continue; case 3:
		_ref$1 = l.zone;
		_i$1 = 0;
		while (true) {
			if (!(_i$1 < _ref$1.$length)) { break; }
			i$1 = _i$1;
			zone$2 = (x$2 = l.zone, ((i$1 < 0 || i$1 >= x$2.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$2.$array[x$2.$offset + i$1]));
			if (zone$2.name === name) {
				_tmp$2 = zone$2.offset;
				_tmp$3 = true;
				offset = _tmp$2;
				ok = _tmp$3;
				$s = -1; return [offset, ok];
			}
			_i$1++;
		}
		$s = -1; return [offset, ok];
		/* */ } return; } if ($f === undefined) { $f = { $blk: Location.ptr.prototype.lookupName }; } $f._i = _i; $f._i$1 = _i$1; $f._r = _r; $f._r$1 = _r$1; $f._ref = _ref; $f._ref$1 = _ref$1; $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f._tmp$2 = _tmp$2; $f._tmp$3 = _tmp$3; $f._tuple = _tuple; $f.i = i; $f.i$1 = i$1; $f.l = l; $f.nam = nam; $f.name = name; $f.offset = offset; $f.offset$1 = offset$1; $f.ok = ok; $f.unix = unix; $f.x = x; $f.x$1 = x$1; $f.x$2 = x$2; $f.zone$1 = zone$1; $f.zone$2 = zone$2; $f.$s = $s; $f.$r = $r; return $f;
	};
	Location.prototype.lookupName = function(name, unix) { return this.$val.lookupName(name, unix); };
	ptrType$4.methods = [{prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}];
	Time.methods = [{prop: "String", name: "String", pkg: "", typ: $funcType([], [$String], false)}, {prop: "Format", name: "Format", pkg: "", typ: $funcType([$String], [$String], false)}, {prop: "AppendFormat", name: "AppendFormat", pkg: "", typ: $funcType([sliceType$3, $String], [sliceType$3], false)}, {prop: "After", name: "After", pkg: "", typ: $funcType([Time], [$Bool], false)}, {prop: "Before", name: "Before", pkg: "", typ: $funcType([Time], [$Bool], false)}, {prop: "Equal", name: "Equal", pkg: "", typ: $funcType([Time], [$Bool], false)}, {prop: "IsZero", name: "IsZero", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "abs", name: "abs", pkg: "time", typ: $funcType([], [$Uint64], false)}, {prop: "locabs", name: "locabs", pkg: "time", typ: $funcType([], [$String, $Int, $Uint64], false)}, {prop: "Date", name: "Date", pkg: "", typ: $funcType([], [$Int, Month, $Int], false)}, {prop: "Year", name: "Year", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Month", name: "Month", pkg: "", typ: $funcType([], [Month], false)}, {prop: "Day", name: "Day", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Weekday", name: "Weekday", pkg: "", typ: $funcType([], [Weekday], false)}, {prop: "ISOWeek", name: "ISOWeek", pkg: "", typ: $funcType([], [$Int, $Int], false)}, {prop: "Clock", name: "Clock", pkg: "", typ: $funcType([], [$Int, $Int, $Int], false)}, {prop: "Hour", name: "Hour", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Minute", name: "Minute", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Second", name: "Second", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Nanosecond", name: "Nanosecond", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "YearDay", name: "YearDay", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Add", name: "Add", pkg: "", typ: $funcType([Duration], [Time], false)}, {prop: "Sub", name: "Sub", pkg: "", typ: $funcType([Time], [Duration], false)}, {prop: "AddDate", name: "AddDate", pkg: "", typ: $funcType([$Int, $Int, $Int], [Time], false)}, {prop: "date", name: "date", pkg: "time", typ: $funcType([$Bool], [$Int, Month, $Int, $Int], false)}, {prop: "UTC", name: "UTC", pkg: "", typ: $funcType([], [Time], false)}, {prop: "Local", name: "Local", pkg: "", typ: $funcType([], [Time], false)}, {prop: "In", name: "In", pkg: "", typ: $funcType([ptrType$2], [Time], false)}, {prop: "Location", name: "Location", pkg: "", typ: $funcType([], [ptrType$2], false)}, {prop: "Zone", name: "Zone", pkg: "", typ: $funcType([], [$String, $Int], false)}, {prop: "Unix", name: "Unix", pkg: "", typ: $funcType([], [$Int64], false)}, {prop: "UnixNano", name: "UnixNano", pkg: "", typ: $funcType([], [$Int64], false)}, {prop: "MarshalBinary", name: "MarshalBinary", pkg: "", typ: $funcType([], [sliceType$3, $error], false)}, {prop: "GobEncode", name: "GobEncode", pkg: "", typ: $funcType([], [sliceType$3, $error], false)}, {prop: "MarshalJSON", name: "MarshalJSON", pkg: "", typ: $funcType([], [sliceType$3, $error], false)}, {prop: "MarshalText", name: "MarshalText", pkg: "", typ: $funcType([], [sliceType$3, $error], false)}, {prop: "Truncate", name: "Truncate", pkg: "", typ: $funcType([Duration], [Time], false)}, {prop: "Round", name: "Round", pkg: "", typ: $funcType([Duration], [Time], false)}];
	ptrType$7.methods = [{prop: "nsec", name: "nsec", pkg: "time", typ: $funcType([], [$Int32], false)}, {prop: "sec", name: "sec", pkg: "time", typ: $funcType([], [$Int64], false)}, {prop: "unixSec", name: "unixSec", pkg: "time", typ: $funcType([], [$Int64], false)}, {prop: "addSec", name: "addSec", pkg: "time", typ: $funcType([$Int64], [], false)}, {prop: "setLoc", name: "setLoc", pkg: "time", typ: $funcType([ptrType$2], [], false)}, {prop: "stripMono", name: "stripMono", pkg: "time", typ: $funcType([], [], false)}, {prop: "setMono", name: "setMono", pkg: "time", typ: $funcType([$Int64], [], false)}, {prop: "mono", name: "mono", pkg: "time", typ: $funcType([], [$Int64], false)}, {prop: "UnmarshalBinary", name: "UnmarshalBinary", pkg: "", typ: $funcType([sliceType$3], [$error], false)}, {prop: "GobDecode", name: "GobDecode", pkg: "", typ: $funcType([sliceType$3], [$error], false)}, {prop: "UnmarshalJSON", name: "UnmarshalJSON", pkg: "", typ: $funcType([sliceType$3], [$error], false)}, {prop: "UnmarshalText", name: "UnmarshalText", pkg: "", typ: $funcType([sliceType$3], [$error], false)}];
	Month.methods = [{prop: "String", name: "String", pkg: "", typ: $funcType([], [$String], false)}];
	Weekday.methods = [{prop: "String", name: "String", pkg: "", typ: $funcType([], [$String], false)}];
	Duration.methods = [{prop: "String", name: "String", pkg: "", typ: $funcType([], [$String], false)}, {prop: "Nanoseconds", name: "Nanoseconds", pkg: "", typ: $funcType([], [$Int64], false)}, {prop: "Seconds", name: "Seconds", pkg: "", typ: $funcType([], [$Float64], false)}, {prop: "Minutes", name: "Minutes", pkg: "", typ: $funcType([], [$Float64], false)}, {prop: "Hours", name: "Hours", pkg: "", typ: $funcType([], [$Float64], false)}, {prop: "Truncate", name: "Truncate", pkg: "", typ: $funcType([Duration], [Duration], false)}, {prop: "Round", name: "Round", pkg: "", typ: $funcType([Duration], [Duration], false)}];
	ptrType$2.methods = [{prop: "get", name: "get", pkg: "time", typ: $funcType([], [ptrType$2], false)}, {prop: "String", name: "String", pkg: "", typ: $funcType([], [$String], false)}, {prop: "lookup", name: "lookup", pkg: "time", typ: $funcType([$Int64], [$String, $Int, $Int64, $Int64], false)}, {prop: "lookupFirstZone", name: "lookupFirstZone", pkg: "time", typ: $funcType([], [$Int], false)}, {prop: "firstZoneUsed", name: "firstZoneUsed", pkg: "time", typ: $funcType([], [$Bool], false)}, {prop: "lookupName", name: "lookupName", pkg: "time", typ: $funcType([$String, $Int64], [$Int, $Bool], false)}];
	ParseError.init("", [{prop: "Layout", name: "Layout", embedded: false, exported: true, typ: $String, tag: ""}, {prop: "Value", name: "Value", embedded: false, exported: true, typ: $String, tag: ""}, {prop: "LayoutElem", name: "LayoutElem", embedded: false, exported: true, typ: $String, tag: ""}, {prop: "ValueElem", name: "ValueElem", embedded: false, exported: true, typ: $String, tag: ""}, {prop: "Message", name: "Message", embedded: false, exported: true, typ: $String, tag: ""}]);
	Time.init("time", [{prop: "wall", name: "wall", embedded: false, exported: false, typ: $Uint64, tag: ""}, {prop: "ext", name: "ext", embedded: false, exported: false, typ: $Int64, tag: ""}, {prop: "loc", name: "loc", embedded: false, exported: false, typ: ptrType$2, tag: ""}]);
	Location.init("time", [{prop: "name", name: "name", embedded: false, exported: false, typ: $String, tag: ""}, {prop: "zone", name: "zone", embedded: false, exported: false, typ: sliceType, tag: ""}, {prop: "tx", name: "tx", embedded: false, exported: false, typ: sliceType$1, tag: ""}, {prop: "cacheStart", name: "cacheStart", embedded: false, exported: false, typ: $Int64, tag: ""}, {prop: "cacheEnd", name: "cacheEnd", embedded: false, exported: false, typ: $Int64, tag: ""}, {prop: "cacheZone", name: "cacheZone", embedded: false, exported: false, typ: ptrType, tag: ""}]);
	zone.init("time", [{prop: "name", name: "name", embedded: false, exported: false, typ: $String, tag: ""}, {prop: "offset", name: "offset", embedded: false, exported: false, typ: $Int, tag: ""}, {prop: "isDST", name: "isDST", embedded: false, exported: false, typ: $Bool, tag: ""}]);
	zoneTrans.init("time", [{prop: "when", name: "when", embedded: false, exported: false, typ: $Int64, tag: ""}, {prop: "index", name: "index", embedded: false, exported: false, typ: $Uint8, tag: ""}, {prop: "isstd", name: "isstd", embedded: false, exported: false, typ: $Bool, tag: ""}, {prop: "isutc", name: "isutc", embedded: false, exported: false, typ: $Bool, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = errors.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = js.$init(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = nosync.$init(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = runtime.$init(); /* */ $s = 4; case 4: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = syscall.$init(); /* */ $s = 5; case 5: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		localLoc = new Location.ptr("", sliceType.nil, sliceType$1.nil, new $Int64(0, 0), new $Int64(0, 0), ptrType.nil);
		localOnce = new nosync.Once.ptr(false, false);
		zoneSources = new sliceType$2([runtime.GOROOT() + "/lib/time/zoneinfo.zip"]);
		std0x = $toNativeArray($kindInt, [260, 265, 524, 526, 528, 274]);
		longDayNames = new sliceType$2(["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]);
		shortDayNames = new sliceType$2(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
		shortMonthNames = new sliceType$2(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]);
		longMonthNames = new sliceType$2(["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]);
		atoiError = errors.New("time: invalid number");
		errBad = errors.New("bad value for field");
		errLeadingInt = errors.New("time: bad [0-9]*");
		months = $toNativeArray($kindString, ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]);
		days = $toNativeArray($kindString, ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]);
		daysBefore = $toNativeArray($kindInt32, [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365]);
		utcLoc = new Location.ptr("UTC", sliceType.nil, sliceType$1.nil, new $Int64(0, 0), new $Int64(0, 0), ptrType.nil);
		$pkg.UTC = utcLoc;
		$pkg.Local = localLoc;
		errLocation = errors.New("time: invalid location name");
		badData = errors.New("malformed time zone information");
		init();
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["github.com/dotchain/fuss/todo"] = (function() {
	var $pkg = {}, $init, changes, refs, core, dom, controls, time, TaskStream, TasksStream, appCtx, AppStruct, filteredCtx, FilteredTasksStruct, taskEditCtx, TaskEditStruct, tasksViewCtx, TasksViewStruct, Task, Tasks, ptrType, ptrType$1, sliceType, ptrType$2, ptrType$3, sliceType$1, ptrType$4, ptrType$5, ptrType$6, sliceType$2, ptrType$7, structType, structType$1, structType$2, ptrType$8, structType$3, structType$4, structType$5, ptrType$9, structType$6, structType$7, ptrType$10, structType$8, structType$9, sliceType$3, funcType, ptrType$11, mapType, ptrType$12, mapType$1, ptrType$13, mapType$2, ptrType$14, mapType$3, NewTaskStream, NewTasksStream, newID, taskEdit, tasksView, renderTasks, filteredTasks, app;
	changes = $packages["github.com/dotchain/dot/changes"];
	refs = $packages["github.com/dotchain/dot/refs"];
	core = $packages["github.com/dotchain/fuss/core"];
	dom = $packages["github.com/dotchain/fuss/dom"];
	controls = $packages["github.com/dotchain/fuss/todo/controls"];
	time = $packages["time"];
	TaskStream = $pkg.TaskStream = $newType(0, $kindStruct, "todo.TaskStream", true, "github.com/dotchain/fuss/todo", true, function(Notifier_, Value_, Change_, Next_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Notifier = ptrType$3.nil;
			this.Value = new Task.ptr("", false, "");
			this.Change = $ifaceNil;
			this.Next = ptrType$2.nil;
			return;
		}
		this.Notifier = Notifier_;
		this.Value = Value_;
		this.Change = Change_;
		this.Next = Next_;
	});
	TasksStream = $pkg.TasksStream = $newType(0, $kindStruct, "todo.TasksStream", true, "github.com/dotchain/fuss/todo", true, function(Notifier_, Value_, Change_, Next_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Notifier = ptrType$3.nil;
			this.Value = Tasks.nil;
			this.Change = $ifaceNil;
			this.Next = ptrType$6.nil;
			return;
		}
		this.Notifier = Notifier_;
		this.Value = Value_;
		this.Change = Change_;
		this.Next = Next_;
	});
	appCtx = $pkg.appCtx = $newType(0, $kindStruct, "todo.appCtx", true, "github.com/dotchain/fuss/todo", false, function(Cache_, finalizer_, FilteredTasksStruct_, initialized_, stateHandler_, controls_, dom_, memoized_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Cache = new core.Cache.ptr(false, false);
			this.finalizer = $throwNilPointerError;
			this.FilteredTasksStruct = new FilteredTasksStruct.ptr(false, false);
			this.initialized = false;
			this.stateHandler = new core.Handler.ptr($throwNilPointerError);
			this.controls = new structType.ptr(new controls.ChromeStruct.ptr(false, false));
			this.dom = new structType$1.ptr(new dom.AStruct.ptr(false, false), new dom.TextViewStruct.ptr(false, false));
			this.memoized = new structType$2.ptr(ptrType$6.nil, $ifaceNil, ptrType$6.nil);
			return;
		}
		this.Cache = Cache_;
		this.finalizer = finalizer_;
		this.FilteredTasksStruct = FilteredTasksStruct_;
		this.initialized = initialized_;
		this.stateHandler = stateHandler_;
		this.controls = controls_;
		this.dom = dom_;
		this.memoized = memoized_;
	});
	AppStruct = $pkg.AppStruct = $newType(0, $kindStruct, "todo.AppStruct", true, "github.com/dotchain/fuss/todo", true, function(old_, current_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.old = false;
			this.current = false;
			return;
		}
		this.old = old_;
		this.current = current_;
	});
	filteredCtx = $pkg.filteredCtx = $newType(0, $kindStruct, "todo.filteredCtx", true, "github.com/dotchain/fuss/todo", false, function(Cache_, finalizer_, TasksViewStruct_, initialized_, stateHandler_, controls_, dom_, memoized_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Cache = new core.Cache.ptr(false, false);
			this.finalizer = $throwNilPointerError;
			this.TasksViewStruct = new TasksViewStruct.ptr(false, false);
			this.initialized = false;
			this.stateHandler = new core.Handler.ptr($throwNilPointerError);
			this.controls = new structType$3.ptr(new controls.FilterStruct.ptr(false, false));
			this.dom = new structType$4.ptr(new dom.TextEditOStruct.ptr(false, false), new dom.VRunStruct.ptr(false, false));
			this.memoized = new structType$5.ptr(ptrType$4.nil, ptrType$4.nil, ptrType$4.nil, ptrType$4.nil, $ifaceNil, new dom.Styles.ptr("", new dom.Size.ptr("", 0, 0, 0, 0), new dom.Size.ptr("", 0, 0, 0, 0), "", "", 0, 0, 0), ptrType$6.nil);
			return;
		}
		this.Cache = Cache_;
		this.finalizer = finalizer_;
		this.TasksViewStruct = TasksViewStruct_;
		this.initialized = initialized_;
		this.stateHandler = stateHandler_;
		this.controls = controls_;
		this.dom = dom_;
		this.memoized = memoized_;
	});
	FilteredTasksStruct = $pkg.FilteredTasksStruct = $newType(0, $kindStruct, "todo.FilteredTasksStruct", true, "github.com/dotchain/fuss/todo", true, function(old_, current_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.old = false;
			this.current = false;
			return;
		}
		this.old = old_;
		this.current = current_;
	});
	taskEditCtx = $pkg.taskEditCtx = $newType(0, $kindStruct, "todo.taskEditCtx", true, "github.com/dotchain/fuss/todo", false, function(Cache_, finalizer_, initialized_, stateHandler_, dom_, memoized_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Cache = new core.Cache.ptr(false, false);
			this.finalizer = $throwNilPointerError;
			this.initialized = false;
			this.stateHandler = new core.Handler.ptr($throwNilPointerError);
			this.dom = new structType$6.ptr(new dom.CheckboxEditStruct.ptr(false, false), new dom.RunStruct.ptr(false, false), new dom.TextEditStruct.ptr(false, false));
			this.memoized = new structType$7.ptr($ifaceNil, ptrType$2.nil);
			return;
		}
		this.Cache = Cache_;
		this.finalizer = finalizer_;
		this.initialized = initialized_;
		this.stateHandler = stateHandler_;
		this.dom = dom_;
		this.memoized = memoized_;
	});
	TaskEditStruct = $pkg.TaskEditStruct = $newType(0, $kindStruct, "todo.TaskEditStruct", true, "github.com/dotchain/fuss/todo", true, function(old_, current_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.old = false;
			this.current = false;
			return;
		}
		this.old = old_;
		this.current = current_;
	});
	tasksViewCtx = $pkg.tasksViewCtx = $newType(0, $kindStruct, "todo.tasksViewCtx", true, "github.com/dotchain/fuss/todo", false, function(Cache_, finalizer_, TaskEditStruct_, initialized_, stateHandler_, dom_, memoized_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Cache = new core.Cache.ptr(false, false);
			this.finalizer = $throwNilPointerError;
			this.TaskEditStruct = new TaskEditStruct.ptr(false, false);
			this.initialized = false;
			this.stateHandler = new core.Handler.ptr($throwNilPointerError);
			this.dom = new structType$8.ptr(new dom.VRunStruct.ptr(false, false));
			this.memoized = new structType$9.ptr($ifaceNil, ptrType$4.nil, ptrType$4.nil, new dom.Styles.ptr("", new dom.Size.ptr("", 0, 0, 0, 0), new dom.Size.ptr("", 0, 0, 0, 0), "", "", 0, 0, 0), ptrType$6.nil);
			return;
		}
		this.Cache = Cache_;
		this.finalizer = finalizer_;
		this.TaskEditStruct = TaskEditStruct_;
		this.initialized = initialized_;
		this.stateHandler = stateHandler_;
		this.dom = dom_;
		this.memoized = memoized_;
	});
	TasksViewStruct = $pkg.TasksViewStruct = $newType(0, $kindStruct, "todo.TasksViewStruct", true, "github.com/dotchain/fuss/todo", true, function(old_, current_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.old = false;
			this.current = false;
			return;
		}
		this.old = old_;
		this.current = current_;
	});
	Task = $pkg.Task = $newType(0, $kindStruct, "todo.Task", true, "github.com/dotchain/fuss/todo", true, function(ID_, Done_, Description_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.ID = "";
			this.Done = false;
			this.Description = "";
			return;
		}
		this.ID = ID_;
		this.Done = Done_;
		this.Description = Description_;
	});
	Tasks = $pkg.Tasks = $newType(12, $kindSlice, "todo.Tasks", true, "github.com/dotchain/fuss/todo", true, null);
	ptrType = $ptrType(dom.TextStream);
	ptrType$1 = $ptrType(core.Handler);
	sliceType = $sliceType(ptrType$1);
	ptrType$2 = $ptrType(TaskStream);
	ptrType$3 = $ptrType(core.Notifier);
	sliceType$1 = $sliceType($emptyInterface);
	ptrType$4 = $ptrType(dom.BoolStream);
	ptrType$5 = $ptrType(refs.MergeResult);
	ptrType$6 = $ptrType(TasksStream);
	sliceType$2 = $sliceType(Task);
	ptrType$7 = $ptrType(appCtx);
	structType = $structType("", [{prop: "ChromeStruct", name: "ChromeStruct", embedded: true, exported: true, typ: controls.ChromeStruct, tag: ""}]);
	structType$1 = $structType("", [{prop: "AStruct", name: "AStruct", embedded: true, exported: true, typ: dom.AStruct, tag: ""}, {prop: "TextViewStruct", name: "TextViewStruct", embedded: true, exported: true, typ: dom.TextViewStruct, tag: ""}]);
	structType$2 = $structType("github.com/dotchain/fuss/todo", [{prop: "result1", name: "result1", embedded: false, exported: false, typ: ptrType$6, tag: ""}, {prop: "result2", name: "result2", embedded: false, exported: false, typ: dom.Element, tag: ""}, {prop: "tasksState", name: "tasksState", embedded: false, exported: false, typ: ptrType$6, tag: ""}]);
	ptrType$8 = $ptrType(filteredCtx);
	structType$3 = $structType("", [{prop: "FilterStruct", name: "FilterStruct", embedded: true, exported: true, typ: controls.FilterStruct, tag: ""}]);
	structType$4 = $structType("", [{prop: "TextEditOStruct", name: "TextEditOStruct", embedded: true, exported: true, typ: dom.TextEditOStruct, tag: ""}, {prop: "VRunStruct", name: "VRunStruct", embedded: true, exported: true, typ: dom.VRunStruct, tag: ""}]);
	structType$5 = $structType("github.com/dotchain/fuss/todo", [{prop: "doneState", name: "doneState", embedded: false, exported: false, typ: ptrType$4, tag: ""}, {prop: "notDoneState", name: "notDoneState", embedded: false, exported: false, typ: ptrType$4, tag: ""}, {prop: "result1", name: "result1", embedded: false, exported: false, typ: ptrType$4, tag: ""}, {prop: "result2", name: "result2", embedded: false, exported: false, typ: ptrType$4, tag: ""}, {prop: "result3", name: "result3", embedded: false, exported: false, typ: dom.Element, tag: ""}, {prop: "styles", name: "styles", embedded: false, exported: false, typ: dom.Styles, tag: ""}, {prop: "tasks", name: "tasks", embedded: false, exported: false, typ: ptrType$6, tag: ""}]);
	ptrType$9 = $ptrType(taskEditCtx);
	structType$6 = $structType("", [{prop: "CheckboxEditStruct", name: "CheckboxEditStruct", embedded: true, exported: true, typ: dom.CheckboxEditStruct, tag: ""}, {prop: "RunStruct", name: "RunStruct", embedded: true, exported: true, typ: dom.RunStruct, tag: ""}, {prop: "TextEditStruct", name: "TextEditStruct", embedded: true, exported: true, typ: dom.TextEditStruct, tag: ""}]);
	structType$7 = $structType("github.com/dotchain/fuss/todo", [{prop: "result1", name: "result1", embedded: false, exported: false, typ: dom.Element, tag: ""}, {prop: "task", name: "task", embedded: false, exported: false, typ: ptrType$2, tag: ""}]);
	ptrType$10 = $ptrType(tasksViewCtx);
	structType$8 = $structType("", [{prop: "VRunStruct", name: "VRunStruct", embedded: true, exported: true, typ: dom.VRunStruct, tag: ""}]);
	structType$9 = $structType("github.com/dotchain/fuss/todo", [{prop: "result1", name: "result1", embedded: false, exported: false, typ: dom.Element, tag: ""}, {prop: "showDone", name: "showDone", embedded: false, exported: false, typ: ptrType$4, tag: ""}, {prop: "showNotDone", name: "showNotDone", embedded: false, exported: false, typ: ptrType$4, tag: ""}, {prop: "styles", name: "styles", embedded: false, exported: false, typ: dom.Styles, tag: ""}, {prop: "tasks", name: "tasks", embedded: false, exported: false, typ: ptrType$6, tag: ""}]);
	sliceType$3 = $sliceType(dom.Element);
	funcType = $funcType([], [], false);
	ptrType$11 = $ptrType(AppStruct);
	mapType = $mapType($emptyInterface, ptrType$7);
	ptrType$12 = $ptrType(FilteredTasksStruct);
	mapType$1 = $mapType($emptyInterface, ptrType$8);
	ptrType$13 = $ptrType(TaskEditStruct);
	mapType$2 = $mapType($emptyInterface, ptrType$9);
	ptrType$14 = $ptrType(TasksViewStruct);
	mapType$3 = $mapType($emptyInterface, ptrType$10);
	TasksStream.ptr.prototype.addTaskStream = function(cache) {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, _tuple, cache, close, entry, f, h, handler, key, merging, n, n2, ok, parent, s;
		entry = ptrType.nil;
		s = this;
		key = "next";
		n = s.Notifier;
		handler = new core.Handler.ptr($throwNilPointerError);
		_tuple = cache.GetSubstream(n, new $String(key));
		f = _tuple[0];
		h = _tuple[1];
		ok = _tuple[2];
		if (ok) {
			_tmp = $assertType(f, ptrType);
			_tmp$1 = h;
			entry = _tmp;
			handler = _tmp$1;
		} else {
			entry = dom.NewTextStream("");
			_tmp$2 = s;
			_tmp$3 = false;
			parent = _tmp$2;
			merging = _tmp$3;
			handler.Handle = (function $b() {
				var _r, _r$1, _r$2, result, $s, $r;
				/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; result = $f.result; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
				if (merging) {
					$s = -1; return;
				}
				merging = true;
				parent = parent.Latest();
				result = parent.Value;
				/* while (true) { */ case 1:
					/* if (!(!(entry.Next === ptrType.nil))) { break; } */ if(!(!(entry.Next === ptrType.nil))) { $s = 2; continue; }
					entry = entry.Next;
					_r = newID(); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
					result = $append(result, new Task.ptr(_r, false, entry.Value));
				/* } */ $s = 1; continue; case 2:
				_r$1 = entry.Append($ifaceNil, "", true); /* */ $s = 4; case 4: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
				entry = _r$1;
				_r$2 = parent.Append($ifaceNil, result, true); /* */ $s = 5; case 5: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
				parent = _r$2;
				merging = false;
				$s = -1; return;
				/* */ } return; } if ($f === undefined) { $f = { $blk: $b }; } $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f.result = result; $f.$s = $s; $f.$r = $r; return $f;
			});
			entry.Notifier.On(handler);
			parent.Notifier.On(handler);
		}
		entry = entry.Latest();
		n2 = entry.Notifier;
		close = (function() {
			n.Off(handler);
			n2.Off(handler);
		});
		cache.SetSubstream(n, new $String(key), entry, handler, close);
		entry = entry;
		return entry;
	};
	TasksStream.prototype.addTaskStream = function(cache) { return this.$val.addTaskStream(cache); };
	NewTaskStream = function(value) {
		var value;
		return new TaskStream.ptr(new core.Notifier.ptr(sliceType.nil), $clone(value, Task), $ifaceNil, ptrType$2.nil);
	};
	$pkg.NewTaskStream = NewTaskStream;
	TaskStream.ptr.prototype.Latest = function() {
		var s;
		s = this;
		while (true) {
			if (!(!(s.Next === ptrType$2.nil))) { break; }
			s = s.Next;
		}
		return s;
	};
	TaskStream.prototype.Latest = function() { return this.$val.Latest(); };
	TaskStream.ptr.prototype.Append = function(c, value, isLocal) {
		var _r, _r$1, _r$2, _tmp, _tmp$1, _tmp$2, _tmp$3, _tuple, _tuple$1, after, afterChange, before, c, isLocal, result, s, v, value, x, x$1, x$2, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; _tmp$2 = $f._tmp$2; _tmp$3 = $f._tmp$3; _tuple = $f._tuple; _tuple$1 = $f._tuple$1; after = $f.after; afterChange = $f.afterChange; before = $f.before; c = $f.c; isLocal = $f.isLocal; result = $f.result; s = $f.s; v = $f.v; value = $f.value; x = $f.x; x$1 = $f.x$1; x$2 = $f.x$2; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		s = this;
		if ($interfaceIsEqual(c, $ifaceNil)) {
			c = (x = new changes.Replace.ptr(s.wrapValue((x$1 = s.Value, new x$1.constructor.elem(x$1))), s.wrapValue(new value.constructor.elem(value))), new x.constructor.elem(x));
		}
		result = new TaskStream.ptr(s.Notifier, $clone(value, Task), $ifaceNil, ptrType$2.nil);
		before = s;
		v = (x$2 = new changes.Atomic.ptr(new value.constructor.elem(value)), new x$2.constructor.elem(x$2));
		after = result;
		/* while (true) { */ case 1:
			/* if (!(!(before.Next === ptrType$2.nil))) { break; } */ if(!(!(before.Next === ptrType$2.nil))) { $s = 2; continue; }
			afterChange = $ifaceNil;
			/* */ if (isLocal) { $s = 3; continue; }
			/* */ $s = 4; continue;
			/* if (isLocal) { */ case 3:
				_r = before.Change.Merge(c); /* */ $s = 6; case 6: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
				_tuple = _r;
				c = _tuple[0];
				afterChange = _tuple[1];
				$s = 5; continue;
			/* } else { */ case 4:
				_r$1 = c.Merge(before.Change); /* */ $s = 7; case 7: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
				_tuple$1 = _r$1;
				afterChange = _tuple$1[0];
				c = _tuple$1[1];
			/* } */ case 5:
			if ($interfaceIsEqual(c, $ifaceNil)) {
				_tmp = afterChange;
				_tmp$1 = before.Next;
				after.Change = _tmp;
				after.Next = _tmp$1;
				$s = -1; return result;
			}
			/* */ if ($interfaceIsEqual(afterChange, $ifaceNil)) { $s = 8; continue; }
			/* */ $s = 9; continue;
			/* if ($interfaceIsEqual(afterChange, $ifaceNil)) { */ case 8:
				before = before.Next;
				/* continue; */ $s = 1; continue;
			/* } */ case 9:
			_r$2 = v.Apply($ifaceNil, afterChange); /* */ $s = 10; case 10: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
			v = _r$2;
			after.Change = afterChange;
			after.Next = new TaskStream.ptr(s.Notifier, $clone(s.unwrapValue(v), Task), $ifaceNil, ptrType$2.nil);
			after = after.Next;
			before = before.Next;
		/* } */ $s = 1; continue; case 2:
		_tmp$2 = c;
		_tmp$3 = after;
		before.Change = _tmp$2;
		before.Next = _tmp$3;
		$r = s.Notifier.Notify(); /* */ $s = 11; case 11: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$s = -1; return result;
		/* */ } return; } if ($f === undefined) { $f = { $blk: TaskStream.ptr.prototype.Append }; } $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f._tmp$2 = _tmp$2; $f._tmp$3 = _tmp$3; $f._tuple = _tuple; $f._tuple$1 = _tuple$1; $f.after = after; $f.afterChange = afterChange; $f.before = before; $f.c = c; $f.isLocal = isLocal; $f.result = result; $f.s = s; $f.v = v; $f.value = value; $f.x = x; $f.x$1 = x$1; $f.x$2 = x$2; $f.$s = $s; $f.$r = $r; return $f;
	};
	TaskStream.prototype.Append = function(c, value, isLocal) { return this.$val.Append(c, value, isLocal); };
	TaskStream.ptr.prototype.wrapValue = function(i) {
		var _tuple, i, ok, s, x, x$1;
		s = this;
		_tuple = $assertType(i, changes.Value, true);
		x = _tuple[0];
		ok = _tuple[1];
		if (ok) {
			return x;
		}
		return (x$1 = new changes.Atomic.ptr(i), new x$1.constructor.elem(x$1));
	};
	TaskStream.prototype.wrapValue = function(i) { return this.$val.wrapValue(i); };
	TaskStream.ptr.prototype.unwrapValue = function(v) {
		var _tuple, ok, s, v, x;
		s = this;
		_tuple = $assertType($assertType(v, $emptyInterface), Task, true);
		x = $clone(_tuple[0], Task);
		ok = _tuple[1];
		if (ok) {
			return x;
		}
		return $assertType($assertType(v, changes.Atomic).Value, Task);
	};
	TaskStream.prototype.unwrapValue = function(v) { return this.$val.unwrapValue(v); };
	TaskStream.ptr.prototype.SetDone = function(v) {
		var _r, c, key, s, v, value, x, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; c = $f.c; key = $f.key; s = $f.s; v = $f.v; value = $f.value; x = $f.x; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		s = this;
		c = new changes.Replace.ptr(s.wrapValue(new $Bool(s.Value.Done)), s.wrapValue(new $Bool(v)));
		value = $clone(s.Value, Task);
		value.Done = v;
		key = new sliceType$1([new $String("Done")]);
		_r = s.Append((x = new changes.PathChange.ptr(key, new c.constructor.elem(c)), new x.constructor.elem(x)), $clone(value, Task), true); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: TaskStream.ptr.prototype.SetDone }; } $f._r = _r; $f.c = c; $f.key = key; $f.s = s; $f.v = v; $f.value = value; $f.x = x; $f.$s = $s; $f.$r = $r; return $f;
	};
	TaskStream.prototype.SetDone = function(v) { return this.$val.SetDone(v); };
	TaskStream.ptr.prototype.DoneSubstream = function(cache) {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tuple, cache, close, f, field, h, handler, merging, n, n2, ok, parent, path, s, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; _tmp$2 = $f._tmp$2; _tmp$3 = $f._tmp$3; _tmp$4 = $f._tmp$4; _tuple = $f._tuple; cache = $f.cache; close = $f.close; f = $f.f; field = $f.field; h = $f.h; handler = $f.handler; merging = $f.merging; n = $f.n; n2 = $f.n2; ok = $f.ok; parent = $f.parent; path = $f.path; s = $f.s; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		field = [field];
		handler = [handler];
		merging = [merging];
		n = [n];
		n2 = [n2];
		parent = [parent];
		path = [path];
		field[0] = ptrType$4.nil;
		s = this;
		n[0] = s.Notifier;
		handler[0] = new core.Handler.ptr($throwNilPointerError);
		_tuple = cache.GetSubstream(n[0], new $String("Done"));
		f = _tuple[0];
		h = _tuple[1];
		ok = _tuple[2];
		if (ok) {
			_tmp = $assertType(f, ptrType$4);
			_tmp$1 = h;
			field[0] = _tmp;
			handler[0] = _tmp$1;
		} else {
			field[0] = dom.NewBoolStream(s.Value.Done);
			_tmp$2 = s;
			_tmp$3 = false;
			_tmp$4 = new sliceType$1([new $String("Done")]);
			parent[0] = _tmp$2;
			merging[0] = _tmp$3;
			path[0] = _tmp$4;
			handler[0].Handle = (function(field, handler, merging, n, n2, parent, path) { return function $b() {
				var _r, _r$1, _r$2, _r$3, c, result, v, $s, $r;
				/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; _r$3 = $f._r$3; c = $f.c; result = $f.result; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
				if (merging[0]) {
					$s = -1; return;
				}
				merging[0] = true;
				/* while (true) { */ case 1:
					/* if (!(!(field[0].Next === ptrType$4.nil))) { break; } */ if(!(!(field[0].Next === ptrType$4.nil))) { $s = 2; continue; }
					v = $clone(parent[0].Value, Task);
					v.Done = field[0].Next.Value;
					c = new changes.PathChange.ptr(path[0], field[0].Change);
					_r = parent[0].Append(new c.constructor.elem(c), $clone(v, Task), true); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
					parent[0] = _r;
					field[0] = field[0].Next;
				/* } */ $s = 1; continue; case 2:
				/* while (true) { */ case 4:
					/* if (!(!(parent[0].Next === ptrType$2.nil))) { break; } */ if(!(!(parent[0].Next === ptrType$2.nil))) { $s = 5; continue; }
					_r$1 = refs.Merge(path[0], parent[0].Change); /* */ $s = 6; case 6: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
					result = _r$1;
					/* */ if (result === ptrType$5.nil) { $s = 7; continue; }
					/* */ $s = 8; continue;
					/* if (result === ptrType$5.nil) { */ case 7:
						_r$2 = field[0].Append($ifaceNil, parent[0].Next.Value.Done, true); /* */ $s = 10; case 10: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
						field[0] = _r$2;
						$s = 9; continue;
					/* } else { */ case 8:
						_r$3 = field[0].Append(result.Affected, parent[0].Next.Value.Done, true); /* */ $s = 11; case 11: if($c) { $c = false; _r$3 = _r$3.$blk(); } if (_r$3 && _r$3.$blk !== undefined) { break s; }
						field[0] = _r$3;
					/* } */ case 9:
					parent[0] = parent[0].Next;
				/* } */ $s = 4; continue; case 5:
				merging[0] = false;
				$s = -1; return;
				/* */ } return; } if ($f === undefined) { $f = { $blk: $b }; } $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f._r$3 = _r$3; $f.c = c; $f.result = result; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
			}; })(field, handler, merging, n, n2, parent, path);
			field[0].Notifier.On(handler[0]);
			parent[0].Notifier.On(handler[0]);
		}
		$r = handler[0].Handle(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		field[0] = field[0].Latest();
		n2[0] = field[0].Notifier;
		close = (function(field, handler, merging, n, n2, parent, path) { return function() {
			n[0].Off(handler[0]);
			n2[0].Off(handler[0]);
		}; })(field, handler, merging, n, n2, parent, path);
		cache.SetSubstream(n[0], new $String("Done"), field[0], handler[0], close);
		field[0] = field[0];
		$s = -1; return field[0];
		/* */ } return; } if ($f === undefined) { $f = { $blk: TaskStream.ptr.prototype.DoneSubstream }; } $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f._tmp$2 = _tmp$2; $f._tmp$3 = _tmp$3; $f._tmp$4 = _tmp$4; $f._tuple = _tuple; $f.cache = cache; $f.close = close; $f.f = f; $f.field = field; $f.h = h; $f.handler = handler; $f.merging = merging; $f.n = n; $f.n2 = n2; $f.ok = ok; $f.parent = parent; $f.path = path; $f.s = s; $f.$s = $s; $f.$r = $r; return $f;
	};
	TaskStream.prototype.DoneSubstream = function(cache) { return this.$val.DoneSubstream(cache); };
	TaskStream.ptr.prototype.SetDescription = function(v) {
		var _r, c, key, s, v, value, x, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; c = $f.c; key = $f.key; s = $f.s; v = $f.v; value = $f.value; x = $f.x; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		s = this;
		c = new changes.Replace.ptr(s.wrapValue(new $String(s.Value.Description)), s.wrapValue(new $String(v)));
		value = $clone(s.Value, Task);
		value.Description = v;
		key = new sliceType$1([new $String("Description")]);
		_r = s.Append((x = new changes.PathChange.ptr(key, new c.constructor.elem(c)), new x.constructor.elem(x)), $clone(value, Task), true); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: TaskStream.ptr.prototype.SetDescription }; } $f._r = _r; $f.c = c; $f.key = key; $f.s = s; $f.v = v; $f.value = value; $f.x = x; $f.$s = $s; $f.$r = $r; return $f;
	};
	TaskStream.prototype.SetDescription = function(v) { return this.$val.SetDescription(v); };
	TaskStream.ptr.prototype.DescriptionSubstream = function(cache) {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tuple, cache, close, f, field, h, handler, merging, n, n2, ok, parent, path, s, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; _tmp$2 = $f._tmp$2; _tmp$3 = $f._tmp$3; _tmp$4 = $f._tmp$4; _tuple = $f._tuple; cache = $f.cache; close = $f.close; f = $f.f; field = $f.field; h = $f.h; handler = $f.handler; merging = $f.merging; n = $f.n; n2 = $f.n2; ok = $f.ok; parent = $f.parent; path = $f.path; s = $f.s; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		field = [field];
		handler = [handler];
		merging = [merging];
		n = [n];
		n2 = [n2];
		parent = [parent];
		path = [path];
		field[0] = ptrType.nil;
		s = this;
		n[0] = s.Notifier;
		handler[0] = new core.Handler.ptr($throwNilPointerError);
		_tuple = cache.GetSubstream(n[0], new $String("Description"));
		f = _tuple[0];
		h = _tuple[1];
		ok = _tuple[2];
		if (ok) {
			_tmp = $assertType(f, ptrType);
			_tmp$1 = h;
			field[0] = _tmp;
			handler[0] = _tmp$1;
		} else {
			field[0] = dom.NewTextStream(s.Value.Description);
			_tmp$2 = s;
			_tmp$3 = false;
			_tmp$4 = new sliceType$1([new $String("Description")]);
			parent[0] = _tmp$2;
			merging[0] = _tmp$3;
			path[0] = _tmp$4;
			handler[0].Handle = (function(field, handler, merging, n, n2, parent, path) { return function $b() {
				var _r, _r$1, _r$2, _r$3, c, result, v, $s, $r;
				/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; _r$3 = $f._r$3; c = $f.c; result = $f.result; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
				if (merging[0]) {
					$s = -1; return;
				}
				merging[0] = true;
				/* while (true) { */ case 1:
					/* if (!(!(field[0].Next === ptrType.nil))) { break; } */ if(!(!(field[0].Next === ptrType.nil))) { $s = 2; continue; }
					v = $clone(parent[0].Value, Task);
					v.Description = field[0].Next.Value;
					c = new changes.PathChange.ptr(path[0], field[0].Change);
					_r = parent[0].Append(new c.constructor.elem(c), $clone(v, Task), true); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
					parent[0] = _r;
					field[0] = field[0].Next;
				/* } */ $s = 1; continue; case 2:
				/* while (true) { */ case 4:
					/* if (!(!(parent[0].Next === ptrType$2.nil))) { break; } */ if(!(!(parent[0].Next === ptrType$2.nil))) { $s = 5; continue; }
					_r$1 = refs.Merge(path[0], parent[0].Change); /* */ $s = 6; case 6: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
					result = _r$1;
					/* */ if (result === ptrType$5.nil) { $s = 7; continue; }
					/* */ $s = 8; continue;
					/* if (result === ptrType$5.nil) { */ case 7:
						_r$2 = field[0].Append($ifaceNil, parent[0].Next.Value.Description, true); /* */ $s = 10; case 10: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
						field[0] = _r$2;
						$s = 9; continue;
					/* } else { */ case 8:
						_r$3 = field[0].Append(result.Affected, parent[0].Next.Value.Description, true); /* */ $s = 11; case 11: if($c) { $c = false; _r$3 = _r$3.$blk(); } if (_r$3 && _r$3.$blk !== undefined) { break s; }
						field[0] = _r$3;
					/* } */ case 9:
					parent[0] = parent[0].Next;
				/* } */ $s = 4; continue; case 5:
				merging[0] = false;
				$s = -1; return;
				/* */ } return; } if ($f === undefined) { $f = { $blk: $b }; } $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f._r$3 = _r$3; $f.c = c; $f.result = result; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
			}; })(field, handler, merging, n, n2, parent, path);
			field[0].Notifier.On(handler[0]);
			parent[0].Notifier.On(handler[0]);
		}
		$r = handler[0].Handle(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		field[0] = field[0].Latest();
		n2[0] = field[0].Notifier;
		close = (function(field, handler, merging, n, n2, parent, path) { return function() {
			n[0].Off(handler[0]);
			n2[0].Off(handler[0]);
		}; })(field, handler, merging, n, n2, parent, path);
		cache.SetSubstream(n[0], new $String("Description"), field[0], handler[0], close);
		field[0] = field[0];
		$s = -1; return field[0];
		/* */ } return; } if ($f === undefined) { $f = { $blk: TaskStream.ptr.prototype.DescriptionSubstream }; } $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f._tmp$2 = _tmp$2; $f._tmp$3 = _tmp$3; $f._tmp$4 = _tmp$4; $f._tuple = _tuple; $f.cache = cache; $f.close = close; $f.f = f; $f.field = field; $f.h = h; $f.handler = handler; $f.merging = merging; $f.n = n; $f.n2 = n2; $f.ok = ok; $f.parent = parent; $f.path = path; $f.s = s; $f.$s = $s; $f.$r = $r; return $f;
	};
	TaskStream.prototype.DescriptionSubstream = function(cache) { return this.$val.DescriptionSubstream(cache); };
	NewTasksStream = function(value) {
		var value;
		return new TasksStream.ptr(new core.Notifier.ptr(sliceType.nil), value, $ifaceNil, ptrType$6.nil);
	};
	$pkg.NewTasksStream = NewTasksStream;
	TasksStream.ptr.prototype.Latest = function() {
		var s;
		s = this;
		while (true) {
			if (!(!(s.Next === ptrType$6.nil))) { break; }
			s = s.Next;
		}
		return s;
	};
	TasksStream.prototype.Latest = function() { return this.$val.Latest(); };
	TasksStream.ptr.prototype.Append = function(c, value, isLocal) {
		var _r, _r$1, _r$2, _tmp, _tmp$1, _tmp$2, _tmp$3, _tuple, _tuple$1, after, afterChange, before, c, isLocal, result, s, v, value, x, x$1, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; _tmp$2 = $f._tmp$2; _tmp$3 = $f._tmp$3; _tuple = $f._tuple; _tuple$1 = $f._tuple$1; after = $f.after; afterChange = $f.afterChange; before = $f.before; c = $f.c; isLocal = $f.isLocal; result = $f.result; s = $f.s; v = $f.v; value = $f.value; x = $f.x; x$1 = $f.x$1; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		s = this;
		if ($interfaceIsEqual(c, $ifaceNil)) {
			c = (x = new changes.Replace.ptr(s.wrapValue(s.Value), s.wrapValue(value)), new x.constructor.elem(x));
		}
		result = new TasksStream.ptr(s.Notifier, value, $ifaceNil, ptrType$6.nil);
		before = s;
		v = (x$1 = new changes.Atomic.ptr(value), new x$1.constructor.elem(x$1));
		after = result;
		/* while (true) { */ case 1:
			/* if (!(!(before.Next === ptrType$6.nil))) { break; } */ if(!(!(before.Next === ptrType$6.nil))) { $s = 2; continue; }
			afterChange = $ifaceNil;
			/* */ if (isLocal) { $s = 3; continue; }
			/* */ $s = 4; continue;
			/* if (isLocal) { */ case 3:
				_r = before.Change.Merge(c); /* */ $s = 6; case 6: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
				_tuple = _r;
				c = _tuple[0];
				afterChange = _tuple[1];
				$s = 5; continue;
			/* } else { */ case 4:
				_r$1 = c.Merge(before.Change); /* */ $s = 7; case 7: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
				_tuple$1 = _r$1;
				afterChange = _tuple$1[0];
				c = _tuple$1[1];
			/* } */ case 5:
			if ($interfaceIsEqual(c, $ifaceNil)) {
				_tmp = afterChange;
				_tmp$1 = before.Next;
				after.Change = _tmp;
				after.Next = _tmp$1;
				$s = -1; return result;
			}
			/* */ if ($interfaceIsEqual(afterChange, $ifaceNil)) { $s = 8; continue; }
			/* */ $s = 9; continue;
			/* if ($interfaceIsEqual(afterChange, $ifaceNil)) { */ case 8:
				before = before.Next;
				/* continue; */ $s = 1; continue;
			/* } */ case 9:
			_r$2 = v.Apply($ifaceNil, afterChange); /* */ $s = 10; case 10: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
			v = _r$2;
			after.Change = afterChange;
			after.Next = new TasksStream.ptr(s.Notifier, s.unwrapValue(v), $ifaceNil, ptrType$6.nil);
			after = after.Next;
			before = before.Next;
		/* } */ $s = 1; continue; case 2:
		_tmp$2 = c;
		_tmp$3 = after;
		before.Change = _tmp$2;
		before.Next = _tmp$3;
		$r = s.Notifier.Notify(); /* */ $s = 11; case 11: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$s = -1; return result;
		/* */ } return; } if ($f === undefined) { $f = { $blk: TasksStream.ptr.prototype.Append }; } $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f._tmp$2 = _tmp$2; $f._tmp$3 = _tmp$3; $f._tuple = _tuple; $f._tuple$1 = _tuple$1; $f.after = after; $f.afterChange = afterChange; $f.before = before; $f.c = c; $f.isLocal = isLocal; $f.result = result; $f.s = s; $f.v = v; $f.value = value; $f.x = x; $f.x$1 = x$1; $f.$s = $s; $f.$r = $r; return $f;
	};
	TasksStream.prototype.Append = function(c, value, isLocal) { return this.$val.Append(c, value, isLocal); };
	TasksStream.ptr.prototype.wrapValue = function(i) {
		var _tuple, i, ok, s, x, x$1;
		s = this;
		_tuple = $assertType(i, changes.Value, true);
		x = _tuple[0];
		ok = _tuple[1];
		if (ok) {
			return x;
		}
		return (x$1 = new changes.Atomic.ptr(i), new x$1.constructor.elem(x$1));
	};
	TasksStream.prototype.wrapValue = function(i) { return this.$val.wrapValue(i); };
	TasksStream.ptr.prototype.unwrapValue = function(v) {
		var _tuple, ok, s, v, x;
		s = this;
		_tuple = $assertType($assertType(v, $emptyInterface), Tasks, true);
		x = _tuple[0];
		ok = _tuple[1];
		if (ok) {
			return x;
		}
		return $assertType($assertType(v, changes.Atomic).Value, Tasks);
	};
	TasksStream.prototype.unwrapValue = function(v) { return this.$val.unwrapValue(v); };
	TasksStream.ptr.prototype.Substream = function(cache, index) {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tuple, cache, close, entry, f, h, handler, index, merging, n, n2, ok, parent, path, s, x, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; _tmp$2 = $f._tmp$2; _tmp$3 = $f._tmp$3; _tmp$4 = $f._tmp$4; _tuple = $f._tuple; cache = $f.cache; close = $f.close; entry = $f.entry; f = $f.f; h = $f.h; handler = $f.handler; index = $f.index; merging = $f.merging; n = $f.n; n2 = $f.n2; ok = $f.ok; parent = $f.parent; path = $f.path; s = $f.s; x = $f.x; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		entry = [entry];
		handler = [handler];
		index = [index];
		merging = [merging];
		n = [n];
		n2 = [n2];
		parent = [parent];
		path = [path];
		entry[0] = ptrType$2.nil;
		s = this;
		n[0] = s.Notifier;
		handler[0] = new core.Handler.ptr($throwNilPointerError);
		_tuple = cache.GetSubstream(n[0], new $Int(index[0]));
		f = _tuple[0];
		h = _tuple[1];
		ok = _tuple[2];
		if (ok) {
			_tmp = $assertType(f, ptrType$2);
			_tmp$1 = h;
			entry[0] = _tmp;
			handler[0] = _tmp$1;
		} else {
			entry[0] = NewTaskStream($clone((x = s.Value, ((index[0] < 0 || index[0] >= x.$length) ? ($throwRuntimeError("index out of range"), undefined) : x.$array[x.$offset + index[0]])), Task));
			_tmp$2 = s;
			_tmp$3 = false;
			_tmp$4 = new sliceType$1([new $Int(index[0])]);
			parent[0] = _tmp$2;
			merging[0] = _tmp$3;
			path[0] = _tmp$4;
			handler[0].Handle = (function(entry, handler, index, merging, n, n2, parent, path) { return function $b() {
				var _r, _r$1, _r$2, c, c$1, result, v, x$1, x$2, x$3, $s, $r;
				/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; c = $f.c; c$1 = $f.c$1; result = $f.result; v = $f.v; x$1 = $f.x$1; x$2 = $f.x$2; x$3 = $f.x$3; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
				if (merging[0]) {
					$s = -1; return;
				}
				merging[0] = true;
				/* while (true) { */ case 1:
					/* if (!(!(entry[0].Next === ptrType$2.nil))) { break; } */ if(!(!(entry[0].Next === ptrType$2.nil))) { $s = 2; continue; }
					v = $appendSlice((Tasks.nil), (x$1 = parent[0].Value, $subslice(new sliceType$2(x$1.$array), x$1.$offset, x$1.$offset + x$1.$length)));
					Task.copy(((index[0] < 0 || index[0] >= v.$length) ? ($throwRuntimeError("index out of range"), undefined) : v.$array[v.$offset + index[0]]), entry[0].Next.Value);
					c = new changes.PathChange.ptr(path[0], entry[0].Change);
					_r = parent[0].Append(new c.constructor.elem(c), v, true); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
					parent[0] = _r;
					entry[0] = entry[0].Next;
				/* } */ $s = 1; continue; case 2:
				/* while (true) { */ case 4:
					/* if (!(!(parent[0].Next === ptrType$6.nil))) { break; } */ if(!(!(parent[0].Next === ptrType$6.nil))) { $s = 5; continue; }
					_r$1 = refs.Merge(path[0], parent[0].Change); /* */ $s = 6; case 6: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
					result = _r$1;
					c$1 = $ifaceNil;
					if (!(result === ptrType$5.nil)) {
						index[0] = $assertType((x$2 = result.P, (0 >= x$2.$length ? ($throwRuntimeError("index out of range"), undefined) : x$2.$array[x$2.$offset + 0])), $Int);
						c$1 = result.Affected;
					}
					_r$2 = entry[0].Append(c$1, $clone((x$3 = parent[0].Next.Value, ((index[0] < 0 || index[0] >= x$3.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$3.$array[x$3.$offset + index[0]])), Task), true); /* */ $s = 7; case 7: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
					entry[0] = _r$2;
					parent[0] = parent[0].Next;
				/* } */ $s = 4; continue; case 5:
				merging[0] = false;
				$s = -1; return;
				/* */ } return; } if ($f === undefined) { $f = { $blk: $b }; } $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f.c = c; $f.c$1 = c$1; $f.result = result; $f.v = v; $f.x$1 = x$1; $f.x$2 = x$2; $f.x$3 = x$3; $f.$s = $s; $f.$r = $r; return $f;
			}; })(entry, handler, index, merging, n, n2, parent, path);
			entry[0].Notifier.On(handler[0]);
			parent[0].Notifier.On(handler[0]);
		}
		$r = handler[0].Handle(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		entry[0] = entry[0].Latest();
		n2[0] = entry[0].Notifier;
		close = (function(entry, handler, index, merging, n, n2, parent, path) { return function() {
			n[0].Off(handler[0]);
			n2[0].Off(handler[0]);
		}; })(entry, handler, index, merging, n, n2, parent, path);
		cache.SetSubstream(n[0], new $Int(index[0]), entry[0], handler[0], close);
		entry[0] = entry[0];
		$s = -1; return entry[0];
		/* */ } return; } if ($f === undefined) { $f = { $blk: TasksStream.ptr.prototype.Substream }; } $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f._tmp$2 = _tmp$2; $f._tmp$3 = _tmp$3; $f._tmp$4 = _tmp$4; $f._tuple = _tuple; $f.cache = cache; $f.close = close; $f.entry = entry; $f.f = f; $f.h = h; $f.handler = handler; $f.index = index; $f.merging = merging; $f.n = n; $f.n2 = n2; $f.ok = ok; $f.parent = parent; $f.path = path; $f.s = s; $f.x = x; $f.$s = $s; $f.$r = $r; return $f;
	};
	TasksStream.prototype.Substream = function(cache, index) { return this.$val.Substream(cache, index); };
	appCtx.ptr.prototype.areArgsSame = function() {
		var c;
		c = this;
		return true;
	};
	appCtx.prototype.areArgsSame = function() { return this.$val.areArgsSame(); };
	appCtx.ptr.prototype.refreshIfNeeded = function() {
		var _r, c, result2, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; c = $f.c; result2 = $f.result2; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		result2 = $ifaceNil;
		c = this;
		/* */ if (!c.initialized || !c.areArgsSame()) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (!c.initialized || !c.areArgsSame()) { */ case 1:
			_r = c.refresh(); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			result2 = _r;
			$s = -1; return result2;
		/* } */ case 2:
		result2 = c.memoized.result2;
		$s = -1; return result2;
		/* */ } return; } if ($f === undefined) { $f = { $blk: appCtx.ptr.prototype.refreshIfNeeded }; } $f._r = _r; $f.c = c; $f.result2 = result2; $f.$s = $s; $f.$r = $r; return $f;
	};
	appCtx.prototype.refreshIfNeeded = function() { return this.$val.refreshIfNeeded(); };
	appCtx.ptr.prototype.refresh = function() {
		var _r, _tuple, c, result2, $s, $deferred, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _tuple = $f._tuple; c = $f.c; result2 = $f.result2; $s = $f.$s; $deferred = $f.$deferred; $r = $f.$r; } var $err = null; try { s: while (true) { switch ($s) { case 0: $deferred = []; $deferred.index = $curGoroutine.deferStack.length; $curGoroutine.deferStack.push($deferred);
		c = [c];
		result2 = $ifaceNil;
		c[0] = this;
		c[0].initialized = true;
		c[0].stateHandler.Handle = (function(c) { return function $b() {
			var _r, $s, $r;
			/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
			_r = c[0].refresh(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			_r;
			$s = -1; return;
			/* */ } return; } if ($f === undefined) { $f = { $blk: $b }; } $f._r = _r; $f.$s = $s; $f.$r = $r; return $f;
		}; })(c);
		if (!(c[0].memoized.tasksState === ptrType$6.nil)) {
			c[0].memoized.tasksState = c[0].memoized.tasksState.Latest();
		}
		c[0].Cache.Begin();
		$deferred.push([$methodVal(c[0].Cache, "End"), []]);
		c[0].FilteredTasksStruct.Begin();
		$deferred.push([$methodVal(c[0].FilteredTasksStruct, "End"), []]);
		c[0].controls.ChromeStruct.Begin();
		$deferred.push([$methodVal(c[0].controls.ChromeStruct, "End"), []]);
		c[0].dom.AStruct.Begin();
		$deferred.push([$methodVal(c[0].dom.AStruct, "End"), []]);
		c[0].dom.TextViewStruct.Begin();
		$deferred.push([$methodVal(c[0].dom.TextViewStruct, "End"), []]);
		_r = app(c[0], c[0].memoized.tasksState); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_tuple = _r;
		c[0].memoized.result1 = _tuple[0];
		c[0].memoized.result2 = _tuple[1];
		if (!(c[0].memoized.tasksState === c[0].memoized.result1)) {
			if (!(c[0].memoized.tasksState === ptrType$6.nil)) {
				c[0].memoized.tasksState.Notifier.Off(c[0].stateHandler);
			}
			if (!(c[0].memoized.result1 === ptrType$6.nil)) {
				c[0].memoized.result1.Notifier.On(c[0].stateHandler);
			}
			c[0].memoized.tasksState = c[0].memoized.result1;
		}
		result2 = c[0].memoized.result2;
		$s = -1; return result2;
		/* */ } return; } } catch(err) { $err = err; $s = -1; } finally { $callDeferred($deferred, $err); if (!$curGoroutine.asleep) { return  result2; } if($curGoroutine.asleep) { if ($f === undefined) { $f = { $blk: appCtx.ptr.prototype.refresh }; } $f._r = _r; $f._tuple = _tuple; $f.c = c; $f.result2 = result2; $f.$s = $s; $f.$deferred = $deferred; $f.$r = $r; return $f; } }
	};
	appCtx.prototype.refresh = function() { return this.$val.refresh(); };
	appCtx.ptr.prototype.close = function() {
		var c, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; c = $f.c; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		c = this;
		c.Cache.Begin();
		$r = c.Cache.End(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		c.FilteredTasksStruct.Begin();
		$r = c.FilteredTasksStruct.End(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		c.controls.ChromeStruct.Begin();
		$r = c.controls.ChromeStruct.End(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		c.dom.AStruct.Begin();
		$r = c.dom.AStruct.End(); /* */ $s = 4; case 4: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		c.dom.TextViewStruct.Begin();
		$r = c.dom.TextViewStruct.End(); /* */ $s = 5; case 5: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		if (!(c.memoized.result1 === ptrType$6.nil)) {
			c.memoized.result1.Notifier.Off(c.stateHandler);
		}
		/* */ if (!(c.finalizer === $throwNilPointerError)) { $s = 6; continue; }
		/* */ $s = 7; continue;
		/* if (!(c.finalizer === $throwNilPointerError)) { */ case 6:
			$r = c.finalizer(); /* */ $s = 8; case 8: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* } */ case 7:
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: appCtx.ptr.prototype.close }; } $f.c = c; $f.$s = $s; $f.$r = $r; return $f;
	};
	appCtx.prototype.close = function() { return this.$val.close(); };
	AppStruct.ptr.prototype.Begin = function() {
		var _tmp, _tmp$1, c;
		c = this;
		_tmp = c.current;
		_tmp$1 = $makeMap($emptyInterface.keyFor, []);
		c.old = _tmp;
		c.current = _tmp$1;
	};
	AppStruct.prototype.Begin = function() { return this.$val.Begin(); };
	AppStruct.ptr.prototype.End = function() {
		var _entry, _i, _keys, _ref, c, ctx, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _entry = $f._entry; _i = $f._i; _keys = $f._keys; _ref = $f._ref; c = $f.c; ctx = $f.ctx; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		c = this;
		_ref = c.old;
		_i = 0;
		_keys = $keys(_ref);
		/* while (true) { */ case 1:
			/* if (!(_i < _keys.length)) { break; } */ if(!(_i < _keys.length)) { $s = 2; continue; }
			_entry = _ref[_keys[_i]];
			if (_entry === undefined) {
				_i++;
				/* continue; */ $s = 1; continue;
			}
			ctx = _entry.v;
			$r = ctx.close(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
			_i++;
		/* } */ $s = 1; continue; case 2:
		c.old = false;
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: AppStruct.ptr.prototype.End }; } $f._entry = _entry; $f._i = _i; $f._keys = _keys; $f._ref = _ref; $f.c = c; $f.ctx = ctx; $f.$s = $s; $f.$r = $r; return $f;
	};
	AppStruct.prototype.End = function() { return this.$val.End(); };
	AppStruct.ptr.prototype.App = function(cKey) {
		var _entry, _key, _r, _tuple, c, cKey, cOld, ok, result2, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _entry = $f._entry; _key = $f._key; _r = $f._r; _tuple = $f._tuple; c = $f.c; cKey = $f.cKey; cOld = $f.cOld; ok = $f.ok; result2 = $f.result2; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		result2 = $ifaceNil;
		c = this;
		_tuple = (_entry = c.old[$emptyInterface.keyFor(cKey)], _entry !== undefined ? [_entry.v, true] : [ptrType$7.nil, false]);
		cOld = _tuple[0];
		ok = _tuple[1];
		if (ok) {
			delete c.old[$emptyInterface.keyFor(cKey)];
		} else {
			cOld = new appCtx.ptr(new core.Cache.ptr(false, false), $throwNilPointerError, new FilteredTasksStruct.ptr(false, false), false, new core.Handler.ptr($throwNilPointerError), new structType.ptr(new controls.ChromeStruct.ptr(false, false)), new structType$1.ptr(new dom.AStruct.ptr(false, false), new dom.TextViewStruct.ptr(false, false)), new structType$2.ptr(ptrType$6.nil, $ifaceNil, ptrType$6.nil));
		}
		_key = cKey; (c.current || $throwRuntimeError("assignment to entry in nil map"))[$emptyInterface.keyFor(_key)] = { k: _key, v: cOld };
		_r = cOld.refreshIfNeeded(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		result2 = _r;
		$s = -1; return result2;
		/* */ } return; } if ($f === undefined) { $f = { $blk: AppStruct.ptr.prototype.App }; } $f._entry = _entry; $f._key = _key; $f._r = _r; $f._tuple = _tuple; $f.c = c; $f.cKey = cKey; $f.cOld = cOld; $f.ok = ok; $f.result2 = result2; $f.$s = $s; $f.$r = $r; return $f;
	};
	AppStruct.prototype.App = function(cKey) { return this.$val.App(cKey); };
	filteredCtx.ptr.prototype.areArgsSame = function(styles, tasks) {
		var c, styles, tasks;
		c = this;
		if (!($equal(styles, c.memoized.styles, dom.Styles))) {
			return false;
		}
		return tasks === c.memoized.tasks;
	};
	filteredCtx.prototype.areArgsSame = function(styles, tasks) { return this.$val.areArgsSame(styles, tasks); };
	filteredCtx.ptr.prototype.refreshIfNeeded = function(styles, tasks) {
		var _r, c, result3, styles, tasks, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; c = $f.c; result3 = $f.result3; styles = $f.styles; tasks = $f.tasks; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		result3 = $ifaceNil;
		c = this;
		/* */ if (!c.initialized || !c.areArgsSame($clone(styles, dom.Styles), tasks)) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (!c.initialized || !c.areArgsSame($clone(styles, dom.Styles), tasks)) { */ case 1:
			_r = c.refresh($clone(styles, dom.Styles), tasks); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			result3 = _r;
			$s = -1; return result3;
		/* } */ case 2:
		result3 = c.memoized.result3;
		$s = -1; return result3;
		/* */ } return; } if ($f === undefined) { $f = { $blk: filteredCtx.ptr.prototype.refreshIfNeeded }; } $f._r = _r; $f.c = c; $f.result3 = result3; $f.styles = styles; $f.tasks = tasks; $f.$s = $s; $f.$r = $r; return $f;
	};
	filteredCtx.prototype.refreshIfNeeded = function(styles, tasks) { return this.$val.refreshIfNeeded(styles, tasks); };
	filteredCtx.ptr.prototype.refresh = function(styles, tasks) {
		var _r, _tmp, _tmp$1, _tuple, c, result3, styles, tasks, $s, $deferred, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; _tuple = $f._tuple; c = $f.c; result3 = $f.result3; styles = $f.styles; tasks = $f.tasks; $s = $f.$s; $deferred = $f.$deferred; $r = $f.$r; } var $err = null; try { s: while (true) { switch ($s) { case 0: $deferred = []; $deferred.index = $curGoroutine.deferStack.length; $curGoroutine.deferStack.push($deferred);
		c = [c];
		styles = [styles];
		tasks = [tasks];
		result3 = $ifaceNil;
		c[0] = this;
		c[0].initialized = true;
		c[0].stateHandler.Handle = (function(c, styles, tasks) { return function $b() {
			var _r, $s, $r;
			/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
			_r = c[0].refresh($clone(styles[0], dom.Styles), tasks[0]); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			_r;
			$s = -1; return;
			/* */ } return; } if ($f === undefined) { $f = { $blk: $b }; } $f._r = _r; $f.$s = $s; $f.$r = $r; return $f;
		}; })(c, styles, tasks);
		if (!(c[0].memoized.doneState === ptrType$4.nil)) {
			c[0].memoized.doneState = c[0].memoized.doneState.Latest();
		}
		if (!(c[0].memoized.notDoneState === ptrType$4.nil)) {
			c[0].memoized.notDoneState = c[0].memoized.notDoneState.Latest();
		}
		_tmp = $clone(styles[0], dom.Styles);
		_tmp$1 = tasks[0];
		dom.Styles.copy(c[0].memoized.styles, _tmp);
		c[0].memoized.tasks = _tmp$1;
		c[0].Cache.Begin();
		$deferred.push([$methodVal(c[0].Cache, "End"), []]);
		c[0].TasksViewStruct.Begin();
		$deferred.push([$methodVal(c[0].TasksViewStruct, "End"), []]);
		c[0].controls.FilterStruct.Begin();
		$deferred.push([$methodVal(c[0].controls.FilterStruct, "End"), []]);
		c[0].dom.TextEditOStruct.Begin();
		$deferred.push([$methodVal(c[0].dom.TextEditOStruct, "End"), []]);
		c[0].dom.VRunStruct.Begin();
		$deferred.push([$methodVal(c[0].dom.VRunStruct, "End"), []]);
		_r = filteredTasks(c[0], $clone(styles[0], dom.Styles), tasks[0], c[0].memoized.doneState, c[0].memoized.notDoneState); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_tuple = _r;
		c[0].memoized.result1 = _tuple[0];
		c[0].memoized.result2 = _tuple[1];
		c[0].memoized.result3 = _tuple[2];
		if (!(c[0].memoized.doneState === c[0].memoized.result1)) {
			if (!(c[0].memoized.doneState === ptrType$4.nil)) {
				c[0].memoized.doneState.Notifier.Off(c[0].stateHandler);
			}
			if (!(c[0].memoized.result1 === ptrType$4.nil)) {
				c[0].memoized.result1.Notifier.On(c[0].stateHandler);
			}
			c[0].memoized.doneState = c[0].memoized.result1;
		}
		if (!(c[0].memoized.notDoneState === c[0].memoized.result2)) {
			if (!(c[0].memoized.notDoneState === ptrType$4.nil)) {
				c[0].memoized.notDoneState.Notifier.Off(c[0].stateHandler);
			}
			if (!(c[0].memoized.result2 === ptrType$4.nil)) {
				c[0].memoized.result2.Notifier.On(c[0].stateHandler);
			}
			c[0].memoized.notDoneState = c[0].memoized.result2;
		}
		result3 = c[0].memoized.result3;
		$s = -1; return result3;
		/* */ } return; } } catch(err) { $err = err; $s = -1; } finally { $callDeferred($deferred, $err); if (!$curGoroutine.asleep) { return  result3; } if($curGoroutine.asleep) { if ($f === undefined) { $f = { $blk: filteredCtx.ptr.prototype.refresh }; } $f._r = _r; $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f._tuple = _tuple; $f.c = c; $f.result3 = result3; $f.styles = styles; $f.tasks = tasks; $f.$s = $s; $f.$deferred = $deferred; $f.$r = $r; return $f; } }
	};
	filteredCtx.prototype.refresh = function(styles, tasks) { return this.$val.refresh(styles, tasks); };
	filteredCtx.ptr.prototype.close = function() {
		var c, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; c = $f.c; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		c = this;
		c.Cache.Begin();
		$r = c.Cache.End(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		c.TasksViewStruct.Begin();
		$r = c.TasksViewStruct.End(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		c.controls.FilterStruct.Begin();
		$r = c.controls.FilterStruct.End(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		c.dom.TextEditOStruct.Begin();
		$r = c.dom.TextEditOStruct.End(); /* */ $s = 4; case 4: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		c.dom.VRunStruct.Begin();
		$r = c.dom.VRunStruct.End(); /* */ $s = 5; case 5: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		if (!(c.memoized.result1 === ptrType$4.nil)) {
			c.memoized.result1.Notifier.Off(c.stateHandler);
		}
		if (!(c.memoized.result2 === ptrType$4.nil)) {
			c.memoized.result2.Notifier.Off(c.stateHandler);
		}
		/* */ if (!(c.finalizer === $throwNilPointerError)) { $s = 6; continue; }
		/* */ $s = 7; continue;
		/* if (!(c.finalizer === $throwNilPointerError)) { */ case 6:
			$r = c.finalizer(); /* */ $s = 8; case 8: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* } */ case 7:
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: filteredCtx.ptr.prototype.close }; } $f.c = c; $f.$s = $s; $f.$r = $r; return $f;
	};
	filteredCtx.prototype.close = function() { return this.$val.close(); };
	FilteredTasksStruct.ptr.prototype.Begin = function() {
		var _tmp, _tmp$1, c;
		c = this;
		_tmp = c.current;
		_tmp$1 = $makeMap($emptyInterface.keyFor, []);
		c.old = _tmp;
		c.current = _tmp$1;
	};
	FilteredTasksStruct.prototype.Begin = function() { return this.$val.Begin(); };
	FilteredTasksStruct.ptr.prototype.End = function() {
		var _entry, _i, _keys, _ref, c, ctx, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _entry = $f._entry; _i = $f._i; _keys = $f._keys; _ref = $f._ref; c = $f.c; ctx = $f.ctx; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		c = this;
		_ref = c.old;
		_i = 0;
		_keys = $keys(_ref);
		/* while (true) { */ case 1:
			/* if (!(_i < _keys.length)) { break; } */ if(!(_i < _keys.length)) { $s = 2; continue; }
			_entry = _ref[_keys[_i]];
			if (_entry === undefined) {
				_i++;
				/* continue; */ $s = 1; continue;
			}
			ctx = _entry.v;
			$r = ctx.close(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
			_i++;
		/* } */ $s = 1; continue; case 2:
		c.old = false;
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: FilteredTasksStruct.ptr.prototype.End }; } $f._entry = _entry; $f._i = _i; $f._keys = _keys; $f._ref = _ref; $f.c = c; $f.ctx = ctx; $f.$s = $s; $f.$r = $r; return $f;
	};
	FilteredTasksStruct.prototype.End = function() { return this.$val.End(); };
	FilteredTasksStruct.ptr.prototype.FilteredTasks = function(cKey, styles, tasks) {
		var _entry, _key, _r, _tuple, c, cKey, cOld, ok, result3, styles, tasks, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _entry = $f._entry; _key = $f._key; _r = $f._r; _tuple = $f._tuple; c = $f.c; cKey = $f.cKey; cOld = $f.cOld; ok = $f.ok; result3 = $f.result3; styles = $f.styles; tasks = $f.tasks; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		result3 = $ifaceNil;
		c = this;
		_tuple = (_entry = c.old[$emptyInterface.keyFor(cKey)], _entry !== undefined ? [_entry.v, true] : [ptrType$8.nil, false]);
		cOld = _tuple[0];
		ok = _tuple[1];
		if (ok) {
			delete c.old[$emptyInterface.keyFor(cKey)];
		} else {
			cOld = new filteredCtx.ptr(new core.Cache.ptr(false, false), $throwNilPointerError, new TasksViewStruct.ptr(false, false), false, new core.Handler.ptr($throwNilPointerError), new structType$3.ptr(new controls.FilterStruct.ptr(false, false)), new structType$4.ptr(new dom.TextEditOStruct.ptr(false, false), new dom.VRunStruct.ptr(false, false)), new structType$5.ptr(ptrType$4.nil, ptrType$4.nil, ptrType$4.nil, ptrType$4.nil, $ifaceNil, new dom.Styles.ptr("", new dom.Size.ptr("", 0, 0, 0, 0), new dom.Size.ptr("", 0, 0, 0, 0), "", "", 0, 0, 0), ptrType$6.nil));
		}
		_key = cKey; (c.current || $throwRuntimeError("assignment to entry in nil map"))[$emptyInterface.keyFor(_key)] = { k: _key, v: cOld };
		_r = cOld.refreshIfNeeded($clone(styles, dom.Styles), tasks); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		result3 = _r;
		$s = -1; return result3;
		/* */ } return; } if ($f === undefined) { $f = { $blk: FilteredTasksStruct.ptr.prototype.FilteredTasks }; } $f._entry = _entry; $f._key = _key; $f._r = _r; $f._tuple = _tuple; $f.c = c; $f.cKey = cKey; $f.cOld = cOld; $f.ok = ok; $f.result3 = result3; $f.styles = styles; $f.tasks = tasks; $f.$s = $s; $f.$r = $r; return $f;
	};
	FilteredTasksStruct.prototype.FilteredTasks = function(cKey, styles, tasks) { return this.$val.FilteredTasks(cKey, styles, tasks); };
	taskEditCtx.ptr.prototype.areArgsSame = function(task) {
		var c, task;
		c = this;
		return task === c.memoized.task;
	};
	taskEditCtx.prototype.areArgsSame = function(task) { return this.$val.areArgsSame(task); };
	taskEditCtx.ptr.prototype.refreshIfNeeded = function(task) {
		var _r, c, result1, task, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; c = $f.c; result1 = $f.result1; task = $f.task; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		result1 = $ifaceNil;
		c = this;
		/* */ if (!c.initialized || !c.areArgsSame(task)) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (!c.initialized || !c.areArgsSame(task)) { */ case 1:
			_r = c.refresh(task); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			result1 = _r;
			$s = -1; return result1;
		/* } */ case 2:
		result1 = c.memoized.result1;
		$s = -1; return result1;
		/* */ } return; } if ($f === undefined) { $f = { $blk: taskEditCtx.ptr.prototype.refreshIfNeeded }; } $f._r = _r; $f.c = c; $f.result1 = result1; $f.task = task; $f.$s = $s; $f.$r = $r; return $f;
	};
	taskEditCtx.prototype.refreshIfNeeded = function(task) { return this.$val.refreshIfNeeded(task); };
	taskEditCtx.ptr.prototype.refresh = function(task) {
		var _r, c, result1, task, $s, $deferred, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; c = $f.c; result1 = $f.result1; task = $f.task; $s = $f.$s; $deferred = $f.$deferred; $r = $f.$r; } var $err = null; try { s: while (true) { switch ($s) { case 0: $deferred = []; $deferred.index = $curGoroutine.deferStack.length; $curGoroutine.deferStack.push($deferred);
		c = [c];
		task = [task];
		result1 = $ifaceNil;
		c[0] = this;
		c[0].initialized = true;
		c[0].stateHandler.Handle = (function(c, task) { return function $b() {
			var _r, $s, $r;
			/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
			_r = c[0].refresh(task[0]); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			_r;
			$s = -1; return;
			/* */ } return; } if ($f === undefined) { $f = { $blk: $b }; } $f._r = _r; $f.$s = $s; $f.$r = $r; return $f;
		}; })(c, task);
		c[0].memoized.task = task[0];
		c[0].Cache.Begin();
		$deferred.push([$methodVal(c[0].Cache, "End"), []]);
		c[0].dom.CheckboxEditStruct.Begin();
		$deferred.push([$methodVal(c[0].dom.CheckboxEditStruct, "End"), []]);
		c[0].dom.RunStruct.Begin();
		$deferred.push([$methodVal(c[0].dom.RunStruct, "End"), []]);
		c[0].dom.TextEditStruct.Begin();
		$deferred.push([$methodVal(c[0].dom.TextEditStruct, "End"), []]);
		_r = taskEdit(c[0], task[0]); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		c[0].memoized.result1 = _r;
		result1 = c[0].memoized.result1;
		$s = -1; return result1;
		/* */ } return; } } catch(err) { $err = err; $s = -1; } finally { $callDeferred($deferred, $err); if (!$curGoroutine.asleep) { return  result1; } if($curGoroutine.asleep) { if ($f === undefined) { $f = { $blk: taskEditCtx.ptr.prototype.refresh }; } $f._r = _r; $f.c = c; $f.result1 = result1; $f.task = task; $f.$s = $s; $f.$deferred = $deferred; $f.$r = $r; return $f; } }
	};
	taskEditCtx.prototype.refresh = function(task) { return this.$val.refresh(task); };
	taskEditCtx.ptr.prototype.close = function() {
		var c, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; c = $f.c; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		c = this;
		c.Cache.Begin();
		$r = c.Cache.End(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		c.dom.CheckboxEditStruct.Begin();
		$r = c.dom.CheckboxEditStruct.End(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		c.dom.RunStruct.Begin();
		$r = c.dom.RunStruct.End(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		c.dom.TextEditStruct.Begin();
		$r = c.dom.TextEditStruct.End(); /* */ $s = 4; case 4: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* */ if (!(c.finalizer === $throwNilPointerError)) { $s = 5; continue; }
		/* */ $s = 6; continue;
		/* if (!(c.finalizer === $throwNilPointerError)) { */ case 5:
			$r = c.finalizer(); /* */ $s = 7; case 7: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* } */ case 6:
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: taskEditCtx.ptr.prototype.close }; } $f.c = c; $f.$s = $s; $f.$r = $r; return $f;
	};
	taskEditCtx.prototype.close = function() { return this.$val.close(); };
	TaskEditStruct.ptr.prototype.Begin = function() {
		var _tmp, _tmp$1, c;
		c = this;
		_tmp = c.current;
		_tmp$1 = $makeMap($emptyInterface.keyFor, []);
		c.old = _tmp;
		c.current = _tmp$1;
	};
	TaskEditStruct.prototype.Begin = function() { return this.$val.Begin(); };
	TaskEditStruct.ptr.prototype.End = function() {
		var _entry, _i, _keys, _ref, c, ctx, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _entry = $f._entry; _i = $f._i; _keys = $f._keys; _ref = $f._ref; c = $f.c; ctx = $f.ctx; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		c = this;
		_ref = c.old;
		_i = 0;
		_keys = $keys(_ref);
		/* while (true) { */ case 1:
			/* if (!(_i < _keys.length)) { break; } */ if(!(_i < _keys.length)) { $s = 2; continue; }
			_entry = _ref[_keys[_i]];
			if (_entry === undefined) {
				_i++;
				/* continue; */ $s = 1; continue;
			}
			ctx = _entry.v;
			$r = ctx.close(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
			_i++;
		/* } */ $s = 1; continue; case 2:
		c.old = false;
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: TaskEditStruct.ptr.prototype.End }; } $f._entry = _entry; $f._i = _i; $f._keys = _keys; $f._ref = _ref; $f.c = c; $f.ctx = ctx; $f.$s = $s; $f.$r = $r; return $f;
	};
	TaskEditStruct.prototype.End = function() { return this.$val.End(); };
	TaskEditStruct.ptr.prototype.TaskEdit = function(cKey, task) {
		var _entry, _key, _r, _tuple, c, cKey, cOld, ok, result1, task, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _entry = $f._entry; _key = $f._key; _r = $f._r; _tuple = $f._tuple; c = $f.c; cKey = $f.cKey; cOld = $f.cOld; ok = $f.ok; result1 = $f.result1; task = $f.task; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		result1 = $ifaceNil;
		c = this;
		_tuple = (_entry = c.old[$emptyInterface.keyFor(cKey)], _entry !== undefined ? [_entry.v, true] : [ptrType$9.nil, false]);
		cOld = _tuple[0];
		ok = _tuple[1];
		if (ok) {
			delete c.old[$emptyInterface.keyFor(cKey)];
		} else {
			cOld = new taskEditCtx.ptr(new core.Cache.ptr(false, false), $throwNilPointerError, false, new core.Handler.ptr($throwNilPointerError), new structType$6.ptr(new dom.CheckboxEditStruct.ptr(false, false), new dom.RunStruct.ptr(false, false), new dom.TextEditStruct.ptr(false, false)), new structType$7.ptr($ifaceNil, ptrType$2.nil));
		}
		_key = cKey; (c.current || $throwRuntimeError("assignment to entry in nil map"))[$emptyInterface.keyFor(_key)] = { k: _key, v: cOld };
		_r = cOld.refreshIfNeeded(task); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		result1 = _r;
		$s = -1; return result1;
		/* */ } return; } if ($f === undefined) { $f = { $blk: TaskEditStruct.ptr.prototype.TaskEdit }; } $f._entry = _entry; $f._key = _key; $f._r = _r; $f._tuple = _tuple; $f.c = c; $f.cKey = cKey; $f.cOld = cOld; $f.ok = ok; $f.result1 = result1; $f.task = task; $f.$s = $s; $f.$r = $r; return $f;
	};
	TaskEditStruct.prototype.TaskEdit = function(cKey, task) { return this.$val.TaskEdit(cKey, task); };
	tasksViewCtx.ptr.prototype.areArgsSame = function(styles, showDone, showNotDone, tasks) {
		var c, showDone, showNotDone, styles, tasks;
		c = this;
		if (!($equal(styles, c.memoized.styles, dom.Styles))) {
			return false;
		}
		if (!(showDone === c.memoized.showDone)) {
			return false;
		}
		if (!(showNotDone === c.memoized.showNotDone)) {
			return false;
		}
		return tasks === c.memoized.tasks;
	};
	tasksViewCtx.prototype.areArgsSame = function(styles, showDone, showNotDone, tasks) { return this.$val.areArgsSame(styles, showDone, showNotDone, tasks); };
	tasksViewCtx.ptr.prototype.refreshIfNeeded = function(styles, showDone, showNotDone, tasks) {
		var _r, c, result1, showDone, showNotDone, styles, tasks, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; c = $f.c; result1 = $f.result1; showDone = $f.showDone; showNotDone = $f.showNotDone; styles = $f.styles; tasks = $f.tasks; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		result1 = $ifaceNil;
		c = this;
		/* */ if (!c.initialized || !c.areArgsSame($clone(styles, dom.Styles), showDone, showNotDone, tasks)) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (!c.initialized || !c.areArgsSame($clone(styles, dom.Styles), showDone, showNotDone, tasks)) { */ case 1:
			_r = c.refresh($clone(styles, dom.Styles), showDone, showNotDone, tasks); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			result1 = _r;
			$s = -1; return result1;
		/* } */ case 2:
		result1 = c.memoized.result1;
		$s = -1; return result1;
		/* */ } return; } if ($f === undefined) { $f = { $blk: tasksViewCtx.ptr.prototype.refreshIfNeeded }; } $f._r = _r; $f.c = c; $f.result1 = result1; $f.showDone = showDone; $f.showNotDone = showNotDone; $f.styles = styles; $f.tasks = tasks; $f.$s = $s; $f.$r = $r; return $f;
	};
	tasksViewCtx.prototype.refreshIfNeeded = function(styles, showDone, showNotDone, tasks) { return this.$val.refreshIfNeeded(styles, showDone, showNotDone, tasks); };
	tasksViewCtx.ptr.prototype.refresh = function(styles, showDone, showNotDone, tasks) {
		var _r, _tmp, _tmp$1, _tmp$2, _tmp$3, c, result1, showDone, showNotDone, styles, tasks, $s, $deferred, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; _tmp$2 = $f._tmp$2; _tmp$3 = $f._tmp$3; c = $f.c; result1 = $f.result1; showDone = $f.showDone; showNotDone = $f.showNotDone; styles = $f.styles; tasks = $f.tasks; $s = $f.$s; $deferred = $f.$deferred; $r = $f.$r; } var $err = null; try { s: while (true) { switch ($s) { case 0: $deferred = []; $deferred.index = $curGoroutine.deferStack.length; $curGoroutine.deferStack.push($deferred);
		c = [c];
		showDone = [showDone];
		showNotDone = [showNotDone];
		styles = [styles];
		tasks = [tasks];
		result1 = $ifaceNil;
		c[0] = this;
		c[0].initialized = true;
		c[0].stateHandler.Handle = (function(c, showDone, showNotDone, styles, tasks) { return function $b() {
			var _r, $s, $r;
			/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
			_r = c[0].refresh($clone(styles[0], dom.Styles), showDone[0], showNotDone[0], tasks[0]); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			_r;
			$s = -1; return;
			/* */ } return; } if ($f === undefined) { $f = { $blk: $b }; } $f._r = _r; $f.$s = $s; $f.$r = $r; return $f;
		}; })(c, showDone, showNotDone, styles, tasks);
		_tmp = $clone(styles[0], dom.Styles);
		_tmp$1 = showDone[0];
		_tmp$2 = showNotDone[0];
		_tmp$3 = tasks[0];
		dom.Styles.copy(c[0].memoized.styles, _tmp);
		c[0].memoized.showDone = _tmp$1;
		c[0].memoized.showNotDone = _tmp$2;
		c[0].memoized.tasks = _tmp$3;
		c[0].Cache.Begin();
		$deferred.push([$methodVal(c[0].Cache, "End"), []]);
		c[0].TaskEditStruct.Begin();
		$deferred.push([$methodVal(c[0].TaskEditStruct, "End"), []]);
		c[0].dom.VRunStruct.Begin();
		$deferred.push([$methodVal(c[0].dom.VRunStruct, "End"), []]);
		_r = tasksView(c[0], $clone(styles[0], dom.Styles), showDone[0], showNotDone[0], tasks[0]); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		c[0].memoized.result1 = _r;
		result1 = c[0].memoized.result1;
		$s = -1; return result1;
		/* */ } return; } } catch(err) { $err = err; $s = -1; } finally { $callDeferred($deferred, $err); if (!$curGoroutine.asleep) { return  result1; } if($curGoroutine.asleep) { if ($f === undefined) { $f = { $blk: tasksViewCtx.ptr.prototype.refresh }; } $f._r = _r; $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f._tmp$2 = _tmp$2; $f._tmp$3 = _tmp$3; $f.c = c; $f.result1 = result1; $f.showDone = showDone; $f.showNotDone = showNotDone; $f.styles = styles; $f.tasks = tasks; $f.$s = $s; $f.$deferred = $deferred; $f.$r = $r; return $f; } }
	};
	tasksViewCtx.prototype.refresh = function(styles, showDone, showNotDone, tasks) { return this.$val.refresh(styles, showDone, showNotDone, tasks); };
	tasksViewCtx.ptr.prototype.close = function() {
		var c, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; c = $f.c; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		c = this;
		c.Cache.Begin();
		$r = c.Cache.End(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		c.TaskEditStruct.Begin();
		$r = c.TaskEditStruct.End(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		c.dom.VRunStruct.Begin();
		$r = c.dom.VRunStruct.End(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* */ if (!(c.finalizer === $throwNilPointerError)) { $s = 4; continue; }
		/* */ $s = 5; continue;
		/* if (!(c.finalizer === $throwNilPointerError)) { */ case 4:
			$r = c.finalizer(); /* */ $s = 6; case 6: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* } */ case 5:
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: tasksViewCtx.ptr.prototype.close }; } $f.c = c; $f.$s = $s; $f.$r = $r; return $f;
	};
	tasksViewCtx.prototype.close = function() { return this.$val.close(); };
	TasksViewStruct.ptr.prototype.Begin = function() {
		var _tmp, _tmp$1, c;
		c = this;
		_tmp = c.current;
		_tmp$1 = $makeMap($emptyInterface.keyFor, []);
		c.old = _tmp;
		c.current = _tmp$1;
	};
	TasksViewStruct.prototype.Begin = function() { return this.$val.Begin(); };
	TasksViewStruct.ptr.prototype.End = function() {
		var _entry, _i, _keys, _ref, c, ctx, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _entry = $f._entry; _i = $f._i; _keys = $f._keys; _ref = $f._ref; c = $f.c; ctx = $f.ctx; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		c = this;
		_ref = c.old;
		_i = 0;
		_keys = $keys(_ref);
		/* while (true) { */ case 1:
			/* if (!(_i < _keys.length)) { break; } */ if(!(_i < _keys.length)) { $s = 2; continue; }
			_entry = _ref[_keys[_i]];
			if (_entry === undefined) {
				_i++;
				/* continue; */ $s = 1; continue;
			}
			ctx = _entry.v;
			$r = ctx.close(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
			_i++;
		/* } */ $s = 1; continue; case 2:
		c.old = false;
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: TasksViewStruct.ptr.prototype.End }; } $f._entry = _entry; $f._i = _i; $f._keys = _keys; $f._ref = _ref; $f.c = c; $f.ctx = ctx; $f.$s = $s; $f.$r = $r; return $f;
	};
	TasksViewStruct.prototype.End = function() { return this.$val.End(); };
	TasksViewStruct.ptr.prototype.TasksView = function(cKey, styles, showDone, showNotDone, tasks) {
		var _entry, _key, _r, _tuple, c, cKey, cOld, ok, result1, showDone, showNotDone, styles, tasks, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _entry = $f._entry; _key = $f._key; _r = $f._r; _tuple = $f._tuple; c = $f.c; cKey = $f.cKey; cOld = $f.cOld; ok = $f.ok; result1 = $f.result1; showDone = $f.showDone; showNotDone = $f.showNotDone; styles = $f.styles; tasks = $f.tasks; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		result1 = $ifaceNil;
		c = this;
		_tuple = (_entry = c.old[$emptyInterface.keyFor(cKey)], _entry !== undefined ? [_entry.v, true] : [ptrType$10.nil, false]);
		cOld = _tuple[0];
		ok = _tuple[1];
		if (ok) {
			delete c.old[$emptyInterface.keyFor(cKey)];
		} else {
			cOld = new tasksViewCtx.ptr(new core.Cache.ptr(false, false), $throwNilPointerError, new TaskEditStruct.ptr(false, false), false, new core.Handler.ptr($throwNilPointerError), new structType$8.ptr(new dom.VRunStruct.ptr(false, false)), new structType$9.ptr($ifaceNil, ptrType$4.nil, ptrType$4.nil, new dom.Styles.ptr("", new dom.Size.ptr("", 0, 0, 0, 0), new dom.Size.ptr("", 0, 0, 0, 0), "", "", 0, 0, 0), ptrType$6.nil));
		}
		_key = cKey; (c.current || $throwRuntimeError("assignment to entry in nil map"))[$emptyInterface.keyFor(_key)] = { k: _key, v: cOld };
		_r = cOld.refreshIfNeeded($clone(styles, dom.Styles), showDone, showNotDone, tasks); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		result1 = _r;
		$s = -1; return result1;
		/* */ } return; } if ($f === undefined) { $f = { $blk: TasksViewStruct.ptr.prototype.TasksView }; } $f._entry = _entry; $f._key = _key; $f._r = _r; $f._tuple = _tuple; $f.c = c; $f.cKey = cKey; $f.cOld = cOld; $f.ok = ok; $f.result1 = result1; $f.showDone = showDone; $f.showNotDone = showNotDone; $f.styles = styles; $f.tasks = tasks; $f.$s = $s; $f.$r = $r; return $f;
	};
	TasksViewStruct.prototype.TasksView = function(cKey, styles, showDone, showNotDone, tasks) { return this.$val.TasksView(cKey, styles, showDone, showNotDone, tasks); };
	newID = function() {
		var _r, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_r = $clone(time.Now(), time.Time).Format("15:04:05.000"); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: newID }; } $f._r = _r; $f.$s = $s; $f.$r = $r; return $f;
	};
	taskEdit = function(c, task) {
		var _arg, _arg$1, _arg$2, _r, _r$1, _r$2, _r$3, _r$4, c, desc, done, task, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _arg = $f._arg; _arg$1 = $f._arg$1; _arg$2 = $f._arg$2; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; _r$3 = $f._r$3; _r$4 = $f._r$4; c = $f.c; desc = $f.desc; done = $f.done; task = $f.task; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_r = task.DoneSubstream($clone(c.Cache, core.Cache)); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		done = _r;
		_r$1 = task.DescriptionSubstream($clone(c.Cache, core.Cache)); /* */ $s = 2; case 2: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		desc = _r$1;
		_arg = new dom.Styles.ptr("", new dom.Size.ptr("", 0, 0, 0, 0), new dom.Size.ptr("", 0, 0, 0, 0), "", "", 0, 0, 0);
		_r$2 = c.dom.CheckboxEditStruct.CheckboxEdit(new $String("cb"), new dom.Styles.ptr("", new dom.Size.ptr("", 0, 0, 0, 0), new dom.Size.ptr("", 0, 0, 0, 0), "", "", 0, 0, 0), done, ""); /* */ $s = 3; case 3: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
		_arg$1 = _r$2;
		_r$3 = c.dom.TextEditStruct.TextEdit(new $String("textedit"), new dom.Styles.ptr("", new dom.Size.ptr("", 0, 0, 0, 0), new dom.Size.ptr("", 0, 0, 0, 0), "", "", 0, 0, 0), desc); /* */ $s = 4; case 4: if($c) { $c = false; _r$3 = _r$3.$blk(); } if (_r$3 && _r$3.$blk !== undefined) { break s; }
		_arg$2 = _r$3;
		_r$4 = c.dom.RunStruct.Run(new $String("root"), _arg, new sliceType$3([_arg$1, _arg$2])); /* */ $s = 5; case 5: if($c) { $c = false; _r$4 = _r$4.$blk(); } if (_r$4 && _r$4.$blk !== undefined) { break s; }
		$s = -1; return _r$4;
		/* */ } return; } if ($f === undefined) { $f = { $blk: taskEdit }; } $f._arg = _arg; $f._arg$1 = _arg$1; $f._arg$2 = _arg$2; $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f._r$3 = _r$3; $f._r$4 = _r$4; $f.c = c; $f.desc = desc; $f.done = done; $f.task = task; $f.$s = $s; $f.$r = $r; return $f;
	};
	tasksView = function(c, styles, showDone, showNotDone, tasks) {
		var _arg, _arg$1, _r, _r$1, c, showDone, showNotDone, styles, tasks, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _arg = $f._arg; _arg$1 = $f._arg$1; _r = $f._r; _r$1 = $f._r$1; c = $f.c; showDone = $f.showDone; showNotDone = $f.showNotDone; styles = $f.styles; tasks = $f.tasks; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		c = [c];
		showDone = [showDone];
		showNotDone = [showNotDone];
		tasks = [tasks];
		_arg = $clone(styles, dom.Styles);
		_r = renderTasks(tasks[0].Value, (function(c, showDone, showNotDone, tasks) { return function $b(index, t) {
			var _arg$1, _arg$2, _r, _r$1, index, t, $s, $r;
			/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _arg$1 = $f._arg$1; _arg$2 = $f._arg$2; _r = $f._r; _r$1 = $f._r$1; index = $f.index; t = $f.t; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
			if (t.Done && !showDone[0].Value || !t.Done && !showNotDone[0].Value) {
				$s = -1; return $ifaceNil;
			}
			_arg$1 = new $String(t.ID);
			_r = tasks[0].Substream($clone(c[0].Cache, core.Cache), index); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			_arg$2 = _r;
			_r$1 = c[0].TaskEditStruct.TaskEdit(_arg$1, _arg$2); /* */ $s = 2; case 2: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
			$s = -1; return _r$1;
			/* */ } return; } if ($f === undefined) { $f = { $blk: $b }; } $f._arg$1 = _arg$1; $f._arg$2 = _arg$2; $f._r = _r; $f._r$1 = _r$1; $f.index = index; $f.t = t; $f.$s = $s; $f.$r = $r; return $f;
		}; })(c, showDone, showNotDone, tasks)); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_arg$1 = _r;
		_r$1 = c[0].dom.VRunStruct.VRun(new $String("root"), _arg, _arg$1); /* */ $s = 2; case 2: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		$s = -1; return _r$1;
		/* */ } return; } if ($f === undefined) { $f = { $blk: tasksView }; } $f._arg = _arg; $f._arg$1 = _arg$1; $f._r = _r; $f._r$1 = _r$1; $f.c = c; $f.showDone = showDone; $f.showNotDone = showNotDone; $f.styles = styles; $f.tasks = tasks; $f.$s = $s; $f.$r = $r; return $f;
	};
	renderTasks = function(t, fn) {
		var _i, _r, _ref, elt, fn, kk, result, t, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _i = $f._i; _r = $f._r; _ref = $f._ref; elt = $f.elt; fn = $f.fn; kk = $f.kk; result = $f.result; t = $f.t; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		result = $makeSlice(sliceType$3, t.$length);
		_ref = t;
		_i = 0;
		/* while (true) { */ case 1:
			/* if (!(_i < _ref.$length)) { break; } */ if(!(_i < _ref.$length)) { $s = 2; continue; }
			kk = _i;
			elt = $clone(((_i < 0 || _i >= _ref.$length) ? ($throwRuntimeError("index out of range"), undefined) : _ref.$array[_ref.$offset + _i]), Task);
			_r = fn(kk, $clone(elt, Task)); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			((kk < 0 || kk >= result.$length) ? ($throwRuntimeError("index out of range"), undefined) : result.$array[result.$offset + kk] = _r);
			_i++;
		/* } */ $s = 1; continue; case 2:
		$s = -1; return result;
		/* */ } return; } if ($f === undefined) { $f = { $blk: renderTasks }; } $f._i = _i; $f._r = _r; $f._ref = _ref; $f.elt = elt; $f.fn = fn; $f.kk = kk; $f.result = result; $f.t = t; $f.$s = $s; $f.$r = $r; return $f;
	};
	filteredTasks = function(c, styles, tasks, doneState, notDoneState) {
		var _arg, _arg$1, _arg$2, _arg$3, _r, _r$1, _r$2, _r$3, c, doneState, notDoneState, opt, styles, tasks, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _arg = $f._arg; _arg$1 = $f._arg$1; _arg$2 = $f._arg$2; _arg$3 = $f._arg$3; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; _r$3 = $f._r$3; c = $f.c; doneState = $f.doneState; notDoneState = $f.notDoneState; opt = $f.opt; styles = $f.styles; tasks = $f.tasks; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		if (doneState === ptrType$4.nil) {
			doneState = dom.NewBoolStream(true);
		}
		if (notDoneState === ptrType$4.nil) {
			notDoneState = dom.NewBoolStream(true);
		}
		opt = new dom.TextEditOptions.ptr(new dom.Styles.ptr("", new dom.Size.ptr("", 0, 0, 0, 0), new dom.Size.ptr("", 0, 0, 0, 0), "", "", 0, 0, 0), "Add a task", tasks.addTaskStream($clone(c.Cache, core.Cache)));
		_arg = $clone(styles, dom.Styles);
		_r = c.dom.TextEditOStruct.TextEditO(opt.Text, $clone(opt, dom.TextEditOptions)); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_arg$1 = _r;
		_r$1 = c.controls.FilterStruct.Filter(new $String("f"), doneState, notDoneState); /* */ $s = 2; case 2: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		_arg$2 = _r$1;
		_r$2 = c.TasksViewStruct.TasksView(new $String("tasks"), new dom.Styles.ptr("", new dom.Size.ptr("", 0, 0, 0, 0), new dom.Size.ptr("", 0, 0, 0, 0), "", "", 0, 0, 0), doneState, notDoneState, tasks); /* */ $s = 3; case 3: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
		_arg$3 = _r$2;
		_r$3 = c.dom.VRunStruct.VRun(new $String("root"), _arg, new sliceType$3([_arg$1, _arg$2, _arg$3])); /* */ $s = 4; case 4: if($c) { $c = false; _r$3 = _r$3.$blk(); } if (_r$3 && _r$3.$blk !== undefined) { break s; }
		$s = -1; return [doneState, notDoneState, _r$3];
		/* */ } return; } if ($f === undefined) { $f = { $blk: filteredTasks }; } $f._arg = _arg; $f._arg$1 = _arg$1; $f._arg$2 = _arg$2; $f._arg$3 = _arg$3; $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f._r$3 = _r$3; $f.c = c; $f.doneState = doneState; $f.notDoneState = notDoneState; $f.opt = opt; $f.styles = styles; $f.tasks = tasks; $f.$s = $s; $f.$r = $r; return $f;
	};
	app = function(c, tasksState) {
		var _arg, _arg$1, _arg$2, _arg$3, _arg$4, _r, _r$1, _r$2, _r$3, _r$4, c, root, tasksState, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _arg = $f._arg; _arg$1 = $f._arg$1; _arg$2 = $f._arg$2; _arg$3 = $f._arg$3; _arg$4 = $f._arg$4; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; _r$3 = $f._r$3; _r$4 = $f._r$4; c = $f.c; root = $f.root; tasksState = $f.tasksState; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		if (tasksState === ptrType$6.nil) {
			tasksState = NewTasksStream(new Tasks([new Task.ptr("one", true, "First task"), new Task.ptr("two", false, "Second task")]));
		}
		_r = c.dom.TextViewStruct.TextView(new $String("h"), new dom.Styles.ptr("", new dom.Size.ptr("", 0, 0, 0, 0), new dom.Size.ptr("", 0, 0, 0, 0), "", "", 0, 0, 0), "FUSS TODO"); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_arg = _r;
		_r$1 = c.FilteredTasksStruct.FilteredTasks(new $String("root"), new dom.Styles.ptr("", new dom.Size.ptr("", 0, 0, 0, 0), new dom.Size.ptr("", 0, 0, 0, 0), "", "", 0, 0, 0), tasksState); /* */ $s = 2; case 2: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		_arg$1 = _r$1;
		_arg$2 = new dom.Styles.ptr("", new dom.Size.ptr("", 0, 0, 0, 0), new dom.Size.ptr("", 0, 0, 0, 0), "", "", 0, 0, 0);
		_r$2 = c.dom.TextViewStruct.TextView(new $String("tv"), new dom.Styles.ptr("", new dom.Size.ptr("", 0, 0, 0, 0), new dom.Size.ptr("", 0, 0, 0, 0), "", "", 0, 0, 0), "github"); /* */ $s = 3; case 3: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
		_arg$3 = _r$2;
		_r$3 = c.dom.AStruct.A(new $String("a"), _arg$2, "https://github.com/dotchain/fuss", new sliceType$3([_arg$3])); /* */ $s = 4; case 4: if($c) { $c = false; _r$3 = _r$3.$blk(); } if (_r$3 && _r$3.$blk !== undefined) { break s; }
		_arg$4 = _r$3;
		_r$4 = c.controls.ChromeStruct.Chrome(new $String("root"), _arg, _arg$1, _arg$4); /* */ $s = 5; case 5: if($c) { $c = false; _r$4 = _r$4.$blk(); } if (_r$4 && _r$4.$blk !== undefined) { break s; }
		root = _r$4;
		$s = -1; return [tasksState, root];
		/* */ } return; } if ($f === undefined) { $f = { $blk: app }; } $f._arg = _arg; $f._arg$1 = _arg$1; $f._arg$2 = _arg$2; $f._arg$3 = _arg$3; $f._arg$4 = _arg$4; $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f._r$3 = _r$3; $f._r$4 = _r$4; $f.c = c; $f.root = root; $f.tasksState = tasksState; $f.$s = $s; $f.$r = $r; return $f;
	};
	ptrType$2.methods = [{prop: "Latest", name: "Latest", pkg: "", typ: $funcType([], [ptrType$2], false)}, {prop: "Append", name: "Append", pkg: "", typ: $funcType([changes.Change, Task, $Bool], [ptrType$2], false)}, {prop: "wrapValue", name: "wrapValue", pkg: "github.com/dotchain/fuss/todo", typ: $funcType([$emptyInterface], [changes.Value], false)}, {prop: "unwrapValue", name: "unwrapValue", pkg: "github.com/dotchain/fuss/todo", typ: $funcType([changes.Value], [Task], false)}, {prop: "SetDone", name: "SetDone", pkg: "", typ: $funcType([$Bool], [ptrType$2], false)}, {prop: "DoneSubstream", name: "DoneSubstream", pkg: "", typ: $funcType([core.Cache], [ptrType$4], false)}, {prop: "SetDescription", name: "SetDescription", pkg: "", typ: $funcType([$String], [ptrType$2], false)}, {prop: "DescriptionSubstream", name: "DescriptionSubstream", pkg: "", typ: $funcType([core.Cache], [ptrType], false)}];
	ptrType$6.methods = [{prop: "addTaskStream", name: "addTaskStream", pkg: "github.com/dotchain/fuss/todo", typ: $funcType([core.Cache], [ptrType], false)}, {prop: "Latest", name: "Latest", pkg: "", typ: $funcType([], [ptrType$6], false)}, {prop: "Append", name: "Append", pkg: "", typ: $funcType([changes.Change, Tasks, $Bool], [ptrType$6], false)}, {prop: "wrapValue", name: "wrapValue", pkg: "github.com/dotchain/fuss/todo", typ: $funcType([$emptyInterface], [changes.Value], false)}, {prop: "unwrapValue", name: "unwrapValue", pkg: "github.com/dotchain/fuss/todo", typ: $funcType([changes.Value], [Tasks], false)}, {prop: "Substream", name: "Substream", pkg: "", typ: $funcType([core.Cache, $Int], [ptrType$2], false)}];
	ptrType$7.methods = [{prop: "areArgsSame", name: "areArgsSame", pkg: "github.com/dotchain/fuss/todo", typ: $funcType([], [$Bool], false)}, {prop: "refreshIfNeeded", name: "refreshIfNeeded", pkg: "github.com/dotchain/fuss/todo", typ: $funcType([], [dom.Element], false)}, {prop: "refresh", name: "refresh", pkg: "github.com/dotchain/fuss/todo", typ: $funcType([], [dom.Element], false)}, {prop: "close", name: "close", pkg: "github.com/dotchain/fuss/todo", typ: $funcType([], [], false)}];
	ptrType$11.methods = [{prop: "Begin", name: "Begin", pkg: "", typ: $funcType([], [], false)}, {prop: "End", name: "End", pkg: "", typ: $funcType([], [], false)}, {prop: "App", name: "App", pkg: "", typ: $funcType([$emptyInterface], [dom.Element], false)}];
	ptrType$8.methods = [{prop: "areArgsSame", name: "areArgsSame", pkg: "github.com/dotchain/fuss/todo", typ: $funcType([dom.Styles, ptrType$6], [$Bool], false)}, {prop: "refreshIfNeeded", name: "refreshIfNeeded", pkg: "github.com/dotchain/fuss/todo", typ: $funcType([dom.Styles, ptrType$6], [dom.Element], false)}, {prop: "refresh", name: "refresh", pkg: "github.com/dotchain/fuss/todo", typ: $funcType([dom.Styles, ptrType$6], [dom.Element], false)}, {prop: "close", name: "close", pkg: "github.com/dotchain/fuss/todo", typ: $funcType([], [], false)}];
	ptrType$12.methods = [{prop: "Begin", name: "Begin", pkg: "", typ: $funcType([], [], false)}, {prop: "End", name: "End", pkg: "", typ: $funcType([], [], false)}, {prop: "FilteredTasks", name: "FilteredTasks", pkg: "", typ: $funcType([$emptyInterface, dom.Styles, ptrType$6], [dom.Element], false)}];
	ptrType$9.methods = [{prop: "areArgsSame", name: "areArgsSame", pkg: "github.com/dotchain/fuss/todo", typ: $funcType([ptrType$2], [$Bool], false)}, {prop: "refreshIfNeeded", name: "refreshIfNeeded", pkg: "github.com/dotchain/fuss/todo", typ: $funcType([ptrType$2], [dom.Element], false)}, {prop: "refresh", name: "refresh", pkg: "github.com/dotchain/fuss/todo", typ: $funcType([ptrType$2], [dom.Element], false)}, {prop: "close", name: "close", pkg: "github.com/dotchain/fuss/todo", typ: $funcType([], [], false)}];
	ptrType$13.methods = [{prop: "Begin", name: "Begin", pkg: "", typ: $funcType([], [], false)}, {prop: "End", name: "End", pkg: "", typ: $funcType([], [], false)}, {prop: "TaskEdit", name: "TaskEdit", pkg: "", typ: $funcType([$emptyInterface, ptrType$2], [dom.Element], false)}];
	ptrType$10.methods = [{prop: "areArgsSame", name: "areArgsSame", pkg: "github.com/dotchain/fuss/todo", typ: $funcType([dom.Styles, ptrType$4, ptrType$4, ptrType$6], [$Bool], false)}, {prop: "refreshIfNeeded", name: "refreshIfNeeded", pkg: "github.com/dotchain/fuss/todo", typ: $funcType([dom.Styles, ptrType$4, ptrType$4, ptrType$6], [dom.Element], false)}, {prop: "refresh", name: "refresh", pkg: "github.com/dotchain/fuss/todo", typ: $funcType([dom.Styles, ptrType$4, ptrType$4, ptrType$6], [dom.Element], false)}, {prop: "close", name: "close", pkg: "github.com/dotchain/fuss/todo", typ: $funcType([], [], false)}];
	ptrType$14.methods = [{prop: "Begin", name: "Begin", pkg: "", typ: $funcType([], [], false)}, {prop: "End", name: "End", pkg: "", typ: $funcType([], [], false)}, {prop: "TasksView", name: "TasksView", pkg: "", typ: $funcType([$emptyInterface, dom.Styles, ptrType$4, ptrType$4, ptrType$6], [dom.Element], false)}];
	TaskStream.init("", [{prop: "Notifier", name: "Notifier", embedded: true, exported: true, typ: ptrType$3, tag: ""}, {prop: "Value", name: "Value", embedded: false, exported: true, typ: Task, tag: ""}, {prop: "Change", name: "Change", embedded: false, exported: true, typ: changes.Change, tag: ""}, {prop: "Next", name: "Next", embedded: false, exported: true, typ: ptrType$2, tag: ""}]);
	TasksStream.init("", [{prop: "Notifier", name: "Notifier", embedded: true, exported: true, typ: ptrType$3, tag: ""}, {prop: "Value", name: "Value", embedded: false, exported: true, typ: Tasks, tag: ""}, {prop: "Change", name: "Change", embedded: false, exported: true, typ: changes.Change, tag: ""}, {prop: "Next", name: "Next", embedded: false, exported: true, typ: ptrType$6, tag: ""}]);
	appCtx.init("github.com/dotchain/fuss/todo", [{prop: "Cache", name: "Cache", embedded: true, exported: true, typ: core.Cache, tag: ""}, {prop: "finalizer", name: "finalizer", embedded: false, exported: false, typ: funcType, tag: ""}, {prop: "FilteredTasksStruct", name: "FilteredTasksStruct", embedded: true, exported: true, typ: FilteredTasksStruct, tag: ""}, {prop: "initialized", name: "initialized", embedded: false, exported: false, typ: $Bool, tag: ""}, {prop: "stateHandler", name: "stateHandler", embedded: false, exported: false, typ: core.Handler, tag: ""}, {prop: "controls", name: "controls", embedded: false, exported: false, typ: structType, tag: ""}, {prop: "dom", name: "dom", embedded: false, exported: false, typ: structType$1, tag: ""}, {prop: "memoized", name: "memoized", embedded: false, exported: false, typ: structType$2, tag: ""}]);
	AppStruct.init("github.com/dotchain/fuss/todo", [{prop: "old", name: "old", embedded: false, exported: false, typ: mapType, tag: ""}, {prop: "current", name: "current", embedded: false, exported: false, typ: mapType, tag: ""}]);
	filteredCtx.init("github.com/dotchain/fuss/todo", [{prop: "Cache", name: "Cache", embedded: true, exported: true, typ: core.Cache, tag: ""}, {prop: "finalizer", name: "finalizer", embedded: false, exported: false, typ: funcType, tag: ""}, {prop: "TasksViewStruct", name: "TasksViewStruct", embedded: true, exported: true, typ: TasksViewStruct, tag: ""}, {prop: "initialized", name: "initialized", embedded: false, exported: false, typ: $Bool, tag: ""}, {prop: "stateHandler", name: "stateHandler", embedded: false, exported: false, typ: core.Handler, tag: ""}, {prop: "controls", name: "controls", embedded: false, exported: false, typ: structType$3, tag: ""}, {prop: "dom", name: "dom", embedded: false, exported: false, typ: structType$4, tag: ""}, {prop: "memoized", name: "memoized", embedded: false, exported: false, typ: structType$5, tag: ""}]);
	FilteredTasksStruct.init("github.com/dotchain/fuss/todo", [{prop: "old", name: "old", embedded: false, exported: false, typ: mapType$1, tag: ""}, {prop: "current", name: "current", embedded: false, exported: false, typ: mapType$1, tag: ""}]);
	taskEditCtx.init("github.com/dotchain/fuss/todo", [{prop: "Cache", name: "Cache", embedded: true, exported: true, typ: core.Cache, tag: ""}, {prop: "finalizer", name: "finalizer", embedded: false, exported: false, typ: funcType, tag: ""}, {prop: "initialized", name: "initialized", embedded: false, exported: false, typ: $Bool, tag: ""}, {prop: "stateHandler", name: "stateHandler", embedded: false, exported: false, typ: core.Handler, tag: ""}, {prop: "dom", name: "dom", embedded: false, exported: false, typ: structType$6, tag: ""}, {prop: "memoized", name: "memoized", embedded: false, exported: false, typ: structType$7, tag: ""}]);
	TaskEditStruct.init("github.com/dotchain/fuss/todo", [{prop: "old", name: "old", embedded: false, exported: false, typ: mapType$2, tag: ""}, {prop: "current", name: "current", embedded: false, exported: false, typ: mapType$2, tag: ""}]);
	tasksViewCtx.init("github.com/dotchain/fuss/todo", [{prop: "Cache", name: "Cache", embedded: true, exported: true, typ: core.Cache, tag: ""}, {prop: "finalizer", name: "finalizer", embedded: false, exported: false, typ: funcType, tag: ""}, {prop: "TaskEditStruct", name: "TaskEditStruct", embedded: true, exported: true, typ: TaskEditStruct, tag: ""}, {prop: "initialized", name: "initialized", embedded: false, exported: false, typ: $Bool, tag: ""}, {prop: "stateHandler", name: "stateHandler", embedded: false, exported: false, typ: core.Handler, tag: ""}, {prop: "dom", name: "dom", embedded: false, exported: false, typ: structType$8, tag: ""}, {prop: "memoized", name: "memoized", embedded: false, exported: false, typ: structType$9, tag: ""}]);
	TasksViewStruct.init("github.com/dotchain/fuss/todo", [{prop: "old", name: "old", embedded: false, exported: false, typ: mapType$3, tag: ""}, {prop: "current", name: "current", embedded: false, exported: false, typ: mapType$3, tag: ""}]);
	Task.init("", [{prop: "ID", name: "ID", embedded: false, exported: true, typ: $String, tag: ""}, {prop: "Done", name: "Done", embedded: false, exported: true, typ: $Bool, tag: ""}, {prop: "Description", name: "Description", embedded: false, exported: true, typ: $String, tag: ""}]);
	Tasks.init(Task);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = changes.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = refs.$init(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = core.$init(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = dom.$init(); /* */ $s = 4; case 4: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = controls.$init(); /* */ $s = 5; case 5: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = time.$init(); /* */ $s = 6; case 6: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["main"] = (function() {
	var $pkg = {}, $init, js, todo, main;
	js = $packages["github.com/dotchain/fuss/dom/js"];
	todo = $packages["github.com/dotchain/fuss/todo"];
	main = function() {
		var _r, app, root, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; app = $f.app; root = $f.root; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		app = new todo.AppStruct.ptr(false, false);
		app.Begin();
		_r = app.App(new $String("root")); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		root = _r;
		$r = app.End(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = js.QuerySelector("#container").InsertChild(0, root); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: main }; } $f._r = _r; $f.app = app; $f.root = root; $f.$s = $s; $f.$r = $r; return $f;
	};
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = js.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = todo.$init(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* */ if ($pkg === $mainPkg) { $s = 3; continue; }
		/* */ $s = 4; continue;
		/* if ($pkg === $mainPkg) { */ case 3:
			$r = main(); /* */ $s = 5; case 5: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
			$mainFinished = true;
		/* } */ case 4:
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$synthesizeMethods();
var $mainPkg = $packages["main"];
$packages["runtime"].$init();
$go($mainPkg.$init, []);
$flushConsole();

}).call(this);
//# sourceMappingURL=app.js.map
