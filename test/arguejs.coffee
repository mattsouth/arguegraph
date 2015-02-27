should = require('chai').should()
Arguejs = require '../src/arguejs'
Parser = require '../src/informal'
Tests = require './test'
Async = require 'async'
Mocha = require 'mocha'

# generate ArgumentFramework From parseInformal graph
graphToAF = (graph) ->
    map = {}
    map[arg.id] = [] for arg in graph.nodes
    map[attack.to].push(attack.from.toString()) for attack in graph.edges
    new Arguejs.ArgumentFramework(map)

describe 'Argument Framework', ->
    it 'single argument', (done) ->
        # trivial = new Arguejs.ArgumentFramework { '0' : [] }
        trivial = graphToAF Parser.parseInformal "a"
        trivial.isConflictFree([]).should.be.true
        trivial.isConflictFree(['0']).should.be.true
        trivial.isAcceptable('0', []).should.be.true
        trivial.isAdmissible(['0']).should.be.true
        trivial.isComplete(['0']).should.be.true
        trivial.isStable(['0']).should.be.true
        done()

    it 'self attacking argument', (done) ->
        # depressed = new Arguejs.ArgumentFramework { '0' : ['0'] }
        depressed = graphToAF Parser.parseInformal "a a"
        depressed.isConflictFree(['0']).should.be.false
        depressed.isAcceptable('0', ['0']).should.be.true
        depressed.isAdmissible(['0']).should.be.false
        depressed.isComplete(['0']).should.be.false
        depressed.isStable(['0']).should.be.false
        done()

    it 'symmetric attack', (done) ->
        # symmetric = new Arguejs.ArgumentFramework { '0' : ['1'], '1' : ['0'] }
        symmetric = graphToAF Parser.parseInformal "a b\\nb a"
        symmetric.isComplete(['0']).should.be.true
        symmetric.isComplete(['1']).should.be.true
        done()

    it 'chain of three', (done) ->
        # basic = new Arguejs.ArgumentFramework { '0' : ['1'], '1' : ['2'], '2' : [] }
        basic = graphToAF Parser.parseInformal "a b\\nb c"
        basic.isConflictFree(['0']).should.be.true
        basic.isConflictFree(['0','1']).should.be.false
        basic.isConflictFree(['0','2']).should.be.true
        basic.isAcceptable('0', []).should.be.false
        basic.isAcceptable('0', ['0']).should.be.false
        basic.isAcceptable('0', ['0','2']).should.be.true
        basic.isAdmissible(['0','2']).should.be.true
        basic.isComplete(['0','2']).should.be.true
        basic.isStable(['0','2']).should.be.true
        basic.grounded().should.have.length 2
        basic.grounded().should.include '0'
        basic.grounded().should.include '2'
        done()

### this works, but currently adds no value
suite = describe 'Grounded Semantics', ->
    before (done) ->
        for test in Tests
            do (test) ->
                suite.addTest new Mocha.Test test.name, ->
                    graph = Parser.parseInformal(test.graph)
                    accepted = graphToAF(graph).grounded()
                    for own key, val of test.grounded
                        match = node for node in graph.nodes when node.label is key
                        (match.id.toString() in accepted).should.equal val
        done()                   
    
    # dummy test needed by mocha to see dynamic tests.
    # todo: replace with something sensible
    it 'dummy', ->
        true.should.true
###