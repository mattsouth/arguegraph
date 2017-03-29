/*
shared code between demo pages.
*/
let nodes = new vis.DataSet();
let edges = new vis.DataSet();

let extensions = null;
let extension_index = -1;

let semantics_selected = null;
let semantics = {
  grounded: {
    name: 'Grounded Extension',
    description: 'Grounded semantics are the most sceptical.  Nodes/arguments are in the grounded extension if they are unattacked or defended by an argument that is already in the extension. For any network there is only ever one grounded extension that may be empty. Yellow nodes are in the grounded extension. Red nodes are not.',
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
    description: 'Stable semantics define extensions that defeat every other argument in the framework, so are a subset of the preferred extensions. Some argument frameworks have no stable extensions. Yellow nodes are in the selected extension. Red nodes are not.',
    reasoner: 'StableSemantics',
    multi: true
  },
  preferred: {
    name: 'Preferred Extensions',
    description: 'Preferred semantics are the most credulous.  Nodes/arguments are in a preferred extension if they can defend themselves and the extension fills as much of the argument framework as it can.  There can be more than one extension. Yellow nodes are in the selected extension. Red nodes are not.',
    reasoner: 'PreferredLabeller',
    multi: true
  }
};
// populate semantics select options
Object.keys(semantics).forEach(function(logic) {
  $('#semantics-options').append($('<option>', {
    value: logic,
    text: semantics[logic].name
  }));
});

// default network options
let network_options = {
  edges: {
    arrows: 'to',
    color: 'gray'
  },
  locales: {
    en: {
      edit: 'Edit',
      del: 'Delete selected',
      back: 'Back',
      addNode: 'Add Argument',
      addEdge: 'Connect Arguments',
      editNode: 'Edit Argument',
      editEdge: 'Edit Edge',
      addDescription: 'Click in an empty space to place a new argument.',
      edgeDescription: 'Click on an argument and drag the edge to another argument to connect them.',
      editEdgeDescription: 'Click on the control points and drag them to an argument to connect to it.',
      createEdgeError: 'Cannot link edges to a cluster.',
      deleteClusterError: 'Clusters cannot be deleted.',
      editClusterError: 'Clusters cannot be edited.'
    }
  }
};

function showExtensionIndex() {
  document.getElementById('extension').textContent = (extension_index+1) + '/' + extensions.length;
}

function extup() {
  if (extension_index<(extensions.length-1)) {
    extension_index++;
  } else {
    extension_index=0;
  }
  update();
}

function extdown() {
  if (extension_index>0) {
    extension_index--;
  } else {
    extension_index=extensions.length-1;
  }
  update();
}

function getLabel(num) {
  // see http://cwestblog.com/2013/09/05/javascript-snippet-convert-number-to-column-name/
  for (var ret = '', a = 1, b = 26; (num -= a) >= 0; a = b, b *= 26) {
    ret = String.fromCharCode(parseInt((num % b) / a) + 65) + ret;
  }
  return ret;
}

// returns defeat map derived from network
function networkToMap() {
  map = {};
  nodes.forEach(function(node) {
    map[node.id]=[];
  });
  edges.forEach(function(edge) {
    map[edge.to].push(edge.from.toString());
  });
  return map;
}

function networkToLabelMap() {
  map = {};
  nodes.forEach(function(node) {
    map[node.label]=[];
  });
  edges.forEach(function(edge) {
    map[nodes.get(edge.to).label].push(nodes.get(edge.from).label);
  });
  return map;
}

// populates network datasets with map
function setNodesAndEdgesFromLabelNetwork(map) {
  Object.keys(map).forEach(function(key) {
    nodes.add({label:key});
  });
  Object.keys(map).forEach(function(key) {
    let to_id = nodes.get({filter: function(item) { return (item.label == key); }})[0].id;
    map[key].forEach(function(attackerLabel) {
      let from_id = nodes.get({filter: function(item) { return (item.label == attackerLabel); }})[0].id;
      edges.add({from: from_id, to: to_id});
    });
  })
}

function clearArguments() {
  edges.clear();
  nodes.clear();
}
