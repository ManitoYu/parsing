var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
;
(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
        typeof define === 'function' && define.amd ? define(factory) :
            global.JSONParser = factory();
}(this, (function () {
    'use strict';
    function firstNonmatchingIndex(s1, s2, offset) {
        var i = 0;
        while (i + offset < s1.length && i < s2.length) {
            if (s1.charAt(i + offset) != s2.charAt(i))
                return i;
            i += 1;
        }
        if (s1.length - offset >= s2.length)
            return -1;
        return s1.length - offset;
    }
    function andThen(f, g) {
        return function (a) { return g(f(a)); };
    }
    function compose(g, f) {
        return function (a) { return g(f(a)); };
    }
    var ParseLocation = /** @class */ (function () {
        function ParseLocation(input, offset) {
            if (offset === void 0) { offset = 0; }
            this.input = input;
            this.offset = offset;
        }
        Object.defineProperty(ParseLocation.prototype, "line", {
            get: function () {
                var numNewLineChars = this.input.slice(0, this.offset + 1).match(/\n/g);
                if (numNewLineChars == null)
                    return 1;
                return numNewLineChars.length + 1;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(ParseLocation.prototype, "col", {
            get: function () {
                var index = this.input.slice(0, this.offset + 1).lastIndexOf('\n');
                return index == -1 ? this.offset + 1 : this.offset - index;
            },
            enumerable: true,
            configurable: true
        });
        ParseLocation.prototype.toError = function (msg) {
            return new ParseError([[this, msg]]);
        };
        ParseLocation.prototype.advanceBy = function (n) {
            return new ParseLocation(this.input, this.offset + n);
        };
        return ParseLocation;
    }());
    var ParseState = /** @class */ (function () {
        function ParseState(loc) {
            this.loc = loc;
        }
        ParseState.prototype.advanceBy = function (numChars) {
            return new ParseState(new ParseLocation(this.loc.input, this.loc.offset + numChars));
        };
        Object.defineProperty(ParseState.prototype, "input", {
            get: function () {
                return this.loc.input.slice(this.loc.offset);
            },
            enumerable: true,
            configurable: true
        });
        ParseState.prototype.slice = function (n) {
            return this.loc.input.slice(this.loc.offset, this.loc.offset + n);
        };
        return ParseState;
    }());
    var ParseError = /** @class */ (function () {
        function ParseError(stack) {
            this.stack = stack;
        }
        ParseError.prototype.push = function (loc, msg) {
            return new ParseError([[loc, msg]].concat(this.stack));
        };
        ParseError.prototype.label = function (s) {
            var loc = this.latestLoc();
            return new ParseError(loc == null ? [] : [[loc, s]]);
        };
        ParseError.prototype.latest = function () {
            if (this.stack.length == 0)
                return null;
            return this.stack[this.stack.length - 1];
        };
        ParseError.prototype.latestLoc = function () {
            var error = this.latest();
            return error == null ? null : error[0];
        };
        return ParseError;
    }());
    var Result = /** @class */ (function () {
        function Result() {
        }
        Result.prototype.uncommit = function () {
            if (this instanceof Failure) {
                return new Failure(this.get, false);
            }
            return this;
        };
        Result.prototype.addCommit = function (isCommitted) {
            if (this instanceof Failure) {
                return new Failure(this.get, this.isCommitted || isCommitted);
            }
            return this;
        };
        Result.prototype.mapError = function (f) {
            if (this instanceof Failure) {
                return new Failure(f(this.get), this.isCommitted);
            }
            return this;
        };
        Result.prototype.advanceSuccess = function (n) {
            if (this instanceof Success) {
                return new Success(this.get, this.length + n);
            }
            return this;
        };
        return Result;
    }());
    var Success = /** @class */ (function (_super) {
        __extends(Success, _super);
        function Success(get, length) {
            var _this = _super.call(this) || this;
            _this.get = get;
            _this.length = length;
            return _this;
        }
        return Success;
    }(Result));
    var Failure = /** @class */ (function (_super) {
        __extends(Failure, _super);
        function Failure(get, isCommitted) {
            var _this = _super.call(this) || this;
            _this.get = get;
            _this.isCommitted = isCommitted;
            return _this;
        }
        return Failure;
    }(Result));
    var Parsers = /** @class */ (function () {
        function Parsers() {
        }
        Parsers.prototype.or = function (p, p2) {
            return function (s) {
                var result = p(s);
                if (result instanceof Failure) {
                    return p2()(s);
                }
                return result;
            };
        };
        Parsers.prototype.succeed = function (a) {
            return function (s) { return new Success(a, 0); };
        };
        Parsers.prototype.flatMap = function (p) {
            return function (f) { return function (s) {
                var result = p(s);
                if (result instanceof Success) {
                    var success = result;
                    return f(success.get)(s.advanceBy(success.length))
                        .addCommit(success.length != 0)
                        .advanceSuccess(success.length);
                }
                return result;
            }; };
        };
        Parsers.prototype.map = function (p) {
            var _this = this;
            return function (f) { return _this.flatMap(p)(andThen(f, _this.succeed.bind(_this))); };
        };
        Parsers.prototype.map2 = function (p, p2) {
            var _this = this;
            return function (f) { return _this.flatMap(p)(function (a) { return _this.map(p2())(function (b) { return f(a, b); }); }); };
        };
        Parsers.prototype.product = function (p, p2) {
            var _this = this;
            return this.flatMap(p)(function (a) { return _this.map(p2())(function (b) { return [a, b]; }); });
        };
        Parsers.prototype.skipL = function (p, p2) {
            return this.map2(this.slice(p), p2)(function (_, b) { return b; });
        };
        Parsers.prototype.skipR = function (p, p2) {
            var _this = this;
            return this.map2(p, function () { return _this.slice(p2()); })(function (a, _) { return a; });
        };
        Parsers.prototype.as = function (p) {
            var _this = this;
            return function (b) { return _this.map(_this.slice(p))(function (_) { return b; }); };
        };
        Parsers.prototype.surround = function (start, stop) {
            var _this = this;
            return function (p) { return _this.skipR(_this.skipL(start, p), function () { return stop; }); };
        };
        Parsers.prototype.whitespace = function () {
            return this.regex('\\s*');
        };
        Parsers.prototype.digits = function () {
            return this.regex('\\d+');
        };
        Parsers.prototype.thru = function (s) {
            return this.regex(".*?" + s);
        };
        Parsers.prototype.quoted = function () {
            var _this = this;
            return this.map(this.skipL(this.string('\"'), function () { return _this.thru('\"'); }))(function (s) { return s.slice(0, -1); });
        };
        Parsers.prototype.escapedQuoted = function () {
            return this.token(this.label('string literal')(this.quoted()));
        };
        Parsers.prototype.doubleString = function () {
            return this.token(this.regex('[-+]?([0-9]*\\.)?[0-9]+([eE][-+]?[0-9]+)?'));
        };
        Parsers.prototype.double = function () {
            return this.label('double literal')(this.map(this.doubleString())(function (a) { return parseFloat(a); }));
        };
        Parsers.prototype.token = function (p) {
            return this.skipR(this.attempt(p), this.whitespace.bind(this));
        };
        Parsers.prototype.sep = function (p, p2) {
            var _this = this;
            return this.or(this.sep1(p, p2), function () { return _this.succeed([]); });
        };
        Parsers.prototype.sep1 = function (p, p2) {
            var _this = this;
            return this.map2(p, function () { return _this.many(_this.skipL(p2, function () { return p; })); })(function (a, l) { return [a].concat(l); });
        };
        Parsers.prototype.eof = function () {
            return this.label('unexpected trailing characters')(this.regex('\\z'));
        };
        Parsers.prototype.root = function (p) {
            var _this = this;
            return this.skipR(p, function () { return _this.eof(); });
        };
        Parsers.prototype.string = function (w) {
            var msg = "'" + w + "'";
            return this.token(function (s) {
                var i = firstNonmatchingIndex(s.loc.input, w, s.loc.offset);
                return i == -1
                    ? new Success(w, w.length)
                    : new Failure(s.loc.advanceBy(i).toError(msg), i != 0);
            });
        };
        Parsers.prototype.many = function (p) {
            var _this = this;
            return this.or(this.map2(p, function () { return _this.many(p); })(function (a, l) { return [a].concat(l); }), function () { return _this.succeed([]); });
        };
        Parsers.prototype.many1 = function (p) {
            var _this = this;
            return this.map2(p, function () { return _this.many(p); })(function (a, l) { return [a].concat(l); });
        };
        // FIXME
        Parsers.prototype.regex = function (r) {
            var msg = 'regex ' + r;
            return function (s) {
                var matchResult = s.input.match(new RegExp('^' + r));
                if (matchResult == null)
                    return new Failure(s.loc.toError(msg), false);
                return new Success(matchResult[0], matchResult[0].length);
            };
        };
        Parsers.prototype.slice = function (p) {
            var _this = this;
            return function (s) {
                var result = p(s);
                if (_this instanceof Success) {
                    return new Success(s.slice(_this.length), _this.length);
                }
                return result;
            };
        };
        Parsers.prototype.attempt = function (p) {
            return function (s) { return p(s).uncommit(); };
        };
        Parsers.prototype.label = function (msg) {
            return function (p) { return function (s) { return p(s).mapError(function (e) { return e.label(msg); }); }; };
        };
        Parsers.prototype.scope = function (msg) {
            return function (p) { return function (s) { return p(s).mapError(function (e) { return e.push(s.loc, msg); }); }; };
        };
        Parsers.prototype.run = function (p) {
            return function (s) {
                return p(new ParseState(new ParseLocation(s)));
            };
        };
        return Parsers;
    }());
    var p = new Parsers();
    function array() {
        return p.scope('array')(p.surround(p.string('['), p.string(']'))(function () {
            return p.sep(value(), p.string(','));
        }));
    }
    function obj() {
        return p.scope('object')(p.surround(p.string('{'), p.string('}'))(function () {
            return p.map(p.sep(keyval(), p.string(',')))(function (kvs) {
                return kvs.reduce(function (o, kv) {
                    o[kv[0]] = kv[1];
                    return o;
                }, {});
            });
        }));
    }
    function value() {
        return p.or(lit(), function () { return p.or(obj(), array); });
    }
    function keyval() {
        return p.product(p.escapedQuoted(), function () { return p.skipL(p.string(':'), value); });
    }
    function lit() {
        return p.or(p.as(p.string('null'))(null), function () { return p.or(p.double(), function () { return p.or(p.escapedQuoted(), function () { return p.or(p.as(p.string('true'))(true), function () { return p.as(p.string('false'))(false); }); }); }); });
    }
    var parser = p.skipL(p.whitespace(), function () { return p.or(array(), obj); });
    return function (json) { return p.run(parser)(json).get; };
})));
