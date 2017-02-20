# Arguegraph

Abstract argumentation considers an argument framework to be a directed graph where
nodes represent arguments and edges represent conflicts between the arguments.  
Multiple algorithms can be used to assess the validity of arguments in a particular framework.
This javascript library implements those algorithms in coffeescript, mostly for pedagogic purposes.

[Demo](http://mattsouth.github.io/arguegraph/demo.html) - review all distinct argument frameworks with up to three nodes.

## References

* [A Gentle Introduction to Argumentation Semantics - Caminada 2008](http://citeseerx.ist.psu.edu/viewdoc/download?doi=10.1.1.379.6308&rep=rep1&type=pdf)
* [Proof Theories and Algorithms for Abstract Argumentation Frameworks - Modgil and Caminada 2009](http://link.springer.com/chapter/10.1007%2F978-0-387-98197-0_6)
* http://en.wikipedia.org/wiki/Argumentation_framework
* http://ova.computing.dundee.ac.uk/ova-gen/
* http://lidia.cs.uns.edu.ar/delp_client/
* http://www.argkit.org

## TODO

* Generate all complete labellings
* Generate all extensions (semi-stable, eager, ...)
* Argument game implementations
* Alternative sources of arguments
