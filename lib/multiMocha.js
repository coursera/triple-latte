var Mocha = require('mocha');
var _ = require('underscore');
var files = require('./files');
var async = require('async');
var path = require('path');

exports.runner = function(config, configFile) {

  var reporter = config.reporter;
  var timeout = config.timeout;
  var grep = config.grep || undefined;
  var mochaGlobals = config.globals || [];
  var mochaExports = config.exports || {};
  var workers = config.workers;
  var split = config.split;
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

  var tests = files.findTests(testFiles);

  // divide up tests in groups of split sizes
  if (split > 0) {
    tests = _(tests).chain().groupBy(function(item, index, list) { return index % Math.round(list.length / split); }).values().value();
  }

  // manage the spawns
  async.mapLimit(tests, workers, function(_tests, done) {
    var spawn = require('child_process').spawn;
    var output = {error:null, data:''};
    var args = [path.join(__dirname, '..', 'bin', 'triple-latte')]; // path to triple-latte binary

    args.push('-w', 0);

    if (timeout);
      args.push('-t', timeout);

    if (reporter)
      args.push('-r', reporter);

    if (configFile)
      args.push('-c', configFile);

    if (grep)
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
}
