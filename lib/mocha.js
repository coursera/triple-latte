var Mocha = require('mocha');
var _ = require('underscore');
var files = require('./files');
var async = require('async');
var path = require('path');

function setupMocha(mochaOptions, mochaExports) {
  var mocha = new Mocha(mochaOptions);

  //// need to provide some variables to internal tests
  mocha.suite.on('pre-require', function(context, file, mocha) {
    _.each(_.isObject(mochaExports) ? mochaExports : {}, function(req, key) {
      context[key] = req;
    });
  });

  return mocha;
}

function runMocha(mocha, testFile, done) {
  try {
    var runner = mocha.run(function(failures) {
      if (process && process.send) {
        process.send({status:'end', file: testFile});
      }

      if (done) {
        done(null, failures);
      } else {
        process.exit(failures);
      }
    });

    runner.on('fail', function(test, err){
      if (process && process.send) {
        process.send({
          status: 'fail',
          file: test.file || test.parent && test.parent.file,
          title:test.title,
          message: err.message
        });
      }
    });

    runner.on('pass', function(test){
      if (process && process.send) {
        process.send({status:'pass', file:test.file, title:test.title});
      }
    });
  } catch (err) {
    var filename = mocha.files.length > 1 ? 'Multiple tests failed' : mocha.files[0];
    // When we have node.js errors, we need to report them differently.
    if (process && process.send) {
      console.log(err.stack);
      process.send({status: 'error', file: filename, message: err.message, stack: err.stack});
      process.send({status: 'end', file: testFile});
    }
    process.exit();
  }
}

exports.runner = function(config, configFile) {

  var reporter = config.reporter || 'spec';
  var outputDir = config.outputDir ? path.relative(process.cwd(), config.outputDir) : undefined;
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
    reporterOptions: {outputDir:outputDir},
    grep: grep,
    globals: mochaGlobals,
    timeout: timeout,
  };

  if (config.unify) {
    var mocha = setupMocha(mochaOptions, mochaExports);

    files.findTests(testFiles).map(function(testFile) {
      mocha.addFile(testFile);
    });

    runMocha(mocha, testFiles[0]);
  } else {
    var runners = [];

    files.findTests(testFiles).map(function(testFile) {
      runners.push(function(done) {
        var mocha = setupMocha(mochaOptions, mochaExports);

        mocha.addFile(testFile);

        runMocha(mocha, testFile, done);
      });
    });

    async.series(runners, function(err, results) {
      // exit with highest exit code from all the test runs
      process.exit(results.sort().pop());
    });
  }
};
