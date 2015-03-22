# todo: sort arrays on construction?
class Labelling
    constructor: (@in=[], @out=[], @undec=[]) ->
        # todo: check that @in, @out and @undec are disjoint

    # returns true if labelling is the same as this
    equals: (labelling) ->
        arrtest = (arr1, arr2) ->
            arr1.length is arr2.length and arr1[idx] is val for val, idx in arr2 
        arrtest(@in.sort(), labelling.in.sort()) and 
            arrtest(@out.sort(), labelling.out.sort()) and 
            arrtest(@undec.sort(), labelling.undec.sort())

    # returns complement of all labelling args and passed array of args
    complement: (args) ->
        return complement @undec, complement @out, complement @in, args

    # returns copy of this labelling
    clone: () ->
        # note that .slice(0) creates shallow clone of array
        return new Labelling(@in.slice(0),@out.slice(0),@undec.slice(0))

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

    # arg: member of @argids
    # args: subset of @argids
    # returns true if arg is defeated by all members of args
    isDefeatedByAll: (arg, args) ->
        for possibledefeater in args
            return false if not possibledefeater in @defeatermap[arg]
        true

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
        return false unless labelling.in.length + labelling.out.length + labelling.undec.length is @argids.length
        # todo: check for label dups
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
            result = false
            others = labelling.complement @af.argids
            added = []
            # extendin
            for arg in others
                # add arg to label_in if all it's defeaters are out (or it has no defeaters)
                tobeadded = true
                for defeater in @af.defeatermap[arg]
                    if defeater not in labelling.out
                        tobeadded=false
                        break
                if tobeadded
                    added.push arg
                    labelling.in.push arg
                    result=true
            # extendout
            others = complement(added, others) if added isnt []
            for arg in others
                if @af.isDefeated(arg, labelling.in)
                    labelling.out.push arg
                    result = true
            extendinout() if result
        extendinout()
        labelling.undec = labelling.complement @af.argids
        return [labelling]

# the set of all subsets of S, see https://gist.github.com/joyrexus/5423644
powerset = (S) ->
    P = [[]]
    P.push P[j].concat S[i] for j of P for i of S
    P

# the set of members of B who are not members of A
complement = (A, B) ->
    (el for el in B when el not in A)

root = exports ? window
root.Labelling = Labelling
root.ArgumentFramework = ArgumentFramework
root.GroundedReasoner = GroundedReasoner