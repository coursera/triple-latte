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
  var workers = _.isNumber(config.workers) ? config.workers : require('os').cpus().length;
  var split = _.isNumber(config.split) ? config.split : 5;
  var ui = config.ui || 'bdd';
  var testFiles = config.tests ? config.tests : ['./tests', './test'];

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

  if (workers !== 0) {
    var tests = files.findTests(testFiles);
  
    // divide up tests in groups of split sizes
    if (split > 0) {
      tests = _(tests).chain().groupBy(function(item, index, list) { return index % Math.round(list.length / split); }).values().value();
    }

    // manager the spawns
    async.mapLimit(tests, workers, function(_tests, done) {
      var spawn = require('child_process').spawn;
      var output = {error:null, data:''};
      var args = [process.argv[1]];

      args.push('-t', timeout, '-r', reporter, '-w', 0);

      if(configFile)
        args.push('-c', configFile);

      if(grep)
        args.push('-g', grep);

      oneTestSpawn = spawn('node', args.concat(split > 0 ? _tests : [_tests]));

      oneTestSpawn.stdout.on('data', function(data) {
        output.data += data.toString();
      });

      oneTestSpawn.stderr.on('data', function(data) {
        output.error += data.toString();
      });

      oneTestSpawn.on('close', function(code) {
        if (output.error) {
          console.log(output.error);
        }
        if (output.data) {
          console.log(output.data);
        }
        done(code);
      });

    }, function(err, results) {
      // exit with highest exit code from all the test runs
      process.exit(results.sort().pop());
    });
  } else {
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
  
    (mocha.run()).on("end", function() {
      process.exit();
    });
  }
}
