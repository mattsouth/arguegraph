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

    # returns set of accepted argument ids under grounded semantics
    grounded: ->
        label_in = []
        label_out = []
        extendinout = () =>
            result = false
            union = label_in.concat label_out
            others = complement(union, @argids)
            # extendin
            for arg in others
                # add arg to label_in if all it's defeaters are out (or it has no defeaters)
                tobeadded = true
                for defeater in @defeatermap[arg]
                    tobeadded=false if defeater not in label_out
                label_in.push arg if tobeadded 
            # extendout
            for arg in others
                if @isDefeated(arg, label_in)
                    label_out.push arg
                    result = true
            extendinout() if result
        extendinout()
        label_in

# the set of all subsets of S, see https://gist.github.com/joyrexus/5423644
powerset = (S) ->
    P = [[]]
    P.push P[j].concat S[i] for j of P for i of S
    P

# the set of members of B who are not members of A
complement = (A, B) ->
    (el for el in B when el not in A)

root = exports ? window
root.ArgumentFramework = ArgumentFramework