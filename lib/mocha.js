var Mocha = require('mocha');
var _ = require('underscore');
var files = require('./files');
var async = require('async');
var path = require('path');

/**
 * Override some of bdd's post-require definitions in order to save file name in the test
 * for xunit to output.
 */
var overrideBddIt = function(context, file, mocha) {
  /**
   * Describe a specification or test-case
   * with the given `title` and callback `fn`
   */

  var oldIt = context.it;
  context.it = context.specify = function(title, fn){
    var test = oldIt(title, fn);
    test.file = file;
    return test;
  };
  context.it.only = oldIt.only;
};

exports.runner = function(config, configFile) {

  var reporter = config.reporter || 'spec';
  var timeout = config.timeout || 2000;
  var grep = config.grep || undefined;
  var mochaGlobals = config.globals || [];
  var mochaExports = config.exports || {};
  var ui = config.ui || 'bdd';
  var testFiles = config.tests ? config.tests : ['./tests', './test'];
  var split = _.isNumber(config.split) ? config.split : 5;

  if (reporter == 'xunit') {
    reporter = path.join(__dirname, 'xunit.js');
  }

  var mochaOptions = {
    ui: ui,
    reporter: reporter,
    grep: grep,
    globals: mochaGlobals,
    timeout: timeout,
  };

  if (config.unify) {
    var mocha = new Mocha(mochaOptions);

    //// need to provide some variables to internal tests
    mocha.suite.on('pre-require', function(context, file, mocha) {
      _.each(_.isObject(mochaExports) ? mochaExports : {}, function(req, key) {
        context[key] = req;
      });

      overrideBddIt(context, file, mocha);
    });

    files.findTests(testFiles).map(function(test) {
      mocha.addFile(test);
    });

    mocha.run(function(failures) {
      process.exit(failures);
    });
  } else {
    var runners = [];

    files.findTests(testFiles).map(function(test) {
      runners.push(function(done) {
        var mocha = new Mocha(mochaOptions);

        //// need to provide some variables to internal tests
        mocha.suite.on('pre-require', function(context, file, mocha) {
          _.each(_.isObject(mochaExports) ? mochaExports : {}, function(req, key) {
            context[key] = req;
          });

          overrideBddIt(context, file, mocha);
        });

        mocha.addFile(test);

        mocha.run(function(failures) {
          done(null, failures);
        });
      });
    });

    async.series(runners, function(err, results) {
      // exit with highest exit code from all the test runs
      process.exit(results.sort().pop());
    });
  }
}
