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
        label_in = (arg for arg in @argids when @attackmap[arg].length==0)
        label_out = []
        # todo: extend both label_in and label_out until no longer possible
        label_in

# the set of all subsets of S, see https://gist.github.com/joyrexus/5423644
powerset = (S) ->
    P = [[]]
    P.push P[j].concat S[i] for j of P for i of S
    P

# the set of members of B who are not members of A
complement = (A, B) ->
    (el for el in B when el not in A)

# generate ArgumentFramework From Visjs network
graphToAF = (graph) ->
    map = {}
    map[arg.id] = [] for arg in graph.nodes
    map[attack.to].push(attack.from.toString()) for attack in graph.edges
    new ArgumentFramework(map)

# labels each node with it's grounded acceptance
grounded = (graph) ->
    # label all unattacked nodes in
    # extendin
    # extendout
    # examine each out node.  If an out node's attackers are all out and each of their attackers are in, then label in.
    # repeat until there are no more nodes to do this to.
    attacks = [graph.nodes.length]
    for node, nodeIdx in graph.nodes
        attacks[nodeIdx] = []
        for edge in graph.edges
            if edge.to is nodeIdx
                attacks[nodeIdx].push edge.from
    for node, nodeIdx in graph.nodes
        node.grounded = attacks[nodeIdx].length is 0

root = exports ? window
root.grounded = grounded
root.graphToAF = graphToAF
root.ArgumentFramework = ArgumentFramework