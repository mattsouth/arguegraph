# Abstract argumentation is all about manipulating sets of arguments.
# First we define some set operations on arrays that are assumed not to include dups or gaps.
# Note that argumentation, especially this naive library's approach can get computationally expensive.

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

# returns an array whose elements are in both arrays A and B
intersection = (A, B) ->
  result = []
  for el in A
    result.push el if el in B
  result

# An ArgumentFramework wraps a map of defeats that define the argument network
# and provides functions for interrogating that network.
# Errors are thrown for inconsistent/malformed networks and queries
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

  # arg: member of @argids
  # args: subset of @argids
  # returns true if arg is defeated by a member of args
  isDefeated: (arg, args, checkParams=true) ->
    if checkParams
      @_checkArg arg
      @_checkArgs args
    for possibledefeater in args
      return true if possibledefeater in @defeatermap[arg]
    false

  # arg: member of @argids
  # returns array of arguments defeated by passed argument
  defeatedBy: (arg, checkParams=true) ->
    @_checkArg arg if checkParams
    defeated for defeated in @argids when arg in @defeatermap[defeated]

  # args: subset of @argids
  # returns true if no member of args defeats another member of args
  isConflictFree: (args, checkParams=true) ->
    @_checkArgs args if checkParams
    for target in args
      return false if @isDefeated target, args
    true

  # arg: member of @argids
  # args: subset of @argids
  # returns true if all defeaters of arg are defended by args
  isAcceptable: (arg, args, checkParams=true) ->
    if checkParams
      @_checkArg arg
      @_checkArgs args
    for defeater in @defeatermap[arg]
      return false unless @isDefeated(defeater, args)
    return true

  # args: subset of @argids
  # returns true if args is conflict free and each member is acceptable wrt to itself
  isAdmissible: (args, checkParams=true) ->
    @_checkArgs args if checkParams
    @isConflictFree(args, false) and args.every (arg) => @isAcceptable(arg, args, false)

  # args: subset of @argids
  # returns true if args is admissible and every acceptable argument wrt to args is in args
  isComplete: (args, checkParams=true) ->
    @_checkArgs args if checkParams
    for other in complement(args, @argids)
      return false if @isAcceptable(other, args, false)
    @isAdmissible(args, false)

  # args: subset of @argids
  # returns true if args is conflict free and every argument not in args is defeated by a member of args
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
    # first check that label spans this AF
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

  _checkArg: (arg) ->
    if not (arg in @argids)
      throw new Error "unknown arg - #{arg}"

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
  # returns updated labelling
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

# the most sceptical of all reasoners
class GroundedReasoner extends Reasoner
  # grounded reasoner returns a single labelling
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

class PreferredReasoner extends Reasoner
  labellings: () ->
    checkIn = (labelling) =>
      illegallyIn = (arg) =>
        for defeater in @af.defeatermap[arg]
          return defeater if defeater in labelling.in or defeater in labelling.undec
        return null
      result = {superIllegal:[], illegal:[]}
      for arg in labelling.in
        defeater = illegallyIn(arg)
        if defeater?
          if illegallyIn(defeater)?
            result.illegal.push(arg)
          else
            result.superIllegal.push(arg)
      result
    transitionLabelling = (labelling, arg) =>
      cloned = labelling.clone()
      cloned.move arg,'in','out'
      illegallyOut = cloned.illegallyOut @af#
      if arg in illegallyOut
        cloned.move arg, 'out', 'undec'
      for defeated in @af.defeatedBy(arg)
        if defeated in illegallyOut
          cloned.move defeated, 'out', 'undec'
      cloned
    findLabellings = (labelling) =>
      # TODO: check labelling is not worse than an existing labelling
      illegals = checkIn labelling
      if illegals.illegal.length>0 or illegals.superIllegal.length>0
        if illegals.superIllegal.length>0
          findLabellings transitionLabelling(labelling, illegals.superIllegal[0])
        else
          for arg in illegals.illegal
            findLabellings transitionLabelling(labelling, arg)
      else
        # TODO: prune existing candidates if necessary
        ok=true
        for existing in candidates
          if existing.equals labelling
            ok = false
        candidates.push(labelling) unless not ok
        return
    candidates=[]
    findLabellings new Labelling(@af.argids)
    candidates

root = exports ? window
root.Labelling = Labelling
root.ArgumentFramework = ArgumentFramework
root.GroundedReasoner = GroundedReasoner
root.PreferredReasoner = PreferredReasoner
