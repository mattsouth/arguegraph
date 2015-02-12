should = require('chai').should()
Arguejs = require '../src/arguejs'
Parser = require '../src/informal'
Tests = require './test'
Async = require 'async'
Mocha = require 'mocha'

describe 'Argument Framework', ->
    it 'single unattacked argument', (done) ->
        trivial = new Arguejs.ArgumentFramework Parser.parseInformal 'a'
        trivial.isConflictFree([]).should.be.true
        trivial.isConflictFree([{id: 0}]).should.be.true
        trivial.isAcceptable({id:0}, []).should.be.true
        trivial.isAdmissible([{id:0}]).should.be.true
        done()

    it 'self attacking argument', (done) ->
        depressed = new Arguejs.ArgumentFramework Parser.parseInformal 'a a'
        console.log depressed
        depressed.isConflictFree([]).should.be.true
        depressed.isConflictFree([{id: 0}]).should.be.false
        depressed.isAcceptable({id:0}, [{id: 0}]).should.be.true
        depressed.isAdmissible([{id:0}]).should.be.false
        done()

    it 'chain of three', (done) ->
        basic = new Arguejs.ArgumentFramework Parser.parseInformal 'a b\\nb c'
        basic.isConflictFree([{id: 0}]).should.be.true
        basic.isConflictFree([{id: 0},{id: 1}]).should.be.false
        basic.isConflictFree([{id: 0},{id: 2}]).should.be.true
        basic.isAcceptable({id:0}, []).should.be.false
        basic.isAcceptable({id:0}, [{id:0}]).should.be.false
        basic.isAcceptable({id:0}, [{id:0},{id:2}]).should.be.true
        basic.isAdmissible([{id:0},{id:2}]).should.be.true
        done()

suite = describe 'Grounded Semantics', ->
    before (done) ->
        for test in Tests
            do (test) ->
                suite.addTest new Mocha.Test test.name, ->
                    graph = Parser.parseInformal test.graph
                    Arguejs.grounded graph
                    for own key, val of test.grounded
                        match = node for node in graph.nodes when node.label is key
                        match.grounded.should.equal val
        done()                   
    
    # dummy test needed by mocha to see dynamic tests.
    # todo: replace with something sensible
    it 'dummy', ->
        true.should.true
    