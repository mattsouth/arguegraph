/*
 * The MIT License (MIT)
 *
 * Copyright (c) 2014 Matthew South
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

// Abstract argumentation involves manipulating sets of arguments so first we
// define some set operations on arrays that are assumed not to include dups or
// gaps.

// returns the array of all sub-arrays of S, see https://gist.github.com/joyrexus/5423644
const powerset = function(S) {
  const P = [[]];
  for (let i in S) { for (let j in P) { P.push(P[j].concat(S[i])); } }
  return P;
};

// returns an array whose elements are members of B but are not members of A
const complement = (A, B) => Array.from(B).filter((el) => !A.includes(el));

// returns true if all elements of array A are members of array B
const isSubset = function(A, B) {
  for (let el of A) {
    if (!B.includes(el)) { return false; }
  }
  return true;
};

// returns true if all elements of array A are members of array B and A is smaller than B
const isStrictSubset = (A, B) => isSubset(A, B) && (A.length < B.length);

// returns an array whose elements are in both arrays A and B
const intersection = (A, B) => Array.from(A).filter((el) => B.includes(el));

// returns an array whose elements are from either array A or B
const union = function(A, B) {
  const result = Array.from(A);
  for (let el of B) {
    if (!result.includes(el)) { result.push(el); }
  }
  return result;
};

// An ArgumentFramework wraps a map of defeats* (called the defeatermap) that
// defines a network of arguments and provides functions for interrogating that
// network. Errors are thrown for inconsistent/malformed networks and queries.
// * The term "defeats" is widely used in the supporting literature, but it may
// not be the best word to use, as it suggests a resolved struggle.  Alternative
// terms that could be used here include "attack" and "conflict with".
class ArgumentFramework {
  // defeatermap: object whose keys are arguments and whose values are arrays of defeating arguments
  constructor(defeatermap) {
    this.defeatermap = defeatermap || {};
    this.argids = Object.keys(this.defeatermap); // cache of argument ids
    // check that each member of @defeatermap maps to an array that may or may not be empty and only contains members of @argids
    for (let arg of this.argids) {
      if (!Array.isArray(this.defeatermap[arg])) {
        throw new Error(`@defeatermap[${arg}] isnt an array.  @defeatermap must contain arrays.`);
      }
      for (let defeater of this.defeatermap[arg]) {
        if (!this.argids.includes(defeater)) {
          throw new Error(`unknown @defeatermap defeater of ${arg} - ${defeater}`);
        }
      }
    }
  }

  // returns true if arg is defeated by a member of args
  // arg: member of @argids
  // args: subset of @argids
  // checkParams: optionally check that each arg and member of args are known
  isDefeated(arg, args, checkParams) {
    if (checkParams == null) { checkParams = true; }
    if (checkParams) {
      this._checkArg(arg);
      this._checkArgs(args);
    }
    for (let possibledefeater of args) {
      if (this.defeatermap[arg].includes(possibledefeater)) { return true; }
    }
    return false;
  }

  // returns array of arguments defeated by passed argument
  // arg: member of @argids
  // checkParams: optionally check that arg is known
  defeatedBy(arg, checkParams) {
    if (checkParams == null) { checkParams = true; }
    if (checkParams) { this._checkArg(arg); }
    return Array.from(this.argids).filter((defeated) => this.defeatermap[defeated].includes(arg));
  }

  // returns true if no member of args defeats another member of args
  // args: subset of @argids
  // checkParams: optionally check that each member of args is known
  isConflictFree(args, checkParams) {
    if (checkParams == null) { checkParams = true; }
    if (checkParams) { this._checkArgs(args); }
    for (let target of args) {
      if (this.isDefeated(target, args)) { return false; }
    }
    return true;
  }

  // returns true if arg is acceptable wrt args, i.e. all defeaters of arg are defended by args
  // arg: member of @argids
  // args: subset of @argids
  // checkParams: optionally check that each arg and member of args are known
  isAcceptable(arg, args, checkParams) {
    if (checkParams == null) { checkParams = true; }
    if (checkParams) {
      this._checkArg(arg);
      this._checkArgs(args);
    }
    for (let defeater of this.defeatermap[arg]) {
      if (!this.isDefeated(defeater, args)) { return false; }
    }
    return true;
  }

  // returns true if args is conflict free and each member is acceptable wrt to itself
  // args: subset of @argids
  // checkParams: optionally check that each member of args is known
  isAdmissible(args, checkParams) {
    if (checkParams == null) { checkParams = true; }
    if (checkParams) { this._checkArgs(args); }
    return this.isConflictFree(args, false) && args.every(arg => this.isAcceptable(arg, args, false));
  }

  // returns true if args is admissible and every acceptable argument wrt to args is in args
  // args: subset of @argids
  // checkParams: optionally check that each member of args is known
  isComplete(args, checkParams) {
    if (checkParams == null) { checkParams = true; }
    if (checkParams) { this._checkArgs(args); }
    for (let other of complement(args, this.argids)) {
      if (this.isAcceptable(other, args, false)) { return false; }
    }
    return this.isAdmissible(args, false);
  }

  // returns true if args is conflict free and every argument not in args is defeated by a member of args
  // args: subset of @argids
  // checkParams: optionally check that each member of args is known
  isStable(args, checkParams) {
    if (checkParams == null) { checkParams = true; }
    if (checkParams) { this._checkArgs(args); }
    for (let other of complement(args, this.argids)) {
      if (!this.isDefeated(other, args, false)) { return false; }
    }
    return this.isConflictFree(args, false);
  }

  // returns true if every argument is labelled and the labelling obeys the rules:
  // 1. all defeaters of an "in" argument are labelled "out"
  // 2. at least one defeater of an "out" argument is labelled "in"
  // 3. at least one defeater of an "undec" argument is also labelled "undec" and no defeaters of an "undec" argument are labelled "in"
  isLegalLabelling(labelling) {
    let arg, defeater, ok;
    if (labelling.complement(this.argids).length !== 0) { return false; }
    for (arg of labelling.in) {
      for (defeater of this.defeatermap[arg]) {
        if (!labelling.out.includes(defeater)) { return false; }
      }
    }
    for (arg of labelling.out) {
      ok = false;
      for (defeater of this.defeatermap[arg]) {
        if (labelling.in.includes(defeater)) {
          ok = true;
          break;
        }
      }
      if (!ok) { return false; }
    }
    for (arg of labelling.undec) {
      if (!(this.defeatermap[arg].length > 0)) { return false; }
      ok = false;
      for (defeater of this.defeatermap[arg]) {
        if (labelling.in.includes(defeater)) { return false; }
        if (labelling.undec.includes(defeater)) { ok = true; }
      }
      if (!ok) { return false; }
    }
    return true;
  }

  // check that arg is known in the framework
  _checkArg(arg) {
    if (!this.argids.includes(arg)) {
      throw new Error(`unknown arg - ${arg}`);
    }
  }

  // check that all args are known in the framework
  _checkArgs(args) {
    const unknown = complement(this.argids, args);
    if (unknown.length>0) {
      throw new Error(`unknown members of args - [${unknown}]`);
    }
  }
}

// A Labelling consists of three mutually distinct argument sets, "in", "out" and "undec"
// TODO: Sort arrays on construction? (not unless you sort on insertion)
// TODO: Link a Labelling to an ArgumentFramework? (thus removing need for parameter in illegallyIn and illegallyOut functions and allowing for possibility of the argument framework changing after labelling was constructed)
class Labelling {
  constructor(ins, outs, undecs) {
    this.in = ins || [];
    this.out = outs || [];
    this.undec = undecs || [];
    if (intersection(this.in, this.out).length>0) {
      throw new Error('invalid labelling - dup found in in/out');
    }
    if (intersection(this.in, this.undec).length>0) {
      throw new Error('invalid labelling - dup found in in/undec');
    }
    if (intersection(this.out, this.undec).length>0) {
      throw new Error('invalid labelling - dup found in out/undec');
    }
  }

  // returns true if labelling is the same as this
  equals(labelling) {
    const arrtest = (arr1, arr2) => (arr1.length === arr2.length) && arr1.every((el, idx) => arr2[idx] === el);
    const result = arrtest(this.in.sort(), labelling.in.sort()) &&
      arrtest(this.out.sort(), labelling.out.sort()) &&
      arrtest(this.undec.sort(), labelling.undec.sort());
    return result;
  }

  // returns complement array of the passed array of args and the array of all labelled args
  complement(args) {
    return complement(this.undec, complement(this.out, complement(this.in, args)));
  }

  // returns copy of this labelling
  clone() {
    // note that .slice(0) creates shallow clone of array
    return new Labelling(this.in.slice(0),this.out.slice(0),this.undec.slice(0));
  }

  // Check legality of "in" arguments wrt provided framework
  // to be legal, all defeaters of an "in" argument must be labelled "out"
  // returns array of illegally "in" labelled arguments
  illegallyIn(af) {
    const result = [];
    for (let arg of this.in) {
      if (!isSubset(af.defeatermap[arg], this.out)) {
        result.push(arg);
      }
    }
    return result;
  }

  // Check legality of "out" arguments wrt provided framework
  // to be legal at least one defeater of an "out" argument must be labelled "in"
  // returns array of illegally "out" labelled arguments
  illegallyOut(af) {
    const result = [];
    for (let arg of this.out) {
      if (intersection(af.defeatermap[arg], this.in).length===0) {
        result.push(arg);
      }
    }
    return result;
  }

  // move arg from one label to another
  // returns this labelling, updated
  move(arg, from, to) {
    const checkLabel = function(label) {
      if (!(['in','out','undec'].includes(label))) {
        throw new Error(`unknown label - ${label}`);
      }
    };
    checkLabel(from);
    checkLabel(to);
    if (!this[from].includes(arg)) {
      throw new Error(`argument ${arg} doesnt have label ${from}`);
    }
    this[from].splice(this[from].indexOf(arg), 1);
    this[to].push(arg);
    return this;
  }
}

// abstract class to be extended by particular labellers / semantics
class Labeller {
  constructor(af) {
    this.af = af;
  }

  // returns an array of extensions (arrays of arguments) associated with labeller semantics
  extensions() {
    return this.labellings().map((labelling) => labelling.in);
  }
}

// a particularly sceptical semantics that returns a single labelling
class GroundedLabeller extends Labeller {
  // see pages 16/17 of Caminada's Gentle Introduction and
  // and section 4.1 of Modgil and Caminada
  // start with an all undec labelling and iteratively push arguments
  // that you can to in/out with the extendinout operation
  labellings() {
    const labelling = new Labelling();
    var extendinout = () => {
      let arg;
      let others = labelling.complement(this.af.argids);
      const added = [];
      // extendin
      for (arg of others) {
        // label arg 'in' if all it's defeaters are labelled 'out' (or it has no defeaters)
        if (isSubset(this.af.defeatermap[arg], labelling.out)) {
          added.push(arg);
          labelling.in.push(arg);
        }
      }
      // extendout
      if (added.length>0) { others = complement(added, others); }
      for (arg of others) {
        // label arg 'out' if one of it's defeaters is labelled 'in'
        if (this.af.isDefeated(arg, labelling.in)) {
          labelling.out.push(arg);
          added.push(arg);
        }
      }
      if (added.length>0) { return extendinout(); }
    };
    extendinout();
    labelling.undec = labelling.complement(this.af.argids);
    return [labelling];
  }
}

// A credulous semantics that can return multiple labellings
class PreferredLabeller extends Labeller {
  // see section 5.1 fo Modgil and Caminada 2009
  labellings() {
    const checkIn = labelling => {
      const hasUndecDefeater = arg => {
        for (let defeater of this.af.defeatermap[arg]) {
          if (labelling.undec.includes(defeater)) { return true; }
        }
        return false;
      };
      const result = {superIllegal:[], illegal:[]};
      const illegals = labelling.illegallyIn(this.af);
      const legals = complement(illegals, labelling.in);
      for (let illegal of illegals) {
        const legalDefeaters = intersection(this.af.defeatermap[illegal], legals);
        if ((legalDefeaters.length>0) || hasUndecDefeater(illegal)) {
          result.superIllegal.push(illegal);
        } else {
          result.illegal.push(illegal);
        }
      }
      return result;
    };
    const transitionLabelling = (labelling, arg) => {
      const cloned = labelling.clone();
      cloned.move(arg,'in','out');
      const illegallyOut = cloned.illegallyOut(this.af);
      for (let defeated of this.af.defeatedBy(arg)) {
        if (illegallyOut.includes(defeated)) {
          cloned.move(defeated, 'out', 'undec');
        }
      }
      if (illegallyOut.includes(arg) && cloned.out.includes(arg)) {
        cloned.move(arg, 'out', 'undec');
      }
      return cloned;
    };
    var findLabellings = labelling => {
      // check labelling is not worse than an existing labelling
      let existing;
      for (existing of candidates) {
        if (isStrictSubset(labelling.in, existing.in)) {
          return;
        }
      }
      // assess the illegally 'in' arguments
      const illegals = checkIn(labelling);
      if ((illegals.illegal.length>0) || (illegals.superIllegal.length>0)) {
        if (illegals.superIllegal.length>0) {
          return findLabellings(transitionLabelling(labelling, illegals.superIllegal[0]));
        } else {
          return illegals.illegal.map((arg) =>
            findLabellings(transitionLabelling(labelling, arg)));
        }
      } else {
        // prune existing candidates if necessary
        let idx;
        const earmarked = []; // identify prunable candidates
        for (idx = 0; idx < candidates.length; idx++) {
          existing = candidates[idx];
          if (isStrictSubset(existing.in, labelling.in)) {
            earmarked.push(idx);
          }
        }
        for (idx of earmarked.reverse()) { // prune in reverse order, to make sure the correct ones are pruned
          candidates.splice(idx, 1);
        }
        // add labelling if it doesnt already exist
        let ok=true;
        for (existing of candidates) {
          if (existing.equals(labelling)) {
            ok = false;
          }
        }
        if (!!ok) { candidates.push(labelling); }
        return;
      }
    };
    var candidates=[];
    findLabellings(new Labelling(this.af.argids));
    return candidates;
  }
}

// Stable extensions are preferred extensions that defeat all other arguments in a framework
class StableSemantics extends PreferredLabeller {
  // Filter the labellings based on those that have empty undec
  extensions() {
    return this.labellings().filter((labelling) => labelling.undec.length === 0).map((labelling) => labelling.in);
  }
}

// Ideal semantics yields a single extension that can be less sceptical than grounded
class IdealSemantics extends PreferredLabeller {
  // Return the maximal admissible subset of all the preferred extensions
  extensions() {
    // start with all args
    let result = this.af.argids;
    // restrict to those args in all preferred extensions
    for (let labelling of this.labellings()) {
      result = intersection(result, labelling.in);
    }
    // prune result until it is admissible (empty set is always admissible)
    for (let subset of powerset(result).sort((a, b) => b.length - a.length)) {
      if (this.af.isAdmissible(subset)) { return [subset]; }
    }
  }
}

// exports is used in the context of npm, window in the browser
const root = typeof exports !== 'undefined' && exports !== null ? exports : window;
root.ArgumentFramework = ArgumentFramework;
root.Labelling = Labelling;
root.GroundedLabeller = GroundedLabeller;
root.PreferredLabeller = PreferredLabeller;
root.StableSemantics = StableSemantics;
root.IdealSemantics = IdealSemantics;
