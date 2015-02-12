###
Reasoners annotate a graph with indicators of node status (accepted / in abeyance / not accepted)
possible designs include:
static reasoning method
wrapper around a graph that
* listens to changes in the graph and updates accordingly
* provides additional information 
###
class ArgumentFramework
    ###
    datamodel based on the visjs network model for nodes and edges, i.e.: 
    @nodes: {
        id: unique
        label: string
    }
    @edges: {
        from: id
        to: id
    }
    ###
    constructor: (graph = {nodes: [], edges: []}) ->
        @args = graph.nodes
        @attacks = graph.edges
        @ids = (arg.id for arg in @args) # cache of ids
        @attackers = {}                  # cache of attackers
        for attack in @attacks
            if attack.from not in @ids
                throw new Error("unknown arg id in attack.from: #{attack}") 
            if attack.to not in @ids
                throw new Error("unknown arg id in attack.to: #{attack}") 
            if @attackers[attack.to]
                @attackers[attack.to].push attack.from
            else
                @attackers[attack.to] = [attack.from]

    # returns true if no members of args attacks another member of args
    isConflictFree: (args) ->
        for target, idx in args
            if target.id not in @ids
                throw new Error("Unknown arg id: #{arg}")
            for test in args[idx+1..]
                if test.id in @attackers[target.id]
                    return false
        return true

    # arg is acceptable wrt to args if all attackers of arg within this AF are defended by args
    isAcceptable: (arg, args) ->
        if arg.id not in @ids
            throw new Error("unknown arg id in arg: #{arg}")
        defenders = (defender.id for defender in args)
        isDefended = (attackerid) =>
            # must find a defender within the list of the attacker's attackers
            possibledefs = @attackers[attackerid] || []
            for defender in defenders
                if defender in possibledefs
                    return true
            return false
        if @attackers[arg.id]?
            for attacker in @attackers[arg.id]
                unless isDefended(attacker)
                    return false
            return true
        else
            true

    # subset args of AF.args is admissible if it's conflict free and each member is acceptable wrt to itself
    isAdmissible: (args) ->
        @isConflictFree(args) and args.every (arg) => @isAcceptable(arg, args)     

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
root.ArgumentFramework = ArgumentFramework