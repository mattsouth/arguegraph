/*
shared code betwoeen demo and editor html pages
*/

let semantics = {
  grounded: {
    name: 'Grounded Extension',
    description: 'Grounded semantics are the most sceptical.  Nodes/arguments are in the grounded extension if they are unattacked or defended by an argument that is already in the extension. For any network there is only ever one ground extension. Yellow nodes are in the grounded extension. Red nodes are not.',
    reasoner: 'GroundedLabeller',
    multi: false
  },
  ideal: {
    name: 'Ideal Extension',
    description: 'Ideal semantics produce a single extension that can be less sceptical than grounded.  Nodes/arguments are in the ideal extension if they can defend themselves and they are in all preferred extensions. Yellow nodes are in the idea extension. Red nodes are not.',
    reasoner: 'IdealSemantics',
    multi: false
  },
  stable: {
    name: 'Stable Extensions',
    description: 'Stable semantics define extensions that defeat every other argument in the framework, so are a subset of the preferred extensions. Yellow nodes are in the selected extension. Red nodes are not.',
    reasoner: 'StableSemantics',
    multi: true
  },
  preferred: {
    name: 'Preferred Extensions',
    description: 'Preferred semantics are the most credulous.  Nodes/arguments are in a preferred extension if they can defend themselves and the extension fills as much of the argument framework as it can.  There can be more than one extension - try stepping through them all! Yellow nodes are in the selected extension. Red nodes are not.',
    reasoner: 'PreferredLabeller',
    multi: true
  }
};

Object.keys(semantics).forEach(function(logic) {
  $('#semantics-options').append($('<option>', {
    value: logic,
    text: semantics[logic].name
  }));
});
