class ArgumentFramework
    # defeatermap: object that maps argument ids to arrays of defeating argument ids
    constructor: (@defeatermap={}) ->
        @argids = Object.keys(@defeatermap) # cache of arg ids
        # check that each member of @defeatermap maps to an array that may or may not be empty and only contains members of @argids
        for arg in @argids
            unless Array.isArray(@defeatermap[arg])
                throw new Error("@defeatermap[#{arg}] isnt an array.  @defeatermap must contain arrays.")
            for defeater in @defeatermap[arg]
                unless defeater in @argids
                    throw new Error("#{defeater} - unknown @defeatermap defeater of #{arg}.")

    # arg: member of @argids
    # args: subset of @argids
    # returns true if arg is defeated by a member of args
    isDefeated: (arg, args) ->
        for possibledefeater in args
            return true if possibledefeater in @defeatermap[arg]
        false

    # args: subset of @argids
    # returns true if no member of args defeats another member of args
    isConflictFree: (args) ->
        for target in args
            return false if @isDefeated target, args
        true

    # arg: member of @argids
    # args: subset of @argids
    # returns true if all defeaters of arg are defended by args
    isAcceptable: (arg, args) ->
        for defeater in @defeatermap[arg]
            return false unless @isDefeated(defeater, args)
        return true

    # args: subset of @argids
    # returns true if args is conflict free and each member is acceptable wrt to itself
    isAdmissible: (args) ->
        @isConflictFree(args) and args.every (arg) => @isAcceptable(arg, args)    

    # args: subset of @argids
    # returns true if args is admissible and every acceptable argument wrt to args is in args
    isComplete: (args) ->
        for other in complement(args, @argids)
            return false if @isAcceptable(other, args)
        @isAdmissible(args)

    # args: subset of @argids
    # returns true if args is conflict free and every argument not in args is defeated by a member of args
    isStable: (args) ->
        for other in complement(args, @argids)
            return false unless @isDefeated(other, args)
        @isConflictFree(args)

    # returns true if every argument is labelled and the labelling obeys the rules:
    # 1. all defeaters of an "in" argument are labelled "out"
    # 2. at least one defeater of an "out" argument is labelled "in"
    # 3. at least one defeater of an "undec" argument is also labelled "undec" and no defeaters of an "undec" argument are labelled "in"
    isLegalLabelling: (labelling) ->
        # check that label spans this AF
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

class Labelling
    constructor: (@in=[], @out=[], @undec=[]) ->
        # todo: sort arrays on construction? (not unless you can sort on insertion)
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
            arr1.length is arr2.length and arr1[idx] is val for val, idx in arr2 
        arrtest(@in.sort(), labelling.in.sort()) and 
            arrtest(@out.sort(), labelling.out.sort()) and 
            arrtest(@undec.sort(), labelling.undec.sort())

    # returns complement array of the passed array of args and the array of all labelled args
    complement: (args) ->
        return complement @undec, complement @out, complement @in, args

    # returns copy of this labelling
    clone: () ->
        # note that .slice(0) creates shallow clone of array
        return new Labelling(@in.slice(0),@out.slice(0),@undec.slice(0))

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
        
# returns the array of all sub-arrays of S, see https://gist.github.com/joyrexus/5423644
powerset = (S) ->
    P = [[]]
    P.push P[j].concat S[i] for j of P for i of S
    P

# returns an array whose elements are elements of array B which are not members of array A
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

root = exports ? window
root.Labelling = Labelling
root.ArgumentFramework = ArgumentFramework
root.GroundedReasoner = GroundedReasoner