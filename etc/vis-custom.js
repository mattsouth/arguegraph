!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.vis=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
exports.DataSet = require('./lib/DataSet');
exports.Network = require('./lib/network/Network');
},{"./lib/DataSet":2,"./lib/network/Network":11}],2:[function(require,module,exports){
var util = require('./util');
var Queue = require('./Queue');

/**
 * DataSet
 *
 * Usage:
 *     var dataSet = new DataSet({
 *         fieldId: '_id',
 *         type: {
 *             // ...
 *         }
 *     });
 *
 *     dataSet.add(item);
 *     dataSet.add(data);
 *     dataSet.update(item);
 *     dataSet.update(data);
 *     dataSet.remove(id);
 *     dataSet.remove(ids);
 *     var data = dataSet.get();
 *     var data = dataSet.get(id);
 *     var data = dataSet.get(ids);
 *     var data = dataSet.get(ids, options, data);
 *     dataSet.clear();
 *
 * A data set can:
 * - add/remove/update data
 * - gives triggers upon changes in the data
 * - can  import/export data in various data formats
 *
 * @param {Array | DataTable} [data]    Optional array with initial data
 * @param {Object} [options]   Available options:
 *                             {String} fieldId Field name of the id in the
 *                                              items, 'id' by default.
 *                             {Object.<String, String} type
 *                                              A map with field names as key,
 *                                              and the field type as value.
 *                             {Object} queue   Queue changes to the DataSet,
 *                                              flush them all at once.
 *                                              Queue options:
 *                                              - {number} delay  Delay in ms, null by default
 *                                              - {number} max    Maximum number of entries in the queue, Infinity by default
 * @constructor DataSet
 */
// TODO: add a DataSet constructor DataSet(data, options)
function DataSet (data, options) {
  // correctly read optional arguments
  if (data && !Array.isArray(data) && !util.isDataTable(data)) {
    options = data;
    data = null;
  }

  this._options = options || {};
  this._data = {};                                 // map with data indexed by id
  this.length = 0;                                 // number of items in the DataSet
  this._fieldId = this._options.fieldId || 'id';   // name of the field containing id
  this._type = {};                                 // internal field types (NOTE: this can differ from this._options.type)

  // all variants of a Date are internally stored as Date, so we can convert
  // from everything to everything (also from ISODate to Number for example)
  if (this._options.type) {
    for (var field in this._options.type) {
      if (this._options.type.hasOwnProperty(field)) {
        var value = this._options.type[field];
        if (value == 'Date' || value == 'ISODate' || value == 'ASPDate') {
          this._type[field] = 'Date';
        }
        else {
          this._type[field] = value;
        }
      }
    }
  }

  // TODO: deprecated since version 1.1.1 (or 2.0.0?)
  if (this._options.convert) {
    throw new Error('Option "convert" is deprecated. Use "type" instead.');
  }

  this._subscribers = {};  // event subscribers

  // add initial data when provided
  if (data) {
    this.add(data);
  }

  this.setOptions(options);
}

/**
 * @param {Object} [options]   Available options:
 *                             {Object} queue   Queue changes to the DataSet,
 *                                              flush them all at once.
 *                                              Queue options:
 *                                              - {number} delay  Delay in ms, null by default
 *                                              - {number} max    Maximum number of entries in the queue, Infinity by default
 * @param options
 */
DataSet.prototype.setOptions = function(options) {
  if (options && options.queue !== undefined) {
    if (options.queue === false) {
      // delete queue if loaded
      if (this._queue) {
        this._queue.destroy();
        delete this._queue;
      }
    }
    else {
      // create queue and update its options
      if (!this._queue) {
        this._queue = Queue.extend(this, {
          replace: ['add', 'update', 'remove']
        });
      }

      if (typeof options.queue === 'object') {
        this._queue.setOptions(options.queue);
      }
    }
  }
};

/**
 * Subscribe to an event, add an event listener
 * @param {String} event        Event name. Available events: 'put', 'update',
 *                              'remove'
 * @param {function} callback   Callback method. Called with three parameters:
 *                                  {String} event
 *                                  {Object | null} params
 *                                  {String | Number} senderId
 */
DataSet.prototype.on = function(event, callback) {
  var subscribers = this._subscribers[event];
  if (!subscribers) {
    subscribers = [];
    this._subscribers[event] = subscribers;
  }

  subscribers.push({
    callback: callback
  });
};

// TODO: make this function deprecated (replaced with `on` since version 0.5)
DataSet.prototype.subscribe = DataSet.prototype.on;

/**
 * Unsubscribe from an event, remove an event listener
 * @param {String} event
 * @param {function} callback
 */
DataSet.prototype.off = function(event, callback) {
  var subscribers = this._subscribers[event];
  if (subscribers) {
    this._subscribers[event] = subscribers.filter(function (listener) {
      return (listener.callback != callback);
    });
  }
};

// TODO: make this function deprecated (replaced with `on` since version 0.5)
DataSet.prototype.unsubscribe = DataSet.prototype.off;

/**
 * Trigger an event
 * @param {String} event
 * @param {Object | null} params
 * @param {String} [senderId]       Optional id of the sender.
 * @private
 */
DataSet.prototype._trigger = function (event, params, senderId) {
  if (event == '*') {
    throw new Error('Cannot trigger event *');
  }

  var subscribers = [];
  if (event in this._subscribers) {
    subscribers = subscribers.concat(this._subscribers[event]);
  }
  if ('*' in this._subscribers) {
    subscribers = subscribers.concat(this._subscribers['*']);
  }

  for (var i = 0; i < subscribers.length; i++) {
    var subscriber = subscribers[i];
    if (subscriber.callback) {
      subscriber.callback(event, params, senderId || null);
    }
  }
};

/**
 * Add data.
 * Adding an item will fail when there already is an item with the same id.
 * @param {Object | Array | DataTable} data
 * @param {String} [senderId] Optional sender id
 * @return {Array} addedIds      Array with the ids of the added items
 */
DataSet.prototype.add = function (data, senderId) {
  var addedIds = [],
      id,
      me = this;

  if (Array.isArray(data)) {
    // Array
    for (var i = 0, len = data.length; i < len; i++) {
      id = me._addItem(data[i]);
      addedIds.push(id);
    }
  }
  else if (util.isDataTable(data)) {
    // Google DataTable
    var columns = this._getColumnNames(data);
    for (var row = 0, rows = data.getNumberOfRows(); row < rows; row++) {
      var item = {};
      for (var col = 0, cols = columns.length; col < cols; col++) {
        var field = columns[col];
        item[field] = data.getValue(row, col);
      }

      id = me._addItem(item);
      addedIds.push(id);
    }
  }
  else if (data instanceof Object) {
    // Single item
    id = me._addItem(data);
    addedIds.push(id);
  }
  else {
    throw new Error('Unknown dataType');
  }

  if (addedIds.length) {
    this._trigger('add', {items: addedIds}, senderId);
  }

  return addedIds;
};

/**
 * Update existing items. When an item does not exist, it will be created
 * @param {Object | Array | DataTable} data
 * @param {String} [senderId] Optional sender id
 * @return {Array} updatedIds     The ids of the added or updated items
 */
DataSet.prototype.update = function (data, senderId) {
  var addedIds = [];
  var updatedIds = [];
  var updatedData = [];
  var me = this;
  var fieldId = me._fieldId;

  var addOrUpdate = function (item) {
    var id = item[fieldId];
    if (me._data[id]) {
      // update item
      id = me._updateItem(item);
      updatedIds.push(id);
      updatedData.push(item);
    }
    else {
      // add new item
      id = me._addItem(item);
      addedIds.push(id);
    }
  };

  if (Array.isArray(data)) {
    // Array
    for (var i = 0, len = data.length; i < len; i++) {
      addOrUpdate(data[i]);
    }
  }
  else if (util.isDataTable(data)) {
    // Google DataTable
    var columns = this._getColumnNames(data);
    for (var row = 0, rows = data.getNumberOfRows(); row < rows; row++) {
      var item = {};
      for (var col = 0, cols = columns.length; col < cols; col++) {
        var field = columns[col];
        item[field] = data.getValue(row, col);
      }

      addOrUpdate(item);
    }
  }
  else if (data instanceof Object) {
    // Single item
    addOrUpdate(data);
  }
  else {
    throw new Error('Unknown dataType');
  }

  if (addedIds.length) {
    this._trigger('add', {items: addedIds}, senderId);
  }
  if (updatedIds.length) {
    this._trigger('update', {items: updatedIds, data: updatedData}, senderId);
  }

  return addedIds.concat(updatedIds);
};

/**
 * Get a data item or multiple items.
 *
 * Usage:
 *
 *     get()
 *     get(options: Object)
 *     get(options: Object, data: Array | DataTable)
 *
 *     get(id: Number | String)
 *     get(id: Number | String, options: Object)
 *     get(id: Number | String, options: Object, data: Array | DataTable)
 *
 *     get(ids: Number[] | String[])
 *     get(ids: Number[] | String[], options: Object)
 *     get(ids: Number[] | String[], options: Object, data: Array | DataTable)
 *
 * Where:
 *
 * {Number | String} id         The id of an item
 * {Number[] | String{}} ids    An array with ids of items
 * {Object} options             An Object with options. Available options:
 *                              {String} [returnType] Type of data to be
 *                                  returned. Can be 'DataTable' or 'Array' (default)
 *                              {Object.<String, String>} [type]
 *                              {String[]} [fields] field names to be returned
 *                              {function} [filter] filter items
 *                              {String | function} [order] Order the items by
 *                                  a field name or custom sort function.
 * {Array | DataTable} [data]   If provided, items will be appended to this
 *                              array or table. Required in case of Google
 *                              DataTable.
 *
 * @throws Error
 */
DataSet.prototype.get = function (args) {
  var me = this;

  // parse the arguments
  var id, ids, options, data;
  var firstType = util.getType(arguments[0]);
  if (firstType == 'String' || firstType == 'Number') {
    // get(id [, options] [, data])
    id = arguments[0];
    options = arguments[1];
    data = arguments[2];
  }
  else if (firstType == 'Array') {
    // get(ids [, options] [, data])
    ids = arguments[0];
    options = arguments[1];
    data = arguments[2];
  }
  else {
    // get([, options] [, data])
    options = arguments[0];
    data = arguments[1];
  }

  // determine the return type
  var returnType;
  if (options && options.returnType) {
    var allowedValues = ["DataTable", "Array", "Object"];
    returnType = allowedValues.indexOf(options.returnType) == -1 ? "Array" : options.returnType;

    if (data && (returnType != util.getType(data))) {
      throw new Error('Type of parameter "data" (' + util.getType(data) + ') ' +
          'does not correspond with specified options.type (' + options.type + ')');
    }
    if (returnType == 'DataTable' && !util.isDataTable(data)) {
      throw new Error('Parameter "data" must be a DataTable ' +
          'when options.type is "DataTable"');
    }
  }
  else if (data) {
    returnType = (util.getType(data) == 'DataTable') ? 'DataTable' : 'Array';
  }
  else {
    returnType = 'Array';
  }

  // build options
  var type = options && options.type || this._options.type;
  var filter = options && options.filter;
  var items = [], item, itemId, i, len;

  // convert items
  if (id != undefined) {
    // return a single item
    item = me._getItem(id, type);
    if (filter && !filter(item)) {
      item = null;
    }
  }
  else if (ids != undefined) {
    // return a subset of items
    for (i = 0, len = ids.length; i < len; i++) {
      item = me._getItem(ids[i], type);
      if (!filter || filter(item)) {
        items.push(item);
      }
    }
  }
  else {
    // return all items
    for (itemId in this._data) {
      if (this._data.hasOwnProperty(itemId)) {
        item = me._getItem(itemId, type);
        if (!filter || filter(item)) {
          items.push(item);
        }
      }
    }
  }

  // order the results
  if (options && options.order && id == undefined) {
    this._sort(items, options.order);
  }

  // filter fields of the items
  if (options && options.fields) {
    var fields = options.fields;
    if (id != undefined) {
      item = this._filterFields(item, fields);
    }
    else {
      for (i = 0, len = items.length; i < len; i++) {
        items[i] = this._filterFields(items[i], fields);
      }
    }
  }

  // return the results
  if (returnType == 'DataTable') {
    var columns = this._getColumnNames(data);
    if (id != undefined) {
      // append a single item to the data table
      me._appendRow(data, columns, item);
    }
    else {
      // copy the items to the provided data table
      for (i = 0; i < items.length; i++) {
        me._appendRow(data, columns, items[i]);
      }
    }
    return data;
  }
  else if (returnType == "Object") {
    var result = {};
    for (i = 0; i < items.length; i++) {
      result[items[i].id] = items[i];
    }
    return result;
  }
  else {
    // return an array
    if (id != undefined) {
      // a single item
      return item;
    }
    else {
      // multiple items
      if (data) {
        // copy the items to the provided array
        for (i = 0, len = items.length; i < len; i++) {
          data.push(items[i]);
        }
        return data;
      }
      else {
        // just return our array
        return items;
      }
    }
  }
};

/**
 * Get ids of all items or from a filtered set of items.
 * @param {Object} [options]    An Object with options. Available options:
 *                              {function} [filter] filter items
 *                              {String | function} [order] Order the items by
 *                                  a field name or custom sort function.
 * @return {Array} ids
 */
DataSet.prototype.getIds = function (options) {
  var data = this._data,
      filter = options && options.filter,
      order = options && options.order,
      type = options && options.type || this._options.type,
      i,
      len,
      id,
      item,
      items,
      ids = [];

  if (filter) {
    // get filtered items
    if (order) {
      // create ordered list
      items = [];
      for (id in data) {
        if (data.hasOwnProperty(id)) {
          item = this._getItem(id, type);
          if (filter(item)) {
            items.push(item);
          }
        }
      }

      this._sort(items, order);

      for (i = 0, len = items.length; i < len; i++) {
        ids[i] = items[i][this._fieldId];
      }
    }
    else {
      // create unordered list
      for (id in data) {
        if (data.hasOwnProperty(id)) {
          item = this._getItem(id, type);
          if (filter(item)) {
            ids.push(item[this._fieldId]);
          }
        }
      }
    }
  }
  else {
    // get all items
    if (order) {
      // create an ordered list
      items = [];
      for (id in data) {
        if (data.hasOwnProperty(id)) {
          items.push(data[id]);
        }
      }

      this._sort(items, order);

      for (i = 0, len = items.length; i < len; i++) {
        ids[i] = items[i][this._fieldId];
      }
    }
    else {
      // create unordered list
      for (id in data) {
        if (data.hasOwnProperty(id)) {
          item = data[id];
          ids.push(item[this._fieldId]);
        }
      }
    }
  }

  return ids;
};

/**
 * Returns the DataSet itself. Is overwritten for example by the DataView,
 * which returns the DataSet it is connected to instead.
 */
DataSet.prototype.getDataSet = function () {
  return this;
};

/**
 * Execute a callback function for every item in the dataset.
 * @param {function} callback
 * @param {Object} [options]    Available options:
 *                              {Object.<String, String>} [type]
 *                              {String[]} [fields] filter fields
 *                              {function} [filter] filter items
 *                              {String | function} [order] Order the items by
 *                                  a field name or custom sort function.
 */
DataSet.prototype.forEach = function (callback, options) {
  var filter = options && options.filter,
      type = options && options.type || this._options.type,
      data = this._data,
      item,
      id;

  if (options && options.order) {
    // execute forEach on ordered list
    var items = this.get(options);

    for (var i = 0, len = items.length; i < len; i++) {
      item = items[i];
      id = item[this._fieldId];
      callback(item, id);
    }
  }
  else {
    // unordered
    for (id in data) {
      if (data.hasOwnProperty(id)) {
        item = this._getItem(id, type);
        if (!filter || filter(item)) {
          callback(item, id);
        }
      }
    }
  }
};

/**
 * Map every item in the dataset.
 * @param {function} callback
 * @param {Object} [options]    Available options:
 *                              {Object.<String, String>} [type]
 *                              {String[]} [fields] filter fields
 *                              {function} [filter] filter items
 *                              {String | function} [order] Order the items by
 *                                  a field name or custom sort function.
 * @return {Object[]} mappedItems
 */
DataSet.prototype.map = function (callback, options) {
  var filter = options && options.filter,
      type = options && options.type || this._options.type,
      mappedItems = [],
      data = this._data,
      item;

  // convert and filter items
  for (var id in data) {
    if (data.hasOwnProperty(id)) {
      item = this._getItem(id, type);
      if (!filter || filter(item)) {
        mappedItems.push(callback(item, id));
      }
    }
  }

  // order items
  if (options && options.order) {
    this._sort(mappedItems, options.order);
  }

  return mappedItems;
};

/**
 * Filter the fields of an item
 * @param {Object | null} item
 * @param {String[]} fields     Field names
 * @return {Object | null} filteredItem or null if no item is provided
 * @private
 */
DataSet.prototype._filterFields = function (item, fields) {
  if (!item) { // item is null
    return item;
  }

  var filteredItem = {};

  for (var field in item) {
    if (item.hasOwnProperty(field) && (fields.indexOf(field) != -1)) {
      filteredItem[field] = item[field];
    }
  }

  return filteredItem;
};

/**
 * Sort the provided array with items
 * @param {Object[]} items
 * @param {String | function} order      A field name or custom sort function.
 * @private
 */
DataSet.prototype._sort = function (items, order) {
  if (util.isString(order)) {
    // order by provided field name
    var name = order; // field name
    items.sort(function (a, b) {
      var av = a[name];
      var bv = b[name];
      return (av > bv) ? 1 : ((av < bv) ? -1 : 0);
    });
  }
  else if (typeof order === 'function') {
    // order by sort function
    items.sort(order);
  }
  // TODO: extend order by an Object {field:String, direction:String}
  //       where direction can be 'asc' or 'desc'
  else {
    throw new TypeError('Order must be a function or a string');
  }
};

/**
 * Remove an object by pointer or by id
 * @param {String | Number | Object | Array} id Object or id, or an array with
 *                                              objects or ids to be removed
 * @param {String} [senderId] Optional sender id
 * @return {Array} removedIds
 */
DataSet.prototype.remove = function (id, senderId) {
  var removedIds = [],
      i, len, removedId;

  if (Array.isArray(id)) {
    for (i = 0, len = id.length; i < len; i++) {
      removedId = this._remove(id[i]);
      if (removedId != null) {
        removedIds.push(removedId);
      }
    }
  }
  else {
    removedId = this._remove(id);
    if (removedId != null) {
      removedIds.push(removedId);
    }
  }

  if (removedIds.length) {
    this._trigger('remove', {items: removedIds}, senderId);
  }

  return removedIds;
};

/**
 * Remove an item by its id
 * @param {Number | String | Object} id   id or item
 * @returns {Number | String | null} id
 * @private
 */
DataSet.prototype._remove = function (id) {
  if (util.isNumber(id) || util.isString(id)) {
    if (this._data[id]) {
      delete this._data[id];
      this.length--;
      return id;
    }
  }
  else if (id instanceof Object) {
    var itemId = id[this._fieldId];
    if (itemId && this._data[itemId]) {
      delete this._data[itemId];
      this.length--;
      return itemId;
    }
  }
  return null;
};

/**
 * Clear the data
 * @param {String} [senderId] Optional sender id
 * @return {Array} removedIds    The ids of all removed items
 */
DataSet.prototype.clear = function (senderId) {
  var ids = Object.keys(this._data);

  this._data = {};
  this.length = 0;

  this._trigger('remove', {items: ids}, senderId);

  return ids;
};

/**
 * Find the item with maximum value of a specified field
 * @param {String} field
 * @return {Object | null} item  Item containing max value, or null if no items
 */
DataSet.prototype.max = function (field) {
  var data = this._data,
      max = null,
      maxField = null;

  for (var id in data) {
    if (data.hasOwnProperty(id)) {
      var item = data[id];
      var itemField = item[field];
      if (itemField != null && (!max || itemField > maxField)) {
        max = item;
        maxField = itemField;
      }
    }
  }

  return max;
};

/**
 * Find the item with minimum value of a specified field
 * @param {String} field
 * @return {Object | null} item  Item containing max value, or null if no items
 */
DataSet.prototype.min = function (field) {
  var data = this._data,
      min = null,
      minField = null;

  for (var id in data) {
    if (data.hasOwnProperty(id)) {
      var item = data[id];
      var itemField = item[field];
      if (itemField != null && (!min || itemField < minField)) {
        min = item;
        minField = itemField;
      }
    }
  }

  return min;
};

/**
 * Find all distinct values of a specified field
 * @param {String} field
 * @return {Array} values  Array containing all distinct values. If data items
 *                         do not contain the specified field are ignored.
 *                         The returned array is unordered.
 */
DataSet.prototype.distinct = function (field) {
  var data = this._data;
  var values = [];
  var fieldType = this._options.type && this._options.type[field] || null;
  var count = 0;
  var i;

  for (var prop in data) {
    if (data.hasOwnProperty(prop)) {
      var item = data[prop];
      var value = item[field];
      var exists = false;
      for (i = 0; i < count; i++) {
        if (values[i] == value) {
          exists = true;
          break;
        }
      }
      if (!exists && (value !== undefined)) {
        values[count] = value;
        count++;
      }
    }
  }

  if (fieldType) {
    for (i = 0; i < values.length; i++) {
      values[i] = util.convert(values[i], fieldType);
    }
  }

  return values;
};

/**
 * Add a single item. Will fail when an item with the same id already exists.
 * @param {Object} item
 * @return {String} id
 * @private
 */
DataSet.prototype._addItem = function (item) {
  var id = item[this._fieldId];

  if (id != undefined) {
    // check whether this id is already taken
    if (this._data[id]) {
      // item already exists
      throw new Error('Cannot add item: item with id ' + id + ' already exists');
    }
  }
  else {
    // generate an id
    id = util.randomUUID();
    item[this._fieldId] = id;
  }

  var d = {};
  for (var field in item) {
    if (item.hasOwnProperty(field)) {
      var fieldType = this._type[field];  // type may be undefined
      d[field] = util.convert(item[field], fieldType);
    }
  }
  this._data[id] = d;
  this.length++;

  return id;
};

/**
 * Get an item. Fields can be converted to a specific type
 * @param {String} id
 * @param {Object.<String, String>} [types]  field types to convert
 * @return {Object | null} item
 * @private
 */
DataSet.prototype._getItem = function (id, types) {
  var field, value;

  // get the item from the dataset
  var raw = this._data[id];
  if (!raw) {
    return null;
  }

  // convert the items field types
  var converted = {};
  if (types) {
    for (field in raw) {
      if (raw.hasOwnProperty(field)) {
        value = raw[field];
        converted[field] = util.convert(value, types[field]);
      }
    }
  }
  else {
    // no field types specified, no converting needed
    for (field in raw) {
      if (raw.hasOwnProperty(field)) {
        value = raw[field];
        converted[field] = value;
      }
    }
  }
  return converted;
};

/**
 * Update a single item: merge with existing item.
 * Will fail when the item has no id, or when there does not exist an item
 * with the same id.
 * @param {Object} item
 * @return {String} id
 * @private
 */
DataSet.prototype._updateItem = function (item) {
  var id = item[this._fieldId];
  if (id == undefined) {
    throw new Error('Cannot update item: item has no id (item: ' + JSON.stringify(item) + ')');
  }
  var d = this._data[id];
  if (!d) {
    // item doesn't exist
    throw new Error('Cannot update item: no item with id ' + id + ' found');
  }

  // merge with current item
  for (var field in item) {
    if (item.hasOwnProperty(field)) {
      var fieldType = this._type[field];  // type may be undefined
      d[field] = util.convert(item[field], fieldType);
    }
  }

  return id;
};

/**
 * Get an array with the column names of a Google DataTable
 * @param {DataTable} dataTable
 * @return {String[]} columnNames
 * @private
 */
DataSet.prototype._getColumnNames = function (dataTable) {
  var columns = [];
  for (var col = 0, cols = dataTable.getNumberOfColumns(); col < cols; col++) {
    columns[col] = dataTable.getColumnId(col) || dataTable.getColumnLabel(col);
  }
  return columns;
};

/**
 * Append an item as a row to the dataTable
 * @param dataTable
 * @param columns
 * @param item
 * @private
 */
DataSet.prototype._appendRow = function (dataTable, columns, item) {
  var row = dataTable.addRow();

  for (var col = 0, cols = columns.length; col < cols; col++) {
    var field = columns[col];
    dataTable.setValue(row, col, item[field]);
  }
};

module.exports = DataSet;

},{"./Queue":4,"./util":30}],3:[function(require,module,exports){
var util = require('./util');
var DataSet = require('./DataSet');

/**
 * DataView
 *
 * a dataview offers a filtered view on a dataset or an other dataview.
 *
 * @param {DataSet | DataView} data
 * @param {Object} [options]   Available options: see method get
 *
 * @constructor DataView
 */
function DataView (data, options) {
  this._data = null;
  this._ids = {}; // ids of the items currently in memory (just contains a boolean true)
  this.length = 0; // number of items in the DataView
  this._options = options || {};
  this._fieldId = 'id'; // name of the field containing id
  this._subscribers = {}; // event subscribers

  var me = this;
  this.listener = function () {
    me._onEvent.apply(me, arguments);
  };

  this.setData(data);
}

// TODO: implement a function .config() to dynamically update things like configured filter
// and trigger changes accordingly

/**
 * Set a data source for the view
 * @param {DataSet | DataView} data
 */
DataView.prototype.setData = function (data) {
  var ids, i, len;

  if (this._data) {
    // unsubscribe from current dataset
    if (this._data.unsubscribe) {
      this._data.unsubscribe('*', this.listener);
    }

    // trigger a remove of all items in memory
    ids = [];
    for (var id in this._ids) {
      if (this._ids.hasOwnProperty(id)) {
        ids.push(id);
      }
    }
    this._ids = {};
    this.length = 0;
    this._trigger('remove', {items: ids});
  }

  this._data = data;

  if (this._data) {
    // update fieldId
    this._fieldId = this._options.fieldId ||
        (this._data && this._data.options && this._data.options.fieldId) ||
        'id';

    // trigger an add of all added items
    ids = this._data.getIds({filter: this._options && this._options.filter});
    for (i = 0, len = ids.length; i < len; i++) {
      id = ids[i];
      this._ids[id] = true;
    }
    this.length = ids.length;
    this._trigger('add', {items: ids});

    // subscribe to new dataset
    if (this._data.on) {
      this._data.on('*', this.listener);
    }
  }
};

/**
 * Refresh the DataView. Useful when the DataView has a filter function
 * containing a variable parameter.
 */
DataView.prototype.refresh = function () {
  var id;
  var ids = this._data.getIds({filter: this._options && this._options.filter});
  var newIds = {};
  var added = [];
  var removed = [];

  // check for additions
  for (var i = 0; i < ids.length; i++) {
    id = ids[i];
    newIds[id] = true;
    if (!this._ids[id]) {
      added.push(id);
      this._ids[id] = true;
      this.length++;
    }
  }

  // check for removals
  for (id in this._ids) {
    if (this._ids.hasOwnProperty(id)) {
      if (!newIds[id]) {
        removed.push(id);
        delete this._ids[id];
        this.length--;
      }
    }
  }

  // trigger events
  if (added.length) {
    this._trigger('add', {items: added});
  }
  if (removed.length) {
    this._trigger('remove', {items: removed});
  }
};

/**
 * Get data from the data view
 *
 * Usage:
 *
 *     get()
 *     get(options: Object)
 *     get(options: Object, data: Array | DataTable)
 *
 *     get(id: Number)
 *     get(id: Number, options: Object)
 *     get(id: Number, options: Object, data: Array | DataTable)
 *
 *     get(ids: Number[])
 *     get(ids: Number[], options: Object)
 *     get(ids: Number[], options: Object, data: Array | DataTable)
 *
 * Where:
 *
 * {Number | String} id         The id of an item
 * {Number[] | String{}} ids    An array with ids of items
 * {Object} options             An Object with options. Available options:
 *                              {String} [type] Type of data to be returned. Can
 *                                              be 'DataTable' or 'Array' (default)
 *                              {Object.<String, String>} [convert]
 *                              {String[]} [fields] field names to be returned
 *                              {function} [filter] filter items
 *                              {String | function} [order] Order the items by
 *                                  a field name or custom sort function.
 * {Array | DataTable} [data]   If provided, items will be appended to this
 *                              array or table. Required in case of Google
 *                              DataTable.
 * @param args
 */
DataView.prototype.get = function (args) {
  var me = this;

  // parse the arguments
  var ids, options, data;
  var firstType = util.getType(arguments[0]);
  if (firstType == 'String' || firstType == 'Number' || firstType == 'Array') {
    // get(id(s) [, options] [, data])
    ids = arguments[0];  // can be a single id or an array with ids
    options = arguments[1];
    data = arguments[2];
  }
  else {
    // get([, options] [, data])
    options = arguments[0];
    data = arguments[1];
  }

  // extend the options with the default options and provided options
  var viewOptions = util.extend({}, this._options, options);

  // create a combined filter method when needed
  if (this._options.filter && options && options.filter) {
    viewOptions.filter = function (item) {
      return me._options.filter(item) && options.filter(item);
    }
  }

  // build up the call to the linked data set
  var getArguments = [];
  if (ids != undefined) {
    getArguments.push(ids);
  }
  getArguments.push(viewOptions);
  getArguments.push(data);

  return this._data && this._data.get.apply(this._data, getArguments);
};

/**
 * Get ids of all items or from a filtered set of items.
 * @param {Object} [options]    An Object with options. Available options:
 *                              {function} [filter] filter items
 *                              {String | function} [order] Order the items by
 *                                  a field name or custom sort function.
 * @return {Array} ids
 */
DataView.prototype.getIds = function (options) {
  var ids;

  if (this._data) {
    var defaultFilter = this._options.filter;
    var filter;

    if (options && options.filter) {
      if (defaultFilter) {
        filter = function (item) {
          return defaultFilter(item) && options.filter(item);
        }
      }
      else {
        filter = options.filter;
      }
    }
    else {
      filter = defaultFilter;
    }

    ids = this._data.getIds({
      filter: filter,
      order: options && options.order
    });
  }
  else {
    ids = [];
  }

  return ids;
};

/**
 * Get the DataSet to which this DataView is connected. In case there is a chain
 * of multiple DataViews, the root DataSet of this chain is returned.
 * @return {DataSet} dataSet
 */
DataView.prototype.getDataSet = function () {
  var dataSet = this;
  while (dataSet instanceof DataView) {
    dataSet = dataSet._data;
  }
  return dataSet || null;
};

/**
 * Event listener. Will propagate all events from the connected data set to
 * the subscribers of the DataView, but will filter the items and only trigger
 * when there are changes in the filtered data set.
 * @param {String} event
 * @param {Object | null} params
 * @param {String} senderId
 * @private
 */
DataView.prototype._onEvent = function (event, params, senderId) {
  var i, len, id, item,
      ids = params && params.items,
      data = this._data,
      added = [],
      updated = [],
      removed = [];

  if (ids && data) {
    switch (event) {
      case 'add':
        // filter the ids of the added items
        for (i = 0, len = ids.length; i < len; i++) {
          id = ids[i];
          item = this.get(id);
          if (item) {
            this._ids[id] = true;
            added.push(id);
          }
        }

        break;

      case 'update':
        // determine the event from the views viewpoint: an updated
        // item can be added, updated, or removed from this view.
        for (i = 0, len = ids.length; i < len; i++) {
          id = ids[i];
          item = this.get(id);

          if (item) {
            if (this._ids[id]) {
              updated.push(id);
            }
            else {
              this._ids[id] = true;
              added.push(id);
            }
          }
          else {
            if (this._ids[id]) {
              delete this._ids[id];
              removed.push(id);
            }
            else {
              // nothing interesting for me :-(
            }
          }
        }

        break;

      case 'remove':
        // filter the ids of the removed items
        for (i = 0, len = ids.length; i < len; i++) {
          id = ids[i];
          if (this._ids[id]) {
            delete this._ids[id];
            removed.push(id);
          }
        }

        break;
    }

    this.length += added.length - removed.length;

    if (added.length) {
      this._trigger('add', {items: added}, senderId);
    }
    if (updated.length) {
      this._trigger('update', {items: updated}, senderId);
    }
    if (removed.length) {
      this._trigger('remove', {items: removed}, senderId);
    }
  }
};

// copy subscription functionality from DataSet
DataView.prototype.on = DataSet.prototype.on;
DataView.prototype.off = DataSet.prototype.off;
DataView.prototype._trigger = DataSet.prototype._trigger;

// TODO: make these functions deprecated (replaced with `on` and `off` since version 0.5)
DataView.prototype.subscribe = DataView.prototype.on;
DataView.prototype.unsubscribe = DataView.prototype.off;

module.exports = DataView;
},{"./DataSet":2,"./util":30}],4:[function(require,module,exports){
/**
 * A queue
 * @param {Object} options
 *            Available options:
 *            - delay: number    When provided, the queue will be flushed
 *                               automatically after an inactivity of this delay
 *                               in milliseconds.
 *                               Default value is null.
 *            - max: number      When the queue exceeds the given maximum number
 *                               of entries, the queue is flushed automatically.
 *                               Default value of max is Infinity.
 * @constructor
 */
function Queue(options) {
  // options
  this.delay = null;
  this.max = Infinity;

  // properties
  this._queue = [];
  this._timeout = null;
  this._extended = null;

  this.setOptions(options);
}

/**
 * Update the configuration of the queue
 * @param {Object} options
 *            Available options:
 *            - delay: number    When provided, the queue will be flushed
 *                               automatically after an inactivity of this delay
 *                               in milliseconds.
 *                               Default value is null.
 *            - max: number      When the queue exceeds the given maximum number
 *                               of entries, the queue is flushed automatically.
 *                               Default value of max is Infinity.
 * @param options
 */
Queue.prototype.setOptions = function (options) {
  if (options && typeof options.delay !== 'undefined') {
    this.delay = options.delay;
  }
  if (options && typeof options.max !== 'undefined') {
    this.max = options.max;
  }

  this._flushIfNeeded();
};

/**
 * Extend an object with queuing functionality.
 * The object will be extended with a function flush, and the methods provided
 * in options.replace will be replaced with queued ones.
 * @param {Object} object
 * @param {Object} options
 *            Available options:
 *            - replace: Array.<string>
 *                               A list with method names of the methods
 *                               on the object to be replaced with queued ones.
 *            - delay: number    When provided, the queue will be flushed
 *                               automatically after an inactivity of this delay
 *                               in milliseconds.
 *                               Default value is null.
 *            - max: number      When the queue exceeds the given maximum number
 *                               of entries, the queue is flushed automatically.
 *                               Default value of max is Infinity.
 * @return {Queue} Returns the created queue
 */
Queue.extend = function (object, options) {
  var queue = new Queue(options);

  if (object.flush !== undefined) {
    throw new Error('Target object already has a property flush');
  }
  object.flush = function () {
    queue.flush();
  };

  var methods = [{
    name: 'flush',
    original: undefined
  }];

  if (options && options.replace) {
    for (var i = 0; i < options.replace.length; i++) {
      var name = options.replace[i];
      methods.push({
        name: name,
        original: object[name]
      });
      queue.replace(object, name);
    }
  }

  queue._extended = {
    object: object,
    methods: methods
  };

  return queue;
};

/**
 * Destroy the queue. The queue will first flush all queued actions, and in
 * case it has extended an object, will restore the original object.
 */
Queue.prototype.destroy = function () {
  this.flush();

  if (this._extended) {
    var object = this._extended.object;
    var methods = this._extended.methods;
    for (var i = 0; i < methods.length; i++) {
      var method = methods[i];
      if (method.original) {
        object[method.name] = method.original;
      }
      else {
        delete object[method.name];
      }
    }
    this._extended = null;
  }
};

/**
 * Replace a method on an object with a queued version
 * @param {Object} object   Object having the method
 * @param {string} method   The method name
 */
Queue.prototype.replace = function(object, method) {
  var me = this;
  var original = object[method];
  if (!original) {
    throw new Error('Method ' + method + ' undefined');
  }

  object[method] = function () {
    // create an Array with the arguments
    var args = [];
    for (var i = 0; i < arguments.length; i++) {
      args[i] = arguments[i];
    }

    // add this call to the queue
    me.queue({
      args: args,
      fn: original,
      context: this
    });
  };
};

/**
 * Queue a call
 * @param {function | {fn: function, args: Array} | {fn: function, args: Array, context: Object}} entry
 */
Queue.prototype.queue = function(entry) {
  if (typeof entry === 'function') {
    this._queue.push({fn: entry});
  }
  else {
    this._queue.push(entry);
  }

  this._flushIfNeeded();
};

/**
 * Check whether the queue needs to be flushed
 * @private
 */
Queue.prototype._flushIfNeeded = function () {
  // flush when the maximum is exceeded.
  if (this._queue.length > this.max) {
    this.flush();
  }

  // flush after a period of inactivity when a delay is configured
  clearTimeout(this._timeout);
  if (this.queue.length > 0 && typeof this.delay === 'number') {
    var me = this;
    this._timeout = setTimeout(function () {
      me.flush();
    }, this.delay);
  }
};

/**
 * Flush all queued calls
 */
Queue.prototype.flush = function () {
  while (this._queue.length > 0) {
    var entry = this._queue.shift();
    entry.fn.apply(entry.context || entry.fn, entry.args || []);
  }
};

module.exports = Queue;

},{}],5:[function(require,module,exports){
var Hammer = require('./module/hammer');

/**
 * Fake a hammer.js gesture. Event can be a ScrollEvent or MouseMoveEvent
 * @param {Element} element
 * @param {Event} event
 */
exports.fakeGesture = function(element, event) {
  var eventType = null;

  // for hammer.js 1.0.5
  // var gesture = Hammer.event.collectEventData(this, eventType, event);

  // for hammer.js 1.0.6+
  var touches = Hammer.event.getTouchList(event, eventType);
  var gesture = Hammer.event.collectEventData(this, eventType, touches, event);

  // on IE in standards mode, no touches are recognized by hammer.js,
  // resulting in NaN values for center.pageX and center.pageY
  if (isNaN(gesture.center.pageX)) {
    gesture.center.pageX = event.pageX;
  }
  if (isNaN(gesture.center.pageY)) {
    gesture.center.pageY = event.pageY;
  }

  return gesture;
};

},{"./module/hammer":6}],6:[function(require,module,exports){
// Only load hammer.js when in a browser environment
// (loading hammer.js in a node.js environment gives errors)
if (typeof window !== 'undefined') {
  module.exports = window['Hammer'] || require('hammerjs');
}
else {
  module.exports = function () {
    throw Error('hammer.js is only available in a browser, not in node.js.');
  }
}

},{"hammerjs":32}],7:[function(require,module,exports){
// first check if moment.js is already loaded in the browser window, if so,
// use this instance. Else, load via commonjs.
module.exports = (typeof window !== 'undefined') && window['moment'] || require('moment');

},{"moment":34}],8:[function(require,module,exports){
var util = require('../util');
var Node = require('./Node');

/**
 * @class Edge
 *
 * A edge connects two nodes
 * @param {Object} properties     Object with properties. Must contain
 *                                At least properties from and to.
 *                                Available properties: from (number),
 *                                to (number), label (string, color (string),
 *                                width (number), style (string),
 *                                length (number), title (string)
 * @param {Network} network       A Network object, used to find and edge to
 *                                nodes.
 * @param {Object} constants      An object with default values for
 *                                example for the color
 */
function Edge (properties, network, networkConstants) {
  if (!network) {
    throw "No network provided";
  }
  var fields = ['edges','physics'];
  var constants = util.selectiveBridgeObject(fields,networkConstants);
  this.options = constants.edges;
  this.physics = constants.physics;
  this.options['smoothCurves'] = networkConstants['smoothCurves'];


  this.network = network;

  // initialize variables
  this.id     = undefined;
  this.fromId = undefined;
  this.toId   = undefined;
  this.title  = undefined;
  this.widthSelected = this.options.width * this.options.widthSelectionMultiplier;
  this.value  = undefined;
  this.selected = false;
  this.hover = false;
  this.labelDimensions = {top:0,left:0,width:0,height:0,yLine:0}; // could be cached
  this.dirtyLabel = true;
  this.colorDirty = true;

  this.from = null;   // a node
  this.to = null;     // a node
  this.via = null;    // a temp node

  this.fromBackup = null; // used to clean up after reconnect
  this.toBackup = null;;  // used to clean up after reconnect

  // we use this to be able to reconnect the edge to a cluster if its node is put into a cluster
  // by storing the original information we can revert to the original connection when the cluser is opened.
  this.originalFromId = [];
  this.originalToId = [];

  this.connected = false;

  this.widthFixed  = false;
  this.lengthFixed = false;

  this.setProperties(properties);

  this.controlNodesEnabled = false;
  this.controlNodes = {from:null, to:null, positions:{}};
  this.connectedNode = null;
}

/**
 * Set or overwrite properties for the edge
 * @param {Object} properties  an object with properties
 * @param {Object} constants   and object with default, global properties
 */
Edge.prototype.setProperties = function(properties) {
  this.colorDirty = true;
  if (!properties) {
    return;
  }

  var fields = ['style','fontSize','fontFace','fontColor','fontFill','fontStrokeWidth','fontStrokeColor','width',
    'widthSelectionMultiplier','hoverWidth','arrowScaleFactor','dash','inheritColor','labelAlignment', 'opacity',
    'customScalingFunction','useGradients'
  ];
  util.selectiveDeepExtend(fields, this.options, properties);

  if (properties.from !== undefined)           {this.fromId = properties.from;}
  if (properties.to !== undefined)             {this.toId = properties.to;}

  if (properties.id !== undefined)             {this.id = properties.id;}
  if (properties.label !== undefined)          {this.label = properties.label; this.dirtyLabel = true;}

  if (properties.title !== undefined)        {this.title = properties.title;}
  if (properties.value !== undefined)        {this.value = properties.value;}
  if (properties.length !== undefined)       {this.physics.springLength = properties.length;}

  if (properties.color !== undefined) {
    this.options.inheritColor = false;
    if (util.isString(properties.color)) {
      this.options.color.color = properties.color;
      this.options.color.highlight = properties.color;
    }
    else {
      if (properties.color.color !== undefined)     {this.options.color.color = properties.color.color;}
      if (properties.color.highlight !== undefined) {this.options.color.highlight = properties.color.highlight;}
      if (properties.color.hover !== undefined)     {this.options.color.hover = properties.color.hover;}
    }
  }



    // A node is connected when it has a from and to node.
  this.connect();

  this.widthFixed = this.widthFixed || (properties.width !== undefined);
  this.lengthFixed = this.lengthFixed || (properties.length !== undefined);

  this.widthSelected = this.options.width* this.options.widthSelectionMultiplier;

  // set draw method based on style
  switch (this.options.style) {
    case 'line':          this.draw = this._drawLine; break;
    case 'arrow':         this.draw = this._drawArrow; break;
    case 'arrow-center':  this.draw = this._drawArrowCenter; break;
    case 'dash-line':     this.draw = this._drawDashLine; break;
    default:              this.draw = this._drawLine; break;
  }
};


/**
 * Connect an edge to its nodes
 */
Edge.prototype.connect = function () {
  this.disconnect();

  this.from = this.network.nodes[this.fromId] || null;
  this.to = this.network.nodes[this.toId] || null;
  this.connected = (this.from && this.to);

  if (this.connected) {
    this.from.attachEdge(this);
    this.to.attachEdge(this);
  }
  else {
    if (this.from) {
      this.from.detachEdge(this);
    }
    if (this.to) {
      this.to.detachEdge(this);
    }
  }
};

/**
 * Disconnect an edge from its nodes
 */
Edge.prototype.disconnect = function () {
  if (this.from) {
    this.from.detachEdge(this);
    this.from = null;
  }
  if (this.to) {
    this.to.detachEdge(this);
    this.to = null;
  }

  this.connected = false;
};

/**
 * get the title of this edge.
 * @return {string} title    The title of the edge, or undefined when no title
 *                           has been set.
 */
Edge.prototype.getTitle = function() {
  return typeof this.title === "function" ? this.title() : this.title;
};


/**
 * Retrieve the value of the edge. Can be undefined
 * @return {Number} value
 */
Edge.prototype.getValue = function() {
  return this.value;
};

/**
 * Adjust the value range of the edge. The edge will adjust it's width
 * based on its value.
 * @param {Number} min
 * @param {Number} max
 */
Edge.prototype.setValueRange = function(min, max, total) {
  if (!this.widthFixed && this.value !== undefined) {
    var scale = this.options.customScalingFunction(min, max, total, this.value);
    var widthDiff = this.options.widthMax - this.options.widthMin;
    this.options.width = this.options.widthMin + scale * widthDiff;
    this.widthSelected = this.options.width* this.options.widthSelectionMultiplier;
  }
};

/**
 * Redraw a edge
 * Draw this edge in the given canvas
 * The 2d context of a HTML canvas can be retrieved by canvas.getContext("2d");
 * @param {CanvasRenderingContext2D}   ctx
 */
Edge.prototype.draw = function(ctx) {
  throw "Method draw not initialized in edge";
};

/**
 * Check if this object is overlapping with the provided object
 * @param {Object} obj   an object with parameters left, top
 * @return {boolean}     True if location is located on the edge
 */
Edge.prototype.isOverlappingWith = function(obj) {
  if (this.connected) {
    var distMax = 10;
    var xFrom = this.from.x;
    var yFrom = this.from.y;
    var xTo = this.to.x;
    var yTo = this.to.y;
    var xObj = obj.left;
    var yObj = obj.top;

    var dist = this._getDistanceToEdge(xFrom, yFrom, xTo, yTo, xObj, yObj);

    return (dist < distMax);
  }
  else {
    return false
  }
};

Edge.prototype._getColor = function(ctx) {
  var colorObj = this.options.color;
  if (this.options.useGradients == true) {
    var grd = ctx.createLinearGradient(this.from.x, this.from.y, this.to.x, this.to.y);
    var fromColor, toColor;
    fromColor = this.from.options.color.highlight.border;
    toColor = this.to.options.color.highlight.border;


    if (this.from.selected == false && this.to.selected == false) {
      fromColor = util.overrideOpacity(this.from.options.color.border, this.options.opacity);
      toColor = util.overrideOpacity(this.to.options.color.border, this.options.opacity);
    }
    else if (this.from.selected == true && this.to.selected == false) {
      toColor = this.to.options.color.border;
    }
    else if (this.from.selected == false && this.to.selected == true) {
      fromColor = this.from.options.color.border;
    }
    grd.addColorStop(0, fromColor);
    grd.addColorStop(1, toColor);
    return grd;
  }

  if (this.colorDirty === true) {
    if (this.options.inheritColor == "to") {
      colorObj = {
        highlight: this.to.options.color.highlight.border,
        hover: this.to.options.color.hover.border,
        color: util.overrideOpacity(this.from.options.color.border, this.options.opacity)
      };
    }
    else if (this.options.inheritColor == "from" || this.options.inheritColor == true) {
      colorObj = {
        highlight: this.from.options.color.highlight.border,
        hover: this.from.options.color.hover.border,
        color: util.overrideOpacity(this.from.options.color.border, this.options.opacity)
      };
    }
    this.options.color = colorObj;
    this.colorDirty = false;
  }



  if (this.selected == true)   {return colorObj.highlight;}
  else if (this.hover == true) {return colorObj.hover;}
  else                         {return colorObj.color;}
};


/**
 * Redraw a edge as a line
 * Draw this edge in the given canvas
 * The 2d context of a HTML canvas can be retrieved by canvas.getContext("2d");
 * @param {CanvasRenderingContext2D}   ctx
 * @private
 */
Edge.prototype._drawLine = function(ctx) {
  // set style
  ctx.strokeStyle = this._getColor(ctx);
  ctx.lineWidth   = this._getLineWidth();

  if (this.from != this.to) {
    // draw line
    var via = this._line(ctx);

    // draw label
    var point;
    if (this.label) {
      if (this.options.smoothCurves.enabled == true && via != null) {
        var midpointX = 0.5*(0.5*(this.from.x + via.x) + 0.5*(this.to.x + via.x));
        var midpointY = 0.5*(0.5*(this.from.y + via.y) + 0.5*(this.to.y + via.y));
        point = {x:midpointX, y:midpointY};
      }
      else {
        point = this._pointOnLine(0.5);
      }
      this._label(ctx, this.label, point.x, point.y);
    }
  }
  else {
    var x, y;
    var radius = this.physics.springLength / 4;
    var node = this.from;
    if (!node.width) {
      node.resize(ctx);
    }
    if (node.width > node.height) {
      x = node.x + node.width / 2;
      y = node.y - radius;
    }
    else {
      x = node.x + radius;
      y = node.y - node.height / 2;
    }
    this._circle(ctx, x, y, radius);
    point = this._pointOnCircle(x, y, radius, 0.5);
    this._label(ctx, this.label, point.x, point.y);
  }
};

/**
 * Get the line width of the edge. Depends on width and whether one of the
 * connected nodes is selected.
 * @return {Number} width
 * @private
 */
Edge.prototype._getLineWidth = function() {
  if (this.selected == true) {
    return  Math.max(Math.min(this.widthSelected, this.options.widthMax), 0.3*this.networkScaleInv);
  }
  else {
    if (this.hover == true) {
      return Math.max(Math.min(this.options.hoverWidth, this.options.widthMax), 0.3*this.networkScaleInv);
    }
    else {
      return Math.max(this.options.width, 0.3*this.networkScaleInv);
    }
  }
};

Edge.prototype._getViaCoordinates = function () {
  if (this.options.smoothCurves.dynamic == true && this.options.smoothCurves.enabled == true ) {
    return this.via;
  }
  else if (this.options.smoothCurves.enabled == false) {
    return {x:0,y:0};
  }
  else {
    var xVia = null;
    var yVia = null;
    var factor = this.options.smoothCurves.roundness;
    var type = this.options.smoothCurves.type;
    var dx = Math.abs(this.from.x - this.to.x);
    var dy = Math.abs(this.from.y - this.to.y);
    if (type == 'discrete' || type == 'diagonalCross') {
      if (Math.abs(this.from.x - this.to.x) < Math.abs(this.from.y - this.to.y)) {
        if (this.from.y > this.to.y) {
          if (this.from.x < this.to.x) {
            xVia = this.from.x + factor * dy;
            yVia = this.from.y - factor * dy;
          }
          else if (this.from.x > this.to.x) {
            xVia = this.from.x - factor * dy;
            yVia = this.from.y - factor * dy;
          }
        }
        else if (this.from.y < this.to.y) {
          if (this.from.x < this.to.x) {
            xVia = this.from.x + factor * dy;
            yVia = this.from.y + factor * dy;
          }
          else if (this.from.x > this.to.x) {
            xVia = this.from.x - factor * dy;
            yVia = this.from.y + factor * dy;
          }
        }
        if (type == "discrete") {
          xVia = dx < factor * dy ? this.from.x : xVia;
        }
      }
      else if (Math.abs(this.from.x - this.to.x) > Math.abs(this.from.y - this.to.y)) {
        if (this.from.y > this.to.y) {
          if (this.from.x < this.to.x) {
            xVia = this.from.x + factor * dx;
            yVia = this.from.y - factor * dx;
          }
          else if (this.from.x > this.to.x) {
            xVia = this.from.x - factor * dx;
            yVia = this.from.y - factor * dx;
          }
        }
        else if (this.from.y < this.to.y) {
          if (this.from.x < this.to.x) {
            xVia = this.from.x + factor * dx;
            yVia = this.from.y + factor * dx;
          }
          else if (this.from.x > this.to.x) {
            xVia = this.from.x - factor * dx;
            yVia = this.from.y + factor * dx;
          }
        }
        if (type == "discrete") {
          yVia = dy < factor * dx ? this.from.y : yVia;
        }
      }
    }
    else if (type == "straightCross") {
      if (Math.abs(this.from.x - this.to.x) < Math.abs(this.from.y - this.to.y)) {  // up - down
        xVia = this.from.x;
        if (this.from.y < this.to.y) {
          yVia = this.to.y - (1 - factor) * dy;
        }
        else {
          yVia = this.to.y + (1 - factor) * dy;
        }
      }
      else if (Math.abs(this.from.x - this.to.x) > Math.abs(this.from.y - this.to.y)) { // left - right
        if (this.from.x < this.to.x) {
          xVia = this.to.x - (1 - factor) * dx;
        }
        else {
          xVia = this.to.x + (1 - factor) * dx;
        }
        yVia = this.from.y;
      }
    }
    else if (type == 'horizontal') {
      if (this.from.x < this.to.x) {
        xVia = this.to.x - (1 - factor) * dx;
      }
      else {
        xVia = this.to.x + (1 - factor) * dx;
      }
      yVia = this.from.y;
    }
    else if (type == 'vertical') {
      xVia = this.from.x;
      if (this.from.y < this.to.y) {
        yVia = this.to.y - (1 - factor) * dy;
      }
      else {
        yVia = this.to.y + (1 - factor) * dy;
      }
    }
    else if (type == 'curvedCW') {
      var dx = this.to.x - this.from.x;
      var dy = this.from.y - this.to.y;
      var radius = Math.sqrt(dx*dx + dy*dy);
      var pi = Math.PI;

      var originalAngle = Math.atan2(dy,dx);
      var myAngle = (originalAngle + ((factor * 0.5) + 0.5) * pi) % (2 * pi);

      xVia = this.from.x + (factor*0.5 + 0.5)*radius*Math.sin(myAngle);
      yVia = this.from.y + (factor*0.5 + 0.5)*radius*Math.cos(myAngle);
    }
    else if (type == 'curvedCCW') {
      var dx = this.to.x - this.from.x;
      var dy = this.from.y - this.to.y;
      var radius = Math.sqrt(dx*dx + dy*dy);
      var pi = Math.PI;

      var originalAngle = Math.atan2(dy,dx);
      var myAngle = (originalAngle + ((-factor * 0.5) + 0.5) * pi) % (2 * pi);

      xVia = this.from.x + (factor*0.5 + 0.5)*radius*Math.sin(myAngle);
      yVia = this.from.y + (factor*0.5 + 0.5)*radius*Math.cos(myAngle);
    }
    else { // continuous
      if (Math.abs(this.from.x - this.to.x) < Math.abs(this.from.y - this.to.y)) {
        if (this.from.y > this.to.y) {
          if (this.from.x < this.to.x) {
            xVia = this.from.x + factor * dy;
            yVia = this.from.y - factor * dy;
            xVia = this.to.x < xVia ? this.to.x : xVia;
          }
          else if (this.from.x > this.to.x) {
            xVia = this.from.x - factor * dy;
            yVia = this.from.y - factor * dy;
            xVia = this.to.x > xVia ? this.to.x : xVia;
          }
        }
        else if (this.from.y < this.to.y) {
          if (this.from.x < this.to.x) {
            xVia = this.from.x + factor * dy;
            yVia = this.from.y + factor * dy;
            xVia = this.to.x < xVia ? this.to.x : xVia;
          }
          else if (this.from.x > this.to.x) {
            xVia = this.from.x - factor * dy;
            yVia = this.from.y + factor * dy;
            xVia = this.to.x > xVia ? this.to.x : xVia;
          }
        }
      }
      else if (Math.abs(this.from.x - this.to.x) > Math.abs(this.from.y - this.to.y)) {
        if (this.from.y > this.to.y) {
          if (this.from.x < this.to.x) {
            xVia = this.from.x + factor * dx;
            yVia = this.from.y - factor * dx;
            yVia = this.to.y > yVia ? this.to.y : yVia;
          }
          else if (this.from.x > this.to.x) {
            xVia = this.from.x - factor * dx;
            yVia = this.from.y - factor * dx;
            yVia = this.to.y > yVia ? this.to.y : yVia;
          }
        }
        else if (this.from.y < this.to.y) {
          if (this.from.x < this.to.x) {
            xVia = this.from.x + factor * dx;
            yVia = this.from.y + factor * dx;
            yVia = this.to.y < yVia ? this.to.y : yVia;
          }
          else if (this.from.x > this.to.x) {
            xVia = this.from.x - factor * dx;
            yVia = this.from.y + factor * dx;
            yVia = this.to.y < yVia ? this.to.y : yVia;
          }
        }
      }
    }


    return {x: xVia, y: yVia};
  }
};

/**
 * Draw a line between two nodes
 * @param {CanvasRenderingContext2D} ctx
 * @private
 */
Edge.prototype._line = function (ctx) {
  // draw a straight line
  ctx.beginPath();
  ctx.moveTo(this.from.x, this.from.y);
  if (this.options.smoothCurves.enabled == true) {
    if (this.options.smoothCurves.dynamic == false) {
      var via = this._getViaCoordinates();
      if (via.x == null) {
        ctx.lineTo(this.to.x, this.to.y);
        ctx.stroke();
        return null;
      }
      else {
//        this.via.x = via.x;
//        this.via.y = via.y;
        ctx.quadraticCurveTo(via.x,via.y,this.to.x, this.to.y);
        ctx.stroke();
        //ctx.circle(via.x,via.y,2)
        //ctx.stroke();
        return via;
      }
    }
    else {
      ctx.quadraticCurveTo(this.via.x,this.via.y,this.to.x, this.to.y);
      ctx.stroke();
      return this.via;
    }
  }
  else {
    ctx.lineTo(this.to.x, this.to.y);
    ctx.stroke();
    return null;
  }
};

/**
 * Draw a line from a node to itself, a circle
 * @param {CanvasRenderingContext2D} ctx
 * @param {Number} x
 * @param {Number} y
 * @param {Number} radius
 * @private
 */
Edge.prototype._circle = function (ctx, x, y, radius) {
  // draw a circle
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
  ctx.stroke();
};

/**
 * Draw label with white background and with the middle at (x, y)
 * @param {CanvasRenderingContext2D} ctx
 * @param {String} text
 * @param {Number} x
 * @param {Number} y
 * @private
 */
Edge.prototype._label = function (ctx, text, x, y) {
  if (text) {
    ctx.font = ((this.from.selected || this.to.selected) ? "bold " : "") +
    this.options.fontSize + "px " + this.options.fontFace;
    var yLine;

    if (this.dirtyLabel == true) {
      var lines = String(text).split('\n');
      var lineCount = lines.length;
      var fontSize = Number(this.options.fontSize);
      yLine = y + (1 - lineCount) / 2 * fontSize;

      var width = ctx.measureText(lines[0]).width;
      for (var i = 1; i < lineCount; i++) {
        var lineWidth = ctx.measureText(lines[i]).width;
        width = lineWidth > width ? lineWidth : width;
      }
      var height = this.options.fontSize * lineCount;
      var left = x - width / 2;
      var top = y - height / 2;

      // cache
      this.labelDimensions = {top:top,left:left,width:width,height:height,yLine:yLine};
    }

	var yLine = this.labelDimensions.yLine;
	
	ctx.save();
	
	if (this.options.labelAlignment != "horizontal"){
		ctx.translate(x, yLine);
		this._rotateForLabelAlignment(ctx);
		x = 0;
		yLine = 0;
	}

	
	this._drawLabelRect(ctx);
	this._drawLabelText(ctx,x,yLine, lines, lineCount, fontSize);
	
	ctx.restore();
  }
};

/**
 * Rotates the canvas so the text is most readable
 * @param {CanvasRenderingContext2D} ctx
 * @private
 */
Edge.prototype._rotateForLabelAlignment = function(ctx) {
	var dy = this.from.y - this.to.y;
	var dx = this.from.x - this.to.x;
	var angleInDegrees = Math.atan2(dy, dx);

	// rotate so label it is readable
	if((angleInDegrees < -1 && dx < 0) || (angleInDegrees > 0 && dx < 0)){
		angleInDegrees = angleInDegrees + Math.PI;
	}
	
	ctx.rotate(angleInDegrees);
};

/**
 * Draws the label rectangle 
 * @param {CanvasRenderingContext2D} ctx
 * @param {String} labelAlignment
 * @private
 */
Edge.prototype._drawLabelRect = function(ctx) {
	if (this.options.fontFill !== undefined && this.options.fontFill !== null && this.options.fontFill !== "none") {
		ctx.fillStyle = this.options.fontFill;
		
		var lineMargin = 2;

    if (this.options.labelAlignment == 'line-center') {
      ctx.fillRect(-this.labelDimensions.width * 0.5, -this.labelDimensions.height * 0.5, this.labelDimensions.width, this.labelDimensions.height);
    }
    else if (this.options.labelAlignment == 'line-above') {
      ctx.fillRect(-this.labelDimensions.width * 0.5, -(this.labelDimensions.height + lineMargin), this.labelDimensions.width, this.labelDimensions.height);
    }
    else if (this.options.labelAlignment == 'line-below') {
      ctx.fillRect(-this.labelDimensions.width * 0.5, lineMargin, this.labelDimensions.width, this.labelDimensions.height);
    }
    else {
      ctx.fillRect(this.labelDimensions.left, this.labelDimensions.top, this.labelDimensions.width, this.labelDimensions.height);
    }
  }
};

/**
 * Draws the label text 
 * @param {CanvasRenderingContext2D} ctx
 * @param {Number} x
 * @param {Number} yLine
 * @param {Array} lines
 * @param {Number} lineCount
 * @param {Number} fontSize
 * @private
 */
Edge.prototype._drawLabelText = function(ctx, x, yLine, lines, lineCount, fontSize) {
	// draw text
	ctx.fillStyle = this.options.fontColor || "black";
	ctx.textAlign = "center";

  // check for label alignment
  if (this.options.labelAlignment != 'horizontal') {
    var lineMargin = 2;
    if (this.options.labelAlignment == 'line-above') {
      ctx.textBaseline = "alphabetic";
      yLine -= 2 * lineMargin; // distance from edge, required because we use alphabetic. Alphabetic has less difference between browsers
    }
    else if (this.options.labelAlignment == 'line-below') {
      ctx.textBaseline = "hanging";
      yLine += 2 * lineMargin;// distance from edge, required because we use hanging. Hanging has less difference between browsers
    }
    else {
      ctx.textBaseline = "middle";
    }
  }
  else {
    ctx.textBaseline = "middle";
  }

  // check for strokeWidth
  if (this.options.fontStrokeWidth > 0){
    ctx.lineWidth   = this.options.fontStrokeWidth;
    ctx.strokeStyle = this.options.fontStrokeColor;
    ctx.lineJoin    = 'round';
  }
	for (var i = 0; i < lineCount; i++) {
    if(this.options.fontStrokeWidth > 0){
      ctx.strokeText(lines[i], x, yLine);
    }
		ctx.fillText(lines[i], x, yLine);
		yLine += fontSize;
	}
};

/**
 * Redraw a edge as a dashed line
 * Draw this edge in the given canvas
 * @author David Jordan
 * @date 2012-08-08
 * The 2d context of a HTML canvas can be retrieved by canvas.getContext("2d");
 * @param {CanvasRenderingContext2D}   ctx
 * @private
 */
Edge.prototype._drawDashLine = function(ctx) {
  // set style
  ctx.strokeStyle = this._getColor(ctx);
  ctx.lineWidth = this._getLineWidth();

  var via = null;
  // only firefox and chrome support this method, else we use the legacy one.
  if (ctx.setLineDash !== undefined) {
    ctx.save();
    // configure the dash pattern
    var pattern = [0];
    if (this.options.dash.length !== undefined && this.options.dash.gap !== undefined) {
      pattern = [this.options.dash.length,this.options.dash.gap];
    }
    else {
      pattern = [5,5];
    }

    // set dash settings for chrome or firefox
    ctx.setLineDash(pattern);
    ctx.lineDashOffset = 0;

    // draw the line
    via = this._line(ctx);

    // restore the dash settings.
    ctx.setLineDash([0]);
    ctx.lineDashOffset = 0;
    ctx.restore();
  }
  else { // unsupporting smooth lines
    // draw dashed line
    ctx.beginPath();
    ctx.lineCap = 'round';
    if (this.options.dash.altLength !== undefined) //If an alt dash value has been set add to the array this value
    {
      ctx.dashedLine(this.from.x,this.from.y,this.to.x,this.to.y,
          [this.options.dash.length,this.options.dash.gap,this.options.dash.altLength,this.options.dash.gap]);
    }
    else if (this.options.dash.length !== undefined && this.options.dash.gap !== undefined) //If a dash and gap value has been set add to the array this value
    {
      ctx.dashedLine(this.from.x,this.from.y,this.to.x,this.to.y,
          [this.options.dash.length,this.options.dash.gap]);
    }
    else //If all else fails draw a line
    {
      ctx.moveTo(this.from.x, this.from.y);
      ctx.lineTo(this.to.x, this.to.y);
    }
    ctx.stroke();
  }

  // draw label
  if (this.label) {
    var point;
    if (this.options.smoothCurves.enabled == true && via != null) {
      var midpointX = 0.5*(0.5*(this.from.x + via.x) + 0.5*(this.to.x + via.x));
      var midpointY = 0.5*(0.5*(this.from.y + via.y) + 0.5*(this.to.y + via.y));
      point = {x:midpointX, y:midpointY};
    }
    else {
      point = this._pointOnLine(0.5);
    }
    this._label(ctx, this.label, point.x, point.y);
  }
};

/**
 * Get a point on a line
 * @param {Number} percentage. Value between 0 (line start) and 1 (line end)
 * @return {Object} point
 * @private
 */
Edge.prototype._pointOnLine = function (percentage) {
  return {
    x: (1 - percentage) * this.from.x + percentage * this.to.x,
    y: (1 - percentage) * this.from.y + percentage * this.to.y
  }
};

/**
 * Get a point on a circle
 * @param {Number} x
 * @param {Number} y
 * @param {Number} radius
 * @param {Number} percentage. Value between 0 (line start) and 1 (line end)
 * @return {Object} point
 * @private
 */
Edge.prototype._pointOnCircle = function (x, y, radius, percentage) {
  var angle = (percentage - 3/8) * 2 * Math.PI;
  return {
    x: x + radius * Math.cos(angle),
    y: y - radius * Math.sin(angle)
  }
};

/**
 * Redraw a edge as a line with an arrow halfway the line
 * Draw this edge in the given canvas
 * The 2d context of a HTML canvas can be retrieved by canvas.getContext("2d");
 * @param {CanvasRenderingContext2D}   ctx
 * @private
 */
Edge.prototype._drawArrowCenter = function(ctx) {
  var point;
  // set style
  ctx.strokeStyle = this._getColor(ctx);
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = this._getLineWidth();

  if (this.from != this.to) {
    // draw line
    var via = this._line(ctx);

    var angle = Math.atan2((this.to.y - this.from.y), (this.to.x - this.from.x));
    var length = (10 + 5 * this.options.width) * this.options.arrowScaleFactor;
    // draw an arrow halfway the line
    if (this.options.smoothCurves.enabled == true && via != null) {
      var midpointX = 0.5*(0.5*(this.from.x + via.x) + 0.5*(this.to.x + via.x));
      var midpointY = 0.5*(0.5*(this.from.y + via.y) + 0.5*(this.to.y + via.y));
      point = {x:midpointX, y:midpointY};
    }
    else {
      point = this._pointOnLine(0.5);
    }

    ctx.arrow(point.x, point.y, angle, length);
    ctx.fill();
    ctx.stroke();

    // draw label
    if (this.label) {
      this._label(ctx, this.label, point.x, point.y);
    }
  }
  else {
    // draw circle
    var x, y;
    var radius = 0.25 * Math.max(100,this.physics.springLength);
    var node = this.from;
    if (!node.width) {
      node.resize(ctx);
    }
    if (node.width > node.height) {
      x = node.x + node.width * 0.5;
      y = node.y - radius;
    }
    else {
      x = node.x + radius;
      y = node.y - node.height * 0.5;
    }
    this._circle(ctx, x, y, radius);

    // draw all arrows
    var angle = 0.2 * Math.PI;
    var length = (10 + 5 * this.options.width) * this.options.arrowScaleFactor;
    point = this._pointOnCircle(x, y, radius, 0.5);
    ctx.arrow(point.x, point.y, angle, length);
    ctx.fill();
    ctx.stroke();

    // draw label
    if (this.label) {
      point = this._pointOnCircle(x, y, radius, 0.5);
      this._label(ctx, this.label, point.x, point.y);
    }
  }
};

Edge.prototype._pointOnBezier = function(t) {
  var via = this._getViaCoordinates();

  var x = Math.pow(1-t,2)*this.from.x + (2*t*(1 - t))*via.x + Math.pow(t,2)*this.to.x;
  var y = Math.pow(1-t,2)*this.from.y + (2*t*(1 - t))*via.y + Math.pow(t,2)*this.to.y;

  return {x:x,y:y};
}

/**
 * This function uses binary search to look for the point where the bezier curve crosses the border of the node.
 *
 * @param from
 * @param ctx
 * @returns {*}
 * @private
 */
Edge.prototype._findBorderPosition = function(from,ctx) {
  var maxIterations = 10;
  var iteration = 0;
  var low = 0;
  var high = 1;
  var pos,angle,distanceToBorder, distanceToNodes, difference;
  var threshold = 0.2;
  var node = this.to;
  if (from == true) {
    node = this.from;
  }

  while (low <= high && iteration < maxIterations) {
    var middle = (low + high) * 0.5;

    pos = this._pointOnBezier(middle);
    angle = Math.atan2((node.y - pos.y), (node.x - pos.x));
    distanceToBorder = node.distanceToBorder(ctx,angle);
    distanceToNodes = Math.sqrt(Math.pow(pos.x-node.x,2) + Math.pow(pos.y-node.y,2));
    difference = distanceToBorder - distanceToNodes;
    if (Math.abs(difference) < threshold) {
      break; // found
    }
    else if (difference < 0) { // distance to nodes is larger than distance to border --> t needs to be bigger if we're looking at the to node.
      if (from == false) {
        low = middle;
      }
      else {
        high = middle;
      }
    }
    else {
      if (from == false) {
        high = middle;
      }
      else {
        low = middle;
      }
    }

    iteration++;
  }
  pos.t = middle;

  return pos;
};

/**
 * Redraw a edge as a line with an arrow
 * Draw this edge in the given canvas
 * The 2d context of a HTML canvas can be retrieved by canvas.getContext("2d");
 * @param {CanvasRenderingContext2D}   ctx
 * @private
 */
Edge.prototype._drawArrow = function(ctx) {
  // set style
  ctx.strokeStyle = this._getColor(ctx);
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = this._getLineWidth();

  // set vars
  var angle, length, arrowPos;

  // if not connected to itself
  if (this.from != this.to) {
    // draw line
    this._line(ctx);

    // draw arrow head
    if (this.options.smoothCurves.enabled == true) {
      var via = this._getViaCoordinates();
      arrowPos = this._findBorderPosition(false, ctx);
      var guidePos = this._pointOnBezier(Math.max(0.0, arrowPos.t - 0.1))
      angle = Math.atan2((arrowPos.y - guidePos.y), (arrowPos.x - guidePos.x));
    }
    else {
      angle = Math.atan2((this.to.y - this.from.y), (this.to.x - this.from.x));
      var dx = (this.to.x - this.from.x);
      var dy = (this.to.y - this.from.y);
      var edgeSegmentLength = Math.sqrt(dx * dx + dy * dy);
      var toBorderDist = this.to.distanceToBorder(ctx, angle);
      var toBorderPoint = (edgeSegmentLength - toBorderDist) / edgeSegmentLength;

      arrowPos = {};
      arrowPos.x = (1 - toBorderPoint) * this.from.x + toBorderPoint * this.to.x;
      arrowPos.y = (1 - toBorderPoint) * this.from.y + toBorderPoint * this.to.y;
    }

    // draw arrow at the end of the line
    length = (10 + 5 * this.options.width) * this.options.arrowScaleFactor;
    ctx.arrow(arrowPos.x,arrowPos.y, angle, length);
    ctx.fill();
    ctx.stroke();

    // draw label
    if (this.label) {
      var point;
      if (this.options.smoothCurves.enabled == true && via != null) {
        point = this._pointOnBezier(0.5);
      }
      else {
        point = this._pointOnLine(0.5);
      }
      this._label(ctx, this.label, point.x, point.y);
    }
  }
  else {
    // draw circle
    var node = this.from;
    var x, y, arrow;
    var radius = 0.25 * Math.max(100,this.physics.springLength);
    if (!node.width) {
      node.resize(ctx);
    }
    if (node.width > node.height) {
      x = node.x + node.width * 0.5;
      y = node.y - radius;
      arrow = {
        x: x,
        y: node.y,
        angle: 0.9 * Math.PI
      };
    }
    else {
      x = node.x + radius;
      y = node.y - node.height * 0.5;
      arrow = {
        x: node.x,
        y: y,
        angle: 0.6 * Math.PI
      };
    }
    ctx.beginPath();
    // TODO: similarly, for a line without arrows, draw to the border of the nodes instead of the center
    ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
    ctx.stroke();

    // draw all arrows
    var length = (10 + 5 * this.options.width) * this.options.arrowScaleFactor;
    ctx.arrow(arrow.x, arrow.y, arrow.angle, length);
    ctx.fill();
    ctx.stroke();

    // draw label
    if (this.label) {
      point = this._pointOnCircle(x, y, radius, 0.5);
      this._label(ctx, this.label, point.x, point.y);
    }
  }
};

/**
 * Calculate the distance between a point (x3,y3) and a line segment from
 * (x1,y1) to (x2,y2).
 * http://stackoverflow.com/questions/849211/shortest-distancae-between-a-point-and-a-line-segment
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @param {number} x3
 * @param {number} y3
 * @private
 */
Edge.prototype._getDistanceToEdge = function (x1,y1, x2,y2, x3,y3) { // x3,y3 is the point
  var returnValue = 0;
  if (this.from != this.to) {
    if (this.options.smoothCurves.enabled == true) {
      var xVia, yVia;
      if (this.options.smoothCurves.enabled == true && this.options.smoothCurves.dynamic == true) {
        xVia = this.via.x;
        yVia = this.via.y;
      }
      else {
        var via = this._getViaCoordinates();
        xVia = via.x;
        yVia = via.y;
      }
      var minDistance = 1e9;
      var distance;
      var i,t,x,y, lastX, lastY;
      for (i = 0; i < 10; i++) {
        t = 0.1*i;
        x = Math.pow(1-t,2)*x1 + (2*t*(1 - t))*xVia + Math.pow(t,2)*x2;
        y = Math.pow(1-t,2)*y1 + (2*t*(1 - t))*yVia + Math.pow(t,2)*y2;
        if (i > 0) {
          distance = this._getDistanceToLine(lastX,lastY,x,y, x3,y3);
          minDistance = distance < minDistance ? distance : minDistance;
        }
        lastX = x; lastY = y;
      }
      returnValue = minDistance;
    }
    else {
      returnValue = this._getDistanceToLine(x1,y1,x2,y2,x3,y3);
    }
  }
  else {
    var x, y, dx, dy;
    var radius = 0.25 * this.physics.springLength;
    var node = this.from;
    if (node.width > node.height) {
      x = node.x + 0.5 * node.width;
      y = node.y - radius;
    }
    else {
      x = node.x + radius;
      y = node.y - 0.5 * node.height;
    }
    dx = x - x3;
    dy = y - y3;
    returnValue = Math.abs(Math.sqrt(dx*dx + dy*dy) - radius);
  }

  if (this.labelDimensions.left < x3 &&
    this.labelDimensions.left + this.labelDimensions.width > x3 &&
    this.labelDimensions.top < y3 &&
    this.labelDimensions.top + this.labelDimensions.height > y3) {
    return 0;
  }
  else {
    return returnValue;
  }
};

Edge.prototype._getDistanceToLine = function(x1,y1,x2,y2,x3,y3) {
  var px = x2-x1,
    py = y2-y1,
    something = px*px + py*py,
    u =  ((x3 - x1) * px + (y3 - y1) * py) / something;

  if (u > 1) {
    u = 1;
  }
  else if (u < 0) {
    u = 0;
  }

  var x = x1 + u * px,
    y = y1 + u * py,
    dx = x - x3,
    dy = y - y3;

  //# Note: If the actual distance does not matter,
  //# if you only want to compare what this function
  //# returns to other results of this function, you
  //# can just return the squared distance instead
  //# (i.e. remove the sqrt) to gain a little performance

  return Math.sqrt(dx*dx + dy*dy);
};

/**
 * This allows the zoom level of the network to influence the rendering
 *
 * @param scale
 */
Edge.prototype.setScale = function(scale) {
  this.networkScaleInv = 1.0/scale;
};


Edge.prototype.select = function() {
  this.selected = true;
};

Edge.prototype.unselect = function() {
  this.selected = false;
};

Edge.prototype.positionBezierNode = function() {
  if (this.via !== null && this.from !== null && this.to !== null) {
    this.via.x = 0.5 * (this.from.x + this.to.x);
    this.via.y = 0.5 * (this.from.y + this.to.y);
  }
  else if (this.via !== null) {
    this.via.x = 0;
    this.via.y = 0;
  }
};

/**
 * This function draws the control nodes for the manipulator.
 * In order to enable this, only set the this.controlNodesEnabled to true.
 * @param ctx
 */
Edge.prototype._drawControlNodes = function(ctx) {
  if (this.controlNodesEnabled == true) {
    if (this.controlNodes.from === null && this.controlNodes.to === null) {
      var nodeIdFrom = "edgeIdFrom:".concat(this.id);
      var nodeIdTo = "edgeIdTo:".concat(this.id);
      var constants = {
                      nodes:{group:'', radius:7, borderWidth:2, borderWidthSelected: 2},
                      physics:{damping:0},
                      clustering: {maxNodeSizeIncrements: 0 ,nodeScaling: {width:0, height: 0, radius:0}}
                      };
      this.controlNodes.from = new Node(
        {id:nodeIdFrom,
          shape:'dot',
            color:{background:'#ff0000', border:'#3c3c3c', highlight: {background:'#07f968'}}
        },{},{},constants);
      this.controlNodes.to = new Node(
        {id:nodeIdTo,
          shape:'dot',
          color:{background:'#ff0000', border:'#3c3c3c', highlight: {background:'#07f968'}}
        },{},{},constants);
    }

    this.controlNodes.positions = {};
    if (this.controlNodes.from.selected == false) {
      this.controlNodes.positions.from = this.getControlNodeFromPosition(ctx);
      this.controlNodes.from.x = this.controlNodes.positions.from.x;
      this.controlNodes.from.y = this.controlNodes.positions.from.y;
    }
    if (this.controlNodes.to.selected == false) {
      this.controlNodes.positions.to = this.getControlNodeToPosition(ctx);
      this.controlNodes.to.x = this.controlNodes.positions.to.x;
      this.controlNodes.to.y = this.controlNodes.positions.to.y;
    }

    this.controlNodes.from.draw(ctx);
    this.controlNodes.to.draw(ctx);
  }
  else {
    this.controlNodes = {from:null, to:null, positions:{}};
  }
};

/**
 * Enable control nodes.
 * @private
 */
Edge.prototype._enableControlNodes = function() {
  this.fromBackup = this.from;
  this.toBackup = this.to;
  this.controlNodesEnabled = true;
};

/**
 * disable control nodes and remove from dynamicEdges from old node
 * @private
 */
Edge.prototype._disableControlNodes = function() {
  this.fromId = this.from.id;
  this.toId = this.to.id;
  if (this.fromId != this.fromBackup.id) { // from was changed, remove edge from old 'from' node dynamic edges
    this.fromBackup.detachEdge(this);
  }
  else if (this.toId != this.toBackup.id) { // to was changed, remove edge from old 'to' node dynamic edges
    this.toBackup.detachEdge(this);
  }

  this.fromBackup = null;
  this.toBackup = null;
  this.controlNodesEnabled = false;
};


/**
 * This checks if one of the control nodes is selected and if so, returns the control node object. Else it returns null.
 * @param x
 * @param y
 * @returns {null}
 * @private
 */
Edge.prototype._getSelectedControlNode = function(x,y) {
  var positions = this.controlNodes.positions;
  var fromDistance = Math.sqrt(Math.pow(x - positions.from.x,2) + Math.pow(y - positions.from.y,2));
  var toDistance =   Math.sqrt(Math.pow(x - positions.to.x  ,2) + Math.pow(y - positions.to.y  ,2));

  if (fromDistance < 15) {
    this.connectedNode = this.from;
    this.from = this.controlNodes.from;
    return this.controlNodes.from;
  }
  else if (toDistance < 15) {
    this.connectedNode = this.to;
    this.to = this.controlNodes.to;
    return this.controlNodes.to;
  }
  else {
    return null;
  }
};


/**
 * this resets the control nodes to their original position.
 * @private
 */
Edge.prototype._restoreControlNodes = function() {
  if (this.controlNodes.from.selected == true) {
    this.from = this.connectedNode;
    this.connectedNode = null;
    this.controlNodes.from.unselect();
  }
  else if (this.controlNodes.to.selected == true) {
    this.to = this.connectedNode;
    this.connectedNode = null;
    this.controlNodes.to.unselect();
  }
};

/**
 * this calculates the position of the control nodes on the edges of the parent nodes.
 *
 * @param ctx
 * @returns {x: *, y: *}
 */
Edge.prototype.getControlNodeFromPosition = function(ctx) {
  // draw arrow head
  var controlnodeFromPos;
  if (this.options.smoothCurves.enabled == true) {
    controlnodeFromPos = this._findBorderPosition(true, ctx);
  }
  else {
    var angle = Math.atan2((this.to.y - this.from.y), (this.to.x - this.from.x));
    var dx = (this.to.x - this.from.x);
    var dy = (this.to.y - this.from.y);
    var edgeSegmentLength = Math.sqrt(dx * dx + dy * dy);

    var fromBorderDist = this.from.distanceToBorder(ctx, angle + Math.PI);
    var fromBorderPoint = (edgeSegmentLength - fromBorderDist) / edgeSegmentLength;
    controlnodeFromPos = {};
    controlnodeFromPos.x = (fromBorderPoint) * this.from.x + (1 - fromBorderPoint) * this.to.x;
    controlnodeFromPos.y = (fromBorderPoint) * this.from.y + (1 - fromBorderPoint) * this.to.y;
  }

  return controlnodeFromPos;
};

/**
 * this calculates the position of the control nodes on the edges of the parent nodes.
 *
 * @param ctx
 * @returns {{from: {x: number, y: number}, to: {x: *, y: *}}}
 */
Edge.prototype.getControlNodeToPosition = function(ctx) {
  // draw arrow head
  var controlnodeFromPos,controlnodeToPos;
  if (this.options.smoothCurves.enabled == true) {
    controlnodeToPos = this._findBorderPosition(false, ctx);
  }
  else {
    var angle = Math.atan2((this.to.y - this.from.y), (this.to.x - this.from.x));
    var dx = (this.to.x - this.from.x);
    var dy = (this.to.y - this.from.y);
    var edgeSegmentLength = Math.sqrt(dx * dx + dy * dy);
    var toBorderDist = this.to.distanceToBorder(ctx, angle);
    var toBorderPoint = (edgeSegmentLength - toBorderDist) / edgeSegmentLength;

    controlnodeToPos = {};
    controlnodeToPos.x = (1 - toBorderPoint) * this.from.x + toBorderPoint * this.to.x;
    controlnodeToPos.y = (1 - toBorderPoint) * this.from.y + toBorderPoint * this.to.y;
  }

  return controlnodeToPos;
};

module.exports = Edge;
},{"../util":30,"./Node":12}],9:[function(require,module,exports){
var util = require('../util');

/**
 * @class Groups
 * This class can store groups and properties specific for groups.
 */
function Groups() {
  this.clear();
  this.defaultIndex = 0;
  this.groupsArray = [];
  this.groupIndex = 0;
  this.useDefaultGroups = true;
}


/**
 * default constants for group colors
 */
Groups.DEFAULT = [
  {border: "#2B7CE9", background: "#97C2FC", highlight: {border: "#2B7CE9", background: "#D2E5FF"}, hover: {border: "#2B7CE9", background: "#D2E5FF"}}, // 0: blue
  {border: "#FFA500", background: "#FFFF00", highlight: {border: "#FFA500", background: "#FFFFA3"}, hover: {border: "#FFA500", background: "#FFFFA3"}}, // 1: yellow
  {border: "#FA0A10", background: "#FB7E81", highlight: {border: "#FA0A10", background: "#FFAFB1"}, hover: {border: "#FA0A10", background: "#FFAFB1"}}, // 2: red
  {border: "#41A906", background: "#7BE141", highlight: {border: "#41A906", background: "#A1EC76"}, hover: {border: "#41A906", background: "#A1EC76"}}, // 3: green
  {border: "#E129F0", background: "#EB7DF4", highlight: {border: "#E129F0", background: "#F0B3F5"}, hover: {border: "#E129F0", background: "#F0B3F5"}}, // 4: magenta
  {border: "#7C29F0", background: "#AD85E4", highlight: {border: "#7C29F0", background: "#D3BDF0"}, hover: {border: "#7C29F0", background: "#D3BDF0"}}, // 5: purple
  {border: "#C37F00", background: "#FFA807", highlight: {border: "#C37F00", background: "#FFCA66"}, hover: {border: "#C37F00", background: "#FFCA66"}}, // 6: orange
  {border: "#4220FB", background: "#6E6EFD", highlight: {border: "#4220FB", background: "#9B9BFD"}, hover: {border: "#4220FB", background: "#9B9BFD"}}, // 7: darkblue
  {border: "#FD5A77", background: "#FFC0CB", highlight: {border: "#FD5A77", background: "#FFD1D9"}, hover: {border: "#FD5A77", background: "#FFD1D9"}}, // 8: pink
  {border: "#4AD63A", background: "#C2FABC", highlight: {border: "#4AD63A", background: "#E6FFE3"}, hover: {border: "#4AD63A", background: "#E6FFE3"}}, // 9: mint

  {border: "#990000", background: "#EE0000", highlight: {border: "#BB0000", background: "#FF3333"}, hover: {border: "#BB0000", background: "#FF3333"}}, // 10:bright red

  {border: "#FF6000", background: "#FF6000", highlight: {border: "#FF6000", background: "#FF6000"}, hover: {border: "#FF6000", background: "#FF6000"}}, // 12: real orange
  {border: "#97C2FC", background: "#2B7CE9", highlight: {border: "#D2E5FF", background: "#2B7CE9"}, hover: {border: "#D2E5FF", background: "#2B7CE9"}}, // 13: blue
  {border: "#399605", background: "#255C03", highlight: {border: "#399605", background: "#255C03"}, hover: {border: "#399605", background: "#255C03"}}, // 14: green
  {border: "#B70054", background: "#FF007E", highlight: {border: "#B70054", background: "#FF007E"}, hover: {border: "#B70054", background: "#FF007E"}}, // 15: magenta
  {border: "#AD85E4", background: "#7C29F0", highlight: {border: "#D3BDF0", background: "#7C29F0"}, hover: {border: "#D3BDF0", background: "#7C29F0"}}, // 16: purple
  {border: "#4557FA", background: "#000EA1", highlight: {border: "#6E6EFD", background: "#000EA1"}, hover: {border: "#6E6EFD", background: "#000EA1"}}, // 17: darkblue
  {border: "#FFC0CB", background: "#FD5A77", highlight: {border: "#FFD1D9", background: "#FD5A77"}, hover: {border: "#FFD1D9", background: "#FD5A77"}}, // 18: pink
  {border: "#C2FABC", background: "#74D66A", highlight: {border: "#E6FFE3", background: "#74D66A"}, hover: {border: "#E6FFE3", background: "#74D66A"}}, // 19: mint

  {border: "#EE0000", background: "#990000", highlight: {border: "#FF3333", background: "#BB0000"}, hover: {border: "#FF3333", background: "#BB0000"}}, // 20:bright red
];


/**
 * Clear all groups
 */
Groups.prototype.clear = function () {
  this.groups = {};
  this.groups.length = function()
  {
    var i = 0;
    for ( var p in this ) {
      if (this.hasOwnProperty(p)) {
        i++;
      }
    }
    return i;
  }
};


/**
 * get group properties of a groupname. If groupname is not found, a new group
 * is added.
 * @param {*} groupname        Can be a number, string, Date, etc.
 * @return {Object} group      The created group, containing all group properties
 */
Groups.prototype.get = function (groupname) {
  var group = this.groups[groupname];
  if (group == undefined) {
    if (this.useDefaultGroups === false && this.groupsArray.length > 0) {
      // create new group
      var index = this.groupIndex % this.groupsArray.length;
      this.groupIndex++;
      group = {};
      group.color = this.groups[this.groupsArray[index]];
      this.groups[groupname] = group;
    }
    else {
      // create new group
      var index = this.defaultIndex % Groups.DEFAULT.length;
      this.defaultIndex++;
      group = {};
      group.color = Groups.DEFAULT[index];
      this.groups[groupname] = group;
    }
  }

  return group;
};

/**
 * Add a custom group style
 * @param {String} groupName
 * @param {Object} style       An object containing borderColor,
 *                             backgroundColor, etc.
 * @return {Object} group      The created group object
 */
Groups.prototype.add = function (groupName, style) {
  this.groups[groupName] = style;
  this.groupsArray.push(groupName);
  return style;
};

module.exports = Groups;

},{"../util":30}],10:[function(require,module,exports){
/**
 * @class Images
 * This class loads images and keeps them stored.
 */
function Images() {
  this.images = {};
  this.imageBroken = {};
  this.callback = undefined;
}

/**
 * Set an onload callback function. This will be called each time an image
 * is loaded
 * @param {function} callback
 */
Images.prototype.setOnloadCallback = function(callback) {
  this.callback = callback;
};

/**
 *
 * @param {string} url          Url of the image
 * @param {string} url          Url of an image to use if the url image is not found
 * @return {Image} img          The image object
 */
Images.prototype.load = function(url, brokenUrl) {
  var img = this.images[url]; // make a pointer
  if (img === undefined) {
    // create the image
    var me = this;
    img = new Image();
    img.onload = function () {
      // IE11 fix -- thanks dponch!
      if (this.width == 0) {
        document.body.appendChild(this);
        this.width = this.offsetWidth;
        this.height = this.offsetHeight;
        document.body.removeChild(this);
      }

      if (me.callback) {
        me.images[url] = img;
        me.callback(this);
      }
    };

    img.onerror = function () {
      if (brokenUrl === undefined) {
        console.error("Could not load image:", url);
        delete this.src;
        if (me.callback) {
          me.callback(this);
        }
      }
      else {
        if (me.imageBroken[url] === true) {
          if (this.src == brokenUrl) {
            console.error("Could not load brokenImage:", brokenUrl);
            delete this.src;
            if (me.callback) {
              me.callback(this);
            }
          }
          else {
            console.error("Could not load image:", url);
            this.src = brokenUrl;
          }
        }
        else {
          console.error("Could not load image:", url);
          this.src = brokenUrl;
          me.imageBroken[url] = true;
        }
      }
    };

    img.src = url;
  }

  return img;
};

module.exports = Images;

},{}],11:[function(require,module,exports){
var Emitter = require('emitter-component');
var Hammer = require('../module/hammer');
var keycharm = require('keycharm');
var util = require('../util');
var hammerUtil = require('../hammerUtil');
var DataSet = require('../DataSet');
var DataView = require('../DataView');
var dotparser = require('./dotparser');
var gephiParser = require('./gephiParser');
var Groups = require('./Groups');
var Images = require('./Images');
var Node = require('./Node');
var Edge = require('./Edge');
var Popup = require('./Popup');
var MixinLoader = require('./mixins/MixinLoader');
var Activator = require('../shared/Activator');
var locales = require('./locales');

// Load custom shapes into CanvasRenderingContext2D
require('./shapes');

/**
 * @constructor Network
 * Create a network visualization, displaying nodes and edges.
 *
 * @param {Element} container   The DOM element in which the Network will
 *                                  be created. Normally a div element.
 * @param {Object} data         An object containing parameters
 *                              {Array} nodes
 *                              {Array} edges
 * @param {Object} options      Options
 */
function Network (container, data, options) {
  if (!(this instanceof Network)) {
    throw new SyntaxError('Constructor must be called with the new operator');
  }

  this._determineBrowserMethod();
  this._initializeMixinLoaders();

  // create variables and set default values
  this.containerElement = container;

  // render and calculation settings
  this.renderRefreshRate = 60;                         // hz (fps)
  this.renderTimestep = 1000 / this.renderRefreshRate; // ms -- saves calculation later on
  this.renderTime = 0;                                 // measured time it takes to render a frame
  this.physicsTime = 0;                                // measured time it takes to render a frame
  this.runDoubleSpeed = false;
  this.physicsDiscreteStepsize = 0.50;                 // discrete stepsize of the simulation

  this.initializing = true;

  this.triggerFunctions = {add:null,edit:null,editEdge:null,connect:null,del:null};

  var customScalingFunction = function (min,max,total,value) {
    if (max == min) {
      return 0.5;
    }
    else {
      var scale = 1 / (max - min);
      return Math.max(0,(value - min)*scale);
    }
  };
  // set constant values
  this.defaultOptions = {
    nodes: {
      customScalingFunction: customScalingFunction,
      mass: 1,
      radiusMin: 10,
      radiusMax: 30,
      radius: 10,
      shape: 'ellipse',
      image: undefined,
      widthMin: 16, // px
      widthMax: 64, // px
      fontColor: 'black',
      fontSize: 14, // px
      fontFace: 'verdana',
      fontFill: undefined,
      fontStrokeWidth: 0, // px
      fontStrokeColor: '#ffffff',
      fontDrawThreshold: 3,
      scaleFontWithValue: false,
      fontSizeMin: 14,
      fontSizeMax: 30,
      fontSizeMaxVisible: 30,
      level: -1,
      color: {
          border: '#2B7CE9',
          background: '#97C2FC',
        highlight: {
          border: '#2B7CE9',
          background: '#D2E5FF'
        },
        hover: {
          border: '#2B7CE9',
          background: '#D2E5FF'
        }
      },
      group: undefined,
      borderWidth: 1,
      borderWidthSelected: undefined
    },
    edges: {
      customScalingFunction: customScalingFunction,
      widthMin: 1, //
      widthMax: 15,//
      width: 1,
      widthSelectionMultiplier: 2,
      hoverWidth: 1.5,
      style: 'line',
      color: {
        color:'#848484',
        highlight:'#848484',
        hover: '#848484'
      },
      opacity:1.0,
      fontColor: '#343434',
      fontSize: 14, // px
      fontFace: 'arial',
      fontFill: 'white',
      fontStrokeWidth: 0, // px
      fontStrokeColor: 'white',
      labelAlignment:'horizontal',
      arrowScaleFactor: 1,
      dash: {
        length: 10,
        gap: 5,
        altLength: undefined
      },
      inheritColor: "from", // to, from, false, true (== from)
      useGradients: false // release in 4.0
    },
    configurePhysics:false,
    physics: {
      barnesHut: {
        enabled: true,
        thetaInverted: 1 / 0.5, // inverted to save time during calculation
        gravitationalConstant: -2000,
        centralGravity: 0.3,
        springLength: 95,
        springConstant: 0.04,
        damping: 0.09
      },
      repulsion: {
        centralGravity: 0.0,
        springLength: 200,
        springConstant: 0.05,
        nodeDistance: 100,
        damping: 0.09
      },
      hierarchicalRepulsion: {
        enabled: false,
        centralGravity: 0.0,
        springLength: 100,
        springConstant: 0.01,
        nodeDistance: 150,
        damping: 0.09
      },
      damping: null,
      centralGravity: null,
      springLength: null,
      springConstant: null
    },
    clustering: {                   // Per Node in Cluster = PNiC
      enabled: false,               // (Boolean)             | global on/off switch for clustering.
      initialMaxNodes: 100,         // (# nodes)             | if the initial amount of nodes is larger than this, we cluster until the total number is less than this threshold.
      clusterThreshold:500,         // (# nodes)             | during calculate forces, we check if the total number of nodes is larger than this. If it is, cluster until reduced to reduceToNodes
      reduceToNodes:300,            // (# nodes)             | during calculate forces, we check if the total number of nodes is larger than clusterThreshold. If it is, cluster until reduced to this
      chainThreshold: 0.4,          // (% of all drawn nodes)| maximum percentage of allowed chainnodes (long strings of connected nodes) within all nodes. (lower means less chains).
      clusterEdgeThreshold: 20,     // (px)                  | edge length threshold. if smaller, this node is clustered.
      sectorThreshold: 100,         // (# nodes in cluster)  | cluster size threshold. If larger, expanding in own sector.
      screenSizeThreshold: 0.2,     // (% of canvas)         | relative size threshold. If the width or height of a clusternode takes up this much of the screen, decluster node.
      fontSizeMultiplier: 4.0,      // (px PNiC)             | how much the cluster font size grows per node in cluster (in px).
      maxFontSize: 1000,
      forceAmplification: 0.1,      // (multiplier PNiC)     | factor of increase fo the repulsion force of a cluster (per node in cluster).
      distanceAmplification: 0.1,   // (multiplier PNiC)     | factor how much the repulsion distance of a cluster increases (per node in cluster).
      edgeGrowth: 20,               // (px PNiC)             | amount of clusterSize connected to the edge is multiplied with this and added to edgeLength.
      nodeScaling: {width:  1,      // (px PNiC)             | growth of the width  per node in cluster.
                    height: 1,      // (px PNiC)             | growth of the height per node in cluster.
                    radius: 1},     // (px PNiC)             | growth of the radius per node in cluster.
      maxNodeSizeIncrements: 600,   // (# increments)        | max growth of the width  per node in cluster.
      activeAreaBoxSize: 80,        // (px)                  | box area around the curser where clusters are popped open.
      clusterLevelDifference: 2,    // used for normalization of the cluster levels
      clusterByZoom: true           // enable clustering through zooming in and out
    },
    navigation: {
      enabled: false
    },
    keyboard: {
      enabled: false,
      speed: {x: 10, y: 10, zoom: 0.02},
      bindToWindow: true
    },
    dataManipulation: {
      enabled: false,
      initiallyVisible: false
    },
    hierarchicalLayout: {
      enabled:false,
      levelSeparation: 150,
      nodeSpacing: 100,
      direction: "UD",   // UD, DU, LR, RL
      layout: "hubsize" // hubsize, directed
    },
    freezeForStabilization: false,
    smoothCurves: {
      enabled: true,
      dynamic: true,
      type: "continuous",
      roundness: 0.5
    },
    maxVelocity:  50,
    minVelocity:  0.1,   // px/s
    stabilize: true,  // stabilize before displaying the network
    stabilizationIterations: 1000,  // maximum number of iteration to stabilize
    zoomExtentOnStabilize: true,
    locale: 'en',
    locales: locales,
    tooltip: {
      delay: 300,
      fontColor: 'black',
      fontSize: 14, // px
      fontFace: 'verdana',
      color: {
        border: '#666',
        background: '#FFFFC6'
      }
    },
    dragNetwork: true,
    dragNodes: true,
    zoomable: true,
    hover: false,
    hideEdgesOnDrag: false,
    hideNodesOnDrag: false,
    width : '100%',
    height : '100%',
    selectable: true,
    useDefaultGroups: true
  };
  this.constants = util.extend({}, this.defaultOptions);
  this.pixelRatio = 1;
  
  
  this.hoverObj = {nodes:{},edges:{}};
  this.controlNodesActive = false;
  this.navigationHammers = [];
  this.manipulationHammers = [];

  // animation properties
  this.animationSpeed = 1/this.renderRefreshRate;
  this.animationEasingFunction = "easeInOutQuint";
  this.animating = false;
  this.easingTime = 0;
  this.sourceScale = 0;
  this.targetScale = 0;
  this.sourceTranslation = 0;
  this.targetTranslation = 0;
  this.lockedOnNodeId = null;
  this.lockedOnNodeOffset = null;
  this.touchTime = 0;
  this.redrawRequested = false;

  // Node variables
  var network = this;
  this.groups = new Groups(); // object with groups
  this.images = new Images(); // object with images
  this.images.setOnloadCallback(function (status) {
    network._requestRedraw();
  });

  // keyboard navigation variables
  this.xIncrement = 0;
  this.yIncrement = 0;
  this.zoomIncrement = 0;

  // loading all the mixins:
  // load the force calculation functions, grouped under the physics system.
  this._loadPhysicsSystem();
  // create a frame and canvas
  this._create();
  // load the sector system.    (mandatory, fully integrated with Network)
  this._loadSectorSystem();
  // load the cluster system.   (mandatory, even when not using the cluster system, there are function calls to it)
  this._loadClusterSystem();
  // load the selection system. (mandatory, required by Network)
  this._loadSelectionSystem();
  // load the selection system. (mandatory, required by Network)
  this._loadHierarchySystem();


  // apply options
  this._setTranslation(this.frame.clientWidth / 2, this.frame.clientHeight / 2);
  this._setScale(1);
  this.setOptions(options);

  // other vars
  this.freezeSimulationEnabled = false;// freeze the simulation
  this.cachedFunctions = {};
  this.startedStabilization = false;
  this.stabilized = false;
  this.stabilizationIterations = null;
  this.draggingNodes = false;

  // containers for nodes and edges
  this.calculationNodes = {};
  this.calculationNodeIndices = [];
  this.nodeIndices = [];        // array with all the indices of the nodes. Used to speed up forces calculation
  this.nodes = {};              // object with Node objects
  this.edges = {};              // object with Edge objects

  // position and scale variables and objects
  this.canvasTopLeft     = {"x": 0,"y": 0};   // coordinates of the top left of the canvas.     they will be set during _redraw.
  this.canvasBottomRight = {"x": 0,"y": 0};   // coordinates of the bottom right of the canvas. they will be set during _redraw
  this.pointerPosition = {"x": 0,"y": 0};   // coordinates of the bottom right of the canvas. they will be set during _redraw
  this.areaCenter = {};               // object with x and y elements used for determining the center of the zoom action
  this.scale = 1;                     // defining the global scale variable in the constructor
  this.previousScale = this.scale;    // this is used to check if the zoom operation is zooming in or out

  // datasets or dataviews
  this.nodesData = null;      // A DataSet or DataView
  this.edgesData = null;      // A DataSet or DataView

  // create event listeners used to subscribe on the DataSets of the nodes and edges
  this.nodesListeners = {
    'add': function (event, params) {
      network._addNodes(params.items);
      network.start();
    },
    'update': function (event, params) {
      network._updateNodes(params.items, params.data);
      network.start();
    },
    'remove': function (event, params) {
      network._removeNodes(params.items);
      network.start();
    }
  };
  this.edgesListeners = {
    'add': function (event, params) {
      network._addEdges(params.items);
      network.start();
    },
    'update': function (event, params) {
      network._updateEdges(params.items);
      network.start();
    },
    'remove': function (event, params) {
      network._removeEdges(params.items);
      network.start();
    }
  };

  // properties for the animation
  this.moving = true;
  this.timer = undefined; // Scheduling function. Is definded in this.start();

  // load data (the disable start variable will be the same as the enabled clustering)
  this.setData(data,this.constants.clustering.enabled || this.constants.hierarchicalLayout.enabled);

  // hierarchical layout
  this.initializing = false;
  if (this.constants.hierarchicalLayout.enabled == true) {
    this._setupHierarchicalLayout();
  }
  else {
    // zoom so all data will fit on the screen, if clustering is enabled, we do not want start to be called here.
    if (this.constants.stabilize == false) {
      this.zoomExtent({duration:0}, true, this.constants.clustering.enabled);
    }
  }

  // if clustering is disabled, the simulation will have started in the setData function
  if (this.constants.clustering.enabled) {
    this.startWithClustering();
  }
}

// Extend Network with an Emitter mixin
Emitter(Network.prototype);

/**
 * Determine if the browser requires a setTimeout or a requestAnimationFrame. This was required because
 * some implementations (safari and IE9) did not support requestAnimationFrame
 * @private
 */
Network.prototype._determineBrowserMethod = function() {
  var browserType = navigator.userAgent.toLowerCase();
  this.requiresTimeout = false;
  if (browserType.indexOf('msie 9.0') != -1) { // IE 9
    this.requiresTimeout = true;
  }
  else if (browserType.indexOf('safari') != -1) {  // safari
    if (browserType.indexOf('chrome') <= -1) {
      this.requiresTimeout = true;
    }
  }
}


/**
 * Get the script path where the vis.js library is located
 *
 * @returns {string | null} path   Path or null when not found. Path does not
 *                                 end with a slash.
 * @private
 */
Network.prototype._getScriptPath = function() {
  var scripts = document.getElementsByTagName( 'script' );

  // find script named vis.js or vis.min.js
  for (var i = 0; i < scripts.length; i++) {
    var src = scripts[i].src;
    var match = src && /\/?vis(.min)?\.js$/.exec(src);
    if (match) {
      // return path without the script name
      return src.substring(0, src.length - match[0].length);
    }
  }

  return null;
};


/**
 * Find the center position of the network
 * @private
 */
Network.prototype._getRange = function(specificNodes) {
  var minY = 1e9, maxY = -1e9, minX = 1e9, maxX = -1e9, node;
  if (specificNodes.length > 0) {
    for (var i = 0; i < specificNodes.length; i++) {
      node = this.nodes[specificNodes[i]];
      if (minX > (node.boundingBox.left)) {
        minX = node.boundingBox.left;
      }
      if (maxX < (node.boundingBox.right)) {
        maxX = node.boundingBox.right;
      }
      if (minY > (node.boundingBox.bottom)) {
        minY = node.boundingBox.top;
      } // top is negative, bottom is positive
      if (maxY < (node.boundingBox.top)) {
        maxY = node.boundingBox.bottom;
      } // top is negative, bottom is positive
    }
  }
  else {
    for (var nodeId in this.nodes) {
      if (this.nodes.hasOwnProperty(nodeId)) {
        node = this.nodes[nodeId];
        if (minX > (node.boundingBox.left)) {
          minX = node.boundingBox.left;
        }
        if (maxX < (node.boundingBox.right)) {
          maxX = node.boundingBox.right;
        }
        if (minY > (node.boundingBox.bottom)) {
          minY = node.boundingBox.top;
        } // top is negative, bottom is positive
        if (maxY < (node.boundingBox.top)) {
          maxY = node.boundingBox.bottom;
        } // top is negative, bottom is positive
      }
    }
  }

  if (minX == 1e9 && maxX == -1e9 && minY == 1e9 && maxY == -1e9) {
    minY = 0, maxY = 0, minX = 0, maxX = 0;
  }
  return {minX: minX, maxX: maxX, minY: minY, maxY: maxY};
};


/**
 * @param {object} range = {minX: minX, maxX: maxX, minY: minY, maxY: maxY};
 * @returns {{x: number, y: number}}
 * @private
 */
Network.prototype._findCenter = function(range) {
  return {x: (0.5 * (range.maxX + range.minX)),
          y: (0.5 * (range.maxY + range.minY))};
};


/**
 * This function zooms out to fit all data on screen based on amount of nodes
 *
 * @param {Boolean} [initialZoom]  | zoom based on fitted formula or range, true = fitted, default = false;
 * @param {Boolean} [disableStart] | If true, start is not called.
 */
Network.prototype.zoomExtent = function(options, initialZoom, disableStart) {
  this._redraw(true);

  if (initialZoom      === undefined) {initialZoom = false;}
  if (disableStart     === undefined) {disableStart = false;}
  if (options === undefined) {options = {nodes:[]};}
  if (options.nodes === undefined) {
    options.nodes = [];
  }

  var range;
  var zoomLevel;

  if (initialZoom == true) {
    // check if more than half of the nodes have a predefined position. If so, we use the range, not the approximation.
    var positionDefined = 0;
    for (var nodeId in this.nodes) {
      if (this.nodes.hasOwnProperty(nodeId)) {
        var node = this.nodes[nodeId];
        if (node.predefinedPosition == true) {
          positionDefined += 1;
        }
      }
    }
    if (positionDefined > 0.5 * this.nodeIndices.length) {
      this.zoomExtent(options,false,disableStart);
      return;
    }

    range = this._getRange(options.nodes);

    var numberOfNodes = this.nodeIndices.length;
    if (this.constants.smoothCurves == true) {
      if (this.constants.clustering.enabled == true &&
        numberOfNodes >= this.constants.clustering.initialMaxNodes) {
        zoomLevel = 49.07548 / (numberOfNodes + 142.05338) + 9.1444e-04; // this is obtained from fitting a dataset from 5 points with scale levels that looked good.
      }
      else {
        zoomLevel = 12.662 / (numberOfNodes + 7.4147) + 0.0964822; // this is obtained from fitting a dataset from 5 points with scale levels that looked good.
      }
    }
    else {
      if (this.constants.clustering.enabled == true &&
          numberOfNodes >= this.constants.clustering.initialMaxNodes) {
        zoomLevel = 77.5271985 / (numberOfNodes + 187.266146) + 4.76710517e-05; // this is obtained from fitting a dataset from 5 points with scale levels that looked good.
      }
      else {
        zoomLevel = 30.5062972 / (numberOfNodes + 19.93597763) + 0.08413486; // this is obtained from fitting a dataset from 5 points with scale levels that looked good.
      }
    }

    // correct for larger canvasses.
    var factor = Math.min(this.frame.canvas.clientWidth / 600, this.frame.canvas.clientHeight / 600);
    zoomLevel *= factor;
  }
  else {
    range = this._getRange(options.nodes);
    var xDistance = Math.abs(range.maxX - range.minX) * 1.1;
    var yDistance = Math.abs(range.maxY - range.minY) * 1.1;

    var xZoomLevel = this.frame.canvas.clientWidth  / xDistance;
    var yZoomLevel = this.frame.canvas.clientHeight / yDistance;
    zoomLevel = (xZoomLevel <= yZoomLevel) ? xZoomLevel : yZoomLevel;
  }

  if (zoomLevel > 1.0) {
    zoomLevel = 1.0;
  }


  var center = this._findCenter(range);
  if (disableStart == false) {
    var options = {position: center, scale: zoomLevel, animation: options};
    this.moveTo(options);
    this.moving = true;
    this.start();
  }
  else {
    center.x *= zoomLevel;
    center.y *= zoomLevel;
    center.x -= 0.5 * this.frame.canvas.clientWidth;
    center.y -= 0.5 * this.frame.canvas.clientHeight;
    this._setScale(zoomLevel);
    this._setTranslation(-center.x,-center.y);
  }
};


/**
 * Update the this.nodeIndices with the most recent node index list
 * @private
 */
Network.prototype._updateNodeIndexList = function() {
  this._clearNodeIndexList();
  for (var idx in this.nodes) {
    if (this.nodes.hasOwnProperty(idx)) {
      this.nodeIndices.push(idx);
    }
  }
};


/**
 * Set nodes and edges, and optionally options as well.
 *
 * @param {Object} data              Object containing parameters:
 *                                   {Array | DataSet | DataView} [nodes] Array with nodes
 *                                   {Array | DataSet | DataView} [edges] Array with edges
 *                                   {String} [dot] String containing data in DOT format
 *                                   {String} [gephi] String containing data in gephi JSON format
 *                                   {Options} [options] Object with options
 * @param {Boolean} [disableStart]   | optional: disable the calling of the start function.
 */
Network.prototype.setData = function(data, disableStart) {
  if (disableStart === undefined) {
    disableStart = false;
  }

  // unselect all to ensure no selections from old data are carried over.
  this._unselectAll(true);

  // we set initializing to true to ensure that the hierarchical layout is not performed until both nodes and edges are added.
  this.initializing = true;

  if (data && data.dot && (data.nodes || data.edges)) {
    throw new SyntaxError('Data must contain either parameter "dot" or ' +
        ' parameter pair "nodes" and "edges", but not both.');
  }

  // clean up in case there is anyone in an active mode of the manipulation. This is the same option as bound to the escape button.
  if (this.constants.dataManipulation.enabled == true) {
    this._createManipulatorBar();
  }

  // set options
  this.setOptions(data && data.options);
  // set all data
  if (data && data.dot) {
    // parse DOT file
    if(data && data.dot) {
      var dotData = dotparser.DOTToGraph(data.dot);
      this.setData(dotData);
      return;
    }
  }
  else if (data && data.gephi) {
    // parse DOT file
    if(data && data.gephi) {
      var gephiData = gephiParser.parseGephi(data.gephi);
      this.setData(gephiData);
      return;
    }
  }
  else {
    this._setNodes(data && data.nodes);
    this._setEdges(data && data.edges);
  }
  this._putDataInSector();
  if (disableStart == false) {
    if (this.constants.hierarchicalLayout.enabled == true) {
      this._resetLevels();
      this._setupHierarchicalLayout();
    }
    else {
      // find a stable position or start animating to a stable position
      if (this.constants.stabilize == true) {
        this._stabilize();
      }
    }
    this.start();
  }
  this.initializing = false;
};

/**
 * Set options
 * @param {Object} options
 */
Network.prototype.setOptions = function (options) {
  if (options) {
    var prop;
    var fields = ['nodes','edges','smoothCurves','hierarchicalLayout','clustering','navigation',
      'keyboard','dataManipulation','onAdd','onEdit','onEditEdge','onConnect','onDelete','clickToUse'
    ];
    // extend all but the values in fields
    util.selectiveNotDeepExtend(fields,this.constants, options);
    util.selectiveNotDeepExtend(['color'],this.constants.nodes, options.nodes);
    util.selectiveNotDeepExtend(['color','length'],this.constants.edges, options.edges);

    this.groups.useDefaultGroups = this.constants.useDefaultGroups;
    if (options.physics) {
      util.mergeOptions(this.constants.physics, options.physics,'barnesHut');
      util.mergeOptions(this.constants.physics, options.physics,'repulsion');

      if (options.physics.hierarchicalRepulsion) {
        this.constants.hierarchicalLayout.enabled = true;
        this.constants.physics.hierarchicalRepulsion.enabled = true;
        this.constants.physics.barnesHut.enabled = false;
        for (prop in options.physics.hierarchicalRepulsion) {
          if (options.physics.hierarchicalRepulsion.hasOwnProperty(prop)) {
            this.constants.physics.hierarchicalRepulsion[prop] = options.physics.hierarchicalRepulsion[prop];
          }
        }
      }
    }

    if (options.onAdd) {this.triggerFunctions.add = options.onAdd;}
    if (options.onEdit) {this.triggerFunctions.edit = options.onEdit;}
    if (options.onEditEdge) {this.triggerFunctions.editEdge = options.onEditEdge;}
    if (options.onConnect) {this.triggerFunctions.connect = options.onConnect;}
    if (options.onDelete) {this.triggerFunctions.del = options.onDelete;}

    util.mergeOptions(this.constants, options,'smoothCurves');
    util.mergeOptions(this.constants, options,'hierarchicalLayout');
    util.mergeOptions(this.constants, options,'clustering');
    util.mergeOptions(this.constants, options,'navigation');
    util.mergeOptions(this.constants, options,'keyboard');
    util.mergeOptions(this.constants, options,'dataManipulation');


    if (options.dataManipulation) {
      this.editMode = this.constants.dataManipulation.initiallyVisible;
    }


    // TODO: work out these options and document them
    if (options.edges) {
      if (options.edges.color !== undefined) {
        if (util.isString(options.edges.color)) {
          this.constants.edges.color = {};
          this.constants.edges.color.color = options.edges.color;
          this.constants.edges.color.highlight = options.edges.color;
          this.constants.edges.color.hover = options.edges.color;
        }
        else {
          if (options.edges.color.color !== undefined)     {this.constants.edges.color.color = options.edges.color.color;}
          if (options.edges.color.highlight !== undefined) {this.constants.edges.color.highlight = options.edges.color.highlight;}
          if (options.edges.color.hover !== undefined)     {this.constants.edges.color.hover = options.edges.color.hover;}
        }
        this.constants.edges.inheritColor = false;
      }

      if (!options.edges.fontColor) {
        if (options.edges.color !== undefined) {
          if (util.isString(options.edges.color))           {this.constants.edges.fontColor = options.edges.color;}
          else if (options.edges.color.color !== undefined) {this.constants.edges.fontColor = options.edges.color.color;}
        }
      }
    }

    if (options.nodes) {
      if (options.nodes.color) {
        var newColorObj = util.parseColor(options.nodes.color);
        this.constants.nodes.color.background = newColorObj.background;
        this.constants.nodes.color.border = newColorObj.border;
        this.constants.nodes.color.highlight.background = newColorObj.highlight.background;
        this.constants.nodes.color.highlight.border = newColorObj.highlight.border;
        this.constants.nodes.color.hover.background = newColorObj.hover.background;
        this.constants.nodes.color.hover.border = newColorObj.hover.border;
      }
    }
    if (options.groups) {
      for (var groupname in options.groups) {
        if (options.groups.hasOwnProperty(groupname)) {
          var group = options.groups[groupname];
          this.groups.add(groupname, group);
        }
      }
    }

    if (options.tooltip) {
      for (prop in options.tooltip) {
        if (options.tooltip.hasOwnProperty(prop)) {
          this.constants.tooltip[prop] = options.tooltip[prop];
        }
      }
      if (options.tooltip.color) {
        this.constants.tooltip.color = util.parseColor(options.tooltip.color);
      }
    }

    if ('clickToUse' in options) {
      if (options.clickToUse) {
        if (!this.activator) {
          this.activator = new Activator(this.frame);
          this.activator.on('change', this._createKeyBinds.bind(this));
        }
      }
      else {
        if (this.activator) {
          this.activator.destroy();
          delete this.activator;
        }
      }
    }

    if (options.labels) {
      throw new Error('Option "labels" is deprecated. Use options "locale" and "locales" instead.');
    }


    // (Re)loading the mixins that can be enabled or disabled in the options.
    // load the force calculation functions, grouped under the physics system.
    this._loadPhysicsSystem();
    // load the navigation system.
    this._loadNavigationControls();
    // load the data manipulation system
    this._loadManipulationSystem();
    // configure the smooth curves
    this._configureSmoothCurves();

    // bind hammer
    this._bindHammer();

    // bind keys. If disabled, this will not do anything;
    this._createKeyBinds();

    this._markAllEdgesAsDirty();
    this.setSize(this.constants.width, this.constants.height);
    this.moving = true;
    if (this.constants.hierarchicalLayout.enabled == true && this.initializing == false) {
      this._resetLevels();
      this._setupHierarchicalLayout();
    }
    this.start();
  }
};



/**
 * Create the main frame for the Network.
 * This function is executed once when a Network object is created. The frame
 * contains a canvas, and this canvas contains all objects like the axis and
 * nodes.
 * @private
 */
Network.prototype._create = function () {
  // remove all elements from the container element.
  while (this.containerElement.hasChildNodes()) {
    this.containerElement.removeChild(this.containerElement.firstChild);
  }

  this.frame = document.createElement('div');
  this.frame.className = 'vis network-frame';
  this.frame.style.position = 'relative';
  this.frame.style.overflow = 'hidden';
  this.frame.tabIndex = 900;


//////////////////////////////////////////////////////////////////

  this.frame.canvas = document.createElement("canvas");
  this.frame.canvas.style.position = 'relative';
  this.frame.appendChild(this.frame.canvas);

  if (!this.frame.canvas.getContext) {
    var noCanvas = document.createElement( 'DIV' );
    noCanvas.style.color = 'red';
    noCanvas.style.fontWeight =  'bold' ;
    noCanvas.style.padding =  '10px';
    noCanvas.innerHTML =  'Error: your browser does not support HTML canvas';
    this.frame.canvas.appendChild(noCanvas);
  }
  else {
    var ctx = this.frame.canvas.getContext("2d");
    this.pixelRatio = (window.devicePixelRatio || 1) / (ctx.webkitBackingStorePixelRatio ||
              ctx.mozBackingStorePixelRatio ||
              ctx.msBackingStorePixelRatio ||
              ctx.oBackingStorePixelRatio ||
              ctx.backingStorePixelRatio || 1);

    //this.pixelRatio = Math.max(1,this.pixelRatio); // this is to account for browser zooming out. The pixel ratio is ment to switch between 1 and 2 for HD screens.
    this.frame.canvas.getContext("2d").setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
  }

  this._bindHammer();
};


/**
 * This function binds hammer, it can be repeated over and over due to the uniqueness check.
 * @private
 */
Network.prototype._bindHammer = function() {
  var me = this;
  if (this.hammer !== undefined) {
    this.hammer.dispose();
  }
  this.drag = {};
  this.pinch = {};
  this.hammer = Hammer(this.frame.canvas, {
    prevent_default: true
  });
  this.hammer.on('tap',       me._onTap.bind(me) );
  this.hammer.on('doubletap', me._onDoubleTap.bind(me) );
  this.hammer.on('hold',      me._onHold.bind(me) );
  this.hammer.on('touch',     me._onTouch.bind(me) );
  this.hammer.on('dragstart', me._onDragStart.bind(me) );
  this.hammer.on('drag',      me._onDrag.bind(me) );
  this.hammer.on('dragend',   me._onDragEnd.bind(me) );

  if (this.constants.zoomable == true) {
    this.hammer.on('mousewheel',      me._onMouseWheel.bind(me));
    this.hammer.on('DOMMouseScroll',  me._onMouseWheel.bind(me)); // for FF
    this.hammer.on('pinch',           me._onPinch.bind(me) );
  }

  this.hammer.on('mousemove', me._onMouseMoveTitle.bind(me) );

  this.hammerFrame = Hammer(this.frame, {
    prevent_default: true
  });
  this.hammerFrame.on('release', me._onRelease.bind(me) );

  // add the frame to the container element
  this.containerElement.appendChild(this.frame);
}

/**
 * Binding the keys for keyboard navigation. These functions are defined in the NavigationMixin
 * @private
 */
Network.prototype._createKeyBinds = function() {
  var me = this;
  if (this.keycharm !== undefined) {
    this.keycharm.destroy();
  }

  if (this.constants.keyboard.bindToWindow == true) {
    this.keycharm = keycharm({container: window, preventDefault: false});
  }
  else {
    this.keycharm = keycharm({container: this.frame, preventDefault: false});
  }

  this.keycharm.reset();

  if (this.constants.keyboard.enabled && this.isActive()) {
    this.keycharm.bind("up",   this._moveUp.bind(me)   , "keydown");
    this.keycharm.bind("up",   this._yStopMoving.bind(me), "keyup");
    this.keycharm.bind("down", this._moveDown.bind(me) , "keydown");
    this.keycharm.bind("down", this._yStopMoving.bind(me), "keyup");
    this.keycharm.bind("left", this._moveLeft.bind(me) , "keydown");
    this.keycharm.bind("left", this._xStopMoving.bind(me), "keyup");
    this.keycharm.bind("right",this._moveRight.bind(me), "keydown");
    this.keycharm.bind("right",this._xStopMoving.bind(me), "keyup");
    this.keycharm.bind("=",    this._zoomIn.bind(me),    "keydown");
    this.keycharm.bind("=",    this._stopZoom.bind(me),    "keyup");
    this.keycharm.bind("num+", this._zoomIn.bind(me),    "keydown");
    this.keycharm.bind("num+", this._stopZoom.bind(me),    "keyup");
    this.keycharm.bind("num-", this._zoomOut.bind(me),   "keydown");
    this.keycharm.bind("num-", this._stopZoom.bind(me),    "keyup");
    this.keycharm.bind("-",    this._zoomOut.bind(me),   "keydown");
    this.keycharm.bind("-",    this._stopZoom.bind(me),    "keyup");
    this.keycharm.bind("[",    this._zoomIn.bind(me),    "keydown");
    this.keycharm.bind("[",    this._stopZoom.bind(me),    "keyup");
    this.keycharm.bind("]",    this._zoomOut.bind(me),   "keydown");
    this.keycharm.bind("]",    this._stopZoom.bind(me),    "keyup");
    this.keycharm.bind("pageup",this._zoomIn.bind(me),   "keydown");
    this.keycharm.bind("pageup",this._stopZoom.bind(me),   "keyup");
    this.keycharm.bind("pagedown",this._zoomOut.bind(me),"keydown");
    this.keycharm.bind("pagedown",this._stopZoom.bind(me), "keyup");
  }

  if (this.constants.dataManipulation.enabled == true) {
    this.keycharm.bind("esc",this._createManipulatorBar.bind(me));
    this.keycharm.bind("delete",this._deleteSelected.bind(me));
  }
};

/**
 * Cleans up all bindings of the network, removing it fully from the memory IF the variable is set to null after calling this function.
 * var network = new vis.Network(..);
 * network.destroy();
 * network = null;
 */
Network.prototype.destroy = function() {
  this.start = function () {};
  this.redraw = function () {};
  this.timer = false;

  // cleanup physicsConfiguration if it exists
  this._cleanupPhysicsConfiguration();

  // remove keybindings
  this.keycharm.reset();

  // clear hammer bindings
  this.hammer.dispose();

  // clear events
  this.off();

  this._recursiveDOMDelete(this.containerElement);
}

Network.prototype._recursiveDOMDelete = function(DOMobject) {
  while (DOMobject.hasChildNodes() == true) {
    this._recursiveDOMDelete(DOMobject.firstChild);
    DOMobject.removeChild(DOMobject.firstChild);
  }
}

/**
 * Get the pointer location from a touch location
 * @param {{pageX: Number, pageY: Number}} touch
 * @return {{x: Number, y: Number}} pointer
 * @private
 */
Network.prototype._getPointer = function (touch) {
  return {
    x: touch.pageX - util.getAbsoluteLeft(this.frame.canvas),
    y: touch.pageY - util.getAbsoluteTop(this.frame.canvas)
  };
};

/**
 * On start of a touch gesture, store the pointer
 * @param event
 * @private
 */
Network.prototype._onTouch = function (event) {
  if (new Date().valueOf() - this.touchTime > 100) {
    this.drag.pointer = this._getPointer(event.gesture.center);
    this.drag.pinched = false;
    this.pinch.scale = this._getScale();

    // to avoid double fireing of this event because we have two hammer instances. (on canvas and on frame)
    this.touchTime = new Date().valueOf();

    this._handleTouch(this.drag.pointer);
  }
};

/**
 * handle drag start event
 * @private
 */
Network.prototype._onDragStart = function (event) {
  this._handleDragStart(event);
};


/**
 * This function is called by _onDragStart.
 * It is separated out because we can then overload it for the datamanipulation system.
 *
 * @private
 */
Network.prototype._handleDragStart = function(event) {
  // in case the touch event was triggered on an external div, do the initial touch now.
  if (this.drag.pointer === undefined) {
    this._onTouch(event);
  }

  var node = this._getNodeAt(this.drag.pointer);
  // note: drag.pointer is set in _onTouch to get the initial touch location

  this.drag.dragging = true;
  this.drag.selection = [];
  this.drag.translation = this._getTranslation();
  this.drag.nodeId = null;
  this.draggingNodes = false;

  if (node != null && this.constants.dragNodes == true) {
    this.draggingNodes = true;
    this.drag.nodeId = node.id;
    // select the clicked node if not yet selected
    if (!node.isSelected()) {
      this._selectObject(node,false);
    }

    this.emit("dragStart",{nodeIds:this.getSelection().nodes});

    // create an array with the selected nodes and their original location and status
    for (var objectId in this.selectionObj.nodes) {
      if (this.selectionObj.nodes.hasOwnProperty(objectId)) {
        var object = this.selectionObj.nodes[objectId];
        var s = {
          id: object.id,
          node: object,

          // store original x, y, xFixed and yFixed, make the node temporarily Fixed
          x: object.x,
          y: object.y,
          xFixed: object.xFixed,
          yFixed: object.yFixed
        };

        object.xFixed = true;
        object.yFixed = true;

        this.drag.selection.push(s);
      }
    }
  }
};


/**
 * handle drag event
 * @private
 */
Network.prototype._onDrag = function (event) {
  this._handleOnDrag(event)
};


/**
 * This function is called by _onDrag.
 * It is separated out because we can then overload it for the datamanipulation system.
 *
 * @private
 */
Network.prototype._handleOnDrag = function(event) {
  if (this.drag.pinched) {
    return;
  }

  // remove the focus on node if it is focussed on by the focusOnNode
  this.releaseNode();

  var pointer = this._getPointer(event.gesture.center);
  var me = this;
  var drag = this.drag;
  var selection = drag.selection;
  if (selection && selection.length && this.constants.dragNodes == true) {
    // calculate delta's and new location
    var deltaX = pointer.x - drag.pointer.x;
    var deltaY = pointer.y - drag.pointer.y;

    // update position of all selected nodes
    selection.forEach(function (s) {
      var node = s.node;

      if (!s.xFixed) {
        node.x = me._XconvertDOMtoCanvas(me._XconvertCanvasToDOM(s.x) + deltaX);
      }

      if (!s.yFixed) {
        node.y = me._YconvertDOMtoCanvas(me._YconvertCanvasToDOM(s.y) + deltaY);
      }
    });


    // start _animationStep if not yet running
    if (!this.moving) {
      this.moving = true;
      this.start();
    }
  }
  else {
    // move the network
    if (this.constants.dragNetwork == true) {
      // if the drag was not started properly because the click started outside the network div, start it now.
      if (this.drag.pointer === undefined) {
        this._handleDragStart(event);
        return;
      }
      var diffX = pointer.x - this.drag.pointer.x;
      var diffY = pointer.y - this.drag.pointer.y;

      this._setTranslation(
        this.drag.translation.x + diffX,
        this.drag.translation.y + diffY
      );
      this._redraw();
    }
  }
};

/**
 * handle drag start event
 * @private
 */
Network.prototype._onDragEnd = function (event) {
  this._handleDragEnd(event);
};


Network.prototype._handleDragEnd = function(event) {
  this.drag.dragging = false;
  var selection = this.drag.selection;
  if (selection && selection.length) {
    selection.forEach(function (s) {
      // restore original xFixed and yFixed
      s.node.xFixed = s.xFixed;
      s.node.yFixed = s.yFixed;
    });
    this.moving = true;
    this.start();
  }
  else {
    this._redraw();
  }
  if (this.draggingNodes == false) {
    this.emit("dragEnd",{nodeIds:[]});
  }
  else {
    this.emit("dragEnd",{nodeIds:this.getSelection().nodes});
  }

}
/**
 * handle tap/click event: select/unselect a node
 * @private
 */
Network.prototype._onTap = function (event) {
  var pointer = this._getPointer(event.gesture.center);
  this.pointerPosition = pointer;
  this._handleTap(pointer);

};


/**
 * handle doubletap event
 * @private
 */
Network.prototype._onDoubleTap = function (event) {
  var pointer = this._getPointer(event.gesture.center);
  this._handleDoubleTap(pointer);
};


/**
 * handle long tap event: multi select nodes
 * @private
 */
Network.prototype._onHold = function (event) {
  var pointer = this._getPointer(event.gesture.center);
  this.pointerPosition = pointer;
  this._handleOnHold(pointer);
};

/**
 * handle the release of the screen
 *
 * @private
 */
Network.prototype._onRelease = function (event) {
  var pointer = this._getPointer(event.gesture.center);
  this._handleOnRelease(pointer);
};

/**
 * Handle pinch event
 * @param event
 * @private
 */
Network.prototype._onPinch = function (event) {
  var pointer = this._getPointer(event.gesture.center);

  this.drag.pinched = true;
  if (!('scale' in this.pinch)) {
    this.pinch.scale = 1;
  }

  // TODO: enabled moving while pinching?
  var scale = this.pinch.scale * event.gesture.scale;
  this._zoom(scale, pointer)
};

/**
 * Zoom the network in or out
 * @param {Number} scale a number around 1, and between 0.01 and 10
 * @param {{x: Number, y: Number}} pointer    Position on screen
 * @return {Number} appliedScale    scale is limited within the boundaries
 * @private
 */
Network.prototype._zoom = function(scale, pointer) {
  if (this.constants.zoomable == true) {
    var scaleOld = this._getScale();
    if (scale < 0.00001) {
      scale = 0.00001;
    }
    if (scale > 10) {
      scale = 10;
    }

    var preScaleDragPointer = null;
    if (this.drag !== undefined) {
      if (this.drag.dragging == true) {
        preScaleDragPointer = this.DOMtoCanvas(this.drag.pointer);
      }
    }
  // + this.frame.canvas.clientHeight / 2
    var translation = this._getTranslation();

    var scaleFrac = scale / scaleOld;
    var tx = (1 - scaleFrac) * pointer.x + translation.x * scaleFrac;
    var ty = (1 - scaleFrac) * pointer.y + translation.y * scaleFrac;

    this.areaCenter = {"x" : this._XconvertDOMtoCanvas(pointer.x),
                       "y" : this._YconvertDOMtoCanvas(pointer.y)};

    this._setScale(scale);
    this._setTranslation(tx, ty);
    this.updateClustersDefault();

    if (preScaleDragPointer != null) {
      var postScaleDragPointer = this.canvasToDOM(preScaleDragPointer);
      this.drag.pointer.x = postScaleDragPointer.x;
      this.drag.pointer.y = postScaleDragPointer.y;
    }

    this._redraw();

    if (scaleOld < scale) {
      this.emit("zoom", {direction:"+"});
    }
    else {
      this.emit("zoom", {direction:"-"});
    }

    return scale;
  }
};


/**
 * Event handler for mouse wheel event, used to zoom the timeline
 * See http://adomas.org/javascript-mouse-wheel/
 *     https://github.com/EightMedia/hammer.js/issues/256
 * @param {MouseEvent}  event
 * @private
 */
Network.prototype._onMouseWheel = function(event) {
  // retrieve delta
  var delta = 0;
  if (event.wheelDelta) { /* IE/Opera. */
    delta = event.wheelDelta/120;
  } else if (event.detail) { /* Mozilla case. */
    // In Mozilla, sign of delta is different than in IE.
    // Also, delta is multiple of 3.
    delta = -event.detail/3;
  }

  // If delta is nonzero, handle it.
  // Basically, delta is now positive if wheel was scrolled up,
  // and negative, if wheel was scrolled down.
  if (delta) {

    // calculate the new scale
    var scale = this._getScale();
    var zoom = delta / 10;
    if (delta < 0) {
      zoom = zoom / (1 - zoom);
    }
    scale *= (1 + zoom);

    // calculate the pointer location
    var gesture = hammerUtil.fakeGesture(this, event);
    var pointer = this._getPointer(gesture.center);

    // apply the new scale
    this._zoom(scale, pointer);
  }

  // Prevent default actions caused by mouse wheel.
  event.preventDefault();
};


/**
 * Mouse move handler for checking whether the title moves over a node with a title.
 * @param  {Event} event
 * @private
 */
Network.prototype._onMouseMoveTitle = function (event) {
  var gesture = hammerUtil.fakeGesture(this, event);
  var pointer = this._getPointer(gesture.center);
  var popupVisible = false;

  // check if the previously selected node is still selected
  if (this.popup !== undefined) {
    if (this.popup.hidden === false) {
      this._checkHidePopup(pointer);
    }

    // if the popup was not hidden above
    if (this.popup.hidden === false) {
      popupVisible = true;
      this.popup.setPosition(pointer.x + 3,pointer.y - 5)
      this.popup.show();
    }
  }

  // if we bind the keyboard to the div, we have to highlight it to use it. This highlights it on mouse over
  if (this.constants.keyboard.bindToWindow == false && this.constants.keyboard.enabled == true) {
    this.frame.focus();
  }

  // start a timeout that will check if the mouse is positioned above an element
  if (popupVisible === false) {
    var me = this;
    var checkShow = function () {
      me._checkShowPopup(pointer);
    };
    if (this.popupTimer) {
      clearInterval(this.popupTimer); // stop any running calculationTimer
    }
    if (!this.drag.dragging) {
      this.popupTimer = setTimeout(checkShow, this.constants.tooltip.delay);
    }
  }

  /**
   * Adding hover highlights
   */
  if (this.constants.hover == true) {
    // removing all hover highlights
    for (var edgeId in this.hoverObj.edges) {
      if (this.hoverObj.edges.hasOwnProperty(edgeId)) {
        this.hoverObj.edges[edgeId].hover = false;
        delete this.hoverObj.edges[edgeId];
      }
    }

    // adding hover highlights
    var obj = this._getNodeAt(pointer);
    if (obj == null) {
      obj = this._getEdgeAt(pointer);
    }
    if (obj != null) {
      this._hoverObject(obj);
    }

    // removing all node hover highlights except for the selected one.
    for (var nodeId in this.hoverObj.nodes) {
      if (this.hoverObj.nodes.hasOwnProperty(nodeId)) {
        if (obj instanceof Node && obj.id != nodeId || obj instanceof Edge || obj == null) {
          this._blurObject(this.hoverObj.nodes[nodeId]);
          delete this.hoverObj.nodes[nodeId];
        }
      }
    }
    this.redraw();
  }
};

/**
 * Check if there is an element on the given position in the network
 * (a node or edge). If so, and if this element has a title,
 * show a popup window with its title.
 *
 * @param {{x:Number, y:Number}} pointer
 * @private
 */
Network.prototype._checkShowPopup = function (pointer) {
  var obj = {
    left:   this._XconvertDOMtoCanvas(pointer.x),
    top:    this._YconvertDOMtoCanvas(pointer.y),
    right:  this._XconvertDOMtoCanvas(pointer.x),
    bottom: this._YconvertDOMtoCanvas(pointer.y)
  };

  var id;
  var previousPopupObjId = this.popupObj === undefined ? "" : this.popupObj.id;
  var nodeUnderCursor = false;
  var popupType = "node";

  if (this.popupObj == undefined) {
    // search the nodes for overlap, select the top one in case of multiple nodes
    var nodes = this.nodes;
    var overlappingNodes = [];
    for (id in nodes) {
      if (nodes.hasOwnProperty(id)) {
        var node = nodes[id];
        if (node.isOverlappingWith(obj)) {
          if (node.getTitle() !== undefined) {
            overlappingNodes.push(id);
          }
        }
      }
    }

    if (overlappingNodes.length > 0) {
      // if there are overlapping nodes, select the last one, this is the
      // one which is drawn on top of the others
      this.popupObj = this.nodes[overlappingNodes[overlappingNodes.length - 1]];
      // if you hover over a node, the title of the edge is not supposed to be shown.
      nodeUnderCursor = true;
    }
  }

  if (this.popupObj === undefined && nodeUnderCursor == false) {
    // search the edges for overlap
    var edges = this.edges;
    var overlappingEdges = [];
    for (id in edges) {
      if (edges.hasOwnProperty(id)) {
        var edge = edges[id];
        if (edge.connected && (edge.getTitle() !== undefined) &&
            edge.isOverlappingWith(obj)) {
          overlappingEdges.push(id);
        }
      }
    }

    if (overlappingEdges.length > 0) {
      this.popupObj = this.edges[overlappingEdges[overlappingEdges.length - 1]];
      popupType = "edge";
    }
  }

  if (this.popupObj) {
    // show popup message window
    if (this.popupObj.id != previousPopupObjId) {
      if (this.popup === undefined) {
        this.popup = new Popup(this.frame, this.constants.tooltip);
      }

      this.popup.popupTargetType = popupType;
      this.popup.popupTargetId = this.popupObj.id;

      // adjust a small offset such that the mouse cursor is located in the
      // bottom left location of the popup, and you can easily move over the
      // popup area
      this.popup.setPosition(pointer.x + 3, pointer.y - 5);
      this.popup.setText(this.popupObj.getTitle());
      this.popup.show();
    }
  }
  else {
    if (this.popup) {
      this.popup.hide();
    }
  }
};


/**
 * Check if the popup must be hidden, which is the case when the mouse is no
 * longer hovering on the object
 * @param {{x:Number, y:Number}} pointer
 * @private
 */
Network.prototype._checkHidePopup = function (pointer) {
  var pointerObj = {
    left:   this._XconvertDOMtoCanvas(pointer.x),
    top:    this._YconvertDOMtoCanvas(pointer.y),
    right:  this._XconvertDOMtoCanvas(pointer.x),
    bottom: this._YconvertDOMtoCanvas(pointer.y)
  };

  var stillOnObj = false;
  if (this.popup.popupTargetType == 'node') {
    stillOnObj = this.nodes[this.popup.popupTargetId].isOverlappingWith(pointerObj);
    if (stillOnObj === true) {
      var overNode = this._getNodeAt(pointer);
      stillOnObj = overNode.id == this.popup.popupTargetId;
    }
  }
  else {
    if (this._getNodeAt(pointer) === null) {
      stillOnObj = this.edges[this.popup.popupTargetId].isOverlappingWith(pointerObj);
    }
  }


  if (stillOnObj === false) {
    this.popupObj = undefined;
    this.popup.hide();
  }
};


/**
 * Set a new size for the network
 * @param {string} width   Width in pixels or percentage (for example '800px'
 *                         or '50%')
 * @param {string} height  Height in pixels or percentage  (for example '400px'
 *                         or '30%')
 */
Network.prototype.setSize = function(width, height) {
  var emitEvent = false;
  var oldWidth = this.frame.canvas.width;
  var oldHeight = this.frame.canvas.height;
  if (width != this.constants.width || height != this.constants.height || this.frame.style.width != width || this.frame.style.height != height) {
    this.frame.style.width = width;
    this.frame.style.height = height;

    this.frame.canvas.style.width = '100%';
    this.frame.canvas.style.height = '100%';

    this.frame.canvas.width = this.frame.canvas.clientWidth * this.pixelRatio;
    this.frame.canvas.height = this.frame.canvas.clientHeight * this.pixelRatio;

    this.constants.width = width;
    this.constants.height = height;

    emitEvent = true;
  }
  else {
    // this would adapt the width of the canvas to the width from 100% if and only if
    // there is a change.

    if (this.frame.canvas.width != this.frame.canvas.clientWidth * this.pixelRatio) {
      this.frame.canvas.width = this.frame.canvas.clientWidth * this.pixelRatio;
      emitEvent = true;
    }
    if (this.frame.canvas.height != this.frame.canvas.clientHeight * this.pixelRatio) {
      this.frame.canvas.height = this.frame.canvas.clientHeight * this.pixelRatio;
      emitEvent = true;
    }
  }

  if (emitEvent == true) {
    this.emit('resize', {width:this.frame.canvas.width * this.pixelRatio,height:this.frame.canvas.height * this.pixelRatio, oldWidth: oldWidth * this.pixelRatio, oldHeight: oldHeight * this.pixelRatio});
  }
};

/**
 * Set a data set with nodes for the network
 * @param {Array | DataSet | DataView} nodes         The data containing the nodes.
 * @private
 */
Network.prototype._setNodes = function(nodes) {
  var oldNodesData = this.nodesData;

  if (nodes instanceof DataSet || nodes instanceof DataView) {
    this.nodesData = nodes;
  }
  else if (Array.isArray(nodes)) {
    this.nodesData = new DataSet();
    this.nodesData.add(nodes);
  }
  else if (!nodes) {
    this.nodesData = new DataSet();
  }
  else {
    throw new TypeError('Array or DataSet expected');
  }

  if (oldNodesData) {
    // unsubscribe from old dataset
    util.forEach(this.nodesListeners, function (callback, event) {
      oldNodesData.off(event, callback);
    });
  }

  // remove drawn nodes
  this.nodes = {};

  if (this.nodesData) {
    // subscribe to new dataset
    var me = this;
    util.forEach(this.nodesListeners, function (callback, event) {
      me.nodesData.on(event, callback);
    });

    // draw all new nodes
    var ids = this.nodesData.getIds();
    this._addNodes(ids);
  }
  this._updateSelection();
};

/**
 * Add nodes
 * @param {Number[] | String[]} ids
 * @private
 */
Network.prototype._addNodes = function(ids) {
  var id;
  for (var i = 0, len = ids.length; i < len; i++) {
    id = ids[i];
    var data = this.nodesData.get(id);
    var node = new Node(data, this.images, this.groups, this.constants);
    this.nodes[id] = node; // note: this may replace an existing node
    if ((node.xFixed == false || node.yFixed == false) && (node.x === null || node.y === null)) {
      var radius = 10 * 0.1*ids.length + 10;
      var angle = 2 * Math.PI * Math.random();
      if (node.xFixed == false) {node.x = radius * Math.cos(angle);}
      if (node.yFixed == false) {node.y = radius * Math.sin(angle);}
    }
    this.moving = true;
  }

  this._updateNodeIndexList();
  if (this.constants.hierarchicalLayout.enabled == true && this.initializing == false) {
    this._resetLevels();
    this._setupHierarchicalLayout();
  }
  this._updateCalculationNodes();
  this._reconnectEdges();
  this._updateValueRange(this.nodes);
  this.updateLabels();
};

/**
 * Update existing nodes, or create them when not yet existing
 * @param {Number[] | String[]} ids
 * @private
 */
Network.prototype._updateNodes = function(ids,changedData) {
  var nodes = this.nodes;
  for (var i = 0, len = ids.length; i < len; i++) {
    var id = ids[i];
    var node = nodes[id];
    var data = changedData[i];
    if (node) {
      // update node
      node.setProperties(data, this.constants);
    }
    else {
      // create node
      node = new Node(properties, this.images, this.groups, this.constants);
      nodes[id] = node;
    }
  }
  this.moving = true;
  if (this.constants.hierarchicalLayout.enabled == true && this.initializing == false) {
    this._resetLevels();
    this._setupHierarchicalLayout();
  }
  this._updateNodeIndexList();
  this._updateValueRange(nodes);
  this._markAllEdgesAsDirty();
};


Network.prototype._markAllEdgesAsDirty = function() {
  for (var edgeId in this.edges) {
    this.edges[edgeId].colorDirty = true;
  }
}

/**
 * Remove existing nodes. If nodes do not exist, the method will just ignore it.
 * @param {Number[] | String[]} ids
 * @private
 */
Network.prototype._removeNodes = function(ids) {
  var nodes = this.nodes;

  // remove from selection
  for (var i = 0, len = ids.length; i < len; i++) {
    if (this.selectionObj.nodes[ids[i]] !== undefined) {
      this.nodes[ids[i]].unselect();
      this._removeFromSelection(this.nodes[ids[i]]);
    }
  }

  for (var i = 0, len = ids.length; i < len; i++) {
    var id = ids[i];
    delete nodes[id];
  }



  this._updateNodeIndexList();
  if (this.constants.hierarchicalLayout.enabled == true && this.initializing == false) {
    this._resetLevels();
    this._setupHierarchicalLayout();
  }
  this._updateCalculationNodes();
  this._reconnectEdges();
  this._updateSelection();
  this._updateValueRange(nodes);
};

/**
 * Load edges by reading the data table
 * @param {Array | DataSet | DataView} edges    The data containing the edges.
 * @private
 * @private
 */
Network.prototype._setEdges = function(edges) {
  var oldEdgesData = this.edgesData;

  if (edges instanceof DataSet || edges instanceof DataView) {
    this.edgesData = edges;
  }
  else if (Array.isArray(edges)) {
    this.edgesData = new DataSet();
    this.edgesData.add(edges);
  }
  else if (!edges) {
    this.edgesData = new DataSet();
  }
  else {
    throw new TypeError('Array or DataSet expected');
  }

  if (oldEdgesData) {
    // unsubscribe from old dataset
    util.forEach(this.edgesListeners, function (callback, event) {
      oldEdgesData.off(event, callback);
    });
  }

  // remove drawn edges
  this.edges = {};

  if (this.edgesData) {
    // subscribe to new dataset
    var me = this;
    util.forEach(this.edgesListeners, function (callback, event) {
      me.edgesData.on(event, callback);
    });

    // draw all new nodes
    var ids = this.edgesData.getIds();
    this._addEdges(ids);
  }

  this._reconnectEdges();
};

/**
 * Add edges
 * @param {Number[] | String[]} ids
 * @private
 */
Network.prototype._addEdges = function (ids) {
  var edges = this.edges,
      edgesData = this.edgesData;

  for (var i = 0, len = ids.length; i < len; i++) {
    var id = ids[i];

    var oldEdge = edges[id];
    if (oldEdge) {
      oldEdge.disconnect();
    }

    var data = edgesData.get(id, {"showInternalIds" : true});
    edges[id] = new Edge(data, this, this.constants);
  }
  this.moving = true;
  this._updateValueRange(edges);
  this._createBezierNodes();
  this._updateCalculationNodes();
  if (this.constants.hierarchicalLayout.enabled == true && this.initializing == false) {
    this._resetLevels();
    this._setupHierarchicalLayout();
  }
};

/**
 * Update existing edges, or create them when not yet existing
 * @param {Number[] | String[]} ids
 * @private
 */
Network.prototype._updateEdges = function (ids) {
  var edges = this.edges,
      edgesData = this.edgesData;
  for (var i = 0, len = ids.length; i < len; i++) {
    var id = ids[i];

    var data = edgesData.get(id);
    var edge = edges[id];
    if (edge) {
      // update edge
      edge.disconnect();
      edge.setProperties(data, this.constants);
      edge.connect();
    }
    else {
      // create edge
      edge = new Edge(data, this, this.constants);
      this.edges[id] = edge;
    }
  }

  this._createBezierNodes();
  if (this.constants.hierarchicalLayout.enabled == true && this.initializing == false) {
    this._resetLevels();
    this._setupHierarchicalLayout();
  }
  this.moving = true;
  this._updateValueRange(edges);
};

/**
 * Remove existing edges. Non existing ids will be ignored
 * @param {Number[] | String[]} ids
 * @private
 */
Network.prototype._removeEdges = function (ids) {
  var edges = this.edges;

  // remove from selection
  for (var i = 0, len = ids.length; i < len; i++) {
    if (this.selectionObj.edges[ids[i]] !== undefined) {
      edges[ids[i]].unselect();
      this._removeFromSelection(edges[ids[i]]);
    }
  }

  for (var i = 0, len = ids.length; i < len; i++) {
    var id = ids[i];
    var edge = edges[id];
    if (edge) {
      if (edge.via != null) {
        delete this.sectors['support']['nodes'][edge.via.id];
      }
      edge.disconnect();
      delete edges[id];
    }
  }

  this.moving = true;
  this._updateValueRange(edges);
  if (this.constants.hierarchicalLayout.enabled == true && this.initializing == false) {
    this._resetLevels();
    this._setupHierarchicalLayout();
  }
  this._updateCalculationNodes();
};

/**
 * Reconnect all edges
 * @private
 */
Network.prototype._reconnectEdges = function() {
  var id,
      nodes = this.nodes,
      edges = this.edges;
  for (id in nodes) {
    if (nodes.hasOwnProperty(id)) {
      nodes[id].edges = [];
      nodes[id].dynamicEdges = [];
    }
  }

  for (id in edges) {
    if (edges.hasOwnProperty(id)) {
      var edge = edges[id];
      edge.from = null;
      edge.to = null;
      edge.connect();
    }
  }
};

/**
 * Update the values of all object in the given array according to the current
 * value range of the objects in the array.
 * @param {Object} obj    An object containing a set of Edges or Nodes
 *                        The objects must have a method getValue() and
 *                        setValueRange(min, max).
 * @private
 */
Network.prototype._updateValueRange = function(obj) {
  var id;

  // determine the range of the objects
  var valueMin = undefined;
  var valueMax = undefined;
  var valueTotal = 0;
  for (id in obj) {
    if (obj.hasOwnProperty(id)) {
      var value = obj[id].getValue();
      if (value !== undefined) {
        valueMin = (valueMin === undefined) ? value : Math.min(value, valueMin);
        valueMax = (valueMax === undefined) ? value : Math.max(value, valueMax);
        valueTotal += value;
      }
    }
  }

  // adjust the range of all objects
  if (valueMin !== undefined && valueMax !== undefined) {
    for (id in obj) {
      if (obj.hasOwnProperty(id)) {
        obj[id].setValueRange(valueMin, valueMax, valueTotal);
      }
    }
  }
};

/**
 * Redraw the network with the current data
 * chart will be resized too.
 */
Network.prototype.redraw = function() {
  this.setSize(this.constants.width, this.constants.height);
  this._redraw();
};

/**
 * Redraw the network with the current data
 * @param hidden | used to get the first estimate of the node sizes. only the nodes are drawn after which they are quickly drawn over.
 * @private
 */
Network.prototype._requestRedraw = function(hidden) {
  if (this.redrawRequested !== true) {
    this.redrawRequested = true;
    if (this.requiresTimeout === true) {
      window.setTimeout(this._redraw.bind(this, hidden),0);
    }
    else {
      window.requestAnimationFrame(this._redraw.bind(this, hidden, true));
    }
  }
};

Network.prototype._redraw = function(hidden, requested) {
  if (hidden === undefined) {
    hidden = false;
  }
  this.redrawRequested = false;
  var ctx = this.frame.canvas.getContext('2d');

  ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);

  // clear the canvas
  var w = this.frame.canvas.clientWidth;
  var h = this.frame.canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);

  // set scaling and translation
  ctx.save();
  ctx.translate(this.translation.x, this.translation.y);
  ctx.scale(this.scale, this.scale);

  this.canvasTopLeft = {
    "x": this._XconvertDOMtoCanvas(0),
    "y": this._YconvertDOMtoCanvas(0)
  };
  this.canvasBottomRight = {
    "x": this._XconvertDOMtoCanvas(this.frame.canvas.clientWidth),
    "y": this._YconvertDOMtoCanvas(this.frame.canvas.clientHeight)
  };

  if (hidden === false) {
    this._doInAllSectors("_drawAllSectorNodes", ctx);
    if (this.drag.dragging == false || this.drag.dragging === undefined || this.constants.hideEdgesOnDrag == false) {
      this._doInAllSectors("_drawEdges", ctx);
    }
  }

  if (this.drag.dragging == false || this.drag.dragging === undefined || this.constants.hideNodesOnDrag == false) {
    this._doInAllSectors("_drawNodes",ctx,false);
  }

  if (hidden === false) {
    if (this.controlNodesActive == true) {
      this._doInAllSectors("_drawControlNodes", ctx);
    }
  }

//  this._doInSupportSector("_drawNodes",ctx,true);
//  this._drawTree(ctx,"#F00F0F");

  // restore original scaling and translation
  ctx.restore();

  if (hidden === true) {
    ctx.clearRect(0, 0, w, h);
  }
}

/**
 * Set the translation of the network
 * @param {Number} offsetX    Horizontal offset
 * @param {Number} offsetY    Vertical offset
 * @private
 */
Network.prototype._setTranslation = function(offsetX, offsetY) {
  if (this.translation === undefined) {
    this.translation = {
      x: 0,
      y: 0
    };
  }

  if (offsetX !== undefined) {
    this.translation.x = offsetX;
  }
  if (offsetY !== undefined) {
    this.translation.y = offsetY;
  }

  this.emit('viewChanged');
};

/**
 * Get the translation of the network
 * @return {Object} translation    An object with parameters x and y, both a number
 * @private
 */
Network.prototype._getTranslation = function() {
  return {
    x: this.translation.x,
    y: this.translation.y
  };
};

/**
 * Scale the network
 * @param {Number} scale   Scaling factor 1.0 is unscaled
 * @private
 */
Network.prototype._setScale = function(scale) {
  this.scale = scale;
};

/**
 * Get the current scale of  the network
 * @return {Number} scale   Scaling factor 1.0 is unscaled
 * @private
 */
Network.prototype._getScale = function() {
  return this.scale;
};

/**
 * Convert the X coordinate in DOM-space (coordinate point in browser relative to the container div) to
 * the X coordinate in canvas-space (the simulation sandbox, which the camera looks upon)
 * @param {number} x
 * @returns {number}
 * @private
 */
Network.prototype._XconvertDOMtoCanvas = function(x) {
  return (x - this.translation.x) / this.scale;
};

/**
 * Convert the X coordinate in canvas-space (the simulation sandbox, which the camera looks upon) to
 * the X coordinate in DOM-space (coordinate point in browser relative to the container div)
 * @param {number} x
 * @returns {number}
 * @private
 */
Network.prototype._XconvertCanvasToDOM = function(x) {
  return x * this.scale + this.translation.x;
};

/**
 * Convert the Y coordinate in DOM-space (coordinate point in browser relative to the container div) to
 * the Y coordinate in canvas-space (the simulation sandbox, which the camera looks upon)
 * @param {number} y
 * @returns {number}
 * @private
 */
Network.prototype._YconvertDOMtoCanvas = function(y) {
  return (y - this.translation.y) / this.scale;
};

/**
 * Convert the Y coordinate in canvas-space (the simulation sandbox, which the camera looks upon) to
 * the Y coordinate in DOM-space (coordinate point in browser relative to the container div)
 * @param {number} y
 * @returns {number}
 * @private
 */
Network.prototype._YconvertCanvasToDOM = function(y) {
  return y * this.scale + this.translation.y ;
};


/**
 *
 * @param {object} pos   = {x: number, y: number}
 * @returns {{x: number, y: number}}
 * @constructor
 */
Network.prototype.canvasToDOM = function (pos) {
  return {x: this._XconvertCanvasToDOM(pos.x), y: this._YconvertCanvasToDOM(pos.y)};
};

/**
 *
 * @param {object} pos   = {x: number, y: number}
 * @returns {{x: number, y: number}}
 * @constructor
 */
Network.prototype.DOMtoCanvas = function (pos) {
  return {x: this._XconvertDOMtoCanvas(pos.x), y: this._YconvertDOMtoCanvas(pos.y)};
};

/**
 * Redraw all nodes
 * The 2d context of a HTML canvas can be retrieved by canvas.getContext('2d');
 * @param {CanvasRenderingContext2D}   ctx
 * @param {Boolean} [alwaysShow]
 * @private
 */
Network.prototype._drawNodes = function(ctx,alwaysShow) {
  if (alwaysShow === undefined) {
    alwaysShow = false;
  }

  // first draw the unselected nodes
  var nodes = this.nodes;
  var selected = [];

  for (var id in nodes) {
    if (nodes.hasOwnProperty(id)) {
      nodes[id].setScaleAndPos(this.scale,this.canvasTopLeft,this.canvasBottomRight);
      if (nodes[id].isSelected()) {
        selected.push(id);
      }
      else {
        if (nodes[id].inArea() || alwaysShow) {
          nodes[id].draw(ctx);
        }
      }
    }
  }

  // draw the selected nodes on top
  for (var s = 0, sMax = selected.length; s < sMax; s++) {
    if (nodes[selected[s]].inArea() || alwaysShow) {
      nodes[selected[s]].draw(ctx);
    }
  }
};

/**
 * Redraw all edges
 * The 2d context of a HTML canvas can be retrieved by canvas.getContext('2d');
 * @param {CanvasRenderingContext2D}   ctx
 * @private
 */
Network.prototype._drawEdges = function(ctx) {
  var edges = this.edges;
  for (var id in edges) {
    if (edges.hasOwnProperty(id)) {
      var edge = edges[id];
      edge.setScale(this.scale);
      if (edge.connected) {
        edges[id].draw(ctx);
      }
    }
  }
};

/**
 * Redraw all edges
 * The 2d context of a HTML canvas can be retrieved by canvas.getContext('2d');
 * @param {CanvasRenderingContext2D}   ctx
 * @private
 */
Network.prototype._drawControlNodes = function(ctx) {
  var edges = this.edges;
  for (var id in edges) {
    if (edges.hasOwnProperty(id)) {
      edges[id]._drawControlNodes(ctx);
    }
  }
};

/**
 * Find a stable position for all nodes
 * @private
 */
Network.prototype._stabilize = function() {
  if (this.constants.freezeForStabilization == true) {
    this._freezeDefinedNodes();
  }

  // find stable position
  var count = 0;
  while (this.moving && count < this.constants.stabilizationIterations) {
    this._physicsTick();
    count++;
  }


  if (this.constants.zoomExtentOnStabilize == true) {
    this.zoomExtent({duration:0}, false, true);
  }

  if (this.constants.freezeForStabilization == true) {
    this._restoreFrozenNodes();
  }

  this.emit("stabilizationIterationsDone");
};

/**
 * When initializing and stabilizing, we can freeze nodes with a predefined position. This greatly speeds up stabilization
 * because only the supportnodes for the smoothCurves have to settle.
 *
 * @private
 */
Network.prototype._freezeDefinedNodes = function() {
  var nodes = this.nodes;
  for (var id in nodes) {
    if (nodes.hasOwnProperty(id)) {
      if (nodes[id].x != null && nodes[id].y != null) {
        nodes[id].fixedData.x = nodes[id].xFixed;
        nodes[id].fixedData.y = nodes[id].yFixed;
        nodes[id].xFixed = true;
        nodes[id].yFixed = true;
      }
    }
  }
};

/**
 * Unfreezes the nodes that have been frozen by _freezeDefinedNodes.
 *
 * @private
 */
Network.prototype._restoreFrozenNodes = function() {
  var nodes = this.nodes;
  for (var id in nodes) {
    if (nodes.hasOwnProperty(id)) {
      if (nodes[id].fixedData.x != null) {
        nodes[id].xFixed = nodes[id].fixedData.x;
        nodes[id].yFixed = nodes[id].fixedData.y;
      }
    }
  }
};


/**
 * Check if any of the nodes is still moving
 * @param {number} vmin   the minimum velocity considered as 'moving'
 * @return {boolean}      true if moving, false if non of the nodes is moving
 * @private
 */
Network.prototype._isMoving = function(vmin) {
  var nodes = this.nodes;
  for (var id in nodes) {
    if (nodes[id] !== undefined) {
      if (nodes[id].isMoving(vmin) == true) {
        return true;
      }
    }
  }
  return false;
};


/**
 * /**
 * Perform one discrete step for all nodes
 *
 * @private
 */
Network.prototype._discreteStepNodes = function() {
  var interval = this.physicsDiscreteStepsize;
  var nodes = this.nodes;
  var nodeId;
  var nodesPresent = false;

  if (this.constants.maxVelocity > 0) {
    for (nodeId in nodes) {
      if (nodes.hasOwnProperty(nodeId)) {
        nodes[nodeId].discreteStepLimited(interval, this.constants.maxVelocity);
        nodesPresent = true;
      }
    }
  }
  else {
    for (nodeId in nodes) {
      if (nodes.hasOwnProperty(nodeId)) {
        nodes[nodeId].discreteStep(interval);
        nodesPresent = true;
      }
    }
  }

  if (nodesPresent == true) {
    var vminCorrected = this.constants.minVelocity / Math.max(this.scale,0.05);
    if (vminCorrected > 0.5*this.constants.maxVelocity) {
      return true;
    }
    else {
      return this._isMoving(vminCorrected);
    }
  }
  return false;
};


Network.prototype._revertPhysicsState = function() {
  var nodes = this.nodes;
  for (var nodeId in nodes) {
    if (nodes.hasOwnProperty(nodeId)) {
      nodes[nodeId].revertPosition();
    }
  }
}

Network.prototype._revertPhysicsTick = function() {
  this._doInAllActiveSectors("_revertPhysicsState");
  if (this.constants.smoothCurves.enabled == true && this.constants.smoothCurves.dynamic == true) {
    this._doInSupportSector("_revertPhysicsState");
  }
}

/**
 * A single simulation step (or "tick") in the physics simulation
 *
 * @private
 */
Network.prototype._physicsTick = function() {
  if (!this.freezeSimulationEnabled) {
    if (this.moving == true) {
      var mainMovingStatus = false;
      var supportMovingStatus = false;

      this._doInAllActiveSectors("_initializeForceCalculation");
      var mainMoving = this._doInAllActiveSectors("_discreteStepNodes");
      if (this.constants.smoothCurves.enabled == true && this.constants.smoothCurves.dynamic == true) {
        supportMovingStatus = this._doInSupportSector("_discreteStepNodes");
      }

      // gather movement data from all sectors, if one moves, we are NOT stabilzied
      for (var i = 0; i < mainMoving.length; i++) {
        mainMovingStatus = mainMoving[i] || mainMovingStatus;
      }

      // determine if the network has stabilzied
      this.moving = mainMovingStatus || supportMovingStatus;
      if (this.moving == false) {
        this._revertPhysicsTick();
      }
      else {
        // this is here to ensure that there is no start event when the network is already stable.
        if (this.startedStabilization == false) {
          this.emit("startStabilization");
          this.startedStabilization = true;
        }
      }

      this.stabilizationIterations++;
    }
  }
};


/**
 * This function runs one step of the animation. It calls an x amount of physics ticks and one render tick.
 * It reschedules itself at the beginning of the function
 *
 * @private
 */
Network.prototype._animationStep = function() {
  // reset the timer so a new scheduled animation step can be set
  this.timer = undefined;

  if (this.requiresTimeout == true) {
    // this schedules a new animation step
    this.start();
  }

  // handle the keyboad movement
  this._handleNavigation();

  // check if the physics have settled
  if (this.moving == true) {
    var startTime = Date.now();
    this._physicsTick();
    var physicsTime = Date.now() - startTime;

    // run double speed if it is a little graph
    if ((this.renderTimestep - this.renderTime > 2 * physicsTime || this.runDoubleSpeed == true) && this.moving == true) {
      this._physicsTick();

      // this makes sure there is no jitter. The decision is taken once to run it at double speed.
      if (this.renderTime != 0) {
        this.runDoubleSpeed = true
      }
    }
  }

  var renderStartTime = Date.now();
  this._redraw();
  this.renderTime = Date.now() - renderStartTime;

  if (this.requiresTimeout == false) {
    // this schedules a new animation step
    this.start();
  }
};

if (typeof window !== 'undefined') {
  window.requestAnimationFrame = window.requestAnimationFrame || window.mozRequestAnimationFrame ||
                                 window.webkitRequestAnimationFrame || window.msRequestAnimationFrame;
}

/**
 * Schedule a animation step with the refreshrate interval.
 */
Network.prototype.start = function() {
  if (this.freezeSimulationEnabled == true) {
    this.moving = false;
  }
  if (this.moving == true || this.xIncrement != 0 || this.yIncrement != 0 || this.zoomIncrement != 0 || this.animating == true) {
    if (!this.timer) {
      if (this.requiresTimeout == true) {
        this.timer = window.setTimeout(this._animationStep.bind(this), this.renderTimestep); // wait this.renderTimeStep milliseconds and perform the animation step function
      }
      else {
        this.timer = window.requestAnimationFrame(this._animationStep.bind(this)); // wait this.renderTimeStep milliseconds and perform the animation step function
      }
    }
  }
  else {
    this._requestRedraw();
    // this check is to ensure that the network does not emit these events if it was already stabilized and setOptions is called (setting moving to true and calling start())
    if (this.stabilizationIterations > 1) {
      // trigger the "stabilized" event.
      // The event is triggered on the next tick, to prevent the case that
      // it is fired while initializing the Network, in which case you would not
      // be able to catch it
      var me = this;
      var params = {
        iterations: me.stabilizationIterations
      };
      this.stabilizationIterations = 0;
      this.startedStabilization = false;
      setTimeout(function () {
        me.emit("stabilized", params);
      }, 0);
    }
    else {
      this.stabilizationIterations = 0;
    }
  }
};


/**
 * Move the network according to the keyboard presses.
 *
 * @private
 */
Network.prototype._handleNavigation = function() {
  if (this.xIncrement != 0 || this.yIncrement != 0) {
    var translation = this._getTranslation();
    this._setTranslation(translation.x+this.xIncrement, translation.y+this.yIncrement);
  }
  if (this.zoomIncrement != 0) {
    var center = {
      x: this.frame.canvas.clientWidth / 2,
      y: this.frame.canvas.clientHeight / 2
    };
    this._zoom(this.scale*(1 + this.zoomIncrement), center);
  }
};


/**
 *  Freeze the _animationStep
 */
Network.prototype.freezeSimulation = function(freeze) {
  if (freeze == true) {
    this.freezeSimulationEnabled = true;
    this.moving = false;
  }
  else {
    this.freezeSimulationEnabled = false;
    this.moving = true;
    this.start();
  }
};


/**
 * This function cleans the support nodes if they are not needed and adds them when they are.
 *
 * @param {boolean} [disableStart]
 * @private
 */
Network.prototype._configureSmoothCurves = function(disableStart) {
  if (disableStart === undefined) {
    disableStart = true;
  }
  if (this.constants.smoothCurves.enabled == true && this.constants.smoothCurves.dynamic == true) {
    this._createBezierNodes();
    // cleanup unused support nodes
    for (var nodeId in this.sectors['support']['nodes']) {
      if (this.sectors['support']['nodes'].hasOwnProperty(nodeId)) {
        if (this.edges[this.sectors['support']['nodes'][nodeId].parentEdgeId] === undefined) {
          delete this.sectors['support']['nodes'][nodeId];
        }
      }
    }
  }
  else {
    // delete the support nodes
    this.sectors['support']['nodes'] = {};
    for (var edgeId in this.edges) {
      if (this.edges.hasOwnProperty(edgeId)) {
        this.edges[edgeId].via = null;
      }
    }
  }


  this._updateCalculationNodes();
  if (!disableStart) {
    this.moving = true;
    this.start();
  }
};


/**
 * Bezier curves require an anchor point to calculate the smooth flow. These points are nodes. These nodes are invisible but
 * are used for the force calculation.
 *
 * @private
 */
Network.prototype._createBezierNodes = function() {
  if (this.constants.smoothCurves.enabled == true && this.constants.smoothCurves.dynamic == true) {
    for (var edgeId in this.edges) {
      if (this.edges.hasOwnProperty(edgeId)) {
        var edge = this.edges[edgeId];
        if (edge.via == null) {
          var nodeId = "edgeId:".concat(edge.id);
          this.sectors['support']['nodes'][nodeId] = new Node(
                  {id:nodeId,
                    mass:1,
                    shape:'circle',
                    image:"",
                    internalMultiplier:1
                  },{},{},this.constants);
          edge.via = this.sectors['support']['nodes'][nodeId];
          edge.via.parentEdgeId = edge.id;
          edge.positionBezierNode();
        }
      }
    }
  }
};

/**
 * load the functions that load the mixins into the prototype.
 *
 * @private
 */
Network.prototype._initializeMixinLoaders = function () {
  for (var mixin in MixinLoader) {
    if (MixinLoader.hasOwnProperty(mixin)) {
      Network.prototype[mixin] = MixinLoader[mixin];
    }
  }
};

/**
 * Load the XY positions of the nodes into the dataset.
 */
Network.prototype.storePosition = function() {
  console.log("storePosition is depricated: use .storePositions() from now on.")
  this.storePositions();
};

/**
 * Load the XY positions of the nodes into the dataset.
 */
Network.prototype.storePositions = function() {
  var dataArray = [];
  for (var nodeId in this.nodes) {
    if (this.nodes.hasOwnProperty(nodeId)) {
      var node = this.nodes[nodeId];
      var allowedToMoveX = !this.nodes.xFixed;
      var allowedToMoveY = !this.nodes.yFixed;
      if (this.nodesData._data[nodeId].x != Math.round(node.x) || this.nodesData._data[nodeId].y != Math.round(node.y)) {
        dataArray.push({id:nodeId,x:Math.round(node.x),y:Math.round(node.y),allowedToMoveX:allowedToMoveX,allowedToMoveY:allowedToMoveY});
      }
    }
  }
  this.nodesData.update(dataArray);
};

/**
 * Return the positions of the nodes.
 */
Network.prototype.getPositions = function(ids) {
  var dataArray = {};
  if (ids !== undefined) {
    if (Array.isArray(ids) == true) {
      for (var i = 0; i < ids.length; i++) {
        if (this.nodes[ids[i]] !== undefined) {
          var node = this.nodes[ids[i]];
          dataArray[ids[i]] = {x: Math.round(node.x), y: Math.round(node.y)};
        }
      }
    }
    else {
      if (this.nodes[ids] !== undefined) {
        var node = this.nodes[ids];
        dataArray[ids] = {x: Math.round(node.x), y: Math.round(node.y)};
      }
    }
  }
  else {
    for (var nodeId in this.nodes) {
      if (this.nodes.hasOwnProperty(nodeId)) {
        var node = this.nodes[nodeId];
        dataArray[nodeId] = {x: Math.round(node.x), y: Math.round(node.y)};
      }
    }
  }
  return dataArray;
};



/**
 * Center a node in view.
 *
 * @param {Number} nodeId
 * @param {Number} [options]
 */
Network.prototype.focusOnNode = function (nodeId, options) {
  if (this.nodes.hasOwnProperty(nodeId)) {
    if (options === undefined) {
      options = {};
    }
    var nodePosition = {x: this.nodes[nodeId].x, y: this.nodes[nodeId].y};
    options.position = nodePosition;
    options.lockedOnNode = nodeId;

    this.moveTo(options)
  }
  else {
    console.log("This nodeId cannot be found.");
  }
};

/**
 *
 * @param {Object} options  |  options.offset   = {x:Number, y:Number}   // offset from the center in DOM pixels
 *                          |  options.scale    = Number                 // scale to move to
 *                          |  options.position = {x:Number, y:Number}   // position to move to
 *                          |  options.animation = {duration:Number, easingFunction:String} || Boolean   // position to move to
 */
Network.prototype.moveTo = function (options) {
  if (options === undefined) {
    options = {};
    return;
  }
  if (options.offset    === undefined)           {options.offset    = {x: 0, y: 0};          }
  if (options.offset.x  === undefined)           {options.offset.x  = 0;                     }
  if (options.offset.y  === undefined)           {options.offset.y  = 0;                     }
  if (options.scale     === undefined)           {options.scale     = this._getScale();      }
  if (options.position  === undefined)           {options.position  = this._getTranslation();}
  if (options.animation === undefined)           {options.animation = {duration:0};          }
  if (options.animation === false    )           {options.animation = {duration:0};          }
  if (options.animation === true     )           {options.animation = {};                    }
  if (options.animation.duration === undefined)  {options.animation.duration = 1000;         }  // default duration
  if (options.animation.easingFunction === undefined)  {options.animation.easingFunction = "easeInOutQuad";  } // default easing function

  this.animateView(options);
};

/**
 *
 * @param {Object} options  |  options.offset   = {x:Number, y:Number}   // offset from the center in DOM pixels
 *                          |  options.time     = Number                 // animation time in milliseconds
 *                          |  options.scale    = Number                 // scale to animate to
 *                          |  options.position = {x:Number, y:Number}   // position to animate to
 *                          |  options.easingFunction = String           // linear, easeInQuad, easeOutQuad, easeInOutQuad,
 *                                                                       // easeInCubic, easeOutCubic, easeInOutCubic,
 *                                                                       // easeInQuart, easeOutQuart, easeInOutQuart,
 *                                                                       // easeInQuint, easeOutQuint, easeInOutQuint
 */
Network.prototype.animateView = function (options) {
  if (options === undefined) {
    options = {};
    return;
  }

  // release if something focussed on the node
  this.releaseNode();
  if (options.locked == true) {
    this.lockedOnNodeId = options.lockedOnNode;
    this.lockedOnNodeOffset = options.offset;
  }

  // forcefully complete the old animation if it was still running
  if (this.easingTime != 0) {
    this._transitionRedraw(1); // by setting easingtime to 1, we finish the animation.
  }

  this.sourceScale = this._getScale();
  this.sourceTranslation = this._getTranslation();
  this.targetScale = options.scale;

  // set the scale so the viewCenter is based on the correct zoom level. This is overridden in the transitionRedraw
  // but at least then we'll have the target transition
  this._setScale(this.targetScale);
  var viewCenter = this.DOMtoCanvas({x: 0.5 * this.frame.canvas.clientWidth, y: 0.5 * this.frame.canvas.clientHeight});
  var distanceFromCenter = { // offset from view, distance view has to change by these x and y to center the node
    x: viewCenter.x - options.position.x,
    y: viewCenter.y - options.position.y
  };
  this.targetTranslation = {
    x: this.sourceTranslation.x + distanceFromCenter.x * this.targetScale + options.offset.x,
    y: this.sourceTranslation.y + distanceFromCenter.y * this.targetScale + options.offset.y
  };

  // if the time is set to 0, don't do an animation
  if (options.animation.duration == 0) {
    if (this.lockedOnNodeId != null) {
      this._classicRedraw = this._redraw;
      this._redraw = this._lockedRedraw;
    }
    else {
      this._setScale(this.targetScale);
      this._setTranslation(this.targetTranslation.x, this.targetTranslation.y);
      this._redraw();
    }
  }
  else {
    this.animating = true;
    this.animationSpeed = 1 / (this.renderRefreshRate * options.animation.duration * 0.001) || 1 / this.renderRefreshRate;
    this.animationEasingFunction = options.animation.easingFunction;
    this._classicRedraw = this._redraw;
    this._redraw = this._transitionRedraw;
    this._redraw();
    this.start();
  }
};

/**
 * used to animate smoothly by hijacking the redraw function.
 * @private
 */
Network.prototype._lockedRedraw = function () {
  var nodePosition = {x: this.nodes[this.lockedOnNodeId].x, y: this.nodes[this.lockedOnNodeId].y};
  var viewCenter = this.DOMtoCanvas({x: 0.5 * this.frame.canvas.clientWidth, y: 0.5 * this.frame.canvas.clientHeight});
  var distanceFromCenter = { // offset from view, distance view has to change by these x and y to center the node
    x: viewCenter.x - nodePosition.x,
    y: viewCenter.y - nodePosition.y
  };
  var sourceTranslation = this._getTranslation();
  var targetTranslation = {
    x: sourceTranslation.x + distanceFromCenter.x * this.scale + this.lockedOnNodeOffset.x,
    y: sourceTranslation.y + distanceFromCenter.y * this.scale + this.lockedOnNodeOffset.y
  };

  this._setTranslation(targetTranslation.x,targetTranslation.y);
  this._classicRedraw();
}

Network.prototype.releaseNode = function () {
  if (this.lockedOnNodeId != null) {
    this._redraw = this._classicRedraw;
    this.lockedOnNodeId = null;
    this.lockedOnNodeOffset = null;
  }
}

/**
 *
 * @param easingTime
 * @private
 */
Network.prototype._transitionRedraw = function (easingTime) {
  this.easingTime = easingTime || this.easingTime + this.animationSpeed;
  this.easingTime += this.animationSpeed;

  var progress = util.easingFunctions[this.animationEasingFunction](this.easingTime);

  this._setScale(this.sourceScale + (this.targetScale - this.sourceScale) * progress);
  this._setTranslation(
    this.sourceTranslation.x + (this.targetTranslation.x - this.sourceTranslation.x) * progress,
    this.sourceTranslation.y + (this.targetTranslation.y - this.sourceTranslation.y) * progress
  );

  this._classicRedraw();

  // cleanup
  if (this.easingTime >= 1.0) {
    this.animating = false;
    this.easingTime = 0;
    if (this.lockedOnNodeId != null) {
      this._redraw = this._lockedRedraw;
    }
    else {
      this._redraw = this._classicRedraw;
    }
    this.emit("animationFinished");
  }
};

Network.prototype._classicRedraw = function () {
  // placeholder function to be overloaded by animations;
};

/**
 * Returns true when the Network is active.
 * @returns {boolean}
 */
Network.prototype.isActive = function () {
  return !this.activator || this.activator.active;
};


/**
 * Sets the scale
 * @returns {Number}
 */
Network.prototype.setScale = function () {
  return this._setScale();
};


/**
 * Returns the scale
 * @returns {Number}
 */
Network.prototype.getScale = function () {
  return this._getScale();
};


/**
 * Returns the scale
 * @returns {Number}
 */
Network.prototype.getCenterCoordinates = function () {
  return this.DOMtoCanvas({x: 0.5 * this.frame.canvas.clientWidth, y: 0.5 * this.frame.canvas.clientHeight});
};


Network.prototype.getBoundingBox = function(nodeId) {
  if (this.nodes[nodeId] !== undefined) {
    return this.nodes[nodeId].boundingBox;
  }
}

Network.prototype.getConnectedNodes = function(nodeId) {
  var nodeList = [];
  if (this.nodes[nodeId] !== undefined) {
    var node = this.nodes[nodeId];
    var nodeObj = {nodeId : true}; // used to quickly check if node already exists
    for (var i = 0; i < node.edges.length; i++) {
      var edge = node.edges[i];
      if (edge.toId == nodeId) {
        if (nodeObj[edge.fromId] === undefined) {
          nodeList.push(edge.fromId);
          nodeObj[edge.fromId] = true;
        }
      }
      else if (edge.fromId == nodeId) {
        if (nodeObj[edge.toId] === undefined) {
          nodeList.push(edge.toId)
          nodeObj[edge.toId] = true;
        }
      }
    }
  }
  return nodeList;
}


Network.prototype.getEdgesFromNode = function(nodeId) {
  var edgesList = [];
  if (this.nodes[nodeId] !== undefined) {
    var node = this.nodes[nodeId];
    for (var i = 0; i < node.edges.length; i++) {
      edgesList.push(node.edges[i].id);
    }
  }
  return edgesList;
}

Network.prototype.generateColorObject = function(color) {
  return util.parseColor(color);

}

module.exports = Network;

},{"../DataSet":2,"../DataView":3,"../hammerUtil":5,"../module/hammer":6,"../shared/Activator":29,"../util":30,"./Edge":8,"./Groups":9,"./Images":10,"./Node":12,"./Popup":13,"./dotparser":14,"./gephiParser":15,"./locales":16,"./mixins/MixinLoader":20,"./shapes":28,"emitter-component":31,"keycharm":33}],12:[function(require,module,exports){
var util = require('../util');

/**
 * @class Node
 * A node. A node can be connected to other nodes via one or multiple edges.
 * @param {object} properties An object containing properties for the node. All
 *                            properties are optional, except for the id.
 *                              {number} id     Id of the node. Required
 *                              {string} label  Text label for the node
 *                              {number} x      Horizontal position of the node
 *                              {number} y      Vertical position of the node
 *                              {string} shape  Node shape, available:
 *                                              "database", "circle", "ellipse",
 *                                              "box", "image", "text", "dot",
 *                                              "star", "triangle", "triangleDown",
 *                                              "square", "icon"
 *                              {string} image  An image url
 *                              {string} title  An title text, can be HTML
 *                              {anytype} group A group name or number
 * @param {Network.Images} imagelist    A list with images. Only needed
 *                                            when the node has an image
 * @param {Network.Groups} grouplist    A list with groups. Needed for
 *                                            retrieving group properties
 * @param {Object}               constants    An object with default values for
 *                                            example for the color
 *
 */
function Node(properties, imagelist, grouplist, networkConstants) {
  var constants = util.selectiveBridgeObject(['nodes'],networkConstants);
  this.options = constants.nodes;

  this.selected = false;
  this.hover = false;

  this.edges = []; // all edges connected to this node
  this.dynamicEdges = [];
  this.reroutedEdges = {};

  // set defaults for the properties
  this.id = undefined;
  this.allowedToMoveX = false;
  this.allowedToMoveY = false;
  this.xFixed = false;
  this.yFixed = false;
  this.horizontalAlignLeft = true; // these are for the navigation controls
  this.verticalAlignTop    = true; // these are for the navigation controls
  this.baseRadiusValue = networkConstants.nodes.radius;
  this.radiusFixed = false;
  this.level = -1;
  this.preassignedLevel = false;
  this.hierarchyEnumerated = false;
  this.labelDimensions = {top:0, left:0, width:0, height:0, yLine:0}; // could be cached
  this.boundingBox = {top:0, left:0, right:0, bottom:0};

  this.imagelist = imagelist;
  this.grouplist = grouplist;

  // physics properties
  this.fx = 0.0;  // external force x
  this.fy = 0.0;  // external force y
  this.vx = 0.0;  // velocity x
  this.vy = 0.0;  // velocity y
  this.x = null;
  this.y = null;
  this.predefinedPosition = false; // used to check if initial zoomExtent should just take the range or approximate

  // used for reverting to previous position on stabilization
  this.previousState = {vx:0,vy:0,x:0,y:0};

  this.damping = networkConstants.physics.damping; // written every time gravity is calculated
  this.fixedData = {x:null,y:null};

  this.setProperties(properties, constants);

  // creating the variables for clustering
  this.resetCluster();
  this.clusterSession = 0;
  this.clusterSizeWidthFactor  = networkConstants.clustering.nodeScaling.width;
  this.clusterSizeHeightFactor = networkConstants.clustering.nodeScaling.height;
  this.clusterSizeRadiusFactor = networkConstants.clustering.nodeScaling.radius;
  this.maxNodeSizeIncrements   = networkConstants.clustering.maxNodeSizeIncrements;
  this.growthIndicator = 0;

  // variables to tell the node about the network.
  this.networkScaleInv = 1;
  this.networkScale = 1;
  this.canvasTopLeft = {"x": -300, "y": -300};
  this.canvasBottomRight = {"x":  300, "y":  300};
  this.parentEdgeId = null;
}


/**
 *  Revert the position and velocity of the previous step.
 */
Node.prototype.revertPosition = function() {
  this.x = this.previousState.x;
  this.y = this.previousState.y;
  this.vx = this.previousState.vx;
  this.vy = this.previousState.vy;
}


/**
 * (re)setting the clustering variables and objects
 */
Node.prototype.resetCluster = function() {
  // clustering variables
  this.formationScale = undefined; // this is used to determine when to open the cluster
  this.clusterSize = 1;            // this signifies the total amount of nodes in this cluster
  this.containedNodes = {};
  this.containedEdges = {};
  this.clusterSessions = [];
};

/**
 * Attach a edge to the node
 * @param {Edge} edge
 */
Node.prototype.attachEdge = function(edge) {
  if (this.edges.indexOf(edge) == -1) {
    this.edges.push(edge);
  }
  if (this.dynamicEdges.indexOf(edge) == -1) {
    this.dynamicEdges.push(edge);
  }
};

/**
 * Detach a edge from the node
 * @param {Edge} edge
 */
Node.prototype.detachEdge = function(edge) {
  var index = this.edges.indexOf(edge);
  if (index != -1) {
    this.edges.splice(index, 1);
  }
  index = this.dynamicEdges.indexOf(edge);
  if (index != -1) {
    this.dynamicEdges.splice(index, 1);
  }
};


/**
 * Set or overwrite properties for the node
 * @param {Object} properties an object with properties
 * @param {Object} constants  and object with default, global properties
 */
Node.prototype.setProperties = function(properties, constants) {
  if (!properties) {
    return;
  }

  var fields = ['borderWidth','borderWidthSelected','shape','image','brokenImage','radius','fontColor',
    'fontSize','fontFace','fontFill','fontStrokeWidth','fontStrokeColor','group','mass','fontDrawThreshold',
    'scaleFontWithValue','fontSizeMaxVisible','customScalingFunction','iconFontFace', 'icon', 'iconColor', 'iconSize'
  ];
  util.selectiveDeepExtend(fields, this.options, properties);

  // basic properties
  if (properties.id !== undefined)        {this.id = properties.id;}
  if (properties.label !== undefined)     {this.label = properties.label; this.originalLabel = properties.label;}
  if (properties.title !== undefined)     {this.title = properties.title;}
  if (properties.x !== undefined)         {this.x = properties.x; this.predefinedPosition = true;}
  if (properties.y !== undefined)         {this.y = properties.y; this.predefinedPosition = true;}
  if (properties.value !== undefined)     {this.value = properties.value;}
  if (properties.level !== undefined)     {this.level = properties.level; this.preassignedLevel = true;}

  // navigation controls properties
  if (properties.horizontalAlignLeft !== undefined) {this.horizontalAlignLeft = properties.horizontalAlignLeft;}
  if (properties.verticalAlignTop    !== undefined) {this.verticalAlignTop    = properties.verticalAlignTop;}
  if (properties.triggerFunction     !== undefined) {this.triggerFunction     = properties.triggerFunction;}

  if (this.id === undefined) {
    throw "Node must have an id";
  }

  // copy group properties
  if (typeof properties.group === 'number' || (typeof properties.group === 'string' && properties.group != '')) {
    var groupObj = this.grouplist.get(properties.group);
    util.deepExtend(this.options, groupObj);
    // the color object needs to be completely defined. Since groups can partially overwrite the colors, we parse it again, just in case.
    this.options.color = util.parseColor(this.options.color);
  }
  // individual shape properties
  if (properties.radius !== undefined)         {this.baseRadiusValue = this.options.radius;}
  if (properties.color !== undefined)          {this.options.color = util.parseColor(properties.color);}

  if (this.options.image !== undefined && this.options.image!= "") {
    if (this.imagelist) {
      this.imageObj = this.imagelist.load(this.options.image, this.options.brokenImage);
    }
    else {
      throw "No imagelist provided";
    }
  }

  if (properties.allowedToMoveX !== undefined) {
    this.xFixed = !properties.allowedToMoveX;
    this.allowedToMoveX = properties.allowedToMoveX;
  }
  else if (properties.x !== undefined && this.allowedToMoveX == false) {
    this.xFixed = true;
  }


  if (properties.allowedToMoveY !== undefined) {
    this.yFixed = !properties.allowedToMoveY;
    this.allowedToMoveY = properties.allowedToMoveY;
  }
  else if (properties.y !== undefined && this.allowedToMoveY == false) {
    this.yFixed = true;
  }

  this.radiusFixed = this.radiusFixed || (properties.radius !== undefined);

  if (this.options.shape === 'image' || this.options.shape === 'circularImage') {
    this.options.radiusMin = constants.nodes.widthMin;
    this.options.radiusMax = constants.nodes.widthMax;
  }

  // choose draw method depending on the shape
  switch (this.options.shape) {
    case 'database':      this.draw = this._drawDatabase; this.resize = this._resizeDatabase; break;
    case 'box':           this.draw = this._drawBox; this.resize = this._resizeBox; break;
    case 'circle':        this.draw = this._drawCircle; this.resize = this._resizeCircle; break;
    case 'ellipse':       this.draw = this._drawEllipse; this.resize = this._resizeEllipse; break;
    // TODO: add diamond shape
    case 'image':         this.draw = this._drawImage; this.resize = this._resizeImage; break;
    case 'circularImage': this.draw = this._drawCircularImage; this.resize = this._resizeCircularImage; break;
    case 'text':          this.draw = this._drawText; this.resize = this._resizeText; break;
    case 'dot':           this.draw = this._drawDot; this.resize = this._resizeShape; break;
    case 'square':        this.draw = this._drawSquare; this.resize = this._resizeShape; break;
    case 'triangle':      this.draw = this._drawTriangle; this.resize = this._resizeShape; break;
    case 'triangleDown':  this.draw = this._drawTriangleDown; this.resize = this._resizeShape; break;
    case 'star':          this.draw = this._drawStar; this.resize = this._resizeShape; break;
    case 'icon':          this.draw = this._drawIcon; this.resize = this._resizeIcon; break;
    default:              this.draw = this._drawEllipse; this.resize = this._resizeEllipse; break;
  }
  // reset the size of the node, this can be changed
  this._reset();

};

/**
 * select this node
 */
Node.prototype.select = function() {
  this.selected = true;
  this._reset();
};

/**
 * unselect this node
 */
Node.prototype.unselect = function() {
  this.selected = false;
  this._reset();
};


/**
 * Reset the calculated size of the node, forces it to recalculate its size
 */
Node.prototype.clearSizeCache = function() {
  this._reset();
};

/**
 * Reset the calculated size of the node, forces it to recalculate its size
 * @private
 */
Node.prototype._reset = function() {
  this.width = undefined;
  this.height = undefined;
};

/**
 * get the title of this node.
 * @return {string} title    The title of the node, or undefined when no title
 *                           has been set.
 */
Node.prototype.getTitle = function() {
  return typeof this.title === "function" ? this.title() : this.title;
};

/**
 * Calculate the distance to the border of the Node
 * @param {CanvasRenderingContext2D}   ctx
 * @param {Number} angle        Angle in radians
 * @returns {number} distance   Distance to the border in pixels
 */
Node.prototype.distanceToBorder = function (ctx, angle) {
  var borderWidth = 1;

  if (!this.width) {
    this.resize(ctx);
  }

  switch (this.options.shape) {
    case 'circle':
    case 'dot':
      return this.options.radius+ borderWidth;

    case 'ellipse':
      var a = this.width / 2;
      var b = this.height / 2;
      var w = (Math.sin(angle) * a);
      var h = (Math.cos(angle) * b);
      return a * b / Math.sqrt(w * w + h * h);

    // TODO: implement distanceToBorder for database
    // TODO: implement distanceToBorder for triangle
    // TODO: implement distanceToBorder for triangleDown

    case 'box':
    case 'image':
    case 'text':
    default:
      if (this.width) {
        return Math.min(
            Math.abs(this.width / 2 / Math.cos(angle)),
            Math.abs(this.height / 2 / Math.sin(angle))) + borderWidth;
        // TODO: reckon with border radius too in case of box
      }
      else {
        return 0;
      }

  }
  // TODO: implement calculation of distance to border for all shapes
};

/**
 * Set forces acting on the node
 * @param {number} fx   Force in horizontal direction
 * @param {number} fy   Force in vertical direction
 */
Node.prototype._setForce = function(fx, fy) {
  this.fx = fx;
  this.fy = fy;
};

/**
 * Add forces acting on the node
 * @param {number} fx   Force in horizontal direction
 * @param {number} fy   Force in vertical direction
 * @private
 */
Node.prototype._addForce = function(fx, fy) {
  this.fx += fx;
  this.fy += fy;
};

/**
 * Store the state before the next step
 */
Node.prototype.storeState = function() {
  this.previousState.x = this.x;
  this.previousState.y = this.y;
  this.previousState.vx = this.vx;
  this.previousState.vy = this.vy;
}

/**
 * Perform one discrete step for the node
 * @param {number} interval    Time interval in seconds
 */
Node.prototype.discreteStep = function(interval) {
  this.storeState();
  if (!this.xFixed) {
    var dx   = this.damping * this.vx;     // damping force
    var ax   = (this.fx - dx) / this.options.mass;  // acceleration
    this.vx += ax * interval;               // velocity
    this.x  += this.vx * interval;          // position
  }
  else {
    this.fx = 0;
    this.vx = 0;
  }

  if (!this.yFixed) {
    var dy   = this.damping * this.vy;     // damping force
    var ay   = (this.fy - dy) / this.options.mass;  // acceleration
    this.vy += ay * interval;               // velocity
    this.y  += this.vy * interval;          // position
  }
  else {
    this.fy = 0;
    this.vy = 0;
  }
};



/**
 * Perform one discrete step for the node
 * @param {number} interval    Time interval in seconds
 * @param {number} maxVelocity The speed limit imposed on the velocity
 */
Node.prototype.discreteStepLimited = function(interval, maxVelocity) {
  this.storeState();
  if (!this.xFixed) {
    var dx   = this.damping * this.vx;     // damping force
    var ax   = (this.fx - dx) / this.options.mass;  // acceleration
    this.vx += ax * interval;               // velocity
    this.vx = (Math.abs(this.vx) > maxVelocity) ? ((this.vx > 0) ? maxVelocity : -maxVelocity) : this.vx;
    this.x  += this.vx * interval;          // position
  }
  else {
    this.fx = 0;
    this.vx = 0;
  }

  if (!this.yFixed) {
    var dy   = this.damping * this.vy;     // damping force
    var ay   = (this.fy - dy) / this.options.mass;  // acceleration
    this.vy += ay * interval;               // velocity
    this.vy = (Math.abs(this.vy) > maxVelocity) ? ((this.vy > 0) ? maxVelocity : -maxVelocity) : this.vy;
    this.y  += this.vy * interval;          // position
  }
  else {
    this.fy = 0;
    this.vy = 0;
  }
};

/**
 * Check if this node has a fixed x and y position
 * @return {boolean}      true if fixed, false if not
 */
Node.prototype.isFixed = function() {
  return (this.xFixed && this.yFixed);
};

/**
 * Check if this node is moving
 * @param {number} vmin   the minimum velocity considered as "moving"
 * @return {boolean}      true if moving, false if it has no velocity
 */
Node.prototype.isMoving = function(vmin) {
  var velocity = Math.sqrt(Math.pow(this.vx,2) + Math.pow(this.vy,2));
//  this.velocity = Math.sqrt(Math.pow(this.vx,2) + Math.pow(this.vy,2))
  return (velocity > vmin);
};

/**
 * check if this node is selecte
 * @return {boolean} selected   True if node is selected, else false
 */
Node.prototype.isSelected = function() {
  return this.selected;
};

/**
 * Retrieve the value of the node. Can be undefined
 * @return {Number} value
 */
Node.prototype.getValue = function() {
  return this.value;
};

/**
 * Calculate the distance from the nodes location to the given location (x,y)
 * @param {Number} x
 * @param {Number} y
 * @return {Number} value
 */
Node.prototype.getDistance = function(x, y) {
  var dx = this.x - x,
      dy = this.y - y;
  return Math.sqrt(dx * dx + dy * dy);
};


/**
 * Adjust the value range of the node. The node will adjust it's radius
 * based on its value.
 * @param {Number} min
 * @param {Number} max
 */
Node.prototype.setValueRange = function(min, max, total) {
  if (!this.radiusFixed && this.value !== undefined) {
    var scale = this.options.customScalingFunction(min, max, total, this.value);
    var radiusDiff = this.options.radiusMax - this.options.radiusMin;
    if (this.options.scaleFontWithValue == true) {
      var fontDiff = this.options.fontSizeMax - this.options.fontSizeMin;
      this.options.fontSize = this.options.fontSizeMin + scale * fontDiff;
    }
    this.options.radius = this.options.radiusMin + scale * radiusDiff;
  }

  this.baseRadiusValue = this.options.radius;
};

/**
 * Draw this node in the given canvas
 * The 2d context of a HTML canvas can be retrieved by canvas.getContext("2d");
 * @param {CanvasRenderingContext2D}   ctx
 */
Node.prototype.draw = function(ctx) {
  throw "Draw method not initialized for node";
};

/**
 * Recalculate the size of this node in the given canvas
 * The 2d context of a HTML canvas can be retrieved by canvas.getContext("2d");
 * @param {CanvasRenderingContext2D}   ctx
 */
Node.prototype.resize = function(ctx) {
  throw "Resize method not initialized for node";
};

/**
 * Check if this object is overlapping with the provided object
 * @param {Object} obj   an object with parameters left, top, right, bottom
 * @return {boolean}     True if location is located on node
 */
Node.prototype.isOverlappingWith = function(obj) {
  return (this.left              < obj.right  &&
          this.left + this.width > obj.left   &&
          this.top               < obj.bottom &&
          this.top + this.height > obj.top);
};

Node.prototype._resizeImage = function (ctx) {
  // TODO: pre calculate the image size

  if (!this.width || !this.height) {  // undefined or 0
    var width, height;
    if (this.value) {
      this.options.radius= this.baseRadiusValue;
      var scale = this.imageObj.height / this.imageObj.width;
      if (scale !== undefined) {
        width = this.options.radius|| this.imageObj.width;
        height = this.options.radius* scale || this.imageObj.height;
      }
      else {
        width = 0;
        height = 0;
      }
    }
    else {
      width = this.imageObj.width;
      height = this.imageObj.height;
    }
    this.width  = width;
    this.height = height;

    this.growthIndicator = 0;
    if (this.width > 0 && this.height > 0) {
      this.width  += Math.min(this.clusterSize - 1, this.maxNodeSizeIncrements)  * this.clusterSizeWidthFactor;
      this.height += Math.min(this.clusterSize - 1, this.maxNodeSizeIncrements) * this.clusterSizeHeightFactor;
      this.options.radius+= Math.min(this.clusterSize - 1, this.maxNodeSizeIncrements) * this.clusterSizeRadiusFactor;
      this.growthIndicator = this.width - width;
    }
  }
};

Node.prototype._drawImageAtPosition = function (ctx) {
  if (this.imageObj.width != 0 ) {
    // draw the shade
    if (this.clusterSize > 1) {
      var lineWidth = ((this.clusterSize > 1) ? 10 : 0.0);
      lineWidth *= this.networkScaleInv;
      lineWidth = Math.min(0.2 * this.width,lineWidth);

      ctx.globalAlpha = 0.5;
      ctx.drawImage(this.imageObj, this.left - lineWidth, this.top - lineWidth, this.width + 2*lineWidth, this.height + 2*lineWidth);
    }

    // draw the image
    ctx.globalAlpha = 1.0;
    ctx.drawImage(this.imageObj, this.left, this.top, this.width, this.height);
  }
};

Node.prototype._drawImageLabel = function (ctx) {
  var yLabel;
  var offset = 0;
  
  if (this.height){
    offset = this.height / 2;
    var labelDimensions = this.getTextSize(ctx);
      
    if (labelDimensions.lineCount >= 1){
      offset += labelDimensions.height / 2;
      offset += 3;
    }
  }
  
  yLabel = this.y + offset;

  this._label(ctx, this.label, this.x, yLabel, undefined);
};

Node.prototype._drawImage = function (ctx) {
  this._resizeImage(ctx);
  this.left   = this.x - this.width / 2;
  this.top    = this.y - this.height / 2;

  this._drawImageAtPosition(ctx);

  this.boundingBox.top = this.top;
  this.boundingBox.left = this.left;
  this.boundingBox.right = this.left + this.width;
  this.boundingBox.bottom = this.top + this.height;

  this._drawImageLabel(ctx);
  this.boundingBox.left = Math.min(this.boundingBox.left, this.labelDimensions.left);
  this.boundingBox.right = Math.max(this.boundingBox.right, this.labelDimensions.left + this.labelDimensions.width);
  this.boundingBox.bottom = Math.max(this.boundingBox.bottom, this.boundingBox.bottom + this.labelDimensions.height);
};

Node.prototype._resizeCircularImage = function (ctx) {
  if(!this.imageObj.src || !this.imageObj.width || !this.imageObj.height){
    if (!this.width) {
      var diameter = this.options.radius * 2;
      this.width = diameter;
      this.height = diameter;

      // scaling used for clustering
      //this.width  += Math.min(this.clusterSize - 1, this.maxNodeSizeIncrements) * 0.5 * this.clusterSizeWidthFactor;
      //this.height += Math.min(this.clusterSize - 1, this.maxNodeSizeIncrements) * 0.5 * this.clusterSizeHeightFactor;
      this.options.radius += Math.min(this.clusterSize - 1, this.maxNodeSizeIncrements) * 0.5 * this.clusterSizeRadiusFactor;
      this.growthIndicator = this.options.radius- 0.5*diameter;
      this._swapToImageResizeWhenImageLoaded = true;
    }
  }
  else {
    if (this._swapToImageResizeWhenImageLoaded) {
      this.width = 0;
      this.height = 0;
      delete this._swapToImageResizeWhenImageLoaded;
    }
    this._resizeImage(ctx);
  }

};

Node.prototype._drawCircularImage = function (ctx) {
  this._resizeCircularImage(ctx);

  this.left   = this.x - this.width / 2;
  this.top    = this.y - this.height / 2;
  
  var centerX = this.left + (this.width / 2);
  var centerY = this.top + (this.height / 2);
  var radius = Math.abs(this.height / 2);

  this._drawRawCircle(ctx, centerX, centerY, radius);

  ctx.save();
  ctx.circle(this.x, this.y, radius);
  ctx.stroke();
  ctx.clip();

  this._drawImageAtPosition(ctx);

  ctx.restore();

  this.boundingBox.top = this.y - this.options.radius;
  this.boundingBox.left = this.x - this.options.radius;
  this.boundingBox.right = this.x + this.options.radius;
  this.boundingBox.bottom = this.y + this.options.radius;

  this._drawImageLabel(ctx); 
  
  this.boundingBox.left = Math.min(this.boundingBox.left, this.labelDimensions.left);
  this.boundingBox.right = Math.max(this.boundingBox.right, this.labelDimensions.left + this.labelDimensions.width);
  this.boundingBox.bottom = Math.max(this.boundingBox.bottom, this.boundingBox.bottom + this.labelDimensions.height);
};

Node.prototype._resizeBox = function (ctx) {
  if (!this.width) {
    var margin = 5;
    var textSize = this.getTextSize(ctx);
    this.width = textSize.width + 2 * margin;
    this.height = textSize.height + 2 * margin;

    this.width  += Math.min(this.clusterSize - 1, this.maxNodeSizeIncrements) * 0.5 * this.clusterSizeWidthFactor;
    this.height += Math.min(this.clusterSize - 1, this.maxNodeSizeIncrements) * 0.5 * this.clusterSizeHeightFactor;
    this.growthIndicator = this.width - (textSize.width + 2 * margin);
//    this.options.radius+= Math.min(this.clusterSize - 1, this.maxNodeSizeIncrements) * 0.5 * this.clusterSizeRadiusFactor;

  }
};

Node.prototype._drawBox = function (ctx) {
  this._resizeBox(ctx);

  this.left = this.x - this.width / 2;
  this.top = this.y - this.height / 2;

  var clusterLineWidth = 2.5;
  var borderWidth = this.options.borderWidth;
  var selectionLineWidth = this.options.borderWidthSelected || 2 * this.options.borderWidth;

  ctx.strokeStyle = this.selected ? this.options.color.highlight.border : this.hover ? this.options.color.hover.border : this.options.color.border;

  // draw the outer border
  if (this.clusterSize > 1) {
    ctx.lineWidth = (this.selected ? selectionLineWidth : borderWidth) + ((this.clusterSize > 1) ? clusterLineWidth : 0.0);
    ctx.lineWidth *= this.networkScaleInv;
    ctx.lineWidth = Math.min(this.width,ctx.lineWidth);

    ctx.roundRect(this.left-2*ctx.lineWidth, this.top-2*ctx.lineWidth, this.width+4*ctx.lineWidth, this.height+4*ctx.lineWidth, this.options.radius);
    ctx.stroke();
  }
  ctx.lineWidth = (this.selected ? selectionLineWidth : borderWidth) + ((this.clusterSize > 1) ? clusterLineWidth : 0.0);
  ctx.lineWidth *= this.networkScaleInv;
  ctx.lineWidth = Math.min(this.width,ctx.lineWidth);

  ctx.fillStyle = this.selected ? this.options.color.highlight.background : this.hover ? this.options.color.hover.background : this.options.color.background;

  ctx.roundRect(this.left, this.top, this.width, this.height, this.options.radius);
  ctx.fill();
  ctx.stroke();

  this.boundingBox.top = this.top;
  this.boundingBox.left = this.left;
  this.boundingBox.right = this.left + this.width;
  this.boundingBox.bottom = this.top + this.height;

  this._label(ctx, this.label, this.x, this.y);
};


Node.prototype._resizeDatabase = function (ctx) {
  if (!this.width) {
    var margin = 5;
    var textSize = this.getTextSize(ctx);
    var size = textSize.width + 2 * margin;
    this.width = size;
    this.height = size;

    // scaling used for clustering
    this.width  += Math.min(this.clusterSize - 1, this.maxNodeSizeIncrements) * this.clusterSizeWidthFactor;
    this.height += Math.min(this.clusterSize - 1, this.maxNodeSizeIncrements) * this.clusterSizeHeightFactor;
    this.options.radius+= Math.min(this.clusterSize - 1, this.maxNodeSizeIncrements) * this.clusterSizeRadiusFactor;
    this.growthIndicator = this.width - size;
  }
};

Node.prototype._drawDatabase = function (ctx) {
  this._resizeDatabase(ctx);
  this.left = this.x - this.width / 2;
  this.top = this.y - this.height / 2;

  var clusterLineWidth = 2.5;
  var borderWidth = this.options.borderWidth;
  var selectionLineWidth = this.options.borderWidthSelected || 2 * this.options.borderWidth;

  ctx.strokeStyle = this.selected ? this.options.color.highlight.border : this.hover ? this.options.color.hover.border : this.options.color.border;

  // draw the outer border
  if (this.clusterSize > 1) {
    ctx.lineWidth = (this.selected ? selectionLineWidth : borderWidth) + ((this.clusterSize > 1) ? clusterLineWidth : 0.0);
    ctx.lineWidth *= this.networkScaleInv;
    ctx.lineWidth = Math.min(this.width,ctx.lineWidth);

    ctx.database(this.x - this.width/2 - 2*ctx.lineWidth, this.y - this.height*0.5 - 2*ctx.lineWidth, this.width + 4*ctx.lineWidth, this.height + 4*ctx.lineWidth);
    ctx.stroke();
  }
  ctx.lineWidth = (this.selected ? selectionLineWidth : borderWidth) + ((this.clusterSize > 1) ? clusterLineWidth : 0.0);
  ctx.lineWidth *= this.networkScaleInv;
  ctx.lineWidth = Math.min(this.width,ctx.lineWidth);

  ctx.fillStyle = this.selected ? this.options.color.highlight.background : this.hover ? this.options.color.hover.background : this.options.color.background;
  ctx.database(this.x - this.width/2, this.y - this.height*0.5, this.width, this.height);
  ctx.fill();
  ctx.stroke();

  this.boundingBox.top = this.top;
  this.boundingBox.left = this.left;
  this.boundingBox.right = this.left + this.width;
  this.boundingBox.bottom = this.top + this.height;

  this._label(ctx, this.label, this.x, this.y);
};


Node.prototype._resizeCircle = function (ctx) {
  if (!this.width) {
    var margin = 5;
    var textSize = this.getTextSize(ctx);
    var diameter = Math.max(textSize.width, textSize.height) + 2 * margin;
    this.options.radius = diameter / 2;

    this.width = diameter;
    this.height = diameter;

    // scaling used for clustering
//    this.width  += Math.min(this.clusterSize - 1, this.maxNodeSizeIncrements) * 0.5 * this.clusterSizeWidthFactor;
//    this.height += Math.min(this.clusterSize - 1, this.maxNodeSizeIncrements) * 0.5 * this.clusterSizeHeightFactor;
    this.options.radius += Math.min(this.clusterSize - 1, this.maxNodeSizeIncrements) * 0.5 * this.clusterSizeRadiusFactor;
    this.growthIndicator = this.options.radius- 0.5*diameter;
  }
};

Node.prototype._drawRawCircle = function (ctx, x, y, radius) {
  var clusterLineWidth = 2.5;
  var borderWidth = this.options.borderWidth;
  var selectionLineWidth = this.options.borderWidthSelected || 2 * this.options.borderWidth;
    
  ctx.strokeStyle = this.selected ? this.options.color.highlight.border : this.hover ? this.options.color.hover.border : this.options.color.border;

  // draw the outer border
  if (this.clusterSize > 1) {
    ctx.lineWidth = (this.selected ? selectionLineWidth : borderWidth) + ((this.clusterSize > 1) ? clusterLineWidth : 0.0);
    ctx.lineWidth *= this.networkScaleInv;
    ctx.lineWidth = Math.min(this.width,ctx.lineWidth);

    ctx.circle(x, y, radius+2*ctx.lineWidth);
    ctx.stroke();
  }
  ctx.lineWidth = (this.selected ? selectionLineWidth : borderWidth) + ((this.clusterSize > 1) ? clusterLineWidth : 0.0);
  ctx.lineWidth *= this.networkScaleInv;
  ctx.lineWidth = Math.min(this.width,ctx.lineWidth);

  ctx.fillStyle = this.selected ? this.options.color.highlight.background : this.hover ? this.options.color.hover.background : this.options.color.background;
  ctx.circle(this.x, this.y, radius);
  ctx.fill();
  ctx.stroke();
};

Node.prototype._drawCircle = function (ctx) {
  this._resizeCircle(ctx);
  this.left = this.x - this.width / 2;
  this.top = this.y - this.height / 2;

  this._drawRawCircle(ctx, this.x, this.y, this.options.radius);

  this.boundingBox.top = this.y - this.options.radius;
  this.boundingBox.left = this.x - this.options.radius;
  this.boundingBox.right = this.x + this.options.radius;
  this.boundingBox.bottom = this.y + this.options.radius;

  this._label(ctx, this.label, this.x, this.y);
};

Node.prototype._resizeEllipse = function (ctx) {
  if (!this.width) {
    var textSize = this.getTextSize(ctx);

    this.width = textSize.width * 1.5;
    this.height = textSize.height * 2;
    if (this.width < this.height) {
      this.width = this.height;
    }
    var defaultSize = this.width;

    // scaling used for clustering
    this.width  += Math.min(this.clusterSize - 1, this.maxNodeSizeIncrements) * this.clusterSizeWidthFactor;
    this.height += Math.min(this.clusterSize - 1, this.maxNodeSizeIncrements) * this.clusterSizeHeightFactor;
    this.options.radius += Math.min(this.clusterSize - 1, this.maxNodeSizeIncrements) * this.clusterSizeRadiusFactor;
    this.growthIndicator = this.width - defaultSize;
  }
};

Node.prototype._drawEllipse = function (ctx) {
  this._resizeEllipse(ctx);
  this.left = this.x - this.width / 2;
  this.top = this.y - this.height / 2;

  var clusterLineWidth = 2.5;
  var borderWidth = this.options.borderWidth;
  var selectionLineWidth = this.options.borderWidthSelected || 2 * this.options.borderWidth;

  ctx.strokeStyle = this.selected ? this.options.color.highlight.border : this.hover ? this.options.color.hover.border : this.options.color.border;

  // draw the outer border
  if (this.clusterSize > 1) {
    ctx.lineWidth = (this.selected ? selectionLineWidth : borderWidth) + ((this.clusterSize > 1) ? clusterLineWidth : 0.0);
    ctx.lineWidth *= this.networkScaleInv;
    ctx.lineWidth = Math.min(this.width,ctx.lineWidth);

    ctx.ellipse(this.left-2*ctx.lineWidth, this.top-2*ctx.lineWidth, this.width+4*ctx.lineWidth, this.height+4*ctx.lineWidth);
    ctx.stroke();
  }
  ctx.lineWidth = (this.selected ? selectionLineWidth : borderWidth) + ((this.clusterSize > 1) ? clusterLineWidth : 0.0);
  ctx.lineWidth *= this.networkScaleInv;
  ctx.lineWidth = Math.min(this.width,ctx.lineWidth);

  ctx.fillStyle = this.selected ? this.options.color.highlight.background : this.hover ? this.options.color.hover.background : this.options.color.background;

  ctx.ellipse(this.left, this.top, this.width, this.height);
  ctx.fill();
  ctx.stroke();

  this.boundingBox.top = this.top;
  this.boundingBox.left = this.left;
  this.boundingBox.right = this.left + this.width;
  this.boundingBox.bottom = this.top + this.height;

  this._label(ctx, this.label, this.x, this.y);
};

Node.prototype._drawDot = function (ctx) {
  this._drawShape(ctx, 'circle');
};

Node.prototype._drawTriangle = function (ctx) {
  this._drawShape(ctx, 'triangle');
};

Node.prototype._drawTriangleDown = function (ctx) {
  this._drawShape(ctx, 'triangleDown');
};

Node.prototype._drawSquare = function (ctx) {
  this._drawShape(ctx, 'square');
};

Node.prototype._drawStar = function (ctx) {
  this._drawShape(ctx, 'star');
};

Node.prototype._resizeShape = function (ctx) {
  if (!this.width) {
    this.options.radius= this.baseRadiusValue;
    var size = 2 * this.options.radius;
    this.width = size;
    this.height = size;

    // scaling used for clustering
    this.width  += Math.min(this.clusterSize - 1, this.maxNodeSizeIncrements) * this.clusterSizeWidthFactor;
    this.height += Math.min(this.clusterSize - 1, this.maxNodeSizeIncrements) * this.clusterSizeHeightFactor;
    this.options.radius+= Math.min(this.clusterSize - 1, this.maxNodeSizeIncrements) * 0.5 * this.clusterSizeRadiusFactor;
    this.growthIndicator = this.width - size;
  }
};

Node.prototype._drawShape = function (ctx, shape) {
  this._resizeShape(ctx);

  this.left = this.x - this.width / 2;
  this.top = this.y - this.height / 2;

  var clusterLineWidth = 2.5;
  var borderWidth = this.options.borderWidth;
  var selectionLineWidth = this.options.borderWidthSelected || 2 * this.options.borderWidth;
  var radiusMultiplier = 2;

  // choose draw method depending on the shape
  switch (shape) {
    case 'dot':           radiusMultiplier = 2; break;
    case 'square':        radiusMultiplier = 2; break;
    case 'triangle':      radiusMultiplier = 3; break;
    case 'triangleDown':  radiusMultiplier = 3; break;
    case 'star':          radiusMultiplier = 4; break;
  }

  ctx.strokeStyle = this.selected ? this.options.color.highlight.border : this.hover ? this.options.color.hover.border : this.options.color.border;
  // draw the outer border
  if (this.clusterSize > 1) {
    ctx.lineWidth = (this.selected ? selectionLineWidth : borderWidth) + ((this.clusterSize > 1) ? clusterLineWidth : 0.0);
    ctx.lineWidth *= this.networkScaleInv;
    ctx.lineWidth = Math.min(this.width,ctx.lineWidth);

    ctx[shape](this.x, this.y, this.options.radius+ radiusMultiplier * ctx.lineWidth);
    ctx.stroke();
  }
  ctx.lineWidth = (this.selected ? selectionLineWidth : borderWidth) + ((this.clusterSize > 1) ? clusterLineWidth : 0.0);
  ctx.lineWidth *= this.networkScaleInv;
  ctx.lineWidth = Math.min(this.width,ctx.lineWidth);

  ctx.fillStyle = this.selected ? this.options.color.highlight.background : this.hover ? this.options.color.hover.background : this.options.color.background;
  ctx[shape](this.x, this.y, this.options.radius);
  ctx.fill();
  ctx.stroke();

  this.boundingBox.top = this.y - this.options.radius;
  this.boundingBox.left = this.x - this.options.radius;
  this.boundingBox.right = this.x + this.options.radius;
  this.boundingBox.bottom = this.y + this.options.radius;

  if (this.label) {
    this._label(ctx, this.label, this.x, this.y + this.height / 2, undefined, 'hanging',true);
    this.boundingBox.left = Math.min(this.boundingBox.left, this.labelDimensions.left);
    this.boundingBox.right = Math.max(this.boundingBox.right, this.labelDimensions.left + this.labelDimensions.width);
    this.boundingBox.bottom = Math.max(this.boundingBox.bottom, this.boundingBox.bottom + this.labelDimensions.height);
  }
};

Node.prototype._resizeText = function (ctx) {
  if (!this.width) {
    var margin = 5;
    var textSize = this.getTextSize(ctx);
    this.width = textSize.width + 2 * margin;
    this.height = textSize.height + 2 * margin;

    // scaling used for clustering
    this.width  += Math.min(this.clusterSize - 1, this.maxNodeSizeIncrements) * this.clusterSizeWidthFactor;
    this.height += Math.min(this.clusterSize - 1, this.maxNodeSizeIncrements) * this.clusterSizeHeightFactor;
    this.options.radius+= Math.min(this.clusterSize - 1, this.maxNodeSizeIncrements) * this.clusterSizeRadiusFactor;
    this.growthIndicator = this.width - (textSize.width + 2 * margin);
  }
};

Node.prototype._drawText = function (ctx) {
  this._resizeText(ctx);
  this.left = this.x - this.width / 2;
  this.top = this.y - this.height / 2;

  this._label(ctx, this.label, this.x, this.y);

  this.boundingBox.top = this.top;
  this.boundingBox.left = this.left;
  this.boundingBox.right = this.left + this.width;
  this.boundingBox.bottom = this.top + this.height;
};

Node.prototype._resizeIcon = function (ctx) {
  if (!this.width) {
    var margin = 5;
    var iconSize =
    {
      width: Number(this.options.iconSize),
      height: Number(this.options.iconSize)
    };
    this.width = iconSize.width + 2 * margin;
    this.height = iconSize.height + 2 * margin;

    // scaling used for clustering
    this.width += Math.min(this.clusterSize - 1, this.maxNodeSizeIncrements) * this.clusterSizeWidthFactor;
    this.height += Math.min(this.clusterSize - 1, this.maxNodeSizeIncrements) * this.clusterSizeHeightFactor;
    this.options.radius += Math.min(this.clusterSize - 1, this.maxNodeSizeIncrements) * this.clusterSizeRadiusFactor;
    this.growthIndicator = this.width - (iconSize.width + 2 * margin);
  }
};

Node.prototype._drawIcon = function (ctx) {
  this._resizeIcon(ctx);

  this.options.iconSize = this.options.iconSize || 50;

  this.left = this.x - this.width / 2;
  this.top = this.y - this.height / 2;
  this._icon(ctx);


  this.boundingBox.top = this.y - this.options.iconSize/2;
  this.boundingBox.left = this.x - this.options.iconSize/2;
  this.boundingBox.right = this.x + this.options.iconSize/2;
  this.boundingBox.bottom = this.y + this.options.iconSize/2;

  if (this.label) {
    var iconTextSpacing = 5;
    this._label(ctx, this.label, this.x, this.y + this.height / 2 + iconTextSpacing, 'top', true);

    this.boundingBox.left = Math.min(this.boundingBox.left, this.labelDimensions.left);
    this.boundingBox.right = Math.max(this.boundingBox.right, this.labelDimensions.left + this.labelDimensions.width);
    this.boundingBox.bottom = Math.max(this.boundingBox.bottom, this.boundingBox.bottom + this.labelDimensions.height);
  }
};

Node.prototype._icon = function (ctx) {
  var relativeIconSize = Number(this.options.iconSize) * this.networkScale;
  
  if (this.options.icon && relativeIconSize > this.options.fontDrawThreshold - 1) {

      var iconSize = Number(this.options.iconSize);

      ctx.font = (this.selected ? "bold " : "") + iconSize + "px " + this.options.iconFontFace;

      // draw icon
      ctx.fillStyle = this.options.iconColor || "black";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(this.options.icon, this.x, this.y);
  }
};
  
Node.prototype._label = function (ctx, text, x, y, align, baseline, labelUnderNode) {
  var relativeFontSize = Number(this.options.fontSize) * this.networkScale;
  if (text && relativeFontSize >= this.options.fontDrawThreshold - 1) {
    var fontSize = Number(this.options.fontSize);

    // this ensures that there will not be HUGE letters on screen by setting an upper limit on the visible text size (regardless of zoomLevel)
    if (relativeFontSize >= this.options.fontSizeMaxVisible) {
      fontSize = Number(this.options.fontSizeMaxVisible) * this.networkScaleInv;
    }

    // fade in when relative scale is between threshold and threshold - 1
    var fontColor = this.options.fontColor || "#000000";
    var strokecolor = this.options.fontStrokeColor;
    if (relativeFontSize <= this.options.fontDrawThreshold) {
      var opacity = Math.max(0,Math.min(1,1 - (this.options.fontDrawThreshold - relativeFontSize)));
      fontColor   = util.overrideOpacity(fontColor,   opacity);
      strokecolor = util.overrideOpacity(strokecolor, opacity);

    }

    ctx.font = (this.selected ? "bold " : "") + fontSize + "px " + this.options.fontFace;

    var lines = text.split('\n');
    var lineCount = lines.length;
    var yLine = y + (1 - lineCount) / 2 * fontSize;
    if (labelUnderNode == true) {
      yLine = y + (1 - lineCount) / (2 * fontSize);
    }

    // font fill from edges now for nodes!
    var width = ctx.measureText(lines[0]).width;
    for (var i = 1; i < lineCount; i++) {
      var lineWidth = ctx.measureText(lines[i]).width;
      width = lineWidth > width ? lineWidth : width;
    }
    var height = fontSize * lineCount;
    var left = x - width / 2;
    var top = y - height / 2;
    if (baseline == "hanging") {
      top += 0.5 * fontSize;
      top += 4;   // distance from node, required because we use hanging. Hanging has less difference between browsers
      yLine += 4; // distance from node
    }
    this.labelDimensions = {top:top,left:left,width:width,height:height,yLine:yLine};

    // create the fontfill background
    if (this.options.fontFill !== undefined && this.options.fontFill !== null && this.options.fontFill !== "none") {
      ctx.fillStyle = this.options.fontFill;
      ctx.fillRect(left, top, width, height);
    }

    // draw text
    ctx.fillStyle = fontColor;
    ctx.textAlign = align || "center";
    ctx.textBaseline = baseline || "middle";
    if (this.options.fontStrokeWidth > 0){
      ctx.lineWidth   = this.options.fontStrokeWidth;
      ctx.strokeStyle = strokecolor;
      ctx.lineJoin    = 'round';
    }
    for (var i = 0; i < lineCount; i++) {
      if(this.options.fontStrokeWidth){
        ctx.strokeText(lines[i], x, yLine);
      }
      ctx.fillText(lines[i], x, yLine);
      yLine += fontSize;
    }
  }
};


Node.prototype.getTextSize = function(ctx) {
  if (this.label !== undefined) {
    var fontSize = Number(this.options.fontSize);
    if (fontSize * this.networkScale > this.options.fontSizeMaxVisible) {
      fontSize = Number(this.options.fontSizeMaxVisible) * this.networkScaleInv;
    }
    ctx.font = (this.selected ? "bold " : "") + fontSize + "px " + this.options.fontFace;

    var lines = this.label.split('\n'),
        height = (fontSize + 4) * lines.length,
        width = 0;

    for (var i = 0, iMax = lines.length; i < iMax; i++) {
      width = Math.max(width, ctx.measureText(lines[i]).width);
    }

    return {"width": width, "height": height, lineCount: lines.length};
  }
  else {
    return {"width": 0, "height": 0, lineCount: 0};
  }
};

/**
 * this is used to determine if a node is visible at all. this is used to determine when it needs to be drawn.
 * there is a safety margin of 0.3 * width;
 *
 * @returns {boolean}
 */
Node.prototype.inArea = function() {
  if (this.width !== undefined) {
  return (this.x + this.width *this.networkScaleInv  >= this.canvasTopLeft.x     &&
          this.x - this.width *this.networkScaleInv  <  this.canvasBottomRight.x &&
          this.y + this.height*this.networkScaleInv  >= this.canvasTopLeft.y     &&
          this.y - this.height*this.networkScaleInv  <  this.canvasBottomRight.y);
  }
  else {
    return true;
  }
};

/**
 * checks if the core of the node is in the display area, this is used for opening clusters around zoom
 * @returns {boolean}
 */
Node.prototype.inView = function() {
  return (this.x >= this.canvasTopLeft.x    &&
          this.x < this.canvasBottomRight.x &&
          this.y >= this.canvasTopLeft.y    &&
          this.y < this.canvasBottomRight.y);
};

/**
 * This allows the zoom level of the network to influence the rendering
 * We store the inverted scale and the coordinates of the top left, and bottom right points of the canvas
 *
 * @param scale
 * @param canvasTopLeft
 * @param canvasBottomRight
 */
Node.prototype.setScaleAndPos = function(scale,canvasTopLeft,canvasBottomRight) {
  this.networkScaleInv = 1.0/scale;
  this.networkScale = scale;
  this.canvasTopLeft = canvasTopLeft;
  this.canvasBottomRight = canvasBottomRight;
};


/**
 * This allows the zoom level of the network to influence the rendering
 *
 * @param scale
 */
Node.prototype.setScale = function(scale) {
  this.networkScaleInv = 1.0/scale;
  this.networkScale = scale;
};



/**
 * set the velocity at 0. Is called when this node is contained in another during clustering
 */
Node.prototype.clearVelocity = function() {
  this.vx = 0;
  this.vy = 0;
};


/**
 * Basic preservation of (kinectic) energy
 *
 * @param massBeforeClustering
 */
Node.prototype.updateVelocity = function(massBeforeClustering) {
  var energyBefore = this.vx * this.vx * massBeforeClustering;
  //this.vx = (this.vx < 0) ? -Math.sqrt(energyBefore/this.options.mass) : Math.sqrt(energyBefore/this.options.mass);
  this.vx = Math.sqrt(energyBefore/this.options.mass);
  energyBefore = this.vy * this.vy * massBeforeClustering;
  //this.vy = (this.vy < 0) ? -Math.sqrt(energyBefore/this.options.mass) : Math.sqrt(energyBefore/this.options.mass);
  this.vy = Math.sqrt(energyBefore/this.options.mass);
};

module.exports = Node;

},{"../util":30}],13:[function(require,module,exports){
/**
 * Popup is a class to create a popup window with some text
 * @param {Element}  container     The container object.
 * @param {Number} [x]
 * @param {Number} [y]
 * @param {String} [text]
 * @param {Object} [style]     An object containing borderColor,
 *                             backgroundColor, etc.
 */
function Popup(container, x, y, text, style) {
  if (container) {
    this.container = container;
  }
  else {
    this.container = document.body;
  }

  // x, y and text are optional, see if a style object was passed in their place
  if (style === undefined) {
    if (typeof x === "object") {
      style = x;
      x = undefined;
    } else if (typeof text === "object") {
      style = text;
      text = undefined;
    } else {
      // for backwards compatibility, in case clients other than Network are creating Popup directly
      style = {
        fontColor: 'black',
        fontSize: 14, // px
        fontFace: 'verdana',
        color: {
          border: '#666',
          background: '#FFFFC6'
        }
      }
    }
  }

  this.x = 0;
  this.y = 0;
  this.padding = 5;
  this.hidden = false;

  if (x !== undefined && y !== undefined) {
    this.setPosition(x, y);
  }
  if (text !== undefined) {
    this.setText(text);
  }

  // create the frame
  this.frame = document.createElement('div');
  this.frame.className = 'network-tooltip';
  this.frame.style.color           = style.fontColor;
  this.frame.style.backgroundColor = style.color.background;
  this.frame.style.borderColor     = style.color.border;
  this.frame.style.fontSize        = style.fontSize + 'px';
  this.frame.style.fontFamily      = style.fontFace;
  this.container.appendChild(this.frame);
}

/**
 * @param {number} x   Horizontal position of the popup window
 * @param {number} y   Vertical position of the popup window
 */
Popup.prototype.setPosition = function(x, y) {
  this.x = parseInt(x);
  this.y = parseInt(y);
};

/**
 * Set the content for the popup window. This can be HTML code or text.
 * @param {string | Element} content
 */
Popup.prototype.setText = function(content) {
  if (content instanceof Element) {
    this.frame.innerHTML = '';
    this.frame.appendChild(content);
  }
  else {
    this.frame.innerHTML = content; // string containing text or HTML
  }
};

/**
 * Show the popup window
 * @param {boolean} show    Optional. Show or hide the window
 */
Popup.prototype.show = function (show) {
  if (show === undefined) {
    show = true;
  }

  if (show) {
    var height = this.frame.clientHeight;
    var width =  this.frame.clientWidth;
    var maxHeight = this.frame.parentNode.clientHeight;
    var maxWidth = this.frame.parentNode.clientWidth;

    var top = (this.y - height);
    if (top + height + this.padding > maxHeight) {
      top = maxHeight - height - this.padding;
    }
    if (top < this.padding) {
      top = this.padding;
    }

    var left = this.x;
    if (left + width + this.padding > maxWidth) {
      left = maxWidth - width - this.padding;
    }
    if (left < this.padding) {
      left = this.padding;
    }

    this.frame.style.left = left + "px";
    this.frame.style.top = top + "px";
    this.frame.style.visibility = "visible";
    this.hidden = false;
  }
  else {
    this.hide();
  }
};

/**
 * Hide the popup window
 */
Popup.prototype.hide = function () {
  this.hidden = true;
  this.frame.style.visibility = "hidden";
};

module.exports = Popup;

},{}],14:[function(require,module,exports){
/**
 * Parse a text source containing data in DOT language into a JSON object.
 * The object contains two lists: one with nodes and one with edges.
 *
 * DOT language reference: http://www.graphviz.org/doc/info/lang.html
 *
 * @param {String} data     Text containing a graph in DOT-notation
 * @return {Object} graph   An object containing two parameters:
 *                          {Object[]} nodes
 *                          {Object[]} edges
 */
function parseDOT (data) {
  dot = data;
  return parseGraph();
}

// token types enumeration
var TOKENTYPE = {
  NULL : 0,
  DELIMITER : 1,
  IDENTIFIER: 2,
  UNKNOWN : 3
};

// map with all delimiters
var DELIMITERS = {
  '{': true,
  '}': true,
  '[': true,
  ']': true,
  ';': true,
  '=': true,
  ',': true,

  '->': true,
  '--': true
};

var dot = '';                   // current dot file
var index = 0;                  // current index in dot file
var c = '';                     // current token character in expr
var token = '';                 // current token
var tokenType = TOKENTYPE.NULL; // type of the token

/**
 * Get the first character from the dot file.
 * The character is stored into the char c. If the end of the dot file is
 * reached, the function puts an empty string in c.
 */
function first() {
  index = 0;
  c = dot.charAt(0);
}

/**
 * Get the next character from the dot file.
 * The character is stored into the char c. If the end of the dot file is
 * reached, the function puts an empty string in c.
 */
function next() {
  index++;
  c = dot.charAt(index);
}

/**
 * Preview the next character from the dot file.
 * @return {String} cNext
 */
function nextPreview() {
  return dot.charAt(index + 1);
}

/**
 * Test whether given character is alphabetic or numeric
 * @param {String} c
 * @return {Boolean} isAlphaNumeric
 */
var regexAlphaNumeric = /[a-zA-Z_0-9.:#]/;
function isAlphaNumeric(c) {
  return regexAlphaNumeric.test(c);
}

/**
 * Merge all properties of object b into object b
 * @param {Object} a
 * @param {Object} b
 * @return {Object} a
 */
function merge (a, b) {
  if (!a) {
    a = {};
  }

  if (b) {
    for (var name in b) {
      if (b.hasOwnProperty(name)) {
        a[name] = b[name];
      }
    }
  }
  return a;
}

/**
 * Set a value in an object, where the provided parameter name can be a
 * path with nested parameters. For example:
 *
 *     var obj = {a: 2};
 *     setValue(obj, 'b.c', 3);     // obj = {a: 2, b: {c: 3}}
 *
 * @param {Object} obj
 * @param {String} path  A parameter name or dot-separated parameter path,
 *                      like "color.highlight.border".
 * @param {*} value
 */
function setValue(obj, path, value) {
  var keys = path.split('.');
  var o = obj;
  while (keys.length) {
    var key = keys.shift();
    if (keys.length) {
      // this isn't the end point
      if (!o[key]) {
        o[key] = {};
      }
      o = o[key];
    }
    else {
      // this is the end point
      o[key] = value;
    }
  }
}

/**
 * Add a node to a graph object. If there is already a node with
 * the same id, their attributes will be merged.
 * @param {Object} graph
 * @param {Object} node
 */
function addNode(graph, node) {
  var i, len;
  var current = null;

  // find root graph (in case of subgraph)
  var graphs = [graph]; // list with all graphs from current graph to root graph
  var root = graph;
  while (root.parent) {
    graphs.push(root.parent);
    root = root.parent;
  }

  // find existing node (at root level) by its id
  if (root.nodes) {
    for (i = 0, len = root.nodes.length; i < len; i++) {
      if (node.id === root.nodes[i].id) {
        current = root.nodes[i];
        break;
      }
    }
  }

  if (!current) {
    // this is a new node
    current = {
      id: node.id
    };
    if (graph.node) {
      // clone default attributes
      current.attr = merge(current.attr, graph.node);
    }
  }

  // add node to this (sub)graph and all its parent graphs
  for (i = graphs.length - 1; i >= 0; i--) {
    var g = graphs[i];

    if (!g.nodes) {
      g.nodes = [];
    }
    if (g.nodes.indexOf(current) == -1) {
      g.nodes.push(current);
    }
  }

  // merge attributes
  if (node.attr) {
    current.attr = merge(current.attr, node.attr);
  }
}

/**
 * Add an edge to a graph object
 * @param {Object} graph
 * @param {Object} edge
 */
function addEdge(graph, edge) {
  if (!graph.edges) {
    graph.edges = [];
  }
  graph.edges.push(edge);
  if (graph.edge) {
    var attr = merge({}, graph.edge);     // clone default attributes
    edge.attr = merge(attr, edge.attr); // merge attributes
  }
}

/**
 * Create an edge to a graph object
 * @param {Object} graph
 * @param {String | Number | Object} from
 * @param {String | Number | Object} to
 * @param {String} type
 * @param {Object | null} attr
 * @return {Object} edge
 */
function createEdge(graph, from, to, type, attr) {
  var edge = {
    from: from,
    to: to,
    type: type
  };

  if (graph.edge) {
    edge.attr = merge({}, graph.edge);  // clone default attributes
  }
  edge.attr = merge(edge.attr || {}, attr); // merge attributes

  return edge;
}

/**
 * Get next token in the current dot file.
 * The token and token type are available as token and tokenType
 */
function getToken() {
  tokenType = TOKENTYPE.NULL;
  token = '';

  // skip over whitespaces
  while (c == ' ' || c == '\t' || c == '\n' || c == '\r') {  // space, tab, enter
    next();
  }

  do {
    var isComment = false;

    // skip comment
    if (c == '#') {
      // find the previous non-space character
      var i = index - 1;
      while (dot.charAt(i) == ' ' || dot.charAt(i) == '\t') {
        i--;
      }
      if (dot.charAt(i) == '\n' || dot.charAt(i) == '') {
        // the # is at the start of a line, this is indeed a line comment
        while (c != '' && c != '\n') {
          next();
        }
        isComment = true;
      }
    }
    if (c == '/' && nextPreview() == '/') {
      // skip line comment
      while (c != '' && c != '\n') {
        next();
      }
      isComment = true;
    }
    if (c == '/' && nextPreview() == '*') {
      // skip block comment
      while (c != '') {
        if (c == '*' && nextPreview() == '/') {
          // end of block comment found. skip these last two characters
          next();
          next();
          break;
        }
        else {
          next();
        }
      }
      isComment = true;
    }

    // skip over whitespaces
    while (c == ' ' || c == '\t' || c == '\n' || c == '\r') {  // space, tab, enter
      next();
    }
  }
  while (isComment);

  // check for end of dot file
  if (c == '') {
    // token is still empty
    tokenType = TOKENTYPE.DELIMITER;
    return;
  }

  // check for delimiters consisting of 2 characters
  var c2 = c + nextPreview();
  if (DELIMITERS[c2]) {
    tokenType = TOKENTYPE.DELIMITER;
    token = c2;
    next();
    next();
    return;
  }

  // check for delimiters consisting of 1 character
  if (DELIMITERS[c]) {
    tokenType = TOKENTYPE.DELIMITER;
    token = c;
    next();
    return;
  }

  // check for an identifier (number or string)
  // TODO: more precise parsing of numbers/strings (and the port separator ':')
  if (isAlphaNumeric(c) || c == '-') {
    token += c;
    next();

    while (isAlphaNumeric(c)) {
      token += c;
      next();
    }
    if (token == 'false') {
      token = false;   // convert to boolean
    }
    else if (token == 'true') {
      token = true;   // convert to boolean
    }
    else if (!isNaN(Number(token))) {
      token = Number(token); // convert to number
    }
    tokenType = TOKENTYPE.IDENTIFIER;
    return;
  }

  // check for a string enclosed by double quotes
  if (c == '"') {
    next();
    while (c != '' && (c != '"' || (c == '"' && nextPreview() == '"'))) {
      token += c;
      if (c == '"') { // skip the escape character
        next();
      }
      next();
    }
    if (c != '"') {
      throw newSyntaxError('End of string " expected');
    }
    next();
    tokenType = TOKENTYPE.IDENTIFIER;
    return;
  }

  // something unknown is found, wrong characters, a syntax error
  tokenType = TOKENTYPE.UNKNOWN;
  while (c != '') {
    token += c;
    next();
  }
  throw new SyntaxError('Syntax error in part "' + chop(token, 30) + '"');
}

/**
 * Parse a graph.
 * @returns {Object} graph
 */
function parseGraph() {
  var graph = {};

  first();
  getToken();

  // optional strict keyword
  if (token == 'strict') {
    graph.strict = true;
    getToken();
  }

  // graph or digraph keyword
  if (token == 'graph' || token == 'digraph') {
    graph.type = token;
    getToken();
  }

  // optional graph id
  if (tokenType == TOKENTYPE.IDENTIFIER) {
    graph.id = token;
    getToken();
  }

  // open angle bracket
  if (token != '{') {
    throw newSyntaxError('Angle bracket { expected');
  }
  getToken();

  // statements
  parseStatements(graph);

  // close angle bracket
  if (token != '}') {
    throw newSyntaxError('Angle bracket } expected');
  }
  getToken();

  // end of file
  if (token !== '') {
    throw newSyntaxError('End of file expected');
  }
  getToken();

  // remove temporary default properties
  delete graph.node;
  delete graph.edge;
  delete graph.graph;

  return graph;
}

/**
 * Parse a list with statements.
 * @param {Object} graph
 */
function parseStatements (graph) {
  while (token !== '' && token != '}') {
    parseStatement(graph);
    if (token == ';') {
      getToken();
    }
  }
}

/**
 * Parse a single statement. Can be a an attribute statement, node
 * statement, a series of node statements and edge statements, or a
 * parameter.
 * @param {Object} graph
 */
function parseStatement(graph) {
  // parse subgraph
  var subgraph = parseSubgraph(graph);
  if (subgraph) {
    // edge statements
    parseEdge(graph, subgraph);

    return;
  }

  // parse an attribute statement
  var attr = parseAttributeStatement(graph);
  if (attr) {
    return;
  }

  // parse node
  if (tokenType != TOKENTYPE.IDENTIFIER) {
    throw newSyntaxError('Identifier expected');
  }
  var id = token; // id can be a string or a number
  getToken();

  if (token == '=') {
    // id statement
    getToken();
    if (tokenType != TOKENTYPE.IDENTIFIER) {
      throw newSyntaxError('Identifier expected');
    }
    graph[id] = token;
    getToken();
    // TODO: implement comma separated list with "a_list: ID=ID [','] [a_list] "
  }
  else {
    parseNodeStatement(graph, id);
  }
}

/**
 * Parse a subgraph
 * @param {Object} graph    parent graph object
 * @return {Object | null} subgraph
 */
function parseSubgraph (graph) {
  var subgraph = null;

  // optional subgraph keyword
  if (token == 'subgraph') {
    subgraph = {};
    subgraph.type = 'subgraph';
    getToken();

    // optional graph id
    if (tokenType == TOKENTYPE.IDENTIFIER) {
      subgraph.id = token;
      getToken();
    }
  }

  // open angle bracket
  if (token == '{') {
    getToken();

    if (!subgraph) {
      subgraph = {};
    }
    subgraph.parent = graph;
    subgraph.node = graph.node;
    subgraph.edge = graph.edge;
    subgraph.graph = graph.graph;

    // statements
    parseStatements(subgraph);

    // close angle bracket
    if (token != '}') {
      throw newSyntaxError('Angle bracket } expected');
    }
    getToken();

    // remove temporary default properties
    delete subgraph.node;
    delete subgraph.edge;
    delete subgraph.graph;
    delete subgraph.parent;

    // register at the parent graph
    if (!graph.subgraphs) {
      graph.subgraphs = [];
    }
    graph.subgraphs.push(subgraph);
  }

  return subgraph;
}

/**
 * parse an attribute statement like "node [shape=circle fontSize=16]".
 * Available keywords are 'node', 'edge', 'graph'.
 * The previous list with default attributes will be replaced
 * @param {Object} graph
 * @returns {String | null} keyword Returns the name of the parsed attribute
 *                                  (node, edge, graph), or null if nothing
 *                                  is parsed.
 */
function parseAttributeStatement (graph) {
  // attribute statements
  if (token == 'node') {
    getToken();

    // node attributes
    graph.node = parseAttributeList();
    return 'node';
  }
  else if (token == 'edge') {
    getToken();

    // edge attributes
    graph.edge = parseAttributeList();
    return 'edge';
  }
  else if (token == 'graph') {
    getToken();

    // graph attributes
    graph.graph = parseAttributeList();
    return 'graph';
  }

  return null;
}

/**
 * parse a node statement
 * @param {Object} graph
 * @param {String | Number} id
 */
function parseNodeStatement(graph, id) {
  // node statement
  var node = {
    id: id
  };
  var attr = parseAttributeList();
  if (attr) {
    node.attr = attr;
  }
  addNode(graph, node);

  // edge statements
  parseEdge(graph, id);
}

/**
 * Parse an edge or a series of edges
 * @param {Object} graph
 * @param {String | Number} from        Id of the from node
 */
function parseEdge(graph, from) {
  while (token == '->' || token == '--') {
    var to;
    var type = token;
    getToken();

    var subgraph = parseSubgraph(graph);
    if (subgraph) {
      to = subgraph;
    }
    else {
      if (tokenType != TOKENTYPE.IDENTIFIER) {
        throw newSyntaxError('Identifier or subgraph expected');
      }
      to = token;
      addNode(graph, {
        id: to
      });
      getToken();
    }

    // parse edge attributes
    var attr = parseAttributeList();

    // create edge
    var edge = createEdge(graph, from, to, type, attr);
    addEdge(graph, edge);

    from = to;
  }
}

/**
 * Parse a set with attributes,
 * for example [label="1.000", shape=solid]
 * @return {Object | null} attr
 */
function parseAttributeList() {
  var attr = null;

  while (token == '[') {
    getToken();
    attr = {};
    while (token !== '' && token != ']') {
      if (tokenType != TOKENTYPE.IDENTIFIER) {
        throw newSyntaxError('Attribute name expected');
      }
      var name = token;

      getToken();
      if (token != '=') {
        throw newSyntaxError('Equal sign = expected');
      }
      getToken();

      if (tokenType != TOKENTYPE.IDENTIFIER) {
        throw newSyntaxError('Attribute value expected');
      }
      var value = token;
      setValue(attr, name, value); // name can be a path

      getToken();
      if (token ==',') {
        getToken();
      }
    }

    if (token != ']') {
      throw newSyntaxError('Bracket ] expected');
    }
    getToken();
  }

  return attr;
}

/**
 * Create a syntax error with extra information on current token and index.
 * @param {String} message
 * @returns {SyntaxError} err
 */
function newSyntaxError(message) {
  return new SyntaxError(message + ', got "' + chop(token, 30) + '" (char ' + index + ')');
}

/**
 * Chop off text after a maximum length
 * @param {String} text
 * @param {Number} maxLength
 * @returns {String}
 */
function chop (text, maxLength) {
  return (text.length <= maxLength) ? text : (text.substr(0, 27) + '...');
}

/**
 * Execute a function fn for each pair of elements in two arrays
 * @param {Array | *} array1
 * @param {Array | *} array2
 * @param {function} fn
 */
function forEach2(array1, array2, fn) {
  if (Array.isArray(array1)) {
    array1.forEach(function (elem1) {
      if (Array.isArray(array2)) {
        array2.forEach(function (elem2)  {
          fn(elem1, elem2);
        });
      }
      else {
        fn(elem1, array2);
      }
    });
  }
  else {
    if (Array.isArray(array2)) {
      array2.forEach(function (elem2)  {
        fn(array1, elem2);
      });
    }
    else {
      fn(array1, array2);
    }
  }
}

/**
 * Convert a string containing a graph in DOT language into a map containing
 * with nodes and edges in the format of graph.
 * @param {String} data         Text containing a graph in DOT-notation
 * @return {Object} graphData
 */
function DOTToGraph (data) {
  // parse the DOT file
  var dotData = parseDOT(data);
  var graphData = {
    nodes: [],
    edges: [],
    options: {}
  };

  // copy the nodes
  if (dotData.nodes) {
    dotData.nodes.forEach(function (dotNode) {
      var graphNode = {
        id: dotNode.id,
        label: String(dotNode.label || dotNode.id)
      };
      merge(graphNode, dotNode.attr);
      if (graphNode.image) {
        graphNode.shape = 'image';
      }
      graphData.nodes.push(graphNode);
    });
  }

  // copy the edges
  if (dotData.edges) {
    /**
     * Convert an edge in DOT format to an edge with VisGraph format
     * @param {Object} dotEdge
     * @returns {Object} graphEdge
     */
    var convertEdge = function (dotEdge) {
      var graphEdge = {
        from: dotEdge.from,
        to: dotEdge.to
      };
      merge(graphEdge, dotEdge.attr);
      graphEdge.style = (dotEdge.type == '->') ? 'arrow' : 'line';
      return graphEdge;
    }

    dotData.edges.forEach(function (dotEdge) {
      var from, to;
      if (dotEdge.from instanceof Object) {
        from = dotEdge.from.nodes;
      }
      else {
        from = {
          id: dotEdge.from
        }
      }

      if (dotEdge.to instanceof Object) {
        to = dotEdge.to.nodes;
      }
      else {
        to = {
          id: dotEdge.to
        }
      }

      if (dotEdge.from instanceof Object && dotEdge.from.edges) {
        dotEdge.from.edges.forEach(function (subEdge) {
          var graphEdge = convertEdge(subEdge);
          graphData.edges.push(graphEdge);
        });
      }

      forEach2(from, to, function (from, to) {
        var subEdge = createEdge(graphData, from.id, to.id, dotEdge.type, dotEdge.attr);
        var graphEdge = convertEdge(subEdge);
        graphData.edges.push(graphEdge);
      });

      if (dotEdge.to instanceof Object && dotEdge.to.edges) {
        dotEdge.to.edges.forEach(function (subEdge) {
          var graphEdge = convertEdge(subEdge);
          graphData.edges.push(graphEdge);
        });
      }
    });
  }

  // copy the options
  if (dotData.attr) {
    graphData.options = dotData.attr;
  }

  return graphData;
}

// exports
exports.parseDOT = parseDOT;
exports.DOTToGraph = DOTToGraph;

},{}],15:[function(require,module,exports){

function parseGephi(gephiJSON, options) {
  var edges = [];
  var nodes = [];
  this.options = {
    edges: {
      inheritColor: true
    },
    nodes: {
      allowedToMove: false,
      parseColor: false
    }
  };

  if (options !== undefined) {
    this.options.nodes['allowedToMove'] = options.allowedToMove | false;
    this.options.nodes['parseColor']    = options.parseColor    | false;
    this.options.edges['inheritColor']  = options.inheritColor  | true;
  }

  var gEdges = gephiJSON.edges;
  var gNodes = gephiJSON.nodes;
  for (var i = 0; i < gEdges.length; i++) {
    var edge = {};
    var gEdge = gEdges[i];
    edge['id'] = gEdge.id;
    edge['from'] = gEdge.source;
    edge['to'] = gEdge.target;
    edge['attributes'] = gEdge.attributes;
//    edge['value'] = gEdge.attributes !== undefined ? gEdge.attributes.Weight : undefined;
//    edge['width'] = edge['value'] !== undefined ? undefined : edgegEdge.size;
    edge['color'] = gEdge.color;
    edge['inheritColor'] = edge['color'] !== undefined ? false : this.options.inheritColor;
    edges.push(edge);
  }

  for (var i = 0; i < gNodes.length; i++) {
    var node = {};
    var gNode = gNodes[i];
    node['id'] = gNode.id;
    node['attributes'] = gNode.attributes;
    node['x'] = gNode.x;
    node['y'] = gNode.y;
    node['label'] = gNode.label;
    if (this.options.nodes.parseColor == true) {
      node['color'] = gNode.color;
    }
    else {
      node['color'] = gNode.color !== undefined ? {background:gNode.color, border:gNode.color} : undefined;
    }
    node['radius'] = gNode.size;
    node['allowedToMoveX'] = this.options.nodes.allowedToMove;
    node['allowedToMoveY'] = this.options.nodes.allowedToMove;
    nodes.push(node);
  }

  return {nodes:nodes, edges:edges};
}

exports.parseGephi = parseGephi;
},{}],16:[function(require,module,exports){
// English
exports['en'] = {
  edit: 'Edit',
  del: 'Delete selected',
  back: 'Back',
  addNode: 'Add Arg',
  addEdge: 'Add Defeat',
  editNode: 'Edit Arg',
  editEdge: 'Edit Defeat',
  addDescription: 'Click in an empty space to place a new argument.',
  edgeDescription: 'Click on a argument and drag the edge to another node to create defeat.',
  editEdgeDescription: 'Click on the control points and drag them to a arg to connect to it.',
  createEdgeError: 'Cannot link edges to a cluster.',
  deleteClusterError: 'Clusters cannot be deleted.'
};
exports['en_EN'] = exports['en'];
exports['en_US'] = exports['en'];

// Dutch
exports['nl'] = {
  edit: 'Wijzigen',
  del: 'Selectie verwijderen',
  back: 'Terug',
  addNode: 'Node toevoegen',
  addEdge: 'Link toevoegen',
  editNode: 'Node wijzigen',
  editEdge: 'Link wijzigen',
  addDescription: 'Klik op een leeg gebied om een nieuwe node te maken.',
  edgeDescription: 'Klik op een node en sleep de link naar een andere node om ze te verbinden.',
  editEdgeDescription: 'Klik op de verbindingspunten en sleep ze naar een node om daarmee te verbinden.',
  createEdgeError: 'Kan geen link maken naar een cluster.',
  deleteClusterError: 'Clusters kunnen niet worden verwijderd.'
};
exports['nl_NL'] = exports['nl'];
exports['nl_BE'] = exports['nl'];

},{}],17:[function(require,module,exports){
/**
 * Creation of the ClusterMixin var.
 *
 * This contains all the functions the Network object can use to employ clustering
 */

/**
* This is only called in the constructor of the network object
*
*/
exports.startWithClustering = function() {
 // cluster if the data set is big
 this.clusterToFit(this.constants.clustering.initialMaxNodes, true);

 // updates the lables after clustering
 this.updateLabels();

 // this is called here because if clusterin is disabled, the start and stabilize are called in
 // the setData function.
 if (this.constants.stabilize == true) {
   this._stabilize();
 }
 this.start();
};

/**
 * This function clusters until the initialMaxNodes has been reached
 *
 * @param {Number}  maxNumberOfNodes
 * @param {Boolean} reposition
 */
exports.clusterToFit = function(maxNumberOfNodes, reposition) {
  var numberOfNodes = this.nodeIndices.length;

  var maxLevels = 50;
  var level = 0;

  // we first cluster the hubs, then we pull in the outliers, repeat
  while (numberOfNodes > maxNumberOfNodes && level < maxLevels) {
    if (level % 3 == 0.0) {
      this.forceAggregateHubs(true);
      this.normalizeClusterLevels();
    }
    else {
      this.increaseClusterLevel(); // this also includes a cluster normalization
    }
    this.forceAggregateHubs(true);
    numberOfNodes = this.nodeIndices.length;
    level += 1;
  }

  // after the clustering we reposition the nodes to reduce the initial chaos
  if (level > 0 && reposition == true) {
    this.repositionNodes();
  }
  this._updateCalculationNodes();
};

/**
 * This function can be called to open up a specific cluster.
 * It will unpack the cluster back one level.
 *
 * @param node    | Node object: cluster to open.
 */
exports.openCluster = function(node) {
  var isMovingBeforeClustering = this.moving;
  if (node.clusterSize > this.constants.clustering.sectorThreshold && this._nodeInActiveArea(node) &&
    !(this._sector() == "default" && this.nodeIndices.length == 1)) {
    // this loads a new sector, loads the nodes and edges and nodeIndices of it.
    this._addSector(node);
    var level = 0;

    // we decluster until we reach a decent number of nodes
    while ((this.nodeIndices.length < this.constants.clustering.initialMaxNodes) && (level < 10)) {
      this.decreaseClusterLevel();
      level += 1;
    }

  }
  else {
    this._expandClusterNode(node,false,true);

    // update the index list and labels
    this._updateNodeIndexList();
    this._updateCalculationNodes();
    this.updateLabels();
  }

  // if the simulation was settled, we restart the simulation if a cluster has been formed or expanded
  if (this.moving != isMovingBeforeClustering) {
    this.start();
  }
};


/**
 * This calls the updateClustes with default arguments
 */
exports.updateClustersDefault = function() {
  if (this.constants.clustering.enabled == true && this.constants.clustering.clusterByZoom == true) {
    this.updateClusters(0,false,false);
  }
};


/**
 * This function can be called to increase the cluster level. This means that the nodes with only one edge connection will
 * be clustered with their connected node. This can be repeated as many times as needed.
 * This can be called externally (by a keybind for instance) to reduce the complexity of big datasets.
 */
exports.increaseClusterLevel = function() {
  this.updateClusters(-1,false,true);
};


/**
 * This function can be called to decrease the cluster level. This means that the nodes with only one edge connection will
 * be unpacked if they are a cluster. This can be repeated as many times as needed.
 * This can be called externally (by a key-bind for instance) to look into clusters without zooming.
 */
exports.decreaseClusterLevel = function() {
  this.updateClusters(1,false,true);
};


/**
 * This is the main clustering function. It clusters and declusters on zoom or forced
 * This function clusters on zoom, it can be called with a predefined zoom direction
 * If out, check if we can form clusters, if in, check if we can open clusters.
 * This function is only called from _zoom()
 *
 * @param {Number} zoomDirection  | -1 / 0 / +1   for  zoomOut / determineByZoom / zoomIn
 * @param {Boolean} recursive     | enabled or disable recursive calling of the opening of clusters
 * @param {Boolean} force         | enabled or disable forcing
 * @param {Boolean} doNotStart    | if true do not call start
 *
 */
exports.updateClusters = function(zoomDirection,recursive,force,doNotStart) {
  var isMovingBeforeClustering = this.moving;
  var amountOfNodes = this.nodeIndices.length;

  var detectedZoomingIn = (this.previousScale < this.scale && zoomDirection == 0);
  var detectedZoomingOut = (this.previousScale > this.scale && zoomDirection == 0);

  // on zoom out collapse the sector if the scale is at the level the sector was made
  if (detectedZoomingOut == true) {
    this._collapseSector();
  }

  // check if we zoom in or out
  if (detectedZoomingOut == true || zoomDirection == -1) { // zoom out
    // forming clusters when forced pulls outliers in. When not forced, the edge length of the
    // outer nodes determines if it is being clustered
    this._formClusters(force);
  }
  else if (detectedZoomingIn == true || zoomDirection == 1) { // zoom in
    if (force == true) {
      // _openClusters checks for each node if the formationScale of the cluster is smaller than
      // the current scale and if so, declusters. When forced, all clusters are reduced by one step
      this._openClusters(recursive,force);
    }
    else {
      // if a cluster takes up a set percentage of the active window
      //this._openClustersBySize();
      this._openClusters(recursive, false);
    }
  }
  this._updateNodeIndexList();

  // if a cluster was NOT formed and the user zoomed out, we try clustering by hubs
  if (this.nodeIndices.length == amountOfNodes && (detectedZoomingOut == true || zoomDirection == -1))  {
    this._aggregateHubs(force);
    this._updateNodeIndexList();
  }

  // we now reduce chains.
  if (detectedZoomingOut == true || zoomDirection == -1) { // zoom out
    this.handleChains();
    this._updateNodeIndexList();
  }

  this.previousScale = this.scale;

  // update labels
  this.updateLabels();

  // if a cluster was formed, we increase the clusterSession
  if (this.nodeIndices.length < amountOfNodes) { // this means a clustering operation has taken place
    this.clusterSession += 1;
    // if clusters have been made, we normalize the cluster level
    this.normalizeClusterLevels();
  }

  if (doNotStart == false || doNotStart === undefined) {
    // if the simulation was settled, we restart the simulation if a cluster has been formed or expanded
    if (this.moving != isMovingBeforeClustering) {
      this.start();
    }
  }

  this._updateCalculationNodes();
};

/**
 * This function handles the chains. It is called on every updateClusters().
 */
exports.handleChains = function() {
  // after clustering we check how many chains there are
  var chainPercentage = this._getChainFraction();
  if (chainPercentage > this.constants.clustering.chainThreshold) {
    this._reduceAmountOfChains(1 - this.constants.clustering.chainThreshold / chainPercentage)

  }
};

/**
 * this functions starts clustering by hubs
 * The minimum hub threshold is set globally
 *
 * @private
 */
exports._aggregateHubs = function(force) {
  this._getHubSize();
  this._formClustersByHub(force,false);
};


/**
 * This function forces hubs to form.
 *
 */
exports.forceAggregateHubs = function(doNotStart) {
  var isMovingBeforeClustering = this.moving;
  var amountOfNodes = this.nodeIndices.length;

  this._aggregateHubs(true);

  // update the index list, dynamic edges and labels
  this._updateNodeIndexList();
  this.updateLabels();

  this._updateCalculationNodes();

  // if a cluster was formed, we increase the clusterSession
  if (this.nodeIndices.length != amountOfNodes) {
    this.clusterSession += 1;
  }

  if (doNotStart == false || doNotStart === undefined) {
    // if the simulation was settled, we restart the simulation if a cluster has been formed or expanded
    if (this.moving != isMovingBeforeClustering) {
      this.start();
    }
  }
};

/**
 * If a cluster takes up more than a set percentage of the screen, open the cluster
 *
 * @private
 */
exports._openClustersBySize = function() {
  if (this.constants.clustering.clusterByZoom == true) {
    for (var nodeId in this.nodes) {
      if (this.nodes.hasOwnProperty(nodeId)) {
        var node = this.nodes[nodeId];
        if (node.inView() == true) {
          if ((node.width * this.scale > this.constants.clustering.screenSizeThreshold * this.frame.canvas.clientWidth) ||
            (node.height * this.scale > this.constants.clustering.screenSizeThreshold * this.frame.canvas.clientHeight)) {
            this.openCluster(node);
          }
        }
      }
    }
  }
};


/**
 * This function loops over all nodes in the nodeIndices list. For each node it checks if it is a cluster and if it
 * has to be opened based on the current zoom level.
 *
 * @private
 */
exports._openClusters = function(recursive,force) {
  for (var i = 0; i < this.nodeIndices.length; i++) {
    var node = this.nodes[this.nodeIndices[i]];
    this._expandClusterNode(node,recursive,force);
    this._updateCalculationNodes();
  }
};

/**
 * This function checks if a node has to be opened. This is done by checking the zoom level.
 * If the node contains child nodes, this function is recursively called on the child nodes as well.
 * This recursive behaviour is optional and can be set by the recursive argument.
 *
 * @param {Node}    parentNode    | to check for cluster and expand
 * @param {Boolean} recursive     | enabled or disable recursive calling
 * @param {Boolean} force         | enabled or disable forcing
 * @param {Boolean} [openAll]     | This will recursively force all nodes in the parent to be released
 * @private
 */
exports._expandClusterNode = function(parentNode, recursive, force, openAll) {
  // first check if node is a cluster
  if (parentNode.clusterSize > 1) {
    if (openAll === undefined) {
      openAll = false;
    }
    // this means that on a double tap event or a zoom event, the cluster fully unpacks if it is smaller than 20

    recursive = openAll || recursive;
    // if the last child has been added on a smaller scale than current scale decluster
    if (parentNode.formationScale < this.scale || force == true) {
      // we will check if any of the contained child nodes should be removed from the cluster
      for (var containedNodeId in parentNode.containedNodes) {
        if (parentNode.containedNodes.hasOwnProperty(containedNodeId)) {
          var childNode = parentNode.containedNodes[containedNodeId];

          // force expand will expand the largest cluster size clusters. Since we cluster from outside in, we assume that
          // the largest cluster is the one that comes from outside
          if (force == true) {
            if (childNode.clusterSession == parentNode.clusterSessions[parentNode.clusterSessions.length-1]
                || openAll) {
              this._expelChildFromParent(parentNode,containedNodeId,recursive,force,openAll);
            }
          }
          else {
            if (this._nodeInActiveArea(parentNode)) {
              this._expelChildFromParent(parentNode,containedNodeId,recursive,force,openAll);
            }
          }
        }
      }
    }
  }
};

/**
 * ONLY CALLED FROM _expandClusterNode
 *
 * This function will expel a child_node from a parent_node. This is to de-cluster the node. This function will remove
 * the child node from the parent contained_node object and put it back into the global nodes object.
 * The same holds for the edge that was connected to the child node. It is moved back into the global edges object.
 *
 * @param {Node}    parentNode        | the parent node
 * @param {String}  containedNodeId   | child_node id as it is contained in the containedNodes object of the parent node
 * @param {Boolean} recursive         | This will also check if the child needs to be expanded.
 *                                      With force and recursive both true, the entire cluster is unpacked
 * @param {Boolean} force             | This will disregard the zoom level and will expel this child from the parent
 * @param {Boolean} openAll           | This will recursively force all nodes in the parent to be released
 * @private
 */
exports._expelChildFromParent = function(parentNode, containedNodeId, recursive, force, openAll) {
  var childNode = parentNode.containedNodes[containedNodeId]

  // if child node has been added on smaller scale than current, kick out
  if (childNode.formationScale < this.scale || force == true) {
    // unselect all selected items
    this._unselectAll();

    // put the child node back in the global nodes object
    this.nodes[containedNodeId] = childNode;

    // release the contained edges from this childNode back into the global edges
    this._releaseContainedEdges(parentNode,childNode);

    // reconnect rerouted edges to the childNode
    this._connectEdgeBackToChild(parentNode,childNode);

    // validate all edges in dynamicEdges
    this._validateEdges(parentNode);

    // undo the changes from the clustering operation on the parent node
    parentNode.options.mass -= childNode.options.mass;
    parentNode.clusterSize -= childNode.clusterSize;
    parentNode.options.fontSize = Math.min(this.constants.clustering.maxFontSize, this.constants.nodes.fontSize + this.constants.clustering.fontSizeMultiplier*(parentNode.clusterSize-1));

    // place the child node near the parent, not at the exact same location to avoid chaos in the system
    childNode.x = parentNode.x + parentNode.growthIndicator * (0.5 - Math.random());
    childNode.y = parentNode.y + parentNode.growthIndicator * (0.5 - Math.random());

    // remove node from the list
    delete parentNode.containedNodes[containedNodeId];

    // check if there are other childs with this clusterSession in the parent.
    var othersPresent = false;
    for (var childNodeId in parentNode.containedNodes) {
      if (parentNode.containedNodes.hasOwnProperty(childNodeId)) {
        if (parentNode.containedNodes[childNodeId].clusterSession == childNode.clusterSession) {
          othersPresent = true;
          break;
        }
      }
    }
    // if there are no others, remove the cluster session from the list
    if (othersPresent == false) {
      parentNode.clusterSessions.pop();
    }

    this._repositionBezierNodes(childNode);
//      this._repositionBezierNodes(parentNode);

    // remove the clusterSession from the child node
    childNode.clusterSession = 0;

    // recalculate the size of the node on the next time the node is rendered
    parentNode.clearSizeCache();

    // restart the simulation to reorganise all nodes
    this.moving = true;
  }

  // check if a further expansion step is possible if recursivity is enabled
  if (recursive == true) {
    this._expandClusterNode(childNode,recursive,force,openAll);
  }
};


/**
 * position the bezier nodes at the center of the edges
 *
 * @param node
 * @private
 */
exports._repositionBezierNodes = function(node) {
  for (var i = 0; i < node.dynamicEdges.length; i++) {
    node.dynamicEdges[i].positionBezierNode();
  }
};


/**
 * This function checks if any nodes at the end of their trees have edges below a threshold length
 * This function is called only from updateClusters()
 * forceLevelCollapse ignores the length of the edge and collapses one level
 * This means that a node with only one edge will be clustered with its connected node
 *
 * @private
 * @param {Boolean} force
 */
exports._formClusters = function(force) {
  if (force == false) {
    if (this.constants.clustering.clusterByZoom == true) {
      this._formClustersByZoom();
    }
  }
  else {
    this._forceClustersByZoom();
  }
};


/**
 * This function handles the clustering by zooming out, this is based on a minimum edge distance
 *
 * @private
 */
exports._formClustersByZoom = function() {
  var dx,dy,length;
  var minLength = this.constants.clustering.clusterEdgeThreshold/this.scale;

  // check if any edges are shorter than minLength and start the clustering
  // the clustering favours the node with the larger mass
  for (var edgeId in this.edges) {
    if (this.edges.hasOwnProperty(edgeId)) {
      var edge = this.edges[edgeId];
      if (edge.connected) {
        if (edge.toId != edge.fromId) {
          dx = (edge.to.x - edge.from.x);
          dy = (edge.to.y - edge.from.y);
          length = Math.sqrt(dx * dx + dy * dy);


          if (length < minLength) {
            // first check which node is larger
            var parentNode = edge.from;
            var childNode = edge.to;
            if (edge.to.options.mass > edge.from.options.mass) {
              parentNode = edge.to;
              childNode = edge.from;
            }

            if (childNode.dynamicEdges.length == 1) {
              this._addToCluster(parentNode,childNode,false);
            }
            else if (parentNode.dynamicEdges.length == 1) {
              this._addToCluster(childNode,parentNode,false);
            }
          }
        }
      }
    }
  }
};

/**
 * This function forces the network to cluster all nodes with only one connecting edge to their
 * connected node.
 *
 * @private
 */
exports._forceClustersByZoom = function() {
  for (var nodeId in this.nodes) {
    // another node could have absorbed this child.
    if (this.nodes.hasOwnProperty(nodeId)) {
      var childNode = this.nodes[nodeId];

      // the edges can be swallowed by another decrease
      if (childNode.dynamicEdges.length == 1) {
        var edge = childNode.dynamicEdges[0];
        var parentNode = (edge.toId == childNode.id) ? this.nodes[edge.fromId] : this.nodes[edge.toId];
        // group to the largest node
        if (childNode.id != parentNode.id) {
          if (parentNode.options.mass > childNode.options.mass) {
            this._addToCluster(parentNode,childNode,true);
          }
          else {
            this._addToCluster(childNode,parentNode,true);
          }
        }
      }
    }
  }
};


/**
 * To keep the nodes of roughly equal size we normalize the cluster levels.
 * This function clusters a node to its smallest connected neighbour.
 *
 * @param node
 * @private
 */
exports._clusterToSmallestNeighbour = function(node) {
  var smallestNeighbour = -1;
  var smallestNeighbourNode = null;
  for (var i = 0; i < node.dynamicEdges.length; i++) {
    if (node.dynamicEdges[i] !== undefined) {
      var neighbour = null;
      if (node.dynamicEdges[i].fromId != node.id) {
        neighbour = node.dynamicEdges[i].from;
      }
      else if (node.dynamicEdges[i].toId != node.id) {
        neighbour = node.dynamicEdges[i].to;
      }


      if (neighbour != null && smallestNeighbour > neighbour.clusterSessions.length) {
        smallestNeighbour = neighbour.clusterSessions.length;
        smallestNeighbourNode = neighbour;
      }
    }
  }

  if (neighbour != null && this.nodes[neighbour.id] !== undefined) {
    this._addToCluster(neighbour, node, true);
  }
};


/**
 * This function forms clusters from hubs, it loops over all nodes
 *
 * @param {Boolean} force         |   Disregard zoom level
 * @param {Boolean} onlyEqual     |   This only clusters a hub with a specific number of edges
 * @private
 */
exports._formClustersByHub = function(force, onlyEqual) {
  // we loop over all nodes in the list
  for (var nodeId in this.nodes) {
    // we check if it is still available since it can be used by the clustering in this loop
    if (this.nodes.hasOwnProperty(nodeId)) {
      this._formClusterFromHub(this.nodes[nodeId],force,onlyEqual);
    }
  }
};

/**
 * This function forms a cluster from a specific preselected hub node
 *
 * @param {Node}    hubNode       |   the node we will cluster as a hub
 * @param {Boolean} force         |   Disregard zoom level
 * @param {Boolean} onlyEqual     |   This only clusters a hub with a specific number of edges
 * @param {Number} [absorptionSizeOffset] |
 * @private
 */
exports._formClusterFromHub = function(hubNode, force, onlyEqual, absorptionSizeOffset) {
  if (absorptionSizeOffset === undefined) {
    absorptionSizeOffset = 0;
  }
  //this.hubThreshold = 43
  //if (hubNode.dynamicEdgesLength < 0) {
  // console.error(hubNode.dynamicEdgesLength, this.hubThreshold, onlyEqual)
  //}
  // we decide if the node is a hub
  if ((hubNode.dynamicEdges.length >= this.hubThreshold && onlyEqual == false) ||
    (hubNode.dynamicEdges.length == this.hubThreshold && onlyEqual == true)) {
    // initialize variables
    var dx,dy,length;
    var minLength = this.constants.clustering.clusterEdgeThreshold/this.scale;
    var allowCluster = false;

    // we create a list of edges because the dynamicEdges change over the course of this loop
    var edgesIdarray = [];
    var amountOfInitialEdges = hubNode.dynamicEdges.length;
    for (var j = 0; j < amountOfInitialEdges; j++) {
      edgesIdarray.push(hubNode.dynamicEdges[j].id);
    }

    // if the hub clustering is not forced, we check if one of the edges connected
    // to a cluster is small enough based on the constants.clustering.clusterEdgeThreshold
    if (force == false) {
      allowCluster = false;
      for (j = 0; j < amountOfInitialEdges; j++) {
        var edge = this.edges[edgesIdarray[j]];
        if (edge !== undefined) {
          if (edge.connected) {
            if (edge.toId != edge.fromId) {
              dx = (edge.to.x - edge.from.x);
              dy = (edge.to.y - edge.from.y);
              length = Math.sqrt(dx * dx + dy * dy);

              if (length < minLength) {
                allowCluster = true;
                break;
              }
            }
          }
        }
      }
    }

    // start the clustering if allowed
    if ((!force && allowCluster) || force) {
      var children = [];
      var childrenIds = {};
      // we loop over all edges INITIALLY connected to this hub to get a list of the childNodes
      for (j = 0; j < amountOfInitialEdges; j++) {
        edge = this.edges[edgesIdarray[j]];
        var childNode = this.nodes[(edge.fromId == hubNode.id) ? edge.toId : edge.fromId];
        if (childrenIds[childNode.id] === undefined) {
          childrenIds[childNode.id] = true;
          children.push(childNode);
        }
      }

      for (j = 0; j < children.length; j++) {
        var childNode = children[j];
        // we do not want hubs to merge with other hubs nor do we want to cluster itself.
        if ((childNode.dynamicEdges.length <= (this.hubThreshold + absorptionSizeOffset)) &&
          (childNode.id != hubNode.id)) {
          this._addToCluster(hubNode,childNode,force);

        }
        else {
          //console.log("WILL NOT MERGE:",childNode.dynamicEdges.length , (this.hubThreshold + absorptionSizeOffset))
        }
      }

    }
  }
};



/**
 * This function adds the child node to the parent node, creating a cluster if it is not already.
 *
 * @param {Node} parentNode           | this is the node that will house the child node
 * @param {Node} childNode            | this node will be deleted from the global this.nodes and stored in the parent node
 * @param {Boolean} force             | true will only update the remainingEdges at the very end of the clustering, ensuring single level collapse
 * @private
 */
exports._addToCluster = function(parentNode, childNode, force) {
  // join child node in the parent node
  parentNode.containedNodes[childNode.id] = childNode;
  //console.log(parentNode.id, childNode.id)
  // manage all the edges connected to the child and parent nodes
  for (var i = 0; i < childNode.dynamicEdges.length; i++) {
    var edge = childNode.dynamicEdges[i];
    if (edge.toId == parentNode.id || edge.fromId == parentNode.id) { // edge connected to parentNode
      //console.log("COLLECT",parentNode.id, childNode.id, edge.toId, edge.fromId)
      this._addToContainedEdges(parentNode,childNode,edge);
    }
    else {
      //console.log("REWIRE",parentNode.id, childNode.id, edge.toId, edge.fromId)
      this._connectEdgeToCluster(parentNode,childNode,edge);
    }
  }
  // a contained node has no dynamic edges.
  childNode.dynamicEdges = [];

  // remove circular edges from clusters
  this._containCircularEdgesFromNode(parentNode,childNode);


  // remove the childNode from the global nodes object
  delete this.nodes[childNode.id];

  // update the properties of the child and parent
  var massBefore = parentNode.options.mass;
  childNode.clusterSession = this.clusterSession;
  parentNode.options.mass += childNode.options.mass;
  parentNode.clusterSize += childNode.clusterSize;
  parentNode.options.fontSize = Math.min(this.constants.clustering.maxFontSize, this.constants.nodes.fontSize + this.constants.clustering.fontSizeMultiplier*parentNode.clusterSize);

  // keep track of the clustersessions so we can open the cluster up as it has been formed.
  if (parentNode.clusterSessions[parentNode.clusterSessions.length - 1] != this.clusterSession) {
    parentNode.clusterSessions.push(this.clusterSession);
  }

  // forced clusters only open from screen size and double tap
  if (force == true) {
    parentNode.formationScale = 0;
  }
  else {
    parentNode.formationScale = this.scale; // The latest child has been added on this scale
  }

  // recalculate the size of the node on the next time the node is rendered
  parentNode.clearSizeCache();

  // set the pop-out scale for the childnode
  parentNode.containedNodes[childNode.id].formationScale = parentNode.formationScale;

  // nullify the movement velocity of the child, this is to avoid hectic behaviour
  childNode.clearVelocity();

  // the mass has altered, preservation of energy dictates the velocity to be updated
  parentNode.updateVelocity(massBefore);

  // restart the simulation to reorganise all nodes
  this.moving = true;
};


/**
 * This adds an edge from the childNode to the contained edges of the parent node
 *
 * @param parentNode    | Node object
 * @param childNode     | Node object
 * @param edge          | Edge object
 * @private
 */
exports._addToContainedEdges = function(parentNode, childNode, edge) {
  // create an array object if it does not yet exist for this childNode
  if (parentNode.containedEdges[childNode.id] === undefined) {
    parentNode.containedEdges[childNode.id] = []
  }
  // add this edge to the list
  parentNode.containedEdges[childNode.id].push(edge);

  // remove the edge from the global edges object
  delete this.edges[edge.id];

  // remove the edge from the parent object
  for (var i = 0; i < parentNode.dynamicEdges.length; i++) {
    if (parentNode.dynamicEdges[i].id == edge.id) {
      parentNode.dynamicEdges.splice(i,1);
      break;
    }
  }
};

/**
 * This function connects an edge that was connected to a child node to the parent node.
 * It keeps track of which nodes it has been connected to with the originalId array.
 *
 * @param {Node} parentNode    | Node object
 * @param {Node} childNode     | Node object
 * @param {Edge} edge          | Edge object
 * @private
 */
exports._connectEdgeToCluster = function(parentNode, childNode, edge) {
  // handle circular edges
  if (edge.toId == edge.fromId) {
    this._addToContainedEdges(parentNode, childNode, edge);
  }
  else {
    if (edge.toId == childNode.id) {    // edge connected to other node on the "to" side
      edge.originalToId.push(childNode.id);
      edge.to = parentNode;
      edge.toId = parentNode.id;
    }
    else {          // edge connected to other node with the "from" side
      edge.originalFromId.push(childNode.id);
      edge.from = parentNode;
      edge.fromId = parentNode.id;
    }

    this._addToReroutedEdges(parentNode,childNode,edge);
  }
};


/**
 * If a node is connected to itself, a circular edge is drawn. When clustering we want to contain
 * these edges inside of the cluster.
 *
 * @param parentNode
 * @param childNode
 * @private
 */
exports._containCircularEdgesFromNode = function(parentNode, childNode) {
  // manage all the edges connected to the child and parent nodes
  for (var i = 0; i < parentNode.dynamicEdges.length; i++) {
    var edge = parentNode.dynamicEdges[i];
    // handle circular edges
    if (edge.toId == edge.fromId) {
      this._addToContainedEdges(parentNode, childNode, edge);
    }
  }
};


/**
 * This adds an edge from the childNode to the rerouted edges of the parent node
 *
 * @param parentNode    | Node object
 * @param childNode     | Node object
 * @param edge          | Edge object
 * @private
 */
exports._addToReroutedEdges = function(parentNode, childNode, edge) {
  // create an array object if it does not yet exist for this childNode
  // we store the edge in the rerouted edges so we can restore it when the cluster pops open
  if (!(parentNode.reroutedEdges.hasOwnProperty(childNode.id))) {
    parentNode.reroutedEdges[childNode.id] = [];
  }
  parentNode.reroutedEdges[childNode.id].push(edge);

  // this edge becomes part of the dynamicEdges of the cluster node
  parentNode.dynamicEdges.push(edge);
 };



/**
 * This function connects an edge that was connected to a cluster node back to the child node.
 *
 * @param parentNode    | Node object
 * @param childNode     | Node object
 * @private
 */
exports._connectEdgeBackToChild = function(parentNode, childNode) {
  if (parentNode.reroutedEdges.hasOwnProperty(childNode.id)) {
    for (var i = 0; i < parentNode.reroutedEdges[childNode.id].length; i++) {
      var edge = parentNode.reroutedEdges[childNode.id][i];
      if (edge.originalFromId[edge.originalFromId.length-1] == childNode.id) {
        edge.originalFromId.pop();
        edge.fromId = childNode.id;
        edge.from = childNode;
      }
      else {
        edge.originalToId.pop();
        edge.toId = childNode.id;
        edge.to = childNode;
      }

      // append this edge to the list of edges connecting to the childnode
      childNode.dynamicEdges.push(edge);

      // remove the edge from the parent object
      for (var j = 0; j < parentNode.dynamicEdges.length; j++) {
        if (parentNode.dynamicEdges[j].id == edge.id) {
          parentNode.dynamicEdges.splice(j,1);
          break;
        }
      }
    }
    // remove the entry from the rerouted edges
    delete parentNode.reroutedEdges[childNode.id];
  }
};


/**
 * When loops are clustered, an edge can be both in the rerouted array and the contained array.
 * This function is called last to verify that all edges in dynamicEdges are in fact connected to the
 * parentNode
 *
 * @param parentNode    | Node object
 * @private
 */
exports._validateEdges = function(parentNode) {
  var dynamicEdges = []
  for (var i = 0; i < parentNode.dynamicEdges.length; i++) {
    var edge = parentNode.dynamicEdges[i];
    if (parentNode.id == edge.toId || parentNode.id == edge.fromId) {
      dynamicEdges.push(edge);
    }
  }
  parentNode.dynamicEdges = dynamicEdges;
};


/**
 * This function released the contained edges back into the global domain and puts them back into the
 * dynamic edges of both parent and child.
 *
 * @param {Node} parentNode    |
 * @param {Node} childNode     |
 * @private
 */
exports._releaseContainedEdges = function(parentNode, childNode) {
  for (var i = 0; i < parentNode.containedEdges[childNode.id].length; i++) {
    var edge = parentNode.containedEdges[childNode.id][i];

    // put the edge back in the global edges object
    this.edges[edge.id] = edge;

    // put the edge back in the dynamic edges of the child and parent
    childNode.dynamicEdges.push(edge);
    parentNode.dynamicEdges.push(edge);
  }
  // remove the entry from the contained edges
  delete parentNode.containedEdges[childNode.id];

};




// ------------------- UTILITY FUNCTIONS ---------------------------- //


/**
 * This updates the node labels for all nodes (for debugging purposes)
 */
exports.updateLabels = function() {
  var nodeId;
  // update node labels
  for (nodeId in this.nodes) {
    if (this.nodes.hasOwnProperty(nodeId)) {
      var node = this.nodes[nodeId];
      if (node.clusterSize > 1) {
        node.label = "[".concat(String(node.clusterSize),"]");
      }
    }
  }

  // update node labels
  for (nodeId in this.nodes) {
    if (this.nodes.hasOwnProperty(nodeId)) {
      node = this.nodes[nodeId];
      if (node.clusterSize == 1) {
        if (node.originalLabel !== undefined) {
          node.label = node.originalLabel;
        }
        else {
          node.label = String(node.id);
        }
      }
    }
  }

//    /* Debug Override */
//    for (nodeId in this.nodes) {
//      if (this.nodes.hasOwnProperty(nodeId)) {
//        node = this.nodes[nodeId];
//        node.label = String(node.clusterSize + ":" + node.dynamicEdges.length);
//      }
//    }

};


/**
 * We want to keep the cluster level distribution rather small. This means we do not want unclustered nodes
 * if the rest of the nodes are already a few cluster levels in.
 * To fix this we use this function. It determines the min and max cluster level and sends nodes that have not
 * clustered enough to the clusterToSmallestNeighbours function.
 */
exports.normalizeClusterLevels = function() {
  var maxLevel = 0;
  var minLevel = 1e9;
  var clusterLevel = 0;
  var nodeId;

  // we loop over all nodes in the list
  for (nodeId in this.nodes) {
    if (this.nodes.hasOwnProperty(nodeId)) {
      clusterLevel = this.nodes[nodeId].clusterSessions.length;
      if (maxLevel < clusterLevel) {maxLevel = clusterLevel;}
      if (minLevel > clusterLevel) {minLevel = clusterLevel;}
    }
  }

  if (maxLevel - minLevel > this.constants.clustering.clusterLevelDifference) {
    var amountOfNodes = this.nodeIndices.length;
    var targetLevel = maxLevel - this.constants.clustering.clusterLevelDifference;
    // we loop over all nodes in the list
    for (nodeId in this.nodes) {
      if (this.nodes.hasOwnProperty(nodeId)) {
        if (this.nodes[nodeId].clusterSessions.length < targetLevel) {
          this._clusterToSmallestNeighbour(this.nodes[nodeId]);
        }
      }
    }
    this._updateNodeIndexList();
    // if a cluster was formed, we increase the clusterSession
    if (this.nodeIndices.length != amountOfNodes) {
      this.clusterSession += 1;
    }
  }
};



/**
 * This function determines if the cluster we want to decluster is in the active area
 * this means around the zoom center
 *
 * @param {Node} node
 * @returns {boolean}
 * @private
 */
exports._nodeInActiveArea = function(node) {
  return (
    Math.abs(node.x - this.areaCenter.x) <= this.constants.clustering.activeAreaBoxSize/this.scale
      &&
    Math.abs(node.y - this.areaCenter.y) <= this.constants.clustering.activeAreaBoxSize/this.scale
    )
};


/**
 * This is an adaptation of the original repositioning function. This is called if the system is clustered initially
 * It puts large clusters away from the center and randomizes the order.
 *
 */
exports.repositionNodes = function() {
  for (var i = 0; i < this.nodeIndices.length; i++) {
    var node = this.nodes[this.nodeIndices[i]];
    if ((node.xFixed == false || node.yFixed == false)) {
      var radius = 10 * 0.1*this.nodeIndices.length * Math.min(100,node.options.mass);
      var angle = 2 * Math.PI * Math.random();
      if (node.xFixed == false) {node.x = radius * Math.cos(angle);}
      if (node.yFixed == false) {node.y = radius * Math.sin(angle);}
      this._repositionBezierNodes(node);
    }
  }
};


/**
 * We determine how many connections denote an important hub.
 * We take the mean + 2*std as the important hub size. (Assuming a normal distribution of data, ~2.2%)
 *
 * @private
 */
exports._getHubSize = function() {
  var average = 0;
  var averageSquared = 0;
  var hubCounter = 0;
  var largestHub = 0;

  for (var i = 0; i < this.nodeIndices.length; i++) {

    var node = this.nodes[this.nodeIndices[i]];
    if (node.dynamicEdges.length > largestHub) {
      largestHub = node.dynamicEdges.length;
    }
    average += node.dynamicEdges.length;
    averageSquared += Math.pow(node.dynamicEdges.length,2);
    hubCounter += 1;
  }
  average = average / hubCounter;
  averageSquared = averageSquared / hubCounter;

  var variance = averageSquared - Math.pow(average,2);

  var standardDeviation = Math.sqrt(variance);

  this.hubThreshold = Math.floor(average + 2*standardDeviation);

  // always have at least one to cluster
  if (this.hubThreshold > largestHub) {
    this.hubThreshold = largestHub;
  }

//  console.log("average",average,"averageSQ",averageSquared,"var",variance,"std",standardDeviation);
//  console.log("hubThreshold:",this.hubThreshold);
};


/**
 * We reduce the amount of "extension nodes" or chains. These are not quickly clustered with the outliers and hubs methods
 * with this amount we can cluster specifically on these chains.
 *
 * @param   {Number} fraction     | between 0 and 1, the percentage of chains to reduce
 * @private
 */
exports._reduceAmountOfChains = function(fraction) {
  this.hubThreshold = 2;
  var reduceAmount = Math.floor(this.nodeIndices.length * fraction);
  for (var nodeId in this.nodes) {
    if (this.nodes.hasOwnProperty(nodeId)) {
      if (this.nodes[nodeId].dynamicEdges.length == 2) {
        if (reduceAmount > 0) {
          this._formClusterFromHub(this.nodes[nodeId],true,true,1);
          reduceAmount -= 1;
        }
      }
    }
  }
};

/**
 * We get the amount of "extension nodes" or chains. These are not quickly clustered with the outliers and hubs methods
 * with this amount we can cluster specifically on these chains.
 *
 * @private
 */
exports._getChainFraction = function() {
  var chains = 0;
  var total = 0;
  for (var nodeId in this.nodes) {
    if (this.nodes.hasOwnProperty(nodeId)) {
      if (this.nodes[nodeId].dynamicEdges.length == 2) {
        chains += 1;
      }
      total += 1;
    }
  }
  return chains/total;
};

},{}],18:[function(require,module,exports){
exports._resetLevels = function() {
  for (var nodeId in this.nodes) {
    if (this.nodes.hasOwnProperty(nodeId)) {
      var node = this.nodes[nodeId];
      if (node.preassignedLevel == false) {
        node.level = -1;
        node.hierarchyEnumerated = false;
      }
    }
  }
};

/**
 * This is the main function to layout the nodes in a hierarchical way.
 * It checks if the node details are supplied correctly
 *
 * @private
 */
exports._setupHierarchicalLayout = function() {
  if (this.constants.hierarchicalLayout.enabled == true && this.nodeIndices.length > 0) {
    // get the size of the largest hubs and check if the user has defined a level for a node.
    var hubsize = 0;
    var node, nodeId;
    var definedLevel = false;
    var undefinedLevel = false;

    for (nodeId in this.nodes) {
      if (this.nodes.hasOwnProperty(nodeId)) {
        node = this.nodes[nodeId];
        if (node.level != -1) {
          definedLevel = true;
        }
        else {
          undefinedLevel = true;
        }
        if (hubsize < node.edges.length) {
          hubsize = node.edges.length;
        }
      }
    }

    // if the user defined some levels but not all, alert and run without hierarchical layout
    if (undefinedLevel == true && definedLevel == true) {
      throw new Error("To use the hierarchical layout, nodes require either no predefined levels or levels have to be defined for all nodes.");
      this.zoomExtent({duration:0},true,this.constants.clustering.enabled);
      if (!this.constants.clustering.enabled) {
        this.start();
      }
    }
    else {
      // setup the system to use hierarchical method.
      this._changeConstants();

      // define levels if undefined by the users. Based on hubsize
      if (undefinedLevel == true) {
        if (this.constants.hierarchicalLayout.layout == "hubsize") {
          this._determineLevels(hubsize);
        }
        else {
          this._determineLevelsDirected(false);
        }

      }
      // check the distribution of the nodes per level.
      var distribution = this._getDistribution();

      // place the nodes on the canvas. This also stablilizes the system.
      this._placeNodesByHierarchy(distribution);

      // start the simulation.
      this.start();
    }
  }
};


/**
 * This function places the nodes on the canvas based on the hierarchial distribution.
 *
 * @param {Object} distribution | obtained by the function this._getDistribution()
 * @private
 */
exports._placeNodesByHierarchy = function(distribution) {
  var nodeId, node;

  // start placing all the level 0 nodes first. Then recursively position their branches.
  for (var level in distribution) {
    if (distribution.hasOwnProperty(level)) {

      for (nodeId in distribution[level].nodes) {
        if (distribution[level].nodes.hasOwnProperty(nodeId)) {
          node = distribution[level].nodes[nodeId];
          if (this.constants.hierarchicalLayout.direction == "UD" || this.constants.hierarchicalLayout.direction == "DU") {
            if (node.xFixed) {
              node.x = distribution[level].minPos;
              node.xFixed = false;

              distribution[level].minPos += distribution[level].nodeSpacing;
            }
          }
          else {
            if (node.yFixed) {
              node.y = distribution[level].minPos;
              node.yFixed = false;

              distribution[level].minPos += distribution[level].nodeSpacing;
            }
          }
          this._placeBranchNodes(node.edges,node.id,distribution,node.level);
        }
      }
    }
  }

  // stabilize the system after positioning. This function calls zoomExtent.
  this._stabilize();
};


/**
 * This function get the distribution of levels based on hubsize
 *
 * @returns {Object}
 * @private
 */
exports._getDistribution = function() {
  var distribution = {};
  var nodeId, node, level;

  // we fix Y because the hierarchy is vertical, we fix X so we do not give a node an x position for a second time.
  // the fix of X is removed after the x value has been set.
  for (nodeId in this.nodes) {
    if (this.nodes.hasOwnProperty(nodeId)) {
      node = this.nodes[nodeId];
      node.xFixed = true;
      node.yFixed = true;
      if (this.constants.hierarchicalLayout.direction == "UD" || this.constants.hierarchicalLayout.direction == "DU") {
        node.y = this.constants.hierarchicalLayout.levelSeparation*node.level;
      }
      else {
        node.x = this.constants.hierarchicalLayout.levelSeparation*node.level;
      }
      if (distribution[node.level] === undefined) {
        distribution[node.level] = {amount: 0, nodes: {}, minPos:0, nodeSpacing:0};
      }
      distribution[node.level].amount += 1;
      distribution[node.level].nodes[nodeId] = node;
    }
  }

  // determine the largest amount of nodes of all levels
  var maxCount = 0;
  for (level in distribution) {
    if (distribution.hasOwnProperty(level)) {
      if (maxCount < distribution[level].amount) {
        maxCount = distribution[level].amount;
      }
    }
  }

  // set the initial position and spacing of each nodes accordingly
  for (level in distribution) {
    if (distribution.hasOwnProperty(level)) {
      distribution[level].nodeSpacing = (maxCount + 1) * this.constants.hierarchicalLayout.nodeSpacing;
      distribution[level].nodeSpacing /= (distribution[level].amount + 1);
      distribution[level].minPos = distribution[level].nodeSpacing - (0.5 * (distribution[level].amount + 1) * distribution[level].nodeSpacing);
    }
  }

  return distribution;
};


/**
 * this function allocates nodes in levels based on the recursive branching from the largest hubs.
 *
 * @param hubsize
 * @private
 */
exports._determineLevels = function(hubsize) {
  var nodeId, node;

  // determine hubs
  for (nodeId in this.nodes) {
    if (this.nodes.hasOwnProperty(nodeId)) {
      node = this.nodes[nodeId];
      if (node.edges.length == hubsize) {
        node.level = 0;
      }
    }
  }

  // branch from hubs
  for (nodeId in this.nodes) {
    if (this.nodes.hasOwnProperty(nodeId)) {
      node = this.nodes[nodeId];
      if (node.level == 0) {
        this._setLevel(1,node.edges,node.id);
      }
    }
  }
};



/**
 * this function allocates nodes in levels based on the direction of the edges
 *
 * @param hubsize
 * @private
 */
exports._determineLevelsDirected = function() {
  var nodeId, node, firstNode;
  var minLevel = 10000;

  // set first node to source
  firstNode = this.nodes[this.nodeIndices[0]];
  firstNode.level = minLevel;
  this._setLevelDirected(minLevel,firstNode.edges,firstNode.id);

  // get the minimum level
  for (nodeId in this.nodes) {
    if (this.nodes.hasOwnProperty(nodeId)) {
      node = this.nodes[nodeId];
      minLevel = node.level < minLevel ? node.level : minLevel;
    }
  }

  // subtract the minimum from the set so we have a range starting from 0
  for (nodeId in this.nodes) {
    if (this.nodes.hasOwnProperty(nodeId)) {
      node = this.nodes[nodeId];
      node.level -= minLevel;
    }
  }
};


/**
 * Since hierarchical layout does not support:
 *    - smooth curves (based on the physics),
 *    - clustering (based on dynamic node counts)
 *
 * We disable both features so there will be no problems.
 *
 * @private
 */
exports._changeConstants = function() {
  this.constants.clustering.enabled = false;
  this.constants.physics.barnesHut.enabled = false;
  this.constants.physics.hierarchicalRepulsion.enabled = true;
  this._loadSelectedForceSolver();
  if (this.constants.smoothCurves.enabled == true) {
    this.constants.smoothCurves.dynamic = false;
  }
  this._configureSmoothCurves();

  var config = this.constants.hierarchicalLayout;
  config.levelSeparation = Math.abs(config.levelSeparation);
  if (config.direction == "RL" || config.direction == "DU") {
    config.levelSeparation *= -1;
  }

  if (config.direction == "RL" || config.direction == "LR") {
    if (this.constants.smoothCurves.enabled == true) {
      this.constants.smoothCurves.type = "vertical";
    }
  }
  else {
    if (this.constants.smoothCurves.enabled == true) {
      this.constants.smoothCurves.type = "horizontal";
    }
  }
};


/**
 * This is a recursively called function to enumerate the branches from the largest hubs and place the nodes
 * on a X position that ensures there will be no overlap.
 *
 * @param edges
 * @param parentId
 * @param distribution
 * @param parentLevel
 * @private
 */
exports._placeBranchNodes = function(edges, parentId, distribution, parentLevel) {
  for (var i = 0; i < edges.length; i++) {
    var childNode = null;
    if (edges[i].toId == parentId) {
      childNode = edges[i].from;
    }
    else {
      childNode = edges[i].to;
    }

    // if a node is conneceted to another node on the same level (or higher (means lower level))!, this is not handled here.
    var nodeMoved = false;
    if (this.constants.hierarchicalLayout.direction == "UD" || this.constants.hierarchicalLayout.direction == "DU") {
      if (childNode.xFixed && childNode.level > parentLevel) {
        childNode.xFixed = false;
        childNode.x = distribution[childNode.level].minPos;
        nodeMoved = true;
      }
    }
    else {
      if (childNode.yFixed && childNode.level > parentLevel) {
        childNode.yFixed = false;
        childNode.y = distribution[childNode.level].minPos;
        nodeMoved = true;
      }
    }

    if (nodeMoved == true) {
      distribution[childNode.level].minPos += distribution[childNode.level].nodeSpacing;
      if (childNode.edges.length > 1) {
        this._placeBranchNodes(childNode.edges,childNode.id,distribution,childNode.level);
      }
    }
  }
};


/**
 * this function is called recursively to enumerate the barnches of the largest hubs and give each node a level.
 *
 * @param level
 * @param edges
 * @param parentId
 * @private
 */
exports._setLevel = function(level, edges, parentId) {
  for (var i = 0; i < edges.length; i++) {
    var childNode = null;
    if (edges[i].toId == parentId) {
      childNode = edges[i].from;
    }
    else {
      childNode = edges[i].to;
    }
    if (childNode.level == -1 || childNode.level > level) {
      childNode.level = level;
      if (childNode.edges.length > 1) {
        this._setLevel(level+1, childNode.edges, childNode.id);
      }
    }
  }
};


/**
 * this function is called recursively to enumerate the branched of the first node and give each node a level based on edge direction
 *
 * @param level
 * @param edges
 * @param parentId
 * @private
 */
exports._setLevelDirected = function(level, edges, parentId) {
  this.nodes[parentId].hierarchyEnumerated = true;
  var childNode, direction;
  for (var i = 0; i < edges.length; i++) {
    direction = 1;
    if (edges[i].toId == parentId) {
      childNode = edges[i].from;
      direction = -1;
    }
    else {
      childNode = edges[i].to;
    }
    if (childNode.level == -1) {
      childNode.level = level + direction;
    }
  }

  for (var i = 0; i < edges.length; i++) {
    if (edges[i].toId == parentId) {childNode = edges[i].from;}
    else {childNode = edges[i].to;}

    if (childNode.edges.length > 1 && childNode.hierarchyEnumerated === false) {
      this._setLevelDirected(childNode.level, childNode.edges, childNode.id);
    }
  }
};


/**
 * Unfix nodes
 *
 * @private
 */
exports._restoreNodes = function() {
  for (var nodeId in this.nodes) {
    if (this.nodes.hasOwnProperty(nodeId)) {
      this.nodes[nodeId].xFixed = false;
      this.nodes[nodeId].yFixed = false;
    }
  }
};

},{}],19:[function(require,module,exports){
var util = require('../../util');
var Node = require('../Node');
var Edge = require('../Edge');
var Hammer = require('../../module/hammer');

/**
 * clears the toolbar div element of children
 *
 * @private
 */
exports._clearManipulatorBar = function() {
  this._recursiveDOMDelete(this.manipulationDiv);
  this.manipulationDOM = {};

  this._cleanManipulatorHammers();

  this._manipulationReleaseOverload = function () {};
  delete this.sectors['support']['nodes']['targetNode'];
  delete this.sectors['support']['nodes']['targetViaNode'];
  this.controlNodesActive = false;
  this.freezeSimulation(false);
};


exports._cleanManipulatorHammers = function() {
  // clean hammer bindings
  if (this.manipulationHammers.length != 0) {
    for (var i = 0; i < this.manipulationHammers.length; i++) {
      this.manipulationHammers[i].dispose();
    }
    this.manipulationHammers = [];
  }
};

/**
 * Manipulation UI temporarily overloads certain functions to extend or replace them. To be able to restore
 * these functions to their original functionality, we saved them in this.cachedFunctions.
 * This function restores these functions to their original function.
 *
 * @private
 */
exports._restoreOverloadedFunctions = function() {
  for (var functionName in this.cachedFunctions) {
    if (this.cachedFunctions.hasOwnProperty(functionName)) {
      this[functionName] = this.cachedFunctions[functionName];
      delete this.cachedFunctions[functionName];
    }
  }
};

/**
 * Enable or disable edit-mode.
 *
 * @private
 */
exports._toggleEditMode = function() {
  this.editMode = !this.editMode;
  var toolbar = this.manipulationDiv;
  var closeDiv = this.closeDiv;
  var editModeDiv = this.editModeDiv;
  if (this.editMode == true) {
    toolbar.style.display="block";
    closeDiv.style.display="block";
    editModeDiv.style.display="none";
    this._bindHammerToDiv(closeDiv,'_toggleEditMode');
  }
  else {
    toolbar.style.display="none";
    closeDiv.style.display="none";
    editModeDiv.style.display="block";
  }
  this._createManipulatorBar()
};

/**
 * main function, creates the main toolbar. Removes functions bound to the select event. Binds all the buttons of the toolbar.
 *
 * @private
 */
exports._createManipulatorBar = function() {
  // remove bound functions
  if (this.boundFunction) {
    this.off('select', this.boundFunction);
  }

  this._cleanManipulatorHammers();

  var locale = this.constants.locales[this.constants.locale];

  if (this.edgeBeingEdited !== undefined) {
    this.edgeBeingEdited._disableControlNodes();
    this.edgeBeingEdited = undefined;
    this.selectedControlNode = null;
    this.controlNodesActive = false;
    this._redraw();
  }

  // restore overloaded functions
  this._restoreOverloadedFunctions();

  // resume calculation
  this.freezeSimulation(false);

  // reset global variables
  this.blockConnectingEdgeSelection = false;
  this.forceAppendSelection = false;
  this.manipulationDOM = {};

  if (this.editMode == true) {
    while (this.manipulationDiv.hasChildNodes()) {
      this.manipulationDiv.removeChild(this.manipulationDiv.firstChild);
    }

    this.manipulationDOM['addNodeSpan'] = document.createElement('div');
    this.manipulationDOM['addNodeSpan'].className = 'network-manipulationUI add';

    this.manipulationDOM['addNodeLabelSpan'] = document.createElement('div');
    this.manipulationDOM['addNodeLabelSpan'].className = 'network-manipulationLabel';
    this.manipulationDOM['addNodeLabelSpan'].innerHTML = locale['addNode'];
    this.manipulationDOM['addNodeSpan'].appendChild(this.manipulationDOM['addNodeLabelSpan']);

    this.manipulationDOM['seperatorLineDiv1'] = document.createElement('div');
    this.manipulationDOM['seperatorLineDiv1'].className = 'network-seperatorLine';

    this.manipulationDOM['addEdgeSpan'] = document.createElement('div');
    this.manipulationDOM['addEdgeSpan'].className = 'network-manipulationUI connect';
    this.manipulationDOM['addEdgeLabelSpan'] = document.createElement('div');
    this.manipulationDOM['addEdgeLabelSpan'].className = 'network-manipulationLabel';
    this.manipulationDOM['addEdgeLabelSpan'].innerHTML = locale['addEdge'];
    this.manipulationDOM['addEdgeSpan'].appendChild(this.manipulationDOM['addEdgeLabelSpan']);

    this.manipulationDiv.appendChild(this.manipulationDOM['addNodeSpan']);
    this.manipulationDiv.appendChild(this.manipulationDOM['seperatorLineDiv1']);
    this.manipulationDiv.appendChild(this.manipulationDOM['addEdgeSpan']);

    if (this._getSelectedNodeCount() == 1 && this.triggerFunctions.edit) {
      this.manipulationDOM['seperatorLineDiv2'] = document.createElement('div');
      this.manipulationDOM['seperatorLineDiv2'].className = 'network-seperatorLine';

      this.manipulationDOM['editNodeSpan'] = document.createElement('div');
      this.manipulationDOM['editNodeSpan'].className = 'network-manipulationUI edit';
      this.manipulationDOM['editNodeLabelSpan'] = document.createElement('div');
      this.manipulationDOM['editNodeLabelSpan'].className = 'network-manipulationLabel';
      this.manipulationDOM['editNodeLabelSpan'].innerHTML = locale['editNode'];
      this.manipulationDOM['editNodeSpan'].appendChild(this.manipulationDOM['editNodeLabelSpan']);

      this.manipulationDiv.appendChild(this.manipulationDOM['seperatorLineDiv2']);
      this.manipulationDiv.appendChild(this.manipulationDOM['editNodeSpan']);
    }
    else if (this._getSelectedEdgeCount() == 1 && this._getSelectedNodeCount() == 0) {
      this.manipulationDOM['seperatorLineDiv3'] = document.createElement('div');
      this.manipulationDOM['seperatorLineDiv3'].className = 'network-seperatorLine';

      this.manipulationDOM['editEdgeSpan'] = document.createElement('div');
      this.manipulationDOM['editEdgeSpan'].className = 'network-manipulationUI edit';
      this.manipulationDOM['editEdgeLabelSpan'] = document.createElement('div');
      this.manipulationDOM['editEdgeLabelSpan'].className = 'network-manipulationLabel';
      this.manipulationDOM['editEdgeLabelSpan'].innerHTML = locale['editEdge'];
      this.manipulationDOM['editEdgeSpan'].appendChild(this.manipulationDOM['editEdgeLabelSpan']);

      this.manipulationDiv.appendChild(this.manipulationDOM['seperatorLineDiv3']);
      this.manipulationDiv.appendChild(this.manipulationDOM['editEdgeSpan']);
    }
    if (this._selectionIsEmpty() == false) {
      this.manipulationDOM['seperatorLineDiv4'] = document.createElement('div');
      this.manipulationDOM['seperatorLineDiv4'].className = 'network-seperatorLine';

      this.manipulationDOM['deleteSpan'] = document.createElement('div');
      this.manipulationDOM['deleteSpan'].className = 'network-manipulationUI delete';
      this.manipulationDOM['deleteLabelSpan'] = document.createElement('div');
      this.manipulationDOM['deleteLabelSpan'].className = 'network-manipulationLabel';
      this.manipulationDOM['deleteLabelSpan'].innerHTML = locale['del'];
      this.manipulationDOM['deleteSpan'].appendChild(this.manipulationDOM['deleteLabelSpan']);

      this.manipulationDiv.appendChild(this.manipulationDOM['seperatorLineDiv4']);
      this.manipulationDiv.appendChild(this.manipulationDOM['deleteSpan']);
    }

    // bind the icons
    this._bindHammerToDiv(this.manipulationDOM['addNodeSpan'],'_createAddNodeToolbar');
    this._bindHammerToDiv(this.manipulationDOM['addEdgeSpan'],'_createAddEdgeToolbar');
    this._bindHammerToDiv(this.closeDiv,'_toggleEditMode');

    if (this._getSelectedNodeCount() == 1 && this.triggerFunctions.edit) {
      this._bindHammerToDiv(this.manipulationDOM['editNodeSpan'],'_editNode');
    }
    else if (this._getSelectedEdgeCount() == 1 && this._getSelectedNodeCount() == 0) {
      this._bindHammerToDiv(this.manipulationDOM['editEdgeSpan'],'_createEditEdgeToolbar');
    }
    if (this._selectionIsEmpty() == false) {
      this._bindHammerToDiv(this.manipulationDOM['deleteSpan'],'_deleteSelected');
    }

    var me = this;
    this.boundFunction = me._createManipulatorBar;
    this.on('select', this.boundFunction);
  }
  else {
    while (this.editModeDiv.hasChildNodes()) {
      this.editModeDiv.removeChild(this.editModeDiv.firstChild);
    }

    this.manipulationDOM['editModeSpan'] = document.createElement('div');
    this.manipulationDOM['editModeSpan'].className = 'network-manipulationUI edit editmode';
    this.manipulationDOM['editModeLabelSpan'] = document.createElement('div');
    this.manipulationDOM['editModeLabelSpan'].className = 'network-manipulationLabel';
    this.manipulationDOM['editModeLabelSpan'].innerHTML = locale['edit'];
    this.manipulationDOM['editModeSpan'].appendChild(this.manipulationDOM['editModeLabelSpan']);

    this.editModeDiv.appendChild(this.manipulationDOM['editModeSpan']);

    this._bindHammerToDiv(this.manipulationDOM['editModeSpan'],'_toggleEditMode');
  }
};


exports._bindHammerToDiv = function(domElement, funct) {
  var hammer = Hammer(domElement, {prevent_default: true});
  hammer.on('touch', this[funct].bind(this));
  this.manipulationHammers.push(hammer);
}


/**
 * Create the toolbar for adding Nodes
 *
 * @private
 */
exports._createAddNodeToolbar = function() {
  // clear the toolbar
  this._clearManipulatorBar();
  if (this.boundFunction) {
    this.off('select', this.boundFunction);
  }

  var locale = this.constants.locales[this.constants.locale];

  this.manipulationDOM = {};
  this.manipulationDOM['backSpan'] = document.createElement('div');
  this.manipulationDOM['backSpan'].className = 'network-manipulationUI back';
  this.manipulationDOM['backLabelSpan'] = document.createElement('div');
  this.manipulationDOM['backLabelSpan'].className = 'network-manipulationLabel';
  this.manipulationDOM['backLabelSpan'].innerHTML = locale['back'];
  this.manipulationDOM['backSpan'].appendChild(this.manipulationDOM['backLabelSpan']);

  this.manipulationDOM['seperatorLineDiv1'] = document.createElement('div');
  this.manipulationDOM['seperatorLineDiv1'].className = 'network-seperatorLine';

  this.manipulationDOM['descriptionSpan'] = document.createElement('div');
  this.manipulationDOM['descriptionSpan'].className = 'network-manipulationUI none';
  this.manipulationDOM['descriptionLabelSpan'] = document.createElement('div');
  this.manipulationDOM['descriptionLabelSpan'].className = 'network-manipulationLabel';
  this.manipulationDOM['descriptionLabelSpan'].innerHTML = locale['addDescription'];
  this.manipulationDOM['descriptionSpan'].appendChild(this.manipulationDOM['descriptionLabelSpan']);

  this.manipulationDiv.appendChild(this.manipulationDOM['backSpan']);
  this.manipulationDiv.appendChild(this.manipulationDOM['seperatorLineDiv1']);
  this.manipulationDiv.appendChild(this.manipulationDOM['descriptionSpan']);

  // bind the icon
  this._bindHammerToDiv(this.manipulationDOM['backSpan'],'_createManipulatorBar');

  // we use the boundFunction so we can reference it when we unbind it from the "select" event.
  var me = this;
  this.boundFunction = me._addNode;
  this.on('select', this.boundFunction);
};


/**
 * create the toolbar to connect nodes
 *
 * @private
 */
exports._createAddEdgeToolbar = function() {
  // clear the toolbar
  this._clearManipulatorBar();
  this._unselectAll(true);
  this.freezeSimulation(true);

  if (this.boundFunction) {
    this.off('select', this.boundFunction);
  }

  var locale = this.constants.locales[this.constants.locale];

  this._unselectAll();
  this.forceAppendSelection = false;
  this.blockConnectingEdgeSelection = true;

  this.manipulationDOM = {};
  this.manipulationDOM['backSpan'] = document.createElement('div');
  this.manipulationDOM['backSpan'].className = 'network-manipulationUI back';
  this.manipulationDOM['backLabelSpan'] = document.createElement('div');
  this.manipulationDOM['backLabelSpan'].className = 'network-manipulationLabel';
  this.manipulationDOM['backLabelSpan'].innerHTML = locale['back'];
  this.manipulationDOM['backSpan'].appendChild(this.manipulationDOM['backLabelSpan']);

  this.manipulationDOM['seperatorLineDiv1'] = document.createElement('div');
  this.manipulationDOM['seperatorLineDiv1'].className = 'network-seperatorLine';

  this.manipulationDOM['descriptionSpan'] = document.createElement('div');
  this.manipulationDOM['descriptionSpan'].className = 'network-manipulationUI none';
  this.manipulationDOM['descriptionLabelSpan'] = document.createElement('div');
  this.manipulationDOM['descriptionLabelSpan'].className = 'network-manipulationLabel';
  this.manipulationDOM['descriptionLabelSpan'].innerHTML = locale['edgeDescription'];
  this.manipulationDOM['descriptionSpan'].appendChild(this.manipulationDOM['descriptionLabelSpan']);

  this.manipulationDiv.appendChild(this.manipulationDOM['backSpan']);
  this.manipulationDiv.appendChild(this.manipulationDOM['seperatorLineDiv1']);
  this.manipulationDiv.appendChild(this.manipulationDOM['descriptionSpan']);

  // bind the icon
  this._bindHammerToDiv(this.manipulationDOM['backSpan'],'_createManipulatorBar');

  // we use the boundFunction so we can reference it when we unbind it from the "select" event.
  var me = this;
  this.boundFunction = me._handleConnect;
  this.on('select', this.boundFunction);

  // temporarily overload functions
  this.cachedFunctions["_handleTouch"] = this._handleTouch;
  this.cachedFunctions["_manipulationReleaseOverload"] = this._manipulationReleaseOverload;
  this.cachedFunctions["_handleDragStart"] = this._handleDragStart;
  this.cachedFunctions["_handleDragEnd"] = this._handleDragEnd;
  this.cachedFunctions["_handleOnHold"] = this._handleOnHold;
  this._handleTouch = this._handleConnect;
  this._manipulationReleaseOverload = function () {};
  this._handleOnHold    = function () {};
  this._handleDragStart = function () {};
  this._handleDragEnd   = this._finishConnect;

  // redraw to show the unselect
  this._redraw();
};

/**
 * create the toolbar to edit edges
 *
 * @private
 */
exports._createEditEdgeToolbar = function() {
  // clear the toolbar
  this._clearManipulatorBar();
  this.controlNodesActive = true;

  if (this.boundFunction) {
    this.off('select', this.boundFunction);
  }

  this.edgeBeingEdited = this._getSelectedEdge();
  this.edgeBeingEdited._enableControlNodes();

  var locale = this.constants.locales[this.constants.locale];

  this.manipulationDOM = {};
  this.manipulationDOM['backSpan'] = document.createElement('div');
  this.manipulationDOM['backSpan'].className = 'network-manipulationUI back';
  this.manipulationDOM['backLabelSpan'] = document.createElement('div');
  this.manipulationDOM['backLabelSpan'].className = 'network-manipulationLabel';
  this.manipulationDOM['backLabelSpan'].innerHTML = locale['back'];
  this.manipulationDOM['backSpan'].appendChild(this.manipulationDOM['backLabelSpan']);

  this.manipulationDOM['seperatorLineDiv1'] = document.createElement('div');
  this.manipulationDOM['seperatorLineDiv1'].className = 'network-seperatorLine';

  this.manipulationDOM['descriptionSpan'] = document.createElement('div');
  this.manipulationDOM['descriptionSpan'].className = 'network-manipulationUI none';
  this.manipulationDOM['descriptionLabelSpan'] = document.createElement('div');
  this.manipulationDOM['descriptionLabelSpan'].className = 'network-manipulationLabel';
  this.manipulationDOM['descriptionLabelSpan'].innerHTML = locale['editEdgeDescription'];
  this.manipulationDOM['descriptionSpan'].appendChild(this.manipulationDOM['descriptionLabelSpan']);

  this.manipulationDiv.appendChild(this.manipulationDOM['backSpan']);
  this.manipulationDiv.appendChild(this.manipulationDOM['seperatorLineDiv1']);
  this.manipulationDiv.appendChild(this.manipulationDOM['descriptionSpan']);

  // bind the icon
  this._bindHammerToDiv(this.manipulationDOM['backSpan'],'_createManipulatorBar');

  // temporarily overload functions
  this.cachedFunctions["_handleTouch"]      = this._handleTouch;
  this.cachedFunctions["_manipulationReleaseOverload"]  = this._manipulationReleaseOverload;
  this.cachedFunctions["_handleTap"]        = this._handleTap;
  this.cachedFunctions["_handleDragStart"]  = this._handleDragStart;
  this.cachedFunctions["_handleOnDrag"]     = this._handleOnDrag;
  this._handleTouch     = this._selectControlNode;
  this._handleTap       = function () {};
  this._handleOnDrag    = this._controlNodeDrag;
  this._handleDragStart = function () {}
  this._manipulationReleaseOverload = this._releaseControlNode;

  // redraw to show the unselect
  this._redraw();
};


/**
 * the function bound to the selection event. It checks if you want to connect a cluster and changes the description
 * to walk the user through the process.
 *
 * @private
 */
exports._selectControlNode = function(pointer) {
  this.edgeBeingEdited.controlNodes.from.unselect();
  this.edgeBeingEdited.controlNodes.to.unselect();
  this.selectedControlNode = this.edgeBeingEdited._getSelectedControlNode(this._XconvertDOMtoCanvas(pointer.x),this._YconvertDOMtoCanvas(pointer.y));
  if (this.selectedControlNode !== null) {
    this.selectedControlNode.select();
    this.freezeSimulation(true);
  }
  this._redraw();
};


/**
 * the function bound to the selection event. It checks if you want to connect a cluster and changes the description
 * to walk the user through the process.
 *
 * @private
 */
exports._controlNodeDrag = function(event) {
  var pointer = this._getPointer(event.gesture.center);
  if (this.selectedControlNode !== null && this.selectedControlNode !== undefined) {
    this.selectedControlNode.x = this._XconvertDOMtoCanvas(pointer.x);
    this.selectedControlNode.y = this._YconvertDOMtoCanvas(pointer.y);
  }
  this._redraw();
};


/**
 *
 * @param pointer
 * @private
 */
exports._releaseControlNode = function(pointer) {
  var newNode = this._getNodeAt(pointer);
  if (newNode !== null) {
    if (this.edgeBeingEdited.controlNodes.from.selected == true) {
      this.edgeBeingEdited._restoreControlNodes();
      this._editEdge(newNode.id, this.edgeBeingEdited.to.id);
      this.edgeBeingEdited.controlNodes.from.unselect();
    }
    if (this.edgeBeingEdited.controlNodes.to.selected == true) {
      this.edgeBeingEdited._restoreControlNodes();
      this._editEdge(this.edgeBeingEdited.from.id, newNode.id);
      this.edgeBeingEdited.controlNodes.to.unselect();
    }
  }
  else {
    this.edgeBeingEdited._restoreControlNodes();
  }
  this.freezeSimulation(false);
  this._redraw();
};

/**
 * the function bound to the selection event. It checks if you want to connect a cluster and changes the description
 * to walk the user through the process.
 *
 * @private
 */
exports._handleConnect = function(pointer) {
  if (this._getSelectedNodeCount() == 0) {
    var node = this._getNodeAt(pointer);

    if (node != null) {
      if (node.clusterSize > 1) {
        alert(this.constants.locales[this.constants.locale]['createEdgeError'])
      }
      else {
        this._selectObject(node,false);
        var supportNodes = this.sectors['support']['nodes'];

        // create a node the temporary line can look at
        supportNodes['targetNode'] = new Node({id:'targetNode'},{},{},this.constants);
        var targetNode = supportNodes['targetNode'];
        targetNode.x = node.x;
        targetNode.y = node.y;

        // create a temporary edge
        this.edges['connectionEdge'] = new Edge({id:"connectionEdge",from:node.id,to:targetNode.id}, this, this.constants);
        var connectionEdge = this.edges['connectionEdge'];
        connectionEdge.from = node;
        connectionEdge.connected = true;
        connectionEdge.options.smoothCurves = {enabled: true,
            dynamic: false,
            type: "continuous",
            roundness: 0.5
        };
        connectionEdge.selected = true;
        connectionEdge.to = targetNode;

        this.cachedFunctions["_handleOnDrag"] = this._handleOnDrag;
        var me = this;
        this._handleOnDrag = function(event) {
          var pointer = this._getPointer(event.gesture.center);
          var connectionEdge = me.edges['connectionEdge'];
          connectionEdge.to.x = me._XconvertDOMtoCanvas(pointer.x);
          connectionEdge.to.y = me._YconvertDOMtoCanvas(pointer.y);
          me._redraw();
        };

        this.moving = true;
        this.start();
      }
    }
  }
};

exports._finishConnect = function(event) {
  if (this._getSelectedNodeCount() == 1) {
    var pointer = this._getPointer(event.gesture.center);
    // restore the drag function
    this._handleOnDrag = this.cachedFunctions["_handleOnDrag"];
    delete this.cachedFunctions["_handleOnDrag"];

    // remember the edge id
    var connectFromId = this.edges['connectionEdge'].fromId;

    // remove the temporary nodes and edge
    delete this.edges['connectionEdge'];
    delete this.sectors['support']['nodes']['targetNode'];
    delete this.sectors['support']['nodes']['targetViaNode'];

    var node = this._getNodeAt(pointer);
    if (node != null) {
      if (node.clusterSize > 1) {
        alert(this.constants.locales[this.constants.locale]["createEdgeError"])
      }
      else {
        this._createEdge(connectFromId,node.id);
        this._createManipulatorBar();
      }
    }
    this._unselectAll();
  }
};


/**
 * Adds a node on the specified location
 */
exports._addNode = function() {
  if (this._selectionIsEmpty() && this.editMode == true) {
    var positionObject = this._pointerToPositionObject(this.pointerPosition);
    var defaultData = {id:util.randomUUID(),x:positionObject.left,y:positionObject.top,label:"new",allowedToMoveX:true,allowedToMoveY:true};
    if (this.triggerFunctions.add) {
      if (this.triggerFunctions.add.length == 2) {
        var me = this;
        this.triggerFunctions.add(defaultData, function(finalizedData) {
          me.nodesData.add(finalizedData);
          me._createManipulatorBar();
          me.moving = true;
          me.start();
        });
      }
      else {
        throw new Error('The function for add does not support two arguments (data,callback)');
        this._createManipulatorBar();
        this.moving = true;
        this.start();
      }
    }
    else {
      this.nodesData.add(defaultData);
      this._createManipulatorBar();
      this.moving = true;
      this.start();
    }
  }
};


/**
 * connect two nodes with a new edge.
 *
 * @private
 */
exports._createEdge = function(sourceNodeId,targetNodeId) {
  if (this.editMode == true) {
    var defaultData = {from:sourceNodeId, to:targetNodeId};
    if (this.triggerFunctions.connect) {
      if (this.triggerFunctions.connect.length == 2) {
        var me = this;
        this.triggerFunctions.connect(defaultData, function(finalizedData) {
          me.edgesData.add(finalizedData);
          me.moving = true;
          me.start();
        });
      }
      else {
        throw new Error('The function for connect does not support two arguments (data,callback)');
        this.moving = true;
        this.start();
      }
    }
    else {
      this.edgesData.add(defaultData);
      this.moving = true;
      this.start();
    }
  }
};

/**
 * connect two nodes with a new edge.
 *
 * @private
 */
exports._editEdge = function(sourceNodeId,targetNodeId) {
  if (this.editMode == true) {
    var defaultData = {id: this.edgeBeingEdited.id, from:sourceNodeId, to:targetNodeId};
    if (this.triggerFunctions.editEdge) {
      if (this.triggerFunctions.editEdge.length == 2) {
        var me = this;
        this.triggerFunctions.editEdge(defaultData, function(finalizedData) {
          me.edgesData.update(finalizedData);
          me.moving = true;
          me.start();
        });
      }
      else {
        throw new Error('The function for edit does not support two arguments (data, callback)');
        this.moving = true;
        this.start();
      }
    }
    else {
      this.edgesData.update(defaultData);
      this.moving = true;
      this.start();
    }
  }
};

/**
 * Create the toolbar to edit the selected node. The label and the color can be changed. Other colors are derived from the chosen color.
 *
 * @private
 */
exports._editNode = function() {
  if (this.triggerFunctions.edit && this.editMode == true) {
    var node = this._getSelectedNode();
    var data = {id:node.id,
      label: node.label,
      group: node.options.group,
      shape: node.options.shape,
      color: {
        background:node.options.color.background,
        border:node.options.color.border,
        highlight: {
          background:node.options.color.highlight.background,
          border:node.options.color.highlight.border
        }
      }};
    if (this.triggerFunctions.edit.length == 2) {
      var me = this;
      this.triggerFunctions.edit(data, function (finalizedData) {
        me.nodesData.update(finalizedData);
        me._createManipulatorBar();
        me.moving = true;
        me.start();
      });
    }
    else {
      throw new Error('The function for edit does not support two arguments (data, callback)');
    }
  }
  else {
    throw new Error('No edit function has been bound to this button');
  }
};




/**
 * delete everything in the selection
 *
 * @private
 */
exports._deleteSelected = function() {
  if (!this._selectionIsEmpty() && this.editMode == true) {
    if (!this._clusterInSelection()) {
      var selectedNodes = this.getSelectedNodes();
      var selectedEdges = this.getSelectedEdges();
      if (this.triggerFunctions.del) {
        var me = this;
        var data = {nodes: selectedNodes, edges: selectedEdges};
        if (this.triggerFunctions.del.length == 2) {
          this.triggerFunctions.del(data, function (finalizedData) {
            me.edgesData.remove(finalizedData.edges);
            me.nodesData.remove(finalizedData.nodes);
            me._unselectAll();
            me.moving = true;
            me.start();
          });
        }
        else {
          throw new Error('The function for delete does not support two arguments (data, callback)')
        }
      }
      else {
        this.edgesData.remove(selectedEdges);
        this.nodesData.remove(selectedNodes);
        this._unselectAll();
        this.moving = true;
        this.start();
      }
    }
    else {
      alert(this.constants.locales[this.constants.locale]["deleteClusterError"]);
    }
  }
};

},{"../../module/hammer":6,"../../util":30,"../Edge":8,"../Node":12}],20:[function(require,module,exports){
var PhysicsMixin = require('./physics/PhysicsMixin');
var ClusterMixin = require('./ClusterMixin');
var SectorsMixin = require('./SectorsMixin');
var SelectionMixin = require('./SelectionMixin');
var ManipulationMixin = require('./ManipulationMixin');
var NavigationMixin = require('./NavigationMixin');
var HierarchicalLayoutMixin = require('./HierarchicalLayoutMixin');

/**
 * Load a mixin into the network object
 *
 * @param {Object} sourceVariable | this object has to contain functions.
 * @private
 */
exports._loadMixin = function (sourceVariable) {
  for (var mixinFunction in sourceVariable) {
    if (sourceVariable.hasOwnProperty(mixinFunction)) {
      this[mixinFunction] = sourceVariable[mixinFunction];
    }
  }
};


/**
 * removes a mixin from the network object.
 *
 * @param {Object} sourceVariable | this object has to contain functions.
 * @private
 */
exports._clearMixin = function (sourceVariable) {
  for (var mixinFunction in sourceVariable) {
    if (sourceVariable.hasOwnProperty(mixinFunction)) {
      this[mixinFunction] = undefined;
    }
  }
};


/**
 * Mixin the physics system and initialize the parameters required.
 *
 * @private
 */
exports._loadPhysicsSystem = function () {
  this._loadMixin(PhysicsMixin);
  this._loadSelectedForceSolver();
  if (this.constants.configurePhysics == true) {
    this._loadPhysicsConfiguration();
  }
  else {
    this._cleanupPhysicsConfiguration();
  }
};


/**
 * Mixin the cluster system and initialize the parameters required.
 *
 * @private
 */
exports._loadClusterSystem = function () {
  this.clusterSession = 0;
  this.hubThreshold = 5;
  this._loadMixin(ClusterMixin);
};


/**
 * Mixin the sector system and initialize the parameters required
 *
 * @private
 */
exports._loadSectorSystem = function () {
  this.sectors = {};
  this.activeSector = ["default"];
  this.sectors["active"] = {};
  this.sectors["active"]["default"] = {"nodes": {},
    "edges": {},
    "nodeIndices": [],
    "formationScale": 1.0,
    "drawingNode": undefined };
  this.sectors["frozen"] = {};
  this.sectors["support"] = {"nodes": {},
    "edges": {},
    "nodeIndices": [],
    "formationScale": 1.0,
    "drawingNode": undefined };

  this.nodeIndices = this.sectors["active"]["default"]["nodeIndices"];  // the node indices list is used to speed up the computation of the repulsion fields

  this._loadMixin(SectorsMixin);
};


/**
 * Mixin the selection system and initialize the parameters required
 *
 * @private
 */
exports._loadSelectionSystem = function () {
  this.selectionObj = {nodes: {}, edges: {}};

  this._loadMixin(SelectionMixin);
};


/**
 * Mixin the navigationUI (User Interface) system and initialize the parameters required
 *
 * @private
 */
exports._loadManipulationSystem = function () {
  // reset global variables -- these are used by the selection of nodes and edges.
  this.blockConnectingEdgeSelection = false;
  this.forceAppendSelection = false;

  if (this.constants.dataManipulation.enabled == true) {
    // load the manipulator HTML elements. All styling done in css.
    if (this.manipulationDiv === undefined) {
      this.manipulationDiv = document.createElement('div');
      this.manipulationDiv.className = 'network-manipulationDiv';
      if (this.editMode == true) {
        this.manipulationDiv.style.display = "block";
      }
      else {
        this.manipulationDiv.style.display = "none";
      }
      this.frame.appendChild(this.manipulationDiv);
    }

    if (this.editModeDiv === undefined) {
      this.editModeDiv = document.createElement('div');
      this.editModeDiv.className = 'network-manipulation-editMode';
      if (this.editMode == true) {
        this.editModeDiv.style.display = "none";
      }
      else {
        this.editModeDiv.style.display = "block";
      }
      this.frame.appendChild(this.editModeDiv);
    }

    if (this.closeDiv === undefined) {
      this.closeDiv = document.createElement('div');
      this.closeDiv.className = 'network-manipulation-closeDiv';
      this.closeDiv.style.display = this.manipulationDiv.style.display;
      this.frame.appendChild(this.closeDiv);
    }

    // load the manipulation functions
    this._loadMixin(ManipulationMixin);

    // create the manipulator toolbar
    this._createManipulatorBar();
  }
  else {
    if (this.manipulationDiv !== undefined) {
      // removes all the bindings and overloads
      this._createManipulatorBar();

      // remove the manipulation divs
      this.frame.removeChild(this.manipulationDiv);
      this.frame.removeChild(this.editModeDiv);
      this.frame.removeChild(this.closeDiv);

      this.manipulationDiv = undefined;
      this.editModeDiv = undefined;
      this.closeDiv = undefined;
      // remove the mixin functions
      this._clearMixin(ManipulationMixin);
    }
  }
};


/**
 * Mixin the navigation (User Interface) system and initialize the parameters required
 *
 * @private
 */
exports._loadNavigationControls = function () {
  this._loadMixin(NavigationMixin);
  // the clean function removes the button divs, this is done to remove the bindings.
  this._cleanNavigation();
  if (this.constants.navigation.enabled == true) {
    this._loadNavigationElements();
  }
};


/**
 * Mixin the hierarchical layout system.
 *
 * @private
 */
exports._loadHierarchySystem = function () {
  this._loadMixin(HierarchicalLayoutMixin);
};

},{"./ClusterMixin":17,"./HierarchicalLayoutMixin":18,"./ManipulationMixin":19,"./NavigationMixin":21,"./SectorsMixin":22,"./SelectionMixin":23,"./physics/PhysicsMixin":26}],21:[function(require,module,exports){
var util = require('../../util');
var Hammer = require('../../module/hammer');

exports._cleanNavigation = function() {
  // clean hammer bindings
  if (this.navigationHammers.length != 0) {
    for (var i = 0; i < this.navigationHammers.length; i++) {
      this.navigationHammers[i].dispose();
    }
    this.navigationHammers = [];
  }

  this._navigationReleaseOverload = function () {};

  // clean up previous navigation items
  if (this.navigationDOM && this.navigationDOM['wrapper'] && this.navigationDOM['wrapper'].parentNode) {
    this.navigationDOM['wrapper'].parentNode.removeChild(this.navigationDOM['wrapper']);
  }
};

/**
 * Creation of the navigation controls nodes. They are drawn over the rest of the nodes and are not affected by scale and translation
 * they have a triggerFunction which is called on click. If the position of the navigation controls is dependent
 * on this.frame.canvas.clientWidth or this.frame.canvas.clientHeight, we flag horizontalAlignLeft and verticalAlignTop false.
 * This means that the location will be corrected by the _relocateNavigation function on a size change of the canvas.
 *
 * @private
 */
exports._loadNavigationElements = function() {
  this._cleanNavigation();

  this.navigationDOM = {};
  var navigationDivs = ['up','down','left','right','zoomIn','zoomOut','zoomExtends'];
  var navigationDivActions = ['_moveUp','_moveDown','_moveLeft','_moveRight','_zoomIn','_zoomOut','_zoomExtent'];

  this.navigationDOM['wrapper'] = document.createElement('div');
  this.frame.appendChild(this.navigationDOM['wrapper']);

  for (var i = 0; i < navigationDivs.length; i++) {
    this.navigationDOM[navigationDivs[i]] = document.createElement('div');
    this.navigationDOM[navigationDivs[i]].className = 'network-navigation ' + navigationDivs[i];
    this.navigationDOM['wrapper'].appendChild(this.navigationDOM[navigationDivs[i]]);

    var hammer = Hammer(this.navigationDOM[navigationDivs[i]], {prevent_default: true});
    hammer.on('touch', this[navigationDivActions[i]].bind(this));
    this.navigationHammers.push(hammer);
  }

  this._navigationReleaseOverload = this._stopMovement;

};


/**
 * this stops all movement induced by the navigation buttons
 *
 * @private
 */
exports._zoomExtent = function(event) {
  this.zoomExtent({duration:700});
  event.stopPropagation();
};

/**
 * this stops all movement induced by the navigation buttons
 *
 * @private
 */
exports._stopMovement = function() {
  this._xStopMoving();
  this._yStopMoving();
  this._stopZoom();
};


/**
 * move the screen up
 * By using the increments, instead of adding a fixed number to the translation, we keep fluent and
 * instant movement. The onKeypress event triggers immediately, then pauses, then triggers frequently
 * To avoid this behaviour, we do the translation in the start loop.
 *
 * @private
 */
exports._moveUp = function(event) {
  this.yIncrement = this.constants.keyboard.speed.y;
  this.start(); // if there is no node movement, the calculation wont be done
  event.preventDefault();
};


/**
 * move the screen down
 * @private
 */
exports._moveDown = function(event) {
  this.yIncrement = -this.constants.keyboard.speed.y;
  this.start(); // if there is no node movement, the calculation wont be done
  event.preventDefault();
};


/**
 * move the screen left
 * @private
 */
exports._moveLeft = function(event) {
  this.xIncrement = this.constants.keyboard.speed.x;
  this.start(); // if there is no node movement, the calculation wont be done
  event.preventDefault();
};


/**
 * move the screen right
 * @private
 */
exports._moveRight = function(event) {
  this.xIncrement = -this.constants.keyboard.speed.y;
  this.start(); // if there is no node movement, the calculation wont be done
  event.preventDefault();
};


/**
 * Zoom in, using the same method as the movement.
 * @private
 */
exports._zoomIn = function(event) {
  this.zoomIncrement = this.constants.keyboard.speed.zoom;
  this.start(); // if there is no node movement, the calculation wont be done
  event.preventDefault();
};


/**
 * Zoom out
 * @private
 */
exports._zoomOut = function(event) {
  this.zoomIncrement = -this.constants.keyboard.speed.zoom;
  this.start(); // if there is no node movement, the calculation wont be done
  event.preventDefault();
};


/**
 * Stop zooming and unhighlight the zoom controls
 * @private
 */
exports._stopZoom = function(event) {
  this.zoomIncrement = 0;
  event && event.preventDefault();
};


/**
 * Stop moving in the Y direction and unHighlight the up and down
 * @private
 */
exports._yStopMoving = function(event) {
  this.yIncrement = 0;
  event && event.preventDefault();
};


/**
 * Stop moving in the X direction and unHighlight left and right.
 * @private
 */
exports._xStopMoving = function(event) {
  this.xIncrement = 0;
  event && event.preventDefault();
};

},{"../../module/hammer":6,"../../util":30}],22:[function(require,module,exports){
var util = require('../../util');
var Node = require('../Node');

/**
 * Creation of the SectorMixin var.
 *
 * This contains all the functions the Network object can use to employ the sector system.
 * The sector system is always used by Network, though the benefits only apply to the use of clustering.
 * If clustering is not used, there is no overhead except for a duplicate object with references to nodes and edges.
 */

/**
 * This function is only called by the setData function of the Network object.
 * This loads the global references into the active sector. This initializes the sector.
 *
 * @private
 */
exports._putDataInSector = function() {
  this.sectors["active"][this._sector()].nodes = this.nodes;
  this.sectors["active"][this._sector()].edges = this.edges;
  this.sectors["active"][this._sector()].nodeIndices = this.nodeIndices;
};


/**
 *  /**
 * This function sets the global references to nodes, edges and nodeIndices back to
 * those of the supplied (active) sector. If a type is defined, do the specific type
 *
 * @param {String} sectorId
 * @param {String} [sectorType] | "active" or "frozen"
 * @private
 */
exports._switchToSector = function(sectorId, sectorType) {
  if (sectorType === undefined || sectorType == "active") {
    this._switchToActiveSector(sectorId);
  }
  else {
    this._switchToFrozenSector(sectorId);
  }
};


/**
 * This function sets the global references to nodes, edges and nodeIndices back to
 * those of the supplied active sector.
 *
 * @param sectorId
 * @private
 */
exports._switchToActiveSector = function(sectorId) {
  this.nodeIndices = this.sectors["active"][sectorId]["nodeIndices"];
  this.nodes       = this.sectors["active"][sectorId]["nodes"];
  this.edges       = this.sectors["active"][sectorId]["edges"];
};


/**
 * This function sets the global references to nodes, edges and nodeIndices back to
 * those of the supplied active sector.
 *
 * @private
 */
exports._switchToSupportSector = function() {
  this.nodeIndices = this.sectors["support"]["nodeIndices"];
  this.nodes       = this.sectors["support"]["nodes"];
  this.edges       = this.sectors["support"]["edges"];
};


/**
 * This function sets the global references to nodes, edges and nodeIndices back to
 * those of the supplied frozen sector.
 *
 * @param sectorId
 * @private
 */
exports._switchToFrozenSector = function(sectorId) {
  this.nodeIndices = this.sectors["frozen"][sectorId]["nodeIndices"];
  this.nodes       = this.sectors["frozen"][sectorId]["nodes"];
  this.edges       = this.sectors["frozen"][sectorId]["edges"];
};


/**
 * This function sets the global references to nodes, edges and nodeIndices back to
 * those of the currently active sector.
 *
 * @private
 */
exports._loadLatestSector = function() {
  this._switchToSector(this._sector());
};


/**
 * This function returns the currently active sector Id
 *
 * @returns {String}
 * @private
 */
exports._sector = function() {
  return this.activeSector[this.activeSector.length-1];
};


/**
 * This function returns the previously active sector Id
 *
 * @returns {String}
 * @private
 */
exports._previousSector = function() {
  if (this.activeSector.length > 1) {
    return this.activeSector[this.activeSector.length-2];
  }
  else {
    throw new TypeError('there are not enough sectors in the this.activeSector array.');
  }
};


/**
 * We add the active sector at the end of the this.activeSector array
 * This ensures it is the currently active sector returned by _sector() and it reaches the top
 * of the activeSector stack. When we reverse our steps we move from the end to the beginning of this stack.
 *
 * @param newId
 * @private
 */
exports._setActiveSector = function(newId) {
  this.activeSector.push(newId);
};


/**
 * We remove the currently active sector id from the active sector stack. This happens when
 * we reactivate the previously active sector
 *
 * @private
 */
exports._forgetLastSector = function() {
  this.activeSector.pop();
};


/**
 * This function creates a new active sector with the supplied newId. This newId
 * is the expanding node id.
 *
 * @param {String} newId   | Id of the new active sector
 * @private
 */
exports._createNewSector = function(newId) {
  // create the new sector
  this.sectors["active"][newId] = {"nodes":{},
                                   "edges":{},
                                   "nodeIndices":[],
                                   "formationScale": this.scale,
                                   "drawingNode": undefined};

  // create the new sector render node. This gives visual feedback that you are in a new sector.
  this.sectors["active"][newId]['drawingNode'] = new Node(
      {id:newId,
        color: {
          background: "#eaefef",
          border: "495c5e"
        }
      },{},{},this.constants);
  this.sectors["active"][newId]['drawingNode'].clusterSize = 2;
};


/**
 * This function removes the currently active sector. This is called when we create a new
 * active sector.
 *
 * @param {String} sectorId   | Id of the active sector that will be removed
 * @private
 */
exports._deleteActiveSector = function(sectorId) {
  delete this.sectors["active"][sectorId];
};


/**
 * This function removes the currently active sector. This is called when we reactivate
 * the previously active sector.
 *
 * @param {String} sectorId   | Id of the active sector that will be removed
 * @private
 */
exports._deleteFrozenSector = function(sectorId) {
  delete this.sectors["frozen"][sectorId];
};


/**
 * Freezing an active sector means moving it from the "active" object to the "frozen" object.
 * We copy the references, then delete the active entree.
 *
 * @param sectorId
 * @private
 */
exports._freezeSector = function(sectorId) {
  // we move the set references from the active to the frozen stack.
  this.sectors["frozen"][sectorId] = this.sectors["active"][sectorId];

  // we have moved the sector data into the frozen set, we now remove it from the active set
  this._deleteActiveSector(sectorId);
};


/**
 * This is the reverse operation of _freezeSector. Activating means moving the sector from the "frozen"
 * object to the "active" object.
 *
 * @param sectorId
 * @private
 */
exports._activateSector = function(sectorId) {
  // we move the set references from the frozen to the active stack.
  this.sectors["active"][sectorId] = this.sectors["frozen"][sectorId];

  // we have moved the sector data into the active set, we now remove it from the frozen stack
  this._deleteFrozenSector(sectorId);
};


/**
 * This function merges the data from the currently active sector with a frozen sector. This is used
 * in the process of reverting back to the previously active sector.
 * The data that is placed in the frozen (the previously active) sector is the node that has been removed from it
 * upon the creation of a new active sector.
 *
 * @param sectorId
 * @private
 */
exports._mergeThisWithFrozen = function(sectorId) {
  // copy all nodes
  for (var nodeId in this.nodes) {
    if (this.nodes.hasOwnProperty(nodeId)) {
      this.sectors["frozen"][sectorId]["nodes"][nodeId] = this.nodes[nodeId];
    }
  }

  // copy all edges (if not fully clustered, else there are no edges)
  for (var edgeId in this.edges) {
    if (this.edges.hasOwnProperty(edgeId)) {
      this.sectors["frozen"][sectorId]["edges"][edgeId] = this.edges[edgeId];
    }
  }

  // merge the nodeIndices
  for (var i = 0; i < this.nodeIndices.length; i++) {
    this.sectors["frozen"][sectorId]["nodeIndices"].push(this.nodeIndices[i]);
  }
};


/**
 * This clusters the sector to one cluster. It was a single cluster before this process started so
 * we revert to that state. The clusterToFit function with a maximum size of 1 node does this.
 *
 * @private
 */
exports._collapseThisToSingleCluster = function() {
  this.clusterToFit(1,false);
};


/**
 * We create a new active sector from the node that we want to open.
 *
 * @param node
 * @private
 */
exports._addSector = function(node) {
  // this is the currently active sector
  var sector = this._sector();

//    // this should allow me to select nodes from a frozen set.
//    if (this.sectors['active'][sector]["nodes"].hasOwnProperty(node.id)) {
//      console.log("the node is part of the active sector");
//    }
//    else {
//      console.log("I dont know what the fuck happened!!");
//    }

  // when we switch to a new sector, we remove the node that will be expanded from the current nodes list.
  delete this.nodes[node.id];

  var unqiueIdentifier = util.randomUUID();

  // we fully freeze the currently active sector
  this._freezeSector(sector);

  // we create a new active sector. This sector has the Id of the node to ensure uniqueness
  this._createNewSector(unqiueIdentifier);

  // we add the active sector to the sectors array to be able to revert these steps later on
  this._setActiveSector(unqiueIdentifier);

  // we redirect the global references to the new sector's references. this._sector() now returns unqiueIdentifier
  this._switchToSector(this._sector());

  // finally we add the node we removed from our previous active sector to the new active sector
  this.nodes[node.id] = node;
};


/**
 * We close the sector that is currently open and revert back to the one before.
 * If the active sector is the "default" sector, nothing happens.
 *
 * @private
 */
exports._collapseSector = function() {
  // the currently active sector
  var sector = this._sector();

  // we cannot collapse the default sector
  if (sector != "default") {
    if ((this.nodeIndices.length == 1) ||
     (this.sectors["active"][sector]["drawingNode"].width*this.scale < this.constants.clustering.screenSizeThreshold * this.frame.canvas.clientWidth) ||
     (this.sectors["active"][sector]["drawingNode"].height*this.scale < this.constants.clustering.screenSizeThreshold * this.frame.canvas.clientHeight)) {
      var previousSector = this._previousSector();

      // we collapse the sector back to a single cluster
      this._collapseThisToSingleCluster();

      // we move the remaining nodes, edges and nodeIndices to the previous sector.
      // This previous sector is the one we will reactivate
      this._mergeThisWithFrozen(previousSector);

      // the previously active (frozen) sector now has all the data from the currently active sector.
      // we can now delete the active sector.
      this._deleteActiveSector(sector);

      // we activate the previously active (and currently frozen) sector.
      this._activateSector(previousSector);

      // we load the references from the newly active sector into the global references
      this._switchToSector(previousSector);

      // we forget the previously active sector because we reverted to the one before
      this._forgetLastSector();

      // finally, we update the node index list.
      this._updateNodeIndexList();

      // we refresh the list with calulation nodes and calculation node indices.
      this._updateCalculationNodes();
    }
  }
};


/**
 * This runs a function in all active sectors. This is used in _redraw() and the _initializeForceCalculation().
 *
 * @param {String} runFunction  |   This is the NAME of a function we want to call in all active sectors
 *                              |   we dont pass the function itself because then the "this" is the window object
 *                              |   instead of the Network object
 * @param {*} [argument]            |   Optional: arguments to pass to the runFunction
 * @private
 */
exports._doInAllActiveSectors = function(runFunction,argument) {
  var returnValues = [];
  if (argument === undefined) {
    for (var sector in this.sectors["active"]) {
      if (this.sectors["active"].hasOwnProperty(sector)) {
        // switch the global references to those of this sector
        this._switchToActiveSector(sector);
        returnValues.push( this[runFunction]() );
      }
    }
  }
  else {
    for (var sector in this.sectors["active"]) {
      if (this.sectors["active"].hasOwnProperty(sector)) {
        // switch the global references to those of this sector
        this._switchToActiveSector(sector);
        var args = Array.prototype.splice.call(arguments, 1);
        if (args.length > 1) {
          returnValues.push( this[runFunction](args[0],args[1]) );
        }
        else {
          returnValues.push( this[runFunction](argument) );
        }
      }
    }
  }
  // we revert the global references back to our active sector
  this._loadLatestSector();
  return returnValues;
};


/**
 * This runs a function in all active sectors. This is used in _redraw() and the _initializeForceCalculation().
 *
 * @param {String} runFunction  |   This is the NAME of a function we want to call in all active sectors
 *                              |   we dont pass the function itself because then the "this" is the window object
 *                              |   instead of the Network object
 * @param {*} [argument]        |   Optional: arguments to pass to the runFunction
 * @private
 */
exports._doInSupportSector = function(runFunction,argument) {
  var returnValues = false;
  if (argument === undefined) {
    this._switchToSupportSector();
    returnValues = this[runFunction]();
  }
  else {
    this._switchToSupportSector();
    var args = Array.prototype.splice.call(arguments, 1);
    if (args.length > 1) {
      returnValues = this[runFunction](args[0],args[1]);
    }
    else {
      returnValues = this[runFunction](argument);
    }
  }
  // we revert the global references back to our active sector
  this._loadLatestSector();
  return returnValues;
};


/**
 * This runs a function in all frozen sectors. This is used in the _redraw().
 *
 * @param {String} runFunction  |   This is the NAME of a function we want to call in all active sectors
 *                              |   we don't pass the function itself because then the "this" is the window object
 *                              |   instead of the Network object
 * @param {*} [argument]            |   Optional: arguments to pass to the runFunction
 * @private
 */
exports._doInAllFrozenSectors = function(runFunction,argument) {
  if (argument === undefined) {
    for (var sector in this.sectors["frozen"]) {
      if (this.sectors["frozen"].hasOwnProperty(sector)) {
        // switch the global references to those of this sector
        this._switchToFrozenSector(sector);
        this[runFunction]();
      }
    }
  }
  else {
    for (var sector in this.sectors["frozen"]) {
      if (this.sectors["frozen"].hasOwnProperty(sector)) {
        // switch the global references to those of this sector
        this._switchToFrozenSector(sector);
        var args = Array.prototype.splice.call(arguments, 1);
        if (args.length > 1) {
          this[runFunction](args[0],args[1]);
        }
        else {
          this[runFunction](argument);
        }
      }
    }
  }
  this._loadLatestSector();
};


/**
 * This runs a function in all sectors. This is used in the _redraw().
 *
 * @param {String} runFunction  |   This is the NAME of a function we want to call in all active sectors
 *                              |   we don't pass the function itself because then the "this" is the window object
 *                              |   instead of the Network object
 * @param {*} [argument]        |   Optional: arguments to pass to the runFunction
 * @private
 */
exports._doInAllSectors = function(runFunction,argument) {
  var args = Array.prototype.splice.call(arguments, 1);
  if (argument === undefined) {
    this._doInAllActiveSectors(runFunction);
    this._doInAllFrozenSectors(runFunction);
  }
  else {
    if (args.length > 1) {
      this._doInAllActiveSectors(runFunction,args[0],args[1]);
      this._doInAllFrozenSectors(runFunction,args[0],args[1]);
    }
    else {
      this._doInAllActiveSectors(runFunction,argument);
      this._doInAllFrozenSectors(runFunction,argument);
    }
  }
};


/**
 * This clears the nodeIndices list. We cannot use this.nodeIndices = [] because we would break the link with the
 * active sector. Thus we clear the nodeIndices in the active sector, then reconnect the this.nodeIndices to it.
 *
 * @private
 */
exports._clearNodeIndexList = function() {
  var sector = this._sector();
  this.sectors["active"][sector]["nodeIndices"] = [];
  this.nodeIndices = this.sectors["active"][sector]["nodeIndices"];
};


/**
 * Draw the encompassing sector node
 *
 * @param ctx
 * @param sectorType
 * @private
 */
exports._drawSectorNodes = function(ctx,sectorType) {
  var minY = 1e9, maxY = -1e9, minX = 1e9, maxX = -1e9, node;
  for (var sector in this.sectors[sectorType]) {
    if (this.sectors[sectorType].hasOwnProperty(sector)) {
      if (this.sectors[sectorType][sector]["drawingNode"] !== undefined) {

        this._switchToSector(sector,sectorType);

        minY = 1e9; maxY = -1e9; minX = 1e9; maxX = -1e9;
        for (var nodeId in this.nodes) {
          if (this.nodes.hasOwnProperty(nodeId)) {
            node = this.nodes[nodeId];
            node.resize(ctx);
            if (minX > node.x - 0.5 * node.width) {minX = node.x - 0.5 * node.width;}
            if (maxX < node.x + 0.5 * node.width) {maxX = node.x + 0.5 * node.width;}
            if (minY > node.y - 0.5 * node.height) {minY = node.y - 0.5 * node.height;}
            if (maxY < node.y + 0.5 * node.height) {maxY = node.y + 0.5 * node.height;}
          }
        }
        node = this.sectors[sectorType][sector]["drawingNode"];
        node.x = 0.5 * (maxX + minX);
        node.y = 0.5 * (maxY + minY);
        node.width = 2 * (node.x - minX);
        node.height = 2 * (node.y - minY);
        node.options.radius = Math.sqrt(Math.pow(0.5*node.width,2) + Math.pow(0.5*node.height,2));
        node.setScale(this.scale);
        node._drawCircle(ctx);
      }
    }
  }
};

exports._drawAllSectorNodes = function(ctx) {
  this._drawSectorNodes(ctx,"frozen");
  this._drawSectorNodes(ctx,"active");
  this._loadLatestSector();
};

},{"../../util":30,"../Node":12}],23:[function(require,module,exports){
var Node = require('../Node');

/**
 * This function can be called from the _doInAllSectors function
 *
 * @param object
 * @param overlappingNodes
 * @private
 */
exports._getNodesOverlappingWith = function(object, overlappingNodes) {
  var nodes = this.nodes;
  for (var nodeId in nodes) {
    if (nodes.hasOwnProperty(nodeId)) {
      if (nodes[nodeId].isOverlappingWith(object)) {
        overlappingNodes.push(nodeId);
      }
    }
  }
};

/**
 * retrieve all nodes overlapping with given object
 * @param {Object} object  An object with parameters left, top, right, bottom
 * @return {Number[]}   An array with id's of the overlapping nodes
 * @private
 */
exports._getAllNodesOverlappingWith = function (object) {
  var overlappingNodes = [];
  this._doInAllActiveSectors("_getNodesOverlappingWith",object,overlappingNodes);
  return overlappingNodes;
};


/**
 * Return a position object in canvasspace from a single point in screenspace
 *
 * @param pointer
 * @returns {{left: number, top: number, right: number, bottom: number}}
 * @private
 */
exports._pointerToPositionObject = function(pointer) {
  var x = this._XconvertDOMtoCanvas(pointer.x);
  var y = this._YconvertDOMtoCanvas(pointer.y);

  return {
    left:   x,
    top:    y,
    right:  x,
    bottom: y
  };
};


/**
 * Get the top node at the a specific point (like a click)
 *
 * @param {{x: Number, y: Number}} pointer
 * @return {Node | null} node
 * @private
 */
exports._getNodeAt = function (pointer) {
  // we first check if this is an navigation controls element
  var positionObject = this._pointerToPositionObject(pointer);
  var overlappingNodes = this._getAllNodesOverlappingWith(positionObject);

  // if there are overlapping nodes, select the last one, this is the
  // one which is drawn on top of the others
  if (overlappingNodes.length > 0) {
     return this.nodes[overlappingNodes[overlappingNodes.length - 1]];
  }
  else {
    return null;
  }
};


/**
 * retrieve all edges overlapping with given object, selector is around center
 * @param {Object} object  An object with parameters left, top, right, bottom
 * @return {Number[]}   An array with id's of the overlapping nodes
 * @private
 */
exports._getEdgesOverlappingWith = function (object, overlappingEdges) {
  var edges = this.edges;
  for (var edgeId in edges) {
    if (edges.hasOwnProperty(edgeId)) {
      if (edges[edgeId].isOverlappingWith(object)) {
        overlappingEdges.push(edgeId);
      }
    }
  }
};


/**
 * retrieve all nodes overlapping with given object
 * @param {Object} object  An object with parameters left, top, right, bottom
 * @return {Number[]}   An array with id's of the overlapping nodes
 * @private
 */
exports._getAllEdgesOverlappingWith = function (object) {
  var overlappingEdges = [];
  this._doInAllActiveSectors("_getEdgesOverlappingWith",object,overlappingEdges);
  return overlappingEdges;
};

/**
 * Place holder. To implement change the _getNodeAt to a _getObjectAt. Have the _getObjectAt call
 * _getNodeAt and _getEdgesAt, then priortize the selection to user preferences.
 *
 * @param pointer
 * @returns {null}
 * @private
 */
exports._getEdgeAt = function(pointer) {
  var positionObject = this._pointerToPositionObject(pointer);
  var overlappingEdges = this._getAllEdgesOverlappingWith(positionObject);

  if (overlappingEdges.length > 0) {
    return this.edges[overlappingEdges[overlappingEdges.length - 1]];
  }
  else {
    return null;
  }
};


/**
 * Add object to the selection array.
 *
 * @param obj
 * @private
 */
exports._addToSelection = function(obj) {
  if (obj instanceof Node) {
    this.selectionObj.nodes[obj.id] = obj;
  }
  else {
    this.selectionObj.edges[obj.id] = obj;
  }
};

/**
 * Add object to the selection array.
 *
 * @param obj
 * @private
 */
exports._addToHover = function(obj) {
  if (obj instanceof Node) {
    this.hoverObj.nodes[obj.id] = obj;
  }
  else {
    this.hoverObj.edges[obj.id] = obj;
  }
};


/**
 * Remove a single option from selection.
 *
 * @param {Object} obj
 * @private
 */
exports._removeFromSelection = function(obj) {
  if (obj instanceof Node) {
    delete this.selectionObj.nodes[obj.id];
  }
  else {
    delete this.selectionObj.edges[obj.id];
  }
};

/**
 * Unselect all. The selectionObj is useful for this.
 *
 * @param {Boolean} [doNotTrigger] | ignore trigger
 * @private
 */
exports._unselectAll = function(doNotTrigger) {
  if (doNotTrigger === undefined) {
    doNotTrigger = false;
  }
  for(var nodeId in this.selectionObj.nodes) {
    if(this.selectionObj.nodes.hasOwnProperty(nodeId)) {
      this.selectionObj.nodes[nodeId].unselect();
    }
  }
  for(var edgeId in this.selectionObj.edges) {
    if(this.selectionObj.edges.hasOwnProperty(edgeId)) {
      this.selectionObj.edges[edgeId].unselect();
    }
  }

  this.selectionObj = {nodes:{},edges:{}};

  if (doNotTrigger == false) {
    this.emit('select', this.getSelection());
  }
};

/**
 * Unselect all clusters. The selectionObj is useful for this.
 *
 * @param {Boolean} [doNotTrigger] | ignore trigger
 * @private
 */
exports._unselectClusters = function(doNotTrigger) {
  if (doNotTrigger === undefined) {
    doNotTrigger = false;
  }

  for (var nodeId in this.selectionObj.nodes) {
    if (this.selectionObj.nodes.hasOwnProperty(nodeId)) {
      if (this.selectionObj.nodes[nodeId].clusterSize > 1) {
        this.selectionObj.nodes[nodeId].unselect();
        this._removeFromSelection(this.selectionObj.nodes[nodeId]);
      }
    }
  }

  if (doNotTrigger == false) {
    this.emit('select', this.getSelection());
  }
};


/**
 * return the number of selected nodes
 *
 * @returns {number}
 * @private
 */
exports._getSelectedNodeCount = function() {
  var count = 0;
  for (var nodeId in this.selectionObj.nodes) {
    if (this.selectionObj.nodes.hasOwnProperty(nodeId)) {
      count += 1;
    }
  }
  return count;
};

/**
 * return the selected node
 *
 * @returns {number}
 * @private
 */
exports._getSelectedNode = function() {
  for (var nodeId in this.selectionObj.nodes) {
    if (this.selectionObj.nodes.hasOwnProperty(nodeId)) {
      return this.selectionObj.nodes[nodeId];
    }
  }
  return null;
};

/**
 * return the selected edge
 *
 * @returns {number}
 * @private
 */
exports._getSelectedEdge = function() {
  for (var edgeId in this.selectionObj.edges) {
    if (this.selectionObj.edges.hasOwnProperty(edgeId)) {
      return this.selectionObj.edges[edgeId];
    }
  }
  return null;
};


/**
 * return the number of selected edges
 *
 * @returns {number}
 * @private
 */
exports._getSelectedEdgeCount = function() {
  var count = 0;
  for (var edgeId in this.selectionObj.edges) {
    if (this.selectionObj.edges.hasOwnProperty(edgeId)) {
      count += 1;
    }
  }
  return count;
};


/**
 * return the number of selected objects.
 *
 * @returns {number}
 * @private
 */
exports._getSelectedObjectCount = function() {
  var count = 0;
  for(var nodeId in this.selectionObj.nodes) {
    if(this.selectionObj.nodes.hasOwnProperty(nodeId)) {
      count += 1;
    }
  }
  for(var edgeId in this.selectionObj.edges) {
    if(this.selectionObj.edges.hasOwnProperty(edgeId)) {
      count += 1;
    }
  }
  return count;
};

/**
 * Check if anything is selected
 *
 * @returns {boolean}
 * @private
 */
exports._selectionIsEmpty = function() {
  for(var nodeId in this.selectionObj.nodes) {
    if(this.selectionObj.nodes.hasOwnProperty(nodeId)) {
      return false;
    }
  }
  for(var edgeId in this.selectionObj.edges) {
    if(this.selectionObj.edges.hasOwnProperty(edgeId)) {
      return false;
    }
  }
  return true;
};


/**
 * check if one of the selected nodes is a cluster.
 *
 * @returns {boolean}
 * @private
 */
exports._clusterInSelection = function() {
  for(var nodeId in this.selectionObj.nodes) {
    if(this.selectionObj.nodes.hasOwnProperty(nodeId)) {
      if (this.selectionObj.nodes[nodeId].clusterSize > 1) {
        return true;
      }
    }
  }
  return false;
};

/**
 * select the edges connected to the node that is being selected
 *
 * @param {Node} node
 * @private
 */
exports._selectConnectedEdges = function(node) {
  for (var i = 0; i < node.dynamicEdges.length; i++) {
    var edge = node.dynamicEdges[i];
    edge.select();
    this._addToSelection(edge);
  }
};

/**
 * select the edges connected to the node that is being selected
 *
 * @param {Node} node
 * @private
 */
exports._hoverConnectedEdges = function(node) {
  for (var i = 0; i < node.dynamicEdges.length; i++) {
    var edge = node.dynamicEdges[i];
    edge.hover = true;
    this._addToHover(edge);
  }
};


/**
 * unselect the edges connected to the node that is being selected
 *
 * @param {Node} node
 * @private
 */
exports._unselectConnectedEdges = function(node) {
  for (var i = 0; i < node.dynamicEdges.length; i++) {
    var edge = node.dynamicEdges[i];
    edge.unselect();
    this._removeFromSelection(edge);
  }
};




/**
 * This is called when someone clicks on a node. either select or deselect it.
 * If there is an existing selection and we don't want to append to it, clear the existing selection
 *
 * @param {Node || Edge} object
 * @param {Boolean} append
 * @param {Boolean} [doNotTrigger] | ignore trigger
 * @private
 */
exports._selectObject = function(object, append, doNotTrigger, highlightEdges, overrideSelectable) {
  if (doNotTrigger === undefined) {
    doNotTrigger = false;
  }
  if (highlightEdges === undefined) {
    highlightEdges = true;
  }

  if (this._selectionIsEmpty() == false && append == false && this.forceAppendSelection == false) {
    this._unselectAll(true);
  }

  // selectable allows the object to be selected. Override can be used if needed to bypass this.
  if (object.selected == false && (this.constants.selectable == true || overrideSelectable)) {
    object.select();
    this._addToSelection(object);
    if (object instanceof Node && this.blockConnectingEdgeSelection == false && highlightEdges == true) {
      this._selectConnectedEdges(object);
    }
  }
  // do not select the object if selectable is false, only add it to selection to allow drag to work
  else if (object.selected == false) {
    this._addToSelection(object);
    doNotTrigger = true;
  }
  else {
    object.unselect();
    this._removeFromSelection(object);
  }

  if (doNotTrigger == false) {
    this.emit('select', this.getSelection());
  }
};


/**
 * This is called when someone clicks on a node. either select or deselect it.
 * If there is an existing selection and we don't want to append to it, clear the existing selection
 *
 * @param {Node || Edge} object
 * @private
 */
exports._blurObject = function(object) {
  if (object.hover == true) {
    object.hover = false;
    this.emit("blurNode",{node:object.id});
  }
};

/**
 * This is called when someone clicks on a node. either select or deselect it.
 * If there is an existing selection and we don't want to append to it, clear the existing selection
 *
 * @param {Node || Edge} object
 * @private
 */
exports._hoverObject = function(object) {
  if (object.hover == false) {
    object.hover = true;
    this._addToHover(object);
    if (object instanceof Node) {
      this.emit("hoverNode",{node:object.id});
    }
  }
  if (object instanceof Node) {
    this._hoverConnectedEdges(object);
  }
};


/**
 * handles the selection part of the touch, only for navigation controls elements;
 * Touch is triggered before tap, also before hold. Hold triggers after a while.
 * This is the most responsive solution
 *
 * @param {Object} pointer
 * @private
 */
exports._handleTouch = function(pointer) {
};


/**
 * handles the selection part of the tap;
 *
 * @param {Object} pointer
 * @private
 */
exports._handleTap = function(pointer) {
  var node = this._getNodeAt(pointer);
  if (node != null) {
    this._selectObject(node, false);
  }
  else {
    var edge = this._getEdgeAt(pointer);
    if (edge != null) {
      this._selectObject(edge, false);
    }
    else {
      this._unselectAll();
    }
  }
  var properties = this.getSelection();
  properties['pointer'] = {
    DOM: {x: pointer.x, y: pointer.y},
    canvas: {x: this._XconvertDOMtoCanvas(pointer.x), y: this._YconvertDOMtoCanvas(pointer.y)}
  }
  this.emit("click", properties);
  this._requestRedraw();
};


/**
 * handles the selection part of the double tap and opens a cluster if needed
 *
 * @param {Object} pointer
 * @private
 */
exports._handleDoubleTap = function(pointer) {
  var node = this._getNodeAt(pointer);
  if (node != null && node !== undefined) {
    // we reset the areaCenter here so the opening of the node will occur
    this.areaCenter =  {"x" : this._XconvertDOMtoCanvas(pointer.x),
                        "y" : this._YconvertDOMtoCanvas(pointer.y)};
    this.openCluster(node);
  }
  var properties = this.getSelection();
  properties['pointer'] = {
    DOM: {x: pointer.x, y: pointer.y},
    canvas: {x: this._XconvertDOMtoCanvas(pointer.x), y: this._YconvertDOMtoCanvas(pointer.y)}
  }
  this.emit("doubleClick", properties);
};


/**
 * Handle the onHold selection part
 *
 * @param pointer
 * @private
 */
exports._handleOnHold = function(pointer) {
  var node = this._getNodeAt(pointer);
  if (node != null) {
    this._selectObject(node,true);
  }
  else {
    var edge = this._getEdgeAt(pointer);
    if (edge != null) {
      this._selectObject(edge,true);
    }
  }
  this._requestRedraw();
};


/**
 * handle the onRelease event. These functions are here for the navigation controls module
 * and data manipulation module.
 *
  * @private
 */
exports._handleOnRelease = function(pointer) {
  this._manipulationReleaseOverload(pointer);
  this._navigationReleaseOverload(pointer);
};

exports._manipulationReleaseOverload = function (pointer) {};
exports._navigationReleaseOverload = function (pointer) {};

/**
 *
 * retrieve the currently selected objects
 * @return {{nodes: Array.<String>, edges: Array.<String>}} selection
 */
exports.getSelection = function() {
  var nodeIds = this.getSelectedNodes();
  var edgeIds = this.getSelectedEdges();
  return {nodes:nodeIds, edges:edgeIds};
};

/**
 *
 * retrieve the currently selected nodes
 * @return {String[]} selection    An array with the ids of the
 *                                            selected nodes.
 */
exports.getSelectedNodes = function() {
  var idArray = [];
  if (this.constants.selectable == true) {
    for (var nodeId in this.selectionObj.nodes) {
      if (this.selectionObj.nodes.hasOwnProperty(nodeId)) {
        idArray.push(nodeId);
      }
    }
  }
  return idArray
};

/**
 *
 * retrieve the currently selected edges
 * @return {Array} selection    An array with the ids of the
 *                                            selected nodes.
 */
exports.getSelectedEdges = function() {
  var idArray = [];
  if (this.constants.selectable == true) {
    for (var edgeId in this.selectionObj.edges) {
      if (this.selectionObj.edges.hasOwnProperty(edgeId)) {
        idArray.push(edgeId);
      }
    }
  }
  return idArray;
};


/**
 * select zero or more nodes DEPRICATED
 * @param {Number[] | String[]} selection     An array with the ids of the
 *                                            selected nodes.
 */
exports.setSelection = function() {
  console.log("setSelection is deprecated. Please use selectNodes instead.")
};


/**
 * select zero or more nodes with the option to highlight edges
 * @param {Number[] | String[]} selection     An array with the ids of the
 *                                            selected nodes.
 * @param {boolean} [highlightEdges]
 */
exports.selectNodes = function(selection, highlightEdges) {
  var i, iMax, id;

  if (!selection || (selection.length == undefined))
    throw 'Selection must be an array with ids';

  // first unselect any selected node
  this._unselectAll(true);

  for (i = 0, iMax = selection.length; i < iMax; i++) {
    id = selection[i];

    var node = this.nodes[id];
    if (!node) {
      throw new RangeError('Node with id "' + id + '" not found');
    }
    this._selectObject(node,true,true,highlightEdges,true);
  }
  this.redraw();
};


/**
 * select zero or more edges
 * @param {Number[] | String[]} selection     An array with the ids of the
 *                                            selected nodes.
 */
exports.selectEdges = function(selection) {
  var i, iMax, id;

  if (!selection || (selection.length == undefined))
    throw 'Selection must be an array with ids';

  // first unselect any selected node
  this._unselectAll(true);

  for (i = 0, iMax = selection.length; i < iMax; i++) {
    id = selection[i];

    var edge = this.edges[id];
    if (!edge) {
      throw new RangeError('Edge with id "' + id + '" not found');
    }
    this._selectObject(edge,true,true,false,true);
  }
  this.redraw();
};

/**
 * Validate the selection: remove ids of nodes which no longer exist
 * @private
 */
exports._updateSelection = function () {
  for(var nodeId in this.selectionObj.nodes) {
    if(this.selectionObj.nodes.hasOwnProperty(nodeId)) {
      if (!this.nodes.hasOwnProperty(nodeId)) {
        delete this.selectionObj.nodes[nodeId];
      }
    }
  }
  for(var edgeId in this.selectionObj.edges) {
    if(this.selectionObj.edges.hasOwnProperty(edgeId)) {
      if (!this.edges.hasOwnProperty(edgeId)) {
        delete this.selectionObj.edges[edgeId];
      }
    }
  }
};

},{"../Node":12}],24:[function(require,module,exports){
/**
 * This function calculates the forces the nodes apply on eachother based on a gravitational model.
 * The Barnes Hut method is used to speed up this N-body simulation.
 *
 * @private
 */
exports._calculateNodeForces = function() {
  if (this.constants.physics.barnesHut.gravitationalConstant != 0) {
    var node;
    var nodes = this.calculationNodes;
    var nodeIndices = this.calculationNodeIndices;
    var nodeCount = nodeIndices.length;

    this._formBarnesHutTree(nodes,nodeIndices);

    var barnesHutTree = this.barnesHutTree;

    // place the nodes one by one recursively
    for (var i = 0; i < nodeCount; i++) {
      node = nodes[nodeIndices[i]];
      if (node.options.mass > 0) {
      // starting with root is irrelevant, it never passes the BarnesHut condition
        this._getForceContribution(barnesHutTree.root.children.NW,node);
        this._getForceContribution(barnesHutTree.root.children.NE,node);
        this._getForceContribution(barnesHutTree.root.children.SW,node);
        this._getForceContribution(barnesHutTree.root.children.SE,node);
      }
    }
  }
};


/**
 * This function traverses the barnesHutTree. It checks when it can approximate distant nodes with their center of mass.
 * If a region contains a single node, we check if it is not itself, then we apply the force.
 *
 * @param parentBranch
 * @param node
 * @private
 */
exports._getForceContribution = function(parentBranch,node) {
  // we get no force contribution from an empty region
  if (parentBranch.childrenCount > 0) {
    var dx,dy,distance;

    // get the distance from the center of mass to the node.
    dx = parentBranch.centerOfMass.x - node.x;
    dy = parentBranch.centerOfMass.y - node.y;
    distance = Math.sqrt(dx * dx + dy * dy);

    // BarnesHut condition
    // original condition : s/d < thetaInverted = passed  ===  d/s > 1/theta = passed
    // calcSize = 1/s --> d * 1/s > 1/theta = passed
    if (distance * parentBranch.calcSize > this.constants.physics.barnesHut.thetaInverted) {
      // duplicate code to reduce function calls to speed up program
      if (distance == 0) {
        distance = 0.1*Math.random();
        dx = distance;
      }
      var gravityForce = this.constants.physics.barnesHut.gravitationalConstant * parentBranch.mass * node.options.mass / (distance * distance * distance);
      var fx = dx * gravityForce;
      var fy = dy * gravityForce;
      node.fx += fx;
      node.fy += fy;
    }
    else {
      // Did not pass the condition, go into children if available
      if (parentBranch.childrenCount == 4) {
        this._getForceContribution(parentBranch.children.NW,node);
        this._getForceContribution(parentBranch.children.NE,node);
        this._getForceContribution(parentBranch.children.SW,node);
        this._getForceContribution(parentBranch.children.SE,node);
      }
      else { // parentBranch must have only one node, if it was empty we wouldnt be here
        if (parentBranch.children.data.id != node.id) { // if it is not self
          // duplicate code to reduce function calls to speed up program
          if (distance == 0) {
            distance = 0.5*Math.random();
            dx = distance;
          }
          var gravityForce = this.constants.physics.barnesHut.gravitationalConstant * parentBranch.mass * node.options.mass / (distance * distance * distance);
          var fx = dx * gravityForce;
          var fy = dy * gravityForce;
          node.fx += fx;
          node.fy += fy;
        }
      }
    }
  }
};

/**
 * This function constructs the barnesHut tree recursively. It creates the root, splits it and starts placing the nodes.
 *
 * @param nodes
 * @param nodeIndices
 * @private
 */
exports._formBarnesHutTree = function(nodes,nodeIndices) {
  var node;
  var nodeCount = nodeIndices.length;

  var minX = Number.MAX_VALUE,
    minY = Number.MAX_VALUE,
    maxX =-Number.MAX_VALUE,
    maxY =-Number.MAX_VALUE;

  // get the range of the nodes
  for (var i = 0; i < nodeCount; i++) {
    var x = nodes[nodeIndices[i]].x;
    var y = nodes[nodeIndices[i]].y;
    if (nodes[nodeIndices[i]].options.mass > 0) {
      if (x < minX) { minX = x; }
      if (x > maxX) { maxX = x; }
      if (y < minY) { minY = y; }
      if (y > maxY) { maxY = y; }
    }
  }
  // make the range a square
  var sizeDiff = Math.abs(maxX - minX) - Math.abs(maxY - minY); // difference between X and Y
  if (sizeDiff > 0) {minY -= 0.5 * sizeDiff; maxY += 0.5 * sizeDiff;} // xSize > ySize
  else              {minX += 0.5 * sizeDiff; maxX -= 0.5 * sizeDiff;} // xSize < ySize


  var minimumTreeSize = 1e-5;
  var rootSize = Math.max(minimumTreeSize,Math.abs(maxX - minX));
  var halfRootSize = 0.5 * rootSize;
  var centerX = 0.5 * (minX + maxX), centerY = 0.5 * (minY + maxY);

  // construct the barnesHutTree
  var barnesHutTree = {
    root:{
      centerOfMass: {x:0, y:0},
      mass:0,
      range: {
        minX: centerX-halfRootSize,maxX:centerX+halfRootSize,
        minY: centerY-halfRootSize,maxY:centerY+halfRootSize
      },
      size: rootSize,
      calcSize: 1 / rootSize,
      children: { data:null},
      maxWidth: 0,
      level: 0,
      childrenCount: 4
    }
  };
  this._splitBranch(barnesHutTree.root);

  // place the nodes one by one recursively
  for (i = 0; i < nodeCount; i++) {
    node = nodes[nodeIndices[i]];
    if (node.options.mass > 0) {
      this._placeInTree(barnesHutTree.root,node);
    }
  }

  // make global
  this.barnesHutTree = barnesHutTree
};


/**
 * this updates the mass of a branch. this is increased by adding a node.
 *
 * @param parentBranch
 * @param node
 * @private
 */
exports._updateBranchMass = function(parentBranch, node) {
  var totalMass = parentBranch.mass + node.options.mass;
  var totalMassInv = 1/totalMass;

  parentBranch.centerOfMass.x = parentBranch.centerOfMass.x * parentBranch.mass + node.x * node.options.mass;
  parentBranch.centerOfMass.x *= totalMassInv;

  parentBranch.centerOfMass.y = parentBranch.centerOfMass.y * parentBranch.mass + node.y * node.options.mass;
  parentBranch.centerOfMass.y *= totalMassInv;

  parentBranch.mass = totalMass;
  var biggestSize = Math.max(Math.max(node.height,node.radius),node.width);
  parentBranch.maxWidth = (parentBranch.maxWidth < biggestSize) ? biggestSize : parentBranch.maxWidth;

};


/**
 * determine in which branch the node will be placed.
 *
 * @param parentBranch
 * @param node
 * @param skipMassUpdate
 * @private
 */
exports._placeInTree = function(parentBranch,node,skipMassUpdate) {
  if (skipMassUpdate != true || skipMassUpdate === undefined) {
    // update the mass of the branch.
    this._updateBranchMass(parentBranch,node);
  }

  if (parentBranch.children.NW.range.maxX > node.x) { // in NW or SW
    if (parentBranch.children.NW.range.maxY > node.y) { // in NW
      this._placeInRegion(parentBranch,node,"NW");
    }
    else { // in SW
      this._placeInRegion(parentBranch,node,"SW");
    }
  }
  else { // in NE or SE
    if (parentBranch.children.NW.range.maxY > node.y) { // in NE
      this._placeInRegion(parentBranch,node,"NE");
    }
    else { // in SE
      this._placeInRegion(parentBranch,node,"SE");
    }
  }
};


/**
 * actually place the node in a region (or branch)
 *
 * @param parentBranch
 * @param node
 * @param region
 * @private
 */
exports._placeInRegion = function(parentBranch,node,region) {
  switch (parentBranch.children[region].childrenCount) {
    case 0: // place node here
      parentBranch.children[region].children.data = node;
      parentBranch.children[region].childrenCount = 1;
      this._updateBranchMass(parentBranch.children[region],node);
      break;
    case 1: // convert into children
      // if there are two nodes exactly overlapping (on init, on opening of cluster etc.)
      // we move one node a pixel and we do not put it in the tree.
      if (parentBranch.children[region].children.data.x == node.x &&
          parentBranch.children[region].children.data.y == node.y) {
        node.x += Math.random();
        node.y += Math.random();
      }
      else {
        this._splitBranch(parentBranch.children[region]);
        this._placeInTree(parentBranch.children[region],node);
      }
      break;
    case 4: // place in branch
      this._placeInTree(parentBranch.children[region],node);
      break;
  }
};


/**
 * this function splits a branch into 4 sub branches. If the branch contained a node, we place it in the subbranch
 * after the split is complete.
 *
 * @param parentBranch
 * @private
 */
exports._splitBranch = function(parentBranch) {
  // if the branch is shaded with a node, replace the node in the new subset.
  var containedNode = null;
  if (parentBranch.childrenCount == 1) {
    containedNode = parentBranch.children.data;
    parentBranch.mass = 0; parentBranch.centerOfMass.x = 0; parentBranch.centerOfMass.y = 0;
  }
  parentBranch.childrenCount = 4;
  parentBranch.children.data = null;
  this._insertRegion(parentBranch,"NW");
  this._insertRegion(parentBranch,"NE");
  this._insertRegion(parentBranch,"SW");
  this._insertRegion(parentBranch,"SE");

  if (containedNode != null) {
    this._placeInTree(parentBranch,containedNode);
  }
};


/**
 * This function subdivides the region into four new segments.
 * Specifically, this inserts a single new segment.
 * It fills the children section of the parentBranch
 *
 * @param parentBranch
 * @param region
 * @param parentRange
 * @private
 */
exports._insertRegion = function(parentBranch, region) {
  var minX,maxX,minY,maxY;
  var childSize = 0.5 * parentBranch.size;
  switch (region) {
    case "NW":
      minX = parentBranch.range.minX;
      maxX = parentBranch.range.minX + childSize;
      minY = parentBranch.range.minY;
      maxY = parentBranch.range.minY + childSize;
      break;
    case "NE":
      minX = parentBranch.range.minX + childSize;
      maxX = parentBranch.range.maxX;
      minY = parentBranch.range.minY;
      maxY = parentBranch.range.minY + childSize;
      break;
    case "SW":
      minX = parentBranch.range.minX;
      maxX = parentBranch.range.minX + childSize;
      minY = parentBranch.range.minY + childSize;
      maxY = parentBranch.range.maxY;
      break;
    case "SE":
      minX = parentBranch.range.minX + childSize;
      maxX = parentBranch.range.maxX;
      minY = parentBranch.range.minY + childSize;
      maxY = parentBranch.range.maxY;
      break;
  }


  parentBranch.children[region] = {
    centerOfMass:{x:0,y:0},
    mass:0,
    range:{minX:minX,maxX:maxX,minY:minY,maxY:maxY},
    size: 0.5 * parentBranch.size,
    calcSize: 2 * parentBranch.calcSize,
    children: {data:null},
    maxWidth: 0,
    level: parentBranch.level+1,
    childrenCount: 0
  };
};


/**
 * This function is for debugging purposed, it draws the tree.
 *
 * @param ctx
 * @param color
 * @private
 */
exports._drawTree = function(ctx,color) {
  if (this.barnesHutTree !== undefined) {

    ctx.lineWidth = 1;

    this._drawBranch(this.barnesHutTree.root,ctx,color);
  }
};


/**
 * This function is for debugging purposes. It draws the branches recursively.
 *
 * @param branch
 * @param ctx
 * @param color
 * @private
 */
exports._drawBranch = function(branch,ctx,color) {
  if (color === undefined) {
    color = "#FF0000";
  }

  if (branch.childrenCount == 4) {
    this._drawBranch(branch.children.NW,ctx);
    this._drawBranch(branch.children.NE,ctx);
    this._drawBranch(branch.children.SE,ctx);
    this._drawBranch(branch.children.SW,ctx);
  }
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(branch.range.minX,branch.range.minY);
  ctx.lineTo(branch.range.maxX,branch.range.minY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(branch.range.maxX,branch.range.minY);
  ctx.lineTo(branch.range.maxX,branch.range.maxY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(branch.range.maxX,branch.range.maxY);
  ctx.lineTo(branch.range.minX,branch.range.maxY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(branch.range.minX,branch.range.maxY);
  ctx.lineTo(branch.range.minX,branch.range.minY);
  ctx.stroke();

  /*
   if (branch.mass > 0) {
   ctx.circle(branch.centerOfMass.x, branch.centerOfMass.y, 3*branch.mass);
   ctx.stroke();
   }
   */
};

},{}],25:[function(require,module,exports){
/**
 * Calculate the forces the nodes apply on eachother based on a repulsion field.
 * This field is linearly approximated.
 *
 * @private
 */
exports._calculateNodeForces = function () {
  var dx, dy, distance, fx, fy,
    repulsingForce, node1, node2, i, j;

  var nodes = this.calculationNodes;
  var nodeIndices = this.calculationNodeIndices;

  // repulsing forces between nodes
  var nodeDistance = this.constants.physics.hierarchicalRepulsion.nodeDistance;

  // we loop from i over all but the last entree in the array
  // j loops from i+1 to the last. This way we do not double count any of the indices, nor i == j
  for (i = 0; i < nodeIndices.length - 1; i++) {
    node1 = nodes[nodeIndices[i]];
    for (j = i + 1; j < nodeIndices.length; j++) {
      node2 = nodes[nodeIndices[j]];

      // nodes only affect nodes on their level
      if (node1.level == node2.level) {

        dx = node2.x - node1.x;
        dy = node2.y - node1.y;
        distance = Math.sqrt(dx * dx + dy * dy);


        var steepness = 0.05;
        if (distance < nodeDistance) {
          repulsingForce = -Math.pow(steepness*distance,2) + Math.pow(steepness*nodeDistance,2);
        }
        else {
          repulsingForce = 0;
        }
          // normalize force with
          if (distance == 0) {
            distance = 0.01;
          }
          else {
            repulsingForce = repulsingForce / distance;
          }
          fx = dx * repulsingForce;
          fy = dy * repulsingForce;

          node1.fx -= fx;
          node1.fy -= fy;
          node2.fx += fx;
          node2.fy += fy;
      }
    }
  }
};


/**
 * this function calculates the effects of the springs in the case of unsmooth curves.
 *
 * @private
 */
exports._calculateHierarchicalSpringForces = function () {
  var edgeLength, edge, edgeId;
  var dx, dy, fx, fy, springForce, distance;
  var edges = this.edges;

  var nodes = this.calculationNodes;
  var nodeIndices = this.calculationNodeIndices;


  for (var i = 0; i < nodeIndices.length; i++) {
    var node1 = nodes[nodeIndices[i]];
    node1.springFx = 0;
    node1.springFy = 0;
  }


  // forces caused by the edges, modelled as springs
  for (edgeId in edges) {
    if (edges.hasOwnProperty(edgeId)) {
      edge = edges[edgeId];
      if (edge.connected) {
        // only calculate forces if nodes are in the same sector
        if (this.nodes.hasOwnProperty(edge.toId) && this.nodes.hasOwnProperty(edge.fromId)) {
          edgeLength = edge.physics.springLength;
          // this implies that the edges between big clusters are longer
          edgeLength += (edge.to.clusterSize + edge.from.clusterSize - 2) * this.constants.clustering.edgeGrowth;

          dx = (edge.from.x - edge.to.x);
          dy = (edge.from.y - edge.to.y);
          distance = Math.sqrt(dx * dx + dy * dy);

          if (distance == 0) {
            distance = 0.01;
          }

          // the 1/distance is so the fx and fy can be calculated without sine or cosine.
          springForce = this.constants.physics.springConstant * (edgeLength - distance) / distance;

          fx = dx * springForce;
          fy = dy * springForce;



          if (edge.to.level != edge.from.level) {
            edge.to.springFx -= fx;
            edge.to.springFy -= fy;
            edge.from.springFx += fx;
            edge.from.springFy += fy;
          }
          else {
            var factor = 0.5;
            edge.to.fx -= factor*fx;
            edge.to.fy -= factor*fy;
            edge.from.fx += factor*fx;
            edge.from.fy += factor*fy;
          }
        }
      }
    }
  }

  // normalize spring forces
  var springForce = 1;
  var springFx, springFy;
  for (i = 0; i < nodeIndices.length; i++) {
    var node = nodes[nodeIndices[i]];
    springFx = Math.min(springForce,Math.max(-springForce,node.springFx));
    springFy = Math.min(springForce,Math.max(-springForce,node.springFy));

    node.fx += springFx;
    node.fy += springFy;
  }

  // retain energy balance
  var totalFx = 0;
  var totalFy = 0;
  for (i = 0; i < nodeIndices.length; i++) {
    var node = nodes[nodeIndices[i]];
    totalFx += node.fx;
    totalFy += node.fy;
  }
  var correctionFx = totalFx / nodeIndices.length;
  var correctionFy = totalFy / nodeIndices.length;

  for (i = 0; i < nodeIndices.length; i++) {
    var node = nodes[nodeIndices[i]];
    node.fx -= correctionFx;
    node.fy -= correctionFy;
  }

};
},{}],26:[function(require,module,exports){
var util = require('../../../util');
var RepulsionMixin = require('./RepulsionMixin');
var HierarchialRepulsionMixin = require('./HierarchialRepulsionMixin');
var BarnesHutMixin = require('./BarnesHutMixin');

/**
 * Toggling barnes Hut calculation on and off.
 *
 * @private
 */
exports._toggleBarnesHut = function () {
  this.constants.physics.barnesHut.enabled = !this.constants.physics.barnesHut.enabled;
  this._loadSelectedForceSolver();
  this.moving = true;
  this.start();
};


/**
 * This loads the node force solver based on the barnes hut or repulsion algorithm
 *
 * @private
 */
exports._loadSelectedForceSolver = function () {
  // this overloads the this._calculateNodeForces
  if (this.constants.physics.barnesHut.enabled == true) {
    this._clearMixin(RepulsionMixin);
    this._clearMixin(HierarchialRepulsionMixin);

    this.constants.physics.centralGravity = this.constants.physics.barnesHut.centralGravity;
    this.constants.physics.springLength = this.constants.physics.barnesHut.springLength;
    this.constants.physics.springConstant = this.constants.physics.barnesHut.springConstant;
    this.constants.physics.damping = this.constants.physics.barnesHut.damping;

    this._loadMixin(BarnesHutMixin);
  }
  else if (this.constants.physics.hierarchicalRepulsion.enabled == true) {
    this._clearMixin(BarnesHutMixin);
    this._clearMixin(RepulsionMixin);

    this.constants.physics.centralGravity = this.constants.physics.hierarchicalRepulsion.centralGravity;
    this.constants.physics.springLength = this.constants.physics.hierarchicalRepulsion.springLength;
    this.constants.physics.springConstant = this.constants.physics.hierarchicalRepulsion.springConstant;
    this.constants.physics.damping = this.constants.physics.hierarchicalRepulsion.damping;

    this._loadMixin(HierarchialRepulsionMixin);
  }
  else {
    this._clearMixin(BarnesHutMixin);
    this._clearMixin(HierarchialRepulsionMixin);
    this.barnesHutTree = undefined;

    this.constants.physics.centralGravity = this.constants.physics.repulsion.centralGravity;
    this.constants.physics.springLength = this.constants.physics.repulsion.springLength;
    this.constants.physics.springConstant = this.constants.physics.repulsion.springConstant;
    this.constants.physics.damping = this.constants.physics.repulsion.damping;

    this._loadMixin(RepulsionMixin);
  }
};

/**
 * Before calculating the forces, we check if we need to cluster to keep up performance and we check
 * if there is more than one node. If it is just one node, we dont calculate anything.
 *
 * @private
 */
exports._initializeForceCalculation = function () {
  // stop calculation if there is only one node
  if (this.nodeIndices.length == 1) {
    this.nodes[this.nodeIndices[0]]._setForce(0, 0);
  }
  else {
    // if there are too many nodes on screen, we cluster without repositioning
    if (this.nodeIndices.length > this.constants.clustering.clusterThreshold && this.constants.clustering.enabled == true) {
      this.clusterToFit(this.constants.clustering.reduceToNodes, false);
    }

    // we now start the force calculation
    this._calculateForces();
  }
};


/**
 * Calculate the external forces acting on the nodes
 * Forces are caused by: edges, repulsing forces between nodes, gravity
 * @private
 */
exports._calculateForces = function () {
  // Gravity is required to keep separated groups from floating off
  // the forces are reset to zero in this loop by using _setForce instead
  // of _addForce

  this._calculateGravitationalForces();
  this._calculateNodeForces();

  if (this.constants.physics.springConstant > 0) {
    if (this.constants.smoothCurves.enabled == true && this.constants.smoothCurves.dynamic == true) {
      this._calculateSpringForcesWithSupport();
    }
    else {
      if (this.constants.physics.hierarchicalRepulsion.enabled == true) {
        this._calculateHierarchicalSpringForces();
      }
      else {
        this._calculateSpringForces();
      }
    }
  }
};


/**
 * Smooth curves are created by adding invisible nodes in the center of the edges. These nodes are also
 * handled in the calculateForces function. We then use a quadratic curve with the center node as control.
 * This function joins the datanodes and invisible (called support) nodes into one object.
 * We do this so we do not contaminate this.nodes with the support nodes.
 *
 * @private
 */
exports._updateCalculationNodes = function () {
  if (this.constants.smoothCurves.enabled == true && this.constants.smoothCurves.dynamic == true) {
    this.calculationNodes = {};
    this.calculationNodeIndices = [];

    for (var nodeId in this.nodes) {
      if (this.nodes.hasOwnProperty(nodeId)) {
        this.calculationNodes[nodeId] = this.nodes[nodeId];
      }
    }
    var supportNodes = this.sectors['support']['nodes'];
    for (var supportNodeId in supportNodes) {
      if (supportNodes.hasOwnProperty(supportNodeId)) {
        if (this.edges.hasOwnProperty(supportNodes[supportNodeId].parentEdgeId)) {
          this.calculationNodes[supportNodeId] = supportNodes[supportNodeId];
        }
        else {
          supportNodes[supportNodeId]._setForce(0, 0);
        }
      }
    }

    for (var idx in this.calculationNodes) {
      if (this.calculationNodes.hasOwnProperty(idx)) {
        this.calculationNodeIndices.push(idx);
      }
    }
  }
  else {
    this.calculationNodes = this.nodes;
    this.calculationNodeIndices = this.nodeIndices;
  }
};


/**
 * this function applies the central gravity effect to keep groups from floating off
 *
 * @private
 */
exports._calculateGravitationalForces = function () {
  var dx, dy, distance, node, i;
  var nodes = this.calculationNodes;
  var gravity = this.constants.physics.centralGravity;
  var gravityForce = 0;

  for (i = 0; i < this.calculationNodeIndices.length; i++) {
    node = nodes[this.calculationNodeIndices[i]];
    node.damping = this.constants.physics.damping; // possibly add function to alter damping properties of clusters.
    // gravity does not apply when we are in a pocket sector
    if (this._sector() == "default" && gravity != 0) {
      dx = -node.x;
      dy = -node.y;
      distance = Math.sqrt(dx * dx + dy * dy);

      gravityForce = (distance == 0) ? 0 : (gravity / distance);
      node.fx = dx * gravityForce;
      node.fy = dy * gravityForce;
    }
    else {
      node.fx = 0;
      node.fy = 0;
    }
  }
};




/**
 * this function calculates the effects of the springs in the case of unsmooth curves.
 *
 * @private
 */
exports._calculateSpringForces = function () {
  var edgeLength, edge, edgeId;
  var dx, dy, fx, fy, springForce, distance;
  var edges = this.edges;

  // forces caused by the edges, modelled as springs
  for (edgeId in edges) {
    if (edges.hasOwnProperty(edgeId)) {
      edge = edges[edgeId];
      if (edge.connected) {
        // only calculate forces if nodes are in the same sector
        if (this.nodes.hasOwnProperty(edge.toId) && this.nodes.hasOwnProperty(edge.fromId)) {
          edgeLength = edge.physics.springLength;
          // this implies that the edges between big clusters are longer
          edgeLength += (edge.to.clusterSize + edge.from.clusterSize - 2) * this.constants.clustering.edgeGrowth;

          dx = (edge.from.x - edge.to.x);
          dy = (edge.from.y - edge.to.y);
          distance = Math.sqrt(dx * dx + dy * dy);

          if (distance == 0) {
            distance = 0.01;
          }

          // the 1/distance is so the fx and fy can be calculated without sine or cosine.
          springForce = this.constants.physics.springConstant * (edgeLength - distance) / distance;

          fx = dx * springForce;
          fy = dy * springForce;

          edge.from.fx += fx;
          edge.from.fy += fy;
          edge.to.fx -= fx;
          edge.to.fy -= fy;
        }
      }
    }
  }
};




/**
 * This function calculates the springforces on the nodes, accounting for the support nodes.
 *
 * @private
 */
exports._calculateSpringForcesWithSupport = function () {
  var edgeLength, edge, edgeId, combinedClusterSize;
  var edges = this.edges;

  // forces caused by the edges, modelled as springs
  for (edgeId in edges) {
    if (edges.hasOwnProperty(edgeId)) {
      edge = edges[edgeId];
      if (edge.connected) {
        // only calculate forces if nodes are in the same sector
        if (this.nodes.hasOwnProperty(edge.toId) && this.nodes.hasOwnProperty(edge.fromId)) {
          if (edge.via != null) {
            var node1 = edge.to;
            var node2 = edge.via;
            var node3 = edge.from;

            edgeLength = edge.physics.springLength;

            combinedClusterSize = node1.clusterSize + node3.clusterSize - 2;

            // this implies that the edges between big clusters are longer
            edgeLength += combinedClusterSize * this.constants.clustering.edgeGrowth;
            this._calculateSpringForce(node1, node2, 0.5 * edgeLength);
            this._calculateSpringForce(node2, node3, 0.5 * edgeLength);
          }
        }
      }
    }
  }
};


/**
 * This is the code actually performing the calculation for the function above. It is split out to avoid repetition.
 *
 * @param node1
 * @param node2
 * @param edgeLength
 * @private
 */
exports._calculateSpringForce = function (node1, node2, edgeLength) {
  var dx, dy, fx, fy, springForce, distance;

  dx = (node1.x - node2.x);
  dy = (node1.y - node2.y);
  distance = Math.sqrt(dx * dx + dy * dy);

  if (distance == 0) {
    distance = 0.01;
  }

  // the 1/distance is so the fx and fy can be calculated without sine or cosine.
  springForce = this.constants.physics.springConstant * (edgeLength - distance) / distance;

  fx = dx * springForce;
  fy = dy * springForce;

  node1.fx += fx;
  node1.fy += fy;
  node2.fx -= fx;
  node2.fy -= fy;
};


exports._cleanupPhysicsConfiguration = function() {
  if (this.physicsConfiguration !== undefined) {
    while (this.physicsConfiguration.hasChildNodes()) {
      this.physicsConfiguration.removeChild(this.physicsConfiguration.firstChild);
    }

    this.physicsConfiguration.parentNode.removeChild(this.physicsConfiguration);
    this.physicsConfiguration = undefined;
  }
}

/**
 * Load the HTML for the physics config and bind it
 * @private
 */
exports._loadPhysicsConfiguration = function () {
  if (this.physicsConfiguration === undefined) {
    this.backupConstants = {};
    util.deepExtend(this.backupConstants,this.constants);

    var maxGravitational = Math.max(20000, (-1 * this.constants.physics.barnesHut.gravitationalConstant) * 10);
    var maxSpring = Math.min(0.05, this.constants.physics.barnesHut.springConstant * 10)

    var hierarchicalLayoutDirections = ["LR", "RL", "UD", "DU"];
    this.physicsConfiguration = document.createElement('div');
    this.physicsConfiguration.className = "PhysicsConfiguration";
    this.physicsConfiguration.innerHTML = '' +
      '<table><tr><td><b>Simulation Mode:</b></td></tr>' +
      '<tr>' +
      '<td width="120px"><input type="radio" name="graph_physicsMethod" id="graph_physicsMethod1" value="BH" checked="checked">Barnes Hut</td>' +
      '<td width="120px"><input type="radio" name="graph_physicsMethod" id="graph_physicsMethod2" value="R">Repulsion</td>' +
      '<td width="120px"><input type="radio" name="graph_physicsMethod" id="graph_physicsMethod3" value="H">Hierarchical</td>' +
      '</tr>' +
      '</table>' +
      '<table id="graph_BH_table" style="display:none">' +
      '<tr><td><b>Barnes Hut</b></td></tr>' +
      '<tr>' +
      '<td width="150px">gravitationalConstant</td><td>0</td><td><input type="range" min="0" max="'+maxGravitational+'" value="' + (-1 * this.constants.physics.barnesHut.gravitationalConstant) + '" step="25" style="width:300px" id="graph_BH_gc"></td><td  width="50px">-'+maxGravitational+'</td><td><input value="' + (this.constants.physics.barnesHut.gravitationalConstant) + '" id="graph_BH_gc_value" style="width:60px"></td>' +
      '</tr>' +
      '<tr>' +
      '<td width="150px">centralGravity</td><td>0</td><td><input type="range" min="0" max="6"  value="' + this.constants.physics.barnesHut.centralGravity + '" step="0.05"  style="width:300px" id="graph_BH_cg"></td><td>3</td><td><input value="' + this.constants.physics.barnesHut.centralGravity + '" id="graph_BH_cg_value" style="width:60px"></td>' +
      '</tr>' +
      '<tr>' +
      '<td width="150px">springLength</td><td>0</td><td><input type="range" min="0" max="500" value="' + this.constants.physics.barnesHut.springLength + '" step="1" style="width:300px" id="graph_BH_sl"></td><td>500</td><td><input value="' + this.constants.physics.barnesHut.springLength + '" id="graph_BH_sl_value" style="width:60px"></td>' +
      '</tr>' +
      '<tr>' +
      '<td width="150px">springConstant</td><td>0</td><td><input type="range" min="0" max="'+maxSpring+'" value="' + this.constants.physics.barnesHut.springConstant + '" step="0.0001" style="width:300px" id="graph_BH_sc"></td><td>'+maxSpring+'</td><td><input value="' + this.constants.physics.barnesHut.springConstant + '" id="graph_BH_sc_value" style="width:60px"></td>' +
      '</tr>' +
      '<tr>' +
      '<td width="150px">damping</td><td>0</td><td><input type="range" min="0" max="0.3" value="' + this.constants.physics.barnesHut.damping + '" step="0.005" style="width:300px" id="graph_BH_damp"></td><td>0.3</td><td><input value="' + this.constants.physics.barnesHut.damping + '" id="graph_BH_damp_value" style="width:60px"></td>' +
      '</tr>' +
      '</table>' +
      '<table id="graph_R_table" style="display:none">' +
      '<tr><td><b>Repulsion</b></td></tr>' +
      '<tr>' +
      '<td width="150px">nodeDistance</td><td>0</td><td><input type="range" min="0" max="300" value="' + this.constants.physics.repulsion.nodeDistance + '" step="1" style="width:300px" id="graph_R_nd"></td><td width="50px">300</td><td><input value="' + this.constants.physics.repulsion.nodeDistance + '" id="graph_R_nd_value" style="width:60px"></td>' +
      '</tr>' +
      '<tr>' +
      '<td width="150px">centralGravity</td><td>0</td><td><input type="range" min="0" max="3"  value="' + this.constants.physics.repulsion.centralGravity + '" step="0.05"  style="width:300px" id="graph_R_cg"></td><td>3</td><td><input value="' + this.constants.physics.repulsion.centralGravity + '" id="graph_R_cg_value" style="width:60px"></td>' +
      '</tr>' +
      '<tr>' +
      '<td width="150px">springLength</td><td>0</td><td><input type="range" min="0" max="500" value="' + this.constants.physics.repulsion.springLength + '" step="1" style="width:300px" id="graph_R_sl"></td><td>500</td><td><input value="' + this.constants.physics.repulsion.springLength + '" id="graph_R_sl_value" style="width:60px"></td>' +
      '</tr>' +
      '<tr>' +
      '<td width="150px">springConstant</td><td>0</td><td><input type="range" min="0" max="0.5" value="' + this.constants.physics.repulsion.springConstant + '" step="0.001" style="width:300px" id="graph_R_sc"></td><td>0.5</td><td><input value="' + this.constants.physics.repulsion.springConstant + '" id="graph_R_sc_value" style="width:60px"></td>' +
      '</tr>' +
      '<tr>' +
      '<td width="150px">damping</td><td>0</td><td><input type="range" min="0" max="0.3" value="' + this.constants.physics.repulsion.damping + '" step="0.005" style="width:300px" id="graph_R_damp"></td><td>0.3</td><td><input value="' + this.constants.physics.repulsion.damping + '" id="graph_R_damp_value" style="width:60px"></td>' +
      '</tr>' +
      '</table>' +
      '<table id="graph_H_table" style="display:none">' +
      '<tr><td width="150"><b>Hierarchical</b></td></tr>' +
      '<tr>' +
      '<td width="150px">nodeDistance</td><td>0</td><td><input type="range" min="0" max="300" value="' + this.constants.physics.hierarchicalRepulsion.nodeDistance + '" step="1" style="width:300px" id="graph_H_nd"></td><td width="50px">300</td><td><input value="' + this.constants.physics.hierarchicalRepulsion.nodeDistance + '" id="graph_H_nd_value" style="width:60px"></td>' +
      '</tr>' +
      '<tr>' +
      '<td width="150px">centralGravity</td><td>0</td><td><input type="range" min="0" max="3"  value="' + this.constants.physics.hierarchicalRepulsion.centralGravity + '" step="0.05"  style="width:300px" id="graph_H_cg"></td><td>3</td><td><input value="' + this.constants.physics.hierarchicalRepulsion.centralGravity + '" id="graph_H_cg_value" style="width:60px"></td>' +
      '</tr>' +
      '<tr>' +
      '<td width="150px">springLength</td><td>0</td><td><input type="range" min="0" max="500" value="' + this.constants.physics.hierarchicalRepulsion.springLength + '" step="1" style="width:300px" id="graph_H_sl"></td><td>500</td><td><input value="' + this.constants.physics.hierarchicalRepulsion.springLength + '" id="graph_H_sl_value" style="width:60px"></td>' +
      '</tr>' +
      '<tr>' +
      '<td width="150px">springConstant</td><td>0</td><td><input type="range" min="0" max="0.5" value="' + this.constants.physics.hierarchicalRepulsion.springConstant + '" step="0.001" style="width:300px" id="graph_H_sc"></td><td>0.5</td><td><input value="' + this.constants.physics.hierarchicalRepulsion.springConstant + '" id="graph_H_sc_value" style="width:60px"></td>' +
      '</tr>' +
      '<tr>' +
      '<td width="150px">damping</td><td>0</td><td><input type="range" min="0" max="0.3" value="' + this.constants.physics.hierarchicalRepulsion.damping + '" step="0.005" style="width:300px" id="graph_H_damp"></td><td>0.3</td><td><input value="' + this.constants.physics.hierarchicalRepulsion.damping + '" id="graph_H_damp_value" style="width:60px"></td>' +
      '</tr>' +
      '<tr>' +
      '<td width="150px">direction</td><td>1</td><td><input type="range" min="0" max="3" value="' + hierarchicalLayoutDirections.indexOf(this.constants.hierarchicalLayout.direction) + '" step="1" style="width:300px" id="graph_H_direction"></td><td>4</td><td><input value="' + this.constants.hierarchicalLayout.direction + '" id="graph_H_direction_value" style="width:60px"></td>' +
      '</tr>' +
      '<tr>' +
      '<td width="150px">levelSeparation</td><td>1</td><td><input type="range" min="0" max="500" value="' + this.constants.hierarchicalLayout.levelSeparation + '" step="1" style="width:300px" id="graph_H_levsep"></td><td>500</td><td><input value="' + this.constants.hierarchicalLayout.levelSeparation + '" id="graph_H_levsep_value" style="width:60px"></td>' +
      '</tr>' +
      '<tr>' +
      '<td width="150px">nodeSpacing</td><td>1</td><td><input type="range" min="0" max="500" value="' + this.constants.hierarchicalLayout.nodeSpacing + '" step="1" style="width:300px" id="graph_H_nspac"></td><td>500</td><td><input value="' + this.constants.hierarchicalLayout.nodeSpacing + '" id="graph_H_nspac_value" style="width:60px"></td>' +
      '</tr>' +
      '</table>' +
      '<table><tr><td><b>Options:</b></td></tr>' +
      '<tr>' +
      '<td width="180px"><input type="button" id="graph_toggleSmooth" value="Toggle smoothCurves" style="width:150px"></td>' +
      '<td width="180px"><input type="button" id="graph_repositionNodes" value="Reinitialize" style="width:150px"></td>' +
      '<td width="180px"><input type="button" id="graph_generateOptions" value="Generate Options" style="width:150px"></td>' +
      '</tr>' +
      '</table>'
    this.containerElement.parentElement.insertBefore(this.physicsConfiguration, this.containerElement);
    this.optionsDiv = document.createElement("div");
    this.optionsDiv.style.fontSize = "14px";
    this.optionsDiv.style.fontFamily = "verdana";
    this.containerElement.parentElement.insertBefore(this.optionsDiv, this.containerElement);

    var rangeElement;
    rangeElement = document.getElementById('graph_BH_gc');
    rangeElement.onchange = showValueOfRange.bind(this, 'graph_BH_gc', -1, "physics_barnesHut_gravitationalConstant");
    rangeElement = document.getElementById('graph_BH_cg');
    rangeElement.onchange = showValueOfRange.bind(this, 'graph_BH_cg', 1, "physics_centralGravity");
    rangeElement = document.getElementById('graph_BH_sc');
    rangeElement.onchange = showValueOfRange.bind(this, 'graph_BH_sc', 1, "physics_springConstant");
    rangeElement = document.getElementById('graph_BH_sl');
    rangeElement.onchange = showValueOfRange.bind(this, 'graph_BH_sl', 1, "physics_springLength");
    rangeElement = document.getElementById('graph_BH_damp');
    rangeElement.onchange = showValueOfRange.bind(this, 'graph_BH_damp', 1, "physics_damping");

    rangeElement = document.getElementById('graph_R_nd');
    rangeElement.onchange = showValueOfRange.bind(this, 'graph_R_nd', 1, "physics_repulsion_nodeDistance");
    rangeElement = document.getElementById('graph_R_cg');
    rangeElement.onchange = showValueOfRange.bind(this, 'graph_R_cg', 1, "physics_centralGravity");
    rangeElement = document.getElementById('graph_R_sc');
    rangeElement.onchange = showValueOfRange.bind(this, 'graph_R_sc', 1, "physics_springConstant");
    rangeElement = document.getElementById('graph_R_sl');
    rangeElement.onchange = showValueOfRange.bind(this, 'graph_R_sl', 1, "physics_springLength");
    rangeElement = document.getElementById('graph_R_damp');
    rangeElement.onchange = showValueOfRange.bind(this, 'graph_R_damp', 1, "physics_damping");

    rangeElement = document.getElementById('graph_H_nd');
    rangeElement.onchange = showValueOfRange.bind(this, 'graph_H_nd', 1, "physics_hierarchicalRepulsion_nodeDistance");
    rangeElement = document.getElementById('graph_H_cg');
    rangeElement.onchange = showValueOfRange.bind(this, 'graph_H_cg', 1, "physics_centralGravity");
    rangeElement = document.getElementById('graph_H_sc');
    rangeElement.onchange = showValueOfRange.bind(this, 'graph_H_sc', 1, "physics_springConstant");
    rangeElement = document.getElementById('graph_H_sl');
    rangeElement.onchange = showValueOfRange.bind(this, 'graph_H_sl', 1, "physics_springLength");
    rangeElement = document.getElementById('graph_H_damp');
    rangeElement.onchange = showValueOfRange.bind(this, 'graph_H_damp', 1, "physics_damping");
    rangeElement = document.getElementById('graph_H_direction');
    rangeElement.onchange = showValueOfRange.bind(this, 'graph_H_direction', hierarchicalLayoutDirections, "hierarchicalLayout_direction");
    rangeElement = document.getElementById('graph_H_levsep');
    rangeElement.onchange = showValueOfRange.bind(this, 'graph_H_levsep', 1, "hierarchicalLayout_levelSeparation");
    rangeElement = document.getElementById('graph_H_nspac');
    rangeElement.onchange = showValueOfRange.bind(this, 'graph_H_nspac', 1, "hierarchicalLayout_nodeSpacing");

    var radioButton1 = document.getElementById("graph_physicsMethod1");
    var radioButton2 = document.getElementById("graph_physicsMethod2");
    var radioButton3 = document.getElementById("graph_physicsMethod3");
    radioButton2.checked = true;
    if (this.constants.physics.barnesHut.enabled) {
      radioButton1.checked = true;
    }
    if (this.constants.hierarchicalLayout.enabled) {
      radioButton3.checked = true;
    }

    var graph_toggleSmooth = document.getElementById("graph_toggleSmooth");
    var graph_repositionNodes = document.getElementById("graph_repositionNodes");
    var graph_generateOptions = document.getElementById("graph_generateOptions");

    graph_toggleSmooth.onclick = graphToggleSmoothCurves.bind(this);
    graph_repositionNodes.onclick = graphRepositionNodes.bind(this);
    graph_generateOptions.onclick = graphGenerateOptions.bind(this);
    if (this.constants.smoothCurves == true && this.constants.dynamicSmoothCurves == false) {
      graph_toggleSmooth.style.background = "#A4FF56";
    }
    else {
      graph_toggleSmooth.style.background = "#FF8532";
    }


    switchConfigurations.apply(this);

    radioButton1.onchange = switchConfigurations.bind(this);
    radioButton2.onchange = switchConfigurations.bind(this);
    radioButton3.onchange = switchConfigurations.bind(this);
  }
};

/**
 * This overwrites the this.constants.
 *
 * @param constantsVariableName
 * @param value
 * @private
 */
exports._overWriteGraphConstants = function (constantsVariableName, value) {
  var nameArray = constantsVariableName.split("_");
  if (nameArray.length == 1) {
    this.constants[nameArray[0]] = value;
  }
  else if (nameArray.length == 2) {
    this.constants[nameArray[0]][nameArray[1]] = value;
  }
  else if (nameArray.length == 3) {
    this.constants[nameArray[0]][nameArray[1]][nameArray[2]] = value;
  }
};


/**
 * this function is bound to the toggle smooth curves button. That is also why it is not in the prototype.
 */
function graphToggleSmoothCurves () {
  this.constants.smoothCurves.enabled = !this.constants.smoothCurves.enabled;
  var graph_toggleSmooth = document.getElementById("graph_toggleSmooth");
  if (this.constants.smoothCurves.enabled == true) {graph_toggleSmooth.style.background = "#A4FF56";}
  else                                     {graph_toggleSmooth.style.background = "#FF8532";}

  this._configureSmoothCurves(false);
}

/**
 * this function is used to scramble the nodes
 *
 */
function graphRepositionNodes () {
  for (var nodeId in this.calculationNodes) {
    if (this.calculationNodes.hasOwnProperty(nodeId)) {
      this.calculationNodes[nodeId].vx = 0;  this.calculationNodes[nodeId].vy = 0;
      this.calculationNodes[nodeId].fx = 0;  this.calculationNodes[nodeId].fy = 0;
    }
  }
  if (this.constants.hierarchicalLayout.enabled == true) {
    this._setupHierarchicalLayout();
    showValueOfRange.call(this, 'graph_H_nd', 1, "physics_hierarchicalRepulsion_nodeDistance");
    showValueOfRange.call(this, 'graph_H_cg', 1, "physics_centralGravity");
    showValueOfRange.call(this, 'graph_H_sc', 1, "physics_springConstant");
    showValueOfRange.call(this, 'graph_H_sl', 1, "physics_springLength");
    showValueOfRange.call(this, 'graph_H_damp', 1, "physics_damping");
  }
  else {
    this.repositionNodes();
  }
  this.moving = true;
  this.start();
}

/**
 *  this is used to generate an options file from the playing with physics system.
 */
function graphGenerateOptions () {
  var options = "No options are required, default values used.";
  var optionsSpecific = [];
  var radioButton1 = document.getElementById("graph_physicsMethod1");
  var radioButton2 = document.getElementById("graph_physicsMethod2");
  if (radioButton1.checked == true) {
    if (this.constants.physics.barnesHut.gravitationalConstant != this.backupConstants.physics.barnesHut.gravitationalConstant) {optionsSpecific.push("gravitationalConstant: " + this.constants.physics.barnesHut.gravitationalConstant);}
    if (this.constants.physics.centralGravity != this.backupConstants.physics.barnesHut.centralGravity)                         {optionsSpecific.push("centralGravity: " + this.constants.physics.centralGravity);}
    if (this.constants.physics.springLength != this.backupConstants.physics.barnesHut.springLength)                             {optionsSpecific.push("springLength: " + this.constants.physics.springLength);}
    if (this.constants.physics.springConstant != this.backupConstants.physics.barnesHut.springConstant)                         {optionsSpecific.push("springConstant: " + this.constants.physics.springConstant);}
    if (this.constants.physics.damping != this.backupConstants.physics.barnesHut.damping)                                       {optionsSpecific.push("damping: " + this.constants.physics.damping);}
    if (optionsSpecific.length != 0) {
      options = "var options = {";
      options += "physics: {barnesHut: {";
      for (var i = 0; i < optionsSpecific.length; i++) {
        options += optionsSpecific[i];
        if (i < optionsSpecific.length - 1) {
          options += ", "
        }
      }
      options += '}}'
    }
    if (this.constants.smoothCurves.enabled != this.backupConstants.smoothCurves.enabled) {
      if (optionsSpecific.length == 0) {options = "var options = {";}
      else {options += ", "}
      options += "smoothCurves: " + this.constants.smoothCurves.enabled;
    }
    if (options != "No options are required, default values used.") {
      options += '};'
    }
  }
  else if (radioButton2.checked == true) {
    options = "var options = {";
    options += "physics: {barnesHut: {enabled: false}";
    if (this.constants.physics.repulsion.nodeDistance != this.backupConstants.physics.repulsion.nodeDistance)  {optionsSpecific.push("nodeDistance: " + this.constants.physics.repulsion.nodeDistance);}
    if (this.constants.physics.centralGravity != this.backupConstants.physics.repulsion.centralGravity)        {optionsSpecific.push("centralGravity: " + this.constants.physics.centralGravity);}
    if (this.constants.physics.springLength != this.backupConstants.physics.repulsion.springLength)            {optionsSpecific.push("springLength: " + this.constants.physics.springLength);}
    if (this.constants.physics.springConstant != this.backupConstants.physics.repulsion.springConstant)        {optionsSpecific.push("springConstant: " + this.constants.physics.springConstant);}
    if (this.constants.physics.damping != this.backupConstants.physics.repulsion.damping)                      {optionsSpecific.push("damping: " + this.constants.physics.damping);}
    if (optionsSpecific.length != 0) {
      options += ", repulsion: {";
      for (var i = 0; i < optionsSpecific.length; i++) {
        options += optionsSpecific[i];
        if (i < optionsSpecific.length - 1) {
          options += ", "
        }
      }
      options += '}}'
    }
    if (optionsSpecific.length == 0) {options += "}"}
    if (this.constants.smoothCurves != this.backupConstants.smoothCurves) {
      options += ", smoothCurves: " + this.constants.smoothCurves;
    }
    options += '};'
  }
  else {
    options = "var options = {";
    if (this.constants.physics.hierarchicalRepulsion.nodeDistance != this.backupConstants.physics.hierarchicalRepulsion.nodeDistance)  {optionsSpecific.push("nodeDistance: " + this.constants.physics.hierarchicalRepulsion.nodeDistance);}
    if (this.constants.physics.centralGravity != this.backupConstants.physics.hierarchicalRepulsion.centralGravity)        {optionsSpecific.push("centralGravity: " + this.constants.physics.centralGravity);}
    if (this.constants.physics.springLength != this.backupConstants.physics.hierarchicalRepulsion.springLength)            {optionsSpecific.push("springLength: " + this.constants.physics.springLength);}
    if (this.constants.physics.springConstant != this.backupConstants.physics.hierarchicalRepulsion.springConstant)        {optionsSpecific.push("springConstant: " + this.constants.physics.springConstant);}
    if (this.constants.physics.damping != this.backupConstants.physics.hierarchicalRepulsion.damping)                      {optionsSpecific.push("damping: " + this.constants.physics.damping);}
    if (optionsSpecific.length != 0) {
      options += "physics: {hierarchicalRepulsion: {";
      for (var i = 0; i < optionsSpecific.length; i++) {
        options += optionsSpecific[i];
        if (i < optionsSpecific.length - 1) {
          options += ", ";
        }
      }
      options += '}},';
    }
    options += 'hierarchicalLayout: {';
    optionsSpecific = [];
    if (this.constants.hierarchicalLayout.direction != this.backupConstants.hierarchicalLayout.direction)                       {optionsSpecific.push("direction: " + this.constants.hierarchicalLayout.direction);}
    if (Math.abs(this.constants.hierarchicalLayout.levelSeparation) != this.backupConstants.hierarchicalLayout.levelSeparation) {optionsSpecific.push("levelSeparation: " + this.constants.hierarchicalLayout.levelSeparation);}
    if (this.constants.hierarchicalLayout.nodeSpacing != this.backupConstants.hierarchicalLayout.nodeSpacing)                   {optionsSpecific.push("nodeSpacing: " + this.constants.hierarchicalLayout.nodeSpacing);}
    if (optionsSpecific.length != 0) {
      for (var i = 0; i < optionsSpecific.length; i++) {
        options += optionsSpecific[i];
        if (i < optionsSpecific.length - 1) {
          options += ", "
        }
      }
      options += '}'
    }
    else {
      options += "enabled:true}";
    }
    options += '};'
  }


  this.optionsDiv.innerHTML = options;
}

/**
 * this is used to switch between barnesHut, repulsion and hierarchical.
 *
 */
function switchConfigurations () {
  var ids = ["graph_BH_table", "graph_R_table", "graph_H_table"];
  var radioButton = document.querySelector('input[name="graph_physicsMethod"]:checked').value;
  var tableId = "graph_" + radioButton + "_table";
  var table = document.getElementById(tableId);
  table.style.display = "block";
  for (var i = 0; i < ids.length; i++) {
    if (ids[i] != tableId) {
      table = document.getElementById(ids[i]);
      table.style.display = "none";
    }
  }
  this._restoreNodes();
  if (radioButton == "R") {
    this.constants.hierarchicalLayout.enabled = false;
    this.constants.physics.hierarchicalRepulsion.enabled = false;
    this.constants.physics.barnesHut.enabled = false;
  }
  else if (radioButton == "H") {
    if (this.constants.hierarchicalLayout.enabled == false) {
      this.constants.hierarchicalLayout.enabled = true;
      this.constants.physics.hierarchicalRepulsion.enabled = true;
      this.constants.physics.barnesHut.enabled = false;
      this.constants.smoothCurves.enabled = false;
      this._setupHierarchicalLayout();
    }
  }
  else {
    this.constants.hierarchicalLayout.enabled = false;
    this.constants.physics.hierarchicalRepulsion.enabled = false;
    this.constants.physics.barnesHut.enabled = true;
  }
  this._loadSelectedForceSolver();
  var graph_toggleSmooth = document.getElementById("graph_toggleSmooth");
  if (this.constants.smoothCurves.enabled == true) {graph_toggleSmooth.style.background = "#A4FF56";}
  else                                     {graph_toggleSmooth.style.background = "#FF8532";}
  this.moving = true;
  this.start();
}


/**
 * this generates the ranges depending on the iniital values.
 *
 * @param id
 * @param map
 * @param constantsVariableName
 */
function showValueOfRange (id,map,constantsVariableName) {
  var valueId = id + "_value";
  var rangeValue = document.getElementById(id).value;

  if (Array.isArray(map)) {
    document.getElementById(valueId).value = map[parseInt(rangeValue)];
    this._overWriteGraphConstants(constantsVariableName,map[parseInt(rangeValue)]);
  }
  else {
    document.getElementById(valueId).value = parseInt(map) * parseFloat(rangeValue);
    this._overWriteGraphConstants(constantsVariableName, parseInt(map) * parseFloat(rangeValue));
  }

  if (constantsVariableName == "hierarchicalLayout_direction" ||
    constantsVariableName == "hierarchicalLayout_levelSeparation" ||
    constantsVariableName == "hierarchicalLayout_nodeSpacing") {
    this._setupHierarchicalLayout();
  }
  this.moving = true;
  this.start();
}



},{"../../../util":30,"./BarnesHutMixin":24,"./HierarchialRepulsionMixin":25,"./RepulsionMixin":27}],27:[function(require,module,exports){
/**
 * Calculate the forces the nodes apply on each other based on a repulsion field.
 * This field is linearly approximated.
 *
 * @private
 */
exports._calculateNodeForces = function () {
  var dx, dy, angle, distance, fx, fy, combinedClusterSize,
    repulsingForce, node1, node2, i, j;

  var nodes = this.calculationNodes;
  var nodeIndices = this.calculationNodeIndices;

  // approximation constants
  var a_base = -2 / 3;
  var b = 4 / 3;

  // repulsing forces between nodes
  var nodeDistance = this.constants.physics.repulsion.nodeDistance;
  var minimumDistance = nodeDistance;

  // we loop from i over all but the last entree in the array
  // j loops from i+1 to the last. This way we do not double count any of the indices, nor i == j
  for (i = 0; i < nodeIndices.length - 1; i++) {
    node1 = nodes[nodeIndices[i]];
    for (j = i + 1; j < nodeIndices.length; j++) {
      node2 = nodes[nodeIndices[j]];
      combinedClusterSize = node1.clusterSize + node2.clusterSize - 2;

      dx = node2.x - node1.x;
      dy = node2.y - node1.y;
      distance = Math.sqrt(dx * dx + dy * dy);

      // same condition as BarnesHut, making sure nodes are never 100% overlapping.
      if (distance == 0) {
        distance = 0.1*Math.random();
        dx = distance;
      }

      minimumDistance = (combinedClusterSize == 0) ? nodeDistance : (nodeDistance * (1 + combinedClusterSize * this.constants.clustering.distanceAmplification));
      var a = a_base / minimumDistance;
      if (distance < 2 * minimumDistance) {
        if (distance < 0.5 * minimumDistance) {
          repulsingForce = 1.0;
        }
        else {
          repulsingForce = a * distance + b; // linear approx of  1 / (1 + Math.exp((distance / minimumDistance - 1) * steepness))
        }

        // amplify the repulsion for clusters.
        repulsingForce *= (combinedClusterSize == 0) ? 1 : 1 + combinedClusterSize * this.constants.clustering.forceAmplification;
        repulsingForce = repulsingForce / Math.max(distance,0.01*minimumDistance);

        fx = dx * repulsingForce;
        fy = dy * repulsingForce;
        node1.fx -= fx;
        node1.fy -= fy;
        node2.fx += fx;
        node2.fy += fy;

      }
    }
  }
};

},{}],28:[function(require,module,exports){
/**
 * Canvas shapes used by Network
 */
if (typeof CanvasRenderingContext2D !== 'undefined') {

  /**
   * Draw a circle shape
   */
  CanvasRenderingContext2D.prototype.circle = function(x, y, r) {
    this.beginPath();
    this.arc(x, y, r, 0, 2*Math.PI, false);
  };

  /**
   * Draw a square shape
   * @param {Number} x horizontal center
   * @param {Number} y vertical center
   * @param {Number} r   size, width and height of the square
   */
  CanvasRenderingContext2D.prototype.square = function(x, y, r) {
    this.beginPath();
    this.rect(x - r, y - r, r * 2, r * 2);
  };

  /**
   * Draw a triangle shape
   * @param {Number} x horizontal center
   * @param {Number} y vertical center
   * @param {Number} r   radius, half the length of the sides of the triangle
   */
  CanvasRenderingContext2D.prototype.triangle = function(x, y, r) {
    // http://en.wikipedia.org/wiki/Equilateral_triangle
    this.beginPath();

    var s = r * 2;
    var s2 = s / 2;
    var ir = Math.sqrt(3) / 6 * s;      // radius of inner circle
    var h = Math.sqrt(s * s - s2 * s2); // height

    this.moveTo(x, y - (h - ir));
    this.lineTo(x + s2, y + ir);
    this.lineTo(x - s2, y + ir);
    this.lineTo(x, y - (h - ir));
    this.closePath();
  };

  /**
   * Draw a triangle shape in downward orientation
   * @param {Number} x horizontal center
   * @param {Number} y vertical center
   * @param {Number} r radius
   */
  CanvasRenderingContext2D.prototype.triangleDown = function(x, y, r) {
    // http://en.wikipedia.org/wiki/Equilateral_triangle
    this.beginPath();

    var s = r * 2;
    var s2 = s / 2;
    var ir = Math.sqrt(3) / 6 * s;      // radius of inner circle
    var h = Math.sqrt(s * s - s2 * s2); // height

    this.moveTo(x, y + (h - ir));
    this.lineTo(x + s2, y - ir);
    this.lineTo(x - s2, y - ir);
    this.lineTo(x, y + (h - ir));
    this.closePath();
  };

  /**
   * Draw a star shape, a star with 5 points
   * @param {Number} x horizontal center
   * @param {Number} y vertical center
   * @param {Number} r   radius, half the length of the sides of the triangle
   */
  CanvasRenderingContext2D.prototype.star = function(x, y, r) {
    // http://www.html5canvastutorials.com/labs/html5-canvas-star-spinner/
    this.beginPath();

    for (var n = 0; n < 10; n++) {
      var radius = (n % 2 === 0) ? r * 1.3 : r * 0.5;
      this.lineTo(
          x + radius * Math.sin(n * 2 * Math.PI / 10),
          y - radius * Math.cos(n * 2 * Math.PI / 10)
      );
    }

    this.closePath();
  };

  /**
   * http://stackoverflow.com/questions/1255512/how-to-draw-a-rounded-rectangle-on-html-canvas
   */
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
    var r2d = Math.PI/180;
    if( w - ( 2 * r ) < 0 ) { r = ( w / 2 ); } //ensure that the radius isn't too large for x
    if( h - ( 2 * r ) < 0 ) { r = ( h / 2 ); } //ensure that the radius isn't too large for y
    this.beginPath();
    this.moveTo(x+r,y);
    this.lineTo(x+w-r,y);
    this.arc(x+w-r,y+r,r,r2d*270,r2d*360,false);
    this.lineTo(x+w,y+h-r);
    this.arc(x+w-r,y+h-r,r,0,r2d*90,false);
    this.lineTo(x+r,y+h);
    this.arc(x+r,y+h-r,r,r2d*90,r2d*180,false);
    this.lineTo(x,y+r);
    this.arc(x+r,y+r,r,r2d*180,r2d*270,false);
  };

  /**
   * http://stackoverflow.com/questions/2172798/how-to-draw-an-oval-in-html5-canvas
   */
  CanvasRenderingContext2D.prototype.ellipse = function(x, y, w, h) {
    var kappa = .5522848,
        ox = (w / 2) * kappa, // control point offset horizontal
        oy = (h / 2) * kappa, // control point offset vertical
        xe = x + w,           // x-end
        ye = y + h,           // y-end
        xm = x + w / 2,       // x-middle
        ym = y + h / 2;       // y-middle

    this.beginPath();
    this.moveTo(x, ym);
    this.bezierCurveTo(x, ym - oy, xm - ox, y, xm, y);
    this.bezierCurveTo(xm + ox, y, xe, ym - oy, xe, ym);
    this.bezierCurveTo(xe, ym + oy, xm + ox, ye, xm, ye);
    this.bezierCurveTo(xm - ox, ye, x, ym + oy, x, ym);
  };



  /**
   * http://stackoverflow.com/questions/2172798/how-to-draw-an-oval-in-html5-canvas
   */
  CanvasRenderingContext2D.prototype.database = function(x, y, w, h) {
    var f = 1/3;
    var wEllipse = w;
    var hEllipse = h * f;

    var kappa = .5522848,
        ox = (wEllipse / 2) * kappa, // control point offset horizontal
        oy = (hEllipse / 2) * kappa, // control point offset vertical
        xe = x + wEllipse,           // x-end
        ye = y + hEllipse,           // y-end
        xm = x + wEllipse / 2,       // x-middle
        ym = y + hEllipse / 2,       // y-middle
        ymb = y + (h - hEllipse/2),  // y-midlle, bottom ellipse
        yeb = y + h;                 // y-end, bottom ellipse

    this.beginPath();
    this.moveTo(xe, ym);

    this.bezierCurveTo(xe, ym + oy, xm + ox, ye, xm, ye);
    this.bezierCurveTo(xm - ox, ye, x, ym + oy, x, ym);

    this.bezierCurveTo(x, ym - oy, xm - ox, y, xm, y);
    this.bezierCurveTo(xm + ox, y, xe, ym - oy, xe, ym);

    this.lineTo(xe, ymb);

    this.bezierCurveTo(xe, ymb + oy, xm + ox, yeb, xm, yeb);
    this.bezierCurveTo(xm - ox, yeb, x, ymb + oy, x, ymb);

    this.lineTo(x, ym);
  };


  /**
   * Draw an arrow point (no line)
   */
  CanvasRenderingContext2D.prototype.arrow = function(x, y, angle, length) {
    // tail
    var xt = x - length * Math.cos(angle);
    var yt = y - length * Math.sin(angle);

    // inner tail
    // TODO: allow to customize different shapes
    var xi = x - length * 0.9 * Math.cos(angle);
    var yi = y - length * 0.9 * Math.sin(angle);

    // left
    var xl = xt + length / 3 * Math.cos(angle + 0.5 * Math.PI);
    var yl = yt + length / 3 * Math.sin(angle + 0.5 * Math.PI);

    // right
    var xr = xt + length / 3 * Math.cos(angle - 0.5 * Math.PI);
    var yr = yt + length / 3 * Math.sin(angle - 0.5 * Math.PI);

    this.beginPath();
    this.moveTo(x, y);
    this.lineTo(xl, yl);
    this.lineTo(xi, yi);
    this.lineTo(xr, yr);
    this.closePath();
  };

  /**
   * Sets up the dashedLine functionality for drawing
   * Original code came from http://stackoverflow.com/questions/4576724/dotted-stroke-in-canvas
   * @author David Jordan
   * @date 2012-08-08
   */
  CanvasRenderingContext2D.prototype.dashedLine = function(x,y,x2,y2,dashArray){
    if (!dashArray) dashArray=[10,5];
    if (dashLength==0) dashLength = 0.001; // Hack for Safari
    var dashCount = dashArray.length;
    this.moveTo(x, y);
    var dx = (x2-x), dy = (y2-y);
    var slope = dy/dx;
    var distRemaining = Math.sqrt( dx*dx + dy*dy );
    var dashIndex=0, draw=true;
    while (distRemaining>=0.1){
      var dashLength = dashArray[dashIndex++%dashCount];
      if (dashLength > distRemaining) dashLength = distRemaining;
      var xStep = Math.sqrt( dashLength*dashLength / (1 + slope*slope) );
      if (dx<0) xStep = -xStep;
      x += xStep;
      y += slope*xStep;
      this[draw ? 'lineTo' : 'moveTo'](x,y);
      distRemaining -= dashLength;
      draw = !draw;
    }
  };

  // TODO: add diamond shape
}

},{}],29:[function(require,module,exports){
var keycharm = require('keycharm');
var Emitter = require('emitter-component');
var Hammer = require('../module/hammer');
var util = require('../util');

/**
 * Turn an element into an clickToUse element.
 * When not active, the element has a transparent overlay. When the overlay is
 * clicked, the mode is changed to active.
 * When active, the element is displayed with a blue border around it, and
 * the interactive contents of the element can be used. When clicked outside
 * the element, the elements mode is changed to inactive.
 * @param {Element} container
 * @constructor
 */
function Activator(container) {
  this.active = false;

  this.dom = {
    container: container
  };

  this.dom.overlay = document.createElement('div');
  this.dom.overlay.className = 'overlay';

  this.dom.container.appendChild(this.dom.overlay);

  this.hammer = Hammer(this.dom.overlay, {prevent_default: false});
  this.hammer.on('tap', this._onTapOverlay.bind(this));

  // block all touch events (except tap)
  var me = this;
  var events = [
    'touch', 'pinch',
    'doubletap', 'hold',
    'dragstart', 'drag', 'dragend',
    'mousewheel', 'DOMMouseScroll' // DOMMouseScroll is needed for Firefox
  ];
  events.forEach(function (event) {
    me.hammer.on(event, function (event) {
      event.stopPropagation();
    });
  });

  // attach a tap event to the window, in order to deactivate when clicking outside the timeline
  this.windowHammer = Hammer(window, {prevent_default: false});
  this.windowHammer.on('tap', function (event) {
    // deactivate when clicked outside the container
    if (!_hasParent(event.target, container)) {
      me.deactivate();
    }
  });

  if (this.keycharm !== undefined) {
    this.keycharm.destroy();
  }
  this.keycharm = keycharm();

  // keycharm listener only bounded when active)
  this.escListener = this.deactivate.bind(this);
}

// turn into an event emitter
Emitter(Activator.prototype);

// The currently active activator
Activator.current = null;

/**
 * Destroy the activator. Cleans up all created DOM and event listeners
 */
Activator.prototype.destroy = function () {
  this.deactivate();

  // remove dom
  this.dom.overlay.parentNode.removeChild(this.dom.overlay);

  // cleanup hammer instances
  this.hammer = null;
  this.windowHammer = null;
  // FIXME: cleaning up hammer instances doesn't work (Timeline not removed from memory)
};

/**
 * Activate the element
 * Overlay is hidden, element is decorated with a blue shadow border
 */
Activator.prototype.activate = function () {
  // we allow only one active activator at a time
  if (Activator.current) {
    Activator.current.deactivate();
  }
  Activator.current = this;

  this.active = true;
  this.dom.overlay.style.display = 'none';
  util.addClassName(this.dom.container, 'vis-active');

  this.emit('change');
  this.emit('activate');

  // ugly hack: bind ESC after emitting the events, as the Network rebinds all
  // keyboard events on a 'change' event
  this.keycharm.bind('esc', this.escListener);
};

/**
 * Deactivate the element
 * Overlay is displayed on top of the element
 */
Activator.prototype.deactivate = function () {
  this.active = false;
  this.dom.overlay.style.display = '';
  util.removeClassName(this.dom.container, 'vis-active');
  this.keycharm.unbind('esc', this.escListener);

  this.emit('change');
  this.emit('deactivate');
};

/**
 * Handle a tap event: activate the container
 * @param event
 * @private
 */
Activator.prototype._onTapOverlay = function (event) {
  // activate the container
  this.activate();
  event.stopPropagation();
};

/**
 * Test whether the element has the requested parent element somewhere in
 * its chain of parent nodes.
 * @param {HTMLElement} element
 * @param {HTMLElement} parent
 * @returns {boolean} Returns true when the parent is found somewhere in the
 *                    chain of parent nodes.
 * @private
 */
function _hasParent(element, parent) {
  while (element) {
    if (element === parent) {
      return true
    }
    element = element.parentNode;
  }
  return false;
}

module.exports = Activator;

},{"../module/hammer":6,"../util":30,"emitter-component":31,"keycharm":33}],30:[function(require,module,exports){
// utility functions

// first check if moment.js is already loaded in the browser window, if so,
// use this instance. Else, load via commonjs.
var moment = require('./module/moment');

/**
 * Test whether given object is a number
 * @param {*} object
 * @return {Boolean} isNumber
 */
exports.isNumber = function(object) {
  return (object instanceof Number || typeof object == 'number');
};


/**
 * this function gives you a range between 0 and 1 based on the min and max values in the set, the total sum of all values and the current value.
 *
 * @param min
 * @param max
 * @param total
 * @param value
 * @returns {number}
 */
exports.giveRange = function(min,max,total,value) {
  if (max == min) {
    return 0.5;
  }
  else {
    var scale = 1 / (max - min);
    return Math.max(0,(value - min)*scale);
  }
}

/**
 * Test whether given object is a string
 * @param {*} object
 * @return {Boolean} isString
 */
exports.isString = function(object) {
  return (object instanceof String || typeof object == 'string');
};

/**
 * Test whether given object is a Date, or a String containing a Date
 * @param {Date | String} object
 * @return {Boolean} isDate
 */
exports.isDate = function(object) {
  if (object instanceof Date) {
    return true;
  }
  else if (exports.isString(object)) {
    // test whether this string contains a date
    var match = ASPDateRegex.exec(object);
    if (match) {
      return true;
    }
    else if (!isNaN(Date.parse(object))) {
      return true;
    }
  }

  return false;
};

/**
 * Test whether given object is an instance of google.visualization.DataTable
 * @param {*} object
 * @return {Boolean} isDataTable
 */
exports.isDataTable = function(object) {
  return (typeof (google) !== 'undefined') &&
      (google.visualization) &&
      (google.visualization.DataTable) &&
      (object instanceof google.visualization.DataTable);
};

/**
 * Create a semi UUID
 * source: http://stackoverflow.com/a/105074/1262753
 * @return {String} uuid
 */
exports.randomUUID = function() {
  var S4 = function () {
    return Math.floor(
        Math.random() * 0x10000 /* 65536 */
    ).toString(16);
  };

  return (
      S4() + S4() + '-' +
          S4() + '-' +
          S4() + '-' +
          S4() + '-' +
          S4() + S4() + S4()
      );
};

/**
 * Extend object a with the properties of object b or a series of objects
 * Only properties with defined values are copied
 * @param {Object} a
 * @param {... Object} b
 * @return {Object} a
 */
exports.extend = function (a, b) {
  for (var i = 1, len = arguments.length; i < len; i++) {
    var other = arguments[i];
    for (var prop in other) {
      if (other.hasOwnProperty(prop)) {
        a[prop] = other[prop];
      }
    }
  }

  return a;
};

/**
 * Extend object a with selected properties of object b or a series of objects
 * Only properties with defined values are copied
 * @param {Array.<String>} props
 * @param {Object} a
 * @param {... Object} b
 * @return {Object} a
 */
exports.selectiveExtend = function (props, a, b) {
  if (!Array.isArray(props)) {
    throw new Error('Array with property names expected as first argument');
  }

  for (var i = 2; i < arguments.length; i++) {
    var other = arguments[i];

    for (var p = 0; p < props.length; p++) {
      var prop = props[p];
      if (other.hasOwnProperty(prop)) {
        a[prop] = other[prop];
      }
    }
  }
  return a;
};

/**
 * Extend object a with selected properties of object b or a series of objects
 * Only properties with defined values are copied
 * @param {Array.<String>} props
 * @param {Object} a
 * @param {... Object} b
 * @return {Object} a
 */
exports.selectiveDeepExtend = function (props, a, b) {
  // TODO: add support for Arrays to deepExtend
  if (Array.isArray(b)) {
    throw new TypeError('Arrays are not supported by deepExtend');
  }
  for (var i = 2; i < arguments.length; i++) {
    var other = arguments[i];
    for (var p = 0; p < props.length; p++) {
      var prop = props[p];
      if (other.hasOwnProperty(prop)) {
        if (b[prop] && b[prop].constructor === Object) {
          if (a[prop] === undefined) {
            a[prop] = {};
          }
          if (a[prop].constructor === Object) {
            exports.deepExtend(a[prop], b[prop]);
          }
          else {
            a[prop] = b[prop];
          }
        } else if (Array.isArray(b[prop])) {
          throw new TypeError('Arrays are not supported by deepExtend');
        } else {
          a[prop] = b[prop];
        }

      }
    }
  }
  return a;
};

/**
 * Extend object a with selected properties of object b or a series of objects
 * Only properties with defined values are copied
 * @param {Array.<String>} props
 * @param {Object} a
 * @param {... Object} b
 * @return {Object} a
 */
exports.selectiveNotDeepExtend = function (props, a, b) {
  // TODO: add support for Arrays to deepExtend
  if (Array.isArray(b)) {
    throw new TypeError('Arrays are not supported by deepExtend');
  }
  for (var prop in b) {
    if (b.hasOwnProperty(prop)) {
      if (props.indexOf(prop) == -1) {
        if (b[prop] && b[prop].constructor === Object) {
          if (a[prop] === undefined) {
            a[prop] = {};
          }
          if (a[prop].constructor === Object) {
            exports.deepExtend(a[prop], b[prop]);
          }
          else {
            a[prop] = b[prop];
          }
        } else if (Array.isArray(b[prop])) {
          throw new TypeError('Arrays are not supported by deepExtend');
        } else {
          a[prop] = b[prop];
        }
      }
    }
  }
  return a;
};

/**
 * Deep extend an object a with the properties of object b
 * @param {Object} a
 * @param {Object} b
 * @returns {Object}
 */
exports.deepExtend = function(a, b) {
  // TODO: add support for Arrays to deepExtend
  if (Array.isArray(b)) {
    throw new TypeError('Arrays are not supported by deepExtend');
  }

  for (var prop in b) {
    if (b.hasOwnProperty(prop)) {
      if (b[prop] && b[prop].constructor === Object) {
        if (a[prop] === undefined) {
          a[prop] = {};
        }
        if (a[prop].constructor === Object) {
          exports.deepExtend(a[prop], b[prop]);
        }
        else {
          a[prop] = b[prop];
        }
      } else if (Array.isArray(b[prop])) {
        throw new TypeError('Arrays are not supported by deepExtend');
      } else {
        a[prop] = b[prop];
      }
    }
  }
  return a;
};

/**
 * Test whether all elements in two arrays are equal.
 * @param {Array} a
 * @param {Array} b
 * @return {boolean} Returns true if both arrays have the same length and same
 *                   elements.
 */
exports.equalArray = function (a, b) {
  if (a.length != b.length) return false;

  for (var i = 0, len = a.length; i < len; i++) {
    if (a[i] != b[i]) return false;
  }

  return true;
};

/**
 * Convert an object to another type
 * @param {Boolean | Number | String | Date | Moment | Null | undefined} object
 * @param {String | undefined} type   Name of the type. Available types:
 *                                    'Boolean', 'Number', 'String',
 *                                    'Date', 'Moment', ISODate', 'ASPDate'.
 * @return {*} object
 * @throws Error
 */
exports.convert = function(object, type) {
  var match;

  if (object === undefined) {
    return undefined;
  }
  if (object === null) {
    return null;
  }

  if (!type) {
    return object;
  }
  if (!(typeof type === 'string') && !(type instanceof String)) {
    throw new Error('Type must be a string');
  }

  //noinspection FallthroughInSwitchStatementJS
  switch (type) {
    case 'boolean':
    case 'Boolean':
      return Boolean(object);

    case 'number':
    case 'Number':
      return Number(object.valueOf());

    case 'string':
    case 'String':
      return String(object);

    case 'Date':
      if (exports.isNumber(object)) {
        return new Date(object);
      }
      if (object instanceof Date) {
        return new Date(object.valueOf());
      }
      else if (moment.isMoment(object)) {
        return new Date(object.valueOf());
      }
      if (exports.isString(object)) {
        match = ASPDateRegex.exec(object);
        if (match) {
          // object is an ASP date
          return new Date(Number(match[1])); // parse number
        }
        else {
          return moment(object).toDate(); // parse string
        }
      }
      else {
        throw new Error(
            'Cannot convert object of type ' + exports.getType(object) +
                ' to type Date');
      }

    case 'Moment':
      if (exports.isNumber(object)) {
        return moment(object);
      }
      if (object instanceof Date) {
        return moment(object.valueOf());
      }
      else if (moment.isMoment(object)) {
        return moment(object);
      }
      if (exports.isString(object)) {
        match = ASPDateRegex.exec(object);
        if (match) {
          // object is an ASP date
          return moment(Number(match[1])); // parse number
        }
        else {
          return moment(object); // parse string
        }
      }
      else {
        throw new Error(
            'Cannot convert object of type ' + exports.getType(object) +
                ' to type Date');
      }

    case 'ISODate':
      if (exports.isNumber(object)) {
        return new Date(object);
      }
      else if (object instanceof Date) {
        return object.toISOString();
      }
      else if (moment.isMoment(object)) {
        return object.toDate().toISOString();
      }
      else if (exports.isString(object)) {
        match = ASPDateRegex.exec(object);
        if (match) {
          // object is an ASP date
          return new Date(Number(match[1])).toISOString(); // parse number
        }
        else {
          return new Date(object).toISOString(); // parse string
        }
      }
      else {
        throw new Error(
            'Cannot convert object of type ' + exports.getType(object) +
                ' to type ISODate');
      }

    case 'ASPDate':
      if (exports.isNumber(object)) {
        return '/Date(' + object + ')/';
      }
      else if (object instanceof Date) {
        return '/Date(' + object.valueOf() + ')/';
      }
      else if (exports.isString(object)) {
        match = ASPDateRegex.exec(object);
        var value;
        if (match) {
          // object is an ASP date
          value = new Date(Number(match[1])).valueOf(); // parse number
        }
        else {
          value = new Date(object).valueOf(); // parse string
        }
        return '/Date(' + value + ')/';
      }
      else {
        throw new Error(
            'Cannot convert object of type ' + exports.getType(object) +
                ' to type ASPDate');
      }

    default:
      throw new Error('Unknown type "' + type + '"');
  }
};

// parse ASP.Net Date pattern,
// for example '/Date(1198908717056)/' or '/Date(1198908717056-0700)/'
// code from http://momentjs.com/
var ASPDateRegex = /^\/?Date\((\-?\d+)/i;

/**
 * Get the type of an object, for example exports.getType([]) returns 'Array'
 * @param {*} object
 * @return {String} type
 */
exports.getType = function(object) {
  var type = typeof object;

  if (type == 'object') {
    if (object == null) {
      return 'null';
    }
    if (object instanceof Boolean) {
      return 'Boolean';
    }
    if (object instanceof Number) {
      return 'Number';
    }
    if (object instanceof String) {
      return 'String';
    }
    if (Array.isArray(object)) {
      return 'Array';
    }
    if (object instanceof Date) {
      return 'Date';
    }
    return 'Object';
  }
  else if (type == 'number') {
    return 'Number';
  }
  else if (type == 'boolean') {
    return 'Boolean';
  }
  else if (type == 'string') {
    return 'String';
  }

  return type;
};

/**
 * Retrieve the absolute left value of a DOM element
 * @param {Element} elem        A dom element, for example a div
 * @return {number} left        The absolute left position of this element
 *                              in the browser page.
 */
exports.getAbsoluteLeft = function(elem) {
  return elem.getBoundingClientRect().left + window.pageXOffset;
};

/**
 * Retrieve the absolute top value of a DOM element
 * @param {Element} elem        A dom element, for example a div
 * @return {number} top        The absolute top position of this element
 *                              in the browser page.
 */
exports.getAbsoluteTop = function(elem) {
  return elem.getBoundingClientRect().top + window.pageYOffset;
};

/**
 * add a className to the given elements style
 * @param {Element} elem
 * @param {String} className
 */
exports.addClassName = function(elem, className) {
  var classes = elem.className.split(' ');
  if (classes.indexOf(className) == -1) {
    classes.push(className); // add the class to the array
    elem.className = classes.join(' ');
  }
};

/**
 * add a className to the given elements style
 * @param {Element} elem
 * @param {String} className
 */
exports.removeClassName = function(elem, className) {
  var classes = elem.className.split(' ');
  var index = classes.indexOf(className);
  if (index != -1) {
    classes.splice(index, 1); // remove the class from the array
    elem.className = classes.join(' ');
  }
};

/**
 * For each method for both arrays and objects.
 * In case of an array, the built-in Array.forEach() is applied.
 * In case of an Object, the method loops over all properties of the object.
 * @param {Object | Array} object   An Object or Array
 * @param {function} callback       Callback method, called for each item in
 *                                  the object or array with three parameters:
 *                                  callback(value, index, object)
 */
exports.forEach = function(object, callback) {
  var i,
      len;
  if (Array.isArray(object)) {
    // array
    for (i = 0, len = object.length; i < len; i++) {
      callback(object[i], i, object);
    }
  }
  else {
    // object
    for (i in object) {
      if (object.hasOwnProperty(i)) {
        callback(object[i], i, object);
      }
    }
  }
};

/**
 * Convert an object into an array: all objects properties are put into the
 * array. The resulting array is unordered.
 * @param {Object} object
 * @param {Array} array
 */
exports.toArray = function(object) {
  var array = [];

  for (var prop in object) {
    if (object.hasOwnProperty(prop)) array.push(object[prop]);
  }

  return array;
}

/**
 * Update a property in an object
 * @param {Object} object
 * @param {String} key
 * @param {*} value
 * @return {Boolean} changed
 */
exports.updateProperty = function(object, key, value) {
  if (object[key] !== value) {
    object[key] = value;
    return true;
  }
  else {
    return false;
  }
};

/**
 * Add and event listener. Works for all browsers
 * @param {Element}     element    An html element
 * @param {string}      action     The action, for example "click",
 *                                 without the prefix "on"
 * @param {function}    listener   The callback function to be executed
 * @param {boolean}     [useCapture]
 */
exports.addEventListener = function(element, action, listener, useCapture) {
  if (element.addEventListener) {
    if (useCapture === undefined)
      useCapture = false;

    if (action === "mousewheel" && navigator.userAgent.indexOf("Firefox") >= 0) {
      action = "DOMMouseScroll";  // For Firefox
    }

    element.addEventListener(action, listener, useCapture);
  } else {
    element.attachEvent("on" + action, listener);  // IE browsers
  }
};

/**
 * Remove an event listener from an element
 * @param {Element}     element         An html dom element
 * @param {string}      action          The name of the event, for example "mousedown"
 * @param {function}    listener        The listener function
 * @param {boolean}     [useCapture]
 */
exports.removeEventListener = function(element, action, listener, useCapture) {
  if (element.removeEventListener) {
    // non-IE browsers
    if (useCapture === undefined)
      useCapture = false;

    if (action === "mousewheel" && navigator.userAgent.indexOf("Firefox") >= 0) {
      action = "DOMMouseScroll";  // For Firefox
    }

    element.removeEventListener(action, listener, useCapture);
  } else {
    // IE browsers
    element.detachEvent("on" + action, listener);
  }
};

/**
 * Cancels the event if it is cancelable, without stopping further propagation of the event.
 */
exports.preventDefault = function (event) {
  if (!event)
    event = window.event;

  if (event.preventDefault) {
    event.preventDefault();  // non-IE browsers
  }
  else {
    event.returnValue = false;  // IE browsers
  }
};

/**
 * Get HTML element which is the target of the event
 * @param {Event} event
 * @return {Element} target element
 */
exports.getTarget = function(event) {
  // code from http://www.quirksmode.org/js/events_properties.html
  if (!event) {
    event = window.event;
  }

  var target;

  if (event.target) {
    target = event.target;
  }
  else if (event.srcElement) {
    target = event.srcElement;
  }

  if (target.nodeType != undefined && target.nodeType == 3) {
    // defeat Safari bug
    target = target.parentNode;
  }

  return target;
};

exports.option = {};

/**
 * Convert a value into a boolean
 * @param {Boolean | function | undefined} value
 * @param {Boolean} [defaultValue]
 * @returns {Boolean} bool
 */
exports.option.asBoolean = function (value, defaultValue) {
  if (typeof value == 'function') {
    value = value();
  }

  if (value != null) {
    return (value != false);
  }

  return defaultValue || null;
};

/**
 * Convert a value into a number
 * @param {Boolean | function | undefined} value
 * @param {Number} [defaultValue]
 * @returns {Number} number
 */
exports.option.asNumber = function (value, defaultValue) {
  if (typeof value == 'function') {
    value = value();
  }

  if (value != null) {
    return Number(value) || defaultValue || null;
  }

  return defaultValue || null;
};

/**
 * Convert a value into a string
 * @param {String | function | undefined} value
 * @param {String} [defaultValue]
 * @returns {String} str
 */
exports.option.asString = function (value, defaultValue) {
  if (typeof value == 'function') {
    value = value();
  }

  if (value != null) {
    return String(value);
  }

  return defaultValue || null;
};

/**
 * Convert a size or location into a string with pixels or a percentage
 * @param {String | Number | function | undefined} value
 * @param {String} [defaultValue]
 * @returns {String} size
 */
exports.option.asSize = function (value, defaultValue) {
  if (typeof value == 'function') {
    value = value();
  }

  if (exports.isString(value)) {
    return value;
  }
  else if (exports.isNumber(value)) {
    return value + 'px';
  }
  else {
    return defaultValue || null;
  }
};

/**
 * Convert a value into a DOM element
 * @param {HTMLElement | function | undefined} value
 * @param {HTMLElement} [defaultValue]
 * @returns {HTMLElement | null} dom
 */
exports.option.asElement = function (value, defaultValue) {
  if (typeof value == 'function') {
    value = value();
  }

  return value || defaultValue || null;
};

/**
 * http://stackoverflow.com/questions/5623838/rgb-to-hex-and-hex-to-rgb
 *
 * @param {String} hex
 * @returns {{r: *, g: *, b: *}} | 255 range
 */
exports.hexToRGB = function(hex) {
  // Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
  var shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  hex = hex.replace(shorthandRegex, function(m, r, g, b) {
      return r + r + g + g + b + b;
  });
  var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
  } : null;
};

/**
 * This function takes color in hex format or rgb() or rgba() format and overrides the opacity. Returns rgba() string.
 * @param color
 * @param opacity
 * @returns {*}
 */
exports.overrideOpacity = function(color,opacity) {
  if (color.indexOf("rgb") != -1) {
    var rgb = color.substr(color.indexOf("(")+1).replace(")","").split(",");
    return "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + opacity + ")"
  }
  else {
    var rgb = exports.hexToRGB(color);
    if (rgb == null) {
      return color;
    }
    else {
      return "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + "," + opacity + ")"
    }
  }
}

/**
 *
 * @param red     0 -- 255
 * @param green   0 -- 255
 * @param blue    0 -- 255
 * @returns {string}
 * @constructor
 */
exports.RGBToHex = function(red,green,blue) {
  return "#" + ((1 << 24) + (red << 16) + (green << 8) + blue).toString(16).slice(1);
};

/**
 * Parse a color property into an object with border, background, and
 * highlight colors
 * @param {Object | String} color
 * @return {Object} colorObject
 */
exports.parseColor = function(color) {
  var c;
  if (exports.isString(color)) {
    if (exports.isValidRGB(color)) {
      var rgb = color.substr(4).substr(0,color.length-5).split(',');
      color = exports.RGBToHex(rgb[0],rgb[1],rgb[2]);
    }
    if (exports.isValidHex(color)) {
      var hsv = exports.hexToHSV(color);
      var lighterColorHSV = {h:hsv.h,s:hsv.s * 0.45,v:Math.min(1,hsv.v * 1.05)};
      var darkerColorHSV  = {h:hsv.h,s:Math.min(1,hsv.v * 1.25),v:hsv.v*0.6};
      var darkerColorHex  = exports.HSVToHex(darkerColorHSV.h ,darkerColorHSV.h ,darkerColorHSV.v);
      var lighterColorHex = exports.HSVToHex(lighterColorHSV.h,lighterColorHSV.s,lighterColorHSV.v);

      c = {
        background: color,
        border:darkerColorHex,
        highlight: {
          background:lighterColorHex,
          border:darkerColorHex
        },
        hover: {
          background:lighterColorHex,
          border:darkerColorHex
        }
      };
    }
    else {
      c = {
        background:color,
        border:color,
        highlight: {
          background:color,
          border:color
        },
        hover: {
          background:color,
          border:color
        }
      };
    }
  }
  else {
    c = {};
    c.background = color.background || 'white';
    c.border = color.border || c.background;

    if (exports.isString(color.highlight)) {
      c.highlight = {
        border: color.highlight,
        background: color.highlight
      }
    }
    else {
      c.highlight = {};
      c.highlight.background = color.highlight && color.highlight.background || c.background;
      c.highlight.border = color.highlight && color.highlight.border || c.border;
    }

    if (exports.isString(color.hover)) {
      c.hover = {
        border: color.hover,
        background: color.hover
      }
    }
    else {
      c.hover = {};
      c.hover.background = color.hover && color.hover.background || c.background;
      c.hover.border = color.hover && color.hover.border || c.border;
    }
  }

  return c;
};

/**
 * http://www.javascripter.net/faq/rgb2hsv.htm
 *
 * @param red
 * @param green
 * @param blue
 * @returns {*}
 * @constructor
 */
exports.RGBToHSV = function(red,green,blue) {
  red=red/255; green=green/255; blue=blue/255;
  var minRGB = Math.min(red,Math.min(green,blue));
  var maxRGB = Math.max(red,Math.max(green,blue));

  // Black-gray-white
  if (minRGB == maxRGB) {
    return {h:0,s:0,v:minRGB};
  }

  // Colors other than black-gray-white:
  var d = (red==minRGB) ? green-blue : ((blue==minRGB) ? red-green : blue-red);
  var h = (red==minRGB) ? 3 : ((blue==minRGB) ? 1 : 5);
  var hue = 60*(h - d/(maxRGB - minRGB))/360;
  var saturation = (maxRGB - minRGB)/maxRGB;
  var value = maxRGB;
  return {h:hue,s:saturation,v:value};
};

var cssUtil = {
  // split a string with css styles into an object with key/values
  split: function (cssText) {
    var styles = {};

    cssText.split(';').forEach(function (style) {
      if (style.trim() != '') {
        var parts = style.split(':');
        var key = parts[0].trim();
        var value = parts[1].trim();
        styles[key] = value;
      }
    });

    return styles;
  },

  // build a css text string from an object with key/values
  join: function (styles) {
    return Object.keys(styles)
        .map(function (key) {
          return key + ': ' + styles[key];
        })
        .join('; ');
  }
};

/**
 * Append a string with css styles to an element
 * @param {Element} element
 * @param {String} cssText
 */
exports.addCssText = function (element, cssText) {
  var currentStyles = cssUtil.split(element.style.cssText);
  var newStyles = cssUtil.split(cssText);
  var styles = exports.extend(currentStyles, newStyles);

  element.style.cssText = cssUtil.join(styles);
};

/**
 * Remove a string with css styles from an element
 * @param {Element} element
 * @param {String} cssText
 */
exports.removeCssText = function (element, cssText) {
  var styles = cssUtil.split(element.style.cssText);
  var removeStyles = cssUtil.split(cssText);

  for (var key in removeStyles) {
    if (removeStyles.hasOwnProperty(key)) {
      delete styles[key];
    }
  }

  element.style.cssText = cssUtil.join(styles);
};

/**
 * https://gist.github.com/mjijackson/5311256
 * @param h
 * @param s
 * @param v
 * @returns {{r: number, g: number, b: number}}
 * @constructor
 */
exports.HSVToRGB = function(h, s, v) {
  var r, g, b;

  var i = Math.floor(h * 6);
  var f = h * 6 - i;
  var p = v * (1 - s);
  var q = v * (1 - f * s);
  var t = v * (1 - (1 - f) * s);

  switch (i % 6) {
    case 0: r = v, g = t, b = p; break;
    case 1: r = q, g = v, b = p; break;
    case 2: r = p, g = v, b = t; break;
    case 3: r = p, g = q, b = v; break;
    case 4: r = t, g = p, b = v; break;
    case 5: r = v, g = p, b = q; break;
  }

  return {r:Math.floor(r * 255), g:Math.floor(g * 255), b:Math.floor(b * 255) };
};

exports.HSVToHex = function(h, s, v) {
  var rgb = exports.HSVToRGB(h, s, v);
  return exports.RGBToHex(rgb.r, rgb.g, rgb.b);
};

exports.hexToHSV = function(hex) {
  var rgb = exports.hexToRGB(hex);
  return exports.RGBToHSV(rgb.r, rgb.g, rgb.b);
};

exports.isValidHex = function(hex) {
  var isOk = /(^#[0-9A-F]{6}$)|(^#[0-9A-F]{3}$)/i.test(hex);
  return isOk;
};

exports.isValidRGB = function(rgb) {
  rgb = rgb.replace(" ","");
  var isOk = /rgb\((\d{1,3}),(\d{1,3}),(\d{1,3})\)/i.test(rgb);
  return isOk;
}

/**
 * This recursively redirects the prototype of JSON objects to the referenceObject
 * This is used for default options.
 *
 * @param referenceObject
 * @returns {*}
 */
exports.selectiveBridgeObject = function(fields, referenceObject) {
  if (typeof referenceObject == "object") {
    var objectTo = Object.create(referenceObject);
    for (var i = 0; i < fields.length; i++) {
      if (referenceObject.hasOwnProperty(fields[i])) {
        if (typeof referenceObject[fields[i]] == "object") {
          objectTo[fields[i]] = exports.bridgeObject(referenceObject[fields[i]]);
        }
      }
    }
    return objectTo;
  }
  else {
    return null;
  }
};

/**
 * This recursively redirects the prototype of JSON objects to the referenceObject
 * This is used for default options.
 *
 * @param referenceObject
 * @returns {*}
 */
exports.bridgeObject = function(referenceObject) {
  if (typeof referenceObject == "object") {
    var objectTo = Object.create(referenceObject);
    for (var i in referenceObject) {
      if (referenceObject.hasOwnProperty(i)) {
        if (typeof referenceObject[i] == "object") {
          objectTo[i] = exports.bridgeObject(referenceObject[i]);
        }
      }
    }
    return objectTo;
  }
  else {
    return null;
  }
};


/**
 * this is used to set the options of subobjects in the options object. A requirement of these subobjects
 * is that they have an 'enabled' element which is optional for the user but mandatory for the program.
 *
 * @param [object] mergeTarget | this is either this.options or the options used for the groups.
 * @param [object] options     | options
 * @param [String] option      | this is the option key in the options argument
 * @private
 */
exports.mergeOptions = function (mergeTarget, options, option) {
  if (options[option] !== undefined) {
    if (typeof options[option] == 'boolean') {
      mergeTarget[option].enabled = options[option];
    }
    else {
      mergeTarget[option].enabled = true;
      for (var prop in options[option]) {
        if (options[option].hasOwnProperty(prop)) {
          mergeTarget[option][prop] = options[option][prop];
        }
      }
    }
  }
}


/**
 * This function does a binary search for a visible item in a sorted list. If we find a visible item, the code that uses
 * this function will then iterate in both directions over this sorted list to find all visible items.
 *
 * @param {Item[]} orderedItems       | Items ordered by start
 * @param {function} searchFunction   | -1 is lower, 0 is found, 1 is higher
 * @param {String} field
 * @param {String} field2
 * @returns {number}
 * @private
 */
exports.binarySearchCustom = function(orderedItems, searchFunction, field, field2) {
  var maxIterations = 10000;
  var iteration = 0;
  var low = 0;
  var high = orderedItems.length - 1;

  while (low <= high && iteration < maxIterations) {
    var middle = Math.floor((low + high) / 2);

    var item = orderedItems[middle];
    var value = (field2 === undefined) ? item[field] : item[field][field2];

    var searchResult = searchFunction(value);
    if (searchResult == 0) { // jihaa, found a visible item!
      return middle;
    }
    else if (searchResult == -1) {  // it is too small --> increase low
      low = middle + 1;
    }
    else {  // it is too big --> decrease high
      high = middle - 1;
    }

    iteration++;
  }

  return -1;
};

/**
 * This function does a binary search for a specific value in a sorted array. If it does not exist but is in between of
 * two values, we return either the one before or the one after, depending on user input
 * If it is found, we return the index, else -1.
 *
 * @param {Array} orderedItems
 * @param {{start: number, end: number}} target
 * @param {String} field
 * @param {String} sidePreference   'before' or 'after'
 * @returns {number}
 * @private
 */
exports.binarySearchValue = function(orderedItems, target, field, sidePreference) {
  var maxIterations = 10000;
  var iteration = 0;
  var low = 0;
  var high = orderedItems.length - 1;
  var prevValue, value, nextValue, middle;

  while (low <= high && iteration < maxIterations) {
    // get a new guess
    middle = Math.floor(0.5*(high+low));
    prevValue = orderedItems[Math.max(0,middle - 1)][field];
    value     = orderedItems[middle][field];
    nextValue = orderedItems[Math.min(orderedItems.length-1,middle + 1)][field];

    if (value == target) { // we found the target
      return middle;
    }
    else if (prevValue < target && value > target) {  // target is in between of the previous and the current
      return sidePreference == 'before' ? Math.max(0,middle - 1) : middle;
    }
    else if (value < target && nextValue > target) { // target is in between of the current and the next
      return sidePreference == 'before' ? middle : Math.min(orderedItems.length-1,middle + 1);
    }
    else {  // didnt find the target, we need to change our boundaries.
      if (value < target) { // it is too small --> increase low
        low = middle + 1;
      }
      else {  // it is too big --> decrease high
        high = middle - 1;
      }
    }
    iteration++;
  }

  // didnt find anything. Return -1.
  return -1;
};

/**
 * Quadratic ease-in-out
 * http://gizma.com/easing/
 * @param {number} t        Current time
 * @param {number} start    Start value
 * @param {number} end      End value
 * @param {number} duration Duration
 * @returns {number} Value corresponding with current time
 */
exports.easeInOutQuad = function (t, start, end, duration) {
  var change = end - start;
  t /= duration/2;
  if (t < 1) return change/2*t*t + start;
  t--;
  return -change/2 * (t*(t-2) - 1) + start;
};



/*
 * Easing Functions - inspired from http://gizma.com/easing/
 * only considering the t value for the range [0, 1] => [0, 1]
 * https://gist.github.com/gre/1650294
 */
exports.easingFunctions = {
  // no easing, no acceleration
  linear: function (t) {
    return t
  },
  // accelerating from zero velocity
  easeInQuad: function (t) {
    return t * t
  },
  // decelerating to zero velocity
  easeOutQuad: function (t) {
    return t * (2 - t)
  },
  // acceleration until halfway, then deceleration
  easeInOutQuad: function (t) {
    return t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t
  },
  // accelerating from zero velocity
  easeInCubic: function (t) {
    return t * t * t
  },
  // decelerating to zero velocity
  easeOutCubic: function (t) {
    return (--t) * t * t + 1
  },
  // acceleration until halfway, then deceleration
  easeInOutCubic: function (t) {
    return t < .5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1
  },
  // accelerating from zero velocity
  easeInQuart: function (t) {
    return t * t * t * t
  },
  // decelerating to zero velocity
  easeOutQuart: function (t) {
    return 1 - (--t) * t * t * t
  },
  // acceleration until halfway, then deceleration
  easeInOutQuart: function (t) {
    return t < .5 ? 8 * t * t * t * t : 1 - 8 * (--t) * t * t * t
  },
  // accelerating from zero velocity
  easeInQuint: function (t) {
    return t * t * t * t * t
  },
  // decelerating to zero velocity
  easeOutQuint: function (t) {
    return 1 + (--t) * t * t * t * t
  },
  // acceleration until halfway, then deceleration
  easeInOutQuint: function (t) {
    return t < .5 ? 16 * t * t * t * t * t : 1 + 16 * (--t) * t * t * t * t
  }
};
},{"./module/moment":7}],31:[function(require,module,exports){

/**
 * Expose `Emitter`.
 */

module.exports = Emitter;

/**
 * Initialize a new `Emitter`.
 *
 * @api public
 */

function Emitter(obj) {
  if (obj) return mixin(obj);
};

/**
 * Mixin the emitter properties.
 *
 * @param {Object} obj
 * @return {Object}
 * @api private
 */

function mixin(obj) {
  for (var key in Emitter.prototype) {
    obj[key] = Emitter.prototype[key];
  }
  return obj;
}

/**
 * Listen on the given `event` with `fn`.
 *
 * @param {String} event
 * @param {Function} fn
 * @return {Emitter}
 * @api public
 */

Emitter.prototype.on =
Emitter.prototype.addEventListener = function(event, fn){
  this._callbacks = this._callbacks || {};
  (this._callbacks[event] = this._callbacks[event] || [])
    .push(fn);
  return this;
};

/**
 * Adds an `event` listener that will be invoked a single
 * time then automatically removed.
 *
 * @param {String} event
 * @param {Function} fn
 * @return {Emitter}
 * @api public
 */

Emitter.prototype.once = function(event, fn){
  var self = this;
  this._callbacks = this._callbacks || {};

  function on() {
    self.off(event, on);
    fn.apply(this, arguments);
  }

  on.fn = fn;
  this.on(event, on);
  return this;
};

/**
 * Remove the given callback for `event` or all
 * registered callbacks.
 *
 * @param {String} event
 * @param {Function} fn
 * @return {Emitter}
 * @api public
 */

Emitter.prototype.off =
Emitter.prototype.removeListener =
Emitter.prototype.removeAllListeners =
Emitter.prototype.removeEventListener = function(event, fn){
  this._callbacks = this._callbacks || {};

  // all
  if (0 == arguments.length) {
    this._callbacks = {};
    return this;
  }

  // specific event
  var callbacks = this._callbacks[event];
  if (!callbacks) return this;

  // remove all handlers
  if (1 == arguments.length) {
    delete this._callbacks[event];
    return this;
  }

  // remove specific handler
  var cb;
  for (var i = 0; i < callbacks.length; i++) {
    cb = callbacks[i];
    if (cb === fn || cb.fn === fn) {
      callbacks.splice(i, 1);
      break;
    }
  }
  return this;
};

/**
 * Emit `event` with the given args.
 *
 * @param {String} event
 * @param {Mixed} ...
 * @return {Emitter}
 */

Emitter.prototype.emit = function(event){
  this._callbacks = this._callbacks || {};
  var args = [].slice.call(arguments, 1)
    , callbacks = this._callbacks[event];

  if (callbacks) {
    callbacks = callbacks.slice(0);
    for (var i = 0, len = callbacks.length; i < len; ++i) {
      callbacks[i].apply(this, args);
    }
  }

  return this;
};

/**
 * Return array of callbacks for `event`.
 *
 * @param {String} event
 * @return {Array}
 * @api public
 */

Emitter.prototype.listeners = function(event){
  this._callbacks = this._callbacks || {};
  return this._callbacks[event] || [];
};

/**
 * Check if this emitter has `event` handlers.
 *
 * @param {String} event
 * @return {Boolean}
 * @api public
 */

Emitter.prototype.hasListeners = function(event){
  return !! this.listeners(event).length;
};

},{}],32:[function(require,module,exports){
/*! Hammer.JS - v1.1.3 - 2014-05-20
 * http://eightmedia.github.io/hammer.js
 *
 * Copyright (c) 2014 Jorik Tangelder <j.tangelder@gmail.com>;
 * Licensed under the MIT license */

(function(window, undefined) {
  'use strict';

/**
 * @main
 * @module hammer
 *
 * @class Hammer
 * @static
 */

/**
 * Hammer, use this to create instances
 * ````
 * var hammertime = new Hammer(myElement);
 * ````
 *
 * @method Hammer
 * @param {HTMLElement} element
 * @param {Object} [options={}]
 * @return {Hammer.Instance}
 */
var Hammer = function Hammer(element, options) {
    return new Hammer.Instance(element, options || {});
};

/**
 * version, as defined in package.json
 * the value will be set at each build
 * @property VERSION
 * @final
 * @type {String}
 */
Hammer.VERSION = '1.1.3';

/**
 * default settings.
 * more settings are defined per gesture at `/gestures`. Each gesture can be disabled/enabled
 * by setting it's name (like `swipe`) to false.
 * You can set the defaults for all instances by changing this object before creating an instance.
 * @example
 * ````
 *  Hammer.defaults.drag = false;
 *  Hammer.defaults.behavior.touchAction = 'pan-y';
 *  delete Hammer.defaults.behavior.userSelect;
 * ````
 * @property defaults
 * @type {Object}
 */
Hammer.defaults = {
    /**
     * this setting object adds styles and attributes to the element to prevent the browser from doing
     * its native behavior. The css properties are auto prefixed for the browsers when needed.
     * @property defaults.behavior
     * @type {Object}
     */
    behavior: {
        /**
         * Disables text selection to improve the dragging gesture. When the value is `none` it also sets
         * `onselectstart=false` for IE on the element. Mainly for desktop browsers.
         * @property defaults.behavior.userSelect
         * @type {String}
         * @default 'none'
         */
        userSelect: 'none',

        /**
         * Specifies whether and how a given region can be manipulated by the user (for instance, by panning or zooming).
         * Used by Chrome 35> and IE10>. By default this makes the element blocking any touch event.
         * @property defaults.behavior.touchAction
         * @type {String}
         * @default: 'pan-y'
         */
        touchAction: 'pan-y',

        /**
         * Disables the default callout shown when you touch and hold a touch target.
         * On iOS, when you touch and hold a touch target such as a link, Safari displays
         * a callout containing information about the link. This property allows you to disable that callout.
         * @property defaults.behavior.touchCallout
         * @type {String}
         * @default 'none'
         */
        touchCallout: 'none',

        /**
         * Specifies whether zooming is enabled. Used by IE10>
         * @property defaults.behavior.contentZooming
         * @type {String}
         * @default 'none'
         */
        contentZooming: 'none',

        /**
         * Specifies that an entire element should be draggable instead of its contents.
         * Mainly for desktop browsers.
         * @property defaults.behavior.userDrag
         * @type {String}
         * @default 'none'
         */
        userDrag: 'none',

        /**
         * Overrides the highlight color shown when the user taps a link or a JavaScript
         * clickable element in Safari on iPhone. This property obeys the alpha value, if specified.
         *
         * If you don't specify an alpha value, Safari on iPhone applies a default alpha value
         * to the color. To disable tap highlighting, set the alpha value to 0 (invisible).
         * If you set the alpha value to 1.0 (opaque), the element is not visible when tapped.
         * @property defaults.behavior.tapHighlightColor
         * @type {String}
         * @default 'rgba(0,0,0,0)'
         */
        tapHighlightColor: 'rgba(0,0,0,0)'
    }
};

/**
 * hammer document where the base events are added at
 * @property DOCUMENT
 * @type {HTMLElement}
 * @default window.document
 */
Hammer.DOCUMENT = document;

/**
 * detect support for pointer events
 * @property HAS_POINTEREVENTS
 * @type {Boolean}
 */
Hammer.HAS_POINTEREVENTS = navigator.pointerEnabled || navigator.msPointerEnabled;

/**
 * detect support for touch events
 * @property HAS_TOUCHEVENTS
 * @type {Boolean}
 */
Hammer.HAS_TOUCHEVENTS = ('ontouchstart' in window);

/**
 * detect mobile browsers
 * @property IS_MOBILE
 * @type {Boolean}
 */
Hammer.IS_MOBILE = /mobile|tablet|ip(ad|hone|od)|android|silk/i.test(navigator.userAgent);

/**
 * detect if we want to support mouseevents at all
 * @property NO_MOUSEEVENTS
 * @type {Boolean}
 */
Hammer.NO_MOUSEEVENTS = (Hammer.HAS_TOUCHEVENTS && Hammer.IS_MOBILE) || Hammer.HAS_POINTEREVENTS;

/**
 * interval in which Hammer recalculates current velocity/direction/angle in ms
 * @property CALCULATE_INTERVAL
 * @type {Number}
 * @default 25
 */
Hammer.CALCULATE_INTERVAL = 25;

/**
 * eventtypes per touchevent (start, move, end) are filled by `Event.determineEventTypes` on `setup`
 * the object contains the DOM event names per type (`EVENT_START`, `EVENT_MOVE`, `EVENT_END`)
 * @property EVENT_TYPES
 * @private
 * @writeOnce
 * @type {Object}
 */
var EVENT_TYPES = {};

/**
 * direction strings, for safe comparisons
 * @property DIRECTION_DOWN|LEFT|UP|RIGHT
 * @final
 * @type {String}
 * @default 'down' 'left' 'up' 'right'
 */
var DIRECTION_DOWN = Hammer.DIRECTION_DOWN = 'down';
var DIRECTION_LEFT = Hammer.DIRECTION_LEFT = 'left';
var DIRECTION_UP = Hammer.DIRECTION_UP = 'up';
var DIRECTION_RIGHT = Hammer.DIRECTION_RIGHT = 'right';

/**
 * pointertype strings, for safe comparisons
 * @property POINTER_MOUSE|TOUCH|PEN
 * @final
 * @type {String}
 * @default 'mouse' 'touch' 'pen'
 */
var POINTER_MOUSE = Hammer.POINTER_MOUSE = 'mouse';
var POINTER_TOUCH = Hammer.POINTER_TOUCH = 'touch';
var POINTER_PEN = Hammer.POINTER_PEN = 'pen';

/**
 * eventtypes
 * @property EVENT_START|MOVE|END|RELEASE|TOUCH
 * @final
 * @type {String}
 * @default 'start' 'change' 'move' 'end' 'release' 'touch'
 */
var EVENT_START = Hammer.EVENT_START = 'start';
var EVENT_MOVE = Hammer.EVENT_MOVE = 'move';
var EVENT_END = Hammer.EVENT_END = 'end';
var EVENT_RELEASE = Hammer.EVENT_RELEASE = 'release';
var EVENT_TOUCH = Hammer.EVENT_TOUCH = 'touch';

/**
 * if the window events are set...
 * @property READY
 * @writeOnce
 * @type {Boolean}
 * @default false
 */
Hammer.READY = false;

/**
 * plugins namespace
 * @property plugins
 * @type {Object}
 */
Hammer.plugins = Hammer.plugins || {};

/**
 * gestures namespace
 * see `/gestures` for the definitions
 * @property gestures
 * @type {Object}
 */
Hammer.gestures = Hammer.gestures || {};

/**
 * setup events to detect gestures on the document
 * this function is called when creating an new instance
 * @private
 */
function setup() {
    if(Hammer.READY) {
        return;
    }

    // find what eventtypes we add listeners to
    Event.determineEventTypes();

    // Register all gestures inside Hammer.gestures
    Utils.each(Hammer.gestures, function(gesture) {
        Detection.register(gesture);
    });

    // Add touch events on the document
    Event.onTouch(Hammer.DOCUMENT, EVENT_MOVE, Detection.detect);
    Event.onTouch(Hammer.DOCUMENT, EVENT_END, Detection.detect);

    // Hammer is ready...!
    Hammer.READY = true;
}

/**
 * @module hammer
 *
 * @class Utils
 * @static
 */
var Utils = Hammer.utils = {
    /**
     * extend method, could also be used for cloning when `dest` is an empty object.
     * changes the dest object
     * @method extend
     * @param {Object} dest
     * @param {Object} src
     * @param {Boolean} [merge=false]  do a merge
     * @return {Object} dest
     */
    extend: function extend(dest, src, merge) {
        for(var key in src) {
            if(!src.hasOwnProperty(key) || (dest[key] !== undefined && merge)) {
                continue;
            }
            dest[key] = src[key];
        }
        return dest;
    },

    /**
     * simple addEventListener wrapper
     * @method on
     * @param {HTMLElement} element
     * @param {String} type
     * @param {Function} handler
     */
    on: function on(element, type, handler) {
        element.addEventListener(type, handler, false);
    },

    /**
     * simple removeEventListener wrapper
     * @method off
     * @param {HTMLElement} element
     * @param {String} type
     * @param {Function} handler
     */
    off: function off(element, type, handler) {
        element.removeEventListener(type, handler, false);
    },

    /**
     * forEach over arrays and objects
     * @method each
     * @param {Object|Array} obj
     * @param {Function} iterator
     * @param {any} iterator.item
     * @param {Number} iterator.index
     * @param {Object|Array} iterator.obj the source object
     * @param {Object} context value to use as `this` in the iterator
     */
    each: function each(obj, iterator, context) {
        var i, len;

        // native forEach on arrays
        if('forEach' in obj) {
            obj.forEach(iterator, context);
        // arrays
        } else if(obj.length !== undefined) {
            for(i = 0, len = obj.length; i < len; i++) {
                if(iterator.call(context, obj[i], i, obj) === false) {
                    return;
                }
            }
        // objects
        } else {
            for(i in obj) {
                if(obj.hasOwnProperty(i) &&
                    iterator.call(context, obj[i], i, obj) === false) {
                    return;
                }
            }
        }
    },

    /**
     * find if a string contains the string using indexOf
     * @method inStr
     * @param {String} src
     * @param {String} find
     * @return {Boolean} found
     */
    inStr: function inStr(src, find) {
        return src.indexOf(find) > -1;
    },

    /**
     * find if a array contains the object using indexOf or a simple polyfill
     * @method inArray
     * @param {String} src
     * @param {String} find
     * @return {Boolean|Number} false when not found, or the index
     */
    inArray: function inArray(src, find) {
        if(src.indexOf) {
            var index = src.indexOf(find);
            return (index === -1) ? false : index;
        } else {
            for(var i = 0, len = src.length; i < len; i++) {
                if(src[i] === find) {
                    return i;
                }
            }
            return false;
        }
    },

    /**
     * convert an array-like object (`arguments`, `touchlist`) to an array
     * @method toArray
     * @param {Object} obj
     * @return {Array}
     */
    toArray: function toArray(obj) {
        return Array.prototype.slice.call(obj, 0);
    },

    /**
     * find if a node is in the given parent
     * @method hasParent
     * @param {HTMLElement} node
     * @param {HTMLElement} parent
     * @return {Boolean} found
     */
    hasParent: function hasParent(node, parent) {
        while(node) {
            if(node == parent) {
                return true;
            }
            node = node.parentNode;
        }
        return false;
    },

    /**
     * get the center of all the touches
     * @method getCenter
     * @param {Array} touches
     * @return {Object} center contains `pageX`, `pageY`, `clientX` and `clientY` properties
     */
    getCenter: function getCenter(touches) {
        var pageX = [],
            pageY = [],
            clientX = [],
            clientY = [],
            min = Math.min,
            max = Math.max;

        // no need to loop when only one touch
        if(touches.length === 1) {
            return {
                pageX: touches[0].pageX,
                pageY: touches[0].pageY,
                clientX: touches[0].clientX,
                clientY: touches[0].clientY
            };
        }

        Utils.each(touches, function(touch) {
            pageX.push(touch.pageX);
            pageY.push(touch.pageY);
            clientX.push(touch.clientX);
            clientY.push(touch.clientY);
        });

        return {
            pageX: (min.apply(Math, pageX) + max.apply(Math, pageX)) / 2,
            pageY: (min.apply(Math, pageY) + max.apply(Math, pageY)) / 2,
            clientX: (min.apply(Math, clientX) + max.apply(Math, clientX)) / 2,
            clientY: (min.apply(Math, clientY) + max.apply(Math, clientY)) / 2
        };
    },

    /**
     * calculate the velocity between two points. unit is in px per ms.
     * @method getVelocity
     * @param {Number} deltaTime
     * @param {Number} deltaX
     * @param {Number} deltaY
     * @return {Object} velocity `x` and `y`
     */
    getVelocity: function getVelocity(deltaTime, deltaX, deltaY) {
        return {
            x: Math.abs(deltaX / deltaTime) || 0,
            y: Math.abs(deltaY / deltaTime) || 0
        };
    },

    /**
     * calculate the angle between two coordinates
     * @method getAngle
     * @param {Touch} touch1
     * @param {Touch} touch2
     * @return {Number} angle
     */
    getAngle: function getAngle(touch1, touch2) {
        var x = touch2.clientX - touch1.clientX,
            y = touch2.clientY - touch1.clientY;

        return Math.atan2(y, x) * 180 / Math.PI;
    },

    /**
     * do a small comparision to get the direction between two touches.
     * @method getDirection
     * @param {Touch} touch1
     * @param {Touch} touch2
     * @return {String} direction matches `DIRECTION_LEFT|RIGHT|UP|DOWN`
     */
    getDirection: function getDirection(touch1, touch2) {
        var x = Math.abs(touch1.clientX - touch2.clientX),
            y = Math.abs(touch1.clientY - touch2.clientY);

        if(x >= y) {
            return touch1.clientX - touch2.clientX > 0 ? DIRECTION_LEFT : DIRECTION_RIGHT;
        }
        return touch1.clientY - touch2.clientY > 0 ? DIRECTION_UP : DIRECTION_DOWN;
    },

    /**
     * calculate the distance between two touches
     * @method getDistance
     * @param {Touch}touch1
     * @param {Touch} touch2
     * @return {Number} distance
     */
    getDistance: function getDistance(touch1, touch2) {
        var x = touch2.clientX - touch1.clientX,
            y = touch2.clientY - touch1.clientY;

        return Math.sqrt((x * x) + (y * y));
    },

    /**
     * calculate the scale factor between two touchLists
     * no scale is 1, and goes down to 0 when pinched together, and bigger when pinched out
     * @method getScale
     * @param {Array} start array of touches
     * @param {Array} end array of touches
     * @return {Number} scale
     */
    getScale: function getScale(start, end) {
        // need two fingers...
        if(start.length >= 2 && end.length >= 2) {
            return this.getDistance(end[0], end[1]) / this.getDistance(start[0], start[1]);
        }
        return 1;
    },

    /**
     * calculate the rotation degrees between two touchLists
     * @method getRotation
     * @param {Array} start array of touches
     * @param {Array} end array of touches
     * @return {Number} rotation
     */
    getRotation: function getRotation(start, end) {
        // need two fingers
        if(start.length >= 2 && end.length >= 2) {
            return this.getAngle(end[1], end[0]) - this.getAngle(start[1], start[0]);
        }
        return 0;
    },

    /**
     * find out if the direction is vertical   *
     * @method isVertical
     * @param {String} direction matches `DIRECTION_UP|DOWN`
     * @return {Boolean} is_vertical
     */
    isVertical: function isVertical(direction) {
        return direction == DIRECTION_UP || direction == DIRECTION_DOWN;
    },

    /**
     * set css properties with their prefixes
     * @param {HTMLElement} element
     * @param {String} prop
     * @param {String} value
     * @param {Boolean} [toggle=true]
     * @return {Boolean}
     */
    setPrefixedCss: function setPrefixedCss(element, prop, value, toggle) {
        var prefixes = ['', 'Webkit', 'Moz', 'O', 'ms'];
        prop = Utils.toCamelCase(prop);

        for(var i = 0; i < prefixes.length; i++) {
            var p = prop;
            // prefixes
            if(prefixes[i]) {
                p = prefixes[i] + p.slice(0, 1).toUpperCase() + p.slice(1);
            }

            // test the style
            if(p in element.style) {
                element.style[p] = (toggle == null || toggle) && value || '';
                break;
            }
        }
    },

    /**
     * toggle browser default behavior by setting css properties.
     * `userSelect='none'` also sets `element.onselectstart` to false
     * `userDrag='none'` also sets `element.ondragstart` to false
     *
     * @method toggleBehavior
     * @param {HtmlElement} element
     * @param {Object} props
     * @param {Boolean} [toggle=true]
     */
    toggleBehavior: function toggleBehavior(element, props, toggle) {
        if(!props || !element || !element.style) {
            return;
        }

        // set the css properties
        Utils.each(props, function(value, prop) {
            Utils.setPrefixedCss(element, prop, value, toggle);
        });

        var falseFn = toggle && function() {
            return false;
        };

        // also the disable onselectstart
        if(props.userSelect == 'none') {
            element.onselectstart = falseFn;
        }
        // and disable ondragstart
        if(props.userDrag == 'none') {
            element.ondragstart = falseFn;
        }
    },

    /**
     * convert a string with underscores to camelCase
     * so prevent_default becomes preventDefault
     * @param {String} str
     * @return {String} camelCaseStr
     */
    toCamelCase: function toCamelCase(str) {
        return str.replace(/[_-]([a-z])/g, function(s) {
            return s[1].toUpperCase();
        });
    }
};


/**
 * @module hammer
 */
/**
 * @class Event
 * @static
 */
var Event = Hammer.event = {
    /**
     * when touch events have been fired, this is true
     * this is used to stop mouse events
     * @property prevent_mouseevents
     * @private
     * @type {Boolean}
     */
    preventMouseEvents: false,

    /**
     * if EVENT_START has been fired
     * @property started
     * @private
     * @type {Boolean}
     */
    started: false,

    /**
     * when the mouse is hold down, this is true
     * @property should_detect
     * @private
     * @type {Boolean}
     */
    shouldDetect: false,

    /**
     * simple event binder with a hook and support for multiple types
     * @method on
     * @param {HTMLElement} element
     * @param {String} type
     * @param {Function} handler
     * @param {Function} [hook]
     * @param {Object} hook.type
     */
    on: function on(element, type, handler, hook) {
        var types = type.split(' ');
        Utils.each(types, function(type) {
            Utils.on(element, type, handler);
            hook && hook(type);
        });
    },

    /**
     * simple event unbinder with a hook and support for multiple types
     * @method off
     * @param {HTMLElement} element
     * @param {String} type
     * @param {Function} handler
     * @param {Function} [hook]
     * @param {Object} hook.type
     */
    off: function off(element, type, handler, hook) {
        var types = type.split(' ');
        Utils.each(types, function(type) {
            Utils.off(element, type, handler);
            hook && hook(type);
        });
    },

    /**
     * the core touch event handler.
     * this finds out if we should to detect gestures
     * @method onTouch
     * @param {HTMLElement} element
     * @param {String} eventType matches `EVENT_START|MOVE|END`
     * @param {Function} handler
     * @return onTouchHandler {Function} the core event handler
     */
    onTouch: function onTouch(element, eventType, handler) {
        var self = this;

        var onTouchHandler = function onTouchHandler(ev) {
            var srcType = ev.type.toLowerCase(),
                isPointer = Hammer.HAS_POINTEREVENTS,
                isMouse = Utils.inStr(srcType, 'mouse'),
                triggerType;

            // if we are in a mouseevent, but there has been a touchevent triggered in this session
            // we want to do nothing. simply break out of the event.
            if(isMouse && self.preventMouseEvents) {
                return;

            // mousebutton must be down
            } else if(isMouse && eventType == EVENT_START && ev.button === 0) {
                self.preventMouseEvents = false;
                self.shouldDetect = true;
            } else if(isPointer && eventType == EVENT_START) {
                self.shouldDetect = (ev.buttons === 1 || PointerEvent.matchType(POINTER_TOUCH, ev));
            // just a valid start event, but no mouse
            } else if(!isMouse && eventType == EVENT_START) {
                self.preventMouseEvents = true;
                self.shouldDetect = true;
            }

            // update the pointer event before entering the detection
            if(isPointer && eventType != EVENT_END) {
                PointerEvent.updatePointer(eventType, ev);
            }

            // we are in a touch/down state, so allowed detection of gestures
            if(self.shouldDetect) {
                triggerType = self.doDetect.call(self, ev, eventType, element, handler);
            }

            // ...and we are done with the detection
            // so reset everything to start each detection totally fresh
            if(triggerType == EVENT_END) {
                self.preventMouseEvents = false;
                self.shouldDetect = false;
                PointerEvent.reset();
            // update the pointerevent object after the detection
            }

            if(isPointer && eventType == EVENT_END) {
                PointerEvent.updatePointer(eventType, ev);
            }
        };

        this.on(element, EVENT_TYPES[eventType], onTouchHandler);
        return onTouchHandler;
    },

    /**
     * the core detection method
     * this finds out what hammer-touch-events to trigger
     * @method doDetect
     * @param {Object} ev
     * @param {String} eventType matches `EVENT_START|MOVE|END`
     * @param {HTMLElement} element
     * @param {Function} handler
     * @return {String} triggerType matches `EVENT_START|MOVE|END`
     */
    doDetect: function doDetect(ev, eventType, element, handler) {
        var touchList = this.getTouchList(ev, eventType);
        var touchListLength = touchList.length;
        var triggerType = eventType;
        var triggerChange = touchList.trigger; // used by fakeMultitouch plugin
        var changedLength = touchListLength;

        // at each touchstart-like event we want also want to trigger a TOUCH event...
        if(eventType == EVENT_START) {
            triggerChange = EVENT_TOUCH;
        // ...the same for a touchend-like event
        } else if(eventType == EVENT_END) {
            triggerChange = EVENT_RELEASE;

            // keep track of how many touches have been removed
            changedLength = touchList.length - ((ev.changedTouches) ? ev.changedTouches.length : 1);
        }

        // after there are still touches on the screen,
        // we just want to trigger a MOVE event. so change the START or END to a MOVE
        // but only after detection has been started, the first time we actualy want a START
        if(changedLength > 0 && this.started) {
            triggerType = EVENT_MOVE;
        }

        // detection has been started, we keep track of this, see above
        this.started = true;

        // generate some event data, some basic information
        var evData = this.collectEventData(element, triggerType, touchList, ev);

        // trigger the triggerType event before the change (TOUCH, RELEASE) events
        // but the END event should be at last
        if(eventType != EVENT_END) {
            handler.call(Detection, evData);
        }

        // trigger a change (TOUCH, RELEASE) event, this means the length of the touches changed
        if(triggerChange) {
            evData.changedLength = changedLength;
            evData.eventType = triggerChange;

            handler.call(Detection, evData);

            evData.eventType = triggerType;
            delete evData.changedLength;
        }

        // trigger the END event
        if(triggerType == EVENT_END) {
            handler.call(Detection, evData);

            // ...and we are done with the detection
            // so reset everything to start each detection totally fresh
            this.started = false;
        }

        return triggerType;
    },

    /**
     * we have different events for each device/browser
     * determine what we need and set them in the EVENT_TYPES constant
     * the `onTouch` method is bind to these properties.
     * @method determineEventTypes
     * @return {Object} events
     */
    determineEventTypes: function determineEventTypes() {
        var types;
        if(Hammer.HAS_POINTEREVENTS) {
            if(window.PointerEvent) {
                types = [
                    'pointerdown',
                    'pointermove',
                    'pointerup pointercancel lostpointercapture'
                ];
            } else {
                types = [
                    'MSPointerDown',
                    'MSPointerMove',
                    'MSPointerUp MSPointerCancel MSLostPointerCapture'
                ];
            }
        } else if(Hammer.NO_MOUSEEVENTS) {
            types = [
                'touchstart',
                'touchmove',
                'touchend touchcancel'
            ];
        } else {
            types = [
                'touchstart mousedown',
                'touchmove mousemove',
                'touchend touchcancel mouseup'
            ];
        }

        EVENT_TYPES[EVENT_START] = types[0];
        EVENT_TYPES[EVENT_MOVE] = types[1];
        EVENT_TYPES[EVENT_END] = types[2];
        return EVENT_TYPES;
    },

    /**
     * create touchList depending on the event
     * @method getTouchList
     * @param {Object} ev
     * @param {String} eventType
     * @return {Array} touches
     */
    getTouchList: function getTouchList(ev, eventType) {
        // get the fake pointerEvent touchlist
        if(Hammer.HAS_POINTEREVENTS) {
            return PointerEvent.getTouchList();
        }

        // get the touchlist
        if(ev.touches) {
            if(eventType == EVENT_MOVE) {
                return ev.touches;
            }

            var identifiers = [];
            var concat = [].concat(Utils.toArray(ev.touches), Utils.toArray(ev.changedTouches));
            var touchList = [];

            Utils.each(concat, function(touch) {
                if(Utils.inArray(identifiers, touch.identifier) === false) {
                    touchList.push(touch);
                }
                identifiers.push(touch.identifier);
            });

            return touchList;
        }

        // make fake touchList from mouse position
        ev.identifier = 1;
        return [ev];
    },

    /**
     * collect basic event data
     * @method collectEventData
     * @param {HTMLElement} element
     * @param {String} eventType matches `EVENT_START|MOVE|END`
     * @param {Array} touches
     * @param {Object} ev
     * @return {Object} ev
     */
    collectEventData: function collectEventData(element, eventType, touches, ev) {
        // find out pointerType
        var pointerType = POINTER_TOUCH;
        if(Utils.inStr(ev.type, 'mouse') || PointerEvent.matchType(POINTER_MOUSE, ev)) {
            pointerType = POINTER_MOUSE;
        } else if(PointerEvent.matchType(POINTER_PEN, ev)) {
            pointerType = POINTER_PEN;
        }

        return {
            center: Utils.getCenter(touches),
            timeStamp: Date.now(),
            target: ev.target,
            touches: touches,
            eventType: eventType,
            pointerType: pointerType,
            srcEvent: ev,

            /**
             * prevent the browser default actions
             * mostly used to disable scrolling of the browser
             */
            preventDefault: function() {
                var srcEvent = this.srcEvent;
                srcEvent.preventManipulation && srcEvent.preventManipulation();
                srcEvent.preventDefault && srcEvent.preventDefault();
            },

            /**
             * stop bubbling the event up to its parents
             */
            stopPropagation: function() {
                this.srcEvent.stopPropagation();
            },

            /**
             * immediately stop gesture detection
             * might be useful after a swipe was detected
             * @return {*}
             */
            stopDetect: function() {
                return Detection.stopDetect();
            }
        };
    }
};


/**
 * @module hammer
 *
 * @class PointerEvent
 * @static
 */
var PointerEvent = Hammer.PointerEvent = {
    /**
     * holds all pointers, by `identifier`
     * @property pointers
     * @type {Object}
     */
    pointers: {},

    /**
     * get the pointers as an array
     * @method getTouchList
     * @return {Array} touchlist
     */
    getTouchList: function getTouchList() {
        var touchlist = [];
        // we can use forEach since pointerEvents only is in IE10
        Utils.each(this.pointers, function(pointer) {
            touchlist.push(pointer);
        });
        return touchlist;
    },

    /**
     * update the position of a pointer
     * @method updatePointer
     * @param {String} eventType matches `EVENT_START|MOVE|END`
     * @param {Object} pointerEvent
     */
    updatePointer: function updatePointer(eventType, pointerEvent) {
        if(eventType == EVENT_END || (eventType != EVENT_END && pointerEvent.buttons !== 1)) {
            delete this.pointers[pointerEvent.pointerId];
        } else {
            pointerEvent.identifier = pointerEvent.pointerId;
            this.pointers[pointerEvent.pointerId] = pointerEvent;
        }
    },

    /**
     * check if ev matches pointertype
     * @method matchType
     * @param {String} pointerType matches `POINTER_MOUSE|TOUCH|PEN`
     * @param {PointerEvent} ev
     */
    matchType: function matchType(pointerType, ev) {
        if(!ev.pointerType) {
            return false;
        }

        var pt = ev.pointerType,
            types = {};

        types[POINTER_MOUSE] = (pt === (ev.MSPOINTER_TYPE_MOUSE || POINTER_MOUSE));
        types[POINTER_TOUCH] = (pt === (ev.MSPOINTER_TYPE_TOUCH || POINTER_TOUCH));
        types[POINTER_PEN] = (pt === (ev.MSPOINTER_TYPE_PEN || POINTER_PEN));
        return types[pointerType];
    },

    /**
     * reset the stored pointers
     * @method reset
     */
    reset: function resetList() {
        this.pointers = {};
    }
};


/**
 * @module hammer
 *
 * @class Detection
 * @static
 */
var Detection = Hammer.detection = {
    // contains all registred Hammer.gestures in the correct order
    gestures: [],

    // data of the current Hammer.gesture detection session
    current: null,

    // the previous Hammer.gesture session data
    // is a full clone of the previous gesture.current object
    previous: null,

    // when this becomes true, no gestures are fired
    stopped: false,

    /**
     * start Hammer.gesture detection
     * @method startDetect
     * @param {Hammer.Instance} inst
     * @param {Object} eventData
     */
    startDetect: function startDetect(inst, eventData) {
        // already busy with a Hammer.gesture detection on an element
        if(this.current) {
            return;
        }

        this.stopped = false;

        // holds current session
        this.current = {
            inst: inst, // reference to HammerInstance we're working for
            startEvent: Utils.extend({}, eventData), // start eventData for distances, timing etc
            lastEvent: false, // last eventData
            lastCalcEvent: false, // last eventData for calculations.
            futureCalcEvent: false, // last eventData for calculations.
            lastCalcData: {}, // last lastCalcData
            name: '' // current gesture we're in/detected, can be 'tap', 'hold' etc
        };

        this.detect(eventData);
    },

    /**
     * Hammer.gesture detection
     * @method detect
     * @param {Object} eventData
     * @return {any}
     */
    detect: function detect(eventData) {
        if(!this.current || this.stopped) {
            return;
        }

        // extend event data with calculations about scale, distance etc
        eventData = this.extendEventData(eventData);

        // hammer instance and instance options
        var inst = this.current.inst,
            instOptions = inst.options;

        // call Hammer.gesture handlers
        Utils.each(this.gestures, function triggerGesture(gesture) {
            // only when the instance options have enabled this gesture
            if(!this.stopped && inst.enabled && instOptions[gesture.name]) {
                gesture.handler.call(gesture, eventData, inst);
            }
        }, this);

        // store as previous event event
        if(this.current) {
            this.current.lastEvent = eventData;
        }

        if(eventData.eventType == EVENT_END) {
            this.stopDetect();
        }

        return eventData;
    },

    /**
     * clear the Hammer.gesture vars
     * this is called on endDetect, but can also be used when a final Hammer.gesture has been detected
     * to stop other Hammer.gestures from being fired
     * @method stopDetect
     */
    stopDetect: function stopDetect() {
        // clone current data to the store as the previous gesture
        // used for the double tap gesture, since this is an other gesture detect session
        this.previous = Utils.extend({}, this.current);

        // reset the current
        this.current = null;
        this.stopped = true;
    },

    /**
     * calculate velocity, angle and direction
     * @method getVelocityData
     * @param {Object} ev
     * @param {Object} center
     * @param {Number} deltaTime
     * @param {Number} deltaX
     * @param {Number} deltaY
     */
    getCalculatedData: function getCalculatedData(ev, center, deltaTime, deltaX, deltaY) {
        var cur = this.current,
            recalc = false,
            calcEv = cur.lastCalcEvent,
            calcData = cur.lastCalcData;

        if(calcEv && ev.timeStamp - calcEv.timeStamp > Hammer.CALCULATE_INTERVAL) {
            center = calcEv.center;
            deltaTime = ev.timeStamp - calcEv.timeStamp;
            deltaX = ev.center.clientX - calcEv.center.clientX;
            deltaY = ev.center.clientY - calcEv.center.clientY;
            recalc = true;
        }

        if(ev.eventType == EVENT_TOUCH || ev.eventType == EVENT_RELEASE) {
            cur.futureCalcEvent = ev;
        }

        if(!cur.lastCalcEvent || recalc) {
            calcData.velocity = Utils.getVelocity(deltaTime, deltaX, deltaY);
            calcData.angle = Utils.getAngle(center, ev.center);
            calcData.direction = Utils.getDirection(center, ev.center);

            cur.lastCalcEvent = cur.futureCalcEvent || ev;
            cur.futureCalcEvent = ev;
        }

        ev.velocityX = calcData.velocity.x;
        ev.velocityY = calcData.velocity.y;
        ev.interimAngle = calcData.angle;
        ev.interimDirection = calcData.direction;
    },

    /**
     * extend eventData for Hammer.gestures
     * @method extendEventData
     * @param {Object} ev
     * @return {Object} ev
     */
    extendEventData: function extendEventData(ev) {
        var cur = this.current,
            startEv = cur.startEvent,
            lastEv = cur.lastEvent || startEv;

        // update the start touchlist to calculate the scale/rotation
        if(ev.eventType == EVENT_TOUCH || ev.eventType == EVENT_RELEASE) {
            startEv.touches = [];
            Utils.each(ev.touches, function(touch) {
                startEv.touches.push({
                    clientX: touch.clientX,
                    clientY: touch.clientY
                });
            });
        }

        var deltaTime = ev.timeStamp - startEv.timeStamp,
            deltaX = ev.center.clientX - startEv.center.clientX,
            deltaY = ev.center.clientY - startEv.center.clientY;

        this.getCalculatedData(ev, lastEv.center, deltaTime, deltaX, deltaY);

        Utils.extend(ev, {
            startEvent: startEv,

            deltaTime: deltaTime,
            deltaX: deltaX,
            deltaY: deltaY,

            distance: Utils.getDistance(startEv.center, ev.center),
            angle: Utils.getAngle(startEv.center, ev.center),
            direction: Utils.getDirection(startEv.center, ev.center),
            scale: Utils.getScale(startEv.touches, ev.touches),
            rotation: Utils.getRotation(startEv.touches, ev.touches)
        });

        return ev;
    },

    /**
     * register new gesture
     * @method register
     * @param {Object} gesture object, see `gestures/` for documentation
     * @return {Array} gestures
     */
    register: function register(gesture) {
        // add an enable gesture options if there is no given
        var options = gesture.defaults || {};
        if(options[gesture.name] === undefined) {
            options[gesture.name] = true;
        }

        // extend Hammer default options with the Hammer.gesture options
        Utils.extend(Hammer.defaults, options, true);

        // set its index
        gesture.index = gesture.index || 1000;

        // add Hammer.gesture to the list
        this.gestures.push(gesture);

        // sort the list by index
        this.gestures.sort(function(a, b) {
            if(a.index < b.index) {
                return -1;
            }
            if(a.index > b.index) {
                return 1;
            }
            return 0;
        });

        return this.gestures;
    }
};


/**
 * @module hammer
 */

/**
 * create new hammer instance
 * all methods should return the instance itself, so it is chainable.
 *
 * @class Instance
 * @constructor
 * @param {HTMLElement} element
 * @param {Object} [options={}] options are merged with `Hammer.defaults`
 * @return {Hammer.Instance}
 */
Hammer.Instance = function(element, options) {
    var self = this;

    // setup HammerJS window events and register all gestures
    // this also sets up the default options
    setup();

    /**
     * @property element
     * @type {HTMLElement}
     */
    this.element = element;

    /**
     * @property enabled
     * @type {Boolean}
     * @protected
     */
    this.enabled = true;

    /**
     * options, merged with the defaults
     * options with an _ are converted to camelCase
     * @property options
     * @type {Object}
     */
    Utils.each(options, function(value, name) {
        delete options[name];
        options[Utils.toCamelCase(name)] = value;
    });

    this.options = Utils.extend(Utils.extend({}, Hammer.defaults), options || {});

    // add some css to the element to prevent the browser from doing its native behavoir
    if(this.options.behavior) {
        Utils.toggleBehavior(this.element, this.options.behavior, true);
    }

    /**
     * event start handler on the element to start the detection
     * @property eventStartHandler
     * @type {Object}
     */
    this.eventStartHandler = Event.onTouch(element, EVENT_START, function(ev) {
        if(self.enabled && ev.eventType == EVENT_START) {
            Detection.startDetect(self, ev);
        } else if(ev.eventType == EVENT_TOUCH) {
            Detection.detect(ev);
        }
    });

    /**
     * keep a list of user event handlers which needs to be removed when calling 'dispose'
     * @property eventHandlers
     * @type {Array}
     */
    this.eventHandlers = [];
};

Hammer.Instance.prototype = {
    /**
     * bind events to the instance
     * @method on
     * @chainable
     * @param {String} gestures multiple gestures by splitting with a space
     * @param {Function} handler
     * @param {Object} handler.ev event object
     */
    on: function onEvent(gestures, handler) {
        var self = this;
        Event.on(self.element, gestures, handler, function(type) {
            self.eventHandlers.push({ gesture: type, handler: handler });
        });
        return self;
    },

    /**
     * unbind events to the instance
     * @method off
     * @chainable
     * @param {String} gestures
     * @param {Function} handler
     */
    off: function offEvent(gestures, handler) {
        var self = this;

        Event.off(self.element, gestures, handler, function(type) {
            var index = Utils.inArray({ gesture: type, handler: handler });
            if(index !== false) {
                self.eventHandlers.splice(index, 1);
            }
        });
        return self;
    },

    /**
     * trigger gesture event
     * @method trigger
     * @chainable
     * @param {String} gesture
     * @param {Object} [eventData]
     */
    trigger: function triggerEvent(gesture, eventData) {
        // optional
        if(!eventData) {
            eventData = {};
        }

        // create DOM event
        var event = Hammer.DOCUMENT.createEvent('Event');
        event.initEvent(gesture, true, true);
        event.gesture = eventData;

        // trigger on the target if it is in the instance element,
        // this is for event delegation tricks
        var element = this.element;
        if(Utils.hasParent(eventData.target, element)) {
            element = eventData.target;
        }

        element.dispatchEvent(event);
        return this;
    },

    /**
     * enable of disable hammer.js detection
     * @method enable
     * @chainable
     * @param {Boolean} state
     */
    enable: function enable(state) {
        this.enabled = state;
        return this;
    },

    /**
     * dispose this hammer instance
     * @method dispose
     * @return {Null}
     */
    dispose: function dispose() {
        var i, eh;

        // undo all changes made by stop_browser_behavior
        Utils.toggleBehavior(this.element, this.options.behavior, false);

        // unbind all custom event handlers
        for(i = -1; (eh = this.eventHandlers[++i]);) {
            Utils.off(this.element, eh.gesture, eh.handler);
        }

        this.eventHandlers = [];

        // unbind the start event listener
        Event.off(this.element, EVENT_TYPES[EVENT_START], this.eventStartHandler);

        return null;
    }
};


/**
 * @module gestures
 */
/**
 * Move with x fingers (default 1) around on the page.
 * Preventing the default browser behavior is a good way to improve feel and working.
 * ````
 *  hammertime.on("drag", function(ev) {
 *    console.log(ev);
 *    ev.gesture.preventDefault();
 *  });
 * ````
 *
 * @class Drag
 * @static
 */
/**
 * @event drag
 * @param {Object} ev
 */
/**
 * @event dragstart
 * @param {Object} ev
 */
/**
 * @event dragend
 * @param {Object} ev
 */
/**
 * @event drapleft
 * @param {Object} ev
 */
/**
 * @event dragright
 * @param {Object} ev
 */
/**
 * @event dragup
 * @param {Object} ev
 */
/**
 * @event dragdown
 * @param {Object} ev
 */

/**
 * @param {String} name
 */
(function(name) {
    var triggered = false;

    function dragGesture(ev, inst) {
        var cur = Detection.current;

        // max touches
        if(inst.options.dragMaxTouches > 0 &&
            ev.touches.length > inst.options.dragMaxTouches) {
            return;
        }

        switch(ev.eventType) {
            case EVENT_START:
                triggered = false;
                break;

            case EVENT_MOVE:
                // when the distance we moved is too small we skip this gesture
                // or we can be already in dragging
                if(ev.distance < inst.options.dragMinDistance &&
                    cur.name != name) {
                    return;
                }

                var startCenter = cur.startEvent.center;

                // we are dragging!
                if(cur.name != name) {
                    cur.name = name;
                    if(inst.options.dragDistanceCorrection && ev.distance > 0) {
                        // When a drag is triggered, set the event center to dragMinDistance pixels from the original event center.
                        // Without this correction, the dragged distance would jumpstart at dragMinDistance pixels instead of at 0.
                        // It might be useful to save the original start point somewhere
                        var factor = Math.abs(inst.options.dragMinDistance / ev.distance);
                        startCenter.pageX += ev.deltaX * factor;
                        startCenter.pageY += ev.deltaY * factor;
                        startCenter.clientX += ev.deltaX * factor;
                        startCenter.clientY += ev.deltaY * factor;

                        // recalculate event data using new start point
                        ev = Detection.extendEventData(ev);
                    }
                }

                // lock drag to axis?
                if(cur.lastEvent.dragLockToAxis ||
                    ( inst.options.dragLockToAxis &&
                        inst.options.dragLockMinDistance <= ev.distance
                        )) {
                    ev.dragLockToAxis = true;
                }

                // keep direction on the axis that the drag gesture started on
                var lastDirection = cur.lastEvent.direction;
                if(ev.dragLockToAxis && lastDirection !== ev.direction) {
                    if(Utils.isVertical(lastDirection)) {
                        ev.direction = (ev.deltaY < 0) ? DIRECTION_UP : DIRECTION_DOWN;
                    } else {
                        ev.direction = (ev.deltaX < 0) ? DIRECTION_LEFT : DIRECTION_RIGHT;
                    }
                }

                // first time, trigger dragstart event
                if(!triggered) {
                    inst.trigger(name + 'start', ev);
                    triggered = true;
                }

                // trigger events
                inst.trigger(name, ev);
                inst.trigger(name + ev.direction, ev);

                var isVertical = Utils.isVertical(ev.direction);

                // block the browser events
                if((inst.options.dragBlockVertical && isVertical) ||
                    (inst.options.dragBlockHorizontal && !isVertical)) {
                    ev.preventDefault();
                }
                break;

            case EVENT_RELEASE:
                if(triggered && ev.changedLength <= inst.options.dragMaxTouches) {
                    inst.trigger(name + 'end', ev);
                    triggered = false;
                }
                break;

            case EVENT_END:
                triggered = false;
                break;
        }
    }

    Hammer.gestures.Drag = {
        name: name,
        index: 50,
        handler: dragGesture,
        defaults: {
            /**
             * minimal movement that have to be made before the drag event gets triggered
             * @property dragMinDistance
             * @type {Number}
             * @default 10
             */
            dragMinDistance: 10,

            /**
             * Set dragDistanceCorrection to true to make the starting point of the drag
             * be calculated from where the drag was triggered, not from where the touch started.
             * Useful to avoid a jerk-starting drag, which can make fine-adjustments
             * through dragging difficult, and be visually unappealing.
             * @property dragDistanceCorrection
             * @type {Boolean}
             * @default true
             */
            dragDistanceCorrection: true,

            /**
             * set 0 for unlimited, but this can conflict with transform
             * @property dragMaxTouches
             * @type {Number}
             * @default 1
             */
            dragMaxTouches: 1,

            /**
             * prevent default browser behavior when dragging occurs
             * be careful with it, it makes the element a blocking element
             * when you are using the drag gesture, it is a good practice to set this true
             * @property dragBlockHorizontal
             * @type {Boolean}
             * @default false
             */
            dragBlockHorizontal: false,

            /**
             * same as `dragBlockHorizontal`, but for vertical movement
             * @property dragBlockVertical
             * @type {Boolean}
             * @default false
             */
            dragBlockVertical: false,

            /**
             * dragLockToAxis keeps the drag gesture on the axis that it started on,
             * It disallows vertical directions if the initial direction was horizontal, and vice versa.
             * @property dragLockToAxis
             * @type {Boolean}
             * @default false
             */
            dragLockToAxis: false,

            /**
             * drag lock only kicks in when distance > dragLockMinDistance
             * This way, locking occurs only when the distance has become large enough to reliably determine the direction
             * @property dragLockMinDistance
             * @type {Number}
             * @default 25
             */
            dragLockMinDistance: 25
        }
    };
})('drag');

/**
 * @module gestures
 */
/**
 * trigger a simple gesture event, so you can do anything in your handler.
 * only usable if you know what your doing...
 *
 * @class Gesture
 * @static
 */
/**
 * @event gesture
 * @param {Object} ev
 */
Hammer.gestures.Gesture = {
    name: 'gesture',
    index: 1337,
    handler: function releaseGesture(ev, inst) {
        inst.trigger(this.name, ev);
    }
};

/**
 * @module gestures
 */
/**
 * Touch stays at the same place for x time
 *
 * @class Hold
 * @static
 */
/**
 * @event hold
 * @param {Object} ev
 */

/**
 * @param {String} name
 */
(function(name) {
    var timer;

    function holdGesture(ev, inst) {
        var options = inst.options,
            current = Detection.current;

        switch(ev.eventType) {
            case EVENT_START:
                clearTimeout(timer);

                // set the gesture so we can check in the timeout if it still is
                current.name = name;

                // set timer and if after the timeout it still is hold,
                // we trigger the hold event
                timer = setTimeout(function() {
                    if(current && current.name == name) {
                        inst.trigger(name, ev);
                    }
                }, options.holdTimeout);
                break;

            case EVENT_MOVE:
                if(ev.distance > options.holdThreshold) {
                    clearTimeout(timer);
                }
                break;

            case EVENT_RELEASE:
                clearTimeout(timer);
                break;
        }
    }

    Hammer.gestures.Hold = {
        name: name,
        index: 10,
        defaults: {
            /**
             * @property holdTimeout
             * @type {Number}
             * @default 500
             */
            holdTimeout: 500,

            /**
             * movement allowed while holding
             * @property holdThreshold
             * @type {Number}
             * @default 2
             */
            holdThreshold: 2
        },
        handler: holdGesture
    };
})('hold');

/**
 * @module gestures
 */
/**
 * when a touch is being released from the page
 *
 * @class Release
 * @static
 */
/**
 * @event release
 * @param {Object} ev
 */
Hammer.gestures.Release = {
    name: 'release',
    index: Infinity,
    handler: function releaseGesture(ev, inst) {
        if(ev.eventType == EVENT_RELEASE) {
            inst.trigger(this.name, ev);
        }
    }
};

/**
 * @module gestures
 */
/**
 * triggers swipe events when the end velocity is above the threshold
 * for best usage, set `preventDefault` (on the drag gesture) to `true`
 * ````
 *  hammertime.on("dragleft swipeleft", function(ev) {
 *    console.log(ev);
 *    ev.gesture.preventDefault();
 *  });
 * ````
 *
 * @class Swipe
 * @static
 */
/**
 * @event swipe
 * @param {Object} ev
 */
/**
 * @event swipeleft
 * @param {Object} ev
 */
/**
 * @event swiperight
 * @param {Object} ev
 */
/**
 * @event swipeup
 * @param {Object} ev
 */
/**
 * @event swipedown
 * @param {Object} ev
 */
Hammer.gestures.Swipe = {
    name: 'swipe',
    index: 40,
    defaults: {
        /**
         * @property swipeMinTouches
         * @type {Number}
         * @default 1
         */
        swipeMinTouches: 1,

        /**
         * @property swipeMaxTouches
         * @type {Number}
         * @default 1
         */
        swipeMaxTouches: 1,

        /**
         * horizontal swipe velocity
         * @property swipeVelocityX
         * @type {Number}
         * @default 0.6
         */
        swipeVelocityX: 0.6,

        /**
         * vertical swipe velocity
         * @property swipeVelocityY
         * @type {Number}
         * @default 0.6
         */
        swipeVelocityY: 0.6
    },

    handler: function swipeGesture(ev, inst) {
        if(ev.eventType == EVENT_RELEASE) {
            var touches = ev.touches.length,
                options = inst.options;

            // max touches
            if(touches < options.swipeMinTouches ||
                touches > options.swipeMaxTouches) {
                return;
            }

            // when the distance we moved is too small we skip this gesture
            // or we can be already in dragging
            if(ev.velocityX > options.swipeVelocityX ||
                ev.velocityY > options.swipeVelocityY) {
                // trigger swipe events
                inst.trigger(this.name, ev);
                inst.trigger(this.name + ev.direction, ev);
            }
        }
    }
};

/**
 * @module gestures
 */
/**
 * Single tap and a double tap on a place
 *
 * @class Tap
 * @static
 */
/**
 * @event tap
 * @param {Object} ev
 */
/**
 * @event doubletap
 * @param {Object} ev
 */

/**
 * @param {String} name
 */
(function(name) {
    var hasMoved = false;

    function tapGesture(ev, inst) {
        var options = inst.options,
            current = Detection.current,
            prev = Detection.previous,
            sincePrev,
            didDoubleTap;

        switch(ev.eventType) {
            case EVENT_START:
                hasMoved = false;
                break;

            case EVENT_MOVE:
                hasMoved = hasMoved || (ev.distance > options.tapMaxDistance);
                break;

            case EVENT_END:
                if(!Utils.inStr(ev.srcEvent.type, 'cancel') && ev.deltaTime < options.tapMaxTime && !hasMoved) {
                    // previous gesture, for the double tap since these are two different gesture detections
                    sincePrev = prev && prev.lastEvent && ev.timeStamp - prev.lastEvent.timeStamp;
                    didDoubleTap = false;

                    // check if double tap
                    if(prev && prev.name == name &&
                        (sincePrev && sincePrev < options.doubleTapInterval) &&
                        ev.distance < options.doubleTapDistance) {
                        inst.trigger('doubletap', ev);
                        didDoubleTap = true;
                    }

                    // do a single tap
                    if(!didDoubleTap || options.tapAlways) {
                        current.name = name;
                        inst.trigger(current.name, ev);
                    }
                }
                break;
        }
    }

    Hammer.gestures.Tap = {
        name: name,
        index: 100,
        handler: tapGesture,
        defaults: {
            /**
             * max time of a tap, this is for the slow tappers
             * @property tapMaxTime
             * @type {Number}
             * @default 250
             */
            tapMaxTime: 250,

            /**
             * max distance of movement of a tap, this is for the slow tappers
             * @property tapMaxDistance
             * @type {Number}
             * @default 10
             */
            tapMaxDistance: 10,

            /**
             * always trigger the `tap` event, even while double-tapping
             * @property tapAlways
             * @type {Boolean}
             * @default true
             */
            tapAlways: true,

            /**
             * max distance between two taps
             * @property doubleTapDistance
             * @type {Number}
             * @default 20
             */
            doubleTapDistance: 20,

            /**
             * max time between two taps
             * @property doubleTapInterval
             * @type {Number}
             * @default 300
             */
            doubleTapInterval: 300
        }
    };
})('tap');

/**
 * @module gestures
 */
/**
 * when a touch is being touched at the page
 *
 * @class Touch
 * @static
 */
/**
 * @event touch
 * @param {Object} ev
 */
Hammer.gestures.Touch = {
    name: 'touch',
    index: -Infinity,
    defaults: {
        /**
         * call preventDefault at touchstart, and makes the element blocking by disabling the scrolling of the page,
         * but it improves gestures like transforming and dragging.
         * be careful with using this, it can be very annoying for users to be stuck on the page
         * @property preventDefault
         * @type {Boolean}
         * @default false
         */
        preventDefault: false,

        /**
         * disable mouse events, so only touch (or pen!) input triggers events
         * @property preventMouse
         * @type {Boolean}
         * @default false
         */
        preventMouse: false
    },
    handler: function touchGesture(ev, inst) {
        if(inst.options.preventMouse && ev.pointerType == POINTER_MOUSE) {
            ev.stopDetect();
            return;
        }

        if(inst.options.preventDefault) {
            ev.preventDefault();
        }

        if(ev.eventType == EVENT_TOUCH) {
            inst.trigger('touch', ev);
        }
    }
};

/**
 * @module gestures
 */
/**
 * User want to scale or rotate with 2 fingers
 * Preventing the default browser behavior is a good way to improve feel and working. This can be done with the
 * `preventDefault` option.
 *
 * @class Transform
 * @static
 */
/**
 * @event transform
 * @param {Object} ev
 */
/**
 * @event transformstart
 * @param {Object} ev
 */
/**
 * @event transformend
 * @param {Object} ev
 */
/**
 * @event pinchin
 * @param {Object} ev
 */
/**
 * @event pinchout
 * @param {Object} ev
 */
/**
 * @event rotate
 * @param {Object} ev
 */

/**
 * @param {String} name
 */
(function(name) {
    var triggered = false;

    function transformGesture(ev, inst) {
        switch(ev.eventType) {
            case EVENT_START:
                triggered = false;
                break;

            case EVENT_MOVE:
                // at least multitouch
                if(ev.touches.length < 2) {
                    return;
                }

                var scaleThreshold = Math.abs(1 - ev.scale);
                var rotationThreshold = Math.abs(ev.rotation);

                // when the distance we moved is too small we skip this gesture
                // or we can be already in dragging
                if(scaleThreshold < inst.options.transformMinScale &&
                    rotationThreshold < inst.options.transformMinRotation) {
                    return;
                }

                // we are transforming!
                Detection.current.name = name;

                // first time, trigger dragstart event
                if(!triggered) {
                    inst.trigger(name + 'start', ev);
                    triggered = true;
                }

                inst.trigger(name, ev); // basic transform event

                // trigger rotate event
                if(rotationThreshold > inst.options.transformMinRotation) {
                    inst.trigger('rotate', ev);
                }

                // trigger pinch event
                if(scaleThreshold > inst.options.transformMinScale) {
                    inst.trigger('pinch', ev);
                    inst.trigger('pinch' + (ev.scale < 1 ? 'in' : 'out'), ev);
                }
                break;

            case EVENT_RELEASE:
                if(triggered && ev.changedLength < 2) {
                    inst.trigger(name + 'end', ev);
                    triggered = false;
                }
                break;
        }
    }

    Hammer.gestures.Transform = {
        name: name,
        index: 45,
        defaults: {
            /**
             * minimal scale factor, no scale is 1, zoomin is to 0 and zoomout until higher then 1
             * @property transformMinScale
             * @type {Number}
             * @default 0.01
             */
            transformMinScale: 0.01,

            /**
             * rotation in degrees
             * @property transformMinRotation
             * @type {Number}
             * @default 1
             */
            transformMinRotation: 1
        },

        handler: transformGesture
    };
})('transform');

/**
 * @module hammer
 */

// AMD export
if(typeof define == 'function' && define.amd) {
    define(function() {
        return Hammer;
    });
// commonjs export
} else if(typeof module !== 'undefined' && module.exports) {
    module.exports = Hammer;
// browser export
} else {
    window.Hammer = Hammer;
}

})(window);
},{}],33:[function(require,module,exports){
"use strict";
/**
 * Created by Alex on 11/6/2014.
 */

// https://github.com/umdjs/umd/blob/master/returnExports.js#L40-L60
// if the module has no dependencies, the above pattern can be simplified to
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define([], factory);
  } else if (typeof exports === 'object') {
    // Node. Does not work with strict CommonJS, but
    // only CommonJS-like environments that support module.exports,
    // like Node.
    module.exports = factory();
  } else {
    // Browser globals (root is window)
    root.keycharm = factory();
  }
}(this, function () {

  function keycharm(options) {
    var preventDefault = options && options.preventDefault || false;

    var container = options && options.container || window;

    var _exportFunctions = {};
    var _bound = {keydown:{}, keyup:{}};
    var _keys = {};
    var i;

    // a - z
    for (i = 97; i <= 122; i++) {_keys[String.fromCharCode(i)] = {code:65 + (i - 97), shift: false};}
    // A - Z
    for (i = 65; i <= 90; i++) {_keys[String.fromCharCode(i)] = {code:i, shift: true};}
    // 0 - 9
    for (i = 0;  i <= 9;   i++) {_keys['' + i] = {code:48 + i, shift: false};}
    // F1 - F12
    for (i = 1;  i <= 12;   i++) {_keys['F' + i] = {code:111 + i, shift: false};}
    // num0 - num9
    for (i = 0;  i <= 9;   i++) {_keys['num' + i] = {code:96 + i, shift: false};}

    // numpad misc
    _keys['num*'] = {code:106, shift: false};
    _keys['num+'] = {code:107, shift: false};
    _keys['num-'] = {code:109, shift: false};
    _keys['num/'] = {code:111, shift: false};
    _keys['num.'] = {code:110, shift: false};
    // arrows
    _keys['left']  = {code:37, shift: false};
    _keys['up']    = {code:38, shift: false};
    _keys['right'] = {code:39, shift: false};
    _keys['down']  = {code:40, shift: false};
    // extra keys
    _keys['space'] = {code:32, shift: false};
    _keys['enter'] = {code:13, shift: false};
    _keys['shift'] = {code:16, shift: undefined};
    _keys['esc']   = {code:27, shift: false};
    _keys['backspace'] = {code:8, shift: false};
    _keys['tab']       = {code:9, shift: false};
    _keys['ctrl']      = {code:17, shift: false};
    _keys['alt']       = {code:18, shift: false};
    _keys['delete']    = {code:46, shift: false};
    _keys['pageup']    = {code:33, shift: false};
    _keys['pagedown']  = {code:34, shift: false};
    // symbols
    _keys['=']     = {code:187, shift: false};
    _keys['-']     = {code:189, shift: false};
    _keys[']']     = {code:221, shift: false};
    _keys['[']     = {code:219, shift: false};



    var down = function(event) {handleEvent(event,'keydown');};
    var up = function(event) {handleEvent(event,'keyup');};

    // handle the actualy bound key with the event
    var handleEvent = function(event,type) {
      if (_bound[type][event.keyCode] !== undefined) {
        var bound = _bound[type][event.keyCode];
        for (var i = 0; i < bound.length; i++) {
          if (bound[i].shift === undefined) {
            bound[i].fn(event);
          }
          else if (bound[i].shift == true && event.shiftKey == true) {
            bound[i].fn(event);
          }
          else if (bound[i].shift == false && event.shiftKey == false) {
            bound[i].fn(event);
          }
        }

        if (preventDefault == true) {
          event.preventDefault();
        }
      }
    };

    // bind a key to a callback
    _exportFunctions.bind = function(key, callback, type) {
      if (type === undefined) {
        type = 'keydown';
      }
      if (_keys[key] === undefined) {
        throw new Error("unsupported key: " + key);
      }
      if (_bound[type][_keys[key].code] === undefined) {
        _bound[type][_keys[key].code] = [];
      }
      _bound[type][_keys[key].code].push({fn:callback, shift:_keys[key].shift});
    };


    // bind all keys to a call back (demo purposes)
    _exportFunctions.bindAll = function(callback, type) {
      if (type === undefined) {
        type = 'keydown';
      }
      for (var key in _keys) {
        if (_keys.hasOwnProperty(key)) {
          _exportFunctions.bind(key,callback,type);
        }
      }
    };

    // get the key label from an event
    _exportFunctions.getKey = function(event) {
      for (var key in _keys) {
        if (_keys.hasOwnProperty(key)) {
          if (event.shiftKey == true && _keys[key].shift == true && event.keyCode == _keys[key].code) {
            return key;
          }
          else if (event.shiftKey == false && _keys[key].shift == false && event.keyCode == _keys[key].code) {
            return key;
          }
          else if (event.keyCode == _keys[key].code && key == 'shift') {
            return key;
          }
        }
      }
      return "unknown key, currently not supported";
    };

    // unbind either a specific callback from a key or all of them (by leaving callback undefined)
    _exportFunctions.unbind = function(key, callback, type) {
      if (type === undefined) {
        type = 'keydown';
      }
      if (_keys[key] === undefined) {
        throw new Error("unsupported key: " + key);
      }
      if (callback !== undefined) {
        var newBindings = [];
        var bound = _bound[type][_keys[key].code];
        if (bound !== undefined) {
          for (var i = 0; i < bound.length; i++) {
            if (!(bound[i].fn == callback && bound[i].shift == _keys[key].shift)) {
              newBindings.push(_bound[type][_keys[key].code][i]);
            }
          }
        }
        _bound[type][_keys[key].code] = newBindings;
      }
      else {
        _bound[type][_keys[key].code] = [];
      }
    };

    // reset all bound variables.
    _exportFunctions.reset = function() {
      _bound = {keydown:{}, keyup:{}};
    };

    // unbind all listeners and reset all variables.
    _exportFunctions.destroy = function() {
      _bound = {keydown:{}, keyup:{}};
      container.removeEventListener('keydown', down, true);
      container.removeEventListener('keyup', up, true);
    };

    // create listeners.
    container.addEventListener('keydown',down,true);
    container.addEventListener('keyup',up,true);

    // return the public functions.
    return _exportFunctions;
  }

  return keycharm;
}));



},{}],34:[function(require,module,exports){
(function (global){
//! moment.js
//! version : 2.9.0
//! authors : Tim Wood, Iskren Chernev, Moment.js contributors
//! license : MIT
//! momentjs.com

(function (undefined) {
    /************************************
        Constants
    ************************************/

    var moment,
        VERSION = '2.9.0',
        // the global-scope this is NOT the global object in Node.js
        globalScope = (typeof global !== 'undefined' && (typeof window === 'undefined' || window === global.window)) ? global : this,
        oldGlobalMoment,
        round = Math.round,
        hasOwnProperty = Object.prototype.hasOwnProperty,
        i,

        YEAR = 0,
        MONTH = 1,
        DATE = 2,
        HOUR = 3,
        MINUTE = 4,
        SECOND = 5,
        MILLISECOND = 6,

        // internal storage for locale config files
        locales = {},

        // extra moment internal properties (plugins register props here)
        momentProperties = [],

        // check for nodeJS
        hasModule = (typeof module !== 'undefined' && module && module.exports),

        // ASP.NET json date format regex
        aspNetJsonRegex = /^\/?Date\((\-?\d+)/i,
        aspNetTimeSpanJsonRegex = /(\-)?(?:(\d*)\.)?(\d+)\:(\d+)(?:\:(\d+)\.?(\d{3})?)?/,

        // from http://docs.closure-library.googlecode.com/git/closure_goog_date_date.js.source.html
        // somewhat more in line with 4.4.3.2 2004 spec, but allows decimal anywhere
        isoDurationRegex = /^(-)?P(?:(?:([0-9,.]*)Y)?(?:([0-9,.]*)M)?(?:([0-9,.]*)D)?(?:T(?:([0-9,.]*)H)?(?:([0-9,.]*)M)?(?:([0-9,.]*)S)?)?|([0-9,.]*)W)$/,

        // format tokens
        formattingTokens = /(\[[^\[]*\])|(\\)?(Mo|MM?M?M?|Do|DDDo|DD?D?D?|ddd?d?|do?|w[o|w]?|W[o|W]?|Q|YYYYYY|YYYYY|YYYY|YY|gg(ggg?)?|GG(GGG?)?|e|E|a|A|hh?|HH?|mm?|ss?|S{1,4}|x|X|zz?|ZZ?|.)/g,
        localFormattingTokens = /(\[[^\[]*\])|(\\)?(LTS|LT|LL?L?L?|l{1,4})/g,

        // parsing token regexes
        parseTokenOneOrTwoDigits = /\d\d?/, // 0 - 99
        parseTokenOneToThreeDigits = /\d{1,3}/, // 0 - 999
        parseTokenOneToFourDigits = /\d{1,4}/, // 0 - 9999
        parseTokenOneToSixDigits = /[+\-]?\d{1,6}/, // -999,999 - 999,999
        parseTokenDigits = /\d+/, // nonzero number of digits
        parseTokenWord = /[0-9]*['a-z\u00A0-\u05FF\u0700-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]+|[\u0600-\u06FF\/]+(\s*?[\u0600-\u06FF]+){1,2}/i, // any word (or two) characters or numbers including two/three word month in arabic.
        parseTokenTimezone = /Z|[\+\-]\d\d:?\d\d/gi, // +00:00 -00:00 +0000 -0000 or Z
        parseTokenT = /T/i, // T (ISO separator)
        parseTokenOffsetMs = /[\+\-]?\d+/, // 1234567890123
        parseTokenTimestampMs = /[\+\-]?\d+(\.\d{1,3})?/, // 123456789 123456789.123

        //strict parsing regexes
        parseTokenOneDigit = /\d/, // 0 - 9
        parseTokenTwoDigits = /\d\d/, // 00 - 99
        parseTokenThreeDigits = /\d{3}/, // 000 - 999
        parseTokenFourDigits = /\d{4}/, // 0000 - 9999
        parseTokenSixDigits = /[+-]?\d{6}/, // -999,999 - 999,999
        parseTokenSignedNumber = /[+-]?\d+/, // -inf - inf

        // iso 8601 regex
        // 0000-00-00 0000-W00 or 0000-W00-0 + T + 00 or 00:00 or 00:00:00 or 00:00:00.000 + +00:00 or +0000 or +00)
        isoRegex = /^\s*(?:[+-]\d{6}|\d{4})-(?:(\d\d-\d\d)|(W\d\d$)|(W\d\d-\d)|(\d\d\d))((T| )(\d\d(:\d\d(:\d\d(\.\d+)?)?)?)?([\+\-]\d\d(?::?\d\d)?|\s*Z)?)?$/,

        isoFormat = 'YYYY-MM-DDTHH:mm:ssZ',

        isoDates = [
            ['YYYYYY-MM-DD', /[+-]\d{6}-\d{2}-\d{2}/],
            ['YYYY-MM-DD', /\d{4}-\d{2}-\d{2}/],
            ['GGGG-[W]WW-E', /\d{4}-W\d{2}-\d/],
            ['GGGG-[W]WW', /\d{4}-W\d{2}/],
            ['YYYY-DDD', /\d{4}-\d{3}/]
        ],

        // iso time formats and regexes
        isoTimes = [
            ['HH:mm:ss.SSSS', /(T| )\d\d:\d\d:\d\d\.\d+/],
            ['HH:mm:ss', /(T| )\d\d:\d\d:\d\d/],
            ['HH:mm', /(T| )\d\d:\d\d/],
            ['HH', /(T| )\d\d/]
        ],

        // timezone chunker '+10:00' > ['10', '00'] or '-1530' > ['-', '15', '30']
        parseTimezoneChunker = /([\+\-]|\d\d)/gi,

        // getter and setter names
        proxyGettersAndSetters = 'Date|Hours|Minutes|Seconds|Milliseconds'.split('|'),
        unitMillisecondFactors = {
            'Milliseconds' : 1,
            'Seconds' : 1e3,
            'Minutes' : 6e4,
            'Hours' : 36e5,
            'Days' : 864e5,
            'Months' : 2592e6,
            'Years' : 31536e6
        },

        unitAliases = {
            ms : 'millisecond',
            s : 'second',
            m : 'minute',
            h : 'hour',
            d : 'day',
            D : 'date',
            w : 'week',
            W : 'isoWeek',
            M : 'month',
            Q : 'quarter',
            y : 'year',
            DDD : 'dayOfYear',
            e : 'weekday',
            E : 'isoWeekday',
            gg: 'weekYear',
            GG: 'isoWeekYear'
        },

        camelFunctions = {
            dayofyear : 'dayOfYear',
            isoweekday : 'isoWeekday',
            isoweek : 'isoWeek',
            weekyear : 'weekYear',
            isoweekyear : 'isoWeekYear'
        },

        // format function strings
        formatFunctions = {},

        // default relative time thresholds
        relativeTimeThresholds = {
            s: 45,  // seconds to minute
            m: 45,  // minutes to hour
            h: 22,  // hours to day
            d: 26,  // days to month
            M: 11   // months to year
        },

        // tokens to ordinalize and pad
        ordinalizeTokens = 'DDD w W M D d'.split(' '),
        paddedTokens = 'M D H h m s w W'.split(' '),

        formatTokenFunctions = {
            M    : function () {
                return this.month() + 1;
            },
            MMM  : function (format) {
                return this.localeData().monthsShort(this, format);
            },
            MMMM : function (format) {
                return this.localeData().months(this, format);
            },
            D    : function () {
                return this.date();
            },
            DDD  : function () {
                return this.dayOfYear();
            },
            d    : function () {
                return this.day();
            },
            dd   : function (format) {
                return this.localeData().weekdaysMin(this, format);
            },
            ddd  : function (format) {
                return this.localeData().weekdaysShort(this, format);
            },
            dddd : function (format) {
                return this.localeData().weekdays(this, format);
            },
            w    : function () {
                return this.week();
            },
            W    : function () {
                return this.isoWeek();
            },
            YY   : function () {
                return leftZeroFill(this.year() % 100, 2);
            },
            YYYY : function () {
                return leftZeroFill(this.year(), 4);
            },
            YYYYY : function () {
                return leftZeroFill(this.year(), 5);
            },
            YYYYYY : function () {
                var y = this.year(), sign = y >= 0 ? '+' : '-';
                return sign + leftZeroFill(Math.abs(y), 6);
            },
            gg   : function () {
                return leftZeroFill(this.weekYear() % 100, 2);
            },
            gggg : function () {
                return leftZeroFill(this.weekYear(), 4);
            },
            ggggg : function () {
                return leftZeroFill(this.weekYear(), 5);
            },
            GG   : function () {
                return leftZeroFill(this.isoWeekYear() % 100, 2);
            },
            GGGG : function () {
                return leftZeroFill(this.isoWeekYear(), 4);
            },
            GGGGG : function () {
                return leftZeroFill(this.isoWeekYear(), 5);
            },
            e : function () {
                return this.weekday();
            },
            E : function () {
                return this.isoWeekday();
            },
            a    : function () {
                return this.localeData().meridiem(this.hours(), this.minutes(), true);
            },
            A    : function () {
                return this.localeData().meridiem(this.hours(), this.minutes(), false);
            },
            H    : function () {
                return this.hours();
            },
            h    : function () {
                return this.hours() % 12 || 12;
            },
            m    : function () {
                return this.minutes();
            },
            s    : function () {
                return this.seconds();
            },
            S    : function () {
                return toInt(this.milliseconds() / 100);
            },
            SS   : function () {
                return leftZeroFill(toInt(this.milliseconds() / 10), 2);
            },
            SSS  : function () {
                return leftZeroFill(this.milliseconds(), 3);
            },
            SSSS : function () {
                return leftZeroFill(this.milliseconds(), 3);
            },
            Z    : function () {
                var a = this.utcOffset(),
                    b = '+';
                if (a < 0) {
                    a = -a;
                    b = '-';
                }
                return b + leftZeroFill(toInt(a / 60), 2) + ':' + leftZeroFill(toInt(a) % 60, 2);
            },
            ZZ   : function () {
                var a = this.utcOffset(),
                    b = '+';
                if (a < 0) {
                    a = -a;
                    b = '-';
                }
                return b + leftZeroFill(toInt(a / 60), 2) + leftZeroFill(toInt(a) % 60, 2);
            },
            z : function () {
                return this.zoneAbbr();
            },
            zz : function () {
                return this.zoneName();
            },
            x    : function () {
                return this.valueOf();
            },
            X    : function () {
                return this.unix();
            },
            Q : function () {
                return this.quarter();
            }
        },

        deprecations = {},

        lists = ['months', 'monthsShort', 'weekdays', 'weekdaysShort', 'weekdaysMin'],

        updateInProgress = false;

    // Pick the first defined of two or three arguments. dfl comes from
    // default.
    function dfl(a, b, c) {
        switch (arguments.length) {
            case 2: return a != null ? a : b;
            case 3: return a != null ? a : b != null ? b : c;
            default: throw new Error('Implement me');
        }
    }

    function hasOwnProp(a, b) {
        return hasOwnProperty.call(a, b);
    }

    function defaultParsingFlags() {
        // We need to deep clone this object, and es5 standard is not very
        // helpful.
        return {
            empty : false,
            unusedTokens : [],
            unusedInput : [],
            overflow : -2,
            charsLeftOver : 0,
            nullInput : false,
            invalidMonth : null,
            invalidFormat : false,
            userInvalidated : false,
            iso: false
        };
    }

    function printMsg(msg) {
        if (moment.suppressDeprecationWarnings === false &&
                typeof console !== 'undefined' && console.warn) {
            console.warn('Deprecation warning: ' + msg);
        }
    }

    function deprecate(msg, fn) {
        var firstTime = true;
        return extend(function () {
            if (firstTime) {
                printMsg(msg);
                firstTime = false;
            }
            return fn.apply(this, arguments);
        }, fn);
    }

    function deprecateSimple(name, msg) {
        if (!deprecations[name]) {
            printMsg(msg);
            deprecations[name] = true;
        }
    }

    function padToken(func, count) {
        return function (a) {
            return leftZeroFill(func.call(this, a), count);
        };
    }
    function ordinalizeToken(func, period) {
        return function (a) {
            return this.localeData().ordinal(func.call(this, a), period);
        };
    }

    function monthDiff(a, b) {
        // difference in months
        var wholeMonthDiff = ((b.year() - a.year()) * 12) + (b.month() - a.month()),
            // b is in (anchor - 1 month, anchor + 1 month)
            anchor = a.clone().add(wholeMonthDiff, 'months'),
            anchor2, adjust;

        if (b - anchor < 0) {
            anchor2 = a.clone().add(wholeMonthDiff - 1, 'months');
            // linear across the month
            adjust = (b - anchor) / (anchor - anchor2);
        } else {
            anchor2 = a.clone().add(wholeMonthDiff + 1, 'months');
            // linear across the month
            adjust = (b - anchor) / (anchor2 - anchor);
        }

        return -(wholeMonthDiff + adjust);
    }

    while (ordinalizeTokens.length) {
        i = ordinalizeTokens.pop();
        formatTokenFunctions[i + 'o'] = ordinalizeToken(formatTokenFunctions[i], i);
    }
    while (paddedTokens.length) {
        i = paddedTokens.pop();
        formatTokenFunctions[i + i] = padToken(formatTokenFunctions[i], 2);
    }
    formatTokenFunctions.DDDD = padToken(formatTokenFunctions.DDD, 3);


    function meridiemFixWrap(locale, hour, meridiem) {
        var isPm;

        if (meridiem == null) {
            // nothing to do
            return hour;
        }
        if (locale.meridiemHour != null) {
            return locale.meridiemHour(hour, meridiem);
        } else if (locale.isPM != null) {
            // Fallback
            isPm = locale.isPM(meridiem);
            if (isPm && hour < 12) {
                hour += 12;
            }
            if (!isPm && hour === 12) {
                hour = 0;
            }
            return hour;
        } else {
            // thie is not supposed to happen
            return hour;
        }
    }

    /************************************
        Constructors
    ************************************/

    function Locale() {
    }

    // Moment prototype object
    function Moment(config, skipOverflow) {
        if (skipOverflow !== false) {
            checkOverflow(config);
        }
        copyConfig(this, config);
        this._d = new Date(+config._d);
        // Prevent infinite loop in case updateOffset creates new moment
        // objects.
        if (updateInProgress === false) {
            updateInProgress = true;
            moment.updateOffset(this);
            updateInProgress = false;
        }
    }

    // Duration Constructor
    function Duration(duration) {
        var normalizedInput = normalizeObjectUnits(duration),
            years = normalizedInput.year || 0,
            quarters = normalizedInput.quarter || 0,
            months = normalizedInput.month || 0,
            weeks = normalizedInput.week || 0,
            days = normalizedInput.day || 0,
            hours = normalizedInput.hour || 0,
            minutes = normalizedInput.minute || 0,
            seconds = normalizedInput.second || 0,
            milliseconds = normalizedInput.millisecond || 0;

        // representation for dateAddRemove
        this._milliseconds = +milliseconds +
            seconds * 1e3 + // 1000
            minutes * 6e4 + // 1000 * 60
            hours * 36e5; // 1000 * 60 * 60
        // Because of dateAddRemove treats 24 hours as different from a
        // day when working around DST, we need to store them separately
        this._days = +days +
            weeks * 7;
        // It is impossible translate months into days without knowing
        // which months you are are talking about, so we have to store
        // it separately.
        this._months = +months +
            quarters * 3 +
            years * 12;

        this._data = {};

        this._locale = moment.localeData();

        this._bubble();
    }

    /************************************
        Helpers
    ************************************/


    function extend(a, b) {
        for (var i in b) {
            if (hasOwnProp(b, i)) {
                a[i] = b[i];
            }
        }

        if (hasOwnProp(b, 'toString')) {
            a.toString = b.toString;
        }

        if (hasOwnProp(b, 'valueOf')) {
            a.valueOf = b.valueOf;
        }

        return a;
    }

    function copyConfig(to, from) {
        var i, prop, val;

        if (typeof from._isAMomentObject !== 'undefined') {
            to._isAMomentObject = from._isAMomentObject;
        }
        if (typeof from._i !== 'undefined') {
            to._i = from._i;
        }
        if (typeof from._f !== 'undefined') {
            to._f = from._f;
        }
        if (typeof from._l !== 'undefined') {
            to._l = from._l;
        }
        if (typeof from._strict !== 'undefined') {
            to._strict = from._strict;
        }
        if (typeof from._tzm !== 'undefined') {
            to._tzm = from._tzm;
        }
        if (typeof from._isUTC !== 'undefined') {
            to._isUTC = from._isUTC;
        }
        if (typeof from._offset !== 'undefined') {
            to._offset = from._offset;
        }
        if (typeof from._pf !== 'undefined') {
            to._pf = from._pf;
        }
        if (typeof from._locale !== 'undefined') {
            to._locale = from._locale;
        }

        if (momentProperties.length > 0) {
            for (i in momentProperties) {
                prop = momentProperties[i];
                val = from[prop];
                if (typeof val !== 'undefined') {
                    to[prop] = val;
                }
            }
        }

        return to;
    }

    function absRound(number) {
        if (number < 0) {
            return Math.ceil(number);
        } else {
            return Math.floor(number);
        }
    }

    // left zero fill a number
    // see http://jsperf.com/left-zero-filling for performance comparison
    function leftZeroFill(number, targetLength, forceSign) {
        var output = '' + Math.abs(number),
            sign = number >= 0;

        while (output.length < targetLength) {
            output = '0' + output;
        }
        return (sign ? (forceSign ? '+' : '') : '-') + output;
    }

    function positiveMomentsDifference(base, other) {
        var res = {milliseconds: 0, months: 0};

        res.months = other.month() - base.month() +
            (other.year() - base.year()) * 12;
        if (base.clone().add(res.months, 'M').isAfter(other)) {
            --res.months;
        }

        res.milliseconds = +other - +(base.clone().add(res.months, 'M'));

        return res;
    }

    function momentsDifference(base, other) {
        var res;
        other = makeAs(other, base);
        if (base.isBefore(other)) {
            res = positiveMomentsDifference(base, other);
        } else {
            res = positiveMomentsDifference(other, base);
            res.milliseconds = -res.milliseconds;
            res.months = -res.months;
        }

        return res;
    }

    // TODO: remove 'name' arg after deprecation is removed
    function createAdder(direction, name) {
        return function (val, period) {
            var dur, tmp;
            //invert the arguments, but complain about it
            if (period !== null && !isNaN(+period)) {
                deprecateSimple(name, 'moment().' + name  + '(period, number) is deprecated. Please use moment().' + name + '(number, period).');
                tmp = val; val = period; period = tmp;
            }

            val = typeof val === 'string' ? +val : val;
            dur = moment.duration(val, period);
            addOrSubtractDurationFromMoment(this, dur, direction);
            return this;
        };
    }

    function addOrSubtractDurationFromMoment(mom, duration, isAdding, updateOffset) {
        var milliseconds = duration._milliseconds,
            days = duration._days,
            months = duration._months;
        updateOffset = updateOffset == null ? true : updateOffset;

        if (milliseconds) {
            mom._d.setTime(+mom._d + milliseconds * isAdding);
        }
        if (days) {
            rawSetter(mom, 'Date', rawGetter(mom, 'Date') + days * isAdding);
        }
        if (months) {
            rawMonthSetter(mom, rawGetter(mom, 'Month') + months * isAdding);
        }
        if (updateOffset) {
            moment.updateOffset(mom, days || months);
        }
    }

    // check if is an array
    function isArray(input) {
        return Object.prototype.toString.call(input) === '[object Array]';
    }

    function isDate(input) {
        return Object.prototype.toString.call(input) === '[object Date]' ||
            input instanceof Date;
    }

    // compare two arrays, return the number of differences
    function compareArrays(array1, array2, dontConvert) {
        var len = Math.min(array1.length, array2.length),
            lengthDiff = Math.abs(array1.length - array2.length),
            diffs = 0,
            i;
        for (i = 0; i < len; i++) {
            if ((dontConvert && array1[i] !== array2[i]) ||
                (!dontConvert && toInt(array1[i]) !== toInt(array2[i]))) {
                diffs++;
            }
        }
        return diffs + lengthDiff;
    }

    function normalizeUnits(units) {
        if (units) {
            var lowered = units.toLowerCase().replace(/(.)s$/, '$1');
            units = unitAliases[units] || camelFunctions[lowered] || lowered;
        }
        return units;
    }

    function normalizeObjectUnits(inputObject) {
        var normalizedInput = {},
            normalizedProp,
            prop;

        for (prop in inputObject) {
            if (hasOwnProp(inputObject, prop)) {
                normalizedProp = normalizeUnits(prop);
                if (normalizedProp) {
                    normalizedInput[normalizedProp] = inputObject[prop];
                }
            }
        }

        return normalizedInput;
    }

    function makeList(field) {
        var count, setter;

        if (field.indexOf('week') === 0) {
            count = 7;
            setter = 'day';
        }
        else if (field.indexOf('month') === 0) {
            count = 12;
            setter = 'month';
        }
        else {
            return;
        }

        moment[field] = function (format, index) {
            var i, getter,
                method = moment._locale[field],
                results = [];

            if (typeof format === 'number') {
                index = format;
                format = undefined;
            }

            getter = function (i) {
                var m = moment().utc().set(setter, i);
                return method.call(moment._locale, m, format || '');
            };

            if (index != null) {
                return getter(index);
            }
            else {
                for (i = 0; i < count; i++) {
                    results.push(getter(i));
                }
                return results;
            }
        };
    }

    function toInt(argumentForCoercion) {
        var coercedNumber = +argumentForCoercion,
            value = 0;

        if (coercedNumber !== 0 && isFinite(coercedNumber)) {
            if (coercedNumber >= 0) {
                value = Math.floor(coercedNumber);
            } else {
                value = Math.ceil(coercedNumber);
            }
        }

        return value;
    }

    function daysInMonth(year, month) {
        return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    }

    function weeksInYear(year, dow, doy) {
        return weekOfYear(moment([year, 11, 31 + dow - doy]), dow, doy).week;
    }

    function daysInYear(year) {
        return isLeapYear(year) ? 366 : 365;
    }

    function isLeapYear(year) {
        return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    }

    function checkOverflow(m) {
        var overflow;
        if (m._a && m._pf.overflow === -2) {
            overflow =
                m._a[MONTH] < 0 || m._a[MONTH] > 11 ? MONTH :
                m._a[DATE] < 1 || m._a[DATE] > daysInMonth(m._a[YEAR], m._a[MONTH]) ? DATE :
                m._a[HOUR] < 0 || m._a[HOUR] > 24 ||
                    (m._a[HOUR] === 24 && (m._a[MINUTE] !== 0 ||
                                           m._a[SECOND] !== 0 ||
                                           m._a[MILLISECOND] !== 0)) ? HOUR :
                m._a[MINUTE] < 0 || m._a[MINUTE] > 59 ? MINUTE :
                m._a[SECOND] < 0 || m._a[SECOND] > 59 ? SECOND :
                m._a[MILLISECOND] < 0 || m._a[MILLISECOND] > 999 ? MILLISECOND :
                -1;

            if (m._pf._overflowDayOfYear && (overflow < YEAR || overflow > DATE)) {
                overflow = DATE;
            }

            m._pf.overflow = overflow;
        }
    }

    function isValid(m) {
        if (m._isValid == null) {
            m._isValid = !isNaN(m._d.getTime()) &&
                m._pf.overflow < 0 &&
                !m._pf.empty &&
                !m._pf.invalidMonth &&
                !m._pf.nullInput &&
                !m._pf.invalidFormat &&
                !m._pf.userInvalidated;

            if (m._strict) {
                m._isValid = m._isValid &&
                    m._pf.charsLeftOver === 0 &&
                    m._pf.unusedTokens.length === 0 &&
                    m._pf.bigHour === undefined;
            }
        }
        return m._isValid;
    }

    function normalizeLocale(key) {
        return key ? key.toLowerCase().replace('_', '-') : key;
    }

    // pick the locale from the array
    // try ['en-au', 'en-gb'] as 'en-au', 'en-gb', 'en', as in move through the list trying each
    // substring from most specific to least, but move to the next array item if it's a more specific variant than the current root
    function chooseLocale(names) {
        var i = 0, j, next, locale, split;

        while (i < names.length) {
            split = normalizeLocale(names[i]).split('-');
            j = split.length;
            next = normalizeLocale(names[i + 1]);
            next = next ? next.split('-') : null;
            while (j > 0) {
                locale = loadLocale(split.slice(0, j).join('-'));
                if (locale) {
                    return locale;
                }
                if (next && next.length >= j && compareArrays(split, next, true) >= j - 1) {
                    //the next array item is better than a shallower substring of this one
                    break;
                }
                j--;
            }
            i++;
        }
        return null;
    }

    function loadLocale(name) {
        var oldLocale = null;
        if (!locales[name] && hasModule) {
            try {
                oldLocale = moment.locale();
                require('./locale/' + name);
                // because defineLocale currently also sets the global locale, we want to undo that for lazy loaded locales
                moment.locale(oldLocale);
            } catch (e) { }
        }
        return locales[name];
    }

    // Return a moment from input, that is local/utc/utcOffset equivalent to
    // model.
    function makeAs(input, model) {
        var res, diff;
        if (model._isUTC) {
            res = model.clone();
            diff = (moment.isMoment(input) || isDate(input) ?
                    +input : +moment(input)) - (+res);
            // Use low-level api, because this fn is low-level api.
            res._d.setTime(+res._d + diff);
            moment.updateOffset(res, false);
            return res;
        } else {
            return moment(input).local();
        }
    }

    /************************************
        Locale
    ************************************/


    extend(Locale.prototype, {

        set : function (config) {
            var prop, i;
            for (i in config) {
                prop = config[i];
                if (typeof prop === 'function') {
                    this[i] = prop;
                } else {
                    this['_' + i] = prop;
                }
            }
            // Lenient ordinal parsing accepts just a number in addition to
            // number + (possibly) stuff coming from _ordinalParseLenient.
            this._ordinalParseLenient = new RegExp(this._ordinalParse.source + '|' + /\d{1,2}/.source);
        },

        _months : 'January_February_March_April_May_June_July_August_September_October_November_December'.split('_'),
        months : function (m) {
            return this._months[m.month()];
        },

        _monthsShort : 'Jan_Feb_Mar_Apr_May_Jun_Jul_Aug_Sep_Oct_Nov_Dec'.split('_'),
        monthsShort : function (m) {
            return this._monthsShort[m.month()];
        },

        monthsParse : function (monthName, format, strict) {
            var i, mom, regex;

            if (!this._monthsParse) {
                this._monthsParse = [];
                this._longMonthsParse = [];
                this._shortMonthsParse = [];
            }

            for (i = 0; i < 12; i++) {
                // make the regex if we don't have it already
                mom = moment.utc([2000, i]);
                if (strict && !this._longMonthsParse[i]) {
                    this._longMonthsParse[i] = new RegExp('^' + this.months(mom, '').replace('.', '') + '$', 'i');
                    this._shortMonthsParse[i] = new RegExp('^' + this.monthsShort(mom, '').replace('.', '') + '$', 'i');
                }
                if (!strict && !this._monthsParse[i]) {
                    regex = '^' + this.months(mom, '') + '|^' + this.monthsShort(mom, '');
                    this._monthsParse[i] = new RegExp(regex.replace('.', ''), 'i');
                }
                // test the regex
                if (strict && format === 'MMMM' && this._longMonthsParse[i].test(monthName)) {
                    return i;
                } else if (strict && format === 'MMM' && this._shortMonthsParse[i].test(monthName)) {
                    return i;
                } else if (!strict && this._monthsParse[i].test(monthName)) {
                    return i;
                }
            }
        },

        _weekdays : 'Sunday_Monday_Tuesday_Wednesday_Thursday_Friday_Saturday'.split('_'),
        weekdays : function (m) {
            return this._weekdays[m.day()];
        },

        _weekdaysShort : 'Sun_Mon_Tue_Wed_Thu_Fri_Sat'.split('_'),
        weekdaysShort : function (m) {
            return this._weekdaysShort[m.day()];
        },

        _weekdaysMin : 'Su_Mo_Tu_We_Th_Fr_Sa'.split('_'),
        weekdaysMin : function (m) {
            return this._weekdaysMin[m.day()];
        },

        weekdaysParse : function (weekdayName) {
            var i, mom, regex;

            if (!this._weekdaysParse) {
                this._weekdaysParse = [];
            }

            for (i = 0; i < 7; i++) {
                // make the regex if we don't have it already
                if (!this._weekdaysParse[i]) {
                    mom = moment([2000, 1]).day(i);
                    regex = '^' + this.weekdays(mom, '') + '|^' + this.weekdaysShort(mom, '') + '|^' + this.weekdaysMin(mom, '');
                    this._weekdaysParse[i] = new RegExp(regex.replace('.', ''), 'i');
                }
                // test the regex
                if (this._weekdaysParse[i].test(weekdayName)) {
                    return i;
                }
            }
        },

        _longDateFormat : {
            LTS : 'h:mm:ss A',
            LT : 'h:mm A',
            L : 'MM/DD/YYYY',
            LL : 'MMMM D, YYYY',
            LLL : 'MMMM D, YYYY LT',
            LLLL : 'dddd, MMMM D, YYYY LT'
        },
        longDateFormat : function (key) {
            var output = this._longDateFormat[key];
            if (!output && this._longDateFormat[key.toUpperCase()]) {
                output = this._longDateFormat[key.toUpperCase()].replace(/MMMM|MM|DD|dddd/g, function (val) {
                    return val.slice(1);
                });
                this._longDateFormat[key] = output;
            }
            return output;
        },

        isPM : function (input) {
            // IE8 Quirks Mode & IE7 Standards Mode do not allow accessing strings like arrays
            // Using charAt should be more compatible.
            return ((input + '').toLowerCase().charAt(0) === 'p');
        },

        _meridiemParse : /[ap]\.?m?\.?/i,
        meridiem : function (hours, minutes, isLower) {
            if (hours > 11) {
                return isLower ? 'pm' : 'PM';
            } else {
                return isLower ? 'am' : 'AM';
            }
        },


        _calendar : {
            sameDay : '[Today at] LT',
            nextDay : '[Tomorrow at] LT',
            nextWeek : 'dddd [at] LT',
            lastDay : '[Yesterday at] LT',
            lastWeek : '[Last] dddd [at] LT',
            sameElse : 'L'
        },
        calendar : function (key, mom, now) {
            var output = this._calendar[key];
            return typeof output === 'function' ? output.apply(mom, [now]) : output;
        },

        _relativeTime : {
            future : 'in %s',
            past : '%s ago',
            s : 'a few seconds',
            m : 'a minute',
            mm : '%d minutes',
            h : 'an hour',
            hh : '%d hours',
            d : 'a day',
            dd : '%d days',
            M : 'a month',
            MM : '%d months',
            y : 'a year',
            yy : '%d years'
        },

        relativeTime : function (number, withoutSuffix, string, isFuture) {
            var output = this._relativeTime[string];
            return (typeof output === 'function') ?
                output(number, withoutSuffix, string, isFuture) :
                output.replace(/%d/i, number);
        },

        pastFuture : function (diff, output) {
            var format = this._relativeTime[diff > 0 ? 'future' : 'past'];
            return typeof format === 'function' ? format(output) : format.replace(/%s/i, output);
        },

        ordinal : function (number) {
            return this._ordinal.replace('%d', number);
        },
        _ordinal : '%d',
        _ordinalParse : /\d{1,2}/,

        preparse : function (string) {
            return string;
        },

        postformat : function (string) {
            return string;
        },

        week : function (mom) {
            return weekOfYear(mom, this._week.dow, this._week.doy).week;
        },

        _week : {
            dow : 0, // Sunday is the first day of the week.
            doy : 6  // The week that contains Jan 1st is the first week of the year.
        },

        firstDayOfWeek : function () {
            return this._week.dow;
        },

        firstDayOfYear : function () {
            return this._week.doy;
        },

        _invalidDate: 'Invalid date',
        invalidDate: function () {
            return this._invalidDate;
        }
    });

    /************************************
        Formatting
    ************************************/


    function removeFormattingTokens(input) {
        if (input.match(/\[[\s\S]/)) {
            return input.replace(/^\[|\]$/g, '');
        }
        return input.replace(/\\/g, '');
    }

    function makeFormatFunction(format) {
        var array = format.match(formattingTokens), i, length;

        for (i = 0, length = array.length; i < length; i++) {
            if (formatTokenFunctions[array[i]]) {
                array[i] = formatTokenFunctions[array[i]];
            } else {
                array[i] = removeFormattingTokens(array[i]);
            }
        }

        return function (mom) {
            var output = '';
            for (i = 0; i < length; i++) {
                output += array[i] instanceof Function ? array[i].call(mom, format) : array[i];
            }
            return output;
        };
    }

    // format date using native date object
    function formatMoment(m, format) {
        if (!m.isValid()) {
            return m.localeData().invalidDate();
        }

        format = expandFormat(format, m.localeData());

        if (!formatFunctions[format]) {
            formatFunctions[format] = makeFormatFunction(format);
        }

        return formatFunctions[format](m);
    }

    function expandFormat(format, locale) {
        var i = 5;

        function replaceLongDateFormatTokens(input) {
            return locale.longDateFormat(input) || input;
        }

        localFormattingTokens.lastIndex = 0;
        while (i >= 0 && localFormattingTokens.test(format)) {
            format = format.replace(localFormattingTokens, replaceLongDateFormatTokens);
            localFormattingTokens.lastIndex = 0;
            i -= 1;
        }

        return format;
    }


    /************************************
        Parsing
    ************************************/


    // get the regex to find the next token
    function getParseRegexForToken(token, config) {
        var a, strict = config._strict;
        switch (token) {
        case 'Q':
            return parseTokenOneDigit;
        case 'DDDD':
            return parseTokenThreeDigits;
        case 'YYYY':
        case 'GGGG':
        case 'gggg':
            return strict ? parseTokenFourDigits : parseTokenOneToFourDigits;
        case 'Y':
        case 'G':
        case 'g':
            return parseTokenSignedNumber;
        case 'YYYYYY':
        case 'YYYYY':
        case 'GGGGG':
        case 'ggggg':
            return strict ? parseTokenSixDigits : parseTokenOneToSixDigits;
        case 'S':
            if (strict) {
                return parseTokenOneDigit;
            }
            /* falls through */
        case 'SS':
            if (strict) {
                return parseTokenTwoDigits;
            }
            /* falls through */
        case 'SSS':
            if (strict) {
                return parseTokenThreeDigits;
            }
            /* falls through */
        case 'DDD':
            return parseTokenOneToThreeDigits;
        case 'MMM':
        case 'MMMM':
        case 'dd':
        case 'ddd':
        case 'dddd':
            return parseTokenWord;
        case 'a':
        case 'A':
            return config._locale._meridiemParse;
        case 'x':
            return parseTokenOffsetMs;
        case 'X':
            return parseTokenTimestampMs;
        case 'Z':
        case 'ZZ':
            return parseTokenTimezone;
        case 'T':
            return parseTokenT;
        case 'SSSS':
            return parseTokenDigits;
        case 'MM':
        case 'DD':
        case 'YY':
        case 'GG':
        case 'gg':
        case 'HH':
        case 'hh':
        case 'mm':
        case 'ss':
        case 'ww':
        case 'WW':
            return strict ? parseTokenTwoDigits : parseTokenOneOrTwoDigits;
        case 'M':
        case 'D':
        case 'd':
        case 'H':
        case 'h':
        case 'm':
        case 's':
        case 'w':
        case 'W':
        case 'e':
        case 'E':
            return parseTokenOneOrTwoDigits;
        case 'Do':
            return strict ? config._locale._ordinalParse : config._locale._ordinalParseLenient;
        default :
            a = new RegExp(regexpEscape(unescapeFormat(token.replace('\\', '')), 'i'));
            return a;
        }
    }

    function utcOffsetFromString(string) {
        string = string || '';
        var possibleTzMatches = (string.match(parseTokenTimezone) || []),
            tzChunk = possibleTzMatches[possibleTzMatches.length - 1] || [],
            parts = (tzChunk + '').match(parseTimezoneChunker) || ['-', 0, 0],
            minutes = +(parts[1] * 60) + toInt(parts[2]);

        return parts[0] === '+' ? minutes : -minutes;
    }

    // function to convert string input to date
    function addTimeToArrayFromToken(token, input, config) {
        var a, datePartArray = config._a;

        switch (token) {
        // QUARTER
        case 'Q':
            if (input != null) {
                datePartArray[MONTH] = (toInt(input) - 1) * 3;
            }
            break;
        // MONTH
        case 'M' : // fall through to MM
        case 'MM' :
            if (input != null) {
                datePartArray[MONTH] = toInt(input) - 1;
            }
            break;
        case 'MMM' : // fall through to MMMM
        case 'MMMM' :
            a = config._locale.monthsParse(input, token, config._strict);
            // if we didn't find a month name, mark the date as invalid.
            if (a != null) {
                datePartArray[MONTH] = a;
            } else {
                config._pf.invalidMonth = input;
            }
            break;
        // DAY OF MONTH
        case 'D' : // fall through to DD
        case 'DD' :
            if (input != null) {
                datePartArray[DATE] = toInt(input);
            }
            break;
        case 'Do' :
            if (input != null) {
                datePartArray[DATE] = toInt(parseInt(
                            input.match(/\d{1,2}/)[0], 10));
            }
            break;
        // DAY OF YEAR
        case 'DDD' : // fall through to DDDD
        case 'DDDD' :
            if (input != null) {
                config._dayOfYear = toInt(input);
            }

            break;
        // YEAR
        case 'YY' :
            datePartArray[YEAR] = moment.parseTwoDigitYear(input);
            break;
        case 'YYYY' :
        case 'YYYYY' :
        case 'YYYYYY' :
            datePartArray[YEAR] = toInt(input);
            break;
        // AM / PM
        case 'a' : // fall through to A
        case 'A' :
            config._meridiem = input;
            // config._isPm = config._locale.isPM(input);
            break;
        // HOUR
        case 'h' : // fall through to hh
        case 'hh' :
            config._pf.bigHour = true;
            /* falls through */
        case 'H' : // fall through to HH
        case 'HH' :
            datePartArray[HOUR] = toInt(input);
            break;
        // MINUTE
        case 'm' : // fall through to mm
        case 'mm' :
            datePartArray[MINUTE] = toInt(input);
            break;
        // SECOND
        case 's' : // fall through to ss
        case 'ss' :
            datePartArray[SECOND] = toInt(input);
            break;
        // MILLISECOND
        case 'S' :
        case 'SS' :
        case 'SSS' :
        case 'SSSS' :
            datePartArray[MILLISECOND] = toInt(('0.' + input) * 1000);
            break;
        // UNIX OFFSET (MILLISECONDS)
        case 'x':
            config._d = new Date(toInt(input));
            break;
        // UNIX TIMESTAMP WITH MS
        case 'X':
            config._d = new Date(parseFloat(input) * 1000);
            break;
        // TIMEZONE
        case 'Z' : // fall through to ZZ
        case 'ZZ' :
            config._useUTC = true;
            config._tzm = utcOffsetFromString(input);
            break;
        // WEEKDAY - human
        case 'dd':
        case 'ddd':
        case 'dddd':
            a = config._locale.weekdaysParse(input);
            // if we didn't get a weekday name, mark the date as invalid
            if (a != null) {
                config._w = config._w || {};
                config._w['d'] = a;
            } else {
                config._pf.invalidWeekday = input;
            }
            break;
        // WEEK, WEEK DAY - numeric
        case 'w':
        case 'ww':
        case 'W':
        case 'WW':
        case 'd':
        case 'e':
        case 'E':
            token = token.substr(0, 1);
            /* falls through */
        case 'gggg':
        case 'GGGG':
        case 'GGGGG':
            token = token.substr(0, 2);
            if (input) {
                config._w = config._w || {};
                config._w[token] = toInt(input);
            }
            break;
        case 'gg':
        case 'GG':
            config._w = config._w || {};
            config._w[token] = moment.parseTwoDigitYear(input);
        }
    }

    function dayOfYearFromWeekInfo(config) {
        var w, weekYear, week, weekday, dow, doy, temp;

        w = config._w;
        if (w.GG != null || w.W != null || w.E != null) {
            dow = 1;
            doy = 4;

            // TODO: We need to take the current isoWeekYear, but that depends on
            // how we interpret now (local, utc, fixed offset). So create
            // a now version of current config (take local/utc/offset flags, and
            // create now).
            weekYear = dfl(w.GG, config._a[YEAR], weekOfYear(moment(), 1, 4).year);
            week = dfl(w.W, 1);
            weekday = dfl(w.E, 1);
        } else {
            dow = config._locale._week.dow;
            doy = config._locale._week.doy;

            weekYear = dfl(w.gg, config._a[YEAR], weekOfYear(moment(), dow, doy).year);
            week = dfl(w.w, 1);

            if (w.d != null) {
                // weekday -- low day numbers are considered next week
                weekday = w.d;
                if (weekday < dow) {
                    ++week;
                }
            } else if (w.e != null) {
                // local weekday -- counting starts from begining of week
                weekday = w.e + dow;
            } else {
                // default to begining of week
                weekday = dow;
            }
        }
        temp = dayOfYearFromWeeks(weekYear, week, weekday, doy, dow);

        config._a[YEAR] = temp.year;
        config._dayOfYear = temp.dayOfYear;
    }

    // convert an array to a date.
    // the array should mirror the parameters below
    // note: all values past the year are optional and will default to the lowest possible value.
    // [year, month, day , hour, minute, second, millisecond]
    function dateFromConfig(config) {
        var i, date, input = [], currentDate, yearToUse;

        if (config._d) {
            return;
        }

        currentDate = currentDateArray(config);

        //compute day of the year from weeks and weekdays
        if (config._w && config._a[DATE] == null && config._a[MONTH] == null) {
            dayOfYearFromWeekInfo(config);
        }

        //if the day of the year is set, figure out what it is
        if (config._dayOfYear) {
            yearToUse = dfl(config._a[YEAR], currentDate[YEAR]);

            if (config._dayOfYear > daysInYear(yearToUse)) {
                config._pf._overflowDayOfYear = true;
            }

            date = makeUTCDate(yearToUse, 0, config._dayOfYear);
            config._a[MONTH] = date.getUTCMonth();
            config._a[DATE] = date.getUTCDate();
        }

        // Default to current date.
        // * if no year, month, day of month are given, default to today
        // * if day of month is given, default month and year
        // * if month is given, default only year
        // * if year is given, don't default anything
        for (i = 0; i < 3 && config._a[i] == null; ++i) {
            config._a[i] = input[i] = currentDate[i];
        }

        // Zero out whatever was not defaulted, including time
        for (; i < 7; i++) {
            config._a[i] = input[i] = (config._a[i] == null) ? (i === 2 ? 1 : 0) : config._a[i];
        }

        // Check for 24:00:00.000
        if (config._a[HOUR] === 24 &&
                config._a[MINUTE] === 0 &&
                config._a[SECOND] === 0 &&
                config._a[MILLISECOND] === 0) {
            config._nextDay = true;
            config._a[HOUR] = 0;
        }

        config._d = (config._useUTC ? makeUTCDate : makeDate).apply(null, input);
        // Apply timezone offset from input. The actual utcOffset can be changed
        // with parseZone.
        if (config._tzm != null) {
            config._d.setUTCMinutes(config._d.getUTCMinutes() - config._tzm);
        }

        if (config._nextDay) {
            config._a[HOUR] = 24;
        }
    }

    function dateFromObject(config) {
        var normalizedInput;

        if (config._d) {
            return;
        }

        normalizedInput = normalizeObjectUnits(config._i);
        config._a = [
            normalizedInput.year,
            normalizedInput.month,
            normalizedInput.day || normalizedInput.date,
            normalizedInput.hour,
            normalizedInput.minute,
            normalizedInput.second,
            normalizedInput.millisecond
        ];

        dateFromConfig(config);
    }

    function currentDateArray(config) {
        var now = new Date();
        if (config._useUTC) {
            return [
                now.getUTCFullYear(),
                now.getUTCMonth(),
                now.getUTCDate()
            ];
        } else {
            return [now.getFullYear(), now.getMonth(), now.getDate()];
        }
    }

    // date from string and format string
    function makeDateFromStringAndFormat(config) {
        if (config._f === moment.ISO_8601) {
            parseISO(config);
            return;
        }

        config._a = [];
        config._pf.empty = true;

        // This array is used to make a Date, either with `new Date` or `Date.UTC`
        var string = '' + config._i,
            i, parsedInput, tokens, token, skipped,
            stringLength = string.length,
            totalParsedInputLength = 0;

        tokens = expandFormat(config._f, config._locale).match(formattingTokens) || [];

        for (i = 0; i < tokens.length; i++) {
            token = tokens[i];
            parsedInput = (string.match(getParseRegexForToken(token, config)) || [])[0];
            if (parsedInput) {
                skipped = string.substr(0, string.indexOf(parsedInput));
                if (skipped.length > 0) {
                    config._pf.unusedInput.push(skipped);
                }
                string = string.slice(string.indexOf(parsedInput) + parsedInput.length);
                totalParsedInputLength += parsedInput.length;
            }
            // don't parse if it's not a known token
            if (formatTokenFunctions[token]) {
                if (parsedInput) {
                    config._pf.empty = false;
                }
                else {
                    config._pf.unusedTokens.push(token);
                }
                addTimeToArrayFromToken(token, parsedInput, config);
            }
            else if (config._strict && !parsedInput) {
                config._pf.unusedTokens.push(token);
            }
        }

        // add remaining unparsed input length to the string
        config._pf.charsLeftOver = stringLength - totalParsedInputLength;
        if (string.length > 0) {
            config._pf.unusedInput.push(string);
        }

        // clear _12h flag if hour is <= 12
        if (config._pf.bigHour === true && config._a[HOUR] <= 12) {
            config._pf.bigHour = undefined;
        }
        // handle meridiem
        config._a[HOUR] = meridiemFixWrap(config._locale, config._a[HOUR],
                config._meridiem);
        dateFromConfig(config);
        checkOverflow(config);
    }

    function unescapeFormat(s) {
        return s.replace(/\\(\[)|\\(\])|\[([^\]\[]*)\]|\\(.)/g, function (matched, p1, p2, p3, p4) {
            return p1 || p2 || p3 || p4;
        });
    }

    // Code from http://stackoverflow.com/questions/3561493/is-there-a-regexp-escape-function-in-javascript
    function regexpEscape(s) {
        return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    }

    // date from string and array of format strings
    function makeDateFromStringAndArray(config) {
        var tempConfig,
            bestMoment,

            scoreToBeat,
            i,
            currentScore;

        if (config._f.length === 0) {
            config._pf.invalidFormat = true;
            config._d = new Date(NaN);
            return;
        }

        for (i = 0; i < config._f.length; i++) {
            currentScore = 0;
            tempConfig = copyConfig({}, config);
            if (config._useUTC != null) {
                tempConfig._useUTC = config._useUTC;
            }
            tempConfig._pf = defaultParsingFlags();
            tempConfig._f = config._f[i];
            makeDateFromStringAndFormat(tempConfig);

            if (!isValid(tempConfig)) {
                continue;
            }

            // if there is any input that was not parsed add a penalty for that format
            currentScore += tempConfig._pf.charsLeftOver;

            //or tokens
            currentScore += tempConfig._pf.unusedTokens.length * 10;

            tempConfig._pf.score = currentScore;

            if (scoreToBeat == null || currentScore < scoreToBeat) {
                scoreToBeat = currentScore;
                bestMoment = tempConfig;
            }
        }

        extend(config, bestMoment || tempConfig);
    }

    // date from iso format
    function parseISO(config) {
        var i, l,
            string = config._i,
            match = isoRegex.exec(string);

        if (match) {
            config._pf.iso = true;
            for (i = 0, l = isoDates.length; i < l; i++) {
                if (isoDates[i][1].exec(string)) {
                    // match[5] should be 'T' or undefined
                    config._f = isoDates[i][0] + (match[6] || ' ');
                    break;
                }
            }
            for (i = 0, l = isoTimes.length; i < l; i++) {
                if (isoTimes[i][1].exec(string)) {
                    config._f += isoTimes[i][0];
                    break;
                }
            }
            if (string.match(parseTokenTimezone)) {
                config._f += 'Z';
            }
            makeDateFromStringAndFormat(config);
        } else {
            config._isValid = false;
        }
    }

    // date from iso format or fallback
    function makeDateFromString(config) {
        parseISO(config);
        if (config._isValid === false) {
            delete config._isValid;
            moment.createFromInputFallback(config);
        }
    }

    function map(arr, fn) {
        var res = [], i;
        for (i = 0; i < arr.length; ++i) {
            res.push(fn(arr[i], i));
        }
        return res;
    }

    function makeDateFromInput(config) {
        var input = config._i, matched;
        if (input === undefined) {
            config._d = new Date();
        } else if (isDate(input)) {
            config._d = new Date(+input);
        } else if ((matched = aspNetJsonRegex.exec(input)) !== null) {
            config._d = new Date(+matched[1]);
        } else if (typeof input === 'string') {
            makeDateFromString(config);
        } else if (isArray(input)) {
            config._a = map(input.slice(0), function (obj) {
                return parseInt(obj, 10);
            });
            dateFromConfig(config);
        } else if (typeof(input) === 'object') {
            dateFromObject(config);
        } else if (typeof(input) === 'number') {
            // from milliseconds
            config._d = new Date(input);
        } else {
            moment.createFromInputFallback(config);
        }
    }

    function makeDate(y, m, d, h, M, s, ms) {
        //can't just apply() to create a date:
        //http://stackoverflow.com/questions/181348/instantiating-a-javascript-object-by-calling-prototype-constructor-apply
        var date = new Date(y, m, d, h, M, s, ms);

        //the date constructor doesn't accept years < 1970
        if (y < 1970) {
            date.setFullYear(y);
        }
        return date;
    }

    function makeUTCDate(y) {
        var date = new Date(Date.UTC.apply(null, arguments));
        if (y < 1970) {
            date.setUTCFullYear(y);
        }
        return date;
    }

    function parseWeekday(input, locale) {
        if (typeof input === 'string') {
            if (!isNaN(input)) {
                input = parseInt(input, 10);
            }
            else {
                input = locale.weekdaysParse(input);
                if (typeof input !== 'number') {
                    return null;
                }
            }
        }
        return input;
    }

    /************************************
        Relative Time
    ************************************/


    // helper function for moment.fn.from, moment.fn.fromNow, and moment.duration.fn.humanize
    function substituteTimeAgo(string, number, withoutSuffix, isFuture, locale) {
        return locale.relativeTime(number || 1, !!withoutSuffix, string, isFuture);
    }

    function relativeTime(posNegDuration, withoutSuffix, locale) {
        var duration = moment.duration(posNegDuration).abs(),
            seconds = round(duration.as('s')),
            minutes = round(duration.as('m')),
            hours = round(duration.as('h')),
            days = round(duration.as('d')),
            months = round(duration.as('M')),
            years = round(duration.as('y')),

            args = seconds < relativeTimeThresholds.s && ['s', seconds] ||
                minutes === 1 && ['m'] ||
                minutes < relativeTimeThresholds.m && ['mm', minutes] ||
                hours === 1 && ['h'] ||
                hours < relativeTimeThresholds.h && ['hh', hours] ||
                days === 1 && ['d'] ||
                days < relativeTimeThresholds.d && ['dd', days] ||
                months === 1 && ['M'] ||
                months < relativeTimeThresholds.M && ['MM', months] ||
                years === 1 && ['y'] || ['yy', years];

        args[2] = withoutSuffix;
        args[3] = +posNegDuration > 0;
        args[4] = locale;
        return substituteTimeAgo.apply({}, args);
    }


    /************************************
        Week of Year
    ************************************/


    // firstDayOfWeek       0 = sun, 6 = sat
    //                      the day of the week that starts the week
    //                      (usually sunday or monday)
    // firstDayOfWeekOfYear 0 = sun, 6 = sat
    //                      the first week is the week that contains the first
    //                      of this day of the week
    //                      (eg. ISO weeks use thursday (4))
    function weekOfYear(mom, firstDayOfWeek, firstDayOfWeekOfYear) {
        var end = firstDayOfWeekOfYear - firstDayOfWeek,
            daysToDayOfWeek = firstDayOfWeekOfYear - mom.day(),
            adjustedMoment;


        if (daysToDayOfWeek > end) {
            daysToDayOfWeek -= 7;
        }

        if (daysToDayOfWeek < end - 7) {
            daysToDayOfWeek += 7;
        }

        adjustedMoment = moment(mom).add(daysToDayOfWeek, 'd');
        return {
            week: Math.ceil(adjustedMoment.dayOfYear() / 7),
            year: adjustedMoment.year()
        };
    }

    //http://en.wikipedia.org/wiki/ISO_week_date#Calculating_a_date_given_the_year.2C_week_number_and_weekday
    function dayOfYearFromWeeks(year, week, weekday, firstDayOfWeekOfYear, firstDayOfWeek) {
        var d = makeUTCDate(year, 0, 1).getUTCDay(), daysToAdd, dayOfYear;

        d = d === 0 ? 7 : d;
        weekday = weekday != null ? weekday : firstDayOfWeek;
        daysToAdd = firstDayOfWeek - d + (d > firstDayOfWeekOfYear ? 7 : 0) - (d < firstDayOfWeek ? 7 : 0);
        dayOfYear = 7 * (week - 1) + (weekday - firstDayOfWeek) + daysToAdd + 1;

        return {
            year: dayOfYear > 0 ? year : year - 1,
            dayOfYear: dayOfYear > 0 ?  dayOfYear : daysInYear(year - 1) + dayOfYear
        };
    }

    /************************************
        Top Level Functions
    ************************************/

    function makeMoment(config) {
        var input = config._i,
            format = config._f,
            res;

        config._locale = config._locale || moment.localeData(config._l);

        if (input === null || (format === undefined && input === '')) {
            return moment.invalid({nullInput: true});
        }

        if (typeof input === 'string') {
            config._i = input = config._locale.preparse(input);
        }

        if (moment.isMoment(input)) {
            return new Moment(input, true);
        } else if (format) {
            if (isArray(format)) {
                makeDateFromStringAndArray(config);
            } else {
                makeDateFromStringAndFormat(config);
            }
        } else {
            makeDateFromInput(config);
        }

        res = new Moment(config);
        if (res._nextDay) {
            // Adding is smart enough around DST
            res.add(1, 'd');
            res._nextDay = undefined;
        }

        return res;
    }

    moment = function (input, format, locale, strict) {
        var c;

        if (typeof(locale) === 'boolean') {
            strict = locale;
            locale = undefined;
        }
        // object construction must be done this way.
        // https://github.com/moment/moment/issues/1423
        c = {};
        c._isAMomentObject = true;
        c._i = input;
        c._f = format;
        c._l = locale;
        c._strict = strict;
        c._isUTC = false;
        c._pf = defaultParsingFlags();

        return makeMoment(c);
    };

    moment.suppressDeprecationWarnings = false;

    moment.createFromInputFallback = deprecate(
        'moment construction falls back to js Date. This is ' +
        'discouraged and will be removed in upcoming major ' +
        'release. Please refer to ' +
        'https://github.com/moment/moment/issues/1407 for more info.',
        function (config) {
            config._d = new Date(config._i + (config._useUTC ? ' UTC' : ''));
        }
    );

    // Pick a moment m from moments so that m[fn](other) is true for all
    // other. This relies on the function fn to be transitive.
    //
    // moments should either be an array of moment objects or an array, whose
    // first element is an array of moment objects.
    function pickBy(fn, moments) {
        var res, i;
        if (moments.length === 1 && isArray(moments[0])) {
            moments = moments[0];
        }
        if (!moments.length) {
            return moment();
        }
        res = moments[0];
        for (i = 1; i < moments.length; ++i) {
            if (moments[i][fn](res)) {
                res = moments[i];
            }
        }
        return res;
    }

    moment.min = function () {
        var args = [].slice.call(arguments, 0);

        return pickBy('isBefore', args);
    };

    moment.max = function () {
        var args = [].slice.call(arguments, 0);

        return pickBy('isAfter', args);
    };

    // creating with utc
    moment.utc = function (input, format, locale, strict) {
        var c;

        if (typeof(locale) === 'boolean') {
            strict = locale;
            locale = undefined;
        }
        // object construction must be done this way.
        // https://github.com/moment/moment/issues/1423
        c = {};
        c._isAMomentObject = true;
        c._useUTC = true;
        c._isUTC = true;
        c._l = locale;
        c._i = input;
        c._f = format;
        c._strict = strict;
        c._pf = defaultParsingFlags();

        return makeMoment(c).utc();
    };

    // creating with unix timestamp (in seconds)
    moment.unix = function (input) {
        return moment(input * 1000);
    };

    // duration
    moment.duration = function (input, key) {
        var duration = input,
            // matching against regexp is expensive, do it on demand
            match = null,
            sign,
            ret,
            parseIso,
            diffRes;

        if (moment.isDuration(input)) {
            duration = {
                ms: input._milliseconds,
                d: input._days,
                M: input._months
            };
        } else if (typeof input === 'number') {
            duration = {};
            if (key) {
                duration[key] = input;
            } else {
                duration.milliseconds = input;
            }
        } else if (!!(match = aspNetTimeSpanJsonRegex.exec(input))) {
            sign = (match[1] === '-') ? -1 : 1;
            duration = {
                y: 0,
                d: toInt(match[DATE]) * sign,
                h: toInt(match[HOUR]) * sign,
                m: toInt(match[MINUTE]) * sign,
                s: toInt(match[SECOND]) * sign,
                ms: toInt(match[MILLISECOND]) * sign
            };
        } else if (!!(match = isoDurationRegex.exec(input))) {
            sign = (match[1] === '-') ? -1 : 1;
            parseIso = function (inp) {
                // We'd normally use ~~inp for this, but unfortunately it also
                // converts floats to ints.
                // inp may be undefined, so careful calling replace on it.
                var res = inp && parseFloat(inp.replace(',', '.'));
                // apply sign while we're at it
                return (isNaN(res) ? 0 : res) * sign;
            };
            duration = {
                y: parseIso(match[2]),
                M: parseIso(match[3]),
                d: parseIso(match[4]),
                h: parseIso(match[5]),
                m: parseIso(match[6]),
                s: parseIso(match[7]),
                w: parseIso(match[8])
            };
        } else if (duration == null) {// checks for null or undefined
            duration = {};
        } else if (typeof duration === 'object' &&
                ('from' in duration || 'to' in duration)) {
            diffRes = momentsDifference(moment(duration.from), moment(duration.to));

            duration = {};
            duration.ms = diffRes.milliseconds;
            duration.M = diffRes.months;
        }

        ret = new Duration(duration);

        if (moment.isDuration(input) && hasOwnProp(input, '_locale')) {
            ret._locale = input._locale;
        }

        return ret;
    };

    // version number
    moment.version = VERSION;

    // default format
    moment.defaultFormat = isoFormat;

    // constant that refers to the ISO standard
    moment.ISO_8601 = function () {};

    // Plugins that add properties should also add the key here (null value),
    // so we can properly clone ourselves.
    moment.momentProperties = momentProperties;

    // This function will be called whenever a moment is mutated.
    // It is intended to keep the offset in sync with the timezone.
    moment.updateOffset = function () {};

    // This function allows you to set a threshold for relative time strings
    moment.relativeTimeThreshold = function (threshold, limit) {
        if (relativeTimeThresholds[threshold] === undefined) {
            return false;
        }
        if (limit === undefined) {
            return relativeTimeThresholds[threshold];
        }
        relativeTimeThresholds[threshold] = limit;
        return true;
    };

    moment.lang = deprecate(
        'moment.lang is deprecated. Use moment.locale instead.',
        function (key, value) {
            return moment.locale(key, value);
        }
    );

    // This function will load locale and then set the global locale.  If
    // no arguments are passed in, it will simply return the current global
    // locale key.
    moment.locale = function (key, values) {
        var data;
        if (key) {
            if (typeof(values) !== 'undefined') {
                data = moment.defineLocale(key, values);
            }
            else {
                data = moment.localeData(key);
            }

            if (data) {
                moment.duration._locale = moment._locale = data;
            }
        }

        return moment._locale._abbr;
    };

    moment.defineLocale = function (name, values) {
        if (values !== null) {
            values.abbr = name;
            if (!locales[name]) {
                locales[name] = new Locale();
            }
            locales[name].set(values);

            // backwards compat for now: also set the locale
            moment.locale(name);

            return locales[name];
        } else {
            // useful for testing
            delete locales[name];
            return null;
        }
    };

    moment.langData = deprecate(
        'moment.langData is deprecated. Use moment.localeData instead.',
        function (key) {
            return moment.localeData(key);
        }
    );

    // returns locale data
    moment.localeData = function (key) {
        var locale;

        if (key && key._locale && key._locale._abbr) {
            key = key._locale._abbr;
        }

        if (!key) {
            return moment._locale;
        }

        if (!isArray(key)) {
            //short-circuit everything else
            locale = loadLocale(key);
            if (locale) {
                return locale;
            }
            key = [key];
        }

        return chooseLocale(key);
    };

    // compare moment object
    moment.isMoment = function (obj) {
        return obj instanceof Moment ||
            (obj != null && hasOwnProp(obj, '_isAMomentObject'));
    };

    // for typechecking Duration objects
    moment.isDuration = function (obj) {
        return obj instanceof Duration;
    };

    for (i = lists.length - 1; i >= 0; --i) {
        makeList(lists[i]);
    }

    moment.normalizeUnits = function (units) {
        return normalizeUnits(units);
    };

    moment.invalid = function (flags) {
        var m = moment.utc(NaN);
        if (flags != null) {
            extend(m._pf, flags);
        }
        else {
            m._pf.userInvalidated = true;
        }

        return m;
    };

    moment.parseZone = function () {
        return moment.apply(null, arguments).parseZone();
    };

    moment.parseTwoDigitYear = function (input) {
        return toInt(input) + (toInt(input) > 68 ? 1900 : 2000);
    };

    moment.isDate = isDate;

    /************************************
        Moment Prototype
    ************************************/


    extend(moment.fn = Moment.prototype, {

        clone : function () {
            return moment(this);
        },

        valueOf : function () {
            return +this._d - ((this._offset || 0) * 60000);
        },

        unix : function () {
            return Math.floor(+this / 1000);
        },

        toString : function () {
            return this.clone().locale('en').format('ddd MMM DD YYYY HH:mm:ss [GMT]ZZ');
        },

        toDate : function () {
            return this._offset ? new Date(+this) : this._d;
        },

        toISOString : function () {
            var m = moment(this).utc();
            if (0 < m.year() && m.year() <= 9999) {
                if ('function' === typeof Date.prototype.toISOString) {
                    // native implementation is ~50x faster, use it when we can
                    return this.toDate().toISOString();
                } else {
                    return formatMoment(m, 'YYYY-MM-DD[T]HH:mm:ss.SSS[Z]');
                }
            } else {
                return formatMoment(m, 'YYYYYY-MM-DD[T]HH:mm:ss.SSS[Z]');
            }
        },

        toArray : function () {
            var m = this;
            return [
                m.year(),
                m.month(),
                m.date(),
                m.hours(),
                m.minutes(),
                m.seconds(),
                m.milliseconds()
            ];
        },

        isValid : function () {
            return isValid(this);
        },

        isDSTShifted : function () {
            if (this._a) {
                return this.isValid() && compareArrays(this._a, (this._isUTC ? moment.utc(this._a) : moment(this._a)).toArray()) > 0;
            }

            return false;
        },

        parsingFlags : function () {
            return extend({}, this._pf);
        },

        invalidAt: function () {
            return this._pf.overflow;
        },

        utc : function (keepLocalTime) {
            return this.utcOffset(0, keepLocalTime);
        },

        local : function (keepLocalTime) {
            if (this._isUTC) {
                this.utcOffset(0, keepLocalTime);
                this._isUTC = false;

                if (keepLocalTime) {
                    this.subtract(this._dateUtcOffset(), 'm');
                }
            }
            return this;
        },

        format : function (inputString) {
            var output = formatMoment(this, inputString || moment.defaultFormat);
            return this.localeData().postformat(output);
        },

        add : createAdder(1, 'add'),

        subtract : createAdder(-1, 'subtract'),

        diff : function (input, units, asFloat) {
            var that = makeAs(input, this),
                zoneDiff = (that.utcOffset() - this.utcOffset()) * 6e4,
                anchor, diff, output, daysAdjust;

            units = normalizeUnits(units);

            if (units === 'year' || units === 'month' || units === 'quarter') {
                output = monthDiff(this, that);
                if (units === 'quarter') {
                    output = output / 3;
                } else if (units === 'year') {
                    output = output / 12;
                }
            } else {
                diff = this - that;
                output = units === 'second' ? diff / 1e3 : // 1000
                    units === 'minute' ? diff / 6e4 : // 1000 * 60
                    units === 'hour' ? diff / 36e5 : // 1000 * 60 * 60
                    units === 'day' ? (diff - zoneDiff) / 864e5 : // 1000 * 60 * 60 * 24, negate dst
                    units === 'week' ? (diff - zoneDiff) / 6048e5 : // 1000 * 60 * 60 * 24 * 7, negate dst
                    diff;
            }
            return asFloat ? output : absRound(output);
        },

        from : function (time, withoutSuffix) {
            return moment.duration({to: this, from: time}).locale(this.locale()).humanize(!withoutSuffix);
        },

        fromNow : function (withoutSuffix) {
            return this.from(moment(), withoutSuffix);
        },

        calendar : function (time) {
            // We want to compare the start of today, vs this.
            // Getting start-of-today depends on whether we're locat/utc/offset
            // or not.
            var now = time || moment(),
                sod = makeAs(now, this).startOf('day'),
                diff = this.diff(sod, 'days', true),
                format = diff < -6 ? 'sameElse' :
                    diff < -1 ? 'lastWeek' :
                    diff < 0 ? 'lastDay' :
                    diff < 1 ? 'sameDay' :
                    diff < 2 ? 'nextDay' :
                    diff < 7 ? 'nextWeek' : 'sameElse';
            return this.format(this.localeData().calendar(format, this, moment(now)));
        },

        isLeapYear : function () {
            return isLeapYear(this.year());
        },

        isDST : function () {
            return (this.utcOffset() > this.clone().month(0).utcOffset() ||
                this.utcOffset() > this.clone().month(5).utcOffset());
        },

        day : function (input) {
            var day = this._isUTC ? this._d.getUTCDay() : this._d.getDay();
            if (input != null) {
                input = parseWeekday(input, this.localeData());
                return this.add(input - day, 'd');
            } else {
                return day;
            }
        },

        month : makeAccessor('Month', true),

        startOf : function (units) {
            units = normalizeUnits(units);
            // the following switch intentionally omits break keywords
            // to utilize falling through the cases.
            switch (units) {
            case 'year':
                this.month(0);
                /* falls through */
            case 'quarter':
            case 'month':
                this.date(1);
                /* falls through */
            case 'week':
            case 'isoWeek':
            case 'day':
                this.hours(0);
                /* falls through */
            case 'hour':
                this.minutes(0);
                /* falls through */
            case 'minute':
                this.seconds(0);
                /* falls through */
            case 'second':
                this.milliseconds(0);
                /* falls through */
            }

            // weeks are a special case
            if (units === 'week') {
                this.weekday(0);
            } else if (units === 'isoWeek') {
                this.isoWeekday(1);
            }

            // quarters are also special
            if (units === 'quarter') {
                this.month(Math.floor(this.month() / 3) * 3);
            }

            return this;
        },

        endOf: function (units) {
            units = normalizeUnits(units);
            if (units === undefined || units === 'millisecond') {
                return this;
            }
            return this.startOf(units).add(1, (units === 'isoWeek' ? 'week' : units)).subtract(1, 'ms');
        },

        isAfter: function (input, units) {
            var inputMs;
            units = normalizeUnits(typeof units !== 'undefined' ? units : 'millisecond');
            if (units === 'millisecond') {
                input = moment.isMoment(input) ? input : moment(input);
                return +this > +input;
            } else {
                inputMs = moment.isMoment(input) ? +input : +moment(input);
                return inputMs < +this.clone().startOf(units);
            }
        },

        isBefore: function (input, units) {
            var inputMs;
            units = normalizeUnits(typeof units !== 'undefined' ? units : 'millisecond');
            if (units === 'millisecond') {
                input = moment.isMoment(input) ? input : moment(input);
                return +this < +input;
            } else {
                inputMs = moment.isMoment(input) ? +input : +moment(input);
                return +this.clone().endOf(units) < inputMs;
            }
        },

        isBetween: function (from, to, units) {
            return this.isAfter(from, units) && this.isBefore(to, units);
        },

        isSame: function (input, units) {
            var inputMs;
            units = normalizeUnits(units || 'millisecond');
            if (units === 'millisecond') {
                input = moment.isMoment(input) ? input : moment(input);
                return +this === +input;
            } else {
                inputMs = +moment(input);
                return +(this.clone().startOf(units)) <= inputMs && inputMs <= +(this.clone().endOf(units));
            }
        },

        min: deprecate(
                 'moment().min is deprecated, use moment.min instead. https://github.com/moment/moment/issues/1548',
                 function (other) {
                     other = moment.apply(null, arguments);
                     return other < this ? this : other;
                 }
         ),

        max: deprecate(
                'moment().max is deprecated, use moment.max instead. https://github.com/moment/moment/issues/1548',
                function (other) {
                    other = moment.apply(null, arguments);
                    return other > this ? this : other;
                }
        ),

        zone : deprecate(
                'moment().zone is deprecated, use moment().utcOffset instead. ' +
                'https://github.com/moment/moment/issues/1779',
                function (input, keepLocalTime) {
                    if (input != null) {
                        if (typeof input !== 'string') {
                            input = -input;
                        }

                        this.utcOffset(input, keepLocalTime);

                        return this;
                    } else {
                        return -this.utcOffset();
                    }
                }
        ),

        // keepLocalTime = true means only change the timezone, without
        // affecting the local hour. So 5:31:26 +0300 --[utcOffset(2, true)]-->
        // 5:31:26 +0200 It is possible that 5:31:26 doesn't exist with offset
        // +0200, so we adjust the time as needed, to be valid.
        //
        // Keeping the time actually adds/subtracts (one hour)
        // from the actual represented time. That is why we call updateOffset
        // a second time. In case it wants us to change the offset again
        // _changeInProgress == true case, then we have to adjust, because
        // there is no such time in the given timezone.
        utcOffset : function (input, keepLocalTime) {
            var offset = this._offset || 0,
                localAdjust;
            if (input != null) {
                if (typeof input === 'string') {
                    input = utcOffsetFromString(input);
                }
                if (Math.abs(input) < 16) {
                    input = input * 60;
                }
                if (!this._isUTC && keepLocalTime) {
                    localAdjust = this._dateUtcOffset();
                }
                this._offset = input;
                this._isUTC = true;
                if (localAdjust != null) {
                    this.add(localAdjust, 'm');
                }
                if (offset !== input) {
                    if (!keepLocalTime || this._changeInProgress) {
                        addOrSubtractDurationFromMoment(this,
                                moment.duration(input - offset, 'm'), 1, false);
                    } else if (!this._changeInProgress) {
                        this._changeInProgress = true;
                        moment.updateOffset(this, true);
                        this._changeInProgress = null;
                    }
                }

                return this;
            } else {
                return this._isUTC ? offset : this._dateUtcOffset();
            }
        },

        isLocal : function () {
            return !this._isUTC;
        },

        isUtcOffset : function () {
            return this._isUTC;
        },

        isUtc : function () {
            return this._isUTC && this._offset === 0;
        },

        zoneAbbr : function () {
            return this._isUTC ? 'UTC' : '';
        },

        zoneName : function () {
            return this._isUTC ? 'Coordinated Universal Time' : '';
        },

        parseZone : function () {
            if (this._tzm) {
                this.utcOffset(this._tzm);
            } else if (typeof this._i === 'string') {
                this.utcOffset(utcOffsetFromString(this._i));
            }
            return this;
        },

        hasAlignedHourOffset : function (input) {
            if (!input) {
                input = 0;
            }
            else {
                input = moment(input).utcOffset();
            }

            return (this.utcOffset() - input) % 60 === 0;
        },

        daysInMonth : function () {
            return daysInMonth(this.year(), this.month());
        },

        dayOfYear : function (input) {
            var dayOfYear = round((moment(this).startOf('day') - moment(this).startOf('year')) / 864e5) + 1;
            return input == null ? dayOfYear : this.add((input - dayOfYear), 'd');
        },

        quarter : function (input) {
            return input == null ? Math.ceil((this.month() + 1) / 3) : this.month((input - 1) * 3 + this.month() % 3);
        },

        weekYear : function (input) {
            var year = weekOfYear(this, this.localeData()._week.dow, this.localeData()._week.doy).year;
            return input == null ? year : this.add((input - year), 'y');
        },

        isoWeekYear : function (input) {
            var year = weekOfYear(this, 1, 4).year;
            return input == null ? year : this.add((input - year), 'y');
        },

        week : function (input) {
            var week = this.localeData().week(this);
            return input == null ? week : this.add((input - week) * 7, 'd');
        },

        isoWeek : function (input) {
            var week = weekOfYear(this, 1, 4).week;
            return input == null ? week : this.add((input - week) * 7, 'd');
        },

        weekday : function (input) {
            var weekday = (this.day() + 7 - this.localeData()._week.dow) % 7;
            return input == null ? weekday : this.add(input - weekday, 'd');
        },

        isoWeekday : function (input) {
            // behaves the same as moment#day except
            // as a getter, returns 7 instead of 0 (1-7 range instead of 0-6)
            // as a setter, sunday should belong to the previous week.
            return input == null ? this.day() || 7 : this.day(this.day() % 7 ? input : input - 7);
        },

        isoWeeksInYear : function () {
            return weeksInYear(this.year(), 1, 4);
        },

        weeksInYear : function () {
            var weekInfo = this.localeData()._week;
            return weeksInYear(this.year(), weekInfo.dow, weekInfo.doy);
        },

        get : function (units) {
            units = normalizeUnits(units);
            return this[units]();
        },

        set : function (units, value) {
            var unit;
            if (typeof units === 'object') {
                for (unit in units) {
                    this.set(unit, units[unit]);
                }
            }
            else {
                units = normalizeUnits(units);
                if (typeof this[units] === 'function') {
                    this[units](value);
                }
            }
            return this;
        },

        // If passed a locale key, it will set the locale for this
        // instance.  Otherwise, it will return the locale configuration
        // variables for this instance.
        locale : function (key) {
            var newLocaleData;

            if (key === undefined) {
                return this._locale._abbr;
            } else {
                newLocaleData = moment.localeData(key);
                if (newLocaleData != null) {
                    this._locale = newLocaleData;
                }
                return this;
            }
        },

        lang : deprecate(
            'moment().lang() is deprecated. Instead, use moment().localeData() to get the language configuration. Use moment().locale() to change languages.',
            function (key) {
                if (key === undefined) {
                    return this.localeData();
                } else {
                    return this.locale(key);
                }
            }
        ),

        localeData : function () {
            return this._locale;
        },

        _dateUtcOffset : function () {
            // On Firefox.24 Date#getTimezoneOffset returns a floating point.
            // https://github.com/moment/moment/pull/1871
            return -Math.round(this._d.getTimezoneOffset() / 15) * 15;
        }

    });

    function rawMonthSetter(mom, value) {
        var dayOfMonth;

        // TODO: Move this out of here!
        if (typeof value === 'string') {
            value = mom.localeData().monthsParse(value);
            // TODO: Another silent failure?
            if (typeof value !== 'number') {
                return mom;
            }
        }

        dayOfMonth = Math.min(mom.date(),
                daysInMonth(mom.year(), value));
        mom._d['set' + (mom._isUTC ? 'UTC' : '') + 'Month'](value, dayOfMonth);
        return mom;
    }

    function rawGetter(mom, unit) {
        return mom._d['get' + (mom._isUTC ? 'UTC' : '') + unit]();
    }

    function rawSetter(mom, unit, value) {
        if (unit === 'Month') {
            return rawMonthSetter(mom, value);
        } else {
            return mom._d['set' + (mom._isUTC ? 'UTC' : '') + unit](value);
        }
    }

    function makeAccessor(unit, keepTime) {
        return function (value) {
            if (value != null) {
                rawSetter(this, unit, value);
                moment.updateOffset(this, keepTime);
                return this;
            } else {
                return rawGetter(this, unit);
            }
        };
    }

    moment.fn.millisecond = moment.fn.milliseconds = makeAccessor('Milliseconds', false);
    moment.fn.second = moment.fn.seconds = makeAccessor('Seconds', false);
    moment.fn.minute = moment.fn.minutes = makeAccessor('Minutes', false);
    // Setting the hour should keep the time, because the user explicitly
    // specified which hour he wants. So trying to maintain the same hour (in
    // a new timezone) makes sense. Adding/subtracting hours does not follow
    // this rule.
    moment.fn.hour = moment.fn.hours = makeAccessor('Hours', true);
    // moment.fn.month is defined separately
    moment.fn.date = makeAccessor('Date', true);
    moment.fn.dates = deprecate('dates accessor is deprecated. Use date instead.', makeAccessor('Date', true));
    moment.fn.year = makeAccessor('FullYear', true);
    moment.fn.years = deprecate('years accessor is deprecated. Use year instead.', makeAccessor('FullYear', true));

    // add plural methods
    moment.fn.days = moment.fn.day;
    moment.fn.months = moment.fn.month;
    moment.fn.weeks = moment.fn.week;
    moment.fn.isoWeeks = moment.fn.isoWeek;
    moment.fn.quarters = moment.fn.quarter;

    // add aliased format methods
    moment.fn.toJSON = moment.fn.toISOString;

    // alias isUtc for dev-friendliness
    moment.fn.isUTC = moment.fn.isUtc;

    /************************************
        Duration Prototype
    ************************************/


    function daysToYears (days) {
        // 400 years have 146097 days (taking into account leap year rules)
        return days * 400 / 146097;
    }

    function yearsToDays (years) {
        // years * 365 + absRound(years / 4) -
        //     absRound(years / 100) + absRound(years / 400);
        return years * 146097 / 400;
    }

    extend(moment.duration.fn = Duration.prototype, {

        _bubble : function () {
            var milliseconds = this._milliseconds,
                days = this._days,
                months = this._months,
                data = this._data,
                seconds, minutes, hours, years = 0;

            // The following code bubbles up values, see the tests for
            // examples of what that means.
            data.milliseconds = milliseconds % 1000;

            seconds = absRound(milliseconds / 1000);
            data.seconds = seconds % 60;

            minutes = absRound(seconds / 60);
            data.minutes = minutes % 60;

            hours = absRound(minutes / 60);
            data.hours = hours % 24;

            days += absRound(hours / 24);

            // Accurately convert days to years, assume start from year 0.
            years = absRound(daysToYears(days));
            days -= absRound(yearsToDays(years));

            // 30 days to a month
            // TODO (iskren): Use anchor date (like 1st Jan) to compute this.
            months += absRound(days / 30);
            days %= 30;

            // 12 months -> 1 year
            years += absRound(months / 12);
            months %= 12;

            data.days = days;
            data.months = months;
            data.years = years;
        },

        abs : function () {
            this._milliseconds = Math.abs(this._milliseconds);
            this._days = Math.abs(this._days);
            this._months = Math.abs(this._months);

            this._data.milliseconds = Math.abs(this._data.milliseconds);
            this._data.seconds = Math.abs(this._data.seconds);
            this._data.minutes = Math.abs(this._data.minutes);
            this._data.hours = Math.abs(this._data.hours);
            this._data.months = Math.abs(this._data.months);
            this._data.years = Math.abs(this._data.years);

            return this;
        },

        weeks : function () {
            return absRound(this.days() / 7);
        },

        valueOf : function () {
            return this._milliseconds +
              this._days * 864e5 +
              (this._months % 12) * 2592e6 +
              toInt(this._months / 12) * 31536e6;
        },

        humanize : function (withSuffix) {
            var output = relativeTime(this, !withSuffix, this.localeData());

            if (withSuffix) {
                output = this.localeData().pastFuture(+this, output);
            }

            return this.localeData().postformat(output);
        },

        add : function (input, val) {
            // supports only 2.0-style add(1, 's') or add(moment)
            var dur = moment.duration(input, val);

            this._milliseconds += dur._milliseconds;
            this._days += dur._days;
            this._months += dur._months;

            this._bubble();

            return this;
        },

        subtract : function (input, val) {
            var dur = moment.duration(input, val);

            this._milliseconds -= dur._milliseconds;
            this._days -= dur._days;
            this._months -= dur._months;

            this._bubble();

            return this;
        },

        get : function (units) {
            units = normalizeUnits(units);
            return this[units.toLowerCase() + 's']();
        },

        as : function (units) {
            var days, months;
            units = normalizeUnits(units);

            if (units === 'month' || units === 'year') {
                days = this._days + this._milliseconds / 864e5;
                months = this._months + daysToYears(days) * 12;
                return units === 'month' ? months : months / 12;
            } else {
                // handle milliseconds separately because of floating point math errors (issue #1867)
                days = this._days + Math.round(yearsToDays(this._months / 12));
                switch (units) {
                    case 'week': return days / 7 + this._milliseconds / 6048e5;
                    case 'day': return days + this._milliseconds / 864e5;
                    case 'hour': return days * 24 + this._milliseconds / 36e5;
                    case 'minute': return days * 24 * 60 + this._milliseconds / 6e4;
                    case 'second': return days * 24 * 60 * 60 + this._milliseconds / 1000;
                    // Math.floor prevents floating point math errors here
                    case 'millisecond': return Math.floor(days * 24 * 60 * 60 * 1000) + this._milliseconds;
                    default: throw new Error('Unknown unit ' + units);
                }
            }
        },

        lang : moment.fn.lang,
        locale : moment.fn.locale,

        toIsoString : deprecate(
            'toIsoString() is deprecated. Please use toISOString() instead ' +
            '(notice the capitals)',
            function () {
                return this.toISOString();
            }
        ),

        toISOString : function () {
            // inspired by https://github.com/dordille/moment-isoduration/blob/master/moment.isoduration.js
            var years = Math.abs(this.years()),
                months = Math.abs(this.months()),
                days = Math.abs(this.days()),
                hours = Math.abs(this.hours()),
                minutes = Math.abs(this.minutes()),
                seconds = Math.abs(this.seconds() + this.milliseconds() / 1000);

            if (!this.asSeconds()) {
                // this is the same as C#'s (Noda) and python (isodate)...
                // but not other JS (goog.date)
                return 'P0D';
            }

            return (this.asSeconds() < 0 ? '-' : '') +
                'P' +
                (years ? years + 'Y' : '') +
                (months ? months + 'M' : '') +
                (days ? days + 'D' : '') +
                ((hours || minutes || seconds) ? 'T' : '') +
                (hours ? hours + 'H' : '') +
                (minutes ? minutes + 'M' : '') +
                (seconds ? seconds + 'S' : '');
        },

        localeData : function () {
            return this._locale;
        },

        toJSON : function () {
            return this.toISOString();
        }
    });

    moment.duration.fn.toString = moment.duration.fn.toISOString;

    function makeDurationGetter(name) {
        moment.duration.fn[name] = function () {
            return this._data[name];
        };
    }

    for (i in unitMillisecondFactors) {
        if (hasOwnProp(unitMillisecondFactors, i)) {
            makeDurationGetter(i.toLowerCase());
        }
    }

    moment.duration.fn.asMilliseconds = function () {
        return this.as('ms');
    };
    moment.duration.fn.asSeconds = function () {
        return this.as('s');
    };
    moment.duration.fn.asMinutes = function () {
        return this.as('m');
    };
    moment.duration.fn.asHours = function () {
        return this.as('h');
    };
    moment.duration.fn.asDays = function () {
        return this.as('d');
    };
    moment.duration.fn.asWeeks = function () {
        return this.as('weeks');
    };
    moment.duration.fn.asMonths = function () {
        return this.as('M');
    };
    moment.duration.fn.asYears = function () {
        return this.as('y');
    };

    /************************************
        Default Locale
    ************************************/


    // Set default locale, other locale will inherit from English.
    moment.locale('en', {
        ordinalParse: /\d{1,2}(th|st|nd|rd)/,
        ordinal : function (number) {
            var b = number % 10,
                output = (toInt(number % 100 / 10) === 1) ? 'th' :
                (b === 1) ? 'st' :
                (b === 2) ? 'nd' :
                (b === 3) ? 'rd' : 'th';
            return number + output;
        }
    });

    /* EMBED_LOCALES */

    /************************************
        Exposing Moment
    ************************************/

    function makeGlobal(shouldDeprecate) {
        /*global ender:false */
        if (typeof ender !== 'undefined') {
            return;
        }
        oldGlobalMoment = globalScope.moment;
        if (shouldDeprecate) {
            globalScope.moment = deprecate(
                    'Accessing Moment through the global scope is ' +
                    'deprecated, and will be removed in an upcoming ' +
                    'release.',
                    moment);
        } else {
            globalScope.moment = moment;
        }
    }

    // CommonJS module is defined
    if (hasModule) {
        module.exports = moment;
    } else if (typeof define === 'function' && define.amd) {
        define(function (require, exports, module) {
            if (module.config && module.config() && module.config().noGlobal === true) {
                // release the global variable
                globalScope.moment = oldGlobalMoment;
            }

            return moment;
        });
        makeGlobal(true);
    } else {
        makeGlobal();
    }
}).call(this);

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}]},{},[1])(1)
});