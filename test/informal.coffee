should = require('chai').should()
Parser = require '../src/informal'
Async = require 'async'
Mocha = require 'mocha'

describe 'Informal Parser', ->
    it 'should parse a simple graph', ->
        grph = Parser.parseInformal "a b"
        grph.nodes.should.have.length 2
        grph.edges.should.have.length 1
    it 'should parse a multi-line graph', ->
        grph = Parser.parseInformal "a b\\na b"
        grph.nodes.should.have.length 2
        grph.edges.should.have.length 2