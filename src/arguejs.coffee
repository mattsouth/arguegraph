class ArgumentFramework
    # attackermap: object that maps argument ids to array of attacking argument ids
    constructor: (@attackermap={}) ->
        @argids = Object.keys(@attackermap) # cache of arg ids

    # args: subset of @argids
    # returns true if no member of args attacks another member of args
    isConflictFree: (args) ->
        for target in args
            for test in args
                if @attackermap[target]? and test in @attackermap[target]
                    return false
        return true

    # arg: member of @argids
    # args: subset of @argids
    # returns true if all attackers of arg are defended by args
    isAcceptable: (arg, args) ->
        isDefended = (attacker) =>
            # must find a defender within the list of the attacker's attackers
            possibledefs = @attackermap[attacker] || []
            for defender in args
                if defender in possibledefs
                    return true
            return false
        if @attackermap[arg]?
            for attacker in @attackermap[arg]
                unless isDefended(attacker)
                    return false
            return true
        else
            true

    # args: subset of @argids
    # returns true if args is conflict free and each member is acceptable wrt to itself
    isAdmissible: (args) ->
        @isConflictFree(args) and args.every (arg) => @isAcceptable(arg, args)     

graphToAF = (graph) ->
    map = {}
    map[arg.id] = [] for arg in graph.nodes
    map[attack.to].push(attack.from.toString()) for attack in graph.edges
    new ArgumentFramework(map)

# labels each node with it's grounded acceptance
grounded = (graph) ->
    # label all nodes out
    # label all unattacked nodes in and others out
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