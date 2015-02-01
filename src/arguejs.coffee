###
Reasoners annotate a graph with indicators of node status (accepted / in abeyance / not accepted)
possible designs include:
static reasoning method
wrapper around a graph that
* listens to changes in the graph and updates accordingly
* provides additional information 
###

# labels each node with it's grounded acceptance
exports.grounded = (graph) ->
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

class Tokeniser
    constructor: (@remainder) ->
        @current = null
        @type = null
        @consume()

    # get next token
    consume: () ->
        matcher = (type, regex) =>
            r = @remainder.match regex
            if r
                @remainder = r[2]
                @current = r[1]
                @type = type
                true
            else
                false
        # return if we've previously reached eof
        return if @type is "eol"
        # eat any leading white space
        r = @remainder.match /^\s*(.*)$/
        @remainder = r[1] if r?
        # and check for eof
        if @remainder is ""
            @current = null
        # looking good: grab next token
        return if matcher "lab", /^([a-zA-Z0-9~][a-zA-Z0-9_]*)(.*)$/
        # bail if our rules havent identified the next token
        @current = null
        @type = "eol"

exports.parseInformal = (graph) -> 
    nodes = []
    edges = []
    lines = graph.split("\\n")
    for line in lines
        tok = new Tokeniser(line)
        if tok.type is 'lab'
            target = tok.current
            if not (target in nodes)
                nodes.push target
            target_idx = nodes.indexOf target
            while tok.type isnt 'eol'
                tok.consume()
                if tok.type is 'lab'
                    attacker = tok.current
                    if not (attacker in nodes)
                        nodes.push attacker
                    attacker_idx = nodes.indexOf attacker
                    edge = 
                        from: attacker_idx
                        to: target_idx
                    if not (edge in edges)
                        edges.push edge
    { nodes: ({label: node, id: idx} for node, idx in nodes), edges: edges }

