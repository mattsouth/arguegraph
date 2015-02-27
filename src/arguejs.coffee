class ArgumentFramework
    # attackermap: object that maps argument ids to arrays of attacking argument ids
    constructor: (@attackermap={}) ->
        @argids = Object.keys(@attackermap) # cache of arg ids
        # check that each member of @attackermap maps to an array that may or may not be empty and only contains members of @argids
        for arg in @argids
            unless Array.isArray(@attackermap[arg])
                throw new Error("@attackermap[#{arg}] isnt an array.  @attackermap must contain arrays.")
            for attacker in @attackermap[arg]
                unless attacker in @argids
                    throw new Error("#{attacker} - unknown @attackermap attacker of #{arg}.")

    # arg: member of @argids
    # args: subset of @argids
    # returns true if arg is attacked by a member of args
    isAttacked: (arg, args) ->
        for possibleattacker in args
            return true if possibleattacker in @attackermap[arg]
        false

    # args: subset of @argids
    # returns true if no member of args attacks another member of args
    isConflictFree: (args) ->
        for target in args
            return false if @isAttacked target, args
        true

    # arg: member of @argids
    # args: subset of @argids
    # returns true if all attackers of arg are defended by args
    isAcceptable: (arg, args) ->
        for attacker in @attackermap[arg]
            return false unless @isAttacked(attacker, args)
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
    # returns true if args is conflict free and every argument not in args is attacked by a member of args
    isStable: (args) ->
        for other in complement(args, @argids)
            return false unless @isAttacked(other, args)
        @isConflictFree(args)

    # returns set of accepted argument ids under grounded semantics
    grounded: ->
        label_in = (arg for arg in @argids when @attackermap[arg].length==0)
        label_out = []
        extendinout = () =>
            result = false
            union = label_in.concat label_out
            others = complement(union, @argids)
            # extendin
            for arg in others
                if @isAttacked(arg, label_out)
                    label_in.push arg
                    result = true
            # extendout
            for arg in others
                if @isAttacked(arg, label_in)
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