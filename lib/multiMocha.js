var Mocha = require('mocha');
var _ = require('underscore');
var files = require('./files');
var async = require('async');
var path = require('path');
var color = require('cli-color');
var util = require('util');
var fs = require('fs');

function outputResults(totals) {
  console.log('  -----------------------------------\n');
  var totalTestCount = totals.passed.length + totals.errored.length + totals.failed.length + totals.pending.length;
  var totalFailingTests = totals.errored.length + totals.failed.length;

  console.log(
    '  ' +
    [
      (color.white(util.format('%s total tests found: ', totalTestCount.toString()))),
      (color.green(util.format('%s passing', totals.passed.length.toString()))),
      (color.xterm(110)(util.format('%s pending', totals.pending.length.toString()))),
      (color.red(util.format('%s failing', (totalFailingTests).toString()) + (totalFailingTests > 0 ? ' - details in triple-latte.fail.log' : ''))),
      (color.yellow(util.format('%s slow', totals.slow.length.toString()) + (totals.slow.length > 0 ? ' - details in triple-latte.slow.log' : '')))
    ]
    .filter(function(string) { return !!string })
    .join('\n  ') + '\n'
  );
}

function writeResults(totals) {
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

  if (totals.slow.length + totals.errored.length) {
    var log = fs.openSync('triple-latte.slow.log', 'w');

    totals.slow.forEach(function(test) {
      fs.writeSync(log, test.title + ' (' + test.duration + 'ms) ' + '\n');
      fs.writeSync(log, test.file + '\n');
      fs.writeSync(log, '\n');
    });

    fs.closeSync(log);
  } else {
    if (fs.existsSync('triple-latte.slow.log')) {
      fs.unlinkSync('triple-latte.slow.log');
    }
  }
}

exports.runner = function(config, configFile) {

  var reporter = config.reporter;
  var timeout = config.timeout;
  var outputDir = config.outputDir ? path.relative(process.cwd(), config.outputDir) : undefined;
  var grep = config.grep || undefined;
  var mochaGlobals = config.globals || [];
  var mochaExports = config.exports || {};
  var workers = config.workers;
  var split = config.split;
  var noSummary = config.noSummary;
  var ui = config.ui || 'bdd';
  var testFiles = config.tests ? config.tests : [];
  var totals = {passed:[], failed:[], errored:[], pending: [], slow: []};

  if (reporter == 'xunit') {
    // wrap all xunit tests in a plural tag
    reporter = path.join(__dirname, 'xunit.js');

    if (!outputDir) {
      console.log('<testsuites>');
    } else {
      files.rmDirSync(outputDir);
    }
  }

  var mochaOptions = {
    ui: ui,
    reporter: reporter,
    reporterOptions: {outputDir:outputDir},
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
    var finished = _tests;

    args.push('-w', 0);

    if (outputDir)
      args.push('-o', outputDir);

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
        if (test.speed === 'slow') {
          totals.slow.push(test);
        }
      } else if (test && test.status === 'pending') {
        totals.pending.push(test);
      } else if (test && test.status === 'error') {
        // We want to treat this as a failure, but want to track how many errors we get
        test.state = 'failed';
        test.err = {
          message: test.message,
          stack: test.stack
        };
        test.title = test.file;
        test.duration = 0;
        totals.errored.push(test);
      } else if (test.status == 'end') {
        finished = _(finished).difference(test.file);
      }
    });

    // only write on exit, to prevent coupling of other tests
    oneTestSpawn.on('exit', function(code) {
      done(null, code);
    });

  }, function(err, results) {
    if (/xunit.js$/.test(reporter)) {
      var xunit = require('./xunit');

      totals.errored.forEach(function(test) {
        var tags = [
          '<testsuite name="Mocha Tests" tests="1" failures="1">',
          xunit.prototype.test(test),
          '</testsuite>'
        ];

        if (outputDir) {
          var xml = tags.join('');
          files.makeSync(path.join(outputDir, 'failed', test.file.replace(/\.js$/, '.xml')), xml);
          outputResults(totals);
        } else {
          // close xunit test with plural tag
          tags.forEach(function(tag) {
            console.log(tag);
          });
          console.log('</testsuites>');
        }
      });
    } else {
      if (!noSummary) {
        outputResults(totals);
      }
      writeResults(totals);
    }

    // exit with highest exit code from all the test runs
    process.exit(results.sort().pop());
  });
};
