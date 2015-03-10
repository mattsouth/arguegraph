should = require('chai').should()
Arguejs = require '../src/arguejs'
Async = require 'async'
Mocha = require 'mocha'

describe 'Argument Framework', ->
    it 'single argument', (done) ->
        trivial = new Arguejs.ArgumentFramework { '0' : [] }
        trivial.isConflictFree([]).should.be.true
        trivial.isConflictFree(['0']).should.be.true
        trivial.isAcceptable('0', []).should.be.true
        trivial.isAdmissible(['0']).should.be.true
        trivial.isComplete(['0']).should.be.true
        trivial.isStable(['0']).should.be.true
        done()

    it 'self defeating argument', (done) ->
        depressed = new Arguejs.ArgumentFramework { '0' : ['0'] }
        depressed.isConflictFree(['0']).should.be.false
        depressed.isAcceptable('0', ['0']).should.be.true
        depressed.isAdmissible(['0']).should.be.false
        depressed.isComplete(['0']).should.be.false
        depressed.isStable(['0']).should.be.false
        done()

    it 'symmetric defeat', (done) ->
        symmetric = new Arguejs.ArgumentFramework { '0' : ['1'], '1' : ['0'] }
        symmetric.isComplete(['0']).should.be.true
        symmetric.isComplete(['1']).should.be.true
        done()

    it 'chain of three', (done) ->
        basic = new Arguejs.ArgumentFramework { '0' : ['1'], '1' : ['2'], '2' : [] }
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

    it 'tree with cross defeat', (done) ->
        af = new Arguejs.ArgumentFramework { '0' : [], '1' : ['0'], '2' : ['1','3'], '3': ['1'] }
        af.grounded().should.have.length 2
        af.grounded().should.include '0'
        af.grounded().should.include '3'
        done()

describe 'Labelling', ->
    it 'isCompleteLabelling', (done) ->
        symmetric = new Arguejs.ArgumentFramework { '0' : ['1'], '1' : ['0'] }
        # catch labelling with missing arguments
        symmetric.isCompleteLabelling(new Arguejs.Labelling(['0'],[],[])).should.be.false
        # expected labellings
        symmetric.isCompleteLabelling(new Arguejs.Labelling(['0'],['1'],[])).should.be.true
        symmetric.isCompleteLabelling(new Arguejs.Labelling(['1'],['0'],[])).should.be.true
        symmetric.isCompleteLabelling(new Arguejs.Labelling([],[],['0','1'])).should.be.true
        basic = new Arguejs.ArgumentFramework { '0' : ['1'], '1' : ['2'], '2' : [] }
        # check that the label undec doesnt serve as a wildcard
        basic.isCompleteLabelling(new Arguejs.Labelling([],[],['0','1','2'])).should.be.false
        # expected labelling
        basic.isCompleteLabelling(new Arguejs.Labelling(['0','2'],['1'],[])).should.be.true        
        done()