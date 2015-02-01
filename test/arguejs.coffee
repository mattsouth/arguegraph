should = require('chai').should()
Arguejs = require '../src/arguejs'
Tests = require './test'
Async = require 'async'
Mocha = require 'mocha'

describe 'Informal Parser', ->
    it 'should parse a simple graph', ->
        grph = Arguejs.parseInformal "a b"
        grph.nodes.should.have.length 2
        grph.edges.should.have.length 1
    it 'should parse a multi-line graph', ->
        grph = Arguejs.parseInformal "a b\\na b"
        grph.nodes.should.have.length 2
        grph.edges.should.have.length 2

suite = describe 'Grounded Semantics', ->
    before (done) ->
        for test in Tests
            do (test) ->
                suite.addTest new Mocha.Test test.name, ->
                    graph = Arguejs.parseInformal test.graph
                    Arguejs.grounded graph
                    for own key, val of test.grounded
                        match = node for node in graph.nodes when node.label is key
                        match.grounded.should.equal val
        done()                   
    
    # dummy test needed by mocha to see dynamic tests.
    # todo: replace with something sensible
    it 'dummy', ->
        true.should.true
    