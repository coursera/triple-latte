var program = require('commander');
var mocha = require('./mocha');
var multiMocha = require('./multiMocha');
var path = require('path');
var _ = require('underscore');

program.version('0.2.0')
  .usage('[options] [test-directories-or-files]')
  .option('-r, --reporter [format]', 'mocha reporter to use, defaults to awesomeness', 'spec')
  .option('-g, --grep [filter]', 'filter tests by name', undefined)
  .option('-w, --workers [number]', 'number of workers, 0 means none', require('os').cpus().length)
  .option('-s, --split [number]', 'number of tests to run per worker', 10)
  .option('-u, --unify', 'unify multiple mocha tests into one runner. by default all tests are run independenty, even in the same process', false)
  .option('-t, --timeout [time_in_ms]', 'timeout that will kill each test', 2000)
  .option('-c, --config [file]', 'configuration file for specifying tests and globals')
  .option('-o, --outputDir [dir]', 'output tests results as files in the output directory, only works with xunit reporter')
  .option('-x, --nosummary', 'do not output the test file summary at the end of a test run')
  .parse(process.argv);

var config = program.config ? require(path.resolve(program.config)) : {};

var defaults = {
  reporter: program.reporter,
  grep: program.grep,
  workers: parseInt(program.workers, 10),
  split: parseInt(program.split, 5),
  timeout: parseInt(program.timeout),
  unify: program.unify,
  outputDir: program.outputDir,
  noSummary: program.nosummary || false,
};

var options = _.extend(defaults, config);
options.tests = program.args.length ? program.args : config.tests || ['./tests', './test'];

// if zero workers are specified, then we are likely spawning
// and want to run individual tests.
// or someone just wants to debug and run all tests in one process
if (program.workers === '0') {
  mocha.runner(options, program.config);
} else {
  multiMocha.runner(options, program.config);
}
