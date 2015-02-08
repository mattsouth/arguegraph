###
Reasoners annotate a graph with indicators of node status (accepted / in abeyance / not accepted)
possible designs include:
static reasoning method
wrapper around a graph that
* listens to changes in the graph and updates accordingly
* provides additional information 
###
Vis = require 'vis'

class ArgumentFramework
    constructor: (@nodes = new Vis.DataSet(), @edges = new Vis.DataSet()) ->

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