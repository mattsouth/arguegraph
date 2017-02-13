should = require('chai').should()
AG = require '../src/arguegraph'
Async = require 'async'
Mocha = require 'mocha'

describe 'A Labelling', ->
  describe 'should provide expected legality check for ', ->
    it 'chain of three', (done) ->
      basic = new AG.ArgumentFramework { '0' : ['1'], '1' : ['2'], '2' : [] }
      # check that the label undec doesnt serve as a wildcard
      basic.isLegalLabelling(new AG.Labelling([],[],['0','1','2'])).should.be.false
      # check expected labelling
      basic.isLegalLabelling(new AG.Labelling(['0','2'],['1'],[])).should.be.true
      done()

    it 'symmetric defeat', (done) ->
      symmetric = new AG.ArgumentFramework { '0' : ['1'], '1' : ['0'] }
      # catch labelling with missing arguments
      symmetric.isLegalLabelling(new AG.Labelling(['0'],[],[])).should.be.false
      # check expected labellings
      symmetric.isLegalLabelling(new AG.Labelling(['0'],['1'],[])).should.be.true
      symmetric.isLegalLabelling(new AG.Labelling(['1'],['0'],[])).should.be.true
      symmetric.isLegalLabelling(new AG.Labelling([],[],['0','1'])).should.be.true
      done()
  it "should not use 'undec' as a wild card"
  it "should catch a labelling with missing arguments"

describe 'An Argument Framework', ->
  describe 'with malformed constructor param', ->
    it 'should throw error if param isnt map of arrays', (done) ->
      try
        af = new AG.ArgumentFramework ['0']
        false.should.be.true
      catch e
        e.message.should.equal '@defeatermap[0] isnt an array.  @defeatermap must contain arrays.'
      done()

    it 'should throw error if map of arrays is incomplete', (done) ->
      try
        af = new AG.ArgumentFramework {'0':['1']}
        false.should.be.true
      catch e
        e.message.should.equal 'unknown @defeatermap defeater of 0 - 1'
      done()

  describe 'with malformed query params should throw errors', ->
    it 'for single arg params', (done) ->
      try
        af = new AG.ArgumentFramework {'0':['1'],'1':[]}
        attackers = af.defeatedBy('2')
        false.should.be.true
      catch e
        e.message.should.equal 'unknown arg - 2'
      done()
    it 'for arg set params', (done) ->
      try
        af = new AG.ArgumentFramework {'0':['1'],'1':[]}
        af.isDefeated '1', ['2']
        false.should.be.true
      catch e
        e.message.should.equal 'unknown members of args - [2]'
      done()
      
  describe 'should give expected query results for a ', ->
    it 'single argument', (done) ->
      trivial = new AG.ArgumentFramework { '0' : [] }
      trivial.isConflictFree([]).should.be.true
      trivial.isConflictFree(['0']).should.be.true
      trivial.isAcceptable('0', []).should.be.true
      trivial.isAdmissible(['0']).should.be.true
      trivial.isComplete(['0']).should.be.true
      trivial.isStable(['0']).should.be.true
      done()

    it 'self defeating argument', (done) ->
      depressed = new AG.ArgumentFramework { '0' : ['0'] }
      depressed.isConflictFree(['0']).should.be.false
      depressed.isAcceptable('0', ['0']).should.be.true
      depressed.isAdmissible(['0']).should.be.false
      depressed.isComplete(['0']).should.be.false
      depressed.isStable(['0']).should.be.false
      done()

    it 'symmetric defeat', (done) ->
      symmetric = new AG.ArgumentFramework { '0' : ['1'], '1' : ['0'] }
      symmetric.isComplete(['0']).should.be.true
      symmetric.isComplete(['1']).should.be.true
      done()

    it 'chain of three', (done) ->
      basic = new AG.ArgumentFramework { '0' : ['1'], '1' : ['2'], '2' : [] }
      basic.isConflictFree(['0']).should.be.true
      basic.isConflictFree(['0','1']).should.be.false
      basic.isConflictFree(['0','2']).should.be.true
      basic.isAcceptable('0', []).should.be.false
      basic.isAcceptable('0', ['0']).should.be.false
      basic.isAcceptable('0', ['0','2']).should.be.true
      basic.isAdmissible(['0','2']).should.be.true
      basic.isComplete(['0','2']).should.be.true
      basic.isStable(['0','2']).should.be.true
      done()

  describe.skip 'should generate all complete labellings for', ->
    it 'basic', (done) ->
      af = new AG.ArgumentFramework { 'A' : [], 'B' : ['A'] }
      labellings = af.completeLabellings()
      labellings.should.have.length 1
      labellings.should.include new AG.Labelling(['A'],['B'],[])
      done()

    it 'symmetric defeat', (done) ->
      af = new AG.ArgumentFramework { 'A' : ['B'], 'B' : ['A'] }
      labellings = af.completeLabellings()
      labellings.should.have.length 3
      labellings.should.include new AG.Labelling(['A'],['B'],[])
      labellings.should.include new AG.Labelling(['B'],['A'],[])
      labellings.should.include new AG.Labelling([],[],['A','B'])
      done()

    it 'canonical', (done) ->
      af = new AG.ArgumentFramework { 'A' : [], 'B' : ['A'], 'C' : ['B','D'], 'D' : ['C'], 'E': ['D'] }
      labellings = af.completeLabellings()
      labellings.should.have.length 2
      labellings.should.include new AG.Labelling(['A'],['B'],['C','D','E'])
      labellings.should.include new AG.Labelling(['A','C','E'],['B','D'],[])
      done()

describe 'Grounded reasoner', ->
  it 'chain of three', (done) ->
    basic = new AG.ArgumentFramework { '0' : ['1'], '1' : ['2'], '2' : [] }
    reasoner = new AG.GroundedReasoner(basic)
    extensions = reasoner.extensions()
    extensions.should.have.length 1 # by definition for this reasoner!
    extension = extensions[0]
    extension.should.have.length 2
    extension.should.include '0'
    extension.should.include '2'
    done()

  it 'tree with cross defeat', (done) ->
    af = new AG.ArgumentFramework { '0' : [], '1' : ['0'], '2' : ['1','3'], '3': ['1'] }
    reasoner = new AG.GroundedReasoner(af)
    extension = reasoner.extensions()[0]
    extension.should.have.length 2
    extension.should.include '0'
    extension.should.include '3'
    done()

describe 'Preferred reasoner', ->
  it 'chain of three', (done) ->
    basic = new AG.ArgumentFramework { '0' : ['1'], '1' : ['2'], '2' : [] }
    reasoner = new AG.PreferredReasoner(basic)
    extension = reasoner.extensions()[0]
    extension.should.have.length 2
    extension.should.include '0'
    extension.should.include '2'
    done()

  it 'cycle of three', (done) ->
    cycle = new AG.ArgumentFramework { '0' : ['1'], '1' : ['2'], '2' : ['0'] }
    reasoner = new AG.PreferredReasoner(cycle)
    labellings = reasoner.labellings()
    labellings.should.have.length 1
    labellings.should.include new AG.Labelling([],[],['0','1','2'])
    done()

  it 'symmetric defeat', (done) ->
    af = new AG.ArgumentFramework { 'A' : ['B'], 'B' : ['A'] }
    reasoner = new AG.PreferredReasoner(af)
    labellings = reasoner.labellings()
    labellings.should.have.length 2
    labellings.should.include new AG.Labelling(['A'],['B'],[])
    labellings.should.include new AG.Labelling(['B'],['A'],[])
    done()
