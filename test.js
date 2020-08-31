const should = require('chai').should();
const AG = require('./lib');
const Mocha = require('mocha');

describe('A Labelling', function() {
  describe('should provide expected legality check for ', function() {
    it('chain of three', function() {
      const basic = new AG.ArgumentFramework({ '0' : ['1'], '1' : ['2'], '2' : [] });
      // check that the label undec doesnt serve as a wildcard
      basic.isLegalLabelling(new AG.Labelling([],[],['0','1','2'])).should.be.false;
      // check expected labelling
      basic.isLegalLabelling(new AG.Labelling(['0','2'],['1'],[])).should.be.true;
    });

    it('symmetric defeat', function() {
      const symmetric = new AG.ArgumentFramework({ '0' : ['1'], '1' : ['0'] });
      // catch labelling with missing arguments
      symmetric.isLegalLabelling(new AG.Labelling(['0'],[],[])).should.be.false;
      // check expected labellings
      symmetric.isLegalLabelling(new AG.Labelling(['0'],['1'],[])).should.be.true;
      symmetric.isLegalLabelling(new AG.Labelling(['1'],['0'],[])).should.be.true;
      symmetric.isLegalLabelling(new AG.Labelling([],[],['0','1'])).should.be.true;
    });
  });
});

describe('An Argument Framework', function() {
  describe('with malformed constructor param', function() {
    it('should throw error if param isnt map of arrays', function() {
      try {
        const af = new AG.ArgumentFramework(['0']);
        false.should.be.true;
      } catch (e) {
        e.message.should.equal('@defeatermap[0] isnt an array.  @defeatermap must contain arrays.');
      }
    });

    it('should throw error if map of arrays is incomplete', function() {
      try {
        const af = new AG.ArgumentFramework({'0':['1']});
        false.should.be.true;
      } catch (e) {
        e.message.should.equal('unknown @defeatermap defeater of 0 - 1');
      }
    });
  });

  describe('with malformed query params should throw errors', function() {
    it('for single arg params', function() {
      try {
        const af = new AG.ArgumentFramework({'0':['1'],'1':[]});
        const attackers = af.defeatedBy('2');
        false.should.be.true;
      } catch (e) {
        e.message.should.equal('unknown arg - 2');
      }
    });
    
    it('for arg set params', function() {
      try {
        const af = new AG.ArgumentFramework({'0':['1'],'1':[]});
        af.isDefeated('1', ['2']);
        false.should.be.true;
      } catch (e) {
        e.message.should.equal('unknown members of args - [2]');
      }
    });
  });

  return describe('should give expected query results for a ', function() {
    it('single argument', function() {
      const trivial = new AG.ArgumentFramework({ '0' : [] });
      trivial.isConflictFree([]).should.be.true;
      trivial.isConflictFree(['0']).should.be.true;
      trivial.isAcceptable('0', []).should.be.true;
      trivial.isAdmissible(['0']).should.be.true;
      trivial.isComplete(['0']).should.be.true;
      trivial.isStable(['0']).should.be.true;
    });

    it('self defeating argument', function() {
      const depressed = new AG.ArgumentFramework({ '0' : ['0'] });
      depressed.isConflictFree(['0']).should.be.false;
      depressed.isAcceptable('0', ['0']).should.be.true;
      depressed.isAdmissible(['0']).should.be.false;
      depressed.isComplete(['0']).should.be.false;
      depressed.isStable(['0']).should.be.false;
    });

    it('symmetric defeat', function() {
      const symmetric = new AG.ArgumentFramework({ '0' : ['1'], '1' : ['0'] });
      symmetric.isComplete(['0']).should.be.true;
      symmetric.isComplete(['1']).should.be.true;
    });

    it('chain of three', function() {
      const basic = new AG.ArgumentFramework({ '0' : ['1'], '1' : ['2'], '2' : [] });
      basic.isConflictFree(['0']).should.be.true;
      basic.isConflictFree(['0','1']).should.be.false;
      basic.isConflictFree(['0','2']).should.be.true;
      basic.isAcceptable('0', []).should.be.false;
      basic.isAcceptable('0', ['0']).should.be.false;
      basic.isAcceptable('0', ['0','2']).should.be.true;
      basic.isAdmissible(['0','2']).should.be.true;
      basic.isComplete(['0','2']).should.be.true;
      basic.isStable(['0','2']).should.be.true;
    });
  });
});

describe('Grounded labeller', function() {
  it('chain of three', function() {
    const basic = new AG.ArgumentFramework({ '0' : ['1'], '1' : ['2'], '2' : [] });
    const labeller = new AG.GroundedLabeller(basic);
    const extensions = labeller.extensions();
    extensions.should.have.length(1); // by definition for this labeller!
    const extension = extensions[0];
    extension.should.have.length(2);
    extension.should.include('0');
    extension.should.include('2');
  });

  it('tree with cross defeat', function() {
    const af = new AG.ArgumentFramework({ '0' : [], '1' : ['0'], '2' : ['1','3'], '3': ['1'] });
    const labeller = new AG.GroundedLabeller(af);
    const extension = labeller.extensions()[0];
    extension.should.have.length(2);
    extension.should.include('0');
    extension.should.include('3');
  });
});

describe('Preferred labeller', function() {
  it('self-attacked', function() {
    const basic = new AG.ArgumentFramework({ '0' : ['0'] });
    const labeller = new AG.PreferredLabeller(basic);
    const labellings = labeller.labellings();
    labellings.should.have.length(1);
    labellings.should.include(new AG.Labelling([],[],['0']));
  });

  it('chain of three', function() {
    const basic = new AG.ArgumentFramework({ '0' : ['1'], '1' : ['2'], '2' : [] });
    const labeller = new AG.PreferredLabeller(basic);
    const labellings = labeller.labellings();
    labellings.should.have.length(1);
    labellings.should.include(new AG.Labelling(['0','2'],['1'],[]));
  });

  it('cycle of three', function() {
    const cycle = new AG.ArgumentFramework({ '0' : ['1'], '1' : ['2'], '2' : ['0'] });
    const labeller = new AG.PreferredLabeller(cycle);
    const labellings = labeller.labellings();
    labellings.should.have.length(1);
    labellings.should.include(new AG.Labelling([],[],['0','1','2']));
  });

  it('symmetric defeat', function() {
    const af = new AG.ArgumentFramework({ 'A' : ['B'], 'B' : ['A'] });
    const labeller = new AG.PreferredLabeller(af);
    const labellings = labeller.labellings();
    labellings.should.have.length(2);
    labellings.should.include(new AG.Labelling(['A'],['B'],[]));
    labellings.should.include(new AG.Labelling(['B'],['A'],[]));
  });

  it('framework that requires pruning candidates', function() {
    const map = {
      'A': ['B'],
      'B': ['D'],
      'C': ['A','D'],
      'D': ['C'],
      'E': ['D'],
      'F': ['D']
    };
    const af = new AG.ArgumentFramework(map);
    const labeller = new AG.PreferredLabeller(af);
    const labellings = labeller.labellings();
  });
});

describe('Stable Semantics', function() {
  // there are two preferred labellings {in:['A'],out:['B'],undec:['C','D','E']}
  // and {in:['B','D'],out:['A','C','E'],undec:[]} of which only one is stable
  it('connected odd and even rings example', function() {
    const af = new AG.ArgumentFramework({ 'A' : ['B'], 'B' : ['A'], 'C' : ['B','E'], 'D' : ['C'], 'E': ['D'] });
    const reasoner = new AG.StableSemantics(af);
    const extensions = reasoner.extensions();
    extensions.should.have.length(1);
    extensions[0].should.include('B');
    extensions[0].should.include('D');
  });
}); 

describe('Ideal Semantics', function() {
  // an example where the ideal extension is smaller than the sceptically preferred set.
  // There are two preferred extensions in this framework, ['A','D'] and ['B','D'] but ['D']
  // ['D'] on it's own is not admissible, so the the ideal extension is empty
  it('floating acceptance', function() {
    const af = new AG.ArgumentFramework({ 'A' : ['B'], 'B' : ['A'], 'C' : ['A','B'], 'D' : ['C'] });
    const reasoner = new AG.IdealSemantics(af);
    const extensions = reasoner.extensions();
    extensions.should.have.length(1);
    extensions[0].length.should.equal(0);
  });

  // the grounded extension of this example is empty but the ideal extension
  // includes 'B'
  it('symmetric defeat plus one self-defeat', function() {
    const af = new AG.ArgumentFramework({ 'A' : ['B','A'], 'B' : ['A'] });
    const reasoner = new AG.IdealSemantics(af);
    const extensions = reasoner.extensions();
    extensions.should.have.length(1);
    extensions[0].length.should.equal(1);
    extensions[0][0].should.equal('B');
  });
});
