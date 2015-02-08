should = require('chai').should()
Arguejs = require '../src/arguejs'
Parser = require '../src/informal'
Tests = require './test'
Async = require 'async'
Mocha = require 'mocha'

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
    