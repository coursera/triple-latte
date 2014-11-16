var Mocha = require('mocha');
var _ = require('underscore');
var files = require('./files');
var async = require('async');
var path = require('path');
var color = require('cli-color');
var util = require('util');
var fs = require('fs');

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
  var totals = {passed:[], failed:[], errored:[]};

  if (reporter == 'xunit') {
    // wrap all xunit tests in a plural tag
    reporter = path.join(__dirname, 'xunit.js');
    console.log('<testsuites>');
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
    tests = _(tests).chain().groupBy(function(item, index, list) {
      return index % Math.round(list.length / split);
    }).values().value();
  }

  // manage the forks
  async.mapLimit(tests, workers, function(_tests, done) {
    var fork = require('child_process').fork;
    var args = []; // path to triple-latte binary
    var count = 0;

    args.push('-w', 0);

    if (timeout)
      args.push('-t', timeout);

    if (reporter)
      args.push('-r', reporter);

    if (configFile)
      args.push('-c', configFile);

    if (grep)
      args.push('-g', grep);

    oneTestSpawn = fork(path.join(__dirname, 'cli.js'), args.concat(split > 0 ? _tests : [_tests]));

    oneTestSpawn.on('message', function(test) {
      if (test && test.status === 'fail') {
        totals.failed.push(test);
      } else if (test && test.status === 'pass') {
        totals.passed.push(test);
      } else if(test.status == 'end') {
        count++;
      }
    });

    // only write on exit, to prevent coupling of other tests
    oneTestSpawn.on('exit', function(code) {
      if (code !== 0 && count != _tests.length) {
        totals.errored.push({title:'nodejs error outside of test has occurred', file:_tests}); 
      }
      done(null, code);
    });

  }, function(err, results) {
    if (/xunit.js$/.test(reporter)) {
      _(totals.errored).each(function(error) {
        console.log('<testsuite name="Mocha Tests" tests="1" errors="1">');
        console.log('<testcase classname="' + error.file + '" message="nodejs error found" />');
        console.log('</testsuite>');
      });
      // close xunit test with plural tag
      console.log('</testsuites>');
    } else {

      console.log('  -----------------------------------\n');

      if (totals.errored.length + totals.failed.length === 0) {
        console.log(color.green(util.format('  all %s tests passed!\n', totals.passed.length)));
      } else if (totals.errored.length + totals.failed.length == 1) {
        console.log(color.red('  1 test failed') + ' - details in triple-latte.fail.log\n');
      } else {
        console.log(color.red(
          util.format('  %s tests failed', totals.errored.length + totals.failed.length)) + ' - details in triple-latte.fail.log\n');
      }

      if (totals.failed.length + totals.errored.length) {
        var log = fs.openSync('triple-latte.fail.log', 'w');

        totals.failed.forEach(function(test) {
          fs.writeSync(log, test.title + '\n');
          fs.writeSync(log, test.file + '\n');
          fs.writeSync(log, '\n');
        });

        totals.errored.forEach(function(test) {
          fs.writeSync(log, test.title + '\n');
          fs.writeSync(log, test.file + '\n');
          fs.writeSync(log, '\n');
        });

        fs.closeSync(log);
      } else {
        if (fs.existsSync('triple-latte.fail.log')) {
          fs.unlinkSync('triple-latte.fail.log');
        }
      }

    }

    // exit with highest exit code from all the test runs
    process.exit(results.sort().pop());
  });
};
