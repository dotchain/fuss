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
          if (f.anonymous) {
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
          if (f.anonymous) {
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
    $panic(new $packages["runtime"].TypeAssertionError.ptr("", (value === $ifaceNil ? "" : value.constructor.string), type.string, missingMethod));
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
	Object.init("github.com/gopherjs/gopherjs/js", [{prop: "object", name: "object", anonymous: false, exported: false, typ: ptrType, tag: ""}]);
	Error.init("", [{prop: "Object", name: "Object", anonymous: true, exported: true, typ: ptrType, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		init();
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
	var $pkg = {}, $init, js, sys, TypeAssertionError, errorString, ptrType$4, init, throw$1;
	js = $packages["github.com/gopherjs/gopherjs/js"];
	sys = $packages["runtime/internal/sys"];
	TypeAssertionError = $pkg.TypeAssertionError = $newType(0, $kindStruct, "runtime.TypeAssertionError", true, "runtime", true, function(interfaceString_, concreteString_, assertedString_, missingMethod_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.interfaceString = "";
			this.concreteString = "";
			this.assertedString = "";
			this.missingMethod = "";
			return;
		}
		this.interfaceString = interfaceString_;
		this.concreteString = concreteString_;
		this.assertedString = assertedString_;
		this.missingMethod = missingMethod_;
	});
	errorString = $pkg.errorString = $newType(8, $kindString, "runtime.errorString", true, "runtime", false, null);
	ptrType$4 = $ptrType(TypeAssertionError);
	init = function() {
		var e, jsPkg;
		jsPkg = $packages[$externalize("github.com/gopherjs/gopherjs/js", $String)];
		$jsObjectPtr = jsPkg.Object.ptr;
		$jsErrorPtr = jsPkg.Error.ptr;
		$throwRuntimeError = throw$1;
		e = $ifaceNil;
		e = new TypeAssertionError.ptr("", "", "", "");
		$unused(e);
	};
	throw$1 = function(s) {
		var s;
		$panic(new errorString((s)));
	};
	TypeAssertionError.ptr.prototype.RuntimeError = function() {
	};
	TypeAssertionError.prototype.RuntimeError = function() { return this.$val.RuntimeError(); };
	TypeAssertionError.ptr.prototype.Error = function() {
		var e, inter;
		e = this;
		inter = e.interfaceString;
		if (inter === "") {
			inter = "interface";
		}
		if (e.concreteString === "") {
			return "interface conversion: " + inter + " is nil, not " + e.assertedString;
		}
		if (e.missingMethod === "") {
			return "interface conversion: " + inter + " is " + e.concreteString + ", not " + e.assertedString;
		}
		return "interface conversion: " + e.concreteString + " is not " + e.assertedString + ": missing method " + e.missingMethod;
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
	ptrType$4.methods = [{prop: "RuntimeError", name: "RuntimeError", pkg: "", typ: $funcType([], [], false)}, {prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}];
	errorString.methods = [{prop: "RuntimeError", name: "RuntimeError", pkg: "", typ: $funcType([], [], false)}, {prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}];
	TypeAssertionError.init("runtime", [{prop: "interfaceString", name: "interfaceString", anonymous: false, exported: false, typ: $String, tag: ""}, {prop: "concreteString", name: "concreteString", anonymous: false, exported: false, typ: $String, tag: ""}, {prop: "assertedString", name: "assertedString", anonymous: false, exported: false, typ: $String, tag: ""}, {prop: "missingMethod", name: "missingMethod", anonymous: false, exported: false, typ: $String, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = js.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = sys.$init(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		init();
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
	cacheEntry.init("github.com/dotchain/fuss/core", [{prop: "stream", name: "stream", anonymous: false, exported: false, typ: $emptyInterface, tag: ""}, {prop: "h", name: "h", anonymous: false, exported: false, typ: ptrType$1, tag: ""}, {prop: "close", name: "close", anonymous: false, exported: false, typ: funcType, tag: ""}]);
	Cache.init("github.com/dotchain/fuss/core", [{prop: "old", name: "old", anonymous: false, exported: false, typ: mapType, tag: ""}, {prop: "current", name: "current", anonymous: false, exported: false, typ: mapType, tag: ""}]);
	Notifier.init("github.com/dotchain/fuss/core", [{prop: "handlers", name: "handlers", anonymous: false, exported: false, typ: sliceType, tag: ""}]);
	Handler.init("", [{prop: "Handle", name: "Handle", anonymous: false, exported: true, typ: funcType, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
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
	Atomic.init("", [{prop: "Value", name: "Value", anonymous: false, exported: true, typ: $emptyInterface, tag: ""}]);
	Change.init([{prop: "Merge", name: "Merge", pkg: "", typ: $funcType([Change], [Change, Change], false)}, {prop: "Revert", name: "Revert", pkg: "", typ: $funcType([], [Change], false)}]);
	Custom.init([{prop: "ApplyTo", name: "ApplyTo", pkg: "", typ: $funcType([Context, Value], [Value], false)}, {prop: "Merge", name: "Merge", pkg: "", typ: $funcType([Change], [Change, Change], false)}, {prop: "ReverseMerge", name: "ReverseMerge", pkg: "", typ: $funcType([Change], [Change, Change], false)}, {prop: "Revert", name: "Revert", pkg: "", typ: $funcType([], [Change], false)}]);
	Value.init([{prop: "Apply", name: "Apply", pkg: "", typ: $funcType([Context, Change], [Value], false)}]);
	Collection.init([{prop: "Apply", name: "Apply", pkg: "", typ: $funcType([Context, Change], [Value], false)}, {prop: "ApplyCollection", name: "ApplyCollection", pkg: "", typ: $funcType([Context, Change], [Collection], false)}, {prop: "Count", name: "Count", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Slice", name: "Slice", pkg: "", typ: $funcType([$Int, $Int], [Collection], false)}]);
	ChangeSet.init(Change);
	Context.init([{prop: "Value", name: "Value", pkg: "", typ: $funcType([$emptyInterface], [$emptyInterface], false)}]);
	empty.init("", []);
	Move.init("", [{prop: "Offset", name: "Offset", anonymous: false, exported: true, typ: $Int, tag: ""}, {prop: "Count", name: "Count", anonymous: false, exported: true, typ: $Int, tag: ""}, {prop: "Distance", name: "Distance", anonymous: false, exported: true, typ: $Int, tag: ""}]);
	PathChange.init("", [{prop: "Path", name: "Path", anonymous: false, exported: true, typ: sliceType$2, tag: ""}, {prop: "Change", name: "Change", anonymous: true, exported: true, typ: Change, tag: ""}]);
	Replace.init("", [{prop: "Before", name: "Before", anonymous: false, exported: true, typ: Value, tag: ""}, {prop: "After", name: "After", anonymous: false, exported: true, typ: Value, tag: ""}]);
	Splice.init("", [{prop: "Offset", name: "Offset", anonymous: false, exported: true, typ: $Int, tag: ""}, {prop: "Before", name: "Before", anonymous: false, exported: true, typ: Collection, tag: ""}, {prop: "After", name: "After", anonymous: false, exported: true, typ: Collection, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$pkg.Nil = new empty.ptr();
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["github.com/dotchain/fuss/dom"] = (function() {
	var $pkg = {}, $init, changes, core, Element, Styles, Props, EventHandler, Event, nodeStream, diff, node, BoolStream, TextStream, cbEditCtx, CheckboxEditStruct, nodeCtx, EltStruct, textEditCtx, TextEditStruct, ptrType, sliceType, ptrType$1, ptrType$2, ptrType$3, sliceType$1, sliceType$2, ptrType$4, ptrType$5, ptrType$6, structType, ptrType$7, structType$1, ptrType$8, structType$2, mapType, funcType, ptrType$9, funcType$1, ptrType$10, mapType$1, ptrType$11, mapType$2, ptrType$12, mapType$3, driver, checkboxEdit, NewElement, RegisterDriver, elt, NewBoolStream, NewTextStream, textEdit;
	changes = $packages["github.com/dotchain/dot/changes"];
	core = $packages["github.com/dotchain/fuss/core"];
	Element = $pkg.Element = $newType(8, $kindInterface, "dom.Element", true, "github.com/dotchain/fuss/dom", true, null);
	Styles = $pkg.Styles = $newType(0, $kindStruct, "dom.Styles", true, "github.com/dotchain/fuss/dom", true, function(Color_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Color = "";
			return;
		}
		this.Color = Color_;
	});
	Props = $pkg.Props = $newType(0, $kindStruct, "dom.Props", true, "github.com/dotchain/fuss/dom", true, function(Styles_, Tag_, Checked_, Type_, TextContent_, OnChange_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Styles = new Styles.ptr("");
			this.Tag = "";
			this.Checked = false;
			this.Type = "";
			this.TextContent = "";
			this.OnChange = ptrType.nil;
			return;
		}
		this.Styles = Styles_;
		this.Tag = Tag_;
		this.Checked = Checked_;
		this.Type = Type_;
		this.TextContent = TextContent_;
		this.OnChange = OnChange_;
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
			this.node = new node.ptr($ifaceNil, new Props.ptr(new Styles.ptr(""), "", false, "", "", ptrType.nil));
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
			this.props = new Props.ptr(new Styles.ptr(""), "", false, "", "", ptrType.nil);
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
	cbEditCtx = $pkg.cbEditCtx = $newType(0, $kindStruct, "dom.cbEditCtx", true, "github.com/dotchain/fuss/dom", false, function(Cache_, finalizer_, EltStruct_, initialized_, stateHandler_, memoized_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Cache = new core.Cache.ptr(false, false);
			this.finalizer = $throwNilPointerError;
			this.EltStruct = new EltStruct.ptr(false, false);
			this.initialized = false;
			this.stateHandler = new core.Handler.ptr($throwNilPointerError);
			this.memoized = new structType.ptr(ptrType$4.nil, $ifaceNil, new Styles.ptr(""));
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
			this.memoized = new structType$1.ptr(sliceType.nil, ptrType$1.nil, new Props.ptr(new Styles.ptr(""), "", false, "", "", ptrType.nil), ptrType$1.nil, $ifaceNil);
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
	textEditCtx = $pkg.textEditCtx = $newType(0, $kindStruct, "dom.textEditCtx", true, "github.com/dotchain/fuss/dom", false, function(Cache_, finalizer_, EltStruct_, initialized_, stateHandler_, memoized_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Cache = new core.Cache.ptr(false, false);
			this.finalizer = $throwNilPointerError;
			this.EltStruct = new EltStruct.ptr(false, false);
			this.initialized = false;
			this.stateHandler = new core.Handler.ptr($throwNilPointerError);
			this.memoized = new structType$2.ptr($ifaceNil, new Styles.ptr(""), ptrType$5.nil);
			return;
		}
		this.Cache = Cache_;
		this.finalizer = finalizer_;
		this.EltStruct = EltStruct_;
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
	ptrType = $ptrType(EventHandler);
	sliceType = $sliceType(Element);
	ptrType$1 = $ptrType(nodeStream);
	ptrType$2 = $ptrType(core.Notifier);
	ptrType$3 = $ptrType(core.Handler);
	sliceType$1 = $sliceType(ptrType$3);
	sliceType$2 = $sliceType(diff);
	ptrType$4 = $ptrType(BoolStream);
	ptrType$5 = $ptrType(TextStream);
	ptrType$6 = $ptrType(cbEditCtx);
	structType = $structType("github.com/dotchain/fuss/dom", [{prop: "checked", name: "checked", anonymous: false, exported: false, typ: ptrType$4, tag: ""}, {prop: "result1", name: "result1", anonymous: false, exported: false, typ: Element, tag: ""}, {prop: "styles", name: "styles", anonymous: false, exported: false, typ: Styles, tag: ""}]);
	ptrType$7 = $ptrType(nodeCtx);
	structType$1 = $structType("github.com/dotchain/fuss/dom", [{prop: "children", name: "children", anonymous: false, exported: false, typ: sliceType, tag: ""}, {prop: "lastState", name: "lastState", anonymous: false, exported: false, typ: ptrType$1, tag: ""}, {prop: "props", name: "props", anonymous: false, exported: false, typ: Props, tag: ""}, {prop: "result1", name: "result1", anonymous: false, exported: false, typ: ptrType$1, tag: ""}, {prop: "result2", name: "result2", anonymous: false, exported: false, typ: Element, tag: ""}]);
	ptrType$8 = $ptrType(textEditCtx);
	structType$2 = $structType("github.com/dotchain/fuss/dom", [{prop: "result1", name: "result1", anonymous: false, exported: false, typ: Element, tag: ""}, {prop: "styles", name: "styles", anonymous: false, exported: false, typ: Styles, tag: ""}, {prop: "text", name: "text", anonymous: false, exported: false, typ: ptrType$5, tag: ""}]);
	mapType = $mapType($String, $emptyInterface);
	funcType = $funcType([Event], [], false);
	ptrType$9 = $ptrType(node);
	funcType$1 = $funcType([], [], false);
	ptrType$10 = $ptrType(CheckboxEditStruct);
	mapType$1 = $mapType($emptyInterface, ptrType$6);
	ptrType$11 = $ptrType(EltStruct);
	mapType$2 = $mapType($emptyInterface, ptrType$7);
	ptrType$12 = $ptrType(TextEditStruct);
	mapType$3 = $mapType($emptyInterface, ptrType$8);
	checkboxEdit = function(c, styles, checked) {
		var _r, c, checked, result, styles, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; c = $f.c; checked = $f.checked; result = $f.result; styles = $f.styles; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		checked = [checked];
		result = [result];
		result[0] = $ifaceNil;
		_r = c.EltStruct.Elt(new $String("root"), new Props.ptr($clone(styles, Styles), "input", checked[0].Value, "checkbox", "", new EventHandler.ptr((function(checked, result) { return function $b(param) {
			var _arg, _arg$1, _r, _r$1, param, $s, $r;
			/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _arg = $f._arg; _arg$1 = $f._arg$1; _r = $f._r; _r$1 = $f._r$1; param = $f.param; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
			_arg = $ifaceNil;
			_r = result[0].Value(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			_arg$1 = _r === "on";
			_r$1 = checked[0].Append(_arg, _arg$1, true); /* */ $s = 2; case 2: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
			checked[0] = _r$1;
			$s = -1; return;
			/* */ } return; } if ($f === undefined) { $f = { $blk: $b }; } $f._arg = _arg; $f._arg$1 = _arg$1; $f._r = _r; $f._r$1 = _r$1; $f.param = param; $f.$s = $s; $f.$r = $r; return $f;
		}; })(checked, result))), new sliceType([])); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		result[0] = _r;
		$s = -1; return result[0];
		/* */ } return; } if ($f === undefined) { $f = { $blk: checkboxEdit }; } $f._r = _r; $f.c = c; $f.checked = checked; $f.result = result; $f.styles = styles; $f.$s = $s; $f.$r = $r; return $f;
	};
	NewElement = function(props, children) {
		var _r, children, props, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; children = $f.children; props = $f.props; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_r = driver.NewElement($clone(props, Props), children); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: NewElement }; } $f._r = _r; $f.children = children; $f.props = props; $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.NewElement = NewElement;
	Styles.ptr.prototype.ToCSS = function() {
		var s;
		s = this;
		if (s.Color === "") {
			return "";
		}
		return "color: " + s.Color;
	};
	Styles.prototype.ToCSS = function() { return this.$val.ToCSS(); };
	Props.ptr.prototype.ToMap = function() {
		var p, x;
		p = this;
		return $makeMap($String.keyFor, [{ k: "Tag", v: new $String(p.Tag) }, { k: "Checked", v: new $Bool(p.Checked) }, { k: "Type", v: new $String(p.Type) }, { k: "TextContent", v: new $String(p.TextContent) }, { k: "Styles", v: (x = p.Styles, new x.constructor.elem(x)) }, { k: "OnChange", v: p.OnChange }]);
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
			lastState = new nodeStream.ptr(new core.Notifier.ptr(sliceType$1.nil), new node.ptr($ifaceNil, new Props.ptr(new Styles.ptr(""), "", false, "", "", ptrType.nil)));
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
		_r$1 = e.bestDiff(_r, after, 0, sliceType$2.nil); /* */ $s = 2; case 2: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
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
		choice2 = $appendSlice((sliceType$2.nil), ops);
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
		return new BoolStream.ptr(new core.Notifier.ptr(sliceType$1.nil), value, $ifaceNil, ptrType$4.nil);
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
		return new TextStream.ptr(new core.Notifier.ptr(sliceType$1.nil), value, $ifaceNil, ptrType$5.nil);
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
	cbEditCtx.ptr.prototype.areArgsSame = function(styles, checked) {
		var c, checked, styles;
		c = this;
		if (!($equal(styles, c.memoized.styles, Styles))) {
			return false;
		}
		return checked === c.memoized.checked;
	};
	cbEditCtx.prototype.areArgsSame = function(styles, checked) { return this.$val.areArgsSame(styles, checked); };
	cbEditCtx.ptr.prototype.refreshIfNeeded = function(styles, checked) {
		var _r, c, checked, result1, styles, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; c = $f.c; checked = $f.checked; result1 = $f.result1; styles = $f.styles; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		result1 = $ifaceNil;
		c = this;
		/* */ if (!c.initialized || !c.areArgsSame($clone(styles, Styles), checked)) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (!c.initialized || !c.areArgsSame($clone(styles, Styles), checked)) { */ case 1:
			_r = c.refresh($clone(styles, Styles), checked); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			result1 = _r;
			$s = -1; return result1;
		/* } */ case 2:
		result1 = c.memoized.result1;
		$s = -1; return result1;
		/* */ } return; } if ($f === undefined) { $f = { $blk: cbEditCtx.ptr.prototype.refreshIfNeeded }; } $f._r = _r; $f.c = c; $f.checked = checked; $f.result1 = result1; $f.styles = styles; $f.$s = $s; $f.$r = $r; return $f;
	};
	cbEditCtx.prototype.refreshIfNeeded = function(styles, checked) { return this.$val.refreshIfNeeded(styles, checked); };
	cbEditCtx.ptr.prototype.refresh = function(styles, checked) {
		var _r, _tmp, _tmp$1, c, checked, result1, styles, $s, $deferred, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; c = $f.c; checked = $f.checked; result1 = $f.result1; styles = $f.styles; $s = $f.$s; $deferred = $f.$deferred; $r = $f.$r; } var $err = null; try { s: while (true) { switch ($s) { case 0: $deferred = []; $deferred.index = $curGoroutine.deferStack.length; $curGoroutine.deferStack.push($deferred);
		c = [c];
		checked = [checked];
		styles = [styles];
		result1 = $ifaceNil;
		c[0] = this;
		c[0].initialized = true;
		c[0].stateHandler.Handle = (function(c, checked, styles) { return function $b() {
			var _r, $s, $r;
			/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
			_r = c[0].refresh($clone(styles[0], Styles), checked[0]); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			_r;
			$s = -1; return;
			/* */ } return; } if ($f === undefined) { $f = { $blk: $b }; } $f._r = _r; $f.$s = $s; $f.$r = $r; return $f;
		}; })(c, checked, styles);
		_tmp = $clone(styles[0], Styles);
		_tmp$1 = checked[0];
		Styles.copy(c[0].memoized.styles, _tmp);
		c[0].memoized.checked = _tmp$1;
		c[0].Cache.Begin();
		$deferred.push([$methodVal(c[0].Cache, "End"), []]);
		c[0].EltStruct.Begin();
		$deferred.push([$methodVal(c[0].EltStruct, "End"), []]);
		_r = checkboxEdit(c[0], $clone(styles[0], Styles), checked[0]); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		c[0].memoized.result1 = _r;
		result1 = c[0].memoized.result1;
		$s = -1; return result1;
		/* */ } return; } } catch(err) { $err = err; $s = -1; } finally { $callDeferred($deferred, $err); if (!$curGoroutine.asleep) { return  result1; } if($curGoroutine.asleep) { if ($f === undefined) { $f = { $blk: cbEditCtx.ptr.prototype.refresh }; } $f._r = _r; $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f.c = c; $f.checked = checked; $f.result1 = result1; $f.styles = styles; $f.$s = $s; $f.$deferred = $deferred; $f.$r = $r; return $f; } }
	};
	cbEditCtx.prototype.refresh = function(styles, checked) { return this.$val.refresh(styles, checked); };
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
	CheckboxEditStruct.ptr.prototype.CheckboxEdit = function(cKey, styles, checked) {
		var _entry, _key, _r, _tuple, c, cKey, cOld, checked, ok, result1, styles, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _entry = $f._entry; _key = $f._key; _r = $f._r; _tuple = $f._tuple; c = $f.c; cKey = $f.cKey; cOld = $f.cOld; checked = $f.checked; ok = $f.ok; result1 = $f.result1; styles = $f.styles; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		result1 = $ifaceNil;
		c = this;
		_tuple = (_entry = c.old[$emptyInterface.keyFor(cKey)], _entry !== undefined ? [_entry.v, true] : [ptrType$6.nil, false]);
		cOld = _tuple[0];
		ok = _tuple[1];
		if (ok) {
			delete c.old[$emptyInterface.keyFor(cKey)];
		} else {
			cOld = new cbEditCtx.ptr(new core.Cache.ptr(false, false), $throwNilPointerError, new EltStruct.ptr(false, false), false, new core.Handler.ptr($throwNilPointerError), new structType.ptr(ptrType$4.nil, $ifaceNil, new Styles.ptr("")));
		}
		_key = cKey; (c.current || $throwRuntimeError("assignment to entry in nil map"))[$emptyInterface.keyFor(_key)] = { k: _key, v: cOld };
		_r = cOld.refreshIfNeeded($clone(styles, Styles), checked); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		result1 = _r;
		$s = -1; return result1;
		/* */ } return; } if ($f === undefined) { $f = { $blk: CheckboxEditStruct.ptr.prototype.CheckboxEdit }; } $f._entry = _entry; $f._key = _key; $f._r = _r; $f._tuple = _tuple; $f.c = c; $f.cKey = cKey; $f.cOld = cOld; $f.checked = checked; $f.ok = ok; $f.result1 = result1; $f.styles = styles; $f.$s = $s; $f.$r = $r; return $f;
	};
	CheckboxEditStruct.prototype.CheckboxEdit = function(cKey, styles, checked) { return this.$val.CheckboxEdit(cKey, styles, checked); };
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
		_tuple = (_entry = c.old[$emptyInterface.keyFor(cKey)], _entry !== undefined ? [_entry.v, true] : [ptrType$7.nil, false]);
		cOld = _tuple[0];
		ok = _tuple[1];
		if (ok) {
			delete c.old[$emptyInterface.keyFor(cKey)];
		} else {
			cOld = new nodeCtx.ptr(new core.Cache.ptr(false, false), $throwNilPointerError, false, new core.Handler.ptr($throwNilPointerError), new structType$1.ptr(sliceType.nil, ptrType$1.nil, new Props.ptr(new Styles.ptr(""), "", false, "", "", ptrType.nil), ptrType$1.nil, $ifaceNil));
		}
		_key = cKey; (c.current || $throwRuntimeError("assignment to entry in nil map"))[$emptyInterface.keyFor(_key)] = { k: _key, v: cOld };
		_r = cOld.refreshIfNeeded($clone(props, Props), children); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		result2 = _r;
		$s = -1; return result2;
		/* */ } return; } if ($f === undefined) { $f = { $blk: EltStruct.ptr.prototype.Elt }; } $f._entry = _entry; $f._key = _key; $f._r = _r; $f._tuple = _tuple; $f.c = c; $f.cKey = cKey; $f.cOld = cOld; $f.children = children; $f.ok = ok; $f.props = props; $f.result2 = result2; $f.$s = $s; $f.$r = $r; return $f;
	};
	EltStruct.prototype.Elt = function(cKey, props, children) { return this.$val.Elt(cKey, props, children); };
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
		c[0].EltStruct.Begin();
		$deferred.push([$methodVal(c[0].EltStruct, "End"), []]);
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
		c.EltStruct.Begin();
		$r = c.EltStruct.End(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
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
		_tuple = (_entry = c.old[$emptyInterface.keyFor(cKey)], _entry !== undefined ? [_entry.v, true] : [ptrType$8.nil, false]);
		cOld = _tuple[0];
		ok = _tuple[1];
		if (ok) {
			delete c.old[$emptyInterface.keyFor(cKey)];
		} else {
			cOld = new textEditCtx.ptr(new core.Cache.ptr(false, false), $throwNilPointerError, new EltStruct.ptr(false, false), false, new core.Handler.ptr($throwNilPointerError), new structType$2.ptr($ifaceNil, new Styles.ptr(""), ptrType$5.nil));
		}
		_key = cKey; (c.current || $throwRuntimeError("assignment to entry in nil map"))[$emptyInterface.keyFor(_key)] = { k: _key, v: cOld };
		_r = cOld.refreshIfNeeded($clone(styles, Styles), text); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		result1 = _r;
		$s = -1; return result1;
		/* */ } return; } if ($f === undefined) { $f = { $blk: TextEditStruct.ptr.prototype.TextEdit }; } $f._entry = _entry; $f._key = _key; $f._r = _r; $f._tuple = _tuple; $f.c = c; $f.cKey = cKey; $f.cOld = cOld; $f.ok = ok; $f.result1 = result1; $f.styles = styles; $f.text = text; $f.$s = $s; $f.$r = $r; return $f;
	};
	TextEditStruct.prototype.TextEdit = function(cKey, styles, text) { return this.$val.TextEdit(cKey, styles, text); };
	textEdit = function(c, styles, text) {
		var _r, c, result, styles, text, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; c = $f.c; result = $f.result; styles = $f.styles; text = $f.text; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		result = [result];
		text = [text];
		result[0] = $ifaceNil;
		_r = c.EltStruct.Elt(new $String("root"), new Props.ptr($clone(styles, Styles), "input", false, "text", text[0].Value, new EventHandler.ptr((function(result, text) { return function $b(param) {
			var _arg, _arg$1, _r, _r$1, param, $s, $r;
			/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _arg = $f._arg; _arg$1 = $f._arg$1; _r = $f._r; _r$1 = $f._r$1; param = $f.param; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
			_arg = $ifaceNil;
			_r = result[0].Value(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			_arg$1 = _r;
			_r$1 = text[0].Append(_arg, _arg$1, true); /* */ $s = 2; case 2: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
			text[0] = _r$1;
			$s = -1; return;
			/* */ } return; } if ($f === undefined) { $f = { $blk: $b }; } $f._arg = _arg; $f._arg$1 = _arg$1; $f._r = _r; $f._r$1 = _r$1; $f.param = param; $f.$s = $s; $f.$r = $r; return $f;
		}; })(result, text))), new sliceType([])); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		result[0] = _r;
		$s = -1; return result[0];
		/* */ } return; } if ($f === undefined) { $f = { $blk: textEdit }; } $f._r = _r; $f.c = c; $f.result = result; $f.styles = styles; $f.text = text; $f.$s = $s; $f.$r = $r; return $f;
	};
	Styles.methods = [{prop: "ToCSS", name: "ToCSS", pkg: "", typ: $funcType([], [$String], false)}];
	Props.methods = [{prop: "ToMap", name: "ToMap", pkg: "", typ: $funcType([], [mapType], false)}];
	ptrType$1.methods = [{prop: "Latest", name: "Latest", pkg: "", typ: $funcType([], [ptrType$1], false)}];
	ptrType$9.methods = [{prop: "reconcile", name: "reconcile", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([Props, sliceType], [Element], false)}, {prop: "filterNil", name: "filterNil", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([sliceType], [sliceType], false)}, {prop: "updateChildren", name: "updateChildren", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([sliceType], [], false)}, {prop: "bestDiff", name: "bestDiff", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([sliceType, sliceType, $Int, sliceType$2], [sliceType$2], false)}, {prop: "chooseDiff", name: "chooseDiff", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([sliceType, sliceType, $Int, sliceType$2], [sliceType$2], false)}, {prop: "indexOf", name: "indexOf", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([Element, sliceType], [$Int], false)}];
	ptrType$4.methods = [{prop: "Latest", name: "Latest", pkg: "", typ: $funcType([], [ptrType$4], false)}, {prop: "Append", name: "Append", pkg: "", typ: $funcType([changes.Change, $Bool, $Bool], [ptrType$4], false)}, {prop: "wrapValue", name: "wrapValue", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([$emptyInterface], [changes.Value], false)}, {prop: "unwrapValue", name: "unwrapValue", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([changes.Value], [$Bool], false)}];
	ptrType$5.methods = [{prop: "Latest", name: "Latest", pkg: "", typ: $funcType([], [ptrType$5], false)}, {prop: "Append", name: "Append", pkg: "", typ: $funcType([changes.Change, $String, $Bool], [ptrType$5], false)}, {prop: "wrapValue", name: "wrapValue", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([$emptyInterface], [changes.Value], false)}, {prop: "unwrapValue", name: "unwrapValue", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([changes.Value], [$String], false)}];
	ptrType$6.methods = [{prop: "areArgsSame", name: "areArgsSame", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([Styles, ptrType$4], [$Bool], false)}, {prop: "refreshIfNeeded", name: "refreshIfNeeded", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([Styles, ptrType$4], [Element], false)}, {prop: "refresh", name: "refresh", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([Styles, ptrType$4], [Element], false)}, {prop: "close", name: "close", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([], [], false)}];
	ptrType$10.methods = [{prop: "Begin", name: "Begin", pkg: "", typ: $funcType([], [], false)}, {prop: "End", name: "End", pkg: "", typ: $funcType([], [], false)}, {prop: "CheckboxEdit", name: "CheckboxEdit", pkg: "", typ: $funcType([$emptyInterface, Styles, ptrType$4], [Element], false)}];
	ptrType$7.methods = [{prop: "areArgsSame", name: "areArgsSame", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([Props, sliceType], [$Bool], false)}, {prop: "refreshIfNeeded", name: "refreshIfNeeded", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([Props, sliceType], [Element], false)}, {prop: "refresh", name: "refresh", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([Props, sliceType], [Element], false)}, {prop: "close", name: "close", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([], [], false)}];
	ptrType$11.methods = [{prop: "Begin", name: "Begin", pkg: "", typ: $funcType([], [], false)}, {prop: "End", name: "End", pkg: "", typ: $funcType([], [], false)}, {prop: "Elt", name: "Elt", pkg: "", typ: $funcType([$emptyInterface, Props, sliceType], [Element], true)}];
	ptrType$8.methods = [{prop: "areArgsSame", name: "areArgsSame", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([Styles, ptrType$5], [$Bool], false)}, {prop: "refreshIfNeeded", name: "refreshIfNeeded", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([Styles, ptrType$5], [Element], false)}, {prop: "refresh", name: "refresh", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([Styles, ptrType$5], [Element], false)}, {prop: "close", name: "close", pkg: "github.com/dotchain/fuss/dom", typ: $funcType([], [], false)}];
	ptrType$12.methods = [{prop: "Begin", name: "Begin", pkg: "", typ: $funcType([], [], false)}, {prop: "End", name: "End", pkg: "", typ: $funcType([], [], false)}, {prop: "TextEdit", name: "TextEdit", pkg: "", typ: $funcType([$emptyInterface, Styles, ptrType$5], [Element], false)}];
	Element.init([{prop: "Children", name: "Children", pkg: "", typ: $funcType([], [sliceType], false)}, {prop: "Close", name: "Close", pkg: "", typ: $funcType([], [], false)}, {prop: "InsertChild", name: "InsertChild", pkg: "", typ: $funcType([$Int, Element], [], false)}, {prop: "RemoveChild", name: "RemoveChild", pkg: "", typ: $funcType([$Int], [], false)}, {prop: "SetProp", name: "SetProp", pkg: "", typ: $funcType([$String, $emptyInterface], [], false)}, {prop: "Value", name: "Value", pkg: "", typ: $funcType([], [$String], false)}]);
	Styles.init("", [{prop: "Color", name: "Color", anonymous: false, exported: true, typ: $String, tag: ""}]);
	Props.init("", [{prop: "Styles", name: "Styles", anonymous: true, exported: true, typ: Styles, tag: ""}, {prop: "Tag", name: "Tag", anonymous: false, exported: true, typ: $String, tag: ""}, {prop: "Checked", name: "Checked", anonymous: false, exported: true, typ: $Bool, tag: ""}, {prop: "Type", name: "Type", anonymous: false, exported: true, typ: $String, tag: ""}, {prop: "TextContent", name: "TextContent", anonymous: false, exported: true, typ: $String, tag: ""}, {prop: "OnChange", name: "OnChange", anonymous: false, exported: true, typ: ptrType, tag: ""}]);
	EventHandler.init("", [{prop: "Handle", name: "Handle", anonymous: false, exported: true, typ: funcType, tag: ""}]);
	Event.init("", []);
	nodeStream.init("github.com/dotchain/fuss/dom", [{prop: "Notifier", name: "Notifier", anonymous: true, exported: true, typ: ptrType$2, tag: ""}, {prop: "node", name: "node", anonymous: true, exported: false, typ: node, tag: ""}]);
	diff.init("github.com/dotchain/fuss/dom", [{prop: "insert", name: "insert", anonymous: false, exported: false, typ: $Bool, tag: ""}, {prop: "elt", name: "elt", anonymous: false, exported: false, typ: Element, tag: ""}, {prop: "index", name: "index", anonymous: false, exported: false, typ: $Int, tag: ""}]);
	node.init("github.com/dotchain/fuss/dom", [{prop: "root", name: "root", anonymous: false, exported: false, typ: Element, tag: ""}, {prop: "props", name: "props", anonymous: false, exported: false, typ: Props, tag: ""}]);
	BoolStream.init("", [{prop: "Notifier", name: "Notifier", anonymous: true, exported: true, typ: ptrType$2, tag: ""}, {prop: "Value", name: "Value", anonymous: false, exported: true, typ: $Bool, tag: ""}, {prop: "Change", name: "Change", anonymous: false, exported: true, typ: changes.Change, tag: ""}, {prop: "Next", name: "Next", anonymous: false, exported: true, typ: ptrType$4, tag: ""}]);
	TextStream.init("", [{prop: "Notifier", name: "Notifier", anonymous: true, exported: true, typ: ptrType$2, tag: ""}, {prop: "Value", name: "Value", anonymous: false, exported: true, typ: $String, tag: ""}, {prop: "Change", name: "Change", anonymous: false, exported: true, typ: changes.Change, tag: ""}, {prop: "Next", name: "Next", anonymous: false, exported: true, typ: ptrType$5, tag: ""}]);
	cbEditCtx.init("github.com/dotchain/fuss/dom", [{prop: "Cache", name: "Cache", anonymous: true, exported: true, typ: core.Cache, tag: ""}, {prop: "finalizer", name: "finalizer", anonymous: false, exported: false, typ: funcType$1, tag: ""}, {prop: "EltStruct", name: "EltStruct", anonymous: true, exported: true, typ: EltStruct, tag: ""}, {prop: "initialized", name: "initialized", anonymous: false, exported: false, typ: $Bool, tag: ""}, {prop: "stateHandler", name: "stateHandler", anonymous: false, exported: false, typ: core.Handler, tag: ""}, {prop: "memoized", name: "memoized", anonymous: false, exported: false, typ: structType, tag: ""}]);
	CheckboxEditStruct.init("github.com/dotchain/fuss/dom", [{prop: "old", name: "old", anonymous: false, exported: false, typ: mapType$1, tag: ""}, {prop: "current", name: "current", anonymous: false, exported: false, typ: mapType$1, tag: ""}]);
	nodeCtx.init("github.com/dotchain/fuss/dom", [{prop: "Cache", name: "Cache", anonymous: true, exported: true, typ: core.Cache, tag: ""}, {prop: "finalizer", name: "finalizer", anonymous: false, exported: false, typ: funcType$1, tag: ""}, {prop: "initialized", name: "initialized", anonymous: false, exported: false, typ: $Bool, tag: ""}, {prop: "stateHandler", name: "stateHandler", anonymous: false, exported: false, typ: core.Handler, tag: ""}, {prop: "memoized", name: "memoized", anonymous: false, exported: false, typ: structType$1, tag: ""}]);
	EltStruct.init("github.com/dotchain/fuss/dom", [{prop: "old", name: "old", anonymous: false, exported: false, typ: mapType$2, tag: ""}, {prop: "current", name: "current", anonymous: false, exported: false, typ: mapType$2, tag: ""}]);
	textEditCtx.init("github.com/dotchain/fuss/dom", [{prop: "Cache", name: "Cache", anonymous: true, exported: true, typ: core.Cache, tag: ""}, {prop: "finalizer", name: "finalizer", anonymous: false, exported: false, typ: funcType$1, tag: ""}, {prop: "EltStruct", name: "EltStruct", anonymous: true, exported: true, typ: EltStruct, tag: ""}, {prop: "initialized", name: "initialized", anonymous: false, exported: false, typ: $Bool, tag: ""}, {prop: "stateHandler", name: "stateHandler", anonymous: false, exported: false, typ: core.Handler, tag: ""}, {prop: "memoized", name: "memoized", anonymous: false, exported: false, typ: structType$2, tag: ""}]);
	TextEditStruct.init("github.com/dotchain/fuss/dom", [{prop: "old", name: "old", anonymous: false, exported: false, typ: mapType$3, tag: ""}, {prop: "current", name: "current", anonymous: false, exported: false, typ: mapType$3, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = changes.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = core.$init(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		driver = $ifaceNil;
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
	errorString.init("errors", [{prop: "s", name: "s", anonymous: false, exported: false, typ: $String, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
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
	Pool.init("sync", [{prop: "local", name: "local", anonymous: false, exported: false, typ: $UnsafePointer, tag: ""}, {prop: "localSize", name: "localSize", anonymous: false, exported: false, typ: $Uintptr, tag: ""}, {prop: "store", name: "store", anonymous: false, exported: false, typ: sliceType$4, tag: ""}, {prop: "New", name: "New", anonymous: false, exported: true, typ: funcType, tag: ""}]);
	Mutex.init("sync", [{prop: "state", name: "state", anonymous: false, exported: false, typ: $Int32, tag: ""}, {prop: "sema", name: "sema", anonymous: false, exported: false, typ: $Uint32, tag: ""}]);
	poolLocalInternal.init("sync", [{prop: "private$0", name: "private", anonymous: false, exported: false, typ: $emptyInterface, tag: ""}, {prop: "shared", name: "shared", anonymous: false, exported: false, typ: sliceType$4, tag: ""}, {prop: "Mutex", name: "Mutex", anonymous: true, exported: true, typ: Mutex, tag: ""}]);
	poolLocal.init("sync", [{prop: "poolLocalInternal", name: "poolLocalInternal", anonymous: true, exported: false, typ: poolLocalInternal, tag: ""}, {prop: "pad", name: "pad", anonymous: false, exported: false, typ: arrayType$2, tag: ""}]);
	notifyList.init("sync", [{prop: "wait", name: "wait", anonymous: false, exported: false, typ: $Uint32, tag: ""}, {prop: "notify", name: "notify", anonymous: false, exported: false, typ: $Uint32, tag: ""}, {prop: "lock", name: "lock", anonymous: false, exported: false, typ: $Uintptr, tag: ""}, {prop: "head", name: "head", anonymous: false, exported: false, typ: $UnsafePointer, tag: ""}, {prop: "tail", name: "tail", anonymous: false, exported: false, typ: $UnsafePointer, tag: ""}]);
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
		var _case, _q, caseRange, cr, delta, hi, lo, m, r, x;
		if (_case < 0 || 3 <= _case) {
			return 65533;
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
					return ((cr.Lo >> 0)) + ((((((r - ((cr.Lo >> 0)) >> 0)) & ~1) >> 0) | (((_case & 1) >> 0)))) >> 0;
				}
				return r + delta >> 0;
			}
			if (r < ((cr.Lo >> 0))) {
				hi = m;
			} else {
				lo = m + 1 >> 0;
			}
		}
		return r;
	};
	To = function(_case, r) {
		var _case, r;
		return to(_case, r, $pkg.CaseRanges);
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
	CaseRange.init("", [{prop: "Lo", name: "Lo", anonymous: false, exported: true, typ: $Uint32, tag: ""}, {prop: "Hi", name: "Hi", anonymous: false, exported: true, typ: $Uint32, tag: ""}, {prop: "Delta", name: "Delta", anonymous: false, exported: true, typ: d, tag: ""}]);
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
	acceptRange.init("unicode/utf8", [{prop: "lo", name: "lo", anonymous: false, exported: false, typ: $Uint8, tag: ""}, {prop: "hi", name: "hi", anonymous: false, exported: false, typ: $Uint8, tag: ""}]);
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
$packages["strings"] = (function() {
	var $pkg = {}, $init, errors, js, io, unicode, utf8, sliceType, Map, ToLower;
	errors = $packages["errors"];
	js = $packages["github.com/gopherjs/gopherjs/js"];
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
		$r = io.$init(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = unicode.$init(); /* */ $s = 4; case 4: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = utf8.$init(); /* */ $s = 5; case 5: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["github.com/dotchain/fuss/dom/js"] = (function() {
	var $pkg = {}, $init, dom, js, strings, driver, cbInfo, element, ptrType, sliceType, ptrType$1, ptrType$2, funcType, ptrType$3, init, get, listener;
	dom = $packages["github.com/dotchain/fuss/dom"];
	js = $packages["github.com/gopherjs/gopherjs/js"];
	strings = $packages["strings"];
	driver = $pkg.driver = $newType(0, $kindStruct, "js.driver", true, "github.com/dotchain/fuss/dom/js", false, function(OnChange_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.OnChange = null;
			return;
		}
		this.OnChange = OnChange_;
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
			this.d = ptrType$3.nil;
			return;
		}
		this.n = n_;
		this.d = d_;
	});
	ptrType = $ptrType(dom.EventHandler);
	sliceType = $sliceType(dom.Element);
	ptrType$1 = $ptrType(cbInfo);
	ptrType$2 = $ptrType(js.Object);
	funcType = $funcType([ptrType$2], [], false);
	ptrType$3 = $ptrType(driver);
	init = function() {
		var x;
		dom.RegisterDriver((x = new driver.ptr(new ($global.Map)()), new x.constructor.elem(x)));
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
		var _1, _r, _r$1, _r$2, e, key, tag, value, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _1 = $f._1; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; e = $f.e; key = $f.key; tag = $f.tag; value = $f.value; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		e = this;
			_1 = key;
			/* */ if (_1 === ("Tag")) { $s = 2; continue; }
			/* */ if (_1 === ("Checked")) { $s = 3; continue; }
			/* */ if (_1 === ("Type")) { $s = 4; continue; }
			/* */ if (_1 === ("TextContent")) { $s = 5; continue; }
			/* */ if (_1 === ("Styles")) { $s = 6; continue; }
			/* */ if (_1 === ("OnChange")) { $s = 7; continue; }
			/* */ $s = 8; continue;
			/* if (_1 === ("Tag")) { */ case 2:
				_r = strings.ToLower($assertType(value, $String)); /* */ $s = 10; case 10: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
				tag = _r;
				if (tag === "") {
					tag = "div";
				}
				_r$1 = strings.ToLower($internalize(e.n.tagName, $String)); /* */ $s = 13; case 13: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
				/* */ if (!(tag === _r$1)) { $s = 11; continue; }
				/* */ $s = 12; continue;
				/* if (!(tag === _r$1)) { */ case 11:
					$panic(new $String("Cannot change the tag of an element: " + tag));
				/* } */ case 12:
				$s = 9; continue;
			/* } else if (_1 === ("Checked")) { */ case 3:
				e.n.checked = $externalize($assertType(value, $Bool), $Bool);
				$s = 9; continue;
			/* } else if (_1 === ("Type")) { */ case 4:
				e.n.setAttribute($externalize("type", $String), $externalize($assertType(value, $String), $String));
				$s = 9; continue;
			/* } else if (_1 === ("TextContent")) { */ case 5:
				_r$2 = strings.ToLower($internalize(e.n.tagName, $String)); /* */ $s = 17; case 17: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
				/* */ if (_r$2 === "input") { $s = 14; continue; }
				/* */ $s = 15; continue;
				/* if (_r$2 === "input") { */ case 14:
					e.n.value = $externalize($assertType(value, $String), $String);
					$s = 16; continue;
				/* } else { */ case 15:
					e.n.textContent = $externalize($assertType(value, $String), $String);
				/* } */ case 16:
				$s = 9; continue;
			/* } else if (_1 === ("Styles")) { */ case 6:
				e.n.setAttribute($externalize("style", $String), $externalize($clone($assertType(value, dom.Styles), dom.Styles).ToCSS(), $String));
				$s = 9; continue;
			/* } else if (_1 === ("OnChange")) { */ case 7:
				$clone(e, element).onChange($assertType(value, ptrType));
				$s = 9; continue;
			/* } else { */ case 8:
				$panic(new $String("Unknown key: " + key));
			/* } */ case 9:
		case 1:
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: element.ptr.prototype.SetProp }; } $f._1 = _1; $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f.e = e; $f.key = key; $f.tag = tag; $f.value = value; $f.$s = $s; $f.$r = $r; return $f;
	};
	element.prototype.SetProp = function(key, value) { return this.$val.SetProp(key, value); };
	element.ptr.prototype.onChange = function(h) {
		var _tuple, e, h, info, listener$1, ok;
		e = this;
		_tuple = get(e.d.OnChange, e.n);
		info = _tuple[0];
		ok = _tuple[1];
		if (!ok && !(h === ptrType.nil)) {
			listener$1 = listener(e.n, e.d);
			e.n.addEventListener($externalize("change", $String), listener$1, $externalize(false, $Bool));
			e.d.OnChange.set(e.n, new cbInfo.ptr(h, listener$1));
		} else if (ok && h === ptrType.nil) {
			e.d.OnChange.delete(e.n);
			console.log(e.n, "remove", info.listener);
			e.n.removeEventListener($externalize("change", $String), info.listener);
		} else if (ok && !(h === ptrType.nil)) {
			info.EventHandler = h;
		}
	};
	element.prototype.onChange = function(h) { return this.$val.onChange(h); };
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
		var e;
		e = this;
		$clone(e, element).onChange(ptrType.nil);
	};
	element.prototype.Close = function() { return this.$val.Close(); };
	element.ptr.prototype.DOMNode = function() {
		var e;
		e = this;
		return e.n;
	};
	element.prototype.DOMNode = function() { return this.$val.DOMNode(); };
	get = function(m, key) {
		var jso, key, m, ok;
		ok = !!(m.has(key));
		if (!ok) {
			return [ptrType$1.nil, false];
		}
		jso = m.get(key);
		return [($pointerOfStructConversion((jso), ptrType$1)), true];
	};
	listener = function(n, d) {
		var d, n;
		return (function $b(param) {
			var _tuple, info, ok, param, $s, $r;
			/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _tuple = $f._tuple; info = $f.info; ok = $f.ok; param = $f.param; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
			_tuple = get(d.OnChange, n);
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
	driver.methods = [{prop: "NewElement", name: "NewElement", pkg: "", typ: $funcType([dom.Props, sliceType], [dom.Element], true)}];
	element.methods = [{prop: "SetProp", name: "SetProp", pkg: "", typ: $funcType([$String, $emptyInterface], [], false)}, {prop: "onChange", name: "onChange", pkg: "github.com/dotchain/fuss/dom/js", typ: $funcType([ptrType], [], false)}, {prop: "Value", name: "Value", pkg: "", typ: $funcType([], [$String], false)}, {prop: "SetValue", name: "SetValue", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Children", name: "Children", pkg: "", typ: $funcType([], [sliceType], false)}, {prop: "RemoveChild", name: "RemoveChild", pkg: "", typ: $funcType([$Int], [], false)}, {prop: "InsertChild", name: "InsertChild", pkg: "", typ: $funcType([$Int, dom.Element], [], false)}, {prop: "Close", name: "Close", pkg: "", typ: $funcType([], [], false)}, {prop: "DOMNode", name: "DOMNode", pkg: "", typ: $funcType([], [ptrType$2], false)}];
	driver.init("", [{prop: "OnChange", name: "OnChange", anonymous: false, exported: true, typ: ptrType$2, tag: ""}]);
	cbInfo.init("github.com/dotchain/fuss/dom/js", [{prop: "EventHandler", name: "EventHandler", anonymous: true, exported: true, typ: ptrType, tag: ""}, {prop: "listener", name: "listener", anonymous: false, exported: false, typ: funcType, tag: ""}]);
	element.init("github.com/dotchain/fuss/dom/js", [{prop: "n", name: "n", anonymous: false, exported: false, typ: ptrType$2, tag: ""}, {prop: "d", name: "d", anonymous: false, exported: false, typ: ptrType$3, tag: ""}]);
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
	MergeResult.init("", [{prop: "P", name: "P", anonymous: false, exported: true, typ: sliceType, tag: ""}, {prop: "Scoped", name: "Scoped", anonymous: false, exported: true, typ: changes.Change, tag: ""}, {prop: "Affected", name: "Affected", anonymous: false, exported: true, typ: changes.Change, tag: ""}, {prop: "Unaffected", name: "Unaffected", anonymous: false, exported: true, typ: changes.Change, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = changes.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["github.com/dotchain/fuss/todo"] = (function() {
	var $pkg = {}, $init, changes, refs, core, dom, TaskStream, TasksStream, appCtx, AppStruct, taskEditCtx, TaskEditStruct, tasksViewCtx, TasksViewStruct, Task, Tasks, ptrType, sliceType, ptrType$1, ptrType$2, sliceType$1, ptrType$3, ptrType$4, ptrType$5, ptrType$6, sliceType$2, ptrType$7, structType, structType$1, ptrType$8, structType$2, structType$3, ptrType$9, structType$4, structType$5, ptrType$10, sliceType$3, ptrType$11, mapType, ptrType$12, mapType$1, ptrType$13, mapType$2, NewTaskStream, NewTasksStream, taskEdit, tasksView, renderTasks, app;
	changes = $packages["github.com/dotchain/dot/changes"];
	refs = $packages["github.com/dotchain/dot/refs"];
	core = $packages["github.com/dotchain/fuss/core"];
	dom = $packages["github.com/dotchain/fuss/dom"];
	TaskStream = $pkg.TaskStream = $newType(0, $kindStruct, "todo.TaskStream", true, "github.com/dotchain/fuss/todo", true, function(Notifier_, Value_, Change_, Next_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Notifier = ptrType$2.nil;
			this.Value = new Task.ptr("", false, "");
			this.Change = $ifaceNil;
			this.Next = ptrType$1.nil;
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
			this.Notifier = ptrType$2.nil;
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
	appCtx = $pkg.appCtx = $newType(0, $kindStruct, "todo.appCtx", true, "github.com/dotchain/fuss/todo", false, function(Cache_, TasksViewStruct_, initialized_, stateHandler_, dom_, memoized_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Cache = new core.Cache.ptr(false, false);
			this.TasksViewStruct = new TasksViewStruct.ptr(false, false);
			this.initialized = false;
			this.stateHandler = new core.Handler.ptr($throwNilPointerError);
			this.dom = new structType.ptr(new dom.CheckboxEditStruct.ptr(false, false), new dom.EltStruct.ptr(false, false));
			this.memoized = new structType$1.ptr(ptrType$3.nil, ptrType$3.nil, ptrType$3.nil, ptrType$3.nil, $ifaceNil, new dom.Styles.ptr(""), ptrType$6.nil);
			return;
		}
		this.Cache = Cache_;
		this.TasksViewStruct = TasksViewStruct_;
		this.initialized = initialized_;
		this.stateHandler = stateHandler_;
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
	taskEditCtx = $pkg.taskEditCtx = $newType(0, $kindStruct, "todo.taskEditCtx", true, "github.com/dotchain/fuss/todo", false, function(Cache_, initialized_, stateHandler_, dom_, memoized_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Cache = new core.Cache.ptr(false, false);
			this.initialized = false;
			this.stateHandler = new core.Handler.ptr($throwNilPointerError);
			this.dom = new structType$2.ptr(new dom.CheckboxEditStruct.ptr(false, false), new dom.EltStruct.ptr(false, false), new dom.TextEditStruct.ptr(false, false));
			this.memoized = new structType$3.ptr($ifaceNil, new dom.Styles.ptr(""), ptrType$1.nil);
			return;
		}
		this.Cache = Cache_;
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
	tasksViewCtx = $pkg.tasksViewCtx = $newType(0, $kindStruct, "todo.tasksViewCtx", true, "github.com/dotchain/fuss/todo", false, function(Cache_, TaskEditStruct_, initialized_, stateHandler_, dom_, memoized_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Cache = new core.Cache.ptr(false, false);
			this.TaskEditStruct = new TaskEditStruct.ptr(false, false);
			this.initialized = false;
			this.stateHandler = new core.Handler.ptr($throwNilPointerError);
			this.dom = new structType$4.ptr(new dom.EltStruct.ptr(false, false));
			this.memoized = new structType$5.ptr($ifaceNil, ptrType$3.nil, ptrType$3.nil, new dom.Styles.ptr(""), ptrType$6.nil);
			return;
		}
		this.Cache = Cache_;
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
	ptrType = $ptrType(core.Handler);
	sliceType = $sliceType(ptrType);
	ptrType$1 = $ptrType(TaskStream);
	ptrType$2 = $ptrType(core.Notifier);
	sliceType$1 = $sliceType($emptyInterface);
	ptrType$3 = $ptrType(dom.BoolStream);
	ptrType$4 = $ptrType(refs.MergeResult);
	ptrType$5 = $ptrType(dom.TextStream);
	ptrType$6 = $ptrType(TasksStream);
	sliceType$2 = $sliceType(Task);
	ptrType$7 = $ptrType(appCtx);
	structType = $structType("", [{prop: "CheckboxEditStruct", name: "CheckboxEditStruct", anonymous: true, exported: true, typ: dom.CheckboxEditStruct, tag: ""}, {prop: "EltStruct", name: "EltStruct", anonymous: true, exported: true, typ: dom.EltStruct, tag: ""}]);
	structType$1 = $structType("github.com/dotchain/fuss/todo", [{prop: "doneState", name: "doneState", anonymous: false, exported: false, typ: ptrType$3, tag: ""}, {prop: "notDoneState", name: "notDoneState", anonymous: false, exported: false, typ: ptrType$3, tag: ""}, {prop: "result1", name: "result1", anonymous: false, exported: false, typ: ptrType$3, tag: ""}, {prop: "result2", name: "result2", anonymous: false, exported: false, typ: ptrType$3, tag: ""}, {prop: "result3", name: "result3", anonymous: false, exported: false, typ: dom.Element, tag: ""}, {prop: "styles", name: "styles", anonymous: false, exported: false, typ: dom.Styles, tag: ""}, {prop: "tasks", name: "tasks", anonymous: false, exported: false, typ: ptrType$6, tag: ""}]);
	ptrType$8 = $ptrType(taskEditCtx);
	structType$2 = $structType("", [{prop: "CheckboxEditStruct", name: "CheckboxEditStruct", anonymous: true, exported: true, typ: dom.CheckboxEditStruct, tag: ""}, {prop: "EltStruct", name: "EltStruct", anonymous: true, exported: true, typ: dom.EltStruct, tag: ""}, {prop: "TextEditStruct", name: "TextEditStruct", anonymous: true, exported: true, typ: dom.TextEditStruct, tag: ""}]);
	structType$3 = $structType("github.com/dotchain/fuss/todo", [{prop: "result1", name: "result1", anonymous: false, exported: false, typ: dom.Element, tag: ""}, {prop: "styles", name: "styles", anonymous: false, exported: false, typ: dom.Styles, tag: ""}, {prop: "task", name: "task", anonymous: false, exported: false, typ: ptrType$1, tag: ""}]);
	ptrType$9 = $ptrType(tasksViewCtx);
	structType$4 = $structType("", [{prop: "EltStruct", name: "EltStruct", anonymous: true, exported: true, typ: dom.EltStruct, tag: ""}]);
	structType$5 = $structType("github.com/dotchain/fuss/todo", [{prop: "result1", name: "result1", anonymous: false, exported: false, typ: dom.Element, tag: ""}, {prop: "showDone", name: "showDone", anonymous: false, exported: false, typ: ptrType$3, tag: ""}, {prop: "showNotDone", name: "showNotDone", anonymous: false, exported: false, typ: ptrType$3, tag: ""}, {prop: "styles", name: "styles", anonymous: false, exported: false, typ: dom.Styles, tag: ""}, {prop: "tasks", name: "tasks", anonymous: false, exported: false, typ: ptrType$6, tag: ""}]);
	ptrType$10 = $ptrType(dom.EventHandler);
	sliceType$3 = $sliceType(dom.Element);
	ptrType$11 = $ptrType(AppStruct);
	mapType = $mapType($emptyInterface, ptrType$7);
	ptrType$12 = $ptrType(TaskEditStruct);
	mapType$1 = $mapType($emptyInterface, ptrType$8);
	ptrType$13 = $ptrType(TasksViewStruct);
	mapType$2 = $mapType($emptyInterface, ptrType$9);
	NewTaskStream = function(value) {
		var value;
		return new TaskStream.ptr(new core.Notifier.ptr(sliceType.nil), $clone(value, Task), $ifaceNil, ptrType$1.nil);
	};
	$pkg.NewTaskStream = NewTaskStream;
	TaskStream.ptr.prototype.Latest = function() {
		var s;
		s = this;
		while (true) {
			if (!(!(s.Next === ptrType$1.nil))) { break; }
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
		result = new TaskStream.ptr(s.Notifier, $clone(value, Task), $ifaceNil, ptrType$1.nil);
		before = s;
		v = (x$2 = new changes.Atomic.ptr(new value.constructor.elem(value)), new x$2.constructor.elem(x$2));
		after = result;
		/* while (true) { */ case 1:
			/* if (!(!(before.Next === ptrType$1.nil))) { break; } */ if(!(!(before.Next === ptrType$1.nil))) { $s = 2; continue; }
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
			after.Next = new TaskStream.ptr(s.Notifier, $clone(s.unwrapValue(v), Task), $ifaceNil, ptrType$1.nil);
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
		field[0] = ptrType$3.nil;
		s = this;
		n[0] = s.Notifier;
		handler[0] = new core.Handler.ptr($throwNilPointerError);
		_tuple = cache.GetSubstream(n[0], new $String("Done"));
		f = _tuple[0];
		h = _tuple[1];
		ok = _tuple[2];
		if (ok) {
			_tmp = $assertType(f, ptrType$3);
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
					/* if (!(!(field[0].Next === ptrType$3.nil))) { break; } */ if(!(!(field[0].Next === ptrType$3.nil))) { $s = 2; continue; }
					v = $clone(parent[0].Value, Task);
					v.Done = field[0].Next.Value;
					c = new changes.PathChange.ptr(path[0], field[0].Change);
					_r = parent[0].Append(new c.constructor.elem(c), $clone(v, Task), true); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
					parent[0] = _r;
					field[0] = field[0].Next;
				/* } */ $s = 1; continue; case 2:
				/* while (true) { */ case 4:
					/* if (!(!(parent[0].Next === ptrType$1.nil))) { break; } */ if(!(!(parent[0].Next === ptrType$1.nil))) { $s = 5; continue; }
					_r$1 = refs.Merge(path[0], parent[0].Change); /* */ $s = 6; case 6: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
					result = _r$1;
					/* */ if (result === ptrType$4.nil) { $s = 7; continue; }
					/* */ $s = 8; continue;
					/* if (result === ptrType$4.nil) { */ case 7:
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
		field[0] = ptrType$5.nil;
		s = this;
		n[0] = s.Notifier;
		handler[0] = new core.Handler.ptr($throwNilPointerError);
		_tuple = cache.GetSubstream(n[0], new $String("Description"));
		f = _tuple[0];
		h = _tuple[1];
		ok = _tuple[2];
		if (ok) {
			_tmp = $assertType(f, ptrType$5);
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
					/* if (!(!(field[0].Next === ptrType$5.nil))) { break; } */ if(!(!(field[0].Next === ptrType$5.nil))) { $s = 2; continue; }
					v = $clone(parent[0].Value, Task);
					v.Description = field[0].Next.Value;
					c = new changes.PathChange.ptr(path[0], field[0].Change);
					_r = parent[0].Append(new c.constructor.elem(c), $clone(v, Task), true); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
					parent[0] = _r;
					field[0] = field[0].Next;
				/* } */ $s = 1; continue; case 2:
				/* while (true) { */ case 4:
					/* if (!(!(parent[0].Next === ptrType$1.nil))) { break; } */ if(!(!(parent[0].Next === ptrType$1.nil))) { $s = 5; continue; }
					_r$1 = refs.Merge(path[0], parent[0].Change); /* */ $s = 6; case 6: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
					result = _r$1;
					/* */ if (result === ptrType$4.nil) { $s = 7; continue; }
					/* */ $s = 8; continue;
					/* if (result === ptrType$4.nil) { */ case 7:
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
		entry[0] = ptrType$1.nil;
		s = this;
		n[0] = s.Notifier;
		handler[0] = new core.Handler.ptr($throwNilPointerError);
		_tuple = cache.GetSubstream(n[0], new $Int(index[0]));
		f = _tuple[0];
		h = _tuple[1];
		ok = _tuple[2];
		if (ok) {
			_tmp = $assertType(f, ptrType$1);
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
					/* if (!(!(entry[0].Next === ptrType$1.nil))) { break; } */ if(!(!(entry[0].Next === ptrType$1.nil))) { $s = 2; continue; }
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
					if (!(result === ptrType$4.nil)) {
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
	appCtx.ptr.prototype.areArgsSame = function(styles, tasks) {
		var c, styles, tasks;
		c = this;
		if (!($equal(styles, c.memoized.styles, dom.Styles))) {
			return false;
		}
		return tasks === c.memoized.tasks;
	};
	appCtx.prototype.areArgsSame = function(styles, tasks) { return this.$val.areArgsSame(styles, tasks); };
	appCtx.ptr.prototype.refreshIfNeeded = function(styles, tasks) {
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
		/* */ } return; } if ($f === undefined) { $f = { $blk: appCtx.ptr.prototype.refreshIfNeeded }; } $f._r = _r; $f.c = c; $f.result3 = result3; $f.styles = styles; $f.tasks = tasks; $f.$s = $s; $f.$r = $r; return $f;
	};
	appCtx.prototype.refreshIfNeeded = function(styles, tasks) { return this.$val.refreshIfNeeded(styles, tasks); };
	appCtx.ptr.prototype.refresh = function(styles, tasks) {
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
		if (!(c[0].memoized.doneState === ptrType$3.nil)) {
			c[0].memoized.doneState = c[0].memoized.doneState.Latest();
		}
		if (!(c[0].memoized.notDoneState === ptrType$3.nil)) {
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
		c[0].dom.CheckboxEditStruct.Begin();
		$deferred.push([$methodVal(c[0].dom.CheckboxEditStruct, "End"), []]);
		c[0].dom.EltStruct.Begin();
		$deferred.push([$methodVal(c[0].dom.EltStruct, "End"), []]);
		_r = app(c[0], $clone(styles[0], dom.Styles), tasks[0], c[0].memoized.doneState, c[0].memoized.notDoneState); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_tuple = _r;
		c[0].memoized.result1 = _tuple[0];
		c[0].memoized.result2 = _tuple[1];
		c[0].memoized.result3 = _tuple[2];
		if (!(c[0].memoized.doneState === c[0].memoized.result1)) {
			if (!(c[0].memoized.doneState === ptrType$3.nil)) {
				c[0].memoized.doneState.Notifier.Off(c[0].stateHandler);
			}
			if (!(c[0].memoized.result1 === ptrType$3.nil)) {
				c[0].memoized.result1.Notifier.On(c[0].stateHandler);
			}
			c[0].memoized.doneState = c[0].memoized.result1;
		}
		if (!(c[0].memoized.notDoneState === c[0].memoized.result2)) {
			if (!(c[0].memoized.notDoneState === ptrType$3.nil)) {
				c[0].memoized.notDoneState.Notifier.Off(c[0].stateHandler);
			}
			if (!(c[0].memoized.result2 === ptrType$3.nil)) {
				c[0].memoized.result2.Notifier.On(c[0].stateHandler);
			}
			c[0].memoized.notDoneState = c[0].memoized.result2;
		}
		result3 = c[0].memoized.result3;
		$s = -1; return result3;
		/* */ } return; } } catch(err) { $err = err; $s = -1; } finally { $callDeferred($deferred, $err); if (!$curGoroutine.asleep) { return  result3; } if($curGoroutine.asleep) { if ($f === undefined) { $f = { $blk: appCtx.ptr.prototype.refresh }; } $f._r = _r; $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f._tuple = _tuple; $f.c = c; $f.result3 = result3; $f.styles = styles; $f.tasks = tasks; $f.$s = $s; $f.$deferred = $deferred; $f.$r = $r; return $f; } }
	};
	appCtx.prototype.refresh = function(styles, tasks) { return this.$val.refresh(styles, tasks); };
	appCtx.ptr.prototype.close = function() {
		var c, $s, $deferred, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; c = $f.c; $s = $f.$s; $deferred = $f.$deferred; $r = $f.$r; } var $err = null; try { s: while (true) { switch ($s) { case 0: $deferred = []; $deferred.index = $curGoroutine.deferStack.length; $curGoroutine.deferStack.push($deferred);
		c = this;
		c.Cache.Begin();
		$deferred.push([$methodVal(c.Cache, "End"), []]);
		c.TasksViewStruct.Begin();
		$deferred.push([$methodVal(c.TasksViewStruct, "End"), []]);
		c.dom.CheckboxEditStruct.Begin();
		$deferred.push([$methodVal(c.dom.CheckboxEditStruct, "End"), []]);
		c.dom.EltStruct.Begin();
		$deferred.push([$methodVal(c.dom.EltStruct, "End"), []]);
		if (!(c.memoized.doneState === ptrType$3.nil)) {
			c.memoized.doneState.Notifier.Off(c.stateHandler);
		}
		if (!(c.memoized.notDoneState === ptrType$3.nil)) {
			c.memoized.notDoneState.Notifier.Off(c.stateHandler);
		}
		$s = -1; return;
		/* */ } return; } } catch(err) { $err = err; $s = -1; } finally { $callDeferred($deferred, $err); if($curGoroutine.asleep) { if ($f === undefined) { $f = { $blk: appCtx.ptr.prototype.close }; } $f.c = c; $f.$s = $s; $f.$deferred = $deferred; $f.$r = $r; return $f; } }
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
	AppStruct.ptr.prototype.App = function(cKey, styles, tasks) {
		var _entry, _key, _r, _tuple, c, cKey, cOld, ok, result3, styles, tasks, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _entry = $f._entry; _key = $f._key; _r = $f._r; _tuple = $f._tuple; c = $f.c; cKey = $f.cKey; cOld = $f.cOld; ok = $f.ok; result3 = $f.result3; styles = $f.styles; tasks = $f.tasks; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		result3 = $ifaceNil;
		c = this;
		_tuple = (_entry = c.old[$emptyInterface.keyFor(cKey)], _entry !== undefined ? [_entry.v, true] : [ptrType$7.nil, false]);
		cOld = _tuple[0];
		ok = _tuple[1];
		if (ok) {
			delete c.old[$emptyInterface.keyFor(cKey)];
		} else {
			cOld = new appCtx.ptr(new core.Cache.ptr(false, false), new TasksViewStruct.ptr(false, false), false, new core.Handler.ptr($throwNilPointerError), new structType.ptr(new dom.CheckboxEditStruct.ptr(false, false), new dom.EltStruct.ptr(false, false)), new structType$1.ptr(ptrType$3.nil, ptrType$3.nil, ptrType$3.nil, ptrType$3.nil, $ifaceNil, new dom.Styles.ptr(""), ptrType$6.nil));
		}
		_key = cKey; (c.current || $throwRuntimeError("assignment to entry in nil map"))[$emptyInterface.keyFor(_key)] = { k: _key, v: cOld };
		_r = cOld.refreshIfNeeded($clone(styles, dom.Styles), tasks); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		result3 = _r;
		$s = -1; return result3;
		/* */ } return; } if ($f === undefined) { $f = { $blk: AppStruct.ptr.prototype.App }; } $f._entry = _entry; $f._key = _key; $f._r = _r; $f._tuple = _tuple; $f.c = c; $f.cKey = cKey; $f.cOld = cOld; $f.ok = ok; $f.result3 = result3; $f.styles = styles; $f.tasks = tasks; $f.$s = $s; $f.$r = $r; return $f;
	};
	AppStruct.prototype.App = function(cKey, styles, tasks) { return this.$val.App(cKey, styles, tasks); };
	taskEditCtx.ptr.prototype.areArgsSame = function(styles, task) {
		var c, styles, task;
		c = this;
		if (!($equal(styles, c.memoized.styles, dom.Styles))) {
			return false;
		}
		return task === c.memoized.task;
	};
	taskEditCtx.prototype.areArgsSame = function(styles, task) { return this.$val.areArgsSame(styles, task); };
	taskEditCtx.ptr.prototype.refreshIfNeeded = function(styles, task) {
		var _r, c, result1, styles, task, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; c = $f.c; result1 = $f.result1; styles = $f.styles; task = $f.task; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		result1 = $ifaceNil;
		c = this;
		/* */ if (!c.initialized || !c.areArgsSame($clone(styles, dom.Styles), task)) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (!c.initialized || !c.areArgsSame($clone(styles, dom.Styles), task)) { */ case 1:
			_r = c.refresh($clone(styles, dom.Styles), task); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			result1 = _r;
			$s = -1; return result1;
		/* } */ case 2:
		result1 = c.memoized.result1;
		$s = -1; return result1;
		/* */ } return; } if ($f === undefined) { $f = { $blk: taskEditCtx.ptr.prototype.refreshIfNeeded }; } $f._r = _r; $f.c = c; $f.result1 = result1; $f.styles = styles; $f.task = task; $f.$s = $s; $f.$r = $r; return $f;
	};
	taskEditCtx.prototype.refreshIfNeeded = function(styles, task) { return this.$val.refreshIfNeeded(styles, task); };
	taskEditCtx.ptr.prototype.refresh = function(styles, task) {
		var _r, _tmp, _tmp$1, c, result1, styles, task, $s, $deferred, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; c = $f.c; result1 = $f.result1; styles = $f.styles; task = $f.task; $s = $f.$s; $deferred = $f.$deferred; $r = $f.$r; } var $err = null; try { s: while (true) { switch ($s) { case 0: $deferred = []; $deferred.index = $curGoroutine.deferStack.length; $curGoroutine.deferStack.push($deferred);
		c = [c];
		styles = [styles];
		task = [task];
		result1 = $ifaceNil;
		c[0] = this;
		c[0].initialized = true;
		c[0].stateHandler.Handle = (function(c, styles, task) { return function $b() {
			var _r, $s, $r;
			/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
			_r = c[0].refresh($clone(styles[0], dom.Styles), task[0]); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			_r;
			$s = -1; return;
			/* */ } return; } if ($f === undefined) { $f = { $blk: $b }; } $f._r = _r; $f.$s = $s; $f.$r = $r; return $f;
		}; })(c, styles, task);
		_tmp = $clone(styles[0], dom.Styles);
		_tmp$1 = task[0];
		dom.Styles.copy(c[0].memoized.styles, _tmp);
		c[0].memoized.task = _tmp$1;
		c[0].Cache.Begin();
		$deferred.push([$methodVal(c[0].Cache, "End"), []]);
		c[0].dom.CheckboxEditStruct.Begin();
		$deferred.push([$methodVal(c[0].dom.CheckboxEditStruct, "End"), []]);
		c[0].dom.EltStruct.Begin();
		$deferred.push([$methodVal(c[0].dom.EltStruct, "End"), []]);
		c[0].dom.TextEditStruct.Begin();
		$deferred.push([$methodVal(c[0].dom.TextEditStruct, "End"), []]);
		_r = taskEdit(c[0], $clone(styles[0], dom.Styles), task[0]); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		c[0].memoized.result1 = _r;
		result1 = c[0].memoized.result1;
		$s = -1; return result1;
		/* */ } return; } } catch(err) { $err = err; $s = -1; } finally { $callDeferred($deferred, $err); if (!$curGoroutine.asleep) { return  result1; } if($curGoroutine.asleep) { if ($f === undefined) { $f = { $blk: taskEditCtx.ptr.prototype.refresh }; } $f._r = _r; $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f.c = c; $f.result1 = result1; $f.styles = styles; $f.task = task; $f.$s = $s; $f.$deferred = $deferred; $f.$r = $r; return $f; } }
	};
	taskEditCtx.prototype.refresh = function(styles, task) { return this.$val.refresh(styles, task); };
	taskEditCtx.ptr.prototype.close = function() {
		var c, $s, $deferred, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; c = $f.c; $s = $f.$s; $deferred = $f.$deferred; $r = $f.$r; } var $err = null; try { s: while (true) { switch ($s) { case 0: $deferred = []; $deferred.index = $curGoroutine.deferStack.length; $curGoroutine.deferStack.push($deferred);
		c = this;
		c.Cache.Begin();
		$deferred.push([$methodVal(c.Cache, "End"), []]);
		c.dom.CheckboxEditStruct.Begin();
		$deferred.push([$methodVal(c.dom.CheckboxEditStruct, "End"), []]);
		c.dom.EltStruct.Begin();
		$deferred.push([$methodVal(c.dom.EltStruct, "End"), []]);
		c.dom.TextEditStruct.Begin();
		$deferred.push([$methodVal(c.dom.TextEditStruct, "End"), []]);
		$s = -1; return;
		/* */ } return; } } catch(err) { $err = err; $s = -1; } finally { $callDeferred($deferred, $err); if($curGoroutine.asleep) { if ($f === undefined) { $f = { $blk: taskEditCtx.ptr.prototype.close }; } $f.c = c; $f.$s = $s; $f.$deferred = $deferred; $f.$r = $r; return $f; } }
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
	TaskEditStruct.ptr.prototype.TaskEdit = function(cKey, styles, task) {
		var _entry, _key, _r, _tuple, c, cKey, cOld, ok, result1, styles, task, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _entry = $f._entry; _key = $f._key; _r = $f._r; _tuple = $f._tuple; c = $f.c; cKey = $f.cKey; cOld = $f.cOld; ok = $f.ok; result1 = $f.result1; styles = $f.styles; task = $f.task; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		result1 = $ifaceNil;
		c = this;
		_tuple = (_entry = c.old[$emptyInterface.keyFor(cKey)], _entry !== undefined ? [_entry.v, true] : [ptrType$8.nil, false]);
		cOld = _tuple[0];
		ok = _tuple[1];
		if (ok) {
			delete c.old[$emptyInterface.keyFor(cKey)];
		} else {
			cOld = new taskEditCtx.ptr(new core.Cache.ptr(false, false), false, new core.Handler.ptr($throwNilPointerError), new structType$2.ptr(new dom.CheckboxEditStruct.ptr(false, false), new dom.EltStruct.ptr(false, false), new dom.TextEditStruct.ptr(false, false)), new structType$3.ptr($ifaceNil, new dom.Styles.ptr(""), ptrType$1.nil));
		}
		_key = cKey; (c.current || $throwRuntimeError("assignment to entry in nil map"))[$emptyInterface.keyFor(_key)] = { k: _key, v: cOld };
		_r = cOld.refreshIfNeeded($clone(styles, dom.Styles), task); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		result1 = _r;
		$s = -1; return result1;
		/* */ } return; } if ($f === undefined) { $f = { $blk: TaskEditStruct.ptr.prototype.TaskEdit }; } $f._entry = _entry; $f._key = _key; $f._r = _r; $f._tuple = _tuple; $f.c = c; $f.cKey = cKey; $f.cOld = cOld; $f.ok = ok; $f.result1 = result1; $f.styles = styles; $f.task = task; $f.$s = $s; $f.$r = $r; return $f;
	};
	TaskEditStruct.prototype.TaskEdit = function(cKey, styles, task) { return this.$val.TaskEdit(cKey, styles, task); };
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
		c[0].dom.EltStruct.Begin();
		$deferred.push([$methodVal(c[0].dom.EltStruct, "End"), []]);
		_r = tasksView(c[0], $clone(styles[0], dom.Styles), showDone[0], showNotDone[0], tasks[0]); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		c[0].memoized.result1 = _r;
		result1 = c[0].memoized.result1;
		$s = -1; return result1;
		/* */ } return; } } catch(err) { $err = err; $s = -1; } finally { $callDeferred($deferred, $err); if (!$curGoroutine.asleep) { return  result1; } if($curGoroutine.asleep) { if ($f === undefined) { $f = { $blk: tasksViewCtx.ptr.prototype.refresh }; } $f._r = _r; $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f._tmp$2 = _tmp$2; $f._tmp$3 = _tmp$3; $f.c = c; $f.result1 = result1; $f.showDone = showDone; $f.showNotDone = showNotDone; $f.styles = styles; $f.tasks = tasks; $f.$s = $s; $f.$deferred = $deferred; $f.$r = $r; return $f; } }
	};
	tasksViewCtx.prototype.refresh = function(styles, showDone, showNotDone, tasks) { return this.$val.refresh(styles, showDone, showNotDone, tasks); };
	tasksViewCtx.ptr.prototype.close = function() {
		var c, $s, $deferred, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; c = $f.c; $s = $f.$s; $deferred = $f.$deferred; $r = $f.$r; } var $err = null; try { s: while (true) { switch ($s) { case 0: $deferred = []; $deferred.index = $curGoroutine.deferStack.length; $curGoroutine.deferStack.push($deferred);
		c = this;
		c.Cache.Begin();
		$deferred.push([$methodVal(c.Cache, "End"), []]);
		c.TaskEditStruct.Begin();
		$deferred.push([$methodVal(c.TaskEditStruct, "End"), []]);
		c.dom.EltStruct.Begin();
		$deferred.push([$methodVal(c.dom.EltStruct, "End"), []]);
		$s = -1; return;
		/* */ } return; } } catch(err) { $err = err; $s = -1; } finally { $callDeferred($deferred, $err); if($curGoroutine.asleep) { if ($f === undefined) { $f = { $blk: tasksViewCtx.ptr.prototype.close }; } $f.c = c; $f.$s = $s; $f.$deferred = $deferred; $f.$r = $r; return $f; } }
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
		_tuple = (_entry = c.old[$emptyInterface.keyFor(cKey)], _entry !== undefined ? [_entry.v, true] : [ptrType$9.nil, false]);
		cOld = _tuple[0];
		ok = _tuple[1];
		if (ok) {
			delete c.old[$emptyInterface.keyFor(cKey)];
		} else {
			cOld = new tasksViewCtx.ptr(new core.Cache.ptr(false, false), new TaskEditStruct.ptr(false, false), false, new core.Handler.ptr($throwNilPointerError), new structType$4.ptr(new dom.EltStruct.ptr(false, false)), new structType$5.ptr($ifaceNil, ptrType$3.nil, ptrType$3.nil, new dom.Styles.ptr(""), ptrType$6.nil));
		}
		_key = cKey; (c.current || $throwRuntimeError("assignment to entry in nil map"))[$emptyInterface.keyFor(_key)] = { k: _key, v: cOld };
		_r = cOld.refreshIfNeeded($clone(styles, dom.Styles), showDone, showNotDone, tasks); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		result1 = _r;
		$s = -1; return result1;
		/* */ } return; } if ($f === undefined) { $f = { $blk: TasksViewStruct.ptr.prototype.TasksView }; } $f._entry = _entry; $f._key = _key; $f._r = _r; $f._tuple = _tuple; $f.c = c; $f.cKey = cKey; $f.cOld = cOld; $f.ok = ok; $f.result1 = result1; $f.showDone = showDone; $f.showNotDone = showNotDone; $f.styles = styles; $f.tasks = tasks; $f.$s = $s; $f.$r = $r; return $f;
	};
	TasksViewStruct.prototype.TasksView = function(cKey, styles, showDone, showNotDone, tasks) { return this.$val.TasksView(cKey, styles, showDone, showNotDone, tasks); };
	taskEdit = function(c, styles, task) {
		var _arg, _arg$1, _arg$2, _arg$3, _arg$4, _arg$5, _arg$6, _r, _r$1, _r$2, _r$3, _r$4, c, styles, task, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _arg = $f._arg; _arg$1 = $f._arg$1; _arg$2 = $f._arg$2; _arg$3 = $f._arg$3; _arg$4 = $f._arg$4; _arg$5 = $f._arg$5; _arg$6 = $f._arg$6; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; _r$3 = $f._r$3; _r$4 = $f._r$4; c = $f.c; styles = $f.styles; task = $f.task; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_arg = new dom.Props.ptr($clone(styles, dom.Styles), "div", false, "", "", ptrType$10.nil);
		_arg$1 = new dom.Styles.ptr("");
		_r = task.DoneSubstream($clone(c.Cache, core.Cache)); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_arg$2 = _r;
		_r$1 = c.dom.CheckboxEditStruct.CheckboxEdit(new $String("cb"), _arg$1, _arg$2); /* */ $s = 2; case 2: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		_arg$3 = _r$1;
		_arg$4 = new dom.Styles.ptr("");
		_r$2 = task.DescriptionSubstream($clone(c.Cache, core.Cache)); /* */ $s = 3; case 3: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
		_arg$5 = _r$2;
		_r$3 = c.dom.TextEditStruct.TextEdit(new $String("textedit"), _arg$4, _arg$5); /* */ $s = 4; case 4: if($c) { $c = false; _r$3 = _r$3.$blk(); } if (_r$3 && _r$3.$blk !== undefined) { break s; }
		_arg$6 = _r$3;
		_r$4 = c.dom.EltStruct.Elt(new $String("root"), _arg, new sliceType$3([_arg$3, _arg$6])); /* */ $s = 5; case 5: if($c) { $c = false; _r$4 = _r$4.$blk(); } if (_r$4 && _r$4.$blk !== undefined) { break s; }
		$s = -1; return _r$4;
		/* */ } return; } if ($f === undefined) { $f = { $blk: taskEdit }; } $f._arg = _arg; $f._arg$1 = _arg$1; $f._arg$2 = _arg$2; $f._arg$3 = _arg$3; $f._arg$4 = _arg$4; $f._arg$5 = _arg$5; $f._arg$6 = _arg$6; $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f._r$3 = _r$3; $f._r$4 = _r$4; $f.c = c; $f.styles = styles; $f.task = task; $f.$s = $s; $f.$r = $r; return $f;
	};
	tasksView = function(c, styles, showDone, showNotDone, tasks) {
		var _arg, _arg$1, _r, _r$1, c, showDone, showNotDone, styles, tasks, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _arg = $f._arg; _arg$1 = $f._arg$1; _r = $f._r; _r$1 = $f._r$1; c = $f.c; showDone = $f.showDone; showNotDone = $f.showNotDone; styles = $f.styles; tasks = $f.tasks; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		c = [c];
		showDone = [showDone];
		showNotDone = [showNotDone];
		tasks = [tasks];
		_arg = new dom.Props.ptr($clone(styles, dom.Styles), "div", false, "", "", ptrType$10.nil);
		_r = renderTasks(tasks[0].Value, (function(c, showDone, showNotDone, tasks) { return function $b(index, t) {
			var _arg$1, _arg$2, _arg$3, _r, _r$1, index, t, $s, $r;
			/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _arg$1 = $f._arg$1; _arg$2 = $f._arg$2; _arg$3 = $f._arg$3; _r = $f._r; _r$1 = $f._r$1; index = $f.index; t = $f.t; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
			if (t.Done && !showDone[0].Value || !t.Done && !showNotDone[0].Value) {
				$s = -1; return $ifaceNil;
			}
			_arg$1 = new $String(t.ID);
			_arg$2 = new dom.Styles.ptr("");
			_r = tasks[0].Substream($clone(c[0].Cache, core.Cache), index); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			_arg$3 = _r;
			_r$1 = c[0].TaskEditStruct.TaskEdit(_arg$1, _arg$2, _arg$3); /* */ $s = 2; case 2: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
			$s = -1; return _r$1;
			/* */ } return; } if ($f === undefined) { $f = { $blk: $b }; } $f._arg$1 = _arg$1; $f._arg$2 = _arg$2; $f._arg$3 = _arg$3; $f._r = _r; $f._r$1 = _r$1; $f.index = index; $f.t = t; $f.$s = $s; $f.$r = $r; return $f;
		}; })(c, showDone, showNotDone, tasks)); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_arg$1 = _r;
		_r$1 = c[0].dom.EltStruct.Elt(new $String("root"), _arg, _arg$1); /* */ $s = 2; case 2: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
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
	app = function(c, styles, tasks, doneState, notDoneState) {
		var _arg, _arg$1, _arg$2, _arg$3, _r, _r$1, _r$2, _r$3, c, doneState, notDoneState, styles, tasks, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _arg = $f._arg; _arg$1 = $f._arg$1; _arg$2 = $f._arg$2; _arg$3 = $f._arg$3; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; _r$3 = $f._r$3; c = $f.c; doneState = $f.doneState; notDoneState = $f.notDoneState; styles = $f.styles; tasks = $f.tasks; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		if (doneState === ptrType$3.nil) {
			doneState = dom.NewBoolStream(true);
		}
		if (notDoneState === ptrType$3.nil) {
			notDoneState = dom.NewBoolStream(true);
		}
		_arg = new dom.Props.ptr($clone(styles, dom.Styles), "div", false, "", "", ptrType$10.nil);
		_r = c.dom.CheckboxEditStruct.CheckboxEdit(new $String("done"), new dom.Styles.ptr(""), doneState); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_arg$1 = _r;
		_r$1 = c.dom.CheckboxEditStruct.CheckboxEdit(new $String("notDone"), new dom.Styles.ptr(""), notDoneState); /* */ $s = 2; case 2: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		_arg$2 = _r$1;
		_r$2 = c.TasksViewStruct.TasksView(new $String("tasks"), new dom.Styles.ptr(""), doneState, notDoneState, tasks); /* */ $s = 3; case 3: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
		_arg$3 = _r$2;
		_r$3 = c.dom.EltStruct.Elt(new $String("root"), _arg, new sliceType$3([_arg$1, _arg$2, _arg$3])); /* */ $s = 4; case 4: if($c) { $c = false; _r$3 = _r$3.$blk(); } if (_r$3 && _r$3.$blk !== undefined) { break s; }
		$s = -1; return [doneState, notDoneState, _r$3];
		/* */ } return; } if ($f === undefined) { $f = { $blk: app }; } $f._arg = _arg; $f._arg$1 = _arg$1; $f._arg$2 = _arg$2; $f._arg$3 = _arg$3; $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f._r$3 = _r$3; $f.c = c; $f.doneState = doneState; $f.notDoneState = notDoneState; $f.styles = styles; $f.tasks = tasks; $f.$s = $s; $f.$r = $r; return $f;
	};
	ptrType$1.methods = [{prop: "Latest", name: "Latest", pkg: "", typ: $funcType([], [ptrType$1], false)}, {prop: "Append", name: "Append", pkg: "", typ: $funcType([changes.Change, Task, $Bool], [ptrType$1], false)}, {prop: "wrapValue", name: "wrapValue", pkg: "github.com/dotchain/fuss/todo", typ: $funcType([$emptyInterface], [changes.Value], false)}, {prop: "unwrapValue", name: "unwrapValue", pkg: "github.com/dotchain/fuss/todo", typ: $funcType([changes.Value], [Task], false)}, {prop: "SetDone", name: "SetDone", pkg: "", typ: $funcType([$Bool], [ptrType$1], false)}, {prop: "DoneSubstream", name: "DoneSubstream", pkg: "", typ: $funcType([core.Cache], [ptrType$3], false)}, {prop: "SetDescription", name: "SetDescription", pkg: "", typ: $funcType([$String], [ptrType$1], false)}, {prop: "DescriptionSubstream", name: "DescriptionSubstream", pkg: "", typ: $funcType([core.Cache], [ptrType$5], false)}];
	ptrType$6.methods = [{prop: "Latest", name: "Latest", pkg: "", typ: $funcType([], [ptrType$6], false)}, {prop: "Append", name: "Append", pkg: "", typ: $funcType([changes.Change, Tasks, $Bool], [ptrType$6], false)}, {prop: "wrapValue", name: "wrapValue", pkg: "github.com/dotchain/fuss/todo", typ: $funcType([$emptyInterface], [changes.Value], false)}, {prop: "unwrapValue", name: "unwrapValue", pkg: "github.com/dotchain/fuss/todo", typ: $funcType([changes.Value], [Tasks], false)}, {prop: "Substream", name: "Substream", pkg: "", typ: $funcType([core.Cache, $Int], [ptrType$1], false)}];
	ptrType$7.methods = [{prop: "areArgsSame", name: "areArgsSame", pkg: "github.com/dotchain/fuss/todo", typ: $funcType([dom.Styles, ptrType$6], [$Bool], false)}, {prop: "refreshIfNeeded", name: "refreshIfNeeded", pkg: "github.com/dotchain/fuss/todo", typ: $funcType([dom.Styles, ptrType$6], [dom.Element], false)}, {prop: "refresh", name: "refresh", pkg: "github.com/dotchain/fuss/todo", typ: $funcType([dom.Styles, ptrType$6], [dom.Element], false)}, {prop: "close", name: "close", pkg: "github.com/dotchain/fuss/todo", typ: $funcType([], [], false)}];
	ptrType$11.methods = [{prop: "Begin", name: "Begin", pkg: "", typ: $funcType([], [], false)}, {prop: "End", name: "End", pkg: "", typ: $funcType([], [], false)}, {prop: "App", name: "App", pkg: "", typ: $funcType([$emptyInterface, dom.Styles, ptrType$6], [dom.Element], false)}];
	ptrType$8.methods = [{prop: "areArgsSame", name: "areArgsSame", pkg: "github.com/dotchain/fuss/todo", typ: $funcType([dom.Styles, ptrType$1], [$Bool], false)}, {prop: "refreshIfNeeded", name: "refreshIfNeeded", pkg: "github.com/dotchain/fuss/todo", typ: $funcType([dom.Styles, ptrType$1], [dom.Element], false)}, {prop: "refresh", name: "refresh", pkg: "github.com/dotchain/fuss/todo", typ: $funcType([dom.Styles, ptrType$1], [dom.Element], false)}, {prop: "close", name: "close", pkg: "github.com/dotchain/fuss/todo", typ: $funcType([], [], false)}];
	ptrType$12.methods = [{prop: "Begin", name: "Begin", pkg: "", typ: $funcType([], [], false)}, {prop: "End", name: "End", pkg: "", typ: $funcType([], [], false)}, {prop: "TaskEdit", name: "TaskEdit", pkg: "", typ: $funcType([$emptyInterface, dom.Styles, ptrType$1], [dom.Element], false)}];
	ptrType$9.methods = [{prop: "areArgsSame", name: "areArgsSame", pkg: "github.com/dotchain/fuss/todo", typ: $funcType([dom.Styles, ptrType$3, ptrType$3, ptrType$6], [$Bool], false)}, {prop: "refreshIfNeeded", name: "refreshIfNeeded", pkg: "github.com/dotchain/fuss/todo", typ: $funcType([dom.Styles, ptrType$3, ptrType$3, ptrType$6], [dom.Element], false)}, {prop: "refresh", name: "refresh", pkg: "github.com/dotchain/fuss/todo", typ: $funcType([dom.Styles, ptrType$3, ptrType$3, ptrType$6], [dom.Element], false)}, {prop: "close", name: "close", pkg: "github.com/dotchain/fuss/todo", typ: $funcType([], [], false)}];
	ptrType$13.methods = [{prop: "Begin", name: "Begin", pkg: "", typ: $funcType([], [], false)}, {prop: "End", name: "End", pkg: "", typ: $funcType([], [], false)}, {prop: "TasksView", name: "TasksView", pkg: "", typ: $funcType([$emptyInterface, dom.Styles, ptrType$3, ptrType$3, ptrType$6], [dom.Element], false)}];
	TaskStream.init("", [{prop: "Notifier", name: "Notifier", anonymous: true, exported: true, typ: ptrType$2, tag: ""}, {prop: "Value", name: "Value", anonymous: false, exported: true, typ: Task, tag: ""}, {prop: "Change", name: "Change", anonymous: false, exported: true, typ: changes.Change, tag: ""}, {prop: "Next", name: "Next", anonymous: false, exported: true, typ: ptrType$1, tag: ""}]);
	TasksStream.init("", [{prop: "Notifier", name: "Notifier", anonymous: true, exported: true, typ: ptrType$2, tag: ""}, {prop: "Value", name: "Value", anonymous: false, exported: true, typ: Tasks, tag: ""}, {prop: "Change", name: "Change", anonymous: false, exported: true, typ: changes.Change, tag: ""}, {prop: "Next", name: "Next", anonymous: false, exported: true, typ: ptrType$6, tag: ""}]);
	appCtx.init("github.com/dotchain/fuss/todo", [{prop: "Cache", name: "Cache", anonymous: true, exported: true, typ: core.Cache, tag: ""}, {prop: "TasksViewStruct", name: "TasksViewStruct", anonymous: true, exported: true, typ: TasksViewStruct, tag: ""}, {prop: "initialized", name: "initialized", anonymous: false, exported: false, typ: $Bool, tag: ""}, {prop: "stateHandler", name: "stateHandler", anonymous: false, exported: false, typ: core.Handler, tag: ""}, {prop: "dom", name: "dom", anonymous: false, exported: false, typ: structType, tag: ""}, {prop: "memoized", name: "memoized", anonymous: false, exported: false, typ: structType$1, tag: ""}]);
	AppStruct.init("github.com/dotchain/fuss/todo", [{prop: "old", name: "old", anonymous: false, exported: false, typ: mapType, tag: ""}, {prop: "current", name: "current", anonymous: false, exported: false, typ: mapType, tag: ""}]);
	taskEditCtx.init("github.com/dotchain/fuss/todo", [{prop: "Cache", name: "Cache", anonymous: true, exported: true, typ: core.Cache, tag: ""}, {prop: "initialized", name: "initialized", anonymous: false, exported: false, typ: $Bool, tag: ""}, {prop: "stateHandler", name: "stateHandler", anonymous: false, exported: false, typ: core.Handler, tag: ""}, {prop: "dom", name: "dom", anonymous: false, exported: false, typ: structType$2, tag: ""}, {prop: "memoized", name: "memoized", anonymous: false, exported: false, typ: structType$3, tag: ""}]);
	TaskEditStruct.init("github.com/dotchain/fuss/todo", [{prop: "old", name: "old", anonymous: false, exported: false, typ: mapType$1, tag: ""}, {prop: "current", name: "current", anonymous: false, exported: false, typ: mapType$1, tag: ""}]);
	tasksViewCtx.init("github.com/dotchain/fuss/todo", [{prop: "Cache", name: "Cache", anonymous: true, exported: true, typ: core.Cache, tag: ""}, {prop: "TaskEditStruct", name: "TaskEditStruct", anonymous: true, exported: true, typ: TaskEditStruct, tag: ""}, {prop: "initialized", name: "initialized", anonymous: false, exported: false, typ: $Bool, tag: ""}, {prop: "stateHandler", name: "stateHandler", anonymous: false, exported: false, typ: core.Handler, tag: ""}, {prop: "dom", name: "dom", anonymous: false, exported: false, typ: structType$4, tag: ""}, {prop: "memoized", name: "memoized", anonymous: false, exported: false, typ: structType$5, tag: ""}]);
	TasksViewStruct.init("github.com/dotchain/fuss/todo", [{prop: "old", name: "old", anonymous: false, exported: false, typ: mapType$2, tag: ""}, {prop: "current", name: "current", anonymous: false, exported: false, typ: mapType$2, tag: ""}]);
	Task.init("", [{prop: "ID", name: "ID", anonymous: false, exported: true, typ: $String, tag: ""}, {prop: "Done", name: "Done", anonymous: false, exported: true, typ: $Bool, tag: ""}, {prop: "Description", name: "Description", anonymous: false, exported: true, typ: $String, tag: ""}]);
	Tasks.init(Task);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = changes.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = refs.$init(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = core.$init(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = dom.$init(); /* */ $s = 4; case 4: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["main"] = (function() {
	var $pkg = {}, $init, core, dom, js, todo, js$1, dn, ptrType, main;
	core = $packages["github.com/dotchain/fuss/core"];
	dom = $packages["github.com/dotchain/fuss/dom"];
	js = $packages["github.com/dotchain/fuss/dom/js"];
	todo = $packages["github.com/dotchain/fuss/todo"];
	js$1 = $packages["github.com/gopherjs/gopherjs/js"];
	dn = $pkg.dn = $newType(8, $kindInterface, "main.dn", true, "main", false, null);
	ptrType = $ptrType(js$1.Object);
	main = function() {
		var _r, _r$1, app, container, root, s, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r = $f._r; _r$1 = $f._r$1; app = $f.app; container = $f.container; root = $f.root; s = $f.s; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		app = [app];
		s = [s];
		container = $global.document.querySelector($externalize("#container", $String));
		s[0] = todo.NewTasksStream(new todo.Tasks([new todo.Task.ptr("one", true, "First task"), new todo.Task.ptr("two", false, "Second task")]));
		app[0] = new todo.AppStruct.ptr(false, false);
		app[0].Begin();
		_r = app[0].App(new $String("root"), new dom.Styles.ptr(""), s[0]); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		root = _r;
		$r = app[0].End(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		_r$1 = $assertType(root, dn).DOMNode(); /* */ $s = 3; case 3: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		container.appendChild(_r$1);
		s[0].Notifier.On(new core.Handler.ptr((function(app, s) { return function $b() {
			var _r$2, $s, $r;
			/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; _r$2 = $f._r$2; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
			s[0] = s[0].Latest();
			app[0].Begin();
			_r$2 = app[0].App(new $String("root"), new dom.Styles.ptr(""), s[0]); /* */ $s = 1; case 1: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
			_r$2;
			$r = app[0].End(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
			$s = -1; return;
			/* */ } return; } if ($f === undefined) { $f = { $blk: $b }; } $f._r$2 = _r$2; $f.$s = $s; $f.$r = $r; return $f;
		}; })(app, s)));
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: main }; } $f._r = _r; $f._r$1 = _r$1; $f.app = app; $f.container = container; $f.root = root; $f.s = s; $f.$s = $s; $f.$r = $r; return $f;
	};
	dn.init([{prop: "DOMNode", name: "DOMNode", pkg: "", typ: $funcType([], [ptrType], false)}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = core.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = dom.$init(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = js.$init(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = todo.$init(); /* */ $s = 4; case 4: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = js$1.$init(); /* */ $s = 5; case 5: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* */ if ($pkg === $mainPkg) { $s = 6; continue; }
		/* */ $s = 7; continue;
		/* if ($pkg === $mainPkg) { */ case 6:
			$r = main(); /* */ $s = 8; case 8: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
			$mainFinished = true;
		/* } */ case 7:
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
