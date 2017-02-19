###
# The MIT License (MIT)
#
# Copyright (c) 2014 Matthew South
#
# Permission is hereby granted, free of charge, to any person obtaining a copy of
# this software and associated documentation files (the "Software"), to deal in
# the Software without restriction, including without limitation the rights to
# use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
# the Software, and to permit persons to whom the Software is furnished to do so,
# subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in all
# copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
# FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
# COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
# IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
# CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
###

# Abstract argumentation involves manipulating sets of arguments so first we
# define some set operations on arrays that are assumed not to include dups or
# gaps. Note that these algorithms, especially this naïve library's approach can
# get computationally expensive.

# returns the array of all sub-arrays of S, see https://gist.github.com/joyrexus/5423644
powerset = (S) ->
  P = [[]]
  P.push P[j].concat S[i] for j of P for i of S
  P

# returns an array whose elements are members of B but are not members of A
complement = (A, B) ->
  (el for el in B when el not in A)

# returns true if all elements of array A are members of array B
isSubset = (A, B) ->
  for el in A
    return false if not (el in B)
  return true

# returns true if all elements of array A are members of array B and A is smaller than B
isStrictSubset = (A, B) ->
  return isSubset(A, B) and A.length < B.length

# returns an array whose elements are in both arrays A and B
intersection = (A, B) ->
  result = []
  for el in A
    result.push el if el in B
  result

# An ArgumentFramework wraps a map of defeats* that define the argument network
# and provides functions for interrogating that network.
# Errors are thrown for inconsistent/malformed networks and queries
# * - Note that the word "defeats" is used widely in the literature, but it may
# not be the best term to use, as it suggests a resolved struggle whereas in
# this formalisation it is possible for two arguments to simultaneously defeat
# one another. It is the job of the algorithms to establish which arguments can
# be said to defend themselves.  Alternative terms that could be used here
# include "attack" and "conflict with".
class ArgumentFramework
  # defeatermap: object whose keys are arguments and whose values are arrays of defeating arguments
  constructor: (@defeatermap={}) ->
    @argids = Object.keys(@defeatermap) # cache of argument ids
    # check that each member of @defeatermap maps to an array that may or may not be empty and only contains members of @argids
    for arg in @argids
      unless Array.isArray(@defeatermap[arg])
        throw new Error("@defeatermap[#{arg}] isnt an array.  @defeatermap must contain arrays.")
      for defeater in @defeatermap[arg]
        unless defeater in @argids
          throw new Error("unknown @defeatermap defeater of #{arg} - #{defeater}")

  # returns true if arg is defeated by a member of args
  # arg: member of @argids
  # args: subset of @argids
  # checkParams: optionally check that each arg and member of args are known
  isDefeated: (arg, args, checkParams=true) ->
    if checkParams
      @_checkArg arg
      @_checkArgs args
    for possibledefeater in args
      return true if possibledefeater in @defeatermap[arg]
    false

  # returns array of arguments defeated by passed argument
  # arg: member of @argids
  # checkParams: optionally check that arg is known
  defeatedBy: (arg, checkParams=true) ->
    @_checkArg arg if checkParams
    defeated for defeated in @argids when arg in @defeatermap[defeated]

  # returns true if no member of args defeats another member of args
  # args: subset of @argids
  # checkParams: optionally check that each member of args is known
  isConflictFree: (args, checkParams=true) ->
    @_checkArgs args if checkParams
    for target in args
      return false if @isDefeated target, args
    true

  # returns true if arg is acceptable wrt args, i.e. all defeaters of arg are defended by args
  # arg: member of @argids
  # args: subset of @argids
  # checkParams: optionally check that each arg and member of args are known
  isAcceptable: (arg, args, checkParams=true) ->
    if checkParams
      @_checkArg arg
      @_checkArgs args
    for defeater in @defeatermap[arg]
      return false unless @isDefeated(defeater, args)
    return true

  # returns true if args is conflict free and each member is acceptable wrt to itself
  # args: subset of @argids
  # checkParams: optionally check that each member of args is known
  isAdmissible: (args, checkParams=true) ->
    @_checkArgs args if checkParams
    @isConflictFree(args, false) and args.every (arg) => @isAcceptable(arg, args, false)

  # returns true if args is admissible and every acceptable argument wrt to args is in args
  # args: subset of @argids
  # checkParams: optionally check that each member of args is known
  isComplete: (args, checkParams=true) ->
    @_checkArgs args if checkParams
    for other in complement(args, @argids)
      return false if @isAcceptable(other, args, false)
    @isAdmissible(args, false)

  # returns true if args is conflict free and every argument not in args is defeated by a member of args
  # args: subset of @argids
  # checkParams: optionally check that each member of args is known
  isStable: (args, checkParams=true) ->
    @_checkArgs args if checkParams
    for other in complement(args, @argids)
      return false unless @isDefeated(other, args, false)
    @isConflictFree(args, false)

  # returns true if every argument is labelled and the labelling obeys the rules:
  # 1. all defeaters of an "in" argument are labelled "out"
  # 2. at least one defeater of an "out" argument is labelled "in"
  # 3. at least one defeater of an "undec" argument is also labelled "undec" and no defeaters of an "undec" argument are labelled "in"
  isLegalLabelling: (labelling) ->
    return false unless labelling.complement(@argids).length is 0
    for arg in labelling.in
      for defeater in @defeatermap[arg]
        return false unless defeater in labelling.out
    for arg in labelling.out
      ok = false
      for defeater in @defeatermap[arg]
        if defeater in labelling.in
          ok = true
          break
      return false unless ok
    for arg in labelling.undec
      return false unless @defeatermap[arg].length > 0
      ok = false
      for defeater in @defeatermap[arg]
        return false if defeater in labelling.in
        ok = true if defeater in labelling.undec
      return false unless ok
    return true

  # check that arg is known in the framework
  _checkArg: (arg) ->
    if not (arg in @argids)
      throw new Error "unknown arg - #{arg}"

  # check that all args are known in the framework
  _checkArgs: (args) ->
    unknown = complement @argids, args
    if unknown.length>0
      throw new Error "unknown members of args - [#{unknown}]"

# A Labelling consists of three mutually distinct argument sets, "in", "out" and "undec"
# TODO: Sort arrays on construction? (not unless you sort on insertion)
# TODO: Link a Labelling to an ArgumentFramework? (thus removing need for parameter in illegallyIn and illegallyOut functions and allowing for possibility of the argument framework changing after labelling was constructed)
class Labelling
  constructor: (@in=[], @out=[], @undec=[]) ->
    # check that @in, @out and @undec are disjoint
    if intersection(@in, @out).length>0
      throw new Error('invalid labelling - dup found in in/out')
    if intersection(@in, @undec).length>0
      throw new Error('invalid labelling - dup found in in/undec')
    if intersection(@out, @undec).length>0
      throw new Error('invalid labelling - dup found in out/undec')

  # returns true if labelling is the same as this
  equals: (labelling) ->
    arrtest = (arr1, arr2) ->
      arr1.length is arr2.length and arr1.every (el, idx) -> arr2[idx] is el
    result = arrtest(@in.sort(), labelling.in.sort()) and
      arrtest(@out.sort(), labelling.out.sort()) and
      arrtest(@undec.sort(), labelling.undec.sort())
    result

  # returns complement array of the passed array of args and the array of all labelled args
  complement: (args) ->
    return complement @undec, complement @out, complement @in, args

  # returns copy of this labelling
  clone: () ->
    # note that .slice(0) creates shallow clone of array
    return new Labelling(@in.slice(0),@out.slice(0),@undec.slice(0))

  # Check legality of "in" arguments wrt provided framework
  # to be legal, all defeaters of an "in" argument must be labelled "out"
  # returns array of illegally "in" labelled arguments
  illegallyIn: (af) ->
    arg for arg in @in when not isSubset af.defeatermap[arg], @out

  # Check legality of "out" arguments wrt provided framework
  # to be legal at least one defeater of an "out" argument must be labelled "in"
  # returns array of illegally "out" labelled arguments
  illegallyOut: (af) ->
    arg for arg in @out when intersection(af.defeatermap[arg], @in).length==0

  # move arg from one label to another
  # returns this labelling, updated
  move: (arg, from, to) ->
    checkLabel = (label) ->
      if not (label in ['in','out','undec'])
        throw new Error "unknown label - #{label}"
    checkLabel from
    checkLabel to
    if not (arg in @[from])
      throw new Error "argument #{arg} doesnt have label #{from}"
    @[from].splice(@[from].indexOf(arg), 1)
    @[to].push arg
    @

# abstract class to be extended by particular reasoners
class Reasoner
  constructor: (@af) ->

  # returns an array of extensions (arrays of arguments) that reasoner generates
  extensions: () ->
    labelling.in for labelling in @labellings()

# a particular sceptical reasoner that returns a single labelling
class GroundedReasoner extends Reasoner
  # see pages 16/17 of Caminada's Gentle Introduction and
  # and section 4.1 of Modgil and Caminada
  # start with an all undec labelling and iteratively push arguments
  # that you can to in/out with the extendinout operation
  labellings: () ->
    labelling = new Labelling()
    extendinout = () =>
      others = labelling.complement @af.argids
      added = []
      # extendin
      for arg in others
        # label arg 'in' if all it's defeaters are labelled 'out' (or it has no defeaters)
        if isSubset @af.defeatermap[arg], labelling.out
          added.push arg
          labelling.in.push arg
      # extendout
      others = complement(added, others) if added.length>0
      for arg in others
        # label arg 'out' if one of it's defeaters is labelled 'in'
        if @af.isDefeated(arg, labelling.in)
          labelling.out.push arg
          added.push arg
      extendinout() if added.length>0
    extendinout()
    labelling.undec = labelling.complement @af.argids
    return [labelling]

# A credulous reasoner that can return multiple labellings
class PreferredReasoner extends Reasoner
  # see section 5.1 fo Modgil and Caminada 2009
  labellings: () ->
    checkIn = (labelling) =>
      hasUndecDefeater = (arg) =>
        for defeater in @af.defeatermap[arg]
          return true if defeater in labelling.undec
        return false
      result = {superIllegal:[], illegal:[]}
      illegals = labelling.illegallyIn(@af)
      legals = complement illegals, labelling.in
      for illegal in illegals
        legalDefeaters = intersection @af.defeatermap[illegal], legals
        if legalDefeaters.length>0 or hasUndecDefeater(illegal)
          result.superIllegal.push(illegal)
        else
          result.illegal.push(illegal)
      result
    transitionLabelling = (labelling, arg) =>
      cloned = labelling.clone()
      cloned.move arg,'in','out'
      illegallyOut = cloned.illegallyOut @af
      for defeated in @af.defeatedBy(arg)
        if defeated in illegallyOut
          cloned.move defeated, 'out', 'undec'
      if arg in illegallyOut and arg in cloned.out
        cloned.move arg, 'out', 'undec'
      cloned
    findLabellings = (labelling) =>
      # check labelling is not worse than an existing labelling
      for existing in candidates
        if isStrictSubset(labelling.in, existing.in)
          return
      # assess the illegally 'in' arguments
      illegals = checkIn labelling
      if illegals.illegal.length>0 or illegals.superIllegal.length>0
        if illegals.superIllegal.length>0
          findLabellings transitionLabelling(labelling, illegals.superIllegal[0])
        else
          for arg in illegals.illegal
            findLabellings transitionLabelling(labelling, arg)
      else
        # prune existing candidates if necessary
        for existing, idx in candidates
          if isStrictSubset existing.in, labelling.in
            candidates.splice(idx)
        # add labelling if it doesnt already exist
        ok=true
        for existing in candidates
          if existing.equals labelling
            ok = false
        candidates.push(labelling) unless not ok
        return
    candidates=[]
    findLabellings new Labelling(@af.argids)
    candidates

# exports is used in the context of npm, window in the browser
root = exports ? window
root.Labelling = Labelling
root.ArgumentFramework = ArgumentFramework
root.GroundedReasoner = GroundedReasoner
root.PreferredReasoner = PreferredReasoner
