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
    done()

describe 'Labelling', ->
  describe 'Legality', ->
    it 'symmetric defeat', (done) ->
      symmetric = new Arguejs.ArgumentFramework { '0' : ['1'], '1' : ['0'] }
      # catch labelling with missing arguments
      symmetric.isLegalLabelling(new Arguejs.Labelling(['0'],[],[])).should.be.false
      # check expected labellings
      symmetric.isLegalLabelling(new Arguejs.Labelling(['0'],['1'],[])).should.be.true
      symmetric.isLegalLabelling(new Arguejs.Labelling(['1'],['0'],[])).should.be.true
      symmetric.isLegalLabelling(new Arguejs.Labelling([],[],['0','1'])).should.be.true
      done()

    it 'chain of three', (done) ->
      basic = new Arguejs.ArgumentFramework { '0' : ['1'], '1' : ['2'], '2' : [] }
      # check that the label undec doesnt serve as a wildcard
      basic.isLegalLabelling(new Arguejs.Labelling([],[],['0','1','2'])).should.be.false
      # check expected labelling
      basic.isLegalLabelling(new Arguejs.Labelling(['0','2'],['1'],[])).should.be.true
      done()

  describe.skip 'Generation', ->
    it 'basic', (done) ->
      af = new Arguejs.ArgumentFramework { 'A' : [], 'B' : ['A'] }
      labellings = af.completeLabellings()
      labellings.should.have.length 1
      labellings.should.include new Arguejs.Labelling(['A'],['B'],[])
      done()

    it 'symmetric defeat', (done) ->
      af = new Arguejs.ArgumentFramework { 'A' : ['B'], 'B' : ['A'] }
      labellings = af.completeLabellings()
      labellings.should.have.length 3
      labellings.should.include new Arguejs.Labelling(['A'],['B'],[])
      labellings.should.include new Arguejs.Labelling(['B'],['A'],[])
      labellings.should.include new Arguejs.Labelling([],[],['A','B'])
      done()

    it 'canonical', (done) ->
      af = new Arguejs.ArgumentFramework { 'A' : [], 'B' : ['A'], 'C' : ['B','D'], 'D' : ['C'], 'E': ['D'] }
      labellings = af.completeLabellings()
      labellings.should.have.length 2
      labellings.should.include new Arguejs.Labelling(['A'],['B'],['C','D','E'])
      labellings.should.include new Arguejs.Labelling(['A','C','E'],['B','D'],[])
      done()

describe 'Grounded reasoner', ->
  it 'chain of three', (done) ->
    basic = new Arguejs.ArgumentFramework { '0' : ['1'], '1' : ['2'], '2' : [] }
    reasoner = new Arguejs.GroundedReasoner(basic)
    extensions = reasoner.extensions()
    extensions.should.have.length 1 # by definition for this reasoner!
    extension = extensions[0]
    extension.should.have.length 2
    extension.should.include '0'
    extension.should.include '2'
    done()

  it 'tree with cross defeat', (done) ->
    af = new Arguejs.ArgumentFramework { '0' : [], '1' : ['0'], '2' : ['1','3'], '3': ['1'] }
    reasoner = new Arguejs.GroundedReasoner(af)
    extension = reasoner.extensions()[0]
    extension.should.have.length 2
    extension.should.include '0'
    extension.should.include '3'
    done()

describe 'Preferred reasoner', ->
  it 'chain of three', (done) ->
    basic = new Arguejs.ArgumentFramework { '0' : ['1'], '1' : ['2'], '2' : [] }
    reasoner = new Arguejs.PreferredReasoner(basic)
    extension = reasoner.extensions()[0]
    extension.should.have.length 2
    extension.should.include '0'
    extension.should.include '2'
    done()

  it 'cycle of three', (done) ->
    cycle = new Arguejs.ArgumentFramework { '0' : ['1'], '1' : ['2'], '2' : ['0'] }
    reasoner = new Arguejs.PreferredReasoner(cycle)
    labellings = reasoner.labellings()
    labellings.should.have.length 1
    labellings.should.include new Arguejs.Labelling([],[],['0','1','2'])
    done()

  # todo: should Arguejs.Labelling([],[],['A','B']) be valid here?
  it 'symmetric defeat', (done) ->
    af = new Arguejs.ArgumentFramework { 'A' : ['B'], 'B' : ['A'] }
    reasoner = new Arguejs.PreferredReasoner(af)
    labellings = reasoner.labellings()
    labellings.should.have.length 2
    labellings.should.include new Arguejs.Labelling(['A'],['B'],[])
    labellings.should.include new Arguejs.Labelling(['B'],['A'],[])
    done()
