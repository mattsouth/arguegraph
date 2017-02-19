# Arguegraph

Abstract argumentation considers a directed graph as an argument framework where
nodes represent arguments and edges represent conflicts between the arguments.  
Multiple algorithms can be used to consider the acceptability or admissibility
(warning: technical terms!) of arguments in a particular framework. This library
implements those algorithms using coffeescript which compiles to javascript,
mostly for pedagogic purposes.

[Demo](http://mattsouth.github.io/arguegraph/demo.html) - review all distinct argument frameworks with up to three nodes.

## See Also

* [A Gentle Introduction to Argumentation Semantics - Caminada 2008](http://citeseerx.ist.psu.edu/viewdoc/download?doi=10.1.1.379.6308&rep=rep1&type=pdf)
* [Proof Theories and Algorithms for Abstract Argumentation Frameworks - Modgil and Caminada 2009](http://link.springer.com/chapter/10.1007%2F978-0-387-98197-0_6)
* http://en.wikipedia.org/wiki/Argumentation_framework
* http://ova.computing.dundee.ac.uk/ova-gen/
* http://lidia.cs.uns.edu.ar/delp_client/
* http://www.argkit.org

## TODO

* Generate all complete labellings
* Generate all extensions (stable, semi-stable, ideal, eager)
* Argument game implementations
