// Generated by CoffeeScript 1.9.0
(function() {
  var ArgumentFramework, complement, powerset, root,
    __indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

  ArgumentFramework = (function() {
    function ArgumentFramework(_at_defeatermap) {
      var arg, defeater, _i, _j, _len, _len1, _ref, _ref1;
      this.defeatermap = _at_defeatermap != null ? _at_defeatermap : {};
      this.argids = Object.keys(this.defeatermap);
      _ref = this.argids;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        arg = _ref[_i];
        if (!Array.isArray(this.defeatermap[arg])) {
          throw new Error("@defeatermap[" + arg + "] isnt an array.  @defeatermap must contain arrays.");
        }
        _ref1 = this.defeatermap[arg];
        for (_j = 0, _len1 = _ref1.length; _j < _len1; _j++) {
          defeater = _ref1[_j];
          if (__indexOf.call(this.argids, defeater) < 0) {
            throw new Error(defeater + " - unknown @defeatermap defeater of " + arg + ".");
          }
        }
      }
    }

    ArgumentFramework.prototype.isDefeated = function(arg, args) {
      var possibledefeater, _i, _len;
      for (_i = 0, _len = args.length; _i < _len; _i++) {
        possibledefeater = args[_i];
        if (__indexOf.call(this.defeatermap[arg], possibledefeater) >= 0) {
          return true;
        }
      }
      return false;
    };

    ArgumentFramework.prototype.isConflictFree = function(args) {
      var target, _i, _len;
      for (_i = 0, _len = args.length; _i < _len; _i++) {
        target = args[_i];
        if (this.isDefeated(target, args)) {
          return false;
        }
      }
      return true;
    };

    ArgumentFramework.prototype.isAcceptable = function(arg, args) {
      var defeater, _i, _len, _ref;
      _ref = this.defeatermap[arg];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        defeater = _ref[_i];
        if (!this.isDefeated(defeater, args)) {
          return false;
        }
      }
      return true;
    };

    ArgumentFramework.prototype.isAdmissible = function(args) {
      return this.isConflictFree(args) && args.every((function(_this) {
        return function(arg) {
          return _this.isAcceptable(arg, args);
        };
      })(this));
    };

    ArgumentFramework.prototype.isComplete = function(args) {
      var other, _i, _len, _ref;
      _ref = complement(args, this.argids);
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        other = _ref[_i];
        if (this.isAcceptable(other, args)) {
          return false;
        }
      }
      return this.isAdmissible(args);
    };

    ArgumentFramework.prototype.isStable = function(args) {
      var other, _i, _len, _ref;
      _ref = complement(args, this.argids);
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        other = _ref[_i];
        if (!this.isDefeated(other, args)) {
          return false;
        }
      }
      return this.isConflictFree(args);
    };

    ArgumentFramework.prototype.grounded = function() {
      var extendinout, label_in, label_out;
      label_in = [];
      label_out = [];
      extendinout = (function(_this) {
        return function() {
          var arg, defeater, others, result, tobeadded, union, _i, _j, _k, _len, _len1, _len2, _ref;
          result = false;
          union = label_in.concat(label_out);
          others = complement(union, _this.argids);
          for (_i = 0, _len = others.length; _i < _len; _i++) {
            arg = others[_i];
            tobeadded = true;
            _ref = _this.defeatermap[arg];
            for (_j = 0, _len1 = _ref.length; _j < _len1; _j++) {
              defeater = _ref[_j];
              if (__indexOf.call(label_out, defeater) < 0) {
                tobeadded = false;
              }
            }
            if (tobeadded) {
              label_in.push(arg);
            }
          }
          for (_k = 0, _len2 = others.length; _k < _len2; _k++) {
            arg = others[_k];
            if (_this.isDefeated(arg, label_in)) {
              label_out.push(arg);
              result = true;
            }
          }
          if (result) {
            return extendinout();
          }
        };
      })(this);
      extendinout();
      return label_in;
    };

    return ArgumentFramework;

  })();

  powerset = function(S) {
    var P, i, j;
    P = [[]];
    for (i in S) {
      for (j in P) {
        P.push(P[j].concat(S[i]));
      }
    }
    return P;
  };

  complement = function(A, B) {
    var el, _i, _len, _results;
    _results = [];
    for (_i = 0, _len = B.length; _i < _len; _i++) {
      el = B[_i];
      if (__indexOf.call(A, el) < 0) {
        _results.push(el);
      }
    }
    return _results;
  };

  root = typeof exports !== "undefined" && exports !== null ? exports : window;

  root.ArgumentFramework = ArgumentFramework;

}).call(this);