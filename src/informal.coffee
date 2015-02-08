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

parseInformal = (graph) -> 
    nodes = []
    edges = []
    lines = if graph.indexOf('\u000a')>-1 then graph.split('\u000a') else graph.split("\\n")
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

root = exports ? window
root.parseInformal = parseInformal