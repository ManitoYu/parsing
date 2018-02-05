;(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
	typeof define === 'function' && define.amd ? define(factory) :
	global.JSONParser = factory()
}(this, (function () { 'use strict'

function firstNonmatchingIndex(s1: string, s2: string, offset: number) {
	let i = 0
	while (i + offset < s1.length && i < s2.length) {
		if (s1.charAt(i + offset) != s2.charAt(i)) return i
		i += 1
	}
	if (s1.length - offset >= s2.length) return -1
	return s1.length - offset
}

function andThen<A, B, C>(f: (a: A) => B, g: (b: B) => C): (a: A) => C {
	return a => g(f(a))
}

function compose<A, B, C>(g: (b: B) => C, f: (a: A) => B): (a: A) => C {
	return a => g(f(a))
}

class ParseLocation {
	constructor(public input: string, public offset: number = 0) {
	}

	get line() {
		const numNewLineChars = this.input.slice(0, this.offset + 1).match(/\n/g)
		if (numNewLineChars == null) return 1
		return numNewLineChars.length + 1
	}

	get col() {
		const index = this.input.slice(0, this.offset + 1).lastIndexOf('\n')
		return index == -1 ? this.offset + 1 : this.offset - index
	}

	toError(msg: string): ParseError {
		return new ParseError([[this, msg]])
	}

	advanceBy(n: number) {
		return new ParseLocation(this.input, this.offset + n)
	}
}

class ParseState {
	constructor(public loc: ParseLocation) {
	}

	advanceBy(numChars: number) {
		return new ParseState(new ParseLocation(this.loc.input, this.loc.offset + numChars))
	}

	get input() {
		return this.loc.input.slice(this.loc.offset)
	}
	
	slice(n: number) {
		return this.loc.input.slice(this.loc.offset, this.loc.offset + n)
	}
}

class ParseError {
	constructor(public stack: [ParseLocation, string][]) {
	}

	push(loc: ParseLocation, msg: string) {
		return new ParseError([[loc, msg], ...this.stack])
	}

	label<A>(s: string) {
		const loc = this.latestLoc()
		return new ParseError(loc == null ? [] : [[loc, s]])
	}

	latest() {
		if (this.stack.length == 0) return null
		return this.stack[this.stack.length - 1]
	}

	latestLoc() {
		const error = this.latest()
		return error == null ? null : error[0]
	}
}

class Result<A> {
	uncommit(): Result<A> {
		if (this instanceof Failure) {
			return new Failure((this as Failure).get, false)
		}
		return this
	}

	addCommit(isCommitted: boolean): Result<A> {
		if (this instanceof Failure) {
			return new Failure((this as Failure).get, (this as Failure).isCommitted || isCommitted)
		}
		return this
	}

	mapError(f: (e: ParseError) => ParseError): Result<A> {
		if (this instanceof Failure) {
			return new Failure(f((this as Failure).get), (this as Failure).isCommitted)
		}
		return this
	}

	advanceSuccess(n: number): Result<A> {
		if (this instanceof Success) {
			return new Success((this as Success<A>).get, (this as Success<A>).length + n)
		}
		return this
	}
}
class Success<A> extends Result<A> {
	constructor(public get: A, public length: number) {
		super()
	}
}
class Failure extends Result<void> {
	constructor(public get: ParseError, public isCommitted: boolean) {
		super()
	}
}

type Parser<A> = (s: ParseState) => Result<A>

class Parsers {
	or<A>(p: Parser<A>, p2: () => Parser<A>): Parser<A> {
		return s => {
			const result = p(s)
			if (result instanceof Failure) {
				return p2()(s)
			}
			return result
		}
	}

	succeed<A>(a: A): Parser<A> {
		return s => new Success(a, 0)
	}

	flatMap<A, B>(p: Parser<A>): (f: (a: A) => Parser<B>) => Parser<B> {
		return f => s => {
			const result = p(s)
			if (result instanceof Success) {
				const success = <Success<A>>result
				return f(success.get)(s.advanceBy(success.length))
					.addCommit(success.length != 0)
					.advanceSuccess(success.length)
			}
			return result
		}
	}

	map<A, B>(p: Parser<A>): (f: (a: A) => B) => Parser<B> {
		return f => this.flatMap(p)(andThen(f, this.succeed.bind(this)))
	}

	map2<A, B, C>(p: Parser<A>, p2: () => Parser<B>): (f: (a: A, b: B) => C) => Parser<C> {
		return f => this.flatMap(p)(a => this.map(p2())(b => f(a, b)))
	}

	product<A, B>(p: Parser<A>, p2: () => Parser<B>): Parser<[A, B]> {
		return this.flatMap(p)(a => this.map(p2())(b => [a, b]))
	}

	skipL<B>(p: Parser<any>, p2: () => Parser<B>): Parser<B> {
		return this.map2(this.slice(p), p2)((_, b) => b)
	}

	skipR<A>(p: Parser<A>, p2: () => Parser<any>): Parser<A> {
		return this.map2(p, () => this.slice(p2()))((a, _) => a)
	}

	as<A, B>(p: Parser<A>): (b: B) => Parser<B> {
		return b => this.map(this.slice(p))(_ => b)
	}

	surround<A>(start: Parser<any>, stop: Parser<any>): (p: () => Parser<A>) => Parser<A> {
		return p => this.skipR(this.skipL(start, p), () => stop)
	}

	whitespace() {
		return this.regex('\\s*')
	}

	digits() {
		return this.regex('\\d+')
	}

	thru(s: string) {
		return this.regex(`.*?${s}`)
	}

	quoted() {
		return this.map(this.skipL(this.string('\"'), () => this.thru('\"')))(s => s.slice(0, -1))
	}

	escapedQuoted() {
		return this.token(this.label('string literal')(this.quoted()))
	}

	doubleString() {
		return this.token(this.regex('[-+]?([0-9]*\\.)?[0-9]+([eE][-+]?[0-9]+)?'))
	}

	double() {
		return this.label('double literal')(this.map(this.doubleString())(a => parseFloat(a)))
	}

	token<A>(p: Parser<A>) {
		return this.skipR(this.attempt(p), this.whitespace.bind(this))
	}

	sep<A>(p: Parser<A>, p2: Parser<any>): Parser<A[]> {
		return this.or(this.sep1(p, p2), () => this.succeed([]))
	}

	sep1<A>(p: Parser<A>, p2: Parser<any>): Parser<A[]> {
		return this.map2(p, () => this.many(this.skipL(p2, () => p)))((a, l) => [a, ...l])
	}

	eof() {
		return this.label('unexpected trailing characters')(this.regex('\\z'))
	}

	root<A>(p: Parser<A>) {
		return this.skipR(p, () => this.eof())
	}

	string(w: string): Parser<string> {
		const msg = "'" + w + "'"
    return this.token(s => {
			const i = firstNonmatchingIndex(s.loc.input, w, s.loc.offset)
			return i == -1
				? new Success(w, w.length)
				: new Failure(s.loc.advanceBy(i).toError(msg), i != 0)
    })
	}

	many<A>(p: Parser<A>): Parser<A[]> {
		return this.or(this.map2(p, () => this.many(p))((a, l) => [a, ...l]), () => this.succeed([]))
	}

	many1<A>(p: Parser<A>): Parser<A[]> {
		return this.map2(p, () => this.many(p))((a, l) => [a, ...l])
	}

	// FIXME
	regex(r: string): Parser<string> {
		const msg = 'regex ' + r
		return s => {
			const matchResult = s.input.match(new RegExp('^' + r))
			if (matchResult == null) return new Failure(s.loc.toError(msg), false)
			return new Success(matchResult[0], matchResult[0].length)
		}
	}

	slice<A>(p: Parser<A>): Parser<string> {
		return s => {
			const result = p(s)
			if (this instanceof Success) {
				return new Success(s.slice((this as Success<A>).length), (this as Success<A>).length)
			}
			return result
		}
	}

	attempt<A>(p: Parser<A>): Parser<A> {
		return s => p(s).uncommit()
	}

	label<A>(msg: string): (p: Parser<A>) => Parser<A> {
		return p => s => p(s).mapError(e => e.label(msg))
	}
	
	scope<A>(msg: string): (p: Parser<A>) => Parser<A> {
		return p => s => p(s).mapError(e => e.push(s.loc, msg))
	}

	run<A>(p: Parser<A>): (s: string) => any {
		return s => {
			return p(new ParseState(new ParseLocation(s)))
		}
	}
}

const p = new Parsers()

function array() {
	return p.scope('array')(
		p.surround(p.string('['), p.string(']'))(() =>
			p.sep(value(), p.string(','))
		)
	)
}

function obj() {
	return p.scope('object')(
		p.surround(p.string('{'), p.string('}'))(() =>
			p.map(p.sep(keyval(), p.string(',')))(kvs =>
				kvs.reduce((o, kv) => {
					o[kv[0]] = kv[1]
					return o
				}, {})
			)
		)
	)
}

function value() {
	return p.or(lit(), () => p.or(obj(), array))
}

function keyval() {
	return p.product(p.escapedQuoted(), () => p.skipL(p.string(':'), value))
}

function lit() {
	return p.or(
		p.as(p.string('null'))(null),
		() => p.or(p.double(),
			() => p.or(p.escapedQuoted(),
				() => p.or(p.as(p.string('true'))(true),
					() => p.as(p.string('false'))(false))
				)
			)
		)
}

const parser = p.skipL(p.whitespace(), () => p.or(array(), obj))

return json => p.run(parser)(json).get

})))